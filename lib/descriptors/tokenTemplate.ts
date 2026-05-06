export type DescriptorTokenValue = string | number | boolean | null | undefined;

export type DescriptorTokenRenderResult = {
  text: string;
  unknownTokens: string[];
  invalidModifierTokens: string[];
};

export type ParsedDescriptorToken = {
  raw: string;
  baseName: string;
  modifier: string | null;
  isModifierValid: boolean;
};

const TOKEN_PATTERN = /\[([^\]]+)\]/g;

function normalizeModifier(modifier: string | null): string | null {
  if (!modifier) return null;

  const normalized = modifier.trim().toLowerCase();
  if (normalized === "floor" || normalized === "ceil" || normalized === "round") {
    return normalized;
  }

  const fixedMatch = normalized.match(/^fixed:(\d+)$/);
  if (fixedMatch) {
    return `fixed:${fixedMatch[1]}`;
  }

  return null;
}

export function parseDescriptorToken(rawToken: string): ParsedDescriptorToken | null {
  const raw = String(rawToken ?? "").trim();
  const inner = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1).trim() : raw;
  if (!inner) return null;

  const parts = inner.split("|").map((part) => part.trim());
  if (parts.length > 2) {
    return null;
  }

  const baseName = parts[0] ?? "";
  if (!/^[A-Za-z0-9_]+$/.test(baseName)) {
    return null;
  }

  const rawModifier = parts.length === 2 ? parts[1] ?? "" : null;
  const modifier = normalizeModifier(rawModifier);

  return {
    raw: `[${inner}]`,
    baseName,
    modifier,
    isModifierValid: !rawModifier || modifier !== null,
  };
}

export function descriptorTokenBase(rawToken: string): string | null {
  const parsed = parseDescriptorToken(rawToken);
  return parsed ? `[${parsed.baseName}]` : null;
}

export function descriptorTokenHasValidModifier(rawToken: string): boolean {
  return parseDescriptorToken(rawToken)?.isModifierValid ?? false;
}

export function extractDescriptorTokens(template: string): string[] {
  const matches = String(template ?? "").match(TOKEN_PATTERN) ?? [];
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const token of matches) {
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

function tokenValueToString(value: DescriptorTokenValue): string {
  if (value === null || value === undefined) return "0";
  return String(value);
}

function formatModifiedTokenValue(value: DescriptorTokenValue, modifier: string): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  if (modifier === "floor") return String(Math.floor(numeric));
  if (modifier === "ceil") return String(Math.ceil(numeric));
  if (modifier === "round") return String(Math.round(numeric));

  const fixedMatch = modifier.match(/^fixed:(\d+)$/);
  if (fixedMatch) {
    const decimals = Number.parseInt(fixedMatch[1] ?? "0", 10);
    return numeric.toFixed(Math.max(0, Math.min(decimals, 20)));
  }

  return null;
}

export function renderDescriptorTokenTemplate(
  template: string,
  tokens: Record<string, DescriptorTokenValue>,
): DescriptorTokenRenderResult {
  const unknownTokens = new Set<string>();
  const invalidModifierTokens = new Set<string>();

  const text = String(template ?? "").replace(TOKEN_PATTERN, (full, inner: string) => {
    const parsed = parseDescriptorToken(`[${inner}]`);
    if (!parsed) {
      unknownTokens.add(full);
      return full;
    }

    if (!Object.prototype.hasOwnProperty.call(tokens, parsed.baseName)) {
      unknownTokens.add(full);
      return full;
    }

    const value = tokens[parsed.baseName];
    if (!parsed.modifier) {
      if (!parsed.isModifierValid) {
        invalidModifierTokens.add(full);
        return full;
      }
      return tokenValueToString(value);
    }

    const rendered = formatModifiedTokenValue(value, parsed.modifier);
    if (rendered === null) {
      invalidModifierTokens.add(full);
      return full;
    }

    return rendered;
  });

  return {
    text,
    unknownTokens: Array.from(unknownTokens),
    invalidModifierTokens: Array.from(invalidModifierTokens),
  };
}
