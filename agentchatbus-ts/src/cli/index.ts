import { runServe } from "./serve.js";
import { runStdio } from "./stdio.js";
import { logError } from "../shared/logger.js";

async function main(): Promise<void> {
  const mode = process.argv[2] || "serve";

  if (mode === "serve") {
    await runServe();
    return;
  }

  if (mode === "stdio") {
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