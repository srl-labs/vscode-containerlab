const INTERNAL_UPDATE_GRACE_MS = 1000;

type InternalEntry = {
  depth: number;
  ignoreUntil: number;
};

const internalUpdates = new Map<string, InternalEntry>();

function getBasePath(filePath: string): string {
  return filePath.endsWith(".annotations.json")
    ? filePath.slice(0, -".annotations.json".length)
    : filePath;
}

export function beginInternalUpdate(filePath: string): void {
  const key = getBasePath(filePath);
  const entry = internalUpdates.get(key) ?? { depth: 0, ignoreUntil: 0 };
  entry.depth += 1;
  entry.ignoreUntil = 0;
  internalUpdates.set(key, entry);
}

export function endInternalUpdate(filePath: string): void {
  const key = getBasePath(filePath);
  const entry = internalUpdates.get(key) ?? { depth: 0, ignoreUntil: 0 };
  entry.depth = Math.max(0, entry.depth - 1);
  if (entry.depth === 0) {
    entry.ignoreUntil = Date.now() + INTERNAL_UPDATE_GRACE_MS;
  }
  internalUpdates.set(key, entry);
}

export function isInternalUpdate(filePath: string): boolean {
  const key = getBasePath(filePath);
  const entry = internalUpdates.get(key);
  if (!entry) return false;
  if (entry.depth > 0) return true;
  if (entry.ignoreUntil > Date.now()) return true;
  internalUpdates.delete(key);
  return false;
}
