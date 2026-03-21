#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const binEntry = path.join(packageRoot, "bin", "agentchatbus-server.cjs");
const distEntry = path.join(packageRoot, "dist", "cli", "index.js");
const webUiIndex = path.join(packageRoot, "web-ui", "index.html");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
    server.on("error", reject);
  });
}

async function waitForHttpOk(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function waitForStreamMatch(stream, pattern, timeoutMs) {
  let buffer = "";

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for pattern ${pattern}.\nCaptured output:\n${buffer}`));
    }, timeoutMs);

    const onData = (chunk) => {
      buffer += chunk.toString();
      if (pattern.test(buffer)) {
        cleanup();
        resolve(buffer);
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      stream.off("data", onData);
      stream.off("error", onError);
    };

    stream.on("data", onData);
    stream.on("error", onError);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill();

  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);

  if (child.exitCode === null) {
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
        stdio: "ignore",
        windowsHide: true,
      });
      await new Promise((resolve) => killer.once("exit", resolve));
    } else {
      child.kill("SIGKILL");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
}

function spawnWrapper(args, extraEnv = {}) {
  return spawn(process.execPath, [binEntry, ...args], {
    cwd: packageRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...extraEnv,
    },
    windowsHide: true,
  });
}

async function runServeSmokeTest() {
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "agentchatbus-server-smoke-"));
  const appDir = path.join(tmpRoot, "app");
  const dbPath = path.join(appDir, "bus.db");
  const configPath = path.join(appDir, "config.json");
  await fsp.mkdir(appDir, { recursive: true });
  const port = await getFreePort();

  let stdout = "";
  let stderr = "";
  const child = spawnWrapper(["serve"], {
    AGENTCHATBUS_HOST: "127.0.0.1",
    AGENTCHATBUS_PORT: String(port),
    AGENTCHATBUS_DB: dbPath,
    AGENTCHATBUS_APP_DIR: appDir,
    AGENTCHATBUS_CONFIG_FILE: configPath,
    AGENTCHATBUS_BOOTSTRAP_DEFAULT_THREAD: "1",
  });

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const healthResponse = await waitForHttpOk(`http://127.0.0.1:${port}/health`, 8000);
    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.status, "ok");

    const staticResponse = await waitForHttpOk(`http://127.0.0.1:${port}/static/index.html`, 4000);
    const staticHtml = await staticResponse.text();
    assert.match(staticHtml, /AgentChatBus/i);
    assert.match(stdout, /serve mode listening on 127\.0\.0\.1:/);
  } catch (error) {
    assert.fail(
      `Serve smoke test failed.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}\nERROR:\n${error instanceof Error ? error.stack || error.message : String(error)}`
    );
  } finally {
    await stopChild(child);
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  }
}

async function runStdioSmokeTest() {
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "agentchatbus-stdio-smoke-"));
  const child = spawnWrapper(["stdio"], {
    AGENTCHATBUS_DB: ":memory:",
    AGENTCHATBUS_APP_DIR: tmpRoot,
    AGENTCHATBUS_CONFIG_FILE: path.join(tmpRoot, "config.json"),
  });

  try {
    const stderr = await waitForStreamMatch(child.stderr, /\[agentchatbus-ts\] stdio mode started/, 5000);
    assert.match(stderr, /stdio mode started/);
  } catch (error) {
    assert.fail(error instanceof Error ? error.message : String(error));
  } finally {
    await stopChild(child);
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  }
}

async function main() {
  assert.ok(fs.existsSync(binEntry), "wrapper bin entry is missing");
  assert.ok(fs.existsSync(distEntry), "packaged CLI bundle is missing; run `npm run prepare-package` first");
  assert.ok(fs.existsSync(webUiIndex), "packaged web UI is missing; run `npm run prepare-package` first");

  await runServeSmokeTest();
  await runStdioSmokeTest();
  console.log("[smoke-test] standalone wrapper passed serve and stdio smoke tests.");
}

main().catch((error) => {
  console.error("[smoke-test] failed:", error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
