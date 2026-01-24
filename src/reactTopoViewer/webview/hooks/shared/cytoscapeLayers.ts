/**
 * Shared utilities for annotation layers
 *
 * NOTE: This is a stub for ReactFlow migration.
 * The cytoscape-layers plugin is no longer used.
 * Annotations are rendered via React components overlaid on ReactFlow.
 */

/** Stub - no longer needed */
export function ensureCytoscapeLayersRegistered(): void {
  // No-op - ReactFlow doesn't use cytoscape-layers
}

/** HTML layer interface - kept for type compatibility */
export interface IHTMLLayer {
  readonly type: "html";
  readonly node: HTMLElement;
  remove(): void;
  update(): void;
}

/** Layers API interface - kept for type compatibility */
export interface ILayers {
  nodeLayer: {
    insertBefore: (type: "html") => IHTMLLayer;
  };
  append: (type: "html") => IHTMLLayer;
}

/**
 * Stub - returns a mock layers API
 * Annotation layers are now rendered via React portals in ReactFlow
 */
export function getCytoscapeLayers(_cy: unknown): ILayers {
  // Create stub layer that returns a div element
  const createStubLayer = (): IHTMLLayer => {
    const node = document.createElement("div");
    node.style.position = "absolute";
    node.style.top = "0";
    node.style.left = "0";
    node.style.width = "100%";
    node.style.height = "100%";
    node.style.pointerEvents = "none";

    return {
      type: "html" as const,
      node,
      remove: () => {
        if (node.parentElement) {
          node.parentElement.removeChild(node);
        }
      },
      update: () => {
        // No-op
      }
    };
  };

  return {
    nodeLayer: {
      insertBefore: (_type: "html") => createStubLayer()
    },
    append: (_type: "html") => createStubLayer()
  };
}

/**
 * Configure common layer node styles.
 */
export function configureLayerNode(
  node: HTMLElement,
  pointerEvents: "auto" | "none",
  className: string
): void {
  node.style.pointerEvents = pointerEvents;
  node.style.overflow = "visible";
  node.style.transformOrigin = "0 0";
  node.classList.add(className);

  if (pointerEvents === "none" && node.parentElement) {
    node.parentElement.style.pointerEvents = "none";
  }
}
