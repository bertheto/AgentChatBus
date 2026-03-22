import { spawn, execFileSync } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { getConfig } from "../../config/registry.js";
import type { CliSessionAdapter, CliAdapterRunInput, CliAdapterRunHooks, CliAdapterRunResult } from "./types.js";
import { WINDOWS_POWERSHELL } from "./constants.js";
import { normalizeWorkspacePath } from "./utils.js";

type CursorCommandRequest = {
  command: string;
  prompt: string;
  workspace: string;
  env?: Record<string, string>;
};

type CursorCommandExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type CursorResultEnvelope = {
  resultText?: string;
  rawResult?: Record<string, unknown> | null;
  sessionId?: string;
  requestId?: string;
};

interface CursorCommandExecutor {
  run(request: CursorCommandRequest, hooks: CliAdapterRunHooks): Promise<CursorCommandExecutionResult>;
}

export function parseCursorHeadlessResult(stdout: string): CursorResultEnvelope {
  const rawText = String(stdout || "").trim();
  if (!rawText) {
    return {
      rawResult: null,
      resultText: "",
    };
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return {
      rawResult: parsed,
      resultText: typeof parsed.result === "string" ? parsed.result : rawText,
      sessionId: typeof parsed.session_id === "string" ? parsed.session_id : undefined,
      requestId: typeof parsed.request_id === "string" ? parsed.request_id : undefined,
    };
  } catch {
    return {
      rawResult: null,
      resultText: rawText,
    };
  }
}

function resolveCursorAgentCommand(): string {
  const configured = String(getConfig().cursorAgentCommand || "").trim();
  if (configured) {
    return configured;
  }
  if (process.platform === "win32") {
    try {
      const output = execFileSync("where.exe", ["cursor-agent"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const firstMatch = String(output || "")
        .split(/\r?\n/)
        .map((value) => value.trim())
        .find(Boolean);
      if (firstMatch) {
        const ps1Match = firstMatch.replace(/\.cmd$/i, ".ps1");
        if (ps1Match !== firstMatch && existsSync(ps1Match)) {
          return ps1Match;
        }
        return firstMatch;
      }
    } catch {
      // Fall back to PATH lookup below.
    }
  }
  return "cursor-agent";
}

class CursorHeadlessExecutor implements CursorCommandExecutor {
  async run(request: CursorCommandRequest, hooks: CliAdapterRunHooks): Promise<CursorCommandExecutionResult> {
    return await new Promise<CursorCommandExecutionResult>((resolve, reject) => {
      const cursorArgs = [
        "-p",
        "--output-format",
        "json",
        "-f",
        "--trust",
        "--workspace",
        request.workspace,
        request.prompt,
      ];
      const isWindows = process.platform === "win32";
      const isPowerShellShim = isWindows && /\.ps1$/i.test(request.command);
      const command = isWindows
        ? (isPowerShellShim ? WINDOWS_POWERSHELL : "cmd.exe")
        : request.command;
      const args = isWindows
        ? (isPowerShellShim
          ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", request.command, ...cursorArgs]
          : ["/d", "/s", "/c", "cursor-agent", ...cursorArgs])
        : cursorArgs;
      const env = { ...process.env, ...(request as { env?: Record<string, string> }).env };
      if (isWindows) {
        const commandDir = dirname(request.command);
        const currentPath = String(env.Path || env.PATH || "");
        if (commandDir && !currentPath.toLowerCase().includes(commandDir.toLowerCase())) {
          env.Path = `${commandDir};${currentPath}`;
          env.PATH = env.Path;
        }
      }

      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(command, args, {
          cwd: request.workspace,
          env,
          shell: false,
        });
      } catch (error) {
        reject(error);
        return;
      }

      hooks.onControls({
        kill: () => {
          try {
            child.kill();
          } catch {
            // Best effort shutdown.
          }
        },
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const finalize = (result: CursorCommandExecutionResult) => {
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

      if (typeof child.pid === "number" && child.pid > 0) {
        hooks.onProcessStart(child.pid);
      }

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        hooks.onOutput("stdout", text);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        hooks.onOutput("stderr", text);
      });

      child.on("error", (error) => {
        fail(error);
      });

      child.on("close", (code) => {
        finalize({
          exitCode: typeof code === "number" ? code : null,
          stdout,
          stderr,
        });
      });

      hooks.signal.addEventListener(
        "abort",
        () => {
          try {
            child.kill();
          } catch {
            // Best effort shutdown.
          }
        },
        { once: true }
      );
    });
  }
}

export class CursorHeadlessAdapter implements CliSessionAdapter {
  readonly adapterId = "cursor" as const;
  readonly mode = "headless" as const;
  readonly supportsInput = false;
  readonly supportsRestart = true;
  readonly supportsResize = false;
  readonly requiresPrompt = true;

  constructor(
    private readonly executor: CursorCommandExecutor = new CursorHeadlessExecutor(),
    private readonly command = resolveCursorAgentCommand(),
  ) {}

  async run(input: CliAdapterRunInput, hooks: CliAdapterRunHooks): Promise<CliAdapterRunResult> {
    const workspace = normalizeWorkspacePath(input.workspace);
    let execution: CursorCommandExecutionResult;
    try {
      execution = await this.executor.run(
        {
          command: this.command,
          prompt: input.prompt,
          workspace,
          env: input.env,
        },
        hooks
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Cursor headless launch failed via '${this.command}': ${detail}`);
    }
    const parsed = parseCursorHeadlessResult(execution.stdout);
    return {
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr,
      resultText: parsed.resultText,
      rawResult: parsed.rawResult,
      externalSessionId: parsed.sessionId,
      externalRequestId: parsed.requestId,
    };
  }
}
