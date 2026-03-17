/**
 * Main module - ported from src/main.py
 */
import { createHash } from "node:crypto";

const AGENT_EMOJIS = ['🤖', '🧠', '⚡', '💡', '🔧', '🎯', '📊', '🚀'];

/**
 * 移植自：src/main.py::_agent_emoji (L132-140)
 * 生成确定性的 agent emoji，基于 agent_id 的 hash
 */
export function generateAgentEmoji(agentId: string | null): string {
  if (!agentId) {
    return '❔';
  }
  
  // 对应 Python: L135 - normalized = str(agent_id).strip().lower()
  const normalized = String(agentId).trim().toLowerCase();
  
  if (!normalized) {
    return '❔';
  }
  
  // Match Python behavior with deterministic SHA-256 based index.
  const digest = createHash("sha256").update(normalized, "utf8").digest();
  const hash64 = digest.readBigUInt64BE(0);
  const idx = Number(hash64 % BigInt(AGENT_EMOJIS.length));
  return AGENT_EMOJIS[idx];
}
