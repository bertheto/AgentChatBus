# AgentChatBus：JS 后端重平台化设计稿（草案）

## 目标

评估当前 Python 后端是否可以重写为 JavaScript/TypeScript 版本，并随 VS Code 扩展一起打包，由扩展负责启动、监控与关闭。

本分析基于以下前提：

- 暂时不要求与当前 Python 实现的数据库兼容。
- 本文仅做可行性与取舍分析，不提出直接实施方案。

## 文档状态

- 文档类型：架构设计稿（草案）
- 当前阶段：立项前设计与范围收敛
- 目标读者：项目维护者、扩展开发者、后端开发者、架构决策者
- 设计对象：未来 TS/Node 版本的 AgentChatBus 本地后端运行时

配套契约文档：

- [shared-contracts/backend-contract-draft.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/backend-contract-draft.md)
- [shared-contracts/http-api-contract-v1.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/http-api-contract-v1.md)
- [shared-contracts/mcp-tool-contract-v1.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/mcp-tool-contract-v1.md)
- [shared-contracts/mcp-tool-fields-v1.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/mcp-tool-fields-v1.md)
- [shared-contracts/parity-test-matrix-v1.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/parity-test-matrix-v1.md)
- [shared-contracts/extension-compatibility-checklist-v1.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/extension-compatibility-checklist-v1.md)

## 设计目标

- 去除 VS Code 扩展对 Python 运行环境的强依赖
- 让扩展可以自带并托管一个可发布的本地后端
- 保留当前产品的核心能力：MCP、线程、消息同步、Agent 协作、UI 接口
- 保留无扩展场景下的独立运行能力
- 为未来统一 Node/TypeScript 维护栈创造条件

## 非目标

- 当前阶段不要求数据库兼容
- 当前阶段不要求对 Python 实现逐行翻译
- 当前阶段不要求立即删除 Python 后端
- 当前阶段不要求一次性迁移所有外围能力
- 当前阶段不要求先做进程内宿主化实现

## 简短结论

可以，技术上完全可行。

但这个任务的真实含义并不是“把一个 MCP 服务翻译成 JS”。当前 Python 后端实际上是一个组合式本地运行时，包含：

- MCP SSE 服务
- MCP stdio 服务
- 供 VS Code 扩展 UI 使用的 REST API
- 供 UI 使用的 SSE 事件流
- SQLite 持久化与 schema 管理
- Agent 注册、心跳与在线状态逻辑
- Thread 生命周期与 Thread settings 逻辑
- `msg_wait` / `msg_post` 严格同步协议与 reply token 机制
- IDE ownership 与 shutdown 协调逻辑
- 图片上传与静态文件服务
- Web console、日志与诊断接口

如果目标是保留当前产品形态，那么 JS 重写的对象并不是“一个 MCP adapter”，而是“整个本地后端运行时”。

## 当前架构快照

### 后端职责边界

结合当前代码库，核心职责分布如下：

- 主服务入口：[src/main.py](c:/Users/hankw/Documents/AgentChatBus/src/main.py)
- MCP server 定义与 tool catalog：[src/mcp_server.py](c:/Users/hankw/Documents/AgentChatBus/src/mcp_server.py)
- Tool 行为分发层：[src/tools/dispatch.py](c:/Users/hankw/Documents/AgentChatBus/src/tools/dispatch.py)
- 数据访问与业务状态机：[src/db/crud.py](c:/Users/hankw/Documents/AgentChatBus/src/db/crud.py)
- SQLite 初始化与迁移：[src/db/database.py](c:/Users/hankw/Documents/AgentChatBus/src/db/database.py)
- IDE ownership 与 shutdown 权限管理：[src/ide_ownership.py](c:/Users/hankw/Documents/AgentChatBus/src/ide_ownership.py)

观察到的规模：

- `src` 下 Python 代码约 8645 行
- `vscode-agentchatbus/src` 下 TypeScript 代码约 2740 行
- `tests` 下测试文件 92 个
- MCP Tools 声明数 27 个
- dispatch 层 tool handler 数 27 个
- [src/main.py](c:/Users/hankw/Documents/AgentChatBus/src/main.py) 中 FastAPI 端点远多于最小 MCP/health 路由

### 扩展当前对后端的依赖

VS Code 扩展当前不是简单“启动一个进程，然后把 MCP 指过去”。

它实际依赖后端提供以下能力：

- 健康检查：`/health`
- MCP SSE 入口：`/mcp/sse`
- MCP message 入口：`/mcp/messages/`
- UI 事件流：`/events`
- 线程接口：`/api/threads`、`/api/threads/{id}/messages`、`/api/threads/{id}/sync-context`
- agent 接口：`/api/agents`、`/api/threads/{id}/agents`
- 生命周期接口：archive、unarchive、state change、delete
- 图片上传：`/api/upload/image`
- 诊断与日志：`/api/logs`、`/api/system/diagnostics`
- IDE 注册与 ownership：`/api/ide/register`、`/api/ide/heartbeat`、`/api/ide/unregister`
- shutdown 控制：`/api/shutdown`

相关调用可以在以下文件中直接看到：

- [vscode-agentchatbus/src/api/client.ts](c:/Users/hankw/Documents/AgentChatBus/vscode-agentchatbus/src/api/client.ts)
- [vscode-agentchatbus/src/busServerManager.ts](c:/Users/hankw/Documents/AgentChatBus/vscode-agentchatbus/src/busServerManager.ts)

这意味着如果只重写 MCP 部分，而不重写这些 HTTP 行为，那么对于当前扩展而言并不够用。

## 当前后端为什么难以重建

真正难的不是 FastAPI，也不是 SQLite。本质难点在于其上面叠加的协议语义与状态机。

### 1. 严格同步协议

后端并不是一个简单的 append-only chat service。

它实现了：

- 全局单调递增的 `seq`
- reply token 的签发、租约与消费
- token invalid / expired / replay 等错误语义
- `SeqMismatch` 的恢复逻辑
- `msg_wait` 的唤醒规则与快返机制

这些是产品语义，不是框架胶水。JS 重写必须要么保留等价行为，要么明确重新设计并同步改扩展和工具契约。

### 2. 多 Agent 协作状态

当前后端追踪了：

- agent 注册与 token
- 心跳与 online/offline 状态变化
- MCP SSE connection 与 agent identity 的绑定关系
- thread 级别的 waiting state
- 自动管理员 / creator-admin 行为

这部分状态机是产品价值的核心，不是外围功能。

### 3. 双消费者模型：Agent + UI

当前 Python 后端同时服务两类消费者：

- 外部 MCP client
- 扩展自身 UI

所以它既是协议服务器，也是应用后端。

### 4. 扩展 ownership 模型

扩展当前通过独立 API 和服务端状态来协调 shutdown 权限。

这部分非常容易低估。即使未来 JS 后端由扩展打包，如果仍存在以下场景，ownership 逻辑依然重要：

- 多个 VS Code 窗口连接同一个本地服务
- 还有其他 client 连接相同端口
- 一个窗口关闭，但另一个窗口仍在使用服务

### 5. Web console 与上传能力

当前服务还暴露了：

- 静态资源
- 上传文件路径映射
- search / export / settings / template API
- 日志与 metrics 端点

如果这些仍在目标范围内，那么迁移对象依旧是完整本地后端，而不是轻量工具层。

## 重写方案选项

## 方案 A：随扩展打包的 Node sidecar 服务

把后端写成 TypeScript/Node 服务，随扩展一起发布，并由扩展作为子进程拉起。

形态：

- 后端使用 TypeScript 编写
- 构建为一个可运行的 Node 服务入口或 bundle
- 扩展像现在的 `BusServerManager` 一样负责启动、停止、重启和探活
- 服务仍然对外提供 localhost HTTP + SSE + MCP 端点

优点：

- 与当前扩展架构最匹配
- UI 改动最小
- 服务边界清晰
- 比 in-process 方案更容易做崩溃隔离
- 更容易保留 VS Code、Cursor、浏览器以及外部 Agent 的多客户端接入能力

缺点：

- 仍然是一个独立本地进程，只是从 Python 换成了 Node
- 如果依赖较重，打包体积可能变大
- 仍需处理跨平台子进程管理
- 真正的工作量仍是重写完整后端语义，而不是只改 transport

判断：

- 如果立项，这是最现实、最推荐的目标形态

## 方案 B：将后端直接宿主到 extension host 进程内

直接在扩展进程里启动本地 HTTP server，把 `/api`、`/events`、`/mcp/sse` 都放进 extension host 本身。

形态：

- extension host 内部启动 Node HTTP server
- 同一进程内服务 `/api`、`/events`、`/mcp/sse`
- UI 与 MCP 都连到这个进程内 HTTP server

优点：

- 少一个 OS 级别子进程
- 分发看上去更简单
- 与扩展日志、状态的整合更直接

缺点：

- 故障爆炸半径更大，后端问题会直接影响 extension host
- SSE、数据库、后台循环与扩展宿主共享资源预算
- 排障与运行时隔离更差
- 如果工程实现不够稳，可能影响编辑器响应性

判断：

- 可以做，但风险高于 sidecar
- 不建议作为第一版 JS 重写目标

## 方案 C：只把 MCP 重写为 JS，REST/UI 后端保留在别处

只重写 MCP tools，不重写 REST/UI backend，或者让 UI backend 继续留在 Python。

优点：

- 初期范围更小

缺点：

- 与当前扩展架构不匹配
- 形成双后端或双运行时维护
- 维护复杂度会上升，而不是下降

判断：

- 除非同时缩减产品范围，否则不推荐

## 分子系统可行性评估

### MCP 层

JS 实现可行。

候选技术栈：

- TypeScript
- 官方 MCP TypeScript SDK（前提是其能力足够覆盖当前场景）
- 若不够，则自行实现 JSON-RPC + SSE

风险：

- 中等

主要问题：

- 难点不是 transport，而是 session 绑定与 tool 语义还原

### HTTP API 层

JS 实现可行。

候选技术栈：

- Fastify 或 Express
- 原生 SSE 输出
- multipart 上传支持

风险：

- 低到中等

### SQLite 层

JS 实现可行。

候选技术栈：

- `better-sqlite3`，适合本地同步访问、性能稳定、行为可预期
- 或 `sqlite3` / `libsql` 等变体

观察：

- 既然数据库兼容性不要求保留，那么 schema 和 migration 策略可以更激进地重设计

风险：

- 原始存储层风险低
- 但事件顺序、一致性和并发语义的风险仍是中等

### 业务规则层

可行，但这是最贵的部分。

需要重点重新设计或做精确对齐测试的包括：

- reply token 状态机
- `seq mismatch` 窗口与恢复逻辑
- `human_only` 投影视图规则
- agent presence 生命周期
- IDE ownership 转移规则
- admin coordinator 循环
- thread settings 与 template 行为

风险：

- 高

### 扩展集成层

可行，而且理论上会比现在更稳定。

潜在收益：

- 不再依赖 Python 环境
- 不再需要扫描 Python launcher
- 不再需要 pip 安装 fallback
- 启动和打包更加确定

风险：

- sidecar 模式下为低到中等
- in-process 模式下为中到高

## JS 重写的主要优点

### 1. 扩展分发与运行时更可控

当前扩展需要处理：

- 探测 Python
- 判断 workspace source 布局
- 搜索已安装 executable 或 module
- 必要时自动 pip install

随扩展打包的 JS sidecar 可以消除大部分这类不确定性。

### 2. 环境类失败会减少

理论上会显著减少以下问题：

- 没有 Python
- 虚拟环境不对
- PATH 配置异常
- pip 安装失败
- executable 搜索失败

### 3. 扩展与本地后端可以收敛到同一语言族

收益：

- 围绕 Node/TypeScript 形成更统一的维护栈
- 前端/扩展开发者更容易参与本地后端维护
- 前后端共享类型更容易

### 4. 发布产物更可复现

如果 backend build 随扩展一起发布，那么发布者可以明确控制“这个扩展版本对应哪一个 backend build”。

这会提升可复现性与可调试性。

### 5. 启动与重启逻辑可以明显简化

当前 [vscode-agentchatbus/src/busServerManager.ts](c:/Users/hankw/Documents/AgentChatBus/vscode-agentchatbus/src/busServerManager.ts) 中有大量 Python 探测、workspace source 模式、pip 可执行/模块 fallback、安装逻辑。

如果改成打包式 Node sidecar，这一块可以大幅收缩。

## JS 重写的主要缺点

### 1. 重写面很大

当前后端并不薄。重写意味着要重新实现多年积累下来的行为决策，而不是把 handler 按语法改写一遍。

### 2. 语义回归风险高

高风险区域包括：

- 消息同步正确性
- 在线状态正确性
- 管理员协调边界条件
- SSE session bookkeeping
- token lease 相关 bug

### 3. 迁移期会有双栈维护成本

如果迁移采用渐进方式，短期内很可能需要同时维护：

- Python backend
- JS backend
- parity tests
- 甚至 feature freeze 或准入规则

### 4. 会暂时失去现有实现的运行时成熟度

Python 版本已经拥有：

- 较广测试覆盖
- 已验证的运行时行为
- 现成的排障路径

JS 版本初期都要重新建立。

### 5. 如果做成 in-process，会让 extension host 更脆弱

一旦走进程内托管方案，很多后端故障会更靠近编辑器宿主本身。

## 不要求数据库兼容后，哪些事情会更容易

不要求 DB 兼容是一个明显利好。

这意味着可以：

- 按 JS 访问模式重新设计 schema
- 简化 migration 历史
- 去掉很多 legacy compatibility 逻辑
- 重新审视那些更多是为历史行为服务的数据表与字段

但这并不等于“问题已经简单很多”。

它主要降低的是数据层负担，而不是协议层与业务语义层负担。

## 推荐方向

如果要推进这件事，我的建议是：

### 建议 1

第一版不要做成 extension host 内嵌后端。

优先选“随扩展打包的 Node sidecar”。

原因：

- 运行边界更清晰
- 与当前 localhost HTTP/SSE 架构最匹配
- UI 改动更小
- 更容易做调试、重启与崩溃隔离

### 建议 2

不要从 Python 代码逐行移植开始。

应先定义目标 backend contract：

- 扩展真正需要的 HTTP endpoints
- 真正需要保留的 MCP tools
- 必须保持的顺序与同步语义
- 必须保持的生命周期语义
- 明确列出非目标范围

### 建议 3

把这件事当作“后端重平台化”，而不是“语法迁移”。

这意味着它应该拥有：

- 设计规格文档
- contract tests
- 核心行为 parity test matrix
- 分阶段 rollout 计划

## 最终版本成型后，会是什么状态

如果这条路线真正完成，并且采用推荐的 sidecar 方案，那么最终成型后的状态应当是：

### 目标形态

- VS Code 扩展内自带一个 Node/TypeScript 本地后端
- 扩展激活后直接拉起该后端，无需探测 Python、无需 pip 安装
- 本地后端继续对外提供 MCP SSE、REST API、UI 事件流与必要静态资源
- 扩展 UI 基本不需要大改，只需要把当前 Python 服务替换为 JS 服务
- Cursor 等其他 MCP client 仍可继续连接同一服务

### 从用户视角看到的状态

- 安装扩展后即可使用，不再需要先配置 Python 环境
- 启动更稳定，失败路径更少
- Thread、Agents、Logs、Management 等视图继续工作
- Agent 通过 `bus_connect`、`msg_wait`、`msg_post` 等工具协作的体验保持一致或接近一致
- shutdown、ownership、日志查看、thread 管理仍由扩展统一控制

### 从工程视角看到的状态

- 扩展和本地后端以 TypeScript/Node 为主栈
- `BusServerManager` 将明显简化，不再包含复杂的 Python 启动探测逻辑
- 后端 schema 与迁移策略更适合 JS 版本自身演进
- 测试体系会分成两层：
	- JS backend 自身的 contract / parity 测试
	- 扩展到本地 sidecar 的端到端集成测试

### 从维护视角看到的状态

- 发布与调试更可控，因为扩展版本与 backend build 一一对应
- 环境问题明显减少，运维类 issue 会下降
- 但代价是：团队需要真正接管后端语义维护，而不能再依赖已有 Python 实现作为事实标准

换句话说，最终版本成型后，理想状态不是“把 Python 删掉了”，而是“扩展自带一个足够成熟、可测试、可发布、可运维的本地 JS 后端运行时”。

## 无扩展场景与 CLI 形态

如果用户不想使用 VS Code 扩展，TS 版本也应该可以独立运行，而不是被设计成“只能由扩展拉起”。

这意味着 TS 版本在最终设计上，应该至少提供两种正式运行模式：

- `agentchatbus serve`
- `agentchatbus stdio`

这两种命令的含义是“两种运行模式二选一”，不是要求用户同时运行两个命令。

### `serve` 模式

`serve` 模式用于启动完整本地服务，适合以下场景：

- 用户自己在终端启动一个长期运行的本地 bus
- 多个客户端共享同一个服务
- 需要 REST API、SSE、Web Console、线程管理与日志能力
- 需要 VS Code、Cursor、浏览器或其他客户端同时接入

典型形式：

```bash
agentchatbus serve
agentchatbus serve --host 127.0.0.1 --port 39765 --db ./data/bus.db
```

这个模式下，对外提供的应当是完整本地服务能力，而不是只暴露 MCP：

- `/health`
- `/mcp/sse`
- `/mcp/messages/`
- `/events`
- `/api/*`
- 可选的 Web Console 与静态资源

### `stdio` 模式

`stdio` 模式用于被某个 MCP host 直接拉起，通过 stdin/stdout 与宿主通信。

它适合以下场景：

- Claude Desktop、Cursor、其他 MCP host 直接拉起子进程
- 用户不想运行一个长期驻留的本地 HTTP 服务
- 用户只需要 MCP 能力，而不是完整 Web / REST 能力

典型形式：

```bash
agentchatbus stdio
agentchatbus stdio --db ./data/bus.db
```

### 这不是“两个命令都要跑”

需要明确的一点是：

- 如果用户想自己启动完整服务，就运行 `agentchatbus serve`
- 如果用户想让某个 MCP 客户端直接拉起该程序，就配置客户端执行 `agentchatbus stdio`

正常情况下，用户不会手工同时运行这两个命令。

它们对应的是两种不同的产品入口：

- `serve`：完整本地服务模式
- `stdio`：纯 MCP transport 模式

### 推荐的 CLI 用户体验

为了贴近当前 Python 版本的使用习惯，也可以考虑让默认命令直接等价于 `serve`：

```bash
agentchatbus
agentchatbus stdio
```

也就是：

- `agentchatbus` 默认启动服务
- `agentchatbus stdio` 明确进入 stdio 模式

这会更接近当前 Python 版的直觉：

- `agentchatbus` 启动 SSE/HTTP 服务
- `agentchatbus-stdio` 启动 stdio 模式

### 推荐的内部结构

无论最终 CLI 叫什么名字，更重要的是内部实现方式。

推荐把 TS 版本拆成：

- `core`：线程、消息、agent、reply token、seq、presence、settings、SQLite 等核心业务
- `server-sse`：HTTP + SSE + REST + MCP over SSE
- `server-stdio`：MCP over stdio
- `cli`：命令行分发入口

这样：

- `serve` 模式加载 `core + server-sse`
- `stdio` 模式加载 `core + server-stdio`

两个模式共享同一套核心业务层，而不是维护两套语义实现。

### 对最终架构的含义

这一点很关键：TS 版后端不应该被设计成“VS Code 扩展私有内核”。

更合理的目标是：

- 后端本身是一个独立可运行产品
- VS Code 扩展只是它的一个宿主管理器
- 不使用扩展的用户也可以直接运行同一套 TS 后端

这样才能保留当前 Python 版本一个很重要的优点：后端本身是独立能力，而不是扩展私有实现。

## 仓库目录管理建议

你当前面临的问题不是“要不要重构目录”，而是“如何在 Python 与 TS 并行存在时，把混乱成本控制住”。

这里建议分阶段处理，而不是一开始就做大搬迁。

### 原则

- Python 与 TS 在一段时间内会并行存在，这是正常状态，不必急于统一
- 先保证边界清晰，再考虑最终收敛
- 避免在 TS 版本尚未稳定前，先把 Python 目录大规模迁移
- 扩展目录继续保持独立，不要和新 TS 后端混在一起

### 第一阶段建议：保持平级，但明确命名

在 Python 仍是主实现、TS 是新实现的阶段，最稳妥的方式是平级放置。

推荐思路：

```text
AgentChatBus/
├── src/                       # 现有 Python 主实现
├── tests/                     # 现有 Python 测试
├── agentchatbus/              # 现有 Python 发布入口
├── vscode-agentchatbus/       # VS Code 扩展
├── agentchatbus-ts/           # 新增 TS 后端工作区
│   ├── package.json
│   ├── src/
│   ├── test/
│   └── tsconfig.json
├── dev_notes/
├── docs/
└── ...
```

这个阶段的重点不是漂亮，而是低风险：

- Python 不动，避免影响现有开发节奏
- TS 有自己独立边界
- 扩展可以逐步接入 TS 版本，不影响现有 Python 版本继续开发

### 可直接落地的初始 TS 目录建议

如果现在就要开始搭建 TS 版本，我建议先不要一上来就做复杂 monorepo，而是采用“一个独立工作区 + 明确子目录边界”的方式。

推荐第一版可执行目录如下：

```text
AgentChatBus/
├── src/
├── tests/
├── agentchatbus/
├── vscode-agentchatbus/
├── agentchatbus-ts/
│   ├── package.json
│   ├── tsconfig.json
│   ├── README.md
│   ├── src/
│   │   ├── cli/
│   │   │   ├── index.ts
│   │   │   ├── serve.ts
│   │   │   └── stdio.ts
│   │   ├── core/
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   ├── domain/
│   │   │   ├── services/
│   │   │   ├── sync/
│   │   │   └── types/
│   │   ├── transports/
│   │   │   ├── sse/
│   │   │   ├── stdio/
│   │   │   └── http/
│   │   ├── adapters/
│   │   │   ├── mcp/
│   │   │   ├── rest/
│   │   │   └── storage/
│   │   └── shared/
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── parity/
│   ├── scripts/
│   └── dist/
├── dev_notes/
├── docs/
└── ...
```

### 各目录职责建议

#### `agentchatbus-ts/src/cli/`

负责命令行入口分发。

建议职责：

- `index.ts`：命令入口总分发
- `serve.ts`：启动完整本地服务
- `stdio.ts`：启动 stdio MCP 模式

这一层只做启动参数解析和模式切换，不承载核心业务逻辑。

#### `agentchatbus-ts/src/core/`

这是最重要的目录，负责纯业务核心。

建议放：

- `config/`：配置读取与默认值
- `db/`：SQLite 连接、schema、migration
- `domain/`：Thread、Message、Agent、Reaction 等领域模型
- `services/`：thread、message、agent、admin、template 等核心服务
- `sync/`：`seq`、reply token、`msg_wait` / `msg_post` 协议语义
- `types/`：跨模块共享的内部类型定义

原则：

- `core` 不依赖 VS Code API
- `core` 不直接依赖具体 transport
- `core` 应尽量成为 `serve` 和 `stdio` 的共享事实来源

#### `agentchatbus-ts/src/transports/`

负责“怎么接入”，不负责“业务是什么意思”。

建议放：

- `sse/`：MCP over SSE
- `stdio/`：MCP over stdio
- `http/`：普通 HTTP 路由与 SSE 事件流

原则：

- transport 层调用 core
- transport 层不自行复制业务判断

#### `agentchatbus-ts/src/adapters/`

负责把外部协议映射到内部服务。

建议放：

- `mcp/`：tool catalog、prompt/resource 暴露、参数映射
- `rest/`：REST API handler 与返回格式
- `storage/`：如果需要单独抽离 repository、DAO、持久化适配器，也可以从这里开始演进

这一层的价值在于把“协议细节”和“核心语义”分开，避免后面 transport 改动时牵连核心层。

#### `agentchatbus-ts/src/shared/`

放置可复用但不属于核心领域的公共工具，例如：

- 错误类型
- 时间工具
- JSON/schema helper
- logger 封装

#### `agentchatbus-ts/tests/`

建议一开始就分层，不要把所有测试堆在一起。

- `unit/`：针对 core 中的小范围纯逻辑测试
- `integration/`：针对 SQLite、HTTP、MCP transport 的集成测试
- `parity/`：专门验证与 Python 版本关键行为等价的测试

其中 `parity/` 很关键，它能防止 TS 版本在关键同步语义上悄悄漂移。

### 第一阶段不要做的事

为了控制风险，第一阶段我建议刻意不要做以下事情：

- 不要先把 Python 代码复制到 TS 目录里当“参考实现备份”
- 不要一开始就拆成多 package/workspace，除非团队已经明确需要
- 不要让 `vscode-agentchatbus/` 直接依赖 `agentchatbus-ts/src/` 的源码路径
- 不要让 transport 层自己生成业务语义

先把边界和启动方式建对，比一开始做复杂工程包装更重要。

### 与扩展目录的关系建议

并行期建议保持：

- `agentchatbus-ts/` 是独立 Node 工作区
- `vscode-agentchatbus/` 是扩展工作区
- 两边通过“启动产物 + HTTP/MCP contract”集成

不要在第一阶段让它们形成源码级强耦合，例如：

- 扩展直接 import TS backend 的运行时代码
- backend 反向依赖扩展目录里的工具函数

正确的耦合方式应该是：

- 扩展托管 backend 产物
- 扩展调用 backend 的公开接口
- 双方围绕文档化 contract 协作

我建议新目录名称直接明确一点，例如：

- `agentchatbus-ts`
- 或 `backend-ts`

不要起太抽象的名字，比如 `next`、`new-core`、`runtime2`。这种名字在半年后几乎一定会变成负资产。

### 第二阶段建议：当 TS 稳定后，再做归一化整理

当 TS 版本已经能承担主要功能，且 Python 进入维护或淘汰期时，再考虑整理成更长期的结构。

一个比较清晰的长期目标是：

```text
AgentChatBus/
├── backend-py/                # Python 参考实现 / 兼容实现 / 迁移期保留
│   ├── src/
│   ├── tests/
│   └── pyproject.toml
├── backend-ts/                # TS 主实现
│   ├── packages/
│   │   ├── core/
│   │   ├── server-sse/
│   │   ├── server-stdio/
│   │   └── cli/
│   ├── tests/
│   └── package.json
├── vscode-agentchatbus/
├── docs/
├── dev_notes/
└── shared-contracts/
```

这种结构适合 TS 已成为主实现之后使用，不适合一开始就强行迁过去。

### 为什么不建议现在就把 Python 从根目录整体搬走

因为当前 Python 仍是事实上的主版本。现在马上把它迁到 `backend-py/` 之类的位置，会立刻带来一批无收益的扰动：

- 导入路径与发布入口变化
- 测试路径变化
- CI 与脚本更新
- 文档与安装指令更新
- 扩展中 workspace source 识别逻辑更新

这些变化在 TS 后端尚未站稳之前，收益很低，风险不必要。

### 团队协作上的建议

在 Python 与 TS 并行期，建议明确三条规则：

1. Python 仍是当前稳定主线，TS 是新实现试验线。
2. 新功能是否双写，要按功能级决策，不要默认两边同步实现。
3. 协议契约、HTTP 接口、核心同步语义，要优先文档化，避免两边各自漂移。

### 文档与契约文件怎么放

建议把“会被 Python 与 TS 同时依赖理解”的内容逐步从实现目录抽离出来，例如：

- MCP tool contract
- REST endpoint contract
- sync/reply-token 规则
- 关键错误码与错误语义

可以单独放在未来的：

- `shared-contracts/`
- 或暂时放在 `docs/architecture/`

这样即使 Python 和 TS 并行，双方也围绕同一份契约工作，而不是互相猜对方行为。

### 当前阶段的最终建议

结合你现在的状态，我建议是：

- 继续保留现有 Python 结构不动
- 在仓库根目录新增一个平级 TS 后端目录
- VS Code 扩展目录继续独立
- 等 TS 版本具备主要能力之后，再决定是否把 Python 迁入 `backend-py/`

也就是说，短期不要急着“整理得很漂亮”，先保证：

- 边界清楚
- 迁移成本可控
- Python 不被无谓扰动
- TS 可以独立推进

## 建议的迁移路径

### Phase 0：抽取 contract

先把 JS 版本必须具备的最小行为抽出来：

- 扩展实际消费的 REST endpoints
- 实际需要的 MCP tools
- `seq` / reply token 规则
- agent presence 规则
- IDE ownership 规则

输出物：

- 可执行 contract 文档
- golden test scenarios

### Phase 1：JS sidecar 骨架

先做一个 Node 服务骨架，至少提供：

- `/health`
- `/mcp/sse`
- `/mcp/messages/`
- `/events`
- 最小化的 `/api/threads`、`/api/messages`、`/api/agents`

数据库直接使用全新的 JS-native SQLite schema。

### Phase 2：扩展兼容层打通

让扩展在不改变核心 UI 交互的前提下，能够连接并托管这个 JS 服务。

第一目标：

- 扩展在 Windows/macOS/Linux 上稳定拉起打包式 JS sidecar

### Phase 3：核心协议语义对齐

优先移植高风险部分：

- `bus_connect`
- `msg_wait`
- `msg_post`
- sync context 与 reply token
- agent register / resume / heartbeat
- thread state changes

### Phase 4：补齐运行时特性

继续补上：

- IDE ownership API
- logs / diagnostics
- uploads
- templates / settings / search / export
- Web console（如果仍保留）

### Phase 5：切换默认运行时

把扩展默认 runtime 从 Python-managed 切到 JS-managed。

Python backend 可以选择保留为：

- legacy standalone service
- 参考实现
- 迁移期回退方案

## 风险总结

### 低风险区域

- HTTP 路由
- 静态文件服务
- 图片上传 plumbing
- 本地 SQLite 访问
- sidecar 模式下的扩展进程管理

### 中风险区域

- MCP SDK 能力是否足够
- SSE session 生命周期
- 外部客户端互操作性
- 日志与 diagnostics 行为一致性

### 高风险区域

- `msg_wait` / `msg_post` 正确性
- reply token 签发与 replay 防护
- `seq mismatch` 行为
- agent online presence 语义
- admin coordinator 行为
- 与现有测试边界条件的一致性

## 最终判断

### 能不能做？

能。

### 值不值得做？

如果战略目标是：

- 去掉 Python 部署依赖
- 让扩展自包含
- 让启动路径更确定

那么值得认真考虑。

### 便不便宜？

不便宜。

这是一项实质性的后端重平台化工作，并且伴随真实的语义回归风险。

### 我的建议

只有当“部署与可运维性收益”足够重要时，才值得推进。

如果推进，应该选择：

- 打包式 Node sidecar
- 全新 schema
- contract-first 迁移方式
- 围绕高风险协议语义做分阶段 rollout

不建议选择：

- 第一版就 in-process
- 逐行盲目移植
- 只重写 MCP，但不解决扩展对 HTTP backend 的依赖

## 具体下一步

1. 从当前 Python server 与扩展中抽取最小 backend contract。
2. 明确 v1 JS cutover 真正需要哪些 endpoints 与 MCP tools。
3. 围绕这些最小行为设计一套全新的 JS-native SQLite schema。
4. 先做一个暴露 `/health`、`/mcp/sse`、`/mcp/messages/`、`/events` 的 Node sidecar 原型。
5. 在全面迁移之前，先建立 `bus_connect`、`msg_wait`、`msg_post`、agent presence、IDE ownership 的 parity tests。
