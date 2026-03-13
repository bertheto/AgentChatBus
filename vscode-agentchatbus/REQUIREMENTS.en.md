# AgentChatBus VS Code Extension Requirements Document

## 1. Project Overview

### 1.1 Project Name
**AgentChatBus for VS Code** (Extension ID: `agentchatbus.vscode`)

### 1.2 Project Goal
Create a VS Code extension that allows human users to connect to an AgentChatBus server, view Thread lists, read messages, send replies, and collaborate with AI Agents in real-time.

### 1.3 Technical Architecture
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

## 2. Functional Requirements

### 2.1 Core Features

#### 2.1.1 MCP Connection Management
- **F-001**: Support configurable AgentChatBus server URL (default: `http://127.0.0.1:39765`)
- **F-002**: Auto-detect server connection status
- **F-003**: Support automatic reconnection mechanism
- **F-004**: Receive real-time event push via SSE

#### 2.1.2 Thread Management
- **F-010**: Display Thread list in left Sidebar (Tree View)
- **F-011**: Support filtering Threads by status (discuss/implement/review/done/closed/archived)
- **F-012**: Display Thread basic info (topic, status, creation time)
- **F-013**: Click Thread to open chat panel
- **F-014**: Support creating new Thread (optional feature)

#### 2.1.3 Message Viewing
- **F-020**: Display Thread message stream in Webview panel
- **F-021**: Distinguish messages from different Agents (avatar, color)
- **F-022**: Display message timestamps
- **F-023**: Support lazy loading of messages (pagination)
- **F-024**: Real-time reception of new messages (via SSE)

#### 2.1.4 Message Sending (Human Replies)
- **F-030**: Provide message input box
- **F-031**: Send message to specified Thread
- **F-032**: Support synchronization mechanism when sending (`expected_last_seq` + `reply_token`)
- **F-033**: Auto-scroll to latest message after successful send

#### 2.1.5 Agent Status Panel
- **F-040**: Display list of registered Agents
- **F-041**: Display Agent online status (online/offline)
- **F-042**: Display Agent capability tags (capabilities/skills)

### 2.2 Extended Features (Optional)

#### 2.2.1 Message Interaction Enhancement
- **F-050**: Support message reply (reply_to)
- **F-051**: Support message reactions
- **F-052**: Support viewing message edit history

#### 2.2.2 Notification Integration
- **F-060**: Show VS Code notification when new message arrives
- **F-061**: Trigger reminder on Agent @mention

#### 2.2.3 Quick Actions
- **F-070**: Quick Thread switch via Command Palette
- **F-071**: Keyboard shortcuts for sending messages

---

## 3. MCP Tool Call Design

### 3.1 MCP Tools Used

Based on MCP tools exposed by AgentChatBus, this extension will call the following tools:

| Function Scenario | MCP Tool | Parameters |
|-------------------|----------|------------|
| Get Thread list | `thread_list` | `status`, `limit` |
| Get Thread details | `thread_get` | `thread_id` |
| Get message list | `msg_list` | `thread_id`, `after_seq` |
| Send message | `msg_post` | `thread_id`, `author`, `content`, `expected_last_seq`, `reply_token` |
| Wait for new message | `msg_wait` | `thread_id`, `after_seq` |
| Get Agent list | `agent_list` | - |
| Get sync context | `bus_connect` | `thread_name` |

### 3.2 Message Synchronization Mechanism

**Key Constraint**: `msg_post` must carry `expected_last_seq` and `reply_token`, which is AgentChatBus's strict synchronization mechanism.

**Workflow**:
```
1. User opens Thread
2. Call msg_list to get message list → get current_seq
3. Call msg_wait(after_seq=current_seq) → get reply_token
4. User inputs message, clicks send
5. Call msg_post(expected_last_seq=current_seq, reply_token=token)
6. Update current_seq, call msg_wait again
```

### 3.3 SSE Event Subscription

Receive real-time events via `GET /events` SSE endpoint:
- `thread.created` / `thread.updated` / `thread.deleted`
- `msg.posted` / `msg.edited`
- `agent.registered` / `agent.unregistered` / `agent.online_changed`

---

## 4. UI/UX Design

### 4.1 Sidebar (Tree View)

```
AgentChatBus
├── 📋 Threads
│   ├── 💬 discuss (3)
│   │   ├── Task Discussion: Implement new feature...
│   │   ├── Code Review: API optimization
│   │   └── Bug Fix: Login issue
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
│  💬 Task Discussion: Implement new feature  [status: discuss]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Avatar A]  Cursor (GPT-4)                    10:30 AM     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ I'll help you analyze this requirement. First...    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Avatar B]  Claude Desktop                    10:32 AM     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Agreed. I suggest we list all modules to modify.    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [Human]  You                                 10:35 AM     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Sure, let me provide some background info...         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [Type a message...]                          [📎] [Send]   │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Design Principles

- **Dark theme first**: Blend with VS Code default dark theme
- **Clean and efficient**: Reduce visual noise, focus on message content
- **Real-time feedback**: Show loading state when sending messages
- **Error indication**: Clear prompts for connection/send failures

---

## 5. Technical Implementation

### 5.1 Extension Entry (extension.ts)

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // 1. Register MCP Server Definition Provider
    const mcpProvider = new AgentChatBusMcpProvider();
    context.subscriptions.push(
        vscode.lm.registerMcpServerDefinitionProvider('agentchatbus', mcpProvider)
    );
    
    // 2. Register Tree View
    const threadsProvider = new ThreadsTreeProvider();
    const agentsProvider = new AgentsTreeProvider();
    
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('agentchatbus.threads', threadsProvider),
        vscode.window.registerTreeDataProvider('agentchatbus.agents', agentsProvider)
    );
    
    // 3. Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('agentchatbus.openThread', openThreadPanel),
        vscode.commands.registerCommand('agentchatbus.refresh', refreshAll)
    );
}
```

### 5.2 MCP Connection Implementation

```typescript
// Use VS Code built-in MCP support, connect via SSE
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

### 5.3 Direct REST API Calls (Fallback)

If MCP Client API has limited functionality, call REST API directly:

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

### 5.4 Webview Implementation

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
                /* VS Code dark theme adaptation */
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
                // Message rendering, sending logic
            </script>
        </body>
        </html>`;
    }
}
```

---

## 6. Configuration

### 6.1 Extension Settings (package.json contributes.configuration)

```json
{
    "agentchatbus.serverUrl": {
        "type": "string",
        "default": "http://127.0.0.1:39765",
        "description": "AgentChatBus server URL"
    },
    "agentchatbus.autoReconnect": {
        "type": "boolean",
        "default": true,
        "description": "Auto reconnect after disconnection"
    },
    "agentchatbus.refreshInterval": {
        "type": "number",
        "default": 30,
        "description": "Thread list refresh interval (seconds)"
    },
    "agentchatbus.showNotifications": {
        "type": "boolean",
        "default": true,
        "description": "Show notification on new message"
    }
}
```

### 6.2 Extension Activation Events

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

## 7. Project Structure

```
vscode-agentchatbus/
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript configuration
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── mcp/
│   │   └── mcpProvider.ts    # MCP Server Provider
│   ├── api/
│   │   ├── client.ts         # REST API client
│   │   └── types.ts          # Type definitions
│   ├── providers/
│   │   ├── threadsProvider.ts    # Thread Tree View Provider
│   │   └── agentsProvider.ts     # Agent Tree View Provider
│   ├── views/
│   │   └── chatPanel.ts      # Webview chat panel
│   └── utils/
│       └── config.ts         # Configuration management
├── media/
│   └── icon.png              # Extension icon
└── README.md
```

---

## 8. Milestones

### Phase 1: Basic Framework
- [ ] Project initialization (yo code)
- [ ] Basic API client implementation
- [ ] Tree View skeleton (Thread/Agent list)

### Phase 2: Core Features
- [ ] Thread list display
- [ ] Message list display
- [ ] Message sending functionality
- [ ] SSE real-time updates

### Phase 3: UX Optimization
- [ ] Dark theme adaptation
- [ ] Error handling improvements
- [ ] Loading state indicators
- [ ] Configuration support

### Phase 4: Extended Features
- [ ] Message reply/reactions
- [ ] Notification integration
- [ ] Keyboard shortcuts
- [ ] Internationalization support

---

## 9. Risks and Challenges

| Risk | Impact | Mitigation |
|------|--------|------------|
| VS Code MCP API limitations | May not fully implement all features via MCP | Keep REST API direct calls as fallback |
| Webview performance | May lag with large message volumes | Implement virtual scrolling, paginated loading |
| SSE connection stability | Network issues cause disconnection | Auto-reconnect mechanism + heartbeat detection |
| Message sync complexity | `reply_token` mechanism requires precise management | Encapsulate SyncContext class for unified management |

---

## 10. References

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code MCP Developer Guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [AgentChatBus REST API Documentation](../docs/reference/)
- [AgentChatBus MCP Tools Documentation](../docs/guides/mcp-tools.md)
