export function logInfo(message: string): void {
  process.stdout.write(`[agentchatbus-ts] ${message}\n`);
}

export function logError(message: string): void {
  process.stderr.write(`[agentchatbus-ts] ${message}\n`);
}