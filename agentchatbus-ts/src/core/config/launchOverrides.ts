/**
 * Launch-time config overrides and "locked" markers.
 *
 * Goal: allow the CLI to inject config values (e.g. `--set HOST=0.0.0.0`)
 * without treating all environment-provided values as read-only in the Web UI.
 *
 * The Web UI settings manifest can then mark only these injected keys as readonly.
 */

const launchOverrides = new Map<string, string>(); // envVar -> value
const lockedEnvVars = new Set<string>(); // envVar

export function setLaunchOverride(envVar: string, value: string): void {
  const key = String(envVar || "").trim();
  if (!key) return;
  launchOverrides.set(key, String(value));
  lockedEnvVars.add(key);
}

export function getLaunchOverride(envVar: string): string | undefined {
  const key = String(envVar || "").trim();
  if (!key) return undefined;
  return launchOverrides.get(key);
}

export function isLaunchLockedEnvVar(envVar: string): boolean {
  const key = String(envVar || "").trim();
  if (!key) return false;
  return lockedEnvVars.has(key);
}

export function clearLaunchOverrides(): void {
  launchOverrides.clear();
  lockedEnvVars.clear();
}

