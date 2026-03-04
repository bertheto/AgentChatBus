import json
import aiosqlite
import pytest
from mcp import types

from src.db import crud
from src.db.database import init_schema
from src.tools.dispatch import handle_bus_connect, handle_msg_post
import src.mcp_server

@pytest.fixture(autouse=True)
def isolated_mcp_context():
    """Ensure MCP connection context is clean for each test."""
    src.mcp_server._session_id.set("test-session")
    src.mcp_server._current_agent_id.set(None)
    src.mcp_server._current_agent_token.set(None)
    src.mcp_server._connection_agents.clear()
    yield

@pytest.mark.asyncio
async def test_bus_connect_new_agent_new_thread():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await init_schema(db)

    args = {
        "thread_name": "Test Auto Create",
        "ide": "TestIDE",
        "model": "TestModel"
    }

    result = await handle_bus_connect(db, args)
    assert len(result) == 1
    
    payload = json.loads(result[0].text)
    
    # Check agent
    assert payload["agent"]["registered"] is True
    assert "agent_id" in payload["agent"]
    assert "token" in payload["agent"]
    assert payload["agent"]["name"].startswith("TestIDE")

    # Check thread
    assert payload["thread"]["topic"] == "Test Auto Create"
    assert payload["thread"]["created"] is True
    assert payload["thread"]["status"] == "discuss"

    # Check messages and sync
    assert len(payload["messages"]) == 1  # System prompt is injected synthetically
    assert payload["current_seq"] == 0
    assert "reply_token" in payload

    await db.close()

@pytest.mark.asyncio
async def test_bus_connect_new_agent_existing_thread():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await init_schema(db)

    # Pre-create thread via generic crud
    t = await crud.thread_create(db, topic="Existing Topic")
    
    # Wait, need an agent to issue reply token and post msg
    agent0 = await crud.agent_register(db, "System", "0")
    sync = await crud.issue_reply_token(db, t.id, agent0.id)
    await crud.msg_post(
        db, t.id, author=agent0.id, content="First message",
        expected_last_seq=sync["current_seq"], reply_token=sync["reply_token"]
    )

    args = {
        "thread_name": "Existing Topic",
        "ide": "TestIDE",
        "model": "TestModel"
    }

    result = await handle_bus_connect(db, args)
    payload = json.loads(result[0].text)
    
    assert payload["agent"]["registered"] is True
    assert payload["thread"]["created"] is False
    assert payload["thread"]["topic"] == "Existing Topic"
    assert len(payload["messages"]) == 2  # System prompt + First message
    assert payload["messages"][1]["content"] == "First message"
    assert payload["current_seq"] == 1

    await db.close()


@pytest.mark.asyncio
async def test_bus_connect_resume_existing_agent():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await init_schema(db)

    # Pre-register an agent
    existing_agent = await crud.agent_register(db, ide="ExistingIDE", model="ExModel")

    args = {
        "thread_name": "Brand New Thread",
        "agent_id": existing_agent.id,
        "token": existing_agent.token
        # ide and model are provided but should be ignored since we resume
    }

    result = await handle_bus_connect(db, args)
    payload = json.loads(result[0].text)
    
    # Agent should be resumed, not newly registered
    assert payload["agent"]["registered"] is False
    assert payload["agent"]["agent_id"] == existing_agent.id
    assert "token" not in payload["agent"] # not returned on resume

    # Thread should be created
    assert payload["thread"]["created"] is True
    assert payload["thread"]["topic"] == "Brand New Thread"

    await db.close()


@pytest.mark.asyncio
async def test_bus_connect_reuse_connection_agent():
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await init_schema(db)

    # First call: registers an agent and sets context
    args1 = {"thread_name": "Thread1", "ide": "IDE1", "model": "Mod1"}
    r1 = await handle_bus_connect(db, args1)
    p1 = json.loads(r1[0].text)
    assert p1["agent"]["registered"] is True
    agent_id1 = p1["agent"]["agent_id"]

    # Second call (same connection/session): joins another thread
    args2 = {"thread_name": "Thread2"}
    r2 = await handle_bus_connect(db, args2)
    p2 = json.loads(r2[0].text)
    
    # Should reuse the same agent
    assert p2["agent"]["registered"] is False
    assert p2["agent"]["agent_id"] == agent_id1
    assert p2["thread"]["topic"] == "Thread2"
    assert p2["thread"]["created"] is True

    await db.close()
