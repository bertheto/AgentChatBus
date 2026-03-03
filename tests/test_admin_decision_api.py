"""Integration tests for human-confirmed admin decision API."""

from concurrent.futures import ThreadPoolExecutor
import uuid

import httpx
import pytest

from tests._constants import TEST_BASE_URL as BASE_URL


def _build_client() -> httpx.Client:
    return httpx.Client(base_url=BASE_URL, timeout=10)


def _require_server_or_skip(client: httpx.Client) -> None:
    try:
        resp = client.get("/health")
        if resp.status_code == 200:
            return
    except Exception:
        pass
    pytest.skip(f"AgentChatBus server is not reachable at {BASE_URL}")


def _create_thread(client: httpx.Client, creator_id: str, creator_token: str) -> str:
    topic = f"admin-decision-{uuid.uuid4()}"
    resp = client.post(
        "/api/threads",
        json={"topic": topic, "creator_agent_id": creator_id},
        headers={"X-Agent-Token": creator_token},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _register_agent(client: httpx.Client) -> tuple[str, str]:
    resp = client.post(
        "/api/agents/register",
        json={"ide": "VS Code", "model": "GPT-5.3-Codex"},
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    return payload["agent_id"], payload["token"]


def test_admin_decision_switch_then_keep():
    with _build_client() as client:
        _require_server_or_skip(client)
        creator_id, creator_token = _register_agent(client)
        thread_id = _create_thread(client, creator_id, creator_token)
        agent_a, _ = _register_agent(client)
        agent_b, _ = _register_agent(client)

        switch_resp = client.post(
            f"/api/threads/{thread_id}/admin/decision",
            json={"action": "switch", "candidate_admin_id": agent_a},
        )
        assert switch_resp.status_code == 200, switch_resp.text
        assert switch_resp.json()["new_admin_id"] == agent_a

        admin_resp = client.get(f"/api/threads/{thread_id}/admin")
        assert admin_resp.status_code == 200, admin_resp.text
        assert admin_resp.json()["admin_id"] == agent_a

        keep_resp = client.post(
            f"/api/threads/{thread_id}/admin/decision",
            json={"action": "keep", "candidate_admin_id": agent_b},
        )
        assert keep_resp.status_code == 200, keep_resp.text

        admin_resp_after = client.get(f"/api/threads/{thread_id}/admin")
        assert admin_resp_after.status_code == 200, admin_resp_after.text
        assert admin_resp_after.json()["admin_id"] == agent_a

        msgs_resp = client.get(
            f"/api/threads/{thread_id}/messages",
            params={"after_seq": 0, "limit": 200, "include_system_prompt": 0},
        )
        assert msgs_resp.status_code == 200, msgs_resp.text
        msgs = msgs_resp.json()
        system_msgs = [m for m in msgs if m.get("author") == "system" and m.get("role") == "system"]
        assert any("Administrator switched by human decision" in m.get("content", "") for m in system_msgs)
        assert any("Administrator kept by human decision" in m.get("content", "") for m in system_msgs)


def test_admin_decision_switch_replaces_previous_admin():
    with _build_client() as client:
        _require_server_or_skip(client)
        creator_id, creator_token = _register_agent(client)
        thread_id = _create_thread(client, creator_id, creator_token)
        agent_a, _ = _register_agent(client)
        agent_b, _ = _register_agent(client)

        r1 = client.post(
            f"/api/threads/{thread_id}/admin/decision",
            json={"action": "switch", "candidate_admin_id": agent_a},
        )
        assert r1.status_code == 200, r1.text

        r2 = client.post(
            f"/api/threads/{thread_id}/admin/decision",
            json={"action": "switch", "candidate_admin_id": agent_b},
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["new_admin_id"] == agent_b

        admin_resp = client.get(f"/api/threads/{thread_id}/admin")
        assert admin_resp.status_code == 200, admin_resp.text
        assert admin_resp.json()["admin_id"] == agent_b


def test_thread_creator_agent_is_admin():
    with _build_client() as client:
        _require_server_or_skip(client)
        creator_id, creator_token = _register_agent(client)

        create_resp = client.post(
            "/api/threads",
            json={
                "topic": f"creator-admin-{uuid.uuid4()}",
                "creator_agent_id": creator_id,
            },
            headers={"X-Agent-Token": creator_token},
        )
        assert create_resp.status_code == 201, create_resp.text
        thread_id = create_resp.json()["id"]

        admin_resp = client.get(f"/api/threads/{thread_id}/admin")
        assert admin_resp.status_code == 200, admin_resp.text
        payload = admin_resp.json()
        assert payload["admin_id"] == creator_id
        assert payload["admin_type"] == "creator"


def test_thread_creator_requires_carried_credentials():
    with _build_client() as client:
        _require_server_or_skip(client)
        creator_id, creator_token = _register_agent(client)

        create_resp = client.post(
            "/api/threads",
            json={
                "topic": f"creator-auto-infer-{uuid.uuid4()}",
                "creator_agent_id": creator_id,
            },
            headers={"X-Agent-Token": creator_token},
        )
        assert create_resp.status_code == 201, create_resp.text
        thread_id = create_resp.json()["id"]

        admin_resp = client.get(f"/api/threads/{thread_id}/admin")
        assert admin_resp.status_code == 200, admin_resp.text
        payload = admin_resp.json()
        assert payload["admin_id"] == creator_id
        assert payload["admin_type"] == "creator"


def test_admin_decision_source_message_is_single_use():
    with _build_client() as client:
        _require_server_or_skip(client)
        creator_id, creator_token = _register_agent(client)
        thread_id = _create_thread(client, creator_id, creator_token)
        candidate_id, _ = _register_agent(client)

        prompt_resp = client.post(
            f"/api/threads/{thread_id}/messages",
            json={
                "author": creator_id,
                "role": "assistant",
                "content": "Possible administrator offline detected.",
                "metadata": {
                    "ui_type": "admin_switch_confirmation_required",
                    "thread_id": thread_id,
                    "candidate_admin_id": candidate_id,
                },
            },
            headers={"X-Agent-Token": creator_token},
        )
        assert prompt_resp.status_code == 201, prompt_resp.text
        source_message_id = prompt_resp.json()["id"]

        first_resp = client.post(
            f"/api/threads/{thread_id}/admin/decision",
            json={
                "action": "switch",
                "candidate_admin_id": candidate_id,
                "source_message_id": source_message_id,
            },
        )
        assert first_resp.status_code == 200, first_resp.text
        first_payload = first_resp.json()
        assert first_payload["already_decided"] is False
        assert first_payload["new_admin_id"] == candidate_id

        second_resp = client.post(
            f"/api/threads/{thread_id}/admin/decision",
            json={
                "action": "keep",
                "candidate_admin_id": creator_id,
                "source_message_id": source_message_id,
            },
        )
        assert second_resp.status_code == 200, second_resp.text
        second_payload = second_resp.json()
        assert second_payload["already_decided"] is True
        assert second_payload["action"] == "switch"

        admin_resp = client.get(f"/api/threads/{thread_id}/admin")
        assert admin_resp.status_code == 200, admin_resp.text
        assert admin_resp.json()["admin_id"] == candidate_id

        msgs_resp = client.get(
            f"/api/threads/{thread_id}/messages",
            params={"after_seq": 0, "limit": 200, "include_system_prompt": 0},
        )
        assert msgs_resp.status_code == 200, msgs_resp.text
        msgs = msgs_resp.json()
        prompt_msg = next((m for m in msgs if m.get("id") == source_message_id), None)
        assert prompt_msg is not None
        prompt_meta = prompt_msg.get("metadata") or "{}"
        assert '"decision_status": "resolved"' in prompt_meta
        assert '"decision_action": "switch"' in prompt_meta


def test_admin_decision_concurrent_submit_emits_single_switch_event():
    with _build_client() as client:
        _require_server_or_skip(client)
        creator_id, creator_token = _register_agent(client)
        thread_id = _create_thread(client, creator_id, creator_token)
        candidate_id, _ = _register_agent(client)

        prompt_resp = client.post(
            f"/api/threads/{thread_id}/messages",
            json={
                "author": creator_id,
                "role": "assistant",
                "content": "Possible administrator offline detected.",
                "metadata": {
                    "ui_type": "admin_switch_confirmation_required",
                    "thread_id": thread_id,
                    "candidate_admin_id": candidate_id,
                },
            },
            headers={"X-Agent-Token": creator_token},
        )
        assert prompt_resp.status_code == 201, prompt_resp.text
        source_message_id = prompt_resp.json()["id"]

        def _submit_once():
            with _build_client() as local_client:
                return local_client.post(
                    f"/api/threads/{thread_id}/admin/decision",
                    json={
                        "action": "switch",
                        "candidate_admin_id": candidate_id,
                        "source_message_id": source_message_id,
                    },
                )

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(_submit_once) for _ in range(2)]
            responses = [f.result() for f in futures]

        assert all(r.status_code == 200 for r in responses)
        payloads = [r.json() for r in responses]
        assert sum(1 for p in payloads if p.get("already_decided") is False) == 1
        assert sum(1 for p in payloads if p.get("already_decided") is True) == 1

        msgs_resp = client.get(
            f"/api/threads/{thread_id}/messages",
            params={"after_seq": 0, "limit": 200, "include_system_prompt": 0},
        )
        assert msgs_resp.status_code == 200, msgs_resp.text
        msgs = msgs_resp.json()
        switched_msgs = [
            m for m in msgs
            if "Administrator switched by human decision" in (m.get("content") or "")
        ]
        assert len(switched_msgs) == 1
