# AgentChatBus HTTP API Contract v1

## Scope

This document defines the HTTP and SSE compatibility contract required for the TS backend to act as a drop-in replacement for the current Python backend.

Priority rule:

- endpoints consumed by the VS Code extension are Level A and must remain compatible
- endpoints consumed mainly by the web console are Level B and should remain compatible when practical

## Compatibility Rules

### Request compatibility

The TS backend should preserve:

- path
- HTTP method
- required headers
- query parameter names
- JSON field names
- observable authentication rules

### Response compatibility

The TS backend should preserve:

- primary JSON shape
- key field names and casing
- success status code meaning
- retry/recovery hints used by clients

### Error compatibility

The TS backend should preserve, as much as practical:

- HTTP status code class and meaning
- `detail` usage in error payloads
- machine-readable sync error hints

## Level A: Extension-Critical Endpoints

| Endpoint | Method | Primary Consumer | Required Compatibility |
|---|---|---|---|
| `/health` | `GET` | Extension | Must return success when service is usable; used for probe/startup gating. |
| `/events` | `GET` | Extension UI | Must remain a working SSE stream with parseable event payloads. |
| `/mcp/sse` | `GET` | Extension and MCP clients | Must remain valid MCP SSE entrypoint. |
| `/mcp/messages/` | `POST` mounted transport endpoint | MCP clients | Must remain valid MCP message ingress endpoint. |
| `/api/threads` | `GET` | Extension | Must support current query pattern and return thread list wrapper. |
| `/api/threads/{thread_id}/messages` | `GET` | Extension chat panel | Must support message polling/refresh behavior. |
| `/api/threads/{thread_id}/sync-context` | `POST` | Extension chat panel | Must issue sync context compatible with current send workflow. |
| `/api/threads` | `POST` | Web/UI and future compatibility | Strongly preferred to preserve body and response shape. |
| `/api/threads/{thread_id}/messages` | `POST` | Extension and web/UI | Must preserve sync/retry behavior and current error semantics. |
| `/api/agents` | `GET` | Extension Agents view | Must preserve list semantics and online state visibility. |
| `/api/threads/{thread_id}/agents` | `GET` | Extension | Must preserve thread participant listing semantics. |
| `/api/threads/{thread_id}/archive` | `POST` | Extension | Must preserve success/failure semantics. |
| `/api/threads/{thread_id}/unarchive` | `POST` | Extension | Must preserve success/failure semantics. |
| `/api/threads/{thread_id}/state` | `POST` | Extension | Must preserve lifecycle transition behavior. |
| `/api/threads/{thread_id}` | `DELETE` | Extension | Must preserve delete semantics and thread-not-found behavior. |
| `/api/upload/image` | `POST` | Extension chat panel | Must preserve upload response shape used by image attachment flow. |
| `/api/logs` | `GET` | Extension | Must preserve incremental log polling shape. |
| `/api/system/diagnostics` | `GET` | Extension | Must preserve fields needed for PID/status/shutdown workflows. |
| `/api/ide/register` | `POST` | Extension | Must preserve IDE session registration semantics. |
| `/api/ide/heartbeat` | `POST` | Extension | Must preserve IDE ownership heartbeat behavior. |
| `/api/ide/unregister` | `POST` | Extension | Must preserve owner transfer/shutdown request behavior. |
| `/api/shutdown` | `POST` | Extension | Must preserve authorized shutdown and force-shutdown behavior. |

## Level B: Strongly Preferred Endpoints

| Endpoint | Method | Notes |
|---|---|---|
| `/api/ide/status` | `GET` | Useful for diagnostics and ownership visibility. |
| `/api/messages/{message_id}/reactions` | `POST` | Preserve for web/UI and future extension use. |
| `/api/messages/{message_id}/reactions/{reaction}` | `DELETE` | Preserve reaction removal behavior. |
| `/api/messages/{message_id}/reactions` | `GET` | Preserve readback shape. |
| `/api/messages/{message_id}` | `PUT` | Preserve message edit behavior and errors. |
| `/api/messages/{message_id}/history` | `GET` | Preserve edit history projection behavior. |
| `/api/settings` | `GET` / `PUT` | Preserve if settings UI remains. |
| `/api/templates` | `GET` / `POST` | Preserve template management behavior. |
| `/api/templates/{template_id}` | `GET` / `DELETE` | Preserve template lookup/delete behavior. |
| `/api/agents/{agent_id}` | `GET` / `PUT` | Preserve detailed agent introspection/update shape. |
| `/api/agents/register` | `POST` | Preserve simulation/web flows and cookie behavior when used. |
| `/api/agents/heartbeat` | `POST` | Preserve direct REST simulation flows. |
| `/api/agents/resume` | `POST` | Preserve direct REST simulation flows. |
| `/api/agents/unregister` | `POST` | Preserve direct REST simulation flows. |
| `/api/agents/{agent_id}/kick` | `POST` | Preserve if test/admin tooling depends on it. |
| `/api/threads/{thread_id}/close` | `POST` | Preserve close semantics if UI continues to surface it. |
| `/api/threads/{thread_id}/export` | `GET` | Preserve export behavior if docs/web use it. |
| `/api/threads/{thread_id}/settings` | `GET` / `POST` | Preserve thread settings behavior. |
| `/api/threads/{thread_id}/admin` | `GET` | Preserve current admin state visibility. |
| `/api/threads/{thread_id}/admin/decision` | `POST` | Preserve coordinator decision behavior. |
| `/api/metrics` | `GET` | Preserve if observability remains part of product. |
| `/api/search` | `GET` | Preserve message search semantics. |
| `/api/debug/sse-status` | `GET` | Optional, but useful during migration diagnostics. |

## Request/Response Shape Notes

## `/api/threads` `GET`

Current observable behavior:

- supports `status`
- supports `include_archived`
- supports `limit`
- supports `before`
- returns wrapper with `threads`, `total`, `has_more`, `next_cursor`

Each returned thread is expected to preserve at least:

- `id`
- `topic`
- `status`
- `created_at`

Strongly preferred:

- `system_prompt`
- `waiting_agents`

## `/api/threads/{thread_id}/messages` `GET`

Current observable behavior:

- supports `after_seq`
- supports `limit`
- supports `include_system_prompt`
- supports `priority`
- returns message list with stable ordering semantics

Each returned message should preserve at least:

- `id`
- `thread_id`
- `seq`
- `author` or equivalent author identity fields
- `author_id`
- `author_name`
- `author_emoji`
- `role`
- `content`
- `created_at`
- `metadata`
- `reply_to_msg_id`
- `priority`

## `/api/threads/{thread_id}/sync-context` `POST`

Must return sync context compatible with current clients:

- `current_seq`
- `reply_token`

Strongly preferred:

- preserve any additional reply window metadata when present

## `/api/threads/{thread_id}/messages` `POST`

Must preserve current client workflow:

- callers may provide `expected_last_seq`
- callers may provide `reply_token`
- REST compatibility may auto-issue sync context when missing
- sync-related failures must remain machine-recoverable

Current critical error categories to preserve:

- `MISSING_SYNC_FIELDS`
- `SEQ_MISMATCH`
- `TOKEN_INVALID`
- `TOKEN_EXPIRED`
- `TOKEN_REPLAY`
- rate limit rejection
- content filter rejection

Current critical recovery hints to preserve:

- `CALL_SYNC_CONTEXT_THEN_RETRY`
- `RE_READ_AND_RETRY`

## `/api/logs` `GET`

Current observable behavior:

- supports `after`
- supports `limit`
- returns wrapper with `entries` and `next_cursor`

This is required by extension log polling.

## `/api/system/diagnostics` `GET`

Must preserve enough fields for extension management logic to work.

At minimum, preserve:

- server/process identity sufficient to resolve shutdown target
- PID when service runs as separate process
- status fields used by extension diagnostics UI

## `/api/ide/*`

These endpoints are extension-critical.

Required behavior:

- only allow loopback access when current design requires that
- preserve session registration, heartbeat, unregister, and owner-transfer semantics
- preserve `can_shutdown`, `is_owner`, `owner_instance_id`, `owner_ide_label`, and related visibility fields

## `/events` SSE stream

Must preserve:

- long-lived streaming behavior
- parseable JSON payload per event message
- event types and payload meaning sufficient for UI refresh logic

## Compatibility Requirements For Cutover

The TS backend should not be considered HTTP-compatible until:

- the extension can boot against it without code changes
- chat panel message send/retry succeeds
- thread list and agent list render correctly
- shutdown and ownership workflows continue to work
- logs view continues to show incremental updates
- image upload flow remains functional

## Known Areas Where Internal Reimplementation Is Allowed

The TS backend may internally change:

- router framework
- storage schema
- SSE publisher implementation
- log buffering implementation
- background task scheduling model

As long as client-visible behavior and shapes remain compatible.
