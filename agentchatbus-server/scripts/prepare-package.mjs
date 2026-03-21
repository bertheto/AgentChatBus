#!/usr/bin/env node

import { access, cp, mkdir, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..");
const tsServerRoot = path.join(repoRoot, "agentchatbus-ts");
const tsDistRoot = path.join(tsServerRoot, "dist");
const webUiRoot = path.join(repoRoot, "web-ui");
const outputDistRoot = path.join(packageRoot, "dist");
const outputWebUiRoot = path.join(packageRoot, "web-ui");
const tsDistBackupRoot = path.join(packageRoot, ".tmp-ts-dist-backup");

async function ensureExists(targetPath, label) {
  try {
    await access(targetPath, fsConstants.F_OK);
  } catch {
    throw new Error(`${label} is missing: ${targetPath}`);
  }
}

async function runCommand(command, args, options = {}) {
  const { cwd, shell = false, stdio = "inherit", env = process.env } = options;

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell, stdio, env });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? -1}`));
    });
  });
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runTsServerBuild() {
  console.log("[prepare-package] type-checking agentchatbus-ts...");
  await runCommand("npm", ["run", "check"], {
    cwd: tsServerRoot,
    shell: process.platform === "win32",
  });

  const bundleEntry = path.join(tsDistRoot, "cli", "index.js");
  const packagedBundleEntry = path.join(outputDistRoot, "cli", "index.js");
  const backupSource = await pathExists(bundleEntry)
    ? tsDistRoot
    : (await pathExists(packagedBundleEntry) ? outputDistRoot : null);

  if (backupSource) {
    await rm(tsDistBackupRoot, { recursive: true, force: true });
    await cp(backupSource, tsDistBackupRoot, { recursive: true, force: true });
  }
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      console.log(`[prepare-package] bundling agentchatbus-ts (attempt ${attempt}/3)...`);
      await runCommand(process.execPath, ["./scripts/build-bundle.mjs"], {
        cwd: tsServerRoot,
        shell: false,
      });
      await rm(tsDistBackupRoot, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await delay(500 * attempt);
      }
    }
  }

  if (backupSource && await pathExists(tsDistBackupRoot)) {
    await rm(tsDistRoot, { recursive: true, force: true });
    await cp(tsDistBackupRoot, tsDistRoot, { recursive: true, force: true });
    await rm(tsDistBackupRoot, { recursive: true, force: true });
    console.warn(
      "[prepare-package] warning: bundling agentchatbus-ts failed after retries; " +
      "falling back to the existing dist/cli/index.js artifact."
    );
    return;
  }

  throw lastError || new Error("agentchatbus-ts bundling failed and no fallback dist artifact was found.");
}

async function replaceDirectory(source, target, label) {
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, {
    recursive: true,
    force: true,
    filter: (item) => path.basename(item) !== ".DS_Store",
  });
  console.log(`[prepare-package] copied ${label}: ${path.relative(packageRoot, target)}`);
}

async function main() {
  console.log("[prepare-package] building agentchatbus-ts...");
  await runTsServerBuild();

  await ensureExists(tsDistRoot, "TypeScript runtime dist");
  await ensureExists(path.join(tsDistRoot, "cli", "index.js"), "TypeScript runtime CLI bundle");
  await ensureExists(path.join(webUiRoot, "index.html"), "shared web UI");

  await replaceDirectory(tsDistRoot, outputDistRoot, "TypeScript runtime");
  await replaceDirectory(webUiRoot, outputWebUiRoot, "web UI");

  await ensureExists(path.join(outputDistRoot, "cli", "index.js"), "packaged CLI bundle");
  await ensureExists(path.join(outputWebUiRoot, "index.html"), "packaged web UI");
  console.log("[prepare-package] standalone package assets are ready.");
}

main().catch((error) => {
  console.error("[prepare-package] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
