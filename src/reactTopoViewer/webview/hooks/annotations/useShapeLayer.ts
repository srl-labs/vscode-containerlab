/**
 * Hook to create and manage a Cytoscape layer for shape annotations.
 * Uses cytoscape-layers to render shapes BELOW the node layer but above the grid.
 */
import { useEffect, useRef, useState } from 'react';
import type { Core as CyCore } from 'cytoscape';
import Layers from 'cytoscape-layers';
import cytoscape from 'cytoscape';

import { log } from '../../utils/logger';

// Register the plugin once (shared with useGroupLayer)
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
}

interface UseShapeLayerReturn {
  /** Layer node transformed with pan/zoom, rendered BELOW nodes */
  shapeLayerNode: HTMLElement | null;
  updateLayer: () => void;
}

/**
 * Creates an HTML layer below nodes for rendering shape annotations.
 * Shapes will appear above the grid but below nodes and edges.
 */
export function useShapeLayer(cy: CyCore | null): UseShapeLayerReturn {
  const layerRef = useRef<IHTMLLayer | null>(null);
  const [shapeLayerNode, setShapeLayerNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!cy) return;

    ensurePluginRegistered();

    try {
      // Get the layers API
      const layers = (cy as CyCore & { layers: () => ILayers }).layers();
      log.info('[ShapeLayer] Creating shape layer below nodes');

      // Create layer BELOW the node layer
      const shapeLayer = layers.nodeLayer.insertBefore('html');
      layerRef.current = shapeLayer;

      // Configure the layer node
      const layerNode = shapeLayer.node;
      layerNode.style.pointerEvents = 'auto';
      layerNode.style.overflow = 'visible';
      layerNode.style.transformOrigin = '0 0';
      layerNode.classList.add('shape-layer-container');

      log.info('[ShapeLayer] Shape layer created');
      setShapeLayerNode(layerNode);
    } catch (err) {
      log.error(`[ShapeLayer] Failed to create layer: ${err}`);
    }

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
      setShapeLayerNode(null);
    };
  }, [cy]);

  const updateLayer = () => {
    layerRef.current?.update();
  };

  return { shapeLayerNode, updateLayer };
}
