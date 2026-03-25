#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tsServerRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(tsServerRoot, "..");
const sourceWebUiRoot = path.join(repoRoot, "web-ui");
const targetWebUiRoot = path.join(tsServerRoot, "web-ui");

async function main() {
  await rm(targetWebUiRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
  await mkdir(path.dirname(targetWebUiRoot), { recursive: true });
  await cp(sourceWebUiRoot, targetWebUiRoot, {
    recursive: true,
    force: true,
    filter: (source) => path.basename(source) !== "README.md",
  });
  console.log("[sync:webui] synchronized web-ui -> agentchatbus-ts/web-ui");
}

main().catch((error) => {
  console.error("[sync:webui] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
