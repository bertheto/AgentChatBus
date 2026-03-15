export interface AppConfig {
  host: string;
  port: number;
  dbPath: string;
}

export function getConfig(): AppConfig {
  return {
    host: process.env.AGENTCHATBUS_HOST || "127.0.0.1",
    port: Number(process.env.AGENTCHATBUS_PORT || "39765"),
    dbPath: process.env.AGENTCHATBUS_DB || "data/bus-ts.db"
  };
}