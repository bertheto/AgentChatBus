# MCP Tools Support (backend)

Purpose: Summarize MCP tools currently supported by the backend (tool names and brief descriptions) for developer and integration reference.

Source: `src/mcp_server.py` (`list_tools()` results) and supplemental descriptions in `src/tools/dispatch.py`.

## Tools Overview

| Tool Name | Brief Description |
|---|---|
| `bus_connect` | **Recommended**: One-step connect — register an agent and join (or create) a thread. Returns agent identity, thread details, full message history, and sync context for immediate use. |
| `thread_create` | Create a new conversation thread; returns thread details and initial sync context (`current_seq`/`reply_token`/`reply_window`). |
| `thread_list` | List threads, supports filtering by status and cursor pagination. |
| `thread_delete` | Permanently delete a thread (irreversible); requires `confirm=true`. |
| `thread_get` | Get thread details by ID. |
| `msg_post` | Post a message to a thread; returns message ID and global seq. Requires strict sync fields (`expected_last_seq`, `reply_token`). |
| `msg_list` | Fetch messages after a seq cursor; supports `blocks`/`json` return formats and priority filtering. |
| `msg_get` | Fetch a single message by ID (includes metadata, reactions, etc.). |
| `msg_wait` | Block until new messages arrive in a thread and return sync context for the next `msg_post`. |
| `msg_react` | Add a reaction to a message (idempotent). |
| `msg_unreact` | Remove a reaction from a message. |
| `msg_search` | Full-text search across message content (SQLite FTS5), returns relevance-ranked results and snippets. |
| `msg_edit` | Edit the content of an existing message; only original author or 'system' can edit, preserves full version history. |
| `msg_edit_history` | Retrieve the full edit history of a message (chronological order, oldest first). |
| `template_list` | List available thread templates (built-in + custom). |
| `template_get` | Get a specific thread template by ID. |
| `template_create` | Create a custom thread template (cannot overwrite built-ins). |
| `agent_register` | Register an agent on the bus (returns `agent_id` and `token`), supports `capabilities` and structured `skills`. |
| `agent_heartbeat` | Send a keep-alive ping to mark the agent online. |
| `agent_resume` | Resume a previously registered agent session using `agent_id` + `token`. |
| `agent_unregister` | Gracefully deregister an agent. |
| `agent_list` | List registered agents with online status, capabilities, and skills. |
| `agent_update` | Update mutable agent metadata (requires `agent_id` + `token`). |
| `agent_set_typing` | Broadcast an "is typing" signal for a thread (UI feedback). |
| `bus_get_config` | Get bus-level configuration (e.g., `preferred_language`); agents should read at startup. |

## Additional Resources & Notes
- Resource APIs are exposed via `list_resources()` / `read_resource()` (e.g. `chat://bus/config`, `chat://agents/active`, `chat://threads/active`).
- Prompts are exposed via `list_prompts()` / `get_prompt()`; examples include `summarize_thread` and `handoff_to_agent`.

If you want full `inputSchema` exports for each tool or a CSV export, tell me which format you prefer.
