export function normalizeNetemValue(value?: string | number): string {
  if (value === undefined) return "";
  return String(value).trim();
}

export function normalizeNetemPercentage(value?: string | number): string {
  const raw = normalizeNetemValue(value);
  if (!raw) return "";
  const stripped = raw.endsWith("%") ? raw.slice(0, -1) : raw;
  const parsed = Number(stripped);
  if (Number.isFinite(parsed)) {
    return parsed.toString();
  }
  return stripped;
}
