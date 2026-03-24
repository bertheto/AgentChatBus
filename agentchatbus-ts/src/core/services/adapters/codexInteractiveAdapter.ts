import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { getConfig } from "../../config/registry.js";
import { logInfo } from "../../../shared/logger.js";
import type { CliSessionAdapter, CliAdapterRunInput, CliAdapterRunHooks, CliAdapterRunResult } from "./types.js";
import { WINDOWS_POWERSHELL } from "./constants.js";
import {
  normalizeTerminalCols,
  normalizeTerminalRows,
  toPowerShellSingleQuoted,
  isConptyOrWinptyStartupError
} from "./utils.js";
import { runInteractivePtyInChild } from "./interactivePtyChildBridge.js";

export function resolveCodexCommand(): string {
  const configured = String(getConfig().codexCommand || "").trim();
  if (configured) {
    return configured;
  }
  if (process.platform === "win32") {
    try {
      const output = execFileSync("where.exe", ["codex"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const matches = String(output || "")
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);
      for (const match of matches) {
        const extension = extname(match).toLowerCase();
        const variants = extension === ".ps1"
          ? [
              match,
              match.replace(/\.ps1$/i, ".exe"),
              match.replace(/\.ps1$/i, ".cmd"),
            ]
          : extension === ".cmd"
            ? [
                match.replace(/\.cmd$/i, ".ps1"),
                match.replace(/\.cmd$/i, ".exe"),
                match,
              ]
            : extension === ".exe"
              ? [
                  match.replace(/\.exe$/i, ".ps1"),
                  match,
                  match.replace(/\.exe$/i, ".cmd"),
                ]
              : [
                  `${match}.ps1`,
                  `${match}.exe`,
                  `${match}.cmd`,
                  match,
                ];
        const existing = variants.find((candidate) => existsSync(candidate));
        if (existing) {
          return existing;
        }
      }
    } catch {
      // Fall back to PATH lookup below.
    }
  }
  return "codex";
}

function shouldUseConpty(): boolean {
  return getConfig().ptyUseConpty;
}

function buildChildEnv(extraEnv?: Record<string, string>): Record<string, string> {
  const merged = { ...process.env, ...(extraEnv || {}) };
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === "string") {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export class CodexInteractiveAdapter implements CliSessionAdapter {
  readonly adapterId = "codex" as const;
  readonly mode = "interactive" as const;
  readonly supportsInput = true;
  readonly supportsRestart = true;
  readonly supportsResize = true;
  readonly requiresPrompt = false;
  readonly shell = "powershell";

  constructor(
    private readonly shellCommand = WINDOWS_POWERSHELL,
    private readonly codexCommand?: string,
  ) {}

  async run(input: CliAdapterRunInput, hooks: CliAdapterRunHooks): Promise<CliAdapterRunResult> {
    if (process.platform !== "win32") {
      throw new Error("Codex interactive PTY mode currently requires Windows PowerShell.");
    }

    const preferConpty = shouldUseConpty();
    try {
      return await this.runWithBackend(input, hooks, preferConpty);
    } catch (error) {
      if (!preferConpty || !isConptyOrWinptyStartupError(error)) {
        throw error;
      }
      logInfo("[cli-session] Codex PTY ConPTY startup failed, retrying with WinPTY fallback.");
      return await this.runWithBackend(input, hooks, false);
    }
  }

  private async runWithBackend(
    input: CliAdapterRunInput,
    hooks: CliAdapterRunHooks,
    useConpty: boolean,
  ): Promise<CliAdapterRunResult> {
    const codexCommand = this.codexCommand || resolveCodexCommand();
    const commandParts = [
      `& ${toPowerShellSingleQuoted(codexCommand)}`,
      "--no-alt-screen",
      "-C",
      toPowerShellSingleQuoted(input.workspace),
    ];

    return await runInteractivePtyInChild({
      workerName: "interactivePtyWorker",
      request: {
        shellCommand: this.shellCommand,
        shellArgs: [
          "-NoLogo",
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          commandParts.join(" "),
        ],
        cwd: input.workspace,
        env: buildChildEnv(input.env),
        cols: normalizeTerminalCols(input.cols),
        rows: normalizeTerminalRows(input.rows),
        useConpty,
      },
      hooks,
    });
  }
}
