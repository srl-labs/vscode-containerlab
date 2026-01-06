/**
 * Shared type helper functions for safe value extraction
 */

/**
 * Safely get string value, returns undefined if not a string
 */
export function getString(val: unknown): string | undefined {
  return typeof val === 'string' ? val : undefined;
}

/**
 * Safely get string value with empty string default.
 * Also converts numbers to strings for fields that may be stored as numbers.
 */
export function getStringOrEmpty(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return '';
}

/**
 * Safely get number value
 */
export function getNumber(val: unknown): number | undefined {
  return typeof val === 'number' ? val : undefined;
}

/**
 * Safely get boolean value
 */
export function getBoolean(val: unknown): boolean | undefined {
  return typeof val === 'boolean' ? val : undefined;
}

/**
 * Safely get string array
 */
export function getStringArray(val: unknown): string[] | undefined {
  return Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : undefined;
}

/**
 * Safely get record (object) value
 */
export function getRecord(val: unknown): Record<string, string> | undefined {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? val as Record<string, string>
    : undefined;
}
