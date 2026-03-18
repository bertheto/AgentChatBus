#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(extensionRoot, "..");

const extensionPackagePath = path.join(extensionRoot, "package.json");
const tsPackagePath = path.join(repoRoot, "agentchatbus-ts", "package.json");
const tsEnvPath = path.join(repoRoot, "agentchatbus-ts", "src", "core", "config", "env.ts");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function syncTsEnvVersion(filePath, version) {
  const source = readFileSync(filePath, "utf8");
  const pattern = /export const BUS_VERSION = "([^"]+)";/;
  if (!pattern.test(source)) {
    throw new Error(`Could not find BUS_VERSION constant in ${filePath}`);
  }
  const updated = source.replace(pattern, `export const BUS_VERSION = "${version}";`);
  writeFileSync(filePath, updated, "utf8");
}

function main() {
  const extensionPkg = readJson(extensionPackagePath);
  const version = String(extensionPkg.version || "").trim();
  if (!version) {
    throw new Error(`Extension version is missing in ${extensionPackagePath}`);
  }

  const tsPkg = readJson(tsPackagePath);
  tsPkg.version = version;
  writeJson(tsPackagePath, tsPkg);

  syncTsEnvVersion(tsEnvPath, version);

  console.log(`[sync-versions] extension=${version}`);
  console.log(`[sync-versions] updated ${tsPackagePath}`);
  console.log(`[sync-versions] updated ${tsEnvPath}`);
}

main();
