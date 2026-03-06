import json

import aiosqlite
import pytest

from src.db import crud
from src.db.database import init_schema
from src.tools.dispatch import handle_msg_wait, handle_msg_list


async def _setup_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await init_schema(db)
    return db


@pytest.mark.asyncio
async def test_msg_wait_no_admin_prompt_when_no_agent_online():
    """Do not emit coordination prompts when there are no online agents."""
    db = await _setup_db()
    try:
        thread = await crud.thread_create(db, "msg-wait-no-online")

        out = await handle_msg_wait(
            db,
            {
                "thread_id": thread.id,
                "after_seq": 0,
                "timeout_ms": 1,
                "return_format": "json",
            },
        )

        payload = json.loads(out[0].text)
        assert "coordination_prompt" not in payload
    finally:
        await db.close()


@pytest.mark.asyncio
async def test_msg_wait_rejects_invalid_explicit_credentials():
    db = await _setup_db()
    try:
        thread = await crud.thread_create(db, "msg-wait-invalid-creds")
        agent = await crud.agent_register(db, ide="VS Code", model="GPT-5.3-Codex")

        out = await handle_msg_wait(
            db,
            {
                "thread_id": thread.id,
                "after_seq": 0,
                "timeout_ms": 1,
                "return_format": "json",
                "agent_id": agent.id,
                "token": "wrong-token",
            },
        )

        payload = json.loads(out[0].text)
        assert payload["error"] == "InvalidCredentials"

        states = await crud.thread_wait_states_grouped(db)
        assert thread.id not in states or agent.id not in states.get(thread.id, {})
    finally:
        await db.close()


@pytest.mark.asyncio
async def test_msg_wait_single_online_agent_has_no_dispatch_coordination_prompt():
    """Coordinator prompts are now produced by the backend coordinator loop, not dispatch.msg_wait."""
    db = await _setup_db()
    try:
        thread = await crud.thread_create(db, "msg-wait-one-online")
        agent = await crud.agent_register(db, ide="VS Code", model="GPT-5.3-Codex")

        out = await handle_msg_wait(
            db,
            {
                "thread_id": thread.id,
                "after_seq": 0,
                "timeout_ms": 1,
                "return_format": "json",
                "agent_id": agent.id,
                "token": agent.token,
            },
        )

        payload = json.loads(out[0].text)
        assert "coordination_prompt" not in payload
    finally:
        await db.close()


@pytest.mark.asyncio
async def test_msg_wait_and_msg_list_filter_human_only_system_messages():
    """human_only system notices must remain invisible to agent tool calls."""
    db = await _setup_db()
    try:
        thread = await crud.thread_create(db, "msg-wait-human-only")
        agent = await crud.agent_register(db, ide="VS Code", model="GPT-5.3-Codex")

        await crud._msg_create_system(
            db,
            thread.id,
            "Auto Administrator Timeout triggered after 100 seconds.",
            metadata={
                "ui_type": "admin_switch_confirmation_required",
                "visibility": "human_only",
            },
            clear_auto_admin=False,
        )

        out = await handle_msg_wait(
            db,
            {
                "thread_id": thread.id,
                "after_seq": 0,
                "timeout_ms": 1,
                "return_format": "json",
                "agent_id": agent.id,
                "token": agent.token,
            },
        )

        payload = json.loads(out[0].text)
        assert payload.get("messages") == []

        list_out = await handle_msg_list(
            db,
            {
                "thread_id": thread.id,
                "after_seq": 0,
                "limit": 200,
                "include_system_prompt": False,
                "return_format": "json",
            },
        )
        listed = json.loads(list_out[0].text)
        assert not any("Auto Administrator Timeout triggered" in (m.get("content") or "") for m in listed)
    finally:
        await db.close()


@pytest.mark.asyncio
async def test_msg_wait_for_agent_unmatched_message_keeps_wait_state():
    """When for_agent does not match available messages, waiter should remain in wait state."""
    db = await _setup_db()
    try:
        thread = await crud.thread_create(db, "msg-wait-for-agent-unmatched")
        agent = await crud.agent_register(db, ide="VS Code", model="GPT-5.3-Codex")

        sync = await crud.issue_reply_token(db, thread_id=thread.id, agent_id=agent.id)
        await crud.msg_post(
            db,
            thread_id=thread.id,
            author=agent.id,
            content="message for another agent",
            expected_last_seq=sync["current_seq"],
            reply_token=sync["reply_token"],
            role="assistant",
            metadata={"handoff_target": "someone-else"},
        )

        # A post consumes the agent's reply token. The next msg_wait will be treated
        # as wants_sync_only=True and exit immediately, giving the agent a new token.
        # We perform that sync call here so the subsequent wait functions as a real poll.
        await handle_msg_wait(
            db,
            {
                "thread_id": thread.id,
                "after_seq": 0,
                "timeout_ms": 1,
                "return_format": "json",
                "agent_id": agent.id,
                "token": agent.token,
            },
        )

        out = await handle_msg_wait(
            db,
            {
                "thread_id": thread.id,
                "after_seq": 0,
                "timeout_ms": 20,
                "return_format": "json",
                "agent_id": agent.id,
                "token": agent.token,
                "for_agent": agent.id,
            },
        )

        payload = json.loads(out[0].text)
        assert payload.get("messages") == []

        states = await crud.thread_wait_states_grouped(db)
        assert thread.id in states
        assert agent.id in states[thread.id]
    finally:
        await db.close()
