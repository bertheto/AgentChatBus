import sqlite3
import os

db_path = os.path.join('data', 'bus.db')
print('Using DB:', db_path)

try:
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT id, topic FROM threads WHERE topic LIKE '%DOC0022%'")
    thread = c.fetchone()
    if thread:
        print('Thread:', thread)
        c.execute("SELECT agent_id FROM thread_participants WHERE thread_id = ?", (thread[0],))
        agents = c.fetchall()
        print('Agents in thread:', agents)
        for a in agents:
            c.execute("SELECT id, ide, name, is_online, last_heartbeat FROM agents WHERE id = ?", (a[0],))
            print('Agent details:', c.fetchone())
    else:
        print('Thread DOC0022 not found')
except Exception as e:
    print("Error:", e)
