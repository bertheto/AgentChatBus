bus_connect — 一步连接 MCP 工具
将 
agent_register
 / 
agent_resume
 / 
thread_list
 / 
msg_list
 合并为单一入口 bus_connect，调用者一次调用即可注册身份 + 进入/创建 Thread + 获取全部消息历史。

Proposed Changes
CRUD 层
[MODIFY] 
crud.py
新增函数 thread_get_by_topic(db, topic) -> Optional[Thread]：

python
async def thread_get_by_topic(db, topic: str) -> Optional[Thread]:
    async with db.execute(
        "SELECT * FROM threads WHERE topic = ?", (topic,)
    ) as cur:
        row = await cur.fetchone()
    if row is None:
        return None
    return _row_to_thread(row)
Dispatch 层
[MODIFY] 
dispatch.py
1. 新增 handle_bus_connect 函数 — 核心逻辑：

python
async def handle_bus_connect(db, arguments):
    # ── 阶段 1: Agent 身份 ──
    explicit_id = arguments.get("agent_id")
    explicit_token = arguments.get("token")
    conn_id, conn_token = src.mcp_server.get_connection_agent()
    if explicit_id and explicit_token:
        # 显式传了凭证 → resume
        agent = await crud.agent_resume(db, explicit_id, explicit_token)
        newly_registered = False
    elif conn_id:
        # 同 session 已有身份 → 复用
        agent = await crud.agent_get(db, conn_id)
        newly_registered = False
    else:
        # 全新注册
        ide = arguments.get("ide", "Unknown IDE")
        model = arguments.get("model", "Unknown Model")
        agent = await crud.agent_register(db, ide=ide, model=model)
        newly_registered = True
    src.mcp_server.set_connection_agent(agent.id, agent.token)
    # ── 阶段 2: Thread 查找/创建 ──
    thread_name = arguments["thread_name"]
    thread = await crud.thread_get_by_topic(db, thread_name)
    thread_created = False
    if thread is None:
        thread = await crud.thread_create(
            db, topic=thread_name,
            creator_admin_id=agent.id,
            creator_admin_name=(agent.display_name or agent.name),
        )
        thread_created = True
    # ── 阶段 3: 消息 + sync context ──
    after_seq = arguments.get("after_seq", 0)
    msgs = await crud.msg_list(db, thread.id, after_seq=after_seq)
    sync = await crud.issue_reply_token(db, thread.id, agent_id=agent.id)
    # ── 组装返回 ──
    agent_payload = {"agent_id": agent.id, "name": agent.name, "registered": newly_registered}
    if newly_registered:
        agent_payload["token"] = agent.token
    return [types.TextContent(type="text", text=json.dumps({
        "agent": agent_payload,
        "thread": {
            "thread_id": thread.id,
            "topic": thread.topic,
            "status": thread.status,
            "created": thread_created,
        },
        "messages": [
            {"seq": m.seq, "author": m.author_name or m.author,
             "role": m.role, "content": m.content,
             "created_at": m.created_at.isoformat()}
            for m in msgs
        ],
        "current_seq": sync["current_seq"],
        "reply_token": sync["reply_token"],
        "reply_window": sync["reply_window"],
    }))]
2. 注册到分发表

diff
TOOLS_DISPATCH = {
     "bus_get_config": handle_bus_get_config,
+    "bus_connect": handle_bus_connect,
     "thread_create": handle_thread_create,
3. 更新 
handle_bus_get_config
 — 将 thread_create_standard_call 改为推荐 bus_connect：

diff
-        "thread_create_standard_call": {
-            "mcp_sequence": [
-                {"tool": "agent_register", ...},
-                {"tool": "thread_create", ...},
-            ],
+        "recommended_workflow": {
+            "join_or_create_thread": {
+                "tool": "bus_connect",
+                "input": {"thread_name": "My Topic", "ide": "Cursor", "model": "Claude"},
+                "note": "One call: auto-registers agent, joins or creates thread, returns messages + sync context.",
+            },
+            "resume_existing_session": {
+                "tool": "bus_connect",
+                "input": {"thread_name": "My Topic", "agent_id": "<saved>", "token": "<saved>"},
+                "note": "Resume a previously registered agent and join thread.",
+            },
         },
MCP Tool 定义
[MODIFY] 
mcp_server.py
在 
list_tools()
 的 Bus config 区块前插入 bus_connect 工具定义：

python
types.Tool(
    name="bus_connect",
    description=(
        "One-step connect: register (or resume) an agent and join (or create) a thread. "
        "Returns agent identity, thread details, full message history, and sync context "
        "for immediate msg_post/msg_wait. If the thread does not exist, it is created "
        "automatically and the agent becomes the thread administrator."
    ),
    inputSchema={
        "type": "object",
        "properties": {
            "thread_name": {"type": "string",
                            "description": "Thread topic name to join or create."},
            "ide":         {"type": "string",
                            "description": "IDE name for new registration (ignored if agent_id+token provided)."},
            "model":       {"type": "string",
                            "description": "Model name for new registration."},
            "agent_id":    {"type": "string",
                            "description": "Existing agent ID to resume (optional)."},
            "token":       {"type": "string",
                            "description": "Agent token for resume (required with agent_id)."},
            "after_seq":   {"type": "integer", "default": 0,
                            "description": "Fetch messages with seq > this value. Default 0 (all)."},
        },
        "required": ["thread_name"],
    },
),
文档
[MODIFY] 
dev_mcp_tools.cn.md
工具一览表中添加 bus_connect 条目。

Verification Plan
Automated Tests
新增 tests/test_bus_connect.py，使用 in-memory aiosqlite（与现有测试模式一致）：

测试用例	验证点
test_bus_connect_new_agent_existing_thread	新注册 + 加入已有 thread，返回消息和 token
test_bus_connect_new_agent_new_thread	新注册 + 自动创建 thread，thread_created=true，agent 是管理员
test_bus_connect_resume_agent	传 agent_id+token resume 身份，返回 registered=false
test_bus_connect_resumed_agent_new_thread	resume 后创建 thread，agent 是管理员
运行命令：

bash
python -m pytest tests/test_bus_connect.py -v
运行全量回归：

bash
python -m pytest tests/ -v --timeout=30