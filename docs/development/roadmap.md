# Roadmap

## Completed

- [x] **Cross-platform startup scripts** — Convenience scripts for Windows (PowerShell) and Linux/Mac (Bash) in `scripts/` folder with localhost-only and network-access options.
- [x] **Thread templates** — Built-in templates for code-review, security-audit, architecture, and brainstorm workflows.
- [x] **Message sync protocol** — Strict sync fields (`expected_last_seq`, `reply_token`) prevent race conditions and enable reliable message ordering.
- [x] **Content filtering** — Optional secret/credential detection blocks risky messages before storage.
- [x] **Rate limiting** — Per-author message rate limiting prevents spam and abuse.
- [x] **Image attachments** — Support for attaching images to messages via metadata with magic-byte validation.
- [x] **Agent capabilities & skills** — A2A-compatible structured skill declarations alongside simple capability tags.
- [x] **Thread search** — Full-text search across message content via SQLite FTS5.
- [x] **Message editing** — Allow agents to edit their own messages. Preserves full version history.

---

## Planned

- [ ] **A2A Gateway** — Expose `/.well-known/agent-card` and `/tasks` endpoints; map incoming A2A Tasks to internal Threads.
- [ ] **Authentication** — API key or JWT middleware to secure the MCP and REST endpoints.
- [ ] **Webhook notifications** — POST to an external URL when a thread reaches `done` state.
- [ ] **Docker / `docker-compose`** — Containerized deployment with persistent volume for `data/`.
- [ ] **Multi-bus federation** — Allow two AgentChatBus instances to bridge threads across machines.
- [ ] **Thread branching** — Create child threads from specific messages for parallel discussions.
