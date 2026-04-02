import { dirname } from "node:path";
import { existsSync } from "node:fs";
import spawn from "cross-spawn";
import { BUS_VERSION } from "../../config/env.js";
import type {
  CliSessionAdapter,
  CliAdapterRunInput,
  CliAdapterRunHooks,
  CliAdapterRunResult,
} from "./types.js";
import { WINDOWS_POWERSHELL } from "./constants.js";
import { normalizeWorkspacePath, terminateChildProcessTree } from "./utils.js";
import { CURSOR_SESSION_ID_ENV_VAR, resolveCursorAgentCommand } from "./cursorHeadlessAdapter.js";

type CursorDirectCommandRequest = {
  command: string;
  prompt: string;
  workspace: string;
  model?: string;
  env?: Record<string, string>;
};

type CursorDirectCommandExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type CursorDirectResultEnvelope = {
  resultText?: string;
  rawResult?: Record<string, unknown> | null;
  sessionId?: string;
  requestId?: string;
};

type JsonRpcId = string | number;

type JsonRpcRequest = {
  id: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcEnvelope = {
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

type CursorDirectPendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

interface CursorDirectCommandExecutor {
  run(
    request: CursorDirectCommandRequest,
    hooks: CliAdapterRunHooks,
  ): Promise<CursorDirectCommandExecutionResult>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clipText(value: unknown, maxLength = 320): string | undefined {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function extractString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function extractJsonRpcId(value: unknown): JsonRpcId | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return undefined;
}

function extractSessionId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return extractString(value, ["sessionId", "session_id", "chatId", "chat_id"]);
}

function extractRequestId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return extractString(value, ["requestId", "request_id", "turnId", "turn_id"]);
}

function extractAssistantText(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const direct = extractString(value, ["text", "delta", "message", "content", "result"]);
  if (direct) {
    return direct;
  }

  const content = value.content;
  if (Array.isArray(content)) {
    const merged = content
      .filter(isRecord)
      .map((entry) => extractString(entry, ["text", "delta", "content"]))
      .filter((entry): entry is string => Boolean(entry))
      .join("");
    return merged.trim() || undefined;
  }

  return undefined;
}

function normalizeJsonRpcLine(line: string): JsonRpcEnvelope | null {
  try {
    return JSON.parse(line) as JsonRpcEnvelope;
  } catch {
    return null;
  }
}

function parseCursorDirectJsonRpcLine(
  line: string,
  state: {
    sessionId?: string;
    requestId?: string;
    assistantText: string;
    eventCount: number;
    ignoredLineCount: number;
    errors: string[];
    completed: boolean;
  },
): void {
  const parsed = normalizeJsonRpcLine(line);
  if (!parsed) {
    state.ignoredLineCount += 1;
    return;
  }
  state.eventCount += 1;

  const resultRecord = isRecord(parsed.result) ? parsed.result : undefined;
  const paramsRecord = isRecord(parsed.params) ? parsed.params : undefined;

  state.sessionId = state.sessionId
    || extractSessionId(resultRecord)
    || extractSessionId(paramsRecord)
    || extractSessionId(parsed);
  state.requestId = state.requestId
    || extractRequestId(resultRecord)
    || extractRequestId(paramsRecord)
    || extractRequestId(parsed);

  const method = String(parsed.method || "").trim().toLowerCase();

  const nextText = extractAssistantText(paramsRecord)
    || extractAssistantText(resultRecord)
    || (method.includes("message") || method.includes("delta") ? extractAssistantText(parsed) : undefined);
  if (nextText) {
    state.assistantText = `${state.assistantText}${nextText}`;
  }

  if (method.includes("error") && paramsRecord) {
    const message = clipText(extractString(paramsRecord, ["message", "detail", "error"]), 400);
    if (message) {
      state.errors.push(message);
    }
  }

  if (parsed.error !== undefined && parsed.error !== null) {
    if (isRecord(parsed.error)) {
      const message = clipText(extractString(parsed.error, ["message", "detail", "error"]), 400);
      if (message) {
        state.errors.push(message);
      }
    } else {
      const message = clipText(parsed.error, 400);
      if (message) {
        state.errors.push(message);
      }
    }
  }

  if (method.includes("complete") || method.includes("finished") || method.includes("done")) {
    state.completed = true;
  }
}

export function parseCursorDirectResult(stdout: string): CursorDirectResultEnvelope {
  const state: {
    sessionId?: string;
    requestId?: string;
    assistantText: string;
    eventCount: number;
    ignoredLineCount: number;
    errors: string[];
    completed: boolean;
  } = {
    assistantText: "",
    eventCount: 0,
    ignoredLineCount: 0,
    errors: [],
    completed: false,
  };

  const lines = String(stdout || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    parseCursorDirectJsonRpcLine(line, state);
  }

  return {
    sessionId: state.sessionId,
    requestId: state.requestId,
    resultText: state.assistantText.trim(),
    rawResult: {
      session_id: state.sessionId || null,
      request_id: state.requestId || null,
      event_count: state.eventCount,
      last_assistant_text: state.assistantText.trim() || null,
      errors: state.errors,
      ignored_line_count: state.ignoredLineCount,
      completed: state.completed,
    },
  };
}

class CursorDirectExecutor implements CursorDirectCommandExecutor {
  async run(
    request: CursorDirectCommandRequest,
    hooks: CliAdapterRunHooks,
  ): Promise<CursorDirectCommandExecutionResult> {
    return await new Promise<CursorDirectCommandExecutionResult>((resolve, reject) => {
      const requestedModel = String(request.model || "").trim();
      const env = { ...process.env, ...(request.env || {}) };
      const isWindows = process.platform === "win32";
      const isPowerShellShim = isWindows && /\.ps1$/i.test(request.command);
      const command = isWindows && isPowerShellShim ? WINDOWS_POWERSHELL : request.command;
      const cursorArgs = ["acp"];
      const args = isWindows
        ? (isPowerShellShim
          ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", request.command, ...cursorArgs]
          : cursorArgs)
        : cursorArgs;

      if (isWindows) {
        const commandDir = dirname(request.command);
        if (commandDir && commandDir !== "." && existsSync(commandDir)) {
          const currentPath = String(env.Path || env.PATH || "");
          if (!currentPath.toLowerCase().includes(commandDir.toLowerCase())) {
            env.Path = `${commandDir};${currentPath}`;
            env.PATH = env.Path;
          }
        }
      }

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(command, args, {
          cwd: request.workspace,
          env,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (error) {
        reject(error);
        return;
      }

      let stdout = "";
      let stderr = "";
      let lineBuffer = "";
      let settled = false;
      let childClosed = false;
      let nextRequestId = 1;
      let activeSessionId = String(request.env?.[CURSOR_SESSION_ID_ENV_VAR] || "").trim() || undefined;
      let activeRequestId: string | undefined;
      const pendingRequests = new Map<string, CursorDirectPendingRequest>();

      const requestShutdown = () => {
        if (childClosed) {
          return;
        }
        for (const pending of pendingRequests.values()) {
          clearTimeout(pending.timer);
          pending.reject(new Error(`Cursor ACP request '${pending.method}' canceled during shutdown.`));
        }
        pendingRequests.clear();
        try {
          child.stdin.end();
        } catch {
          // Best effort shutdown.
        }
        setTimeout(() => {
          if (!childClosed) {
            terminateChildProcessTree(child);
          }
        }, 1500);
      };

      const finalize = (result: CursorDirectCommandExecutionResult) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };

      const sendMessage = (payload: Record<string, unknown>): void => {
        if (child.stdin.destroyed || child.killed || childClosed) {
          throw new Error("Cursor ACP stdin is unavailable.");
        }
        child.stdin.write(`${JSON.stringify(payload)}\n`);
      };

      const sendRequest = async (
        method: string,
        params: Record<string, unknown>,
        timeoutMs = 25_000,
      ): Promise<unknown> => {
        const id: JsonRpcId = String(nextRequestId++);
        return await new Promise<unknown>((resolveRequest, rejectRequest) => {
          const timer = setTimeout(() => {
            pendingRequests.delete(String(id));
            rejectRequest(new Error(`Timed out waiting for Cursor ACP response to '${method}'.`));
          }, timeoutMs);

          pendingRequests.set(String(id), {
            method,
            resolve: resolveRequest,
            reject: rejectRequest,
            timer,
          });

          try {
            const message: JsonRpcRequest = {
              id,
              method,
              params,
            };
            sendMessage(message as unknown as Record<string, unknown>);
          } catch (error) {
            clearTimeout(timer);
            pendingRequests.delete(String(id));
            rejectRequest(error instanceof Error ? error : new Error(String(error)));
          }
        });
      };

      const sendNotification = (method: string, params?: Record<string, unknown>): void => {
        const payload: Record<string, unknown> = { method };
        if (params) {
          payload.params = params;
        }
        sendMessage(payload);
      };

      const emitActivity = (
        status: "in_progress" | "completed" | "failed",
        summary?: string,
      ) => {
        hooks.onActivity?.({
          at: nowIso(),
          turn_id: activeRequestId,
          item_id: "task:cursor-direct",
          kind: "task",
          status,
          label: "Cursor ACP",
          summary: clipText(summary || (status === "completed" ? "Completed" : "Running"), 260),
        });
      };

      const handleNotification = (method: string, params: Record<string, unknown>) => {
        const normalizedMethod = method.trim().toLowerCase();
        activeSessionId = activeSessionId || extractSessionId(params);
        activeRequestId = activeRequestId || extractRequestId(params);

        if (normalizedMethod.includes("error")) {
          const message = clipText(extractString(params, ["message", "detail", "error"]), 400)
            || "Cursor ACP notification error";
          hooks.onOutput("stderr", `${message}\n`);
          emitActivity("failed", message);
          hooks.onNativeRuntime?.({
            at: nowIso(),
            thread_id: activeSessionId,
            active_turn_id: activeRequestId,
            last_turn_id: activeRequestId,
            turn_status: "failed",
            phase: "failed",
            last_error: message,
          });
          return;
        }

        const text = extractAssistantText(params);
        if (text) {
          hooks.onOutput("stdout", text);
          emitActivity("in_progress", "Streaming assistant response");
          hooks.onNativeRuntime?.({
            at: nowIso(),
            thread_id: activeSessionId,
            active_turn_id: activeRequestId,
            last_turn_id: activeRequestId,
            turn_status: "inProgress",
            phase: "running",
          });
        }

        if (
          normalizedMethod.includes("complete")
          || normalizedMethod.includes("finished")
          || normalizedMethod.includes("done")
        ) {
          emitActivity("completed", "Cursor ACP turn completed");
          hooks.onNativeRuntime?.({
            at: nowIso(),
            thread_id: activeSessionId,
            active_turn_id: activeRequestId,
            last_turn_id: activeRequestId,
            turn_status: "completed",
            phase: "completed",
          });
          requestShutdown();
          return;
        }

        if (normalizedMethod.includes("start") || normalizedMethod.includes("running")) {
          emitActivity("in_progress", "Cursor ACP turn running");
          hooks.onNativeRuntime?.({
            at: nowIso(),
            thread_id: activeSessionId,
            active_turn_id: activeRequestId,
            last_turn_id: activeRequestId,
            turn_status: "inProgress",
            phase: "running",
          });
        }
      };

      const handleParsedMessage = (message: JsonRpcEnvelope) => {
        const method = typeof message.method === "string" ? message.method : "";
        const requestId = extractJsonRpcId(message.id);
        const hasResult = Object.prototype.hasOwnProperty.call(message, "result");
        const hasError = Object.prototype.hasOwnProperty.call(message, "error");

        if (requestId !== undefined && !method && (hasResult || hasError)) {
          const pending = pendingRequests.get(String(requestId));
          if (!pending) {
            return;
          }
          clearTimeout(pending.timer);
          pendingRequests.delete(String(requestId));
          if (hasError) {
            const errorRecord = isRecord(message.error) ? message.error : {};
            const detail = clipText(
              extractString(errorRecord, ["message", "detail", "error"]) || message.error,
              500,
            ) || `Cursor ACP request '${pending.method}' failed.`;
            pending.reject(new Error(detail));
            return;
          }
          pending.resolve(message.result);
          return;
        }

        if (method) {
          handleNotification(method, isRecord(message.params) ? message.params : {});
        }
      };

      const processStdoutText = (text: string): void => {
        lineBuffer = `${lineBuffer}${text}`;
        const lines = lineBuffer.split(/\r?\n/g);
        lineBuffer = lines.pop() || "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) {
            continue;
          }
          const parsed = normalizeJsonRpcLine(line);
          if (parsed) {
            handleParsedMessage(parsed);
            continue;
          }
          hooks.onOutput("stderr", `[cursor-direct] Ignored non-JSON ACP line: ${line}\n`);
        }
      };

      const bootstrap = async () => {
        hooks.onNativeRuntime?.({
          at: nowIso(),
          thread_id: activeSessionId,
          phase: "starting",
        });

        const initializeResult = await sendRequest(
          "initialize",
          {
            protocolVersion: "0.2",
            client: {
              name: "agentchatbus-ts",
              version: BUS_VERSION,
            },
            capabilities: {
              tools: true,
            },
          },
          30_000,
        );

        activeSessionId = activeSessionId || extractSessionId(initializeResult);
        sendNotification("initialized", {});

        if (activeSessionId) {
          try {
            await sendRequest(
              "session/resume",
              {
                sessionId: activeSessionId,
                cwd: request.workspace,
                ...(requestedModel ? { model: requestedModel } : {}),
              },
              20_000,
            );
          } catch {
            activeSessionId = undefined;
          }
        }

        if (!activeSessionId) {
          const sessionResult = await sendRequest(
            "session/new",
            {
              cwd: request.workspace,
              ...(requestedModel ? { model: requestedModel } : {}),
            },
            25_000,
          );
          activeSessionId = extractSessionId(sessionResult) || activeSessionId;
        }

        if (!activeSessionId) {
          throw new Error("Cursor ACP did not return a session id from initialize/session methods.");
        }

        const promptResult = await sendRequest(
          "session/prompt",
          {
            sessionId: activeSessionId,
            prompt: request.prompt,
            ...(requestedModel ? { model: requestedModel } : {}),
          },
          30_000,
        );
        activeRequestId = extractRequestId(promptResult) || activeRequestId;
        hooks.onNativeRuntime?.({
          at: nowIso(),
          thread_id: activeSessionId,
          active_turn_id: activeRequestId,
          last_turn_id: activeRequestId,
          turn_status: "inProgress",
          phase: "running",
        });
      };

      hooks.onControls({
        kill: () => {
          requestShutdown();
        },
      });

      if (typeof child.pid === "number" && child.pid > 0) {
        hooks.onProcessStart(child.pid);
      }

      child.stdout.on("data", (chunk) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
        stdout += text;
        processStdoutText(text);
      });

      child.stderr.on("data", (chunk) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
        stderr += text;
        hooks.onOutput("stderr", text);
      });

      child.on("error", (error) => {
        fail(error);
      });

      child.on("close", (code) => {
        childClosed = true;
        for (const pending of pendingRequests.values()) {
          clearTimeout(pending.timer);
          pending.reject(new Error(`Cursor ACP request '${pending.method}' canceled because process exited.`));
        }
        pendingRequests.clear();
        finalize({
          exitCode: typeof code === "number" ? code : null,
          stdout,
          stderr,
        });
      });

      hooks.signal.addEventListener(
        "abort",
        () => {
          requestShutdown();
        },
        { once: true },
      );

      void bootstrap().catch((error) => {
        requestShutdown();
        fail(error);
      });
    });
  }
}

export class CursorDirectAdapter implements CliSessionAdapter {
  readonly adapterId = "cursor" as const;
  readonly mode = "direct" as const;
  readonly supportsInput = false;
  readonly supportsRestart = true;
  readonly supportsResize = false;
  readonly requiresPrompt = true;

  constructor(
    private readonly executor: CursorDirectCommandExecutor = new CursorDirectExecutor(),
    private readonly command = resolveCursorAgentCommand(),
  ) {}

  async run(input: CliAdapterRunInput, hooks: CliAdapterRunHooks): Promise<CliAdapterRunResult> {
    const workspace = normalizeWorkspacePath(input.workspace);
    let execution: CursorDirectCommandExecutionResult;
    try {
      execution = await this.executor.run(
        {
          command: this.command,
          prompt: input.prompt,
          workspace,
          model: input.model,
          env: input.env,
        },
        hooks,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Cursor direct ACP launch failed via '${this.command}': ${detail}`);
    }

    const parsed = parseCursorDirectResult(execution.stdout);
    const persistedSessionId = String(input.env?.[CURSOR_SESSION_ID_ENV_VAR] || "").trim() || undefined;

    return {
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr,
      resultText: parsed.resultText,
      rawResult: parsed.rawResult,
      externalSessionId: parsed.sessionId || persistedSessionId,
      externalRequestId: parsed.requestId,
    };
  }
}
