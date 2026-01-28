/**
 * Cytoscape initialization, layouts, and configuration utilities
 */
import type { Core, CytoscapeOptions, LayoutOptions } from "cytoscape";
import cytoscape from "cytoscape";
import cola from "cytoscape-cola";

import type { CyElement } from "../../../shared/types/messages";
import type { CustomIconInfo } from "../../../shared/types/icons";
import { log } from "../../utils/logger";
import { generateEncodedSVG, type NodeType } from "../../utils/SvgGenerator";
import { applyCustomIconStyles } from "../../utils/cytoscapeHelpers";

import { cytoscapeStyles, ROLE_SVG_MAP } from "./styles";

let colaRegistered = false;

/**
 * Apply stub-link class to edges connected to network nodes (cloud)
 * This ensures dashed styling for network connections regardless of how elements were loaded
 */
export function applyStubLinkClasses(cy: Core): void {
  cy.edges().forEach((edge) => {
    const sourceRole = edge.source().data("topoViewerRole") as string | undefined;
    const targetRole = edge.target().data("topoViewerRole") as string | undefined;
    if (sourceRole === "cloud" || targetRole === "cloud") {
      edge.addClass("stub-link");
    }
  });
}

export function ensureColaRegistered(): void {
  if (!colaRegistered) {
    cytoscape.use(cola);
    colaRegistered = true;
  }
}

/**
 * Check if elements have preset positions (from annotations file)
 * Returns true if ANY regular topology node has a non-zero position
 * This preserves existing positions while allowing new nodes to be added
 *
 * Excluded from check:
 * - Group nodes (their positions are computed from children)
 * - Free text/shape annotations (user-created, always have positions)
 * - Cloud/network nodes (dynamically discovered from links, may not have stored positions)
 */
export function hasPresetPositions(elements: CyElement[]): boolean {
  // Filter to regular topology nodes only
  const regularNodes = elements.filter((el) => {
    if (el.group !== "nodes") return false;
    const role = el.data?.topoViewerRole;
    // Exclude group nodes, annotations, and cloud/network nodes
    return role !== "group" && role !== "freeText" && role !== "freeShape" && role !== "cloud";
  });

  if (regularNodes.length === 0) return false;

  // Use preset layout if ANY regular topology node has a stored position
  // This preserves existing positions when new nodes are added
  return regularNodes.some((node) => {
    const pos = node.position;
    return pos && (pos.x !== 0 || pos.y !== 0);
  });
}

/**
 * Extended layout options including animation properties
 */
type ExtendedLayoutOptions = LayoutOptions & {
  animate?: boolean;
  animationDuration?: number;
  [key: string]: unknown;
};

/**
 * Get layout options for a given layout name
 */
export function getLayoutOptions(layoutName: string): ExtendedLayoutOptions {
  const layouts: Record<string, ExtendedLayoutOptions> = {
    cose: {
      name: "cose",
      animate: true,
      animationDuration: 500,
      randomize: true, // Add initial jitter when nodes start at same position
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 100,
      edgeElasticity: () => 100
    },
    grid: { name: "grid", animate: true, animationDuration: 300 },
    circle: { name: "circle", animate: true, animationDuration: 300 },
    concentric: { name: "concentric", animate: true, animationDuration: 300 },
    preset: { name: "preset", animate: false },
    cola: {
      name: "cola",
      animate: true,
      maxSimulationTime: 1500,
      fit: true,
      edgeLength: 120,
      nodeSpacing: 12
    },
    breadthfirst: {
      name: "breadthfirst",
      directed: true,
      animate: true,
      animationDuration: 400,
      spacingFactor: 0.8
    }
  };
  return layouts[layoutName] || layouts.cose;
}

/**
 * Create Cytoscape configuration options
 */
export function createCytoscapeConfig(
  container: HTMLElement,
  elements: CyElement[]
): CytoscapeOptions {
  return {
    container: container,
    elements: elements,
    style: cytoscapeStyles,
    layout: { name: "preset" },
    boxSelectionEnabled: true,
    selectionType: "additive",
    wheelSensitivity: 0,
    textureOnViewport: true,
    hideEdgesOnViewport: false,
    hideLabelsOnViewport: false,
    pixelRatio: "auto",
    motionBlur: false,
    motionBlurOpacity: 0.2
  };
}

export type NodePositions = Array<{ id: string; position: { x: number; y: number } }>;

/**
 * Collect node positions from Cytoscape (for syncing to React state after layout)
 */
export function collectNodePositions(cy: Core): NodePositions {
  const excludedRoles = new Set(["group", "freeText", "freeShape"]);
  const positions: NodePositions = [];

  cy.nodes().forEach((node) => {
    const id = node.id();
    const role = node.data("topoViewerRole") as string | undefined;
    if (!id) return;
    if (role && excludedRoles.has(role)) return;
    const pos = node.position();
    positions.push({ id, position: { x: Math.round(pos.x), y: Math.round(pos.y) } });
  });

  return positions;
}

/**
 * Apply custom iconColor, iconCornerRadius, and custom icons to all nodes.
 * Cytoscape stylesheets are static, so we must update the style directly for each node.
 * Note: iconColor and iconCornerRadius are stored at the top level of node data (not in extraData).
 *
 * @param cy - Cytoscape core instance
 * @param customIcons - Optional array of custom icons to use for non-built-in icon names
 */
export function applyNodeIconColors(cy: Core, customIcons?: CustomIconInfo[]): void {
  // Build a map for quick lookup
  const customIconMap = new Map<string, string>();
  if (customIcons) {
    for (const icon of customIcons) {
      customIconMap.set(icon.name, icon.dataUri);
    }
  }

  cy.nodes().forEach((node) => {
    // iconColor and iconCornerRadius are at top-level of data (from NodeElementBuilder)
    const iconColor = node.data("iconColor") as string | undefined;
    const iconCornerRadius = node.data("iconCornerRadius") as number | undefined;
    const role = (node.data("topoViewerRole") as string) || "default";

    // Check if this is a custom icon
    const customIconDataUri = customIconMap.get(role);
    if (customIconDataUri) {
      applyCustomIconStyles(node, customIconDataUri, iconCornerRadius);
    } else {
      // Built-in icon with optional color
      const svgType = ROLE_SVG_MAP[role] as NodeType | undefined;
      if (iconColor && svgType) {
        node.style("background-image", generateEncodedSVG(svgType, iconColor));
      }
    }

    // Apply iconCornerRadius - requires round-rectangle shape
    if (iconCornerRadius !== undefined && iconCornerRadius > 0) {
      node.style("shape", "round-rectangle");
      node.style("corner-radius", iconCornerRadius);
    }
  });
}

/**
 * Update cytoscape elements and apply layout
 * @param onLayoutComplete - Optional callback called after layout completes with node positions
 */
export function updateCytoscapeElements(
  cy: Core,
  elements: CyElement[],
  customIcons?: CustomIconInfo[],
  onLayoutComplete?: (positions: NodePositions) => void
): void {
  const usePresetLayout = hasPresetPositions(elements);
  cy.batch(() => {
    cy.elements().remove();
    cy.add(elements);
  });

  // Apply stub-link class to edges connected to network/cloud nodes
  applyStubLinkClasses(cy);

  // Apply custom iconColor and custom icons to nodes
  applyNodeIconColors(cy, customIcons);

  // Run COSE layout if no preset positions OR all nodes are at origin
  const needsAutoLayout = !usePresetLayout || nodesNeedAutoLayout(cy);

  if (needsAutoLayout) {
    cy.one("layoutstop", () => {
      cy.scratch("initialLayoutDone", true);
      // Sync positions back to React state so they persist
      if (onLayoutComplete) {
        onLayoutComplete(collectNodePositions(cy));
      }
    });
    cy.layout(getLayoutOptions("cose")).run();
  } else {
    cy.fit(undefined, 50);
    cy.scratch("initialLayoutDone", true);
  }
}

/**
 * Check if nodes need automatic layout (all at origin or no valid positions)
 * This is a runtime check on actual Cytoscape nodes, not React elements
 */
export function nodesNeedAutoLayout(cy: Core): boolean {
  const nodes = cy.nodes();
  if (nodes.length === 0) return false;

  // Check if all regular topology nodes are at or near the origin
  const excludedRoles = new Set(["group", "freeText", "freeShape", "cloud"]);
  let regularNodeCount = 0;
  let nodesAtOrigin = 0;

  nodes.forEach((node) => {
    const role = node.data("topoViewerRole") as string | undefined;
    if (role && excludedRoles.has(role)) return;

    regularNodeCount++;
    const pos = node.position();
    // Consider positions within a small epsilon of origin as "at origin"
    if (Math.abs(pos.x) < 1 && Math.abs(pos.y) < 1) {
      nodesAtOrigin++;
    }
  });

  // Run auto-layout if all regular nodes are at/near origin
  return regularNodeCount > 0 && nodesAtOrigin === regularNodeCount;
}

/**
 * Handle cytoscape ready event - applies styles only, layout is handled by useElementsUpdate
 */
export function handleCytoscapeReady(
  cy: Core,
  _usePresetLayout: boolean,
  customIcons?: CustomIconInfo[]
): void {
  log.info(
    `[CytoscapeCanvas] Cytoscape ready - nodes: ${cy.nodes().length}, edges: ${cy.edges().length}`
  );

  // Check if canvas was created
  const container = cy.container();
  if (container) {
    const canvas = container.querySelector("canvas");
    if (canvas) {
      log.info(`[CytoscapeCanvas] Canvas element found: ${canvas.width}x${canvas.height}`);
    } else {
      log.error("[CytoscapeCanvas] No canvas element found inside container!");
    }
  }

  // Log first node position for debugging
  const firstNode = cy.nodes().first();
  if (firstNode.length > 0) {
    const pos = firstNode.position();
    const bb = firstNode.boundingBox();
    log.info(
      `[CytoscapeCanvas] First node - pos: (${pos.x}, ${pos.y}), bbox: w=${bb.w}, h=${bb.h}`
    );
  }

  // Apply stub-link class to edges connected to network/cloud nodes
  applyStubLinkClasses(cy);

  // Apply custom iconColor and custom icons to nodes
  applyNodeIconColors(cy, customIcons);

  // NOTE: Layout is NOT run here - it's handled by useElementsUpdate which has
  // access to the callback to sync positions back to React state
}
