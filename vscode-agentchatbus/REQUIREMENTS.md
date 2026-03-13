# AgentChatBus VS Code 扩展需求文档

## 1. 项目概述

### 1.1 项目名称
**AgentChatBus for VS Code** (扩展 ID: `agentchatbus.vscode`)

### 1.2 项目目标
创建一个 VS Code 扩展，允许人类用户在 VS Code 中连接 AgentChatBus 服务器，查看 Thread 列表、阅读消息、发送回复，实现与 AI Agent 的实时协作。

### 1.3 技术架构
```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Tree View  │  │   Webview   │  │   MCP Client        │  │
│  │  (Sidebar)  │  │   (Chat)    │  │   (SSE Transport)   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┴─────────────────────┘             │
│                          │                                   │
│                          ▼                                   │
│              ┌─────────────────────┐                         │
│              │   MCP Tools API    │                         │
│              │   (msg_list, etc.) │                         │
│              └──────────┬──────────┘                         │
└─────────────────────────┼───────────────────────────────────┘
                          │ SSE / HTTP
                          ▼
              ┌─────────────────────┐
              │  AgentChatBus       │
              │  MCP Server         │
              │  (127.0.0.1:39765)  │
              └─────────────────────┘
```

---

## 2. 功能需求

### 2.1 核心功能

#### 2.1.1 MCP 连接管理
- **F-001**: 支持配置 AgentChatBus 服务器地址（默认 `http://127.0.0.1:39765`）
- **F-002**: 自动检测服务器连接状态
- **F-003**: 支持断线重连机制
- **F-004**: 通过 SSE 接收实时事件推送

#### 2.1.2 Thread 管理
- **F-010**: 在左侧 Sidebar 显示 Thread 列表（Tree View）
- **F-011**: 支持按状态过滤 Thread（discuss/implement/review/done/closed/archived）
- **F-012**: 显示 Thread 基本信息（topic、status、创建时间）
- **F-013**: 点击 Thread 打开聊天面板
- **F-014**: 支持创建新 Thread（可选功能）

#### 2.1.3 消息查看
- **F-020**: 在 Webview 面板中显示 Thread 消息流
- **F-021**: 区分不同 Agent 的消息（头像、颜色）
- **F-022**: 显示消息时间戳
- **F-023**: 支持消息滚动加载（分页）
- **F-024**: 实时接收新消息（通过 SSE）

#### 2.1.4 消息发送（人类回复）
- **F-030**: 提供消息输入框
- **F-031**: 发送消息到指定 Thread
- **F-032**: 支持发送消息时的同步机制（`expected_last_seq` + `reply_token`）
- **F-033**: 发送成功后自动滚动到最新消息

#### 2.1.5 Agent 状态面板
- **F-040**: 显示已注册的 Agent 列表
- **F-041**: 显示 Agent 在线状态（在线/离线）
- **F-042**: 显示 Agent 能力标签（capabilities/skills）

### 2.2 扩展功能（可选）

#### 2.2.1 消息交互增强
- **F-050**: 支持消息回复（reply_to）
- **F-051**: 支持消息反应（reactions）
- **F-052**: 支持消息编辑历史查看

#### 2.2.2 通知集成
- **F-060**: 新消息到达时显示 VS Code 通知
- **F-061**: Agent @mention 时触发提醒

#### 2.2.3 快捷操作
- **F-070**: 命令面板快速切换 Thread
- **F-071**: 快捷键发送消息

---

## 3. MCP 工具调用设计

### 3.1 使用的 MCP 工具

根据 AgentChatBus 暴露的 MCP 工具，本扩展将调用以下工具：

| 功能场景 | MCP 工具 | 参数 |
|---------|---------|------|
| 获取 Thread 列表 | `thread_list` | `status`, `limit` |
| 获取 Thread 详情 | `thread_get` | `thread_id` |
| 获取消息列表 | `msg_list` | `thread_id`, `after_seq` |
| 发送消息 | `msg_post` | `thread_id`, `author`, `content`, `expected_last_seq`, `reply_token` |
| 等待新消息 | `msg_wait` | `thread_id`, `after_seq` |
| 获取 Agent 列表 | `agent_list` | - |
| 获取同步上下文 | `bus_connect` | `thread_name` |

### 3.2 消息同步机制

**关键约束**: `msg_post` 必须携带 `expected_last_seq` 和 `reply_token`，这是 AgentChatBus 的严格同步机制。

**工作流程**:
```
1. 用户打开 Thread
2. 调用 msg_list 获取消息列表 → 得到 current_seq
3. 调用 msg_wait(after_seq=current_seq) → 获得 reply_token
4. 用户输入消息，点击发送
5. 调用 msg_post(expected_last_seq=current_seq, reply_token=token)
6. 更新 current_seq，重新调用 msg_wait
```

### 3.3 SSE 事件订阅

通过 `GET /events` SSE 端点接收实时事件：
- `thread.created` / `thread.updated` / `thread.deleted`
- `msg.posted` / `msg.edited`
- `agent.registered` / `agent.unregistered` / `agent.online_changed`

---

## 4. UI/UX 设计

### 4.1 Sidebar (Tree View)

```
AgentChatBus
├── 📋 Threads
│   ├── 💬 discuss (3)
│   │   ├── 任务讨论: 实现新功能...
│   │   ├── 代码审查: API 优化
│   │   └── Bug 修复: 登录问题
│   ├── 🔧 implement (2)
│   └── ✅ done (5)
│
└── 👥 Agents
    ├── 🟢 Cursor (GPT-4)
    ├── 🟢 Claude Desktop (Sonnet)
    └── ⚫ VS Code (Claude)
```

### 4.2 Chat Panel (Webview)

```
┌─────────────────────────────────────────────────────────────┐
│  💬 任务讨论: 实现新功能                    [status: discuss] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Avatar A]  Cursor (GPT-4)                    10:30 AM     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 我来帮你分析这个需求。首先需要确认几个问题...        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Avatar B]  Claude Desktop                    10:32 AM     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 同意。我建议我们先列出所有需要修改的模块。          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Human]  你                                   10:35 AM     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 好的，我补充一下背景信息...                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [Type a message...]                          [📎] [Send]   │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 设计原则

- **暗色主题优先**: 与 VS Code 默认暗色主题融合
- **简洁高效**: 减少视觉噪音，专注消息内容
- **实时反馈**: 发送消息时显示加载状态
- **错误提示**: 连接失败、发送失败时清晰提示

---

## 5. 技术实现方案

### 5.1 扩展入口 (extension.ts)

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // 1. 注册 MCP Server Definition Provider
    const mcpProvider = new AgentChatBusMcpProvider();
    context.subscriptions.push(
        vscode.lm.registerMcpServerDefinitionProvider('agentchatbus', mcpProvider)
    );
    
    // 2. 注册 Tree View
    const threadsProvider = new ThreadsTreeProvider();
    const agentsProvider = new AgentsTreeProvider();
    
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('agentchatbus.threads', threadsProvider),
        vscode.window.registerTreeDataProvider('agentchatbus.agents', agentsProvider)
    );
    
    // 3. 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('agentchatbus.openThread', openThreadPanel),
        vscode.commands.registerCommand('agentchatbus.refresh', refreshAll)
    );
}
```

### 5.2 MCP 连接实现

```typescript
// 使用 VS Code 内置 MCP 支持，通过 SSE 连接
class AgentChatBusMcpProvider implements vscode.McpServerDefinitionProvider {
    provideMcpServerDefinitions(): vscode.ProviderResult<vscode.McpServerDefinition[]> {
        const config = vscode.workspace.getConfiguration('agentchatbus');
        const serverUrl = config.get<string>('serverUrl', 'http://127.0.0.1:39765');
        
        return [
            new vscode.McpHttpServerDefinition({
                label: 'AgentChatBus',
                uri: `${serverUrl}/sse`, // SSE transport
                version: '1.0.0'
            })
        ];
    }
}
```

### 5.3 直接 REST API 调用（备选方案）

如果 MCP Client API 功能受限，可直接调用 REST API：

```typescript
class ApiClient {
    private baseUrl: string;
    private eventSource: EventSource | null = null;
    
    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }
    
    async getThreads(): Promise<Thread[]> {
        const response = await fetch(`${this.baseUrl}/api/threads`);
        return response.json();
    }
    
    async getMessages(threadId: string, afterSeq?: number): Promise<Message[]> {
        const url = `${this.baseUrl}/api/threads/${threadId}/messages` +
            (afterSeq ? `?after_seq=${afterSeq}` : '');
        const response = await fetch(url);
        return response.json();
    }
    
    async sendMessage(threadId: string, content: string, syncContext: SyncContext): Promise<Message> {
        const response = await fetch(`${this.baseUrl}/api/threads/${threadId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                author: 'human',
                content,
                expected_last_seq: syncContext.current_seq,
                reply_token: syncContext.reply_token
            })
        });
        return response.json();
    }
    
    connectSSE(onMessage: (event: SSEEvent) => void): void {
        this.eventSource = new EventSource(`${this.baseUrl}/events`);
        this.eventSource.onmessage = (e) => {
            onMessage(JSON.parse(e.data));
        };
    }
}
```

### 5.4 Webview 实现

```typescript
class ChatPanel {
    private panel: vscode.WebviewPanel;
    
    constructor(thread: Thread, extensionUri: vscode.Uri) {
        this.panel = vscode.window.createWebviewPanel(
            'agentchatbus.chat',
            thread.topic,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        
        this.panel.webview.html = this.getHtml(thread);
        this.panel.webview.onDidReceiveMessage(this.handleMessage);
    }
    
    private getHtml(thread: Thread): string {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${thread.topic}</title>
            <style>
                /* VS Code 暗色主题适配 */
                body { 
                    background: var(--vscode-editor-background); 
                    color: var(--vscode-editor-foreground);
                }
                .message { /* ... */ }
                .input-box { /* ... */ }
            </style>
        </head>
        <body>
            <div id="messages"></div>
            <div class="input-area">
                <input type="text" id="messageInput" placeholder="Type a message...">
                <button onclick="sendMessage()">Send</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                // 消息渲染、发送逻辑
            </script>
        </body>
        </html>`;
    }
}
```

---

## 6. 配置项

### 6.1 扩展设置 (package.json contributes.configuration)

```json
{
    "agentchatbus.serverUrl": {
        "type": "string",
        "default": "http://127.0.0.1:39765",
        "description": "AgentChatBus 服务器地址"
    },
    "agentchatbus.autoReconnect": {
        "type": "boolean",
        "default": true,
        "description": "断线后自动重连"
    },
    "agentchatbus.refreshInterval": {
        "type": "number",
        "default": 30,
        "description": "Thread 列表刷新间隔（秒）"
    },
    "agentchatbus.showNotifications": {
        "type": "boolean",
        "default": true,
        "description": "新消息时显示通知"
    }
}
```

### 6.2 扩展激活事件

```json
{
    "activationEvents": [
        "onView:agentchatbus.threads",
        "onView:agentchatbus.agents",
        "onCommand:agentchatbus.openThread"
    ]
}
```

---

## 7. 项目结构

```
vscode-agentchatbus/
├── package.json              # 扩展清单
├── tsconfig.json             # TypeScript 配置
├── src/
│   ├── extension.ts          # 扩展入口
│   ├── mcp/
│   │   └── mcpProvider.ts    # MCP Server Provider
│   ├── api/
│   │   ├── client.ts         # REST API 客户端
│   │   └── types.ts          # 类型定义
│   ├── providers/
│   │   ├── threadsProvider.ts    # Thread Tree View Provider
│   │   └── agentsProvider.ts     # Agent Tree View Provider
│   ├── views/
│   │   └── chatPanel.ts      # Webview 聊天面板
│   └── utils/
│       └── config.ts         # 配置管理
├── media/
│   └── icon.png              # 扩展图标
└── README.md
```

---

## 8. 里程碑规划

### Phase 1: 基础框架
- [ ] 项目初始化（yo code）
- [ ] 基础 API 客户端实现
- [ ] Tree View 骨架（Thread/Agent 列表）

### Phase 2: 核心功能
- [ ] Thread 列表展示
- [ ] 消息列表展示
- [ ] 消息发送功能
- [ ] SSE 实时更新

### Phase 3: 体验优化
- [ ] 暗色主题适配
- [ ] 错误处理完善
- [ ] 加载状态指示
- [ ] 配置项支持

### Phase 4: 扩展功能
- [ ] 消息回复/反应
- [ ] 通知集成
- [ ] 快捷键支持
- [ ] 国际化支持

---

## 9. 风险与挑战

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| VS Code MCP API 功能受限 | 可能无法完全通过 MCP 实现所有功能 | 保留 REST API 直接调用作为备选方案 |
| Webview 性能 | 大量消息时可能卡顿 | 实现虚拟滚动、消息分页加载 |
| SSE 连接稳定性 | 网络问题导致断线 | 自动重连机制 + 心跳检测 |
| 消息同步复杂性 | `reply_token` 机制需要精确管理 | 封装 SyncContext 类统一管理 |

---

## 10. 参考资料

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code MCP Developer Guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [AgentChatBus REST API 文档](../docs/reference/)
- [AgentChatBus MCP Tools 文档](../docs/guides/mcp-tools.md)
