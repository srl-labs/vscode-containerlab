export const DEFAULT_INTERFACE_PATTERN = 'eth{n}';

export interface InterfacePatternSegment {
  prefix: string;
  suffix: string;
  start: number;
  end?: number;
  length?: number;
  regex: RegExp;
}

export interface ParsedInterfacePattern {
  original: string;
  segments: InterfacePatternSegment[];
}

const PLACEHOLDER_REGEX = /\{n(?::(\d+)(?:-(\d+))?)?\}/;

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createSegment(entry: string): InterfacePatternSegment | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  PLACEHOLDER_REGEX.lastIndex = 0;
  const match = PLACEHOLDER_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }
  const prefix = trimmed.slice(0, match.index);
  const suffix = trimmed.slice(match.index + match[0].length);
  const rawStart = match[1] ? parseInt(match[1], 10) : 1;
  const rawEnd = match[2] ? parseInt(match[2], 10) : undefined;
  const normalizedStart = Number.isNaN(rawStart) ? 1 : rawStart;
  const normalizedEnd = rawEnd === undefined || Number.isNaN(rawEnd)
    ? undefined
    : Math.max(normalizedStart, rawEnd);
  const length = normalizedEnd !== undefined ? normalizedEnd - normalizedStart + 1 : undefined;
  const regex = new RegExp(`^${escapeRegExp(prefix)}(\\d+)${escapeRegExp(suffix)}$`);
  return {
    prefix,
    suffix,
    start: normalizedStart,
    end: normalizedEnd,
    length,
    regex,
  };
}

export function parseInterfacePattern(pattern?: string | null): ParsedInterfacePattern {
  const source = (pattern ?? '').trim() || DEFAULT_INTERFACE_PATTERN;
  const segments = source
    .split(',')
    .map(createSegment)
    .filter((segment): segment is InterfacePatternSegment => Boolean(segment));

  if (segments.length === 0) {
    return parseInterfacePattern(DEFAULT_INTERFACE_PATTERN);
  }

  return { original: source, segments };
}

function buildInterfaceName(
  segment: InterfacePatternSegment,
  offset: number,
  baseOverride?: number
): string {
  const base = baseOverride ?? segment.start;
  const value = base + offset;
  return `${segment.prefix}${value}${segment.suffix}`;
}

export function generateInterfaceName(parsed: ParsedInterfacePattern, index: number): string {
  const safeIndex = Math.max(0, index);
  const normalized = parsed.segments.length > 0 ? parsed : parseInterfacePattern(DEFAULT_INTERFACE_PATTERN);
  const { segments } = normalized;

  let remaining = safeIndex;
  for (const segment of segments) {
    const length = segment.length;
    if (length === undefined || remaining < length) {
      return buildInterfaceName(segment, remaining);
    }
    remaining -= length;
  }

  const fallback = segments[segments.length - 1];
  const base = fallback.end !== undefined ? fallback.end + 1 : fallback.start;
  return buildInterfaceName(fallback, remaining, base);
}

function evaluateMatch(
  segment: InterfacePatternSegment,
  match: RegExpExecArray,
  isLastSegment: boolean,
  offset: number
): number | null {
  const value = parseInt(match[1], 10);
  if (Number.isNaN(value) || value < segment.start) {
    return null;
  }
  if (segment.length !== undefined) {
    const maxValue = segment.start + segment.length - 1;
    if (value > maxValue && !isLastSegment) {
      return null;
    }
  }
  return offset + (value - segment.start);
}

export function getInterfaceIndex(parsed: ParsedInterfacePattern, iface: string): number | null {
  let offset = 0;
  const { segments } = parsed;
  const lastIndex = segments.length - 1;

  for (let idx = 0; idx < segments.length; idx++) {
    const segment = segments[idx];
    const match = segment.regex.exec(iface);
    if (match) {
      const evaluated = evaluateMatch(segment, match, idx === lastIndex, offset);
      if (evaluated !== null) {
        return evaluated;
      }
      if (idx === lastIndex) {
        return null;
      }
    }

    if (segment.length === undefined) {
      return null;
    }
    offset += segment.length;
  }

  return null;
}
