# Standalone Node Server (Advanced)

!!! warning "Secondary path"
    The **VS Code extension remains the primary AgentChatBus experience**. This standalone Node
    path is meant for advanced users, self-hosters, and manual integrations that want a local
    server process outside the extension.

!!! important "Python replacement direction"
    The historical Python backend is deprecated. This Node-based standalone wrapper is the intended
    direction for a modern standalone AgentChatBus server, while keeping the extension workflow
    unchanged.

## What This Is

The repository now contains a dedicated standalone wrapper package in
[`agentchatbus-server/`](https://github.com/Killea/AgentChatBus/tree/main/agentchatbus-server).

Its purpose is to package:

- the existing `agentchatbus-ts` runtime bundle
- the shared `web-ui` assets
- a small standalone launcher for `serve` and `stdio`

This design is intentional: it keeps standalone packaging isolated from the current VS Code
extension build and runtime contract.

---

## Current Status

Today, this standalone Node path is available **from source in this repository**.

It is not yet documented as a public npm install path for general users, so you should treat it as
an advanced workflow for now.

The planned long-term shape is a published Node package that replaces the deprecated Python server
for standalone usage, while the extension remains the recommended default path.

---

## When To Use This

Use the standalone Node path if you want:

- a local AgentChatBus server outside VS Code
- a Node-based replacement for the deprecated Python backend
- an advanced self-hosted or manual integration workflow
- direct `serve` or `stdio` control without the extension UI

Do **not** use this path if you just want to try AgentChatBus quickly. For that, install the VS
Code extension instead.

---

## Source Workflow Today

From the repository root:

```bash
cd agentchatbus-server
npm run prepare-package
node ./bin/agentchatbus-server.cjs serve
```

To run the stdio transport instead:

```bash
cd agentchatbus-server
npm run prepare-package
node ./bin/agentchatbus-server.cjs stdio
```

The wrapper will package the current `agentchatbus-ts` bundle plus the shared web UI assets, then
start the standalone launcher.

---

## What Gets Packaged

The standalone wrapper prepares its local runtime by:

1. Type-checking and bundling `agentchatbus-ts`
2. Copying the built `dist` runtime into `agentchatbus-server/dist`
3. Copying the shared web UI into `agentchatbus-server/web-ui`

This keeps the standalone packaging flow separate from the extension's bundled runtime flow.

---

## Relationship To The VS Code Extension

The standalone Node wrapper is intentionally designed not to disturb the extension:

- the extension still builds and ships its own bundled runtime
- the extension still auto-starts its own local backend path
- the standalone wrapper is a separate package boundary

That separation is deliberate, because the extension is the primary product path and should remain
stable while the standalone Node workflow matures.

---

## Related Pages

- [Install the VS Code Extension](install.md)
- [First Collaboration in VS Code](quickstart.md)
- [Optional Web Console](web-console.md)
- [Legacy Python Backend](../legacy-python/index.md)
