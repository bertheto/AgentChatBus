"""Integration tests for MCP transport endpoint layout compatibility."""

from __future__ import annotations

import httpx
import pytest

from tests._constants import TEST_BASE_URL as BASE_URL


def _build_client() -> httpx.Client:
    return httpx.Client(base_url=BASE_URL, timeout=10)


def _require_server_or_skip(client: httpx.Client) -> None:
    try:
        resp = client.get("/health")
        if resp.status_code < 500:
            return
    except Exception:
        pass
    pytest.skip(f"AgentChatBus server is not reachable at {BASE_URL}")


def _initialize_modern_session(
    client: httpx.Client,
    url: str,
) -> tuple[str, str, httpx.Response]:
    response = client.post(
        url,
        headers={"Accept": "application/json, text/event-stream"},
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "pytest", "version": "1.0.0"},
            },
        },
    )
    assert response.status_code == 200, response.text
    assert "text/event-stream" in response.headers.get("content-type", "")
    session_id = response.headers.get("mcp-session-id")
    assert session_id
    return session_id, response.text, response


def test_modern_mcp_endpoint_supports_streamable_http():
    with _build_client() as client:
        _require_server_or_skip(client)

        session_id, body, _ = _initialize_modern_session(client, "/mcp")
        assert '"protocolVersion":"2025-03-26"' in body

        with client.stream(
            "GET",
            "/mcp",
            headers={
                "Accept": "text/event-stream",
                "mcp-session-id": session_id,
            },
        ) as stream:
            assert stream.status_code == 200
            assert "text/event-stream" in stream.headers.get("content-type", "")


def test_legacy_sse_endpoint_supports_old_transport_shape():
    with _build_client() as client:
        _require_server_or_skip(client)

        with client.stream("GET", "/sse", headers={"Accept": "text/event-stream"}) as stream:
            assert stream.status_code == 200
            assert "text/event-stream" in stream.headers.get("content-type", "")

            chunks = []
            for text in stream.iter_text():
                chunks.append(text)
                if "event: endpoint" in text:
                    break

            body = "".join(chunks)
            assert "event: endpoint" in body
            assert (
                "/messages/?sessionId=" in body
                or "/messages?sessionId=" in body
                or "/messages/?session_id=" in body
                or "/messages?session_id=" in body
            )


def test_mcp_sse_alias_keeps_backwards_compatible_modern_post():
    with _build_client() as client:
        _require_server_or_skip(client)

        _session_id, body, _ = _initialize_modern_session(client, "/mcp/sse")
        assert '"protocolVersion":"2025-03-26"' in body
