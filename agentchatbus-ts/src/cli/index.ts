import { logError } from "../shared/logger.js";
import { logInfo } from "../shared/logger.js";
import { setLaunchOverride } from "../core/config/launchOverrides.js";
import { CONFIG_REGISTRY, getConfigDescriptorByEnvVar, getConfigDescriptorByKey } from "../core/config/registry.js";

function parseKeyValue(input: string): { key: string; value: string } | null {
  const raw = String(input || "");
  const idx = raw.indexOf("=");
  if (idx <= 0) return null;
  const key = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1);
  if (!key) return null;
  return { key, value };
}

function applyLaunchOverridesFromArgv(argv: string[]): void {
  // Supported:
  // - --set KEY=VALUE      (KEY is config key like HOST, PORT, MSG_WAIT_TIMEOUT, ... OR an env var)
  // - --set-env ENV=VALUE  (ENV must be an env var; recommended for clarity)
  // - --set=KEY=VALUE / --set-env=ENV=VALUE
  //
  // Any key set here is considered "locked" in the settings manifest (readonly in Web UI).
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    let mode: "set" | "set-env" | null = null;
    let payload: string | null = null;

    if (arg === "--set") {
      mode = "set";
      payload = String(argv[i + 1] || "");
      i++;
    } else if (arg.startsWith("--set=")) {
      mode = "set";
      payload = arg.slice("--set=".length);
    } else if (arg === "--set-env") {
      mode = "set-env";
      payload = String(argv[i + 1] || "");
      i++;
    } else if (arg.startsWith("--set-env=")) {
      mode = "set-env";
      payload = arg.slice("--set-env=".length);
    } else {
      continue;
    }

    const kv = parseKeyValue(payload || "");
    if (!kv) {
      logError(`invalid override (expected KEY=VALUE): ${payload}`);
      continue;
    }

    const key = kv.key;
    const value = kv.value;

    // 1) Prefer explicit env var.
    let envVar: string | undefined;
    if (mode === "set-env") {
      const desc = getConfigDescriptorByEnvVar(key);
      envVar = desc?.envVar || (key.startsWith("AGENTCHATBUS_") ? key : undefined);
    } else {
      // 2) Allow config key (HOST, PORT, ...) or env var name.
      const descByKey = getConfigDescriptorByKey(key);
      if (descByKey) {
        envVar = descByKey.envVar;
      } else {
        const descByEnv = getConfigDescriptorByEnvVar(key);
        envVar = descByEnv?.envVar || (key.startsWith("AGENTCHATBUS_") ? key : undefined);
      }
    }

    if (!envVar) {
      logError(`unknown config key/env var for override: ${key}`);
      continue;
    }

    setLaunchOverride(envVar, value);
    logInfo(`launch override: ${envVar}=${value}`);
  }

  // Also support direct flags for convenience:
  // - --host 0.0.0.0 / --host=0.0.0.0
  // - --port 39765 / --port=39765
  // - --agent-heartbeat-timeout 60
  // - boolean flags: --expose-thread-resources (defaults to true if no value)
  //
  // Flag names are derived from config keys: MSG_WAIT_TIMEOUT -> --msg-wait-timeout
  const aliasToEnvVar = new Map<string, { envVar: string; type: string }>();
  for (const desc of CONFIG_REGISTRY) {
    const alias = String(desc.key).toLowerCase().replace(/_/g, "-");
    aliasToEnvVar.set(alias, { envVar: desc.envVar, type: desc.type });
    aliasToEnvVar.set(String(desc.key).toLowerCase(), { envVar: desc.envVar, type: desc.type }); // allow --host as well as --HOST via normalization
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (!arg.startsWith("--") || arg.startsWith("--set") || arg.startsWith("--set-env")) {
      continue;
    }

    const rawName = arg.slice(2);
    if (!rawName) continue;

    let name = rawName;
    let inlineValue: string | undefined;
    const eqIdx = rawName.indexOf("=");
    if (eqIdx > 0) {
      name = rawName.slice(0, eqIdx);
      inlineValue = rawName.slice(eqIdx + 1);
    }

    const normalized = name.trim().toLowerCase();
    if (normalized === "help" || normalized === "h") {
      continue;
    }

    const match = aliasToEnvVar.get(normalized);
    if (!match) {
      continue;
    }

    const envVar = match.envVar;
    const type = match.type;

    let value: string | undefined = inlineValue;
    if (value === undefined) {
      const next = String(argv[i + 1] || "");
      const nextLooksLikeFlag = next.startsWith("--");
      if (type === "boolean") {
        // `--flag` means true; `--flag false` is also supported.
        value = (!next || nextLooksLikeFlag) ? "true" : next;
        if (!nextLooksLikeFlag && next) {
          i++;
        }
      } else {
        if (!next || nextLooksLikeFlag) {
          logError(`missing value for ${arg}`);
          continue;
        }
        value = next;
        i++;
      }
    }

    setLaunchOverride(envVar, value);
    logInfo(`launch override: ${envVar}=${value}`);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] || "serve";

  // NOTE: We apply overrides BEFORE importing the transports/config env facade
  // because some modules capture getConfig() values at import time.
  applyLaunchOverridesFromArgv(process.argv.slice(3));

  if (mode === "serve") {
    const { runServe } = await import("./serve.js");
    await runServe();
    return;
  }

  if (mode === "stdio") {
    const { runStdio } = await import("./stdio.js");
    await runStdio();
    return;
  }

  logError(`unknown mode: ${mode}`);
  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  logError(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
