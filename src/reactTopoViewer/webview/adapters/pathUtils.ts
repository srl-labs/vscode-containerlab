/**
 * Shared path utilities for FileSystemAdapter implementations
 * Works with both Windows and Unix paths
 */

/**
 * Get directory name from a path
 */
export function dirname(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (lastSlash === -1) return ".";
  if (lastSlash === 0) return "/";
  return filePath.substring(0, lastSlash);
}

/**
 * Get base name (file name) from a path
 */
export function basename(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return filePath.substring(lastSlash + 1);
}

/**
 * Join path segments
 */
export function join(...segments: string[]): string {
  return segments.join("/").replace(/\/+/g, "/");
}
