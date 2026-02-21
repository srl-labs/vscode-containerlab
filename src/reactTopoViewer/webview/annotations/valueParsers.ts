export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toPosition(value: unknown): { x: number; y: number } | undefined {
  if (!isRecord(value)) return undefined;
  const x = toFiniteNumber(value.x);
  const y = toFiniteNumber(value.y);
  if (x === undefined || y === undefined) return undefined;
  return { x, y };
}

export function normalizePosition(
  value: unknown,
  fallback: { x: number; y: number } = { x: 0, y: 0 }
): { x: number; y: number } {
  return toPosition(value) ?? { ...fallback };
}

export function parseLegacyGroupIdentity(groupId: string): { name: string; level: string } {
  const idx = groupId.lastIndexOf(":");
  if (idx > 0 && idx < groupId.length - 1) {
    return { name: groupId.slice(0, idx), level: groupId.slice(idx + 1) };
  }
  return { name: groupId, level: "1" };
}
