"""Integration tests for human-confirmed admin decision API."""

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


def _create_thread(client: httpx.Client) -> str:
    topic = f"admin-decision-{uuid.uuid4()}"
    resp = client.post("/api/threads", json={"topic": topic})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _register_agent(client: httpx.Client) -> str:
    resp = client.post(
        "/api/agents/register",
        json={"ide": "VS Code", "model": "GPT-5.3-Codex"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["agent_id"]


def test_admin_decision_switch_then_keep():
    with _build_client() as client:
        _require_server_or_skip(client)
        thread_id = _create_thread(client)
        agent_a = _register_agent(client)
        agent_b = _register_agent(client)

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
        thread_id = _create_thread(client)
        agent_a = _register_agent(client)
        agent_b = _register_agent(client)

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
