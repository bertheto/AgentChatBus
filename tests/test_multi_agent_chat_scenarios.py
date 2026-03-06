"""Scenario-level regression tests for realistic multi-agent chat flows.

These tests intentionally exercise business behavior instead of isolated helper
contracts. The goal is to protect the real chat experience that agents rely on:

1. Multiple agents join the same thread through bus_connect.
2. Agents alternate between msg_post and msg_wait over several rounds.
3. One agent falls behind while other agents keep chatting.
4. That agent's stale msg_post is rejected with SeqMismatchError.
5. The rejected agent then calls msg_wait and must receive a fast recovery path:
   the wait returns immediately with missed messages plus a fresh reply_token.
6. Using that fresh sync context, the agent must be able to rejoin the chat and
   post successfully.

Do not simplify this file into a few narrow token assertions. If this scenario
fails in production, users experience the system as "chat got stuck" even if
individual low-level token tests still pass.
"""

import json
import time

import aiosqlite
import pytest

from src.db.database import init_schema
from src.tools.dispatch import handle_bus_connect, handle_msg_list, handle_msg_post, handle_msg_wait
import src.mcp_server


@pytest.fixture(autouse=True)
def isolated_mcp_context():
    """Keep the in-process MCP connection context deterministic per test."""
    src.mcp_server._session_id.set("test-session")
    src.mcp_server._current_agent_id.set(None)
    src.mcp_server._current_agent_token.set(None)
    src.mcp_server._connection_agents.clear()
    yield


def _activate_agent(agent_id: str, token: str) -> None:
    """Simulate that subsequent dispatch calls come from this agent's session."""
    src.mcp_server._current_agent_id.set(agent_id)
    src.mcp_server._current_agent_token.set(token)
    src.mcp_server.set_connection_agent(agent_id, token)


async def _wait_as(
    db: aiosqlite.Connection,
    *,
    thread_id: str,
    agent_id: str,
    token: str,
    after_seq: int,
    timeout_ms: int = 50,
) -> dict:
    _activate_agent(agent_id, token)
    result = await handle_msg_wait(
        db,
        {
            "thread_id": thread_id,
            "after_seq": after_seq,
            "timeout_ms": timeout_ms,
            "return_format": "json",
            "agent_id": agent_id,
            "token": token,
        },
    )
    return json.loads(result[0].text)


async def _post_as(
    db: aiosqlite.Connection,
    *,
    thread_id: str,
    agent_id: str,
    token: str,
    expected_last_seq: int,
    reply_token: str,
    content: str,
) -> dict:
    _activate_agent(agent_id, token)
    result = await handle_msg_post(
        db,
        {
            "thread_id": thread_id,
            "author": agent_id,
            "content": content,
            "expected_last_seq": expected_last_seq,
            "reply_token": reply_token,
            "role": "assistant",
        },
    )
    return json.loads(result[0].text)


@pytest.mark.asyncio
async def test_three_agent_chat_recovers_from_rejected_stale_post_via_fast_wait_refresh():
    """Protect the real three-agent chat flow, including stale-post recovery.

    Scenario requirements:
    - Agent A starts the thread and posts.
    - Agent B joins and replies.
    - Agent C joins after the conversation has already started.
    - B obtains a valid msg_wait token, then goes silent while A and C continue
      chatting for enough rounds to push B outside seq tolerance.
    - B's old post must be rejected with SeqMismatchError and must include the
      missed messages for first-read guidance.
    - B's very next msg_wait must fast-return with the same missed messages and
      a fresh reply_token so B can recover without getting stuck waiting.
    - B then posts successfully with the refreshed sync context.
    - The final transcript must show the full conversation in order.
    """
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await init_schema(db)

    try:
        thread_name = "Scenario Three Agent Recovery"

        connect_a = json.loads((await handle_bus_connect(
            db,
            {
                "thread_name": thread_name,
                "ide": "VS Code",
                "model": "GPT-5.3-Codex",
            },
        ))[0].text)
        thread_id = connect_a["thread"]["thread_id"]
        agent_a_id = connect_a["agent"]["agent_id"]
        agent_a_token = connect_a["agent"]["token"]

        post_a1 = await _post_as(
            db,
            thread_id=thread_id,
            agent_id=agent_a_id,
            token=agent_a_token,
            expected_last_seq=connect_a["current_seq"],
            reply_token=connect_a["reply_token"],
            content="A1: starting the discussion",
        )
        assert post_a1["seq"] == 1

        connect_b = json.loads((await handle_bus_connect(
            db,
            {
                "thread_name": thread_name,
                "ide": "VS Code",
                "model": "GPT-5.3-Codex",
            },
        ))[0].text)
        agent_b_id = connect_b["agent"]["agent_id"]
        agent_b_token = connect_b["agent"]["token"]
        assert connect_b["current_seq"] == 1
        assert any(m.get("content") == "A1: starting the discussion" for m in connect_b["messages"])

        post_b1 = await _post_as(
            db,
            thread_id=thread_id,
            agent_id=agent_b_id,
            token=agent_b_token,
            expected_last_seq=connect_b["current_seq"],
            reply_token=connect_b["reply_token"],
            content="B1: I joined and reviewed A's idea",
        )
        assert post_b1["seq"] == 2

        connect_c = json.loads((await handle_bus_connect(
            db,
            {
                "thread_name": thread_name,
                "ide": "VS Code",
                "model": "GPT-5.3-Codex",
            },
        ))[0].text)
        agent_c_id = connect_c["agent"]["agent_id"]
        agent_c_token = connect_c["agent"]["token"]
        assert connect_c["current_seq"] == 2
        assert any(m.get("content") == "A1: starting the discussion" for m in connect_c["messages"])
        assert any(m.get("content") == "B1: I joined and reviewed A's idea" for m in connect_c["messages"])

        # B gets a valid wait token at seq=2, then falls behind while A and C keep chatting.
        b_stale_sync = await _wait_as(
            db,
            thread_id=thread_id,
            agent_id=agent_b_id,
            token=agent_b_token,
            after_seq=2,
            timeout_ms=1,
        )
        assert b_stale_sync["messages"] == []
        assert b_stale_sync["current_seq"] == 2

        wait_a1 = await _wait_as(
            db,
            thread_id=thread_id,
            agent_id=agent_a_id,
            token=agent_a_token,
            after_seq=1,
        )
        assert [m["content"] for m in wait_a1["messages"]] == ["B1: I joined and reviewed A's idea"]
        post_a2 = await _post_as(
            db,
            thread_id=thread_id,
            agent_id=agent_a_id,
            token=agent_a_token,
            expected_last_seq=wait_a1["current_seq"],
            reply_token=wait_a1["reply_token"],
            content="A2: I propose we split the work",
        )
        assert post_a2["seq"] == 3

        wait_c1 = await _wait_as(
            db,
            thread_id=thread_id,
            agent_id=agent_c_id,
            token=agent_c_token,
            after_seq=2,
        )
        assert [m["content"] for m in wait_c1["messages"]] == ["A2: I propose we split the work"]
        post_c1 = await _post_as(
            db,
            thread_id=thread_id,
            agent_id=agent_c_id,
            token=agent_c_token,
            expected_last_seq=wait_c1["current_seq"],
            reply_token=wait_c1["reply_token"],
            content="C1: I can take the validation path",
        )
        assert post_c1["seq"] == 4

        wait_a2 = await _wait_as(
            db,
            thread_id=thread_id,
            agent_id=agent_a_id,
            token=agent_a_token,
            after_seq=3,
        )
        assert [m["content"] for m in wait_a2["messages"]] == ["C1: I can take the validation path"]
        post_a3 = await _post_as(
            db,
            thread_id=thread_id,
            agent_id=agent_a_id,
            token=agent_a_token,
            expected_last_seq=wait_a2["current_seq"],
            reply_token=wait_a2["reply_token"],
            content="A3: I will update dispatch behavior",
        )
        assert post_a3["seq"] == 5

        wait_c2 = await _wait_as(
            db,
            thread_id=thread_id,
            agent_id=agent_c_id,
            token=agent_c_token,
            after_seq=4,
        )
        assert [m["content"] for m in wait_c2["messages"]] == ["A3: I will update dispatch behavior"]
        post_c2 = await _post_as(
            db,
            thread_id=thread_id,
            agent_id=agent_c_id,
            token=agent_c_token,
            expected_last_seq=wait_c2["current_seq"],
            reply_token=wait_c2["reply_token"],
            content="C2: I will cover regression tests",
        )
        assert post_c2["seq"] == 6

        wait_a3 = await _wait_as(
            db,
            thread_id=thread_id,
            agent_id=agent_a_id,
            token=agent_a_token,
            after_seq=5,
        )
        assert [m["content"] for m in wait_a3["messages"]] == ["C2: I will cover regression tests"]
        post_a4 = await _post_as(
            db,
            thread_id=thread_id,
            agent_id=agent_a_id,
            token=agent_a_token,
            expected_last_seq=wait_a3["current_seq"],
            reply_token=wait_a3["reply_token"],
            content="A4: please verify the fast-return edge case",
        )
        assert post_a4["seq"] == 7

        wait_c3 = await _wait_as(
            db,
            thread_id=thread_id,
            agent_id=agent_c_id,
            token=agent_c_token,
            after_seq=6,
        )
        assert [m["content"] for m in wait_c3["messages"]] == ["A4: please verify the fast-return edge case"]
        post_c3 = await _post_as(
            db,
            thread_id=thread_id,
            agent_id=agent_c_id,
            token=agent_c_token,
            expected_last_seq=wait_c3["current_seq"],
            reply_token=wait_c3["reply_token"],
            content="C3: verified, the chat is still moving",
        )
        assert post_c3["seq"] == 8

        # B is still trying to speak with the stale sync context captured earlier at seq=2.
        stale_post = await _post_as(
            db,
            thread_id=thread_id,
            agent_id=agent_b_id,
            token=agent_b_token,
            expected_last_seq=b_stale_sync["current_seq"],
            reply_token=b_stale_sync["reply_token"],
            content="B-stale: I am posting with outdated context",
        )
        assert stale_post["error"] == "SeqMismatchError"
        assert stale_post["action"] == "READ_MESSAGES_THEN_CALL_MSG_WAIT"
        assert [m["content"] for m in stale_post["new_messages_1st_read"]] == [
            "A2: I propose we split the work",
            "C1: I can take the validation path",
            "A3: I will update dispatch behavior",
            "C2: I will cover regression tests",
            "A4: please verify the fast-return edge case",
            "C3: verified, the chat is still moving",
        ]

        refresh_start = time.perf_counter()
        wait_b_refresh = await _wait_as(
            db,
            thread_id=thread_id,
            agent_id=agent_b_id,
            token=agent_b_token,
            after_seq=2,
            timeout_ms=120,
        )
        refresh_elapsed = time.perf_counter() - refresh_start
        assert refresh_elapsed < 0.08
        assert wait_b_refresh["current_seq"] == 8
        assert [m["content"] for m in wait_b_refresh["messages"]] == [
            "A2: I propose we split the work",
            "C1: I can take the validation path",
            "A3: I will update dispatch behavior",
            "C2: I will cover regression tests",
            "A4: please verify the fast-return edge case",
            "C3: verified, the chat is still moving",
        ]

        post_b2 = await _post_as(
            db,
            thread_id=thread_id,
            agent_id=agent_b_id,
            token=agent_b_token,
            expected_last_seq=wait_b_refresh["current_seq"],
            reply_token=wait_b_refresh["reply_token"],
            content="B2: I caught up and can continue normally now",
        )
        assert post_b2["seq"] == 9

        transcript = json.loads((await handle_msg_list(
            db,
            {
                "thread_id": thread_id,
                "after_seq": 0,
                "limit": 30,
                "include_system_prompt": False,
                "return_format": "json",
            },
        ))[0].text)
        assistant_messages = [m for m in transcript if m["role"] == "assistant"]
        assert [m["content"] for m in assistant_messages] == [
            "A1: starting the discussion",
            "B1: I joined and reviewed A's idea",
            "A2: I propose we split the work",
            "C1: I can take the validation path",
            "A3: I will update dispatch behavior",
            "C2: I will cover regression tests",
            "A4: please verify the fast-return edge case",
            "C3: verified, the chat is still moving",
            "B2: I caught up and can continue normally now",
        ]
    finally:
        await db.close()