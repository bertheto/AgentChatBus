# AgentChatBus Shared Contracts

## Purpose

This directory defines the shared compatibility contract between the current Python backend and the future TS backend.

The intent is:

- preserve user-visible behavior
- preserve VS Code extension compatibility
- preserve MCP client compatibility
- allow internal implementation and schema changes when they are not observable

## Documents

- `backend-contract-draft.md`
  Top-level contract and migration policy.

- `http-api-contract-v1.md`
  HTTP and SSE endpoint contract for extension/runtime compatibility.

- `mcp-tool-contract-v1.md`
  MCP tool compatibility contract, including critical semantics for sync-sensitive tools.

- `mcp-tool-fields-v1.md`
  Field-level contract for the highest-risk MCP tools.

- `parity-test-matrix-v1.md`
  Test matrix for validating Python vs TS behavioral parity before cutover.

- `extension-compatibility-checklist-v1.md`
  Practical runtime checklist for switching the existing VS Code extension to the TS backend.

## Authority

Until cutover is explicitly approved, the Python backend remains the normative reference implementation.

Reference files:

- `src/main.py`
- `src/mcp_server.py`
- `src/tools/dispatch.py`
- `src/db/crud.py`
- `src/db/database.py`
- `src/ide_ownership.py`

## Usage

Recommended workflow:

1. Update `backend-contract-draft.md` when compatibility scope changes.
2. Update `http-api-contract-v1.md` and `mcp-tool-contract-v1.md` before changing TS behavior.
3. Add or update parity scenarios in `parity-test-matrix-v1.md` before declaring migration-safe behavior.
4. Treat undocumented incompatibility as a breaking change.
