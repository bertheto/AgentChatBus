#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..");
const distEntry = path.join(packageRoot, "dist", "cli", "index.js");
const packagedWebUiDir = path.join(packageRoot, "web-ui");

if (!fs.existsSync(distEntry)) {
  console.error("[agentchatbus-server] Missing runtime bundle. Run `npm run prepare-package` first.");
  process.exit(1);
}

const configuredWebUiDir = process.env.AGENTCHATBUS_WEB_UI_DIR || packagedWebUiDir;
if (!fs.existsSync(path.join(configuredWebUiDir, "index.html"))) {
  console.error(
    `[agentchatbus-server] Web UI assets were not found at ${configuredWebUiDir}. ` +
    "Run `npm run prepare-package` first or set AGENTCHATBUS_WEB_UI_DIR."
  );
  process.exit(1);
}

const child = spawn(process.execPath, [distEntry, ...process.argv.slice(2)], {
  cwd: packageRoot,
  env: {
    ...process.env,
    AGENTCHATBUS_WEB_UI_DIR: configuredWebUiDir,
  },
  stdio: "inherit",
  shell: false,
  windowsHide: true,
});

let shutdownRequested = false;

function requestShutdown(signal) {
  if (shutdownRequested) {
    return;
  }
  shutdownRequested = true;
  if (child.exitCode === null) {
    child.kill(signal);
    setTimeout(() => {
      if (child.exitCode === null) {
        process.exit(1);
      }
    }, 5000).unref();
    return;
  }
  process.exit(0);
}

process.on("SIGINT", () => requestShutdown("SIGINT"));
process.on("SIGTERM", () => requestShutdown("SIGTERM"));

child.on("error", (error) => {
  console.error(`[agentchatbus-server] Failed to launch runtime: ${error.message}`);
  process.exit(1);
});

child.on("close", (code, signal) => {
  if (shutdownRequested) {
    process.exit(0);
    return;
  }

  if (signal) {
    process.exit(1);
    return;
  }

  process.exit(code ?? 0);
});
