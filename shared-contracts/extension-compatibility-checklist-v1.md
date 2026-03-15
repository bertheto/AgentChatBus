# AgentChatBus Extension Compatibility Checklist v1

## Purpose

This checklist defines the minimum compatibility conditions required for the existing VS Code extension to run against the TS backend without user-visible workflow regressions.

The goal is user-transparent cutover.

## Acceptance Rule

The TS backend is not extension-compatible until all blocking checklist items are satisfied.

## Startup And Detection

| Item | Priority | Requirement |
|---|---|---|
| EC-01 | Blocking | Extension can probe `GET /health` successfully. |
| EC-02 | Blocking | Extension can mark backend as ready without code changes. |
| EC-03 | Blocking | Extension can connect MCP definition to `/mcp/sse`. |
| EC-04 | Blocking | If backend is extension-managed, startup is reliable on supported platforms. |
| EC-05 | High | Diagnostics endpoint returns enough information for status panel and process management. |

## Threads View

| Item | Priority | Requirement |
|---|---|---|
| EC-06 | Blocking | `GET /api/threads` returns parseable wrapper with `threads`, `total`, `has_more`, `next_cursor`. |
| EC-07 | Blocking | Each thread row provides `id`, `topic`, `status`, `created_at`. |
| EC-08 | High | Archived thread filtering remains compatible. |
| EC-09 | High | Thread state changes via `/api/threads/{thread_id}/state` remain compatible. |
| EC-10 | High | Archive and unarchive actions remain compatible. |
| EC-11 | High | Thread deletion remains compatible. |

## Chat Panel

| Item | Priority | Requirement |
|---|---|---|
| EC-12 | Blocking | `GET /api/threads/{thread_id}/messages` returns compatible message shape. |
| EC-13 | Blocking | `POST /api/threads/{thread_id}/sync-context` returns `current_seq` and `reply_token`. |
| EC-14 | Blocking | `POST /api/threads/{thread_id}/messages` supports current retry flow. |
| EC-15 | Blocking | Sync mismatch and token errors still drive automatic client recovery. |
| EC-16 | High | `author_id`, `author_name`, `author_emoji`, `reply_to_msg_id`, `metadata`, `priority` remain usable. |
| EC-17 | High | Image upload and image message metadata remain compatible. |

## Agents View

| Item | Priority | Requirement |
|---|---|---|
| EC-18 | Blocking | `GET /api/agents` returns compatible list shape. |
| EC-19 | Blocking | Online/offline state remains correct enough for current UI expectations. |
| EC-20 | High | `GET /api/threads/{thread_id}/agents` remains compatible. |
| EC-21 | High | Agent metadata fields displayed by UI remain available. |

## Logs And Management

| Item | Priority | Requirement |
|---|---|---|
| EC-22 | Blocking | `GET /api/logs` supports incremental polling via `after` and `limit`. |
| EC-23 | Blocking | `/api/ide/register`, `/api/ide/heartbeat`, `/api/ide/unregister` preserve ownership semantics. |
| EC-24 | Blocking | `/api/shutdown` preserves authorized and force-shutdown flows. |
| EC-25 | High | Status panel data remains sufficient for management UI. |
| EC-26 | High | Open Web Console behavior remains valid if web console is preserved. |

## SSE UI Events

| Item | Priority | Requirement |
|---|---|---|
| EC-27 | Blocking | `GET /events` remains a stable SSE stream. |
| EC-28 | Blocking | Event payloads remain parseable as JSON by the extension. |
| EC-29 | High | Thread and message changes still trigger view refresh patterns. |
| EC-30 | High | Agent presence changes still update the Agents view. |

## Restart And Ownership

| Item | Priority | Requirement |
|---|---|---|
| EC-31 | Blocking | Extension can resolve whether it owns shutdown rights. |
| EC-32 | Blocking | Restart flow remains safe when extension is owner. |
| EC-33 | High | Ownership transfer remains compatible when multiple IDE sessions exist. |
| EC-34 | High | External-service detection behavior remains supported if product keeps that mode. |

## Manual Validation Pass

Before declaring the TS backend extension-compatible, verify manually:

1. Open VS Code with the extension enabled.
2. Start the backend or let the extension start it.
3. Confirm Threads view loads.
4. Open a thread and load messages.
5. Send a message from the chat panel.
6. Upload an image if image support is preserved.
7. Confirm Agents view updates.
8. Confirm logs view updates.
9. Confirm archive/unarchive/state change actions work.
10. Confirm force restart/shutdown management still works.

## Recommended Gate

The backend should not replace Python as the extension default until:

- all blocking items pass
- no unresolved high-priority issue remains in chat send/retry flow
- ownership and shutdown flows are verified in real extension runtime
