function normalizeWhitespace(input: string): string {
  return String(input || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeInteractiveScreenText(value: string | undefined): string {
  return normalizeWhitespace(String(value || "").replace(/\r/g, "\n")).toLowerCase();
}

function stripBusyPrefix(line: string): string {
  return String(line || "")
    .trim()
    .replace(/^[•·●◦○◎◉◌]+\s*/u, "")
    .replace(/^[|/\\-]+\s*/, "")
    .trim();
}

function extractBusyDuration(line: string): string | undefined {
  const match = /\(([^)]*\b\d+\s*(?:ms|s|sec|secs|second|seconds|m|min|mins|minute|minutes)\b[^)]*)\)/i.exec(
    line,
  );
  if (!match?.[1]) {
    return undefined;
  }
  return normalizeWhitespace(match[1]);
}

function isShortBusyPhrase(line: string): boolean {
  const normalized = normalizeInteractiveScreenText(line);
  if (!normalized) {
    return false;
  }
  return (
    /^(thinking|working|processing)(?:\s*\([^)]*\))?(?:\s*[•·]\s*esc to (?:cancel|interrupt))?\.{0,3}$/i.test(
      stripBusyPrefix(line),
    )
    || normalized === "thinking esc to cancel"
    || normalized === "working esc to interrupt"
    || normalized === "processing esc to cancel"
    || normalized === "processing esc to interrupt"
  );
}

export function extractInteractiveWorkingStatus(screenExcerpt: string | undefined): string | undefined {
  const lines = String(screenExcerpt || "")
    .split("\n")
    .map((line) => stripBusyPrefix(line))
    .filter(Boolean);

  for (const line of lines) {
    if (!isShortBusyPhrase(line)) {
      continue;
    }
    const duration = extractBusyDuration(line);
    if (duration) {
      return `Working... (${duration})`;
    }
    return "Working...";
  }

  return undefined;
}

export function looksLikeGenericWorkingScreen(screenExcerpt: string | undefined): boolean {
  if (extractInteractiveWorkingStatus(screenExcerpt)) {
    return true;
  }

  const normalized = normalizeInteractiveScreenText(screenExcerpt);
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("thinking esc to cancel")
    || normalized.includes("thinking (esc to cancel)")
    || normalized.includes("working esc to interrupt")
    || normalized.includes("working (esc to interrupt)")
    || normalized.includes("processing esc to cancel")
    || normalized.includes("processing esc to interrupt")
  );
}

export function looksLikeConversationalWorkingScreen(screenExcerpt: string | undefined): boolean {
  const normalized = normalizeInteractiveScreenText(screenExcerpt);
  if (!normalized) {
    return false;
  }

  return (
    looksLikeGenericWorkingScreen(screenExcerpt)
    || normalized.includes("thinking")
    || normalized.includes("working")
    || normalized.includes("processing")
  );
}

export function isCodexWorkingLine(line: string): boolean {
  const normalized = normalizeInteractiveScreenText(line);
  if (!normalized) {
    return false;
  }

  return (
    (normalized.includes("working") && normalized.includes("esc to interrupt"))
    || (normalized.includes("thinking") && normalized.includes("esc to cancel"))
    || isShortBusyPhrase(line)
  );
}
