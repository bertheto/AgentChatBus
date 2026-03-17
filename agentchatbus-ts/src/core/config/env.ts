import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  dbPath: string;
  adminToken: string | null;
  agentHeartbeatTimeout: number;
  msgWaitTimeout: number;
  replyTokenLeaseSeconds: number;
  seqTolerance: number;
  seqMismatchMaxMessages: number;
  rateLimitMsgPerMinute: number;
  threadTimeoutMinutes: number;
  threadTimeoutSweepInterval: number;
  reloadEnabled: boolean;
  exposeThreadResources: boolean;
  contentFilterEnabled: boolean;
}

/**
 * Attention mechanism feature flags (UP-17).
 * Ported from Python src/config.py and src/tools/dispatch.py
 * Controls whether handoff_target, stop_reason, and priority fields
 * are returned to agents or stripped from responses.
 */
export const ENABLE_HANDOFF_TARGET = process.env.AGENTCHATBUS_ENABLE_HANDOFF_TARGET !== "false";
export const ENABLE_STOP_REASON = process.env.AGENTCHATBUS_ENABLE_STOP_REASON !== "false";
export const ENABLE_PRIORITY = process.env.AGENTCHATBUS_ENABLE_PRIORITY !== "false";

// Admin token for settings endpoint (optional — if unset, PUT /api/settings is unprotected)
export const ADMIN_TOKEN: string | null = process.env.AGENTCHATBUS_ADMIN_TOKEN || null;

// Config file path (matches Python: data/config.json)
const CONFIG_FILE = join(process.cwd(), "data", "config.json");

/**
 * Get persisted config from data/config.json (matches Python get_config_dict)
 */
function getPersistedConfig(): Record<string, unknown> {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Ignore read errors
  }
  return {};
}

/**
 * Save config to data/config.json (matches Python save_config_dict)
 * Only saves non-transient flags (SHOW_AD is intentionally excluded)
 */
export function saveConfigDict(newData: Record<string, unknown>): void {
  const current = getPersistedConfig();
  const merged = { ...current, ...newData };
  
  // Prevent saving transient/show-only flags by default
  if ("SHOW_AD" in merged) {
    delete merged.SHOW_AD;
  }
  
  try {
    mkdirSync(dirname(CONFIG_FILE), { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
  } catch {
    // Ignore write errors
  }
}

/**
 * Get config dict for API response (matches Python get_config_dict)
 */
export function getConfigDict(): Record<string, unknown> {
  const persisted = getPersistedConfig();
  return {
    HOST: persisted.HOST || process.env.AGENTCHATBUS_HOST || "127.0.0.1",
    PORT: Number(persisted.PORT || process.env.AGENTCHATBUS_PORT || "39765"),
    AGENT_HEARTBEAT_TIMEOUT: Number(persisted.AGENT_HEARTBEAT_TIMEOUT || process.env.AGENTCHATBUS_HEARTBEAT_TIMEOUT || "60"),
    MSG_WAIT_TIMEOUT: Number(persisted.MSG_WAIT_TIMEOUT || process.env.AGENTCHATBUS_WAIT_TIMEOUT || "300"),
    REPLY_TOKEN_LEASE_SECONDS: Number(persisted.REPLY_TOKEN_LEASE_SECONDS || process.env.AGENTCHATBUS_REPLY_TOKEN_LEASE_SECONDS || "3600"),
    SEQ_TOLERANCE: Number(persisted.SEQ_TOLERANCE || process.env.AGENTCHATBUS_SEQ_TOLERANCE || "0"),
    SEQ_MISMATCH_MAX_MESSAGES: Number(persisted.SEQ_MISMATCH_MAX_MESSAGES || process.env.AGENTCHATBUS_SEQ_MISMATCH_MAX_MESSAGES || "100"),
    RATE_LIMIT_MSG_PER_MINUTE: Number(persisted.RATE_LIMIT_MSG_PER_MINUTE || process.env.AGENTCHATBUS_RATE_LIMIT || "30"),
    EXPOSE_THREAD_RESOURCES: persisted.EXPOSE_THREAD_RESOURCES ?? (process.env.AGENTCHATBUS_EXPOSE_THREAD_RESOURCES === "true"),
    ENABLE_HANDOFF_TARGET: persisted.ENABLE_HANDOFF_TARGET ?? ENABLE_HANDOFF_TARGET,
    ENABLE_STOP_REASON: persisted.ENABLE_STOP_REASON ?? ENABLE_STOP_REASON,
    ENABLE_PRIORITY: persisted.ENABLE_PRIORITY ?? ENABLE_PRIORITY,
    SHOW_AD: process.env.AGENTCHATBUS_SHOW_AD === "true",
  };
}

export function getConfig(): AppConfig {
  const persisted = getPersistedConfig();
  const host = typeof persisted.HOST === "string"
    ? persisted.HOST
    : (process.env.AGENTCHATBUS_HOST || "127.0.0.1");
  return {
    host,
    port: Number(persisted.PORT || process.env.AGENTCHATBUS_PORT || "39765"),
    dbPath: process.env.AGENTCHATBUS_DB || "data/bus-ts.db",
    adminToken: ADMIN_TOKEN,
    agentHeartbeatTimeout: Number(process.env.AGENTCHATBUS_HEARTBEAT_TIMEOUT || "60"),
    msgWaitTimeout: Number(process.env.AGENTCHATBUS_WAIT_TIMEOUT || "300"),
    replyTokenLeaseSeconds: Number(process.env.AGENTCHATBUS_REPLY_TOKEN_LEASE_SECONDS || "3600"),
    seqTolerance: Number(process.env.AGENTCHATBUS_SEQ_TOLERANCE || "0"),
    seqMismatchMaxMessages: Number(process.env.AGENTCHATBUS_SEQ_MISMATCH_MAX_MESSAGES || "100"),
    rateLimitMsgPerMinute: Number(process.env.AGENTCHATBUS_RATE_LIMIT || "30"),
    threadTimeoutMinutes: Number(process.env.AGENTCHATBUS_THREAD_TIMEOUT || "0"),
    threadTimeoutSweepInterval: Number(process.env.AGENTCHATBUS_TIMEOUT_SWEEP_INTERVAL || "60"),
    reloadEnabled: process.env.AGENTCHATBUS_RELOAD === "1" || process.env.AGENTCHATBUS_RELOAD === "true",
    exposeThreadResources: process.env.AGENTCHATBUS_EXPOSE_THREAD_RESOURCES === "true",
    contentFilterEnabled: (process.env.AGENTCHATBUS_CONTENT_FILTER_ENABLED || "true") !== "false",
  };
}
