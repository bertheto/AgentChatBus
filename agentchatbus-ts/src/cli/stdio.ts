import { runStdioServer } from "../transports/stdio/server.js";
import { logError } from "../shared/logger.js";

export async function runStdio(): Promise<void> {
  logError("stdio mode started");
  await runStdioServer();
}
