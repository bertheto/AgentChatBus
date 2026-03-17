import { createInterface } from "node:readline";
import { callTool, listTools } from "../../adapters/mcp/tools.js";
import { handleMcpRequest } from "../mcp/handlers.js";

export async function runStdioServer(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      process.stdout.write(`${JSON.stringify({ error: "INVALID_JSON" })}\n`);
      continue;
    }

    const method = payload.method;
    if (method === "tools/list") {
      process.stdout.write(`${JSON.stringify({ result: listTools() })}\n`);
      continue;
    }

    if (method === "tools/call") {
      try {
        const params = (payload.params || {}) as { name?: string; arguments?: Record<string, unknown> };
        const result = await callTool(String(params.name || ""), params.arguments || {});
        process.stdout.write(`${JSON.stringify({ result })}\n`);
      } catch (error) {
        process.stdout.write(`${JSON.stringify({ error: (error as Error).message })}\n`);
      }
      continue;
    }

    try {
      const rpc = await handleMcpRequest({
        id: (payload.id as string | number | null | undefined) ?? null,
        method: String(payload.method || ""),
        params: (payload.params as Record<string, unknown> | undefined) || {},
      });

      if (rpc === null) {
        // JSON-RPC notifications do not require a response frame.
        continue;
      }

      // For backward compatibility with existing stdio expectations, unwrap `{result}`.
      if ("result" in rpc && !("error" in rpc)) {
        process.stdout.write(`${JSON.stringify({ result: (rpc as { result: unknown }).result })}\n`);
        continue;
      }

      process.stdout.write(`${JSON.stringify({ error: (rpc as { error?: { message?: string } }).error?.message || "MCP_ERROR" })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ error: (error as Error).message })}\n`);
    }
  }
}
