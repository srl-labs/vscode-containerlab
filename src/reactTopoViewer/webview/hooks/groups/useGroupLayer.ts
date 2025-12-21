/**
 * Hook to create and manage a Cytoscape layer for groups.
 * Uses cytoscape-layers to render groups as an interactive overlay while
 * keeping the filled group background BELOW the node layer.
 */
import { useEffect, useRef, useState } from 'react';
import type { Core as CyCore } from 'cytoscape';

import { log } from '../../utils/logger';
import {
  ensureCytoscapeLayersRegistered,
  getCytoscapeLayers,
  configureLayerNode,
  type IHTMLLayer
} from '../shared/cytoscapeLayers';

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

    ensureCytoscapeLayersRegistered();

    try {
      const layers = getCytoscapeLayers(cy);
      log.info('[GroupLayer] Creating background + interaction layers');

      // Visual fill layer BELOW the node layer
      const backgroundLayer = layers.nodeLayer.insertBefore('html');
      backgroundLayerRef.current = backgroundLayer;

      // Interactive handles layer at the TOP of all layers (above selectBoxLayer)
      // Using append() ensures it's on top of all Cytoscape canvas layers
      const interactionLayer = layers.append('html');
      interactionLayerRef.current = interactionLayer;

      // Configure layer nodes
      configureLayerNode(backgroundLayer.node, 'none', 'group-background-layer-container');
      configureLayerNode(interactionLayer.node, 'auto', 'group-interaction-layer-container');

      log.info('[GroupLayer] Layers created');
      setBackgroundLayerNode(backgroundLayer.node);
      setInteractionLayerNode(interactionLayer.node);
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
