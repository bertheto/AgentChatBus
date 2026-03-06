Agent 注意力机制设置实现计划
本计划旨在引入一系列设置，允许用户可选地禁用消耗 Agent 注意力的功能（如 handoff_target、stop_reason 和 priority）。这些设置将在系统设置界面的“Agent”标签页中进行配置（默认关闭），并动态控制 MCP Server 是否向 Agent 暴露这些字段以及 JSON 返回结果。

需用户确认的事项
各个设置项的描述是否符合预期？
这次修改是否还有其他希望变为可配置的字段？
默认情况下，这三个功能将被设为 False（已禁用）。
计划进行的修改
配置层
引入布尔型功能开关标签。

[MODIFY] 
src/config.py
添加 ENABLE_HANDOFF_TARGET 配置（默认 False）。
添加 ENABLE_STOP_REASON 配置（默认 False）。
添加 ENABLE_PRIORITY 配置（默认 False）。
在 
get_config_dict()
 接口中包含这几个新增字段。
[MODIFY] 
src/main.py
在 PUT /api/settings 的 Pydantic 模型 
SettingsUpdate
 中添加这几个布尔字段，以支持前端修改。
Backend MCP Server 动态 Schema 与 返回过滤
当某项功能被禁用时，我们需要从系统层面彻底让 Agent "看不见" 它们，防止 Agent 脑补这些字段导致出错。

[MODIFY] 
src/mcp_server.py
在 
list_tools()
 动态生成 schema 时应用开关判断：
如果 handoff_target 禁用：从 
msg_post
 中移除该属性；从 
msg_wait
 的 
for_agent
 属性中移除。
如果 stop_reason 禁用：从 
msg_post
 中移除该属性。
如果 priority 禁用：从 
msg_post
 中移除该属性；从 
msg_list
 中移除对应的过滤参数。
[MODIFY] 
src/tools/dispatch.py
确保从 MCP 接口返回给 Agent 的 JSON 中不再包含这些被禁用的字段：
handle_msg_post
 返回的 payload：动态删减 handoff_target、stop_reason 和 priority。
handle_msg_list
（当 return_format="json" 时）：动态删减 metadata.handoff_target、metadata.stop_reason 和 priority。
同样处理 
bus_connect
 初始化时返回的消息属性。
[MODIFY] 
src/db/crud.py
在 
msg_post
 等核心方法中不需要大改，因为 metadata.get() 如果找不到已经被隐藏掉的值自然会忽略，原本也是可选参数。重点在于 MCP 层的 "屏蔽"。
前端 UI 更新
在现有的 Settings Modal 中加入上述带详细说明的 Switch 开关。

[MODIFY] 
src/static/js/components/acb-modal-shell.js
在 AGENT_FIELDS 常量数组中添加这三个新设置项（ENABLE_HANDOFF_TARGET, ENABLE_STOP_REASON, ENABLE_PRIORITY）。
扩展现有的 UI 渲染逻辑，允许在 checkbox 旁边或下方渲染详细解释（description 字段）。例如：
Handoff Target（任务交接目标）：允许 Agent 主动将消息路由或交接给其他特定 Agent。关闭此功能可节省注意力消耗，并防止 Agent 过度思考协调逻辑。
Stop Reason（停止原因）：要求 Agent 必须详细说明本轮结束对话的原因（如达成共识、陷入僵局等）。关闭此功能以防 Agent 浪费 Token 去选择合适的退出状态。
Message Priority（消息优先级）：控制 Agent 是否可以将某条消息标记为紧急 (urgent) 或系统级 (system)。关闭此功能以避免 Agent 过度关注定级逻辑。
[MODIFY] 
src/static/css/main.css
为各个设置项下方的 description 增加适当的 CSS 样式（如字体变小、颜色变淡，或者采用次要文本颜色显示详细说明），进一步提升 UI 质感。
验证计划 (Verification Plan)
手动验证
打开前端 UI，进入 "Settings" -> "Agent" 选项卡。验证是否能看到三个新增的带详细描述的开关，且默认均为关闭状态。
试着切换这些开关，并保存，确认后端 config.json 数据被正确写入。
使用 Cursor 或命令行 MCP Client 连接并请求 
list_tools
，验证如果某功能被关闭，它相关的参数彻底从 
msg_post
 等 tool schema 中消失；开启时又能正常恢复显示。
测试发一条带有完整 JSON 返回的回调信息，验证那些被禁用的字段没有被泄露出来。