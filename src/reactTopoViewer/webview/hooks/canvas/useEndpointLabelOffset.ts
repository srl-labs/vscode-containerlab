/**
 * Apply source/target endpoint label offsets to edges.
 * Per-link overrides take precedence over the global setting.
 */
import { useEffect } from 'react';
import type { Core as CyCore, EdgeSingular, EventObject, NodeSingular } from 'cytoscape';

import type { EdgeAnnotation } from '../../../shared/types/topology';
import type { EdgeIdentity } from '../../utils/edgeAnnotations';
import { buildEdgeAnnotationLookup, findEdgeAnnotationInLookup } from '../../utils/edgeAnnotations';
import { clampEndpointLabelOffset, parseEndpointLabelOffset } from '../../utils/endpointLabelOffset';

const OFFSET_STYLE_KEYS = 'source-text-offset target-text-offset';

export type EndpointLabelOffsetConfig = {
  globalEnabled: boolean;
  globalOffset: number;
  edgeAnnotations?: EdgeAnnotation[];
};

function applyOffset(edge: EdgeSingular, offset: number): void {
  // Apply the offset directly without zoom-dependent clamping.
  // Previous clamping logic caused labels to shift during zoom when edge stats
  // updates triggered recalculation at different zoom levels.
  edge.style({
    'source-text-offset': offset,
    'target-text-offset': offset
  });
}

function getEdgeIdentity(edge: EdgeSingular): EdgeIdentity {
  return {
    id: edge.id(),
    source: edge.data('source') as string | undefined,
    target: edge.data('target') as string | undefined,
    sourceEndpoint: edge.data('sourceEndpoint') as string | undefined,
    targetEndpoint: edge.data('targetEndpoint') as string | undefined,
  };
}

export function useEndpointLabelOffset(
  cyInstance: CyCore | null,
  config: EndpointLabelOffsetConfig
): void {
  useEffect(() => {
    if (!cyInstance) return;

    const globalOffset = clampEndpointLabelOffset(config.globalOffset);
    const lookup = buildEdgeAnnotationLookup(config.edgeAnnotations);

    const resolveOffset = (edge: EdgeSingular): { apply: boolean; offset: number } => {
      const annotation = findEdgeAnnotationInLookup(lookup, getEdgeIdentity(edge));
      const hasOverride = annotation
        ? (annotation.endpointLabelOffsetEnabled ?? annotation.endpointLabelOffset !== undefined)
        : false;

      if (hasOverride) {
        const overrideOffset = parseEndpointLabelOffset(annotation?.endpointLabelOffset);
        return { apply: true, offset: overrideOffset ?? globalOffset };
      }
      if (config.globalEnabled) {
        return { apply: true, offset: globalOffset };
      }
      return { apply: false, offset: 0 };
    };

    const applyEdgeOffset = (edge: EdgeSingular) => {
      const { apply, offset } = resolveOffset(edge);
      if (apply) {
        applyOffset(edge, offset);
      } else {
        edge.removeStyle(OFFSET_STYLE_KEYS);
      }
    };

    const applyToEdges = () => {
      const edges = cyInstance.edges();
      edges.forEach(edge => applyEdgeOffset(edge as EdgeSingular));
    };

    const handleEdgeChange = (evt: EventObject) => {
      const edge = evt.target as EdgeSingular;
      if (!edge || !edge.isEdge()) return;
      applyEdgeOffset(edge);
    };

    const handleNodePosition = (evt: EventObject) => {
      const node = evt.target as NodeSingular;
      if (!node || !node.isNode()) return;
      node.connectedEdges().forEach(edge => applyEdgeOffset(edge as EdgeSingular));
    };

    const handleLayoutStop = () => {
      cyInstance.edges().forEach(edge => applyEdgeOffset(edge as EdgeSingular));
    };

    applyToEdges();
    cyInstance.on('add', 'edge', handleEdgeChange);
    cyInstance.on('data', 'edge', handleEdgeChange);
    cyInstance.on('position', 'node', handleNodePosition);
    cyInstance.on('layoutstop', handleLayoutStop);

    return () => {
      cyInstance.off('add', 'edge', handleEdgeChange);
      cyInstance.off('data', 'edge', handleEdgeChange);
      cyInstance.off('position', 'node', handleNodePosition);
      cyInstance.off('layoutstop', handleLayoutStop);
    };
  }, [cyInstance, config.globalEnabled, config.globalOffset, config.edgeAnnotations]);
}
