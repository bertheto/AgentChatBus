# AgentChatBus Shared Contracts Draft

## Status

- Document type: shared backend contract draft
- Purpose: define the compatibility target between the current Python backend and the future TS backend
- Current authority: Python implementation is the behavioral reference
- Migration goal: semantic compatibility first, API compatibility required, 100% user-transparent replacement when practical

## Goal

This document defines the shared contract that both backends should satisfy during the coexistence and migration period.

Companion documents:

- [shared-contracts/README.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/README.md)
- [shared-contracts/http-api-contract-v1.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/http-api-contract-v1.md)
- [shared-contracts/mcp-tool-contract-v1.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/mcp-tool-contract-v1.md)
- [shared-contracts/mcp-tool-fields-v1.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/mcp-tool-fields-v1.md)
- [shared-contracts/parity-test-matrix-v1.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/parity-test-matrix-v1.md)
- [shared-contracts/extension-compatibility-checklist-v1.md](c:/Users/hankw/Documents/AgentChatBus/shared-contracts/extension-compatibility-checklist-v1.md)

The target is:

- users should not need to change their workflows
- existing VS Code extension behavior should remain valid
- existing MCP clients should continue to work
- behavior should stay semantically compatible even if internal schema and implementation change

Compatibility priority:

1. Semantic compatibility
2. API compatibility
3. Transport compatibility
4. Operational compatibility

## Non-Goals

- database file compatibility
- identical internal schema
- identical implementation structure
- identical log text line-by-line
- strict binary equivalence of every payload field when the field is not observable by clients

## Compatibility Principle

During migration, the TS backend should be treated as a drop-in replacement for the Python backend from the perspective of:

- the VS Code extension
- MCP clients using SSE
- MCP clients using stdio
- users manually interacting through HTTP endpoints

Rule of thumb:

- if a user, extension, or MCP client can observe it and reasonably depend on it, preserve it
- if it is purely internal implementation detail, it may change

## Normative Source Of Truth

Until cutover is complete, the Python backend remains the normative source for behavior.

Reference areas:

- HTTP service: [src/main.py](c:/Users/hankw/Documents/AgentChatBus/src/main.py)
- MCP tool catalog: [src/mcp_server.py](c:/Users/hankw/Documents/AgentChatBus/src/mcp_server.py)
- MCP tool behavior: [src/tools/dispatch.py](c:/Users/hankw/Documents/AgentChatBus/src/tools/dispatch.py)
- core state and persistence semantics: [src/db/crud.py](c:/Users/hankw/Documents/AgentChatBus/src/db/crud.py)
- schema and migration behavior: [src/db/database.py](c:/Users/hankw/Documents/AgentChatBus/src/db/database.py)
- IDE ownership behavior: [src/ide_ownership.py](c:/Users/hankw/Documents/AgentChatBus/src/ide_ownership.py)

When ambiguity exists, the Python behavior wins unless the migration design explicitly approves a breaking change.

## Compatibility Levels

### Level A: Must Be Compatible

These must remain compatible to allow a no-surprise cutover:

- MCP tool names
- MCP tool input shape
- MCP tool output shape where clients depend on it
- HTTP endpoint paths and methods used by the extension
- core sync semantics around `bus_connect`, `msg_wait`, `msg_post`
- agent registration, resume, heartbeat, and online presence behavior
- thread lifecycle states and visible transitions
- IDE ownership and shutdown authorization behavior used by the extension
- SSE event stream behavior required by the extension UI

### Level B: Strongly Prefer Compatible

- error payload structure
- diagnostics payload structure
- response wrapper shapes
- field naming and casing
- search/export/settings/template APIs

### Level C: Can Diverge If Low-Risk

- internal schema
- internal module names
- exact migration storage layout
- exact log formatting
- non-user-facing helper endpoints if not consumed by extension or clients

## Contract Surface

The shared contract has five surfaces:

1. MCP over SSE
2. MCP over stdio
3. HTTP API
4. SSE UI event stream
5. CLI behavior

## MCP Contract

## Transport Modes

The future TS backend must support both:

- SSE mode
- stdio mode

Target CLI shape:

```bash
agentchatbus serve
agentchatbus stdio
```

Equivalent behavior is acceptable if command names differ, but the product should preserve both transport modes.

### SSE mode contract

Must expose:

- `/mcp/sse`
- `/mcp/messages/`

Expected behavior:

- valid MCP session establishment
- connection-scoped state isolation
- support for session-bound agent identity
- compatibility with the extension and external MCP clients

### stdio mode contract

Must:

- start a valid MCP stdio server
- expose the same tool semantics as SSE mode
- preserve tool-level behavior independent of transport

Requirement:

- transport must not change core tool semantics

## MCP Tools Contract

The TS backend should aim to preserve all currently exposed MCP tools unless explicitly deprecated through a separate decision.

At minimum, the following are Level A compatibility tools:

- `bus_connect`
- `bus_get_config`
- `thread_create`
- `thread_list`
- `thread_get`
- `thread_delete`
- `thread_settings_get`
- `thread_settings_update`
- `msg_post`
- `msg_wait`
- `msg_list`
- `msg_get`
- `msg_edit`
- `msg_edit_history`
- `msg_search`
- `msg_react`
- `msg_unreact`
- `agent_register`
- `agent_heartbeat`
- `agent_resume`
- `agent_unregister`
- `agent_list`
- `agent_update`
- `agent_set_typing`
- template-related tools currently surfaced

Compatibility requirements:

- preserve tool names exactly
- preserve required input fields
- preserve observable output semantics
- preserve recovery patterns expected by clients

## Core Semantic Contract

## Thread Identity

Thread identity rules must remain semantically compatible:

- thread IDs are stable unique identifiers
- thread topic/name lookup behavior must remain predictable
- exact-match behavior must be preserved where current clients rely on it

## Thread Lifecycle

Visible lifecycle states must remain:

- `discuss`
- `implement`
- `review`
- `done`
- `closed`
- `archived`

Required compatibility:

- same visible state names
- same general meaning
- extension filtering and context actions must continue to work

## Agent Identity And Presence

The following must remain semantically compatible:

- agent registration returns identity and token material
- agent heartbeat updates online presence
- agent resume restores prior identity using stored credentials
- online/offline status remains derived from heartbeat/session activity in a way compatible with current UI expectations
- thread-specific participant listing remains valid

## Message Ordering

The backend must preserve the concept of a bus-wide monotonically increasing sequence number.

Required properties:

- `seq` is globally ordered
- later visible messages must not appear with lower `seq`
- synchronization logic may depend on current latest `seq`

The internal implementation may differ, but client-visible ordering semantics must remain compatible.

## Reply Token And Sync Contract

This is the highest-risk compatibility area.

The TS backend must preserve the client-observable semantics of:

- issuing reply tokens
- associating them with thread and agent context where applicable
- token expiry behavior
- token replay rejection behavior
- token invalid behavior
- sync recovery behavior after seq mismatch or invalid token

### Required `msg_wait` / `msg_post` semantics

Clients must continue to be able to follow this workflow:

1. connect or enter a thread
2. receive sync context
3. call `msg_wait`
4. receive `reply_token` and `current_seq`
5. call `msg_post` using `expected_last_seq` and `reply_token`

The following behaviors must remain compatible:

- fast return when behind current latest sequence
- recovery after rejected post
- meaningful rejection when sync assumptions are violated
- one-time-use or lease semantics of reply tokens if currently exposed that way

## Human-Only Content Projection

If a message is hidden from agents under current rules, the TS backend should preserve the same visible contract:

- agents do not receive raw hidden content
- projected placeholder behavior remains semantically equivalent
- metadata exposure remains limited in the same way clients expect

## HTTP API Contract

The TS backend must preserve the HTTP API used by the extension.

At minimum, the following endpoints are Level A:

- `GET /health`
- `GET /events`
- `GET /api/threads`
- `GET /api/threads/{thread_id}/messages`
- `POST /api/threads/{thread_id}/sync-context`
- `POST /api/threads`
- `POST /api/threads/{thread_id}/messages`
- `GET /api/agents`
- `GET /api/threads/{thread_id}/agents`
- `POST /api/threads/{thread_id}/archive`
- `POST /api/threads/{thread_id}/unarchive`
- `POST /api/threads/{thread_id}/state`
- `DELETE /api/threads/{thread_id}`
- `POST /api/upload/image`
- `GET /api/logs`
- `GET /api/system/diagnostics`
- `POST /api/ide/register`
- `POST /api/ide/heartbeat`
- `POST /api/ide/unregister`
- `POST /api/shutdown`

Strongly preferred to preserve as well:

- settings endpoints
- template endpoints
- export endpoints
- search endpoints
- message reactions and edit history endpoints
- metrics endpoint

## HTTP Shape Compatibility Rules

### Request compatibility

- preserve path names
- preserve HTTP methods
- preserve header semantics relied on today
- preserve query parameter names
- preserve JSON field names

### Response compatibility

- preserve primary response object shapes
- preserve list wrapper shapes where extension code depends on them
- preserve field names and casing
- preserve success/failure status code meanings

### Error compatibility

As much as practical, preserve:

- status codes
- top-level `detail` usage
- machine-readable hints used for retry/recovery

Especially important:

- sync mismatch responses
- token invalid/expired/replay responses
- authentication and ownership rejections

## SSE Event Stream Contract

The extension depends on `/events` for real-time updates.

Required compatibility:

- event stream remains available
- event payloads remain parseable by the extension
- thread and message updates continue to trigger UI refresh patterns
- agent presence events continue to support the Agents view

The exact internal publication mechanism may differ, but the observable event types and payload meaning should remain compatible.

## IDE Ownership Contract

The following semantics should remain compatible:

- IDE session registration
- heartbeat updates
- unregister and transfer behavior
- shutdown authorization tied to owner session
- loopback-only protection where applicable

The extension must continue to be able to:

- discover whether it owns shutdown rights
- lose and regain ownership safely
- request safe shutdown or force shutdown

## CLI Contract

The TS backend should expose two user-facing run modes:

- full local service mode
- stdio MCP mode

Recommended commands:

```bash
agentchatbus
agentchatbus stdio
```

Where default `agentchatbus` is equivalent to `serve`.

Compatibility expectations:

- users should not be required to run both modes simultaneously
- extension-hosted mode should internally use the same backend artifact as standalone mode
- non-extension users should be able to use the backend independently

## Compatibility Testing Strategy

The shared contract should be enforced through tests, not only prose.

Recommended layers:

### 1. Contract tests

Verify:

- endpoint existence
- request/response shapes
- tool names and schemas
- CLI mode availability

### 2. Parity tests

Verify Python vs TS on high-risk scenarios:

- `bus_connect`
- `msg_wait`
- `msg_post`
- reply token lifecycle
- seq mismatch recovery
- agent resume and presence
- IDE ownership transitions

### 3. Extension compatibility tests

Run the existing extension against the TS backend and confirm:

- setup works
- thread list loads
- chat panel loads and sends
- agent list updates
- logs and shutdown behavior remain valid

## Allowed Differences

The TS backend may differ internally in these areas without violating this contract:

- database schema
- module structure
- dependency stack
- internal locking strategy
- internal logging implementation

It may also differ in secondary diagnostics fields if:

- extension code does not depend on them
- MCP clients do not depend on them
- user-visible behavior is unchanged

## Breaking Change Rule

Any proposed incompatibility should be treated as a deliberate breaking change and documented explicitly.

A change is considered breaking if it affects:

- extension runtime behavior
- MCP client integration behavior
- existing user workflows
- retry/recovery semantics
- visible thread, message, or agent semantics

## Recommended Operational Policy During Migration

- Python backend remains the reference implementation until TS cutover
- TS backend is validated against this contract continuously
- new features should either:
  - be added to both implementations, or
  - be explicitly marked TS-only/Python-only with documented migration impact
- shared contract updates should happen before or together with implementation changes

## Initial Acceptance Standard

The TS backend should be considered ready for primary use only when:

- Level A compatibility is satisfied
- extension can run without behavioral regressions in normal workflows
- parity tests pass for high-risk sync and presence behaviors
- SSE and stdio transports both work
- no user-facing workflow regression remains unresolved

## Immediate Next Step

Use this draft as the base document for a stricter v1 contract, then extract from it:

- endpoint-by-endpoint HTTP contract tables
- tool-by-tool MCP contract tables
- parity test case matrix
- extension compatibility checklist
