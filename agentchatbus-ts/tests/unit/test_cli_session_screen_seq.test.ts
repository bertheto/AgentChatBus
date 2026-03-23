import { describe, expect, it } from "vitest";
import { extractObservedAgentCurrentSeq } from "../../src/core/services/cliSessionManager.js";

describe("extractObservedAgentCurrentSeq", () => {
  it("prefers the highest current_seq visible on the screen", () => {
    const screen = [
      "● msg_wait",
      "  └ {\"type\":\"sync_context\",\"current_seq\":823,\"reply_token\":\"abc\"}",
      "● Listening with msg_wait. Current seq 824.",
      "● Waiting with msg_wait (current_seq=825).",
    ].join("\n");

    expect(extractObservedAgentCurrentSeq(screen)).toBe(825);
  });

  it("ignores unrelated sequence-like text when no current_seq marker is present", () => {
    const screen = [
      "Running msg_wait for thread after_seq=824.",
      "Posted: \"Inspect src/core/services/memoryStore.ts first.\" (seq 826).",
    ].join("\n");

    expect(extractObservedAgentCurrentSeq(screen)).toBeUndefined();
  });
});
