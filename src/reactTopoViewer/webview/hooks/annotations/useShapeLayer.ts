/**
 * Hook to create and manage a Cytoscape layer for shape annotations.
 * Uses cytoscape-layers to render shapes BELOW the node layer but above the grid.
 */
import { useEffect, useRef, useState } from 'react';
import type { Core as CyCore } from 'cytoscape';

import { log } from '../../utils/logger';
import {
  ensureCytoscapeLayersRegistered,
  configureLayerNode,
  type IHTMLLayer,
  type ILayers
} from '../shared/cytoscapeLayers';

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

    ensureCytoscapeLayersRegistered();

    try {
      // Get the layers API
      const layers = (cy as CyCore & { layers: () => ILayers }).layers();
      log.info('[ShapeLayer] Creating shape layer below nodes');

      // Create layer BELOW the node layer
      const shapeLayer = layers.nodeLayer.insertBefore('html');
      layerRef.current = shapeLayer;

      // Configure the layer node
      configureLayerNode(shapeLayer.node, 'auto', 'shape-layer-container');

      log.info('[ShapeLayer] Shape layer created');
      setShapeLayerNode(shapeLayer.node);
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
