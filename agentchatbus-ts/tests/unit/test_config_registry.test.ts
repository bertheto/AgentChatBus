import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfigDescriptorByEnvVar } from "../../src/core/config/env.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(THIS_DIR, "../../src");

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if (entry.isFile() && [".ts", ".js"].includes(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("config registry coverage", () => {
  it("covers every AGENTCHATBUS env var referenced in src", () => {
    const envVars = new Set<string>();
    const pattern = /AGENTCHATBUS_[A-Z0-9_]+/g;

    for (const file of collectFiles(SRC_DIR)) {
      const content = readFileSync(file, "utf-8");
      const matches = content.match(pattern) || [];
      for (const envVar of matches) {
        envVars.add(envVar);
      }
    }

    const missing = [...envVars].filter((envVar) => !getConfigDescriptorByEnvVar(envVar));
    expect(missing).toEqual([]);
  });

  it("restricts direct AGENTCHATBUS env access to the config registry", () => {
    const pattern = /process\.env\.(AGENTCHATBUS_[A-Z0-9_]+)/g;
    const offenders: string[] = [];

    for (const file of collectFiles(SRC_DIR)) {
      const content = readFileSync(file, "utf-8");
      if (!pattern.test(content)) {
        continue;
      }
      const normalized = relative(SRC_DIR, file).replace(/\\/g, "/");
      if (normalized !== "core/config/registry.ts") {
        offenders.push(normalized);
      }
    }

    expect(offenders).toEqual([]);
  });
});
