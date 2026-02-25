export function safeParseJson(input: unknown): Record<string, unknown> {
  if (!input) return {};

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  return {};
}

export function interpolateText(text: string, params: Record<string, unknown>): string {
  if (!text) return "";

  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = String(rawKey);
    const value = params[key];
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  });
}

