import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import spawn from "cross-spawn";
import { getConfig } from "../config/registry.js";
import type { CliSessionAdapterId } from "./cliSessionManager.js";
import { WINDOWS_POWERSHELL } from "./adapters/constants.js";
import {
  resolveCodexHeadlessCommand,
} from "./adapters/codexHeadlessAdapter.js";
import {
  resolveCopilotHeadlessCommand,
} from "./adapters/copilotHeadlessAdapter.js";
import {
  resolveCursorAgentCommand,
} from "./adapters/cursorHeadlessAdapter.js";
import {
  resolveGeminiHeadlessCommand,
} from "./adapters/geminiHeadlessAdapter.js";
import {
  resolveClaudeCommand,
} from "./adapters/claudeHeadlessAdapter.js";

export type CliModelDiscoveryStrategy = "runtime" | "help" | "static";
export type CliModelDiscoveryStatus = "ready" | "error";

export type CliDiscoveredModel = {
  id: string;
  label: string;
  description?: string;
  hidden?: boolean;
  is_default?: boolean;
  default_reasoning_effort?: string;
  supported_reasoning_efforts?: Array<{
    id: string;
    label: string;
  }>;
};

export type CliModelDiscoveryEntry = {
  adapter: CliSessionAdapterId;
  status: CliModelDiscoveryStatus;
  strategy: CliModelDiscoveryStrategy;
  models: CliDiscoveredModel[];
  fetched_at: string;
  source_label: string;
  error?: string;
};

export type CliModelDiscoverySnapshot = {
  fetched_at: string | null;
  providers: Record<CliSessionAdapterId, CliModelDiscoveryEntry>;
};

type CommandSpec = {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type JsonRpcId = string | number;

type JsonRpcPendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type JsonRpcResponseEnvelope = {
  id?: JsonRpcId;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

const STATIC_MODELS: Record<CliSessionAdapterId, CliDiscoveredModel[]> = {
  cursor: [],
  copilot: [],
  claude: [
    { id: "sonnet", label: "sonnet" },
    { id: "opus", label: "opus" },
    { id: "haiku", label: "haiku" },
    { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
    { id: "claude-opus-4-6", label: "claude-opus-4-6" },
  ],
  codex: [
    { id: "gpt-5.4", label: "gpt-5.4" },
    { id: "gpt-5-mini", label: "gpt-5-mini" },
    { id: "gpt-5.3-codex", label: "gpt-5.3-codex" },
    { id: "gpt-5.2-codex", label: "gpt-5.2-codex" },
    { id: "gpt-5.2", label: "gpt-5.2" },
    { id: "gpt-5.1-codex-max", label: "gpt-5.1-codex-max" },
    { id: "gpt-5.1-codex-mini", label: "gpt-5.1-codex-mini" },
    { id: "gpt-4.1", label: "gpt-4.1" },
  ],
  gemini: [
    { id: "gemini-3.1-pro-preview", label: "gemini-3.1-pro-preview" },
    { id: "gemini-3-flash-preview", label: "gemini-3-flash-preview" },
    { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    { id: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite" },
  ],
};

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueModels(models: CliDiscoveredModel[]): CliDiscoveredModel[] {
  const seen = new Set<string>();
  const result: CliDiscoveredModel[] = [];
  for (const model of models) {
    const id = String(model.id || "").trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push({
      id,
      label: String(model.label || id).trim() || id,
      ...(typeof model.description === "string" && model.description.trim()
        ? { description: model.description.trim() }
        : {}),
      ...(typeof model.hidden === "boolean" ? { hidden: model.hidden } : {}),
      ...(typeof model.is_default === "boolean" ? { is_default: model.is_default } : {}),
      ...(typeof model.default_reasoning_effort === "string" && model.default_reasoning_effort.trim()
        ? { default_reasoning_effort: model.default_reasoning_effort.trim() }
        : {}),
      ...(Array.isArray(model.supported_reasoning_efforts)
        ? {
          supported_reasoning_efforts: model.supported_reasoning_efforts
            .map((option) => ({
              id: String(option?.id || "").trim(),
              label: String(option?.label || option?.id || "").trim(),
            }))
            .filter((option) => option.id),
        }
        : {}),
    });
  }
  return result;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractJsonRpcId(value: unknown): JsonRpcId | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return undefined;
}

function parseCodexModelListResult(value: unknown): CliDiscoveredModel[] {
  if (!isObjectRecord(value) || !Array.isArray(value.data)) {
    return [];
  }
  return uniqueModels(value.data.map((entry) => {
    const record = isObjectRecord(entry) ? entry : {};
    const supported = Array.isArray(record.supportedReasoningEfforts)
      ? record.supportedReasoningEfforts
      : [];
    const modelId = String(record.model || record.id || "").trim();
    return {
      id: modelId,
      label: String(record.displayName || modelId).trim() || modelId,
      description: typeof record.description === "string" ? record.description.trim() : undefined,
      hidden: typeof record.hidden === "boolean" ? record.hidden : undefined,
      is_default: typeof record.isDefault === "boolean" ? record.isDefault : undefined,
      default_reasoning_effort: typeof record.defaultReasoningEffort === "string"
        ? record.defaultReasoningEffort.trim()
        : undefined,
      supported_reasoning_efforts: supported.map((option) => {
        const optionRecord = isObjectRecord(option) ? option : {};
        const optionId = String(optionRecord.reasoningEffort || "").trim();
        return {
          id: optionId,
          label: String(optionRecord.description || optionId).trim() || optionId,
        };
      }).filter((option) => option.id),
    };
  }).filter((model) => model.id));
}

function buildStaticEntry(
  adapter: CliSessionAdapterId,
  fetchedAt = nowIso(),
  error?: string,
): CliModelDiscoveryEntry {
  return {
    adapter,
    status: error ? "error" : "ready",
    strategy: "static",
    models: uniqueModels(STATIC_MODELS[adapter] || []),
    fetched_at: fetchedAt,
    source_label: "Static fallback",
    ...(error ? { error } : {}),
  };
}

function createEmptySnapshot(): CliModelDiscoverySnapshot {
  const fetchedAt = null;
  return {
    fetched_at: fetchedAt,
    providers: {
      cursor: buildStaticEntry("cursor"),
      copilot: buildStaticEntry("copilot"),
      claude: buildStaticEntry("claude"),
      codex: buildStaticEntry("codex"),
      gemini: buildStaticEntry("gemini"),
    },
  };
}

async function runCommand(spec: CommandSpec): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const isPowerShellShim = isWindows && /\.ps1$/i.test(spec.command);
    const command = isWindows && isPowerShellShim ? WINDOWS_POWERSHELL : spec.command;
    const args = isWindows && isPowerShellShim
      ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", spec.command, ...spec.args]
      : spec.args;
    const env = { ...process.env, ...(spec.env || {}) };
    if (isWindows) {
      const commandDir = dirname(spec.command);
      if (commandDir && commandDir !== "." && existsSync(commandDir)) {
        const currentPath = String(env.Path || env.PATH || "");
        if (!currentPath.toLowerCase().includes(commandDir.toLowerCase())) {
          env.Path = `${commandDir};${currentPath}`;
          env.PATH = env.Path;
        }
      }
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      cwd: spec.cwd || process.cwd(),
      env,
      shell: false,
    });
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore best-effort timeout shutdown failures.
      }
      reject(new Error(`Timed out after ${spec.timeoutMs || 15000}ms`));
    }, spec.timeoutMs || 15000);

    const finalize = (result: CommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => fail(error));
    child.on("close", (code) => {
      finalize({
        exitCode: typeof code === "number" ? code : null,
        stdout,
        stderr,
      });
    });
  });
}

async function discoverCodexModelsViaAppServer(
  workspace: string,
): Promise<CliDiscoveredModel[]> {
  const command = resolveCodexHeadlessCommand();
  const child = spawn(command, ["app-server", "--listen", "stdio://"], {
    cwd: workspace,
    env: { ...process.env },
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });

  return await new Promise<CliDiscoveredModel[]>((resolve, reject) => {
    let settled = false;
    let nextRequestId = 1;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    const pending = new Map<string, JsonRpcPendingRequest>();

    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      for (const request of pending.values()) {
        clearTimeout(request.timer);
      }
      pending.clear();
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore best-effort shutdown failures.
      }
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const succeed = (models: CliDiscoveredModel[]): void => {
      if (settled) {
        return;
      }
      settled = true;
      for (const request of pending.values()) {
        clearTimeout(request.timer);
      }
      pending.clear();
      try {
        child.stdin.end();
      } catch {
        // Ignore best-effort shutdown failures.
      }
      setTimeout(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          // Ignore best-effort shutdown failures.
        }
      }, 50);
      resolve(models);
    };

    const writeMessage = (message: Record<string, unknown>): void => {
      if (child.stdin.destroyed || child.killed) {
        throw new Error("Codex app-server stdin is unavailable.");
      }
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const sendRequest = (method: string, params: unknown, timeoutMs = 15_000): Promise<unknown> => {
      const requestId = String(nextRequestId++);
      return new Promise((resolveRequest, rejectRequest) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          rejectRequest(new Error(`Timed out waiting for Codex app-server response to '${method}'.`));
        }, timeoutMs);
        pending.set(requestId, {
          resolve: resolveRequest,
          reject: rejectRequest,
          timer,
        });
        try {
          writeMessage({
            id: requestId,
            method,
            params,
          });
        } catch (error) {
          clearTimeout(timer);
          pending.delete(requestId);
          rejectRequest(error instanceof Error ? error : new Error(String(error)));
        }
      });
    };

    const sendNotification = (method: string, params?: unknown): void => {
      const message: Record<string, unknown> = { method };
      if (params !== undefined) {
        message.params = params;
      }
      writeMessage(message);
    };

    const handleStdoutLine = (line: string): void => {
      const trimmed = String(line || "").trim();
      if (!trimmed) {
        return;
      }
      let message: JsonRpcResponseEnvelope;
      try {
        message = JSON.parse(trimmed) as JsonRpcResponseEnvelope;
      } catch {
        return;
      }
      const id = extractJsonRpcId(message.id);
      if (id === undefined) {
        return;
      }
      const pendingRequest = pending.get(String(id));
      if (!pendingRequest) {
        return;
      }
      clearTimeout(pendingRequest.timer);
      pending.delete(String(id));
      if (message.error) {
        const detail = typeof message.error.message === "string"
          ? message.error.message
          : `JSON-RPC error ${String(message.error.code ?? "unknown")}`;
        pendingRequest.reject(new Error(detail));
        return;
      }
      pendingRequest.resolve(message.result);
    };

    const overallTimer = setTimeout(() => {
      const detail = stderrBuffer.trim()
        ? `Timed out discovering Codex models. stderr: ${stderrBuffer.trim()}`
        : "Timed out discovering Codex models.";
      fail(new Error(detail));
    }, 20_000);

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/g);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        handleStdoutLine(line);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(overallTimer);
      fail(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      clearTimeout(overallTimer);
      const stderrSummary = stderrBuffer.trim();
      fail(new Error(
        stderrSummary
          ? `Codex app-server exited before model discovery completed (code ${String(code)}): ${stderrSummary}`
          : `Codex app-server exited before model discovery completed (code ${String(code)}).`,
      ));
    });

    void (async () => {
      try {
        await sendRequest("initialize", {
          clientInfo: {
            name: "agentchatbus-ts-model-discovery",
            version: "1.0.0",
          },
          capabilities: {
            experimentalApi: true,
          },
        });
        sendNotification("initialized");

        const allModels: CliDiscoveredModel[] = [];
        let cursor: string | null = null;
        do {
          const response = await sendRequest("model/list", {
            includeHidden: false,
            cursor,
            limit: 100,
          });
          const models = parseCodexModelListResult(response);
          allModels.push(...models);
          cursor = isObjectRecord(response) && typeof response.nextCursor === "string"
            ? response.nextCursor
            : null;
        } while (cursor);

        clearTimeout(overallTimer);
        const normalized = uniqueModels(allModels);
        if (!normalized.length) {
          const stderrSummary = stderrBuffer.trim();
          throw new Error(
            stderrSummary
              ? `Codex model/list returned no models. stderr: ${stderrSummary}`
              : "Codex model/list returned no models.",
          );
        }
        succeed(normalized);
      } catch (error) {
        clearTimeout(overallTimer);
        fail(error);
      }
    })();
  });
}

function parseCursorModels(stdout: string): CliDiscoveredModel[] {
  return uniqueModels(
    String(stdout || "")
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line && !/^loading models/i.test(line) && !/^available models/i.test(line) && !/^tip:/i.test(line))
      .map((line) => {
        const match = line.match(/^([^\s]+)\s+-\s+(.+)$/);
        if (!match) {
          return null;
        }
        return {
          id: match[1].trim(),
          label: match[2].trim(),
        };
      })
      .filter((value): value is CliDiscoveredModel => Boolean(value)),
  );
}

function parseCopilotModels(stdout: string): CliDiscoveredModel[] {
  const lines = String(stdout || "").split(/\r?\n/g);
  const models: CliDiscoveredModel[] = [];
  let inModelSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inModelSection && models.length > 0) {
        break;
      }
      continue;
    }
    if (/^`model`:/i.test(line) || /^model:/i.test(line)) {
      inModelSection = true;
      continue;
    }
    if (!inModelSection) {
      continue;
    }
    const match = line.match(/^-\s+"?([a-z0-9._-]+)"?$/i);
    if (!match) {
      if (models.length > 0 && !line.startsWith("-")) {
        break;
      }
      continue;
    }
    models.push({
      id: match[1],
      label: match[1],
    });
  }
  return uniqueModels(models);
}

function resolveWorkspace(): string {
  return String(getConfig().cliWorkspace || process.cwd()).trim() || process.cwd();
}

function resolveClaudeBinary(): string {
  const candidates = [
    resolveClaudeCommand(),
    process.platform === "win32" ? "claude.exe" : "",
  ].filter(Boolean);
  if (process.platform === "win32") {
    try {
      const output = execFileSync("where.exe", ["claude"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const matches = String(output || "")
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);
      candidates.unshift(...matches);
    } catch {
      // Fall through to the default candidates.
    }
  }
  return candidates[0] || "claude";
}

export class CliModelDiscoveryService {
  private cache: CliModelDiscoverySnapshot = createEmptySnapshot();

  getSnapshot(): CliModelDiscoverySnapshot {
    return JSON.parse(JSON.stringify(this.cache)) as CliModelDiscoverySnapshot;
  }

  async refreshAll(): Promise<CliModelDiscoverySnapshot> {
    const fetchedAt = nowIso();
    const entries = await Promise.all([
      this.discoverCursor(fetchedAt),
      this.discoverCopilot(fetchedAt),
      this.discoverClaude(fetchedAt),
      this.discoverCodex(fetchedAt),
      this.discoverGemini(fetchedAt),
    ]);
    const providers = entries.reduce((acc, entry) => {
      acc[entry.adapter] = entry;
      return acc;
    }, {} as Record<CliSessionAdapterId, CliModelDiscoveryEntry>);
    this.cache = {
      fetched_at: fetchedAt,
      providers,
    };
    return this.getSnapshot();
  }

  private async discoverCursor(fetchedAt: string): Promise<CliModelDiscoveryEntry> {
    try {
      const command = resolveCursorAgentCommand();
      const result = await runCommand({
        command,
        args: ["models"],
        cwd: resolveWorkspace(),
        timeoutMs: 20000,
      });
      const models = parseCursorModels(result.stdout);
      if (!models.length) {
        throw new Error("Cursor returned no models");
      }
      return {
        adapter: "cursor",
        status: "ready",
        strategy: "runtime",
        models,
        fetched_at: fetchedAt,
        source_label: "Runtime command",
      };
    } catch (error) {
      return buildStaticEntry("cursor", fetchedAt, error instanceof Error ? error.message : String(error));
    }
  }

  private async discoverCopilot(fetchedAt: string): Promise<CliModelDiscoveryEntry> {
    try {
      const command = resolveCopilotHeadlessCommand();
      const result = await runCommand({
        command,
        args: ["help", "config"],
        cwd: resolveWorkspace(),
        timeoutMs: 20000,
      });
      const models = parseCopilotModels(result.stdout);
      if (!models.length) {
        throw new Error("Copilot help output did not expose a model list");
      }
      return {
        adapter: "copilot",
        status: "ready",
        strategy: "help",
        models,
        fetched_at: fetchedAt,
        source_label: "Help config parse",
      };
    } catch (error) {
      const fallback = buildStaticEntry("copilot", fetchedAt, error instanceof Error ? error.message : String(error));
      fallback.models = uniqueModels([
        { id: "gpt-5.4", label: "gpt-5.4" },
        { id: "gpt-5.3-codex", label: "gpt-5.3-codex" },
        { id: "gpt-5-mini", label: "gpt-5-mini" },
        { id: "claude-sonnet-4.6", label: "claude-sonnet-4.6" },
        { id: "gemini-3-pro-preview", label: "gemini-3-pro-preview" },
      ]);
      return fallback;
    }
  }

  private async discoverClaude(fetchedAt: string): Promise<CliModelDiscoveryEntry> {
    try {
      const command = resolveClaudeBinary();
      await runCommand({
        command,
        args: ["--help"],
        cwd: resolveWorkspace(),
        timeoutMs: 12000,
      });
      return {
        ...buildStaticEntry("claude", fetchedAt),
        status: "ready",
      };
    } catch (error) {
      return buildStaticEntry("claude", fetchedAt, error instanceof Error ? error.message : String(error));
    }
  }

  private async discoverCodex(fetchedAt: string): Promise<CliModelDiscoveryEntry> {
    try {
      const models = await discoverCodexModelsViaAppServer(resolveWorkspace());
      return {
        adapter: "codex",
        status: "ready",
        strategy: "runtime",
        models,
        fetched_at: fetchedAt,
        source_label: "Codex app-server model/list",
      };
    } catch (error) {
      const fallback = buildStaticEntry("codex", fetchedAt, error instanceof Error ? error.message : String(error));
      fallback.source_label = "Codex app-server failed; static fallback";
      return fallback;
    }
  }

  private async discoverGemini(fetchedAt: string): Promise<CliModelDiscoveryEntry> {
    try {
      const command = resolveGeminiHeadlessCommand();
      await runCommand({
        command,
        args: ["--help"],
        cwd: resolveWorkspace(),
        timeoutMs: 12000,
      });
      return {
        ...buildStaticEntry("gemini", fetchedAt),
        status: "ready",
      };
    } catch (error) {
      return buildStaticEntry("gemini", fetchedAt, error instanceof Error ? error.message : String(error));
    }
  }
}
