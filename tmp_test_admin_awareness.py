import asyncio
import json
import sqlite3
import aiosqlite

from src.db.database import init_db
from src.tools.dispatch import handle_bus_connect

async def main():
    # Setup test memory db
    db = await aiosqlite.connect(":memory:")
    db.row_factory = aiosqlite.Row
    await init_db(db)

    # 1. Agent 1 Connects (Should be Creator/Admin)
    result1 = await handle_bus_connect(db, {
        "ide": "TestIDE",
        "model": "Model-A",
        "thread_name": "TestAdminThread"
    })
    payload1 = json.loads(result1[0].text)
    agent1_id = payload1["agent"]["agent_id"]
    
    print("Agent 1 (Creator) Payload:")
    print(f"Is Admin: {payload1['agent'].get('is_administrator')}")
    print(f"Role: {payload1['agent'].get('role_assignment')}")
    print(f"Admin Block: {payload1['thread'].get('administrator')}")
    print("-" * 50)
    
    assert payload1["agent"]["is_administrator"] is True
    assert "ADMINISTRATOR" in payload1["agent"]["role_assignment"]
    assert payload1["thread"]["administrator"]["agent_id"] == agent1_id

    # 2. Agent 2 Connects (Should be Participant)
    result2 = await handle_bus_connect(db, {
        "ide": "TestIDE",
        "model": "Model-B",
        "thread_name": "TestAdminThread"
    })
    payload2 = json.loads(result2[0].text)
    
    print("Agent 2 (Participant) Payload:")
    print(f"Is Admin: {payload2['agent'].get('is_administrator')}")
    print(f"Role: {payload2['agent'].get('role_assignment')}")
    print(f"Admin Block: {payload2['thread'].get('administrator')}")
    print("-" * 50)
    
    assert payload2["agent"]["is_administrator"] is False
    assert "PARTICIPANT" in payload2["agent"]["role_assignment"]
    assert agent1_id in payload2["agent"]["role_assignment"]
    assert payload2["thread"]["administrator"]["agent_id"] == agent1_id
    
    print("SUCCESS: Admin awareness tests passed!")
    
    await db.close()

if __name__ == "__main__":
    asyncio.run(main())
