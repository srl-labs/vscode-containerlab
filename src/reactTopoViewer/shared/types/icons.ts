/**
 * Custom icon type definitions for React TopoViewer.
 * Shared between extension and webview.
 */

/**
 * Information about a custom icon
 */
export interface CustomIconInfo {
  /** Icon name without extension (e.g., "my-router") */
  name: string;
  /** Where the icon was loaded from */
  source: "workspace" | "global";
  /** Base64 data URI for rendering */
  dataUri: string;
  /** Image format */
  format: "svg" | "png";
}

/**
 * Built-in icon names that ship with the extension
 */
export const BUILTIN_ICON_NAMES = new Set([
  "pe",
  "dcgw",
  "leaf",
  "switch",
  "bridge",
  "spine",
  "super-spine",
  "server",
  "pon",
  "controller",
  "rgw",
  "ue",
  "cloud",
  "client"
]);

/**
 * Check if an icon name is a built-in icon
 */
export function isBuiltInIcon(name: string): boolean {
  return BUILTIN_ICON_NAMES.has(name);
}

/**
 * Supported icon file extensions
 */
export const SUPPORTED_ICON_EXTENSIONS = new Set([".svg", ".png"]);

/**
 * Check if a file extension is a supported icon format
 */
export function isSupportedIconExtension(ext: string): boolean {
  return SUPPORTED_ICON_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Get MIME type for an icon file extension
 */
export function getIconMimeType(ext: string): string {
  const lower = ext.toLowerCase();
  if (lower === ".svg") return "image/svg+xml";
  if (lower === ".png") return "image/png";
  return "application/octet-stream";
}

/**
 * Get icon format from file extension
 */
export function getIconFormat(ext: string): "svg" | "png" {
  return ext.toLowerCase() === ".png" ? "png" : "svg";
}

/**
 * Extract unique custom icon names used by nodes in an element list.
 * Filters out built-in icons, returning only custom icon names.
 *
 * @param elements - Array of graph elements (nodes and edges)
 * @returns Array of unique custom icon names
 */
export function extractUsedCustomIcons<T extends { data?: { topoViewerRole?: string } }>(
  elements: T[]
): string[] {
  const usedIcons = new Set<string>();
  for (const el of elements) {
    const role = el.data?.topoViewerRole;
    if (role !== undefined && role.length > 0 && !isBuiltInIcon(role)) {
      usedIcons.add(role);
    }
  }
  return Array.from(usedIcons);
}
