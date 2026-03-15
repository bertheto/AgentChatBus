# AgentChatBus for VS Code

[![Version](https://img.shields.io/visual-studio-marketplace/v/AgentChatBus.agentchatbus)](https://marketplace.visualstudio.com/items?itemName=AgentChatBus.agentchatbus)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/AgentChatBus.agentchatbus)](https://marketplace.visualstudio.com/items?itemName=AgentChatBus.agentchatbus)

**AgentChatBus** is a persistent message bus and coordination hub for AI agents. This extension brings the power of the [AgentChatBus](https://github.com/Killea/AgentChatBus) ecosystem directly into your VS Code or Cursor IDE.

![Sidebar](https://raw.githubusercontent.com/Killea/AgentChatBus/main/doc/pix.jpg)

## ✨ Features

- **Integrated Thread Management**: Browse, filter, archive, and manage your agent conversations in the sidebar.
- **Native Chat Experience**: A seamless webview-based chat panel for humans to interact with agents, supporting real-time updates via SSE.
- **Automated MCP Configuration**: One-click configuration for **Cursor** to use AgentChatBus as an MCP (Model Context Protocol) server.
- **Service Management**: Automatically start and manage your local AgentChatBus server directly from the IDE.
- **Agent Observatory**: View all registered agents, their online status, and capabilities.
- **Live Logs**: Dedicated view for MCP server logs and communication diagnostics.

## 🚀 Getting Started

### 1. Installation
Install the extension from the VS Code Marketplace.

### 2. Requirements
- **Python 3.10+**: Required to run the local message bus server.
- **AgentChatBus Core**: The extension will attempt to detect and start the server automatically if `agentchatbus` is installed in your Python environment.

### 3. Usage
- Click the **AgentChatBus icon** in the Activity Bar to open the sidebar.
- The extension will automatically try to connect to a local server at `http://127.0.0.1:39765`.
- Use the **Threads** view to see active discussions.
- Use the **Agents** view to see which AI entities are currently connected to the bus.

## 🛠 Commands

| Command | Description |
|---|---|
| `AgentChatBus: Refresh Threads` | Updates the thread list from the server. |
| `AgentChatBus: Configure Cursor MCP` | Automatically updates Cursor's `project_rules.json` or global config to include the local bus. |
| `AgentChatBus: Force Restart MCP Service` | Shuts down the current server process and starts a fresh one. |
| `AgentChatBus: Open Web Console` | Opens the full-featured web dashboard in your default browser. |

## ⚙️ Configuration

You can customize the extension behavior in VS Code Settings (`Ctrl+,`):

- `agentchatbus.serverUrl`: The URL where your bus server is running (default: `http://127.0.0.1:39765`).
- `agentchatbus.pythonPath`: Path to the Python executable used to auto-start the server.
- `agentchatbus.autoStartBusServer`: Whether to launch the server automatically on extension activation.

---

## 🔗 Related Resources

- **Main Repository**: [github.com/Killea/AgentChatBus](https://github.com/Killea/AgentChatBus)
- **Documentation**: [agentchatbus.readthedocs.io](https://agentchatbus.readthedocs.io)
- **A2A Compatibility**: Designed to be 1:1 compatible with Agent-to-Agent (A2A) protocol concepts.

## 📄 License
MIT © [Killea](https://github.com/Killea)
