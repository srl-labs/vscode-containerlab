/**
 * Cytoscape helper functions with proper typing.
 * These helpers provide type-safe access to element data.
 */

import type { CyElement } from "../../shared/types/topology";

/**
 * Node data properties from CyElement.data
 */
export interface CyNodeData {
  id: string;
  label?: string;
  name?: string;
  kind?: string;
  type?: string;
  image?: string;
  parent?: string;
  [key: string]: unknown;
}

/**
 * Edge data properties from CyElement.data
 */
export interface CyEdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  [key: string]: unknown;
}

/**
 * Type guard to check if an element is a node
 */
export function isNodeElement(el: CyElement): boolean {
  return el.group === "nodes";
}

/**
 * Type guard to check if an element is an edge
 */
export function isEdgeElement(el: CyElement): boolean {
  return el.group === "edges";
}

/**
 * Get typed node data from a CyElement
 */
export function getNodeData(el: CyElement): CyNodeData {
  return el.data as CyNodeData;
}

/**
 * Get typed edge data from a CyElement
 */
export function getEdgeData(el: CyElement): CyEdgeData {
  return el.data as CyEdgeData;
}

/**
 * Get element ID from data (works for both nodes and edges)
 */
export function getElementId(el: CyElement): string | undefined {
  return (el.data as { id?: string }).id;
}

/**
 * Get edge source node ID
 */
export function getEdgeSource(el: CyElement): string | undefined {
  return (el.data as { source?: string }).source;
}

/**
 * Get edge target node ID
 */
export function getEdgeTarget(el: CyElement): string | undefined {
  return (el.data as { target?: string }).target;
}

/**
 * Default icon color for built-in icons
 */
export const DEFAULT_ICON_COLOR = "#005aff";

/**
 * Common style properties for custom icon nodes.
 * Custom icons need these layout properties to render correctly.
 * Uses 'contain' to scale the full icon, and transparent background.
 * Matches legacy topoViewer behavior.
 */
export const CUSTOM_ICON_STYLES = {
  width: "14",
  height: "14",
  "background-fit": "contain",
  "background-position-x": "50%",
  "background-position-y": "50%",
  "background-repeat": "no-repeat",
  "background-color": "rgba(0, 0, 0, 0)",
  "background-opacity": 0
  // Note: background-clip is set dynamically based on corner radius
} as const;

/**
 * Interface for a Cytoscape node with .style() method
 */
interface CyNodeWithStyle {
  style(property: string, value: string | number): void;
}

/**
 * Apply custom icon styles to a Cytoscape node.
 * This sets all the required styles for custom icons to render correctly.
 *
 * @param node - The Cytoscape node instance
 * @param dataUri - The data URI of the custom icon
 * @param iconCornerRadius - Optional corner radius for clipping
 */
export function applyCustomIconStyles(
  node: CyNodeWithStyle,
  dataUri: string,
  iconCornerRadius?: number
): void {
  // Custom icons render as-is (no color tinting)
  // Apply layout styles that built-in roles get from stylesheet selectors
  node.style("background-image", dataUri);
  node.style("width", CUSTOM_ICON_STYLES.width);
  node.style("height", CUSTOM_ICON_STYLES.height);
  node.style("background-fit", CUSTOM_ICON_STYLES["background-fit"]);
  node.style("background-position-x", CUSTOM_ICON_STYLES["background-position-x"]);
  node.style("background-position-y", CUSTOM_ICON_STYLES["background-position-y"]);
  node.style("background-repeat", CUSTOM_ICON_STYLES["background-repeat"]);
  node.style("background-color", CUSTOM_ICON_STYLES["background-color"]);
  node.style("background-opacity", CUSTOM_ICON_STYLES["background-opacity"]);
  // Use 'node' clip when corner radius is set so icon gets clipped to rounded shape
  const clipMode = iconCornerRadius !== undefined && iconCornerRadius > 0 ? "node" : "none";
  node.style("background-clip", clipMode);
}
