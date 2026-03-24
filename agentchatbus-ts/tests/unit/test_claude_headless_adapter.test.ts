import { describe, expect, it } from "vitest";
import { parseClaudeHeadlessResult } from "../../src/core/services/adapters/claudeHeadlessAdapter.js";

describe("parseClaudeHeadlessResult", () => {
  it("extracts resumable session id and final result from stream-json output", () => {
    const result = parseClaudeHeadlessResult([
      "{\"type\":\"session.started\",\"session_id\":\"claude-session-1\",\"request_id\":\"req-claude-1\"}",
      "{\"type\":\"message.delta\",\"text\":\"Partial\"}",
      "{\"type\":\"result\",\"result\":\"Final answer\"}",
    ].join("\n"));

    expect(result.sessionId).toBe("claude-session-1");
    expect(result.requestId).toBe("req-claude-1");
    expect(result.resultText).toBe("Final answer");
    expect(result.rawResult).toMatchObject({
      session_id: "claude-session-1",
      request_id: "req-claude-1",
      event_count: 3,
      result: "Final answer",
      errors: [],
      ignored_line_count: 0,
    });
  });

  it("retains error events while still using the latest text output", () => {
    const result = parseClaudeHeadlessResult([
      "{\"type\":\"session.started\",\"session_id\":\"claude-session-1\"}",
      "{\"type\":\"error\",\"message\":\"resume warning\"}",
      "{\"type\":\"message.delta\",\"text\":\"Recovered output\"}",
    ].join("\n"));

    expect(result.sessionId).toBe("claude-session-1");
    expect(result.resultText).toBe("Recovered output");
    expect(result.rawResult).toMatchObject({
      errors: ["resume warning"],
      result: "Recovered output",
    });
  });
});
