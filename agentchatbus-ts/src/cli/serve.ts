import { startHttpServer } from "../transports/http/server.js";
import { logInfo } from "../shared/logger.js";

export async function runServe(): Promise<void> {
  const server = await startHttpServer();
  const address = server.addresses().map((entry) => `${entry.address}:${entry.port}`).join(", ");
  logInfo(`serve mode listening on ${address}`);
}