/**
 * Shared utilities for cytoscape-layers plugin
 */
import Layers from 'cytoscape-layers';
import cytoscape from 'cytoscape';

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
  readonly type: 'html';
  readonly node: HTMLElement;
  remove(): void;
  update(): void;
}

/** Layers API interface from cytoscape-layers */
export interface ILayers {
  nodeLayer: {
    insertBefore: (type: 'html') => IHTMLLayer;
  };
  /** Append a layer at the very end - on top of ALL other layers including selectBoxLayer */
  append: (type: 'html') => IHTMLLayer;
}

/**
 * Configure common layer node styles
 */
export function configureLayerNode(
  node: HTMLElement,
  pointerEvents: 'auto' | 'none',
  className: string
): void {
  node.style.pointerEvents = pointerEvents;
  node.style.overflow = 'visible';
  node.style.transformOrigin = '0 0';
  node.classList.add(className);
}
