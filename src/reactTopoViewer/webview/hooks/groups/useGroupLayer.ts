/**
 * Hook to create and manage a Cytoscape layer for groups.
 * Uses cytoscape-layers to render groups as an interactive overlay while
 * keeping the filled group background BELOW the node layer.
 */
import { useEffect, useRef, useState } from 'react';
import type { Core as CyCore } from 'cytoscape';
import Layers from 'cytoscape-layers';
import cytoscape from 'cytoscape';

import { log } from '../../utils/logger';

// Register the plugin once
let pluginRegistered = false;
function ensurePluginRegistered(): void {
  if (!pluginRegistered) {
    cytoscape.use(Layers);
    pluginRegistered = true;
  }
}

interface IHTMLLayer {
  readonly type: 'html';
  readonly node: HTMLElement;
  remove(): void;
  update(): void;
}

interface ILayers {
  nodeLayer: {
    insertBefore: (type: 'html') => IHTMLLayer;
  };
  /** Append a layer at the very end - on top of ALL other layers including selectBoxLayer */
  append: (type: 'html') => IHTMLLayer;
}

interface UseGroupLayerReturn {
  /** Layer node transformed with pan/zoom, rendered BELOW nodes */
  backgroundLayerNode: HTMLElement | null;
  /** Layer node transformed with pan/zoom, rendered ABOVE nodes */
  interactionLayerNode: HTMLElement | null;
  updateLayers: () => void;
}

/**
 * Creates two HTML layers:
 * - Background layer below nodes (visual fill)
 * - Interaction layer above nodes (drag/resize handles)
 */
export function useGroupLayer(cy: CyCore | null): UseGroupLayerReturn {
  const backgroundLayerRef = useRef<IHTMLLayer | null>(null);
  const interactionLayerRef = useRef<IHTMLLayer | null>(null);
  const [backgroundLayerNode, setBackgroundLayerNode] = useState<HTMLElement | null>(null);
  const [interactionLayerNode, setInteractionLayerNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!cy) return;

    ensurePluginRegistered();

    try {
      // Get the layers API
      const layers = (cy as CyCore & { layers: () => ILayers }).layers();
      log.info('[GroupLayer] Creating background + interaction layers');

      // Visual fill layer BELOW the node layer
      const backgroundLayer = layers.nodeLayer.insertBefore('html');
      backgroundLayerRef.current = backgroundLayer;

      // Interactive handles layer at the TOP of all layers (above selectBoxLayer)
      // Using append() ensures it's on top of all Cytoscape canvas layers
      const interactionLayer = layers.append('html');
      interactionLayerRef.current = interactionLayer;

      // The layer node is a div that gets transformed with pan/zoom
      const backgroundNode = backgroundLayer.node;
      backgroundNode.style.pointerEvents = 'none';
      backgroundNode.style.overflow = 'visible';
      backgroundNode.style.transformOrigin = '0 0';
      backgroundNode.classList.add('group-background-layer-container');

      const interactionNode = interactionLayer.node;
      interactionNode.style.pointerEvents = 'auto';
      interactionNode.style.overflow = 'visible';
      interactionNode.style.transformOrigin = '0 0';
      interactionNode.classList.add('group-interaction-layer-container');

      log.info('[GroupLayer] Layers created');
      setBackgroundLayerNode(backgroundNode);
      setInteractionLayerNode(interactionNode);
    } catch (err) {
      log.error(`[GroupLayer] Failed to create layer: ${err}`);
    }

    return () => {
      backgroundLayerRef.current?.remove();
      interactionLayerRef.current?.remove();
      backgroundLayerRef.current = null;
      interactionLayerRef.current = null;
      setBackgroundLayerNode(null);
      setInteractionLayerNode(null);
    };
  }, [cy]);

  const updateLayers = () => {
    backgroundLayerRef.current?.update();
    interactionLayerRef.current?.update();
  };

  return { backgroundLayerNode, interactionLayerNode, updateLayers };
}
