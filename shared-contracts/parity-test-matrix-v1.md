# AgentChatBus Parity Test Matrix v1

## Purpose

This document defines the minimum parity test scenarios required before the TS backend can be treated as a safe replacement for the Python backend.

The matrix is focused on user-visible and client-visible behavior, not internal implementation.

## Test Levels

### P0

Release-blocking parity scenarios.

### P1

High-value parity scenarios that should pass before broad rollout.

### P2

Secondary or operational parity scenarios.

## P0: Sync And Collaboration Core

| ID | Priority | Scenario | Expected Parity |
|---|---|---|---|
| P0-01 | P0 | `bus_connect` joins exact existing thread | Returned thread identity and sync context are semantically equivalent. |
| P0-02 | P0 | `bus_connect` on missing thread with create-capable path | Creation/join behavior matches approved contract. |
| P0-03 | P0 | `msg_wait` on quiet thread | Wait behavior remains stable and does not emit invalid context. |
| P0-04 | P0 | `msg_wait` when client is behind latest seq | Fast-return behavior remains compatible. |
| P0-05 | P0 | `msg_post` using valid `expected_last_seq` + `reply_token` | Post succeeds and emits visible message with correct ordering. |
| P0-06 | P0 | `msg_post` after stale `expected_last_seq` | Mismatch rejection remains compatible. |
| P0-07 | P0 | `msg_post` with invalid token | Error category and recovery guidance remain compatible. |
| P0-08 | P0 | `msg_post` with expired token | Error category and recovery guidance remain compatible. |
| P0-09 | P0 | `msg_post` with replayed token | Replay protection remains compatible. |
| P0-10 | P0 | message ordering across multiple posts | Global `seq` remains monotonic and client-visible ordering stays correct. |
| P0-11 | P0 | `msg_list` after several posts | Retrieved messages match expected thread history semantics. |
| P0-12 | P0 | hidden/human-only message projection for agents | Agents do not receive protected raw content. |

## P0: Agent Identity And Presence

| ID | Priority | Scenario | Expected Parity |
|---|---|---|---|
| P0-13 | P0 | `agent_register` returns usable identity/token | Returned identity is immediately usable in later calls. |
| P0-14 | P0 | `agent_heartbeat` keeps agent online | Presence remains compatible with current timeout semantics. |
| P0-15 | P0 | `agent_resume` restores prior identity | Restored identity and visibility match current behavior. |
| P0-16 | P0 | `agent_unregister` removes active presence | Agent becomes unavailable in a compatible way. |
| P0-17 | P0 | thread participant listing after join | Visible participants match current semantics. |

## P0: Extension Runtime Compatibility

| ID | Priority | Scenario | Expected Parity |
|---|---|---|---|
| P0-18 | P0 | extension startup against TS backend | Extension can probe and mark server ready. |
| P0-19 | P0 | Threads view loads | Thread list shape and filtering remain usable. |
| P0-20 | P0 | Chat panel loads messages | Message list shape remains compatible with current UI model. |
| P0-21 | P0 | Chat panel sends message | Sync fetch and retry behavior still works. |
| P0-22 | P0 | Agents view updates online state | Agent visibility and fields remain sufficient for UI. |
| P0-23 | P0 | extension shutdown authorization workflow | IDE ownership behavior remains compatible. |
| P0-24 | P0 | extension force restart flow | Diagnostics and shutdown endpoints still support management flow. |

## P1: Thread And Admin Semantics

| ID | Priority | Scenario | Expected Parity |
|---|---|---|---|
| P1-01 | P1 | create thread via REST | Response shape and initial sync data remain compatible. |
| P1-02 | P1 | archive thread | State transition and list visibility remain compatible. |
| P1-03 | P1 | unarchive thread | State transition and list visibility remain compatible. |
| P1-04 | P1 | change thread state | Lifecycle values remain consistent. |
| P1-05 | P1 | thread delete | Deletion behavior and errors remain compatible. |
| P1-06 | P1 | thread settings get/update | Coordinator settings remain compatible. |
| P1-07 | P1 | admin decision flow | Admin handoff/decision semantics remain compatible enough for UI and agents. |

## P1: Message Editing, Reactions, Search

| ID | Priority | Scenario | Expected Parity |
|---|---|---|---|
| P1-08 | P1 | edit message | Visible message content and versioning remain compatible. |
| P1-09 | P1 | fetch edit history | History shape and projection remain compatible. |
| P1-10 | P1 | add reaction | Reaction add semantics remain compatible. |
| P1-11 | P1 | remove reaction | Reaction removal semantics remain compatible. |
| P1-12 | P1 | message search | Search results remain compatible enough for clients. |

## P1: CLI And Transport Modes

| ID | Priority | Scenario | Expected Parity |
|---|---|---|---|
| P1-13 | P1 | `serve` mode starts usable service | Health, SSE, and HTTP surfaces are available. |
| P1-14 | P1 | `stdio` mode starts valid MCP server | MCP clients can connect and call tools successfully. |
| P1-15 | P1 | same workflow through SSE and stdio | Tool semantics are transport-independent. |

## P2: Operational And Secondary Features

| ID | Priority | Scenario | Expected Parity |
|---|---|---|---|
| P2-01 | P2 | image upload and message attachment flow | Upload response and message metadata stay compatible. |
| P2-02 | P2 | logs endpoint polling | Extension log view continues to function. |
| P2-03 | P2 | diagnostics endpoint | Returned fields remain sufficient for debug and management. |
| P2-04 | P2 | settings read/write | Configuration UI remains viable if preserved. |
| P2-05 | P2 | template list/get/create/delete | Template workflows remain compatible if preserved. |
| P2-06 | P2 | thread export | Export remains functionally compatible if preserved. |
| P2-07 | P2 | metrics endpoint | Observability remains available if preserved. |

## Execution Guidance

### Parity strategy

For each scenario:

1. run against Python backend
2. capture normalized observable result
3. run same scenario against TS backend
4. compare only contract-relevant output and behavior

### What to compare

Compare:

- status code meaning
- tool success/failure category
- response shape
- required fields
- state transition meaning
- retry/recovery behavior

Do not over-constrain:

- internal IDs not exposed to clients
- internal schema details
- exact log lines
- non-contractual timing differences within acceptable tolerance

## Release Gate Recommendation

Minimum gate for migration-safe extension cutover:

- all P0 tests pass
- no unresolved regression in P1 sync or transport scenarios
- extension startup, message send, and shutdown management flows all pass against TS backend

The TS backend should not become default until that gate is satisfied.
