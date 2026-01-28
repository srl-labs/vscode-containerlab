/**
 * Shared utilities for cytoscape-layers plugin
 */
import Layers from "cytoscape-layers";
import cytoscape from "cytoscape";

// Register the plugin once (shared across all layer hooks)
let pluginRegistered = false;
export function ensureCytoscapeLayersRegistered(): void {
  if (!pluginRegistered) {
    cytoscape.use(Layers);
    pluginRegistered = true;
  }
}

/** HTML layer interface from cytoscape-layers */
export interface IHTMLLayer {
  readonly type: "html";
  readonly node: HTMLElement;
  remove(): void;
  update(): void;
}

/** Layers API interface from cytoscape-layers */
export interface ILayers {
  nodeLayer: {
    insertBefore: (type: "html") => IHTMLLayer;
  };
  /** Append a layer at the very end - on top of ALL other layers including selectBoxLayer */
  append: (type: "html") => IHTMLLayer;
}

/**
 * Get the layers API from a Cytoscape instance
 */
export function getCytoscapeLayers(cy: cytoscape.Core): ILayers {
  return (cy as cytoscape.Core & { layers: () => ILayers }).layers();
}

/**
 * Configure common layer node styles.
 * Also configures parent wrapper created by cytoscape-layers to allow click-through.
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

  // cytoscape-layers creates a parent wrapper div - configure it too
  // This ensures clicks can pass through to layers below when pointerEvents is 'none'
  if (pointerEvents === "none" && node.parentElement) {
    node.parentElement.style.pointerEvents = "none";
  }
}
