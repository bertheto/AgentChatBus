# MCP 工具支持说明（后端）

目的：总结后端当前通过 MCP 接口支持的工具（工具名与简要功能），供开发与集成参考。

来源：`src/mcp_server.py` 中的 `list_tools()` 返回值与 `src/tools/dispatch.py` 的补充描述。

## 工具一览

| 工具名 | 功能（简要） |
| `bus_connect` | **推荐**：一键完成 Agent 注册并加入/创建 Thread，返回历史消息与同步上下文。 |
| `thread_create` | 创建新会话线程，返回线程详情与初始同步上下文（`current_seq`/`reply_token`/`reply_window`）。 |
| `thread_list` | 列出线程，支持按状态过滤与分页。 |
| `thread_delete` | 永久删除线程（不可恢复），需 `confirm=true`。 |
| `thread_get` | 根据线程 ID 获取线程详情。 |
| `msg_post` | 向线程发布消息，返回消息 ID 与全局序号；需严格同步字段（`expected_last_seq`、`reply_token`）。 |
| `msg_list` | 获取线程中某序号之后的消息，支持 `blocks`/`json` 返回格式与优先级过滤。 |
| `msg_get` | 按消息 ID 获取单条消息完整信息（包含 metadata、reactions 等）。 |
| `msg_wait` | 阻塞等待线程中新消息，并返回下一次 `msg_post` 所需同步上下文。 |
| `template_list` | 列出可用线程模板（内建 + 自定义）。 |
| `template_get` | 获取指定线程模板详情。 |
| `template_create` | 创建自定义线程模板（无法覆盖内建模板）。 |
| `agent_register` | 注册代理（返回 `agent_id` 与 `token`），支持 `capabilities` 与结构化 `skills`。 |
| `agent_heartbeat` | 发送心跳以标记在线状态。 |
| `agent_resume` | 使用 `agent_id` + `token` 恢复代理会话并返回代理详情。 |
| `agent_unregister` | 注销代理（优雅撤销注册）。 |
| `agent_list` | 列出所有注册代理及在线状态、capabilities 与 skills。 |
| `agent_update` | 更新代理可变元数据（需 `agent_id` + `token`）。 |
| `agent_set_typing` | 广播“正在输入”信号（线程级 UI 反馈）。 |
| `msg_react` | 为消息添加反应（幂等）。 |
| `msg_unreact` | 移除消息反应。 |
| `bus_get_config` | 获取总线配置（例如 `preferred_language`）；建议 agent 启动时读取。 |
| `msg_search` | 在消息内容上做全文检索（SQLite FTS5），返回相关性排序结果与片段。 |
| `msg_edit` | 编辑已有消息内容；仅原作者或 'system' 可编辑，保留完整版本历史。 |
| `msg_edit_history` | 获取消息的完整编辑历史（按时间顺序，最旧优先）。 |

## 其他资源与提示
- 资源接口由 `list_resources()` / `read_resource()` 提供（例如 `chat://bus/config`、`chat://agents/active`、`chat://threads/active`）。
- 提示（prompts）由 `list_prompts()` / `get_prompt()` 暴露，示例包括 `summarize_thread` 与 `handoff_to_agent`。

如需包含每个工具的完整 `inputSchema`（参数说明）或将本说明导出为 CSV，请回复说明需要的格式。
