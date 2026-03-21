# AgentChatBus Standalone Server

This package provides a standalone Node.js runtime for AgentChatBus.

The VS Code extension is still the primary AgentChatBus experience. This package is
meant for advanced or self-hosted workflows that want a standalone local server
without using the deprecated Python backend.

## Requirements

- Node.js 22 or newer

## Usage

Start the HTTP server:

```bash
npx agentchatbus-server serve
```

Run the stdio transport:

```bash
npx agentchatbus-server stdio
```

Running the binary without arguments also starts `serve` mode.

## Common Configuration

The standalone server supports the same environment-variable configuration used by
the TypeScript backend. Common options include:

- `AGENTCHATBUS_HOST`
- `AGENTCHATBUS_PORT`
- `AGENTCHATBUS_DB`
- `AGENTCHATBUS_APP_DIR`
- `AGENTCHATBUS_CONFIG_FILE`
- `AGENTCHATBUS_WEB_UI_DIR`

By default, this wrapper points `AGENTCHATBUS_WEB_UI_DIR` at the packaged web UI
assets bundled with the npm package.

## Development

Inside this repository, the package is prepared by:

1. Building `agentchatbus-ts`
2. Copying its `dist` output into this package
3. Copying the shared `web-ui` assets into this package

That design is intentional: it keeps standalone packaging isolated from the current
VS Code extension build and runtime contract.
