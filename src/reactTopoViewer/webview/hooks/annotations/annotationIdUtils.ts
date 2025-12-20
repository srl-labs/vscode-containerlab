/**
 * Shared annotation ID generation utilities
 */

/**
 * Generates a unique annotation ID using crypto API
 * @param prefix - The prefix for the annotation type (e.g., 'freeText', 'freeShape', 'group')
 */
export function generateAnnotationId(prefix: string): string {
  const timestamp = Date.now();
  const uuid = globalThis.crypto.randomUUID();
  return `${prefix}_${timestamp}_${uuid.slice(0, 8)}`;
}
