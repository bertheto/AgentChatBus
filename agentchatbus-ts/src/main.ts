/**
 * Main module - ported from src/main.py
 */

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
  
  // 对应 Python: L138-139 - sha256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  crypto.subtle.digest('SHA-256', data).then(buffer => {
    const bytes = new Uint8Array(buffer);
    // 取前 8 个字节作为索引
    const view = new DataView(bytes.buffer);
    const idx = Number(view.getBigUint64(0, false) % BigInt(AGENT_EMOJIS.length));
    return AGENT_EMOJIS[idx];
  });
  
  // 由于 crypto.subtle 是异步的，我们使用同步的简单 hash
  // TODO: 更好的实现是使用 Web Crypto API 的同步版本或同步 hash 库
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  
  const idx = Math.abs(hash) % AGENT_EMOJIS.length;
  return AGENT_EMOJIS[idx];
}
