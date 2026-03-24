import { afterEach, describe, expect, it } from "vitest";
import { CliSessionManager } from "../../src/core/services/cliSessionManager.js";
import type { CliSessionAdapter, CliAdapterRunInput, CliAdapterRunHooks, CliAdapterRunResult } from "../../src/core/services/adapters/types.js";

class DelayedResizeAdapter implements CliSessionAdapter {
  readonly adapterId = "codex" as const;
  readonly mode = "interactive" as const;
  readonly supportsInput = true;
  readonly supportsRestart = true;
  readonly supportsResize = true;
  readonly requiresPrompt = false;
  readonly shell = "powershell";

  resizeCalls: Array<{ cols: number; rows: number }> = [];

  async run(_input: CliAdapterRunInput, hooks: CliAdapterRunHooks): Promise<CliAdapterRunResult> {
    let finished = false;

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        hooks.onControls({
          resize: (cols, rows) => {
            this.resizeCalls.push({ cols, rows });
          },
          kill: () => {
            if (finished) {
              return;
            }
            finished = true;
            resolve();
          },
        });
      }, 25);

      hooks.signal.addEventListener("abort", () => {
        if (finished) {
          return;
        }
        finished = true;
        resolve();
      }, { once: true });
    });

    return {
      exitCode: 0,
      stdout: "",
      stderr: "",
      rawResult: null,
    };
  }
}

describe("CliSessionManager resizeSession", () => {
  const managers: CliSessionManager[] = [];

  afterEach(async () => {
    await Promise.all(managers.map((manager) => manager.close()));
    managers.length = 0;
  });

  it("treats early interactive resize as non-fatal and reapplies it once controls are ready", async () => {
    const adapter = new DelayedResizeAdapter();
    const manager = new CliSessionManager([adapter]);
    managers.push(manager);

    const session = manager.createSession({
      threadId: "thread-1",
      adapter: "codex",
      mode: "interactive",
      requestedByAgentId: "human-agent",
      workspace: "C:\\workspace",
    });

    const result = await manager.resizeSession(session.id, 150, 42);
    expect(result?.ok).toBe(true);
    expect(result?.session?.cols).toBe(150);
    expect(result?.session?.rows).toBe(42);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(adapter.resizeCalls).toContainEqual({ cols: 150, rows: 42 });
  });
});
