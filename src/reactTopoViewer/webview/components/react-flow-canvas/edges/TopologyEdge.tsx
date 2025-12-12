/**
 * TopologyEdge - Custom React Flow edge with endpoint labels
 * Uses floating/straight edge style matching Cytoscape
 */
import React, { memo, useMemo } from 'react';
import {
  EdgeLabelRenderer,
  useInternalNode,
  type EdgeProps
} from '@xyflow/react';
import type { TopologyEdgeData } from '../types';
import { SELECTION_COLOR } from '../types';

// Edge style constants matching Cytoscape
const EDGE_COLOR_DEFAULT = '#969799';
const EDGE_COLOR_UP = '#00df2b';
const EDGE_COLOR_DOWN = '#df2b00';
const EDGE_WIDTH_NORMAL = 1.5;
const EDGE_WIDTH_SELECTED = 4;
const EDGE_OPACITY_NORMAL = 0.7;
const EDGE_OPACITY_SELECTED = 1;

// Label style constants matching Cytoscape
const LABEL_FONT_SIZE = '0.42em';
const LABEL_BG_COLOR = '#CACBCC';
const LABEL_TEXT_COLOR = '#000000';
const LABEL_OUTLINE_COLOR = '#FFFFFF';
const LABEL_PADDING = '1px 3px';
const LABEL_OFFSET = 20; // Pixels from node edge

/**
 * Get stroke color based on link status
 */
function getStrokeColor(linkStatus: string | undefined, selected: boolean): string {
  if (selected) return SELECTION_COLOR;
  switch (linkStatus) {
    case 'up':
      return EDGE_COLOR_UP;
    case 'down':
      return EDGE_COLOR_DOWN;
    default:
      return EDGE_COLOR_DEFAULT;
  }
}

/**
 * Calculate the intersection point of a line from center to target with a rectangle
 */
function getNodeIntersection(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const w = nodeWidth / 2;
  const h = nodeHeight / 2;
  const dx = targetX - nodeX;
  const dy = targetY - nodeY;

  if (dx === 0 && dy === 0) {
    return { x: nodeX, y: nodeY };
  }

  // Calculate intersection with rectangle bounds
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Determine which edge of the rectangle the line intersects
  if (absDx * h > absDy * w) {
    // Intersects left or right edge
    const sign = dx > 0 ? 1 : -1;
    return {
      x: nodeX + sign * w,
      y: nodeY + (dy * w) / absDx
    };
  } else {
    // Intersects top or bottom edge
    const sign = dy > 0 ? 1 : -1;
    return {
      x: nodeX + (dx * h) / absDy,
      y: nodeY + sign * h
    };
  }
}

/**
 * Get edge connection points between two nodes (like Cytoscape)
 */
function getEdgePoints(
  sourceNode: { x: number; y: number; width: number; height: number },
  targetNode: { x: number; y: number; width: number; height: number }
): { sx: number; sy: number; tx: number; ty: number } {
  const sourceCenter = {
    x: sourceNode.x + sourceNode.width / 2,
    y: sourceNode.y + sourceNode.height / 2
  };
  const targetCenter = {
    x: targetNode.x + targetNode.width / 2,
    y: targetNode.y + targetNode.height / 2
  };

  const sourcePoint = getNodeIntersection(
    sourceCenter.x,
    sourceCenter.y,
    sourceNode.width,
    sourceNode.height,
    targetCenter.x,
    targetCenter.y
  );

  const targetPoint = getNodeIntersection(
    targetCenter.x,
    targetCenter.y,
    targetNode.width,
    targetNode.height,
    sourceCenter.x,
    sourceCenter.y
  );

  return {
    sx: sourcePoint.x,
    sy: sourcePoint.y,
    tx: targetPoint.x,
    ty: targetPoint.y
  };
}

/**
 * Calculate label position along the edge
 */
function getLabelPosition(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  offset: number
): { x: number; y: number } {
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return { x: startX, y: startY };

  const ratio = Math.min(offset / length, 0.4); // Cap at 40% of edge length
  return {
    x: startX + dx * ratio,
    y: startY + dy * ratio
  };
}

/**
 * Label component for endpoint text
 */
function EndpointLabel({ text, x, y }: { text: string; x: number; y: number }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
    fontSize: LABEL_FONT_SIZE,
    fontFamily: 'inherit',
    color: LABEL_TEXT_COLOR,
    backgroundColor: LABEL_BG_COLOR,
    padding: LABEL_PADDING,
    borderRadius: 2,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    textShadow: `
      -0.3px -0.3px 0 ${LABEL_OUTLINE_COLOR},
       0.3px -0.3px 0 ${LABEL_OUTLINE_COLOR},
      -0.3px  0.3px 0 ${LABEL_OUTLINE_COLOR},
       0.3px  0.3px 0 ${LABEL_OUTLINE_COLOR}
    `,
    lineHeight: 1.2,
    zIndex: 1
  };

  return (
    <div style={style} className="topology-edge-label nodrag nopan">
      {text}
    </div>
  );
}

/**
 * TopologyEdge - Floating edge that connects nodes like Cytoscape
 * Edges go from node border to node border (not fixed handles)
 */
const TopologyEdgeComponent: React.FC<EdgeProps<TopologyEdgeData>> = ({
  id,
  source,
  target,
  data,
  selected
}) => {
  // Get internal node data for position calculations
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  // Calculate edge points
  const edgePoints = useMemo(() => {
    if (!sourceNode || !targetNode) {
      return null;
    }

    const sourcePos = sourceNode.internals.positionAbsolute;
    const targetPos = targetNode.internals.positionAbsolute;

    return getEdgePoints(
      {
        x: sourcePos.x,
        y: sourcePos.y,
        width: sourceNode.measured?.width ?? 40,
        height: sourceNode.measured?.height ?? 40
      },
      {
        x: targetPos.x,
        y: targetPos.y,
        width: targetNode.measured?.width ?? 40,
        height: targetNode.measured?.height ?? 40
      }
    );
  }, [sourceNode, targetNode]);

  // Calculate label positions
  const sourceLabelPos = useMemo(() => {
    if (!edgePoints) return { x: 0, y: 0 };
    return getLabelPosition(edgePoints.sx, edgePoints.sy, edgePoints.tx, edgePoints.ty, LABEL_OFFSET);
  }, [edgePoints]);

  const targetLabelPos = useMemo(() => {
    if (!edgePoints) return { x: 0, y: 0 };
    return getLabelPosition(edgePoints.tx, edgePoints.ty, edgePoints.sx, edgePoints.sy, LABEL_OFFSET);
  }, [edgePoints]);

  if (!edgePoints) {
    return null;
  }

  // Get stroke styling
  const isSelected = selected ?? false;
  const strokeColor = getStrokeColor(data?.linkStatus, isSelected);
  const strokeWidth = isSelected ? EDGE_WIDTH_SELECTED : EDGE_WIDTH_NORMAL;
  const strokeOpacity = isSelected ? EDGE_OPACITY_SELECTED : EDGE_OPACITY_NORMAL;

  // Create straight line path (like Cytoscape)
  const edgePath = `M ${edgePoints.sx} ${edgePoints.sy} L ${edgePoints.tx} ${edgePoints.ty}`;

  return (
    <>
      {/* Invisible wider path for easier selection */}
      <path
        id={`${id}-interaction`}
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
      />
      {/* Visible edge line */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity={strokeOpacity}
        style={{ cursor: 'pointer' }}
        className="react-flow__edge-path"
      />

      <EdgeLabelRenderer>
        {data?.sourceEndpoint && (
          <EndpointLabel
            text={data.sourceEndpoint}
            x={sourceLabelPos.x}
            y={sourceLabelPos.y}
          />
        )}
        {data?.targetEndpoint && (
          <EndpointLabel
            text={data.targetEndpoint}
            x={targetLabelPos.x}
            y={targetLabelPos.y}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
};

export const TopologyEdge = memo(TopologyEdgeComponent);
