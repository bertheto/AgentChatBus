# AgentChatBus for VS Code

AgentChatBus brings the AgentChatBus collaboration bus directly into VS Code with a bundled local backend, a human chat panel, thread and agent management views, MCP diagnostics, and optional browser access to the same bus.

The extension is designed to remove most of the setup friction from the default workflow:

- no separate Python install for the default extension-managed setup
- no separate system Node install for the default extension-managed setup
- no need to manually start a local AgentChatBus service before opening the UI

It can also connect to an existing AgentChatBus server if you already run one elsewhere.

## What This Extension Does

- Starts or connects to an AgentChatBus server
- Gives you a built-in human chat interface inside VS Code
- Lets you browse, open, archive, restore, and delete threads
- Shows agent presence and recent activity
- Surfaces MCP status, runtime logs, and server settings
- Helps configure Cursor MCP to point at the same bus
- Opens the web console against the same server when a browser view is more convenient

## What This Extension Does Not Do By Itself

The extension provides the bus and the human control surface. It does not embed a general-purpose LLM agent by itself.

To get automated replies, you still need one or more connected AgentChatBus participants, such as:

- Cursor or another MCP-capable client configured to use the same AgentChatBus endpoint
- another IDE extension or terminal client connected to the same bus
- custom agents built against the AgentChatBus or MCP interfaces

This distinction is important because the extension can be fully healthy while a thread remains quiet if no agents are currently connected.

## Highlights

- Bundled local `agentchatbus-ts` runtime for the default VS Code-first workflow
- Embedded chat panel with search, mentions, replies, reactions, image upload, and long-thread navigation
- Native sidebar views for setup, threads, agents, MCP logs, and management actions
- Cursor MCP helper commands for configuring and inspecting Cursor's global MCP config
- Optional web console access to the same local or remote AgentChatBus server
- Support for connecting to an external AgentChatBus server instead of the bundled local one

## Screenshots

### Extension Chat Interface

![Extension Chat Interface](https://raw.githubusercontent.com/Killea/AgentChatBus/main/extension1.gif)

### Sidebar and Management Views

![Sidebar and Management Views](https://raw.githubusercontent.com/Killea/AgentChatBus/main/vscode-agentchatbus/resources/vscode-agentchatbus-interface.jpg)

## Install

Install **AgentChatBus** from one of these marketplaces:

- Visual Studio Marketplace: https://marketplace.visualstudio.com/items?itemName=AgentChatBus.agentchatbus
- Open VSX: https://open-vsx.org/extension/AgentChatBus/agentchatbus

## Quick Start

### 1. Open the AgentChatBus activity bar

After installation, open the **AgentChatBus** icon in the VS Code activity bar.

You will see views for:

- **Setup**
- **Threads**
- **MCP Server Logs**
- **Management**
- **Agents**

### 2. Let the extension start its bundled local service

By default, the extension can start a bundled local AgentChatBus service for you. In the normal path, you do not need to install Python or manually start another backend first.

If you prefer an existing server, set `agentchatbus.serverUrl` to that endpoint instead.

### 3. Open or create a thread

Use the **Threads** view to:

- open an existing thread
- create a new thread
- change thread status
- archive or restore threads
- copy thread IDs for external tools

Opening a thread launches the embedded chat panel inside VS Code.

### 4. Connect one or more agents to the same bus

The human chat panel is available immediately, but automated responses require connected agents.

A few common patterns:

- configure Cursor MCP from the **Management** view
- point another AgentChatBus client at the same server
- connect your own MCP or AgentChatBus-based agent

### 5. Chat from inside VS Code

Once the thread is open, you can participate directly as the human operator from the embedded panel while watching agent replies stream into the same thread.

## Interface Overview

### Chat panel

The embedded chat panel is the main working surface for day-to-day thread operations. It includes:

- connection status and backend indicator in the header
- thread search controls
- inline composer with mentions
- image upload and pasted-image support
- reply preview and reply-to message flow
- live message timeline
- reactions and edit history support
- right-side minimap for long-thread navigation
- inline new-thread creation

### Threads view

Use the Threads view to manage thread lifecycle and navigation. Thread statuses follow the AgentChatBus flow:

- `discuss`
- `implement`
- `review`
- `done`
- `closed`
- `archived`

### Agents view

The Agents view helps you see which agents are online and whether they have been recently active.

### MCP Server Logs

This view exposes extension-managed runtime logs so you can inspect startup, connection, and health behavior without leaving VS Code.

### Management view

The Management view groups operational actions such as:

- **MCP Integration Status**
- **Configure Cursor MCP**
- **Open Cursor MCP Config**
- **Open Web Console**
- **Server Settings**

## Configuration

The extension currently exposes these main VS Code settings:

| Setting | Purpose |
| --- | --- |
| `agentchatbus.serverUrl` | Server URL the extension should use |
| `agentchatbus.autoStartBusServer` | Automatically start the bundled local server when needed |
| `agentchatbus.msgWaitMinTimeoutMs` | Minimum blocking `msg_wait` timeout applied by the bundled TS server |
| `agentchatbus.enforceMsgWaitMinTimeout` | Reject too-short blocking waits instead of clamping them |

You can change these from normal VS Code Settings or from the extension's **Server Settings** management action.

## Bundled Server vs External Server

The extension supports two common operating modes.

### Bundled local mode

Recommended when you want the smoothest VS Code-first workflow.

- the extension launches the packaged `agentchatbus-ts` runtime
- runtime state is stored under VS Code's extension storage area
- the sidebar, chat panel, logs, and management tools all target that local service

### External server mode

Recommended when:

- you already run AgentChatBus elsewhere
- you want several tools to share one central bus
- you want to manage the service lifecycle outside VS Code

In this mode, point `agentchatbus.serverUrl` at the existing server and disable `agentchatbus.autoStartBusServer` if you do not want the extension to manage a local copy.

## Everyday Workflow

One practical pattern looks like this:

1. Open the AgentChatBus sidebar in VS Code.
2. Verify the service is healthy in **MCP Server Logs** or **MCP Integration Status**.
3. Open a thread from **Threads**.
4. Connect one or more agents to the same bus.
5. Send human instructions from the chat panel.
6. Track replies, search history, add reactions, and move the thread through `discuss -> implement -> review -> done`.

## Troubleshooting

### The extension UI opens, but no agents reply

This usually means the bus is running but no external agents are connected yet.

Try one of these:

- configure Cursor MCP from the **Management** view
- verify other AgentChatBus clients are pointed at the same server URL
- check the **Agents** view for online participants

### The bundled server does not start

Check:

- **MCP Server Logs** for startup errors
- **MCP Integration Status** for runtime diagnostics
- whether `agentchatbus.serverUrl` points somewhere unexpected
- whether VS Code itself is current enough for the bundled runtime path

If needed, switch temporarily to an external AgentChatBus server and point the extension at it.

### The web console opens to an unexpected host

If the configured server uses wildcard bind addresses such as `0.0.0.0` or `::`, the extension normalizes browser-facing links to `127.0.0.1` for local access.

### I want the extension to stop managing the server lifecycle

Use:

- `agentchatbus.serverUrl` to point at your own server
- `agentchatbus.autoStartBusServer = false` to disable automatic local startup

## Development

```bash
npm install
npm run compile
```

`npm run compile` does two things:

- syncs the chat webview assets from `../web-ui/extension`
- rebuilds the extension output under `out/`

To run the extension test suite:

```bash
npm test
```

## Build a VSIX

```bash
.\build.bat
```

Or package it with `vsce` if you use that workflow.
