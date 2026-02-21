import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "@xyflow/react";
import type { ConnectionLineComponentProps, Edge, Node } from "@xyflow/react";

import { useEdges } from "../../stores/graphStore";
import { allocateEndpointsForLink } from "../../utils/endpointAllocator";
import { buildEdgeId } from "../../utils/edgeId";

import { calculateControlPoint, getEdgePoints, getLabelPosition } from "./edgeGeometry";

type RafThrottled<Args extends unknown[]> = ((...args: Args) => void) & { cancel: () => void };

function rafThrottle<Args extends unknown[]>(func: (...args: Args) => void): RafThrottled<Args> {
  let rafId: number | null = null;
  let lastArgs: Args | null = null;

  const throttled = (...args: Args) => {
    lastArgs = args;
    rafId ??= window.requestAnimationFrame(() => {
      if (lastArgs) {
        func(...lastArgs);
        lastArgs = null;
      }
      rafId = null;
    });
  };

  throttled.cancel = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return throttled as RafThrottled<Args>;
}

// Link preview style (match TopologyEdge defaults)
const LINK_PREVIEW_COLOR = "#969799";
const LINK_PREVIEW_WIDTH = 2.5;
const LINK_PREVIEW_OPACITY = 0.5;
const LINK_PREVIEW_ICON_SIZE = 40;
const LINK_PREVIEW_CONTROL_POINT_STEP_SIZE = 40;
const LINK_PREVIEW_LOOP_EDGE_SIZE = 50;
const LINK_PREVIEW_LOOP_EDGE_OFFSET = 10;
const LINK_LABEL_OFFSET = 30;
const LINK_LABEL_FONT_SIZE = 10;
const LINK_LABEL_BG_COLOR = "var(--topoviewer-edge-label-background)";
const LINK_LABEL_TEXT_COLOR = "var(--topoviewer-edge-label-foreground)";
const LINK_LABEL_OUTLINE_COLOR = "var(--topoviewer-edge-label-outline)";
const LINK_LABEL_PADDING_X = 2;
const LINK_LABEL_PADDING_Y = 0;
const LINK_LABEL_BORDER_RADIUS = 4;
const LINK_LABEL_SHADOW_SMALL = 2;
const LINK_LABEL_SHADOW_LARGE = 3;

function buildLinkLabelStyle(zoom: number): React.CSSProperties {
  const scaledFont = Math.max(1, LINK_LABEL_FONT_SIZE * zoom);
  const padX = LINK_LABEL_PADDING_X * zoom;
  const padY = LINK_LABEL_PADDING_Y * zoom;
  const radius = LINK_LABEL_BORDER_RADIUS * zoom;
  const shadowSmall = LINK_LABEL_SHADOW_SMALL * zoom;
  const shadowLarge = LINK_LABEL_SHADOW_LARGE * zoom;

  return {
    position: "absolute",
    top: 0,
    left: 0,
    fontSize: `${scaledFont}px`,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    color: LINK_LABEL_TEXT_COLOR,
    backgroundColor: LINK_LABEL_BG_COLOR,
    padding: `${padY}px ${padX}px`,
    borderRadius: radius,
    pointerEvents: "none",
    whiteSpace: "nowrap",
    textShadow: `0 0 ${shadowSmall}px ${LINK_LABEL_OUTLINE_COLOR}, 0 0 ${shadowSmall}px ${LINK_LABEL_OUTLINE_COLOR}, 0 0 ${shadowLarge}px ${LINK_LABEL_OUTLINE_COLOR}`,
    lineHeight: 1.2,
    zIndex: 1,
  };
}

function getNodePosition(node: Node): { x: number; y: number } {
  const internal = (node as Node & { internals?: { positionAbsolute: { x: number; y: number } } })
    .internals;
  return internal?.positionAbsolute ?? node.position;
}

function buildPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  controlPoint: { x: number; y: number } | null
): string {
  if (!controlPoint) {
    return `M ${sx} ${sy} L ${tx} ${ty}`;
  }
  return `M ${sx} ${sy} Q ${controlPoint.x} ${controlPoint.y} ${tx} ${ty}`;
}

function isSameEdgePair(edge: Edge, sourceId: string, targetId: string): boolean {
  return (
    (edge.source === sourceId && edge.target === targetId) ||
    (edge.source === targetId && edge.target === sourceId)
  );
}

function getPreviewParallelInfo(
  edges: Edge[],
  sourceId: string,
  targetId: string,
  previewId?: string | null
): { index: number; total: number; isCanonicalDirection: boolean } {
  const existingIds = edges
    .filter((edge) => edge.source !== edge.target && isSameEdgePair(edge, sourceId, targetId))
    .map((edge) => edge.id);

  if (previewId !== undefined && previewId !== null && previewId.length > 0) {
    const ids = [...existingIds, previewId].sort((a, b) => a.localeCompare(b));
    const index = Math.max(0, ids.indexOf(previewId));
    return {
      index,
      total: ids.length,
      isCanonicalDirection: sourceId.localeCompare(targetId) <= 0,
    };
  }

  return {
    index: existingIds.length,
    total: existingIds.length + 1,
    isCanonicalDirection: sourceId.localeCompare(targetId) <= 0,
  };
}

interface LoopPreviewGeometry {
  path: string;
  sourceLabelPos: { x: number; y: number };
  targetLabelPos: { x: number; y: number };
}

function calculateLoopEdgeGeometry(
  nodeX: number,
  nodeY: number,
  nodeSize: number,
  loopIndex: number,
  scale: number
): LoopPreviewGeometry {
  const centerX = nodeX + nodeSize / 2;
  const centerY = nodeY + nodeSize / 2;
  const size = (LINK_PREVIEW_LOOP_EDGE_SIZE + loopIndex * LINK_PREVIEW_LOOP_EDGE_OFFSET) * scale;

  const startX = centerX + nodeSize / 2;
  const startY = centerY - nodeSize / 4;
  const endX = centerX + nodeSize / 2;
  const endY = centerY + nodeSize / 4;

  const cp1X = startX + size;
  const cp1Y = startY - size * 0.5;
  const cp2X = endX + size;
  const cp2Y = endY + size * 0.5;

  const path = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
  const labelX = centerX + nodeSize / 2 + size * 0.8;
  const labelY = centerY;
  const labelOffset = 10 * scale;

  return {
    path,
    sourceLabelPos: { x: labelX, y: labelY - labelOffset },
    targetLabelPos: { x: labelX, y: labelY + labelOffset },
  };
}

/**
 * Custom connection line component
 */
export const CustomConnectionLine: React.FC<ConnectionLineComponentProps> = ({
  fromX,
  fromY,
  toX,
  toY,
  fromNode,
  toNode,
}) => {
  const edges = useEdges();

  let path = buildPath(fromX, fromY, toX, toY, null);

  if (toNode) {
    const sourceId = fromNode.id;
    const targetId = toNode.id;
    const iconSize = LINK_PREVIEW_ICON_SIZE;

    if (sourceId === targetId) {
      const nodeWidth = fromNode.measured.width ?? iconSize;
      const nodePos = getNodePosition(fromNode);
      const nodeX = nodePos.x + (nodeWidth - iconSize) / 2;
      const nodeY = nodePos.y;
      const loopIndex = edges.filter(
        (edge) => edge.source === sourceId && edge.target === sourceId
      ).length;
      path = calculateLoopEdgeGeometry(nodeX, nodeY, iconSize, loopIndex, 1).path;
    } else {
      const sourceWidth = fromNode.measured.width ?? iconSize;
      const targetWidth = toNode.measured.width ?? iconSize;
      const sourcePos = getNodePosition(fromNode);
      const targetPos = getNodePosition(toNode);

      const points = getEdgePoints(
        {
          x: sourcePos.x + (sourceWidth - iconSize) / 2,
          y: sourcePos.y,
          width: iconSize,
          height: iconSize,
        },
        {
          x: targetPos.x + (targetWidth - iconSize) / 2,
          y: targetPos.y,
          width: iconSize,
          height: iconSize,
        }
      );

      const parallelInfo = getPreviewParallelInfo(edges, sourceId, targetId);
      const controlPoint = calculateControlPoint(
        points.sx,
        points.sy,
        points.tx,
        points.ty,
        parallelInfo.index,
        parallelInfo.total,
        parallelInfo.isCanonicalDirection,
        LINK_PREVIEW_CONTROL_POINT_STEP_SIZE
      );
      path = buildPath(points.sx, points.sy, points.tx, points.ty, controlPoint);
    }
  }

  return (
    <path
      d={path}
      fill="none"
      className="react-flow__edge-path"
      style={{
        stroke: LINK_PREVIEW_COLOR,
        strokeWidth: LINK_PREVIEW_WIDTH,
        opacity: LINK_PREVIEW_OPACITY,
      }}
    />
  );
};

interface PreviewLinkInfo {
  previewId: string | null;
  parallelInfo: { index: number; total: number; isCanonicalDirection: boolean };
  loopIndex: number;
  sourceEndpoint: string;
  targetEndpoint: string;
}

function buildPreviewLinkInfo(
  nodes: Node[],
  edges: Edge[],
  linkSourceNodeId: string,
  targetNode: Node | null,
  linkCreationSeed?: number | null
): PreviewLinkInfo | null {
  if (!targetNode) return null;

  const { sourceEndpoint, targetEndpoint } = allocateEndpointsForLink(
    nodes,
    edges,
    linkSourceNodeId,
    targetNode.id
  );
  const previewId =
    linkCreationSeed !== null && linkCreationSeed !== undefined
      ? buildEdgeId(
          linkSourceNodeId,
          targetNode.id,
          sourceEndpoint,
          targetEndpoint,
          linkCreationSeed
        )
      : null;

  const parallelInfo = getPreviewParallelInfo(edges, linkSourceNodeId, targetNode.id, previewId);
  const loopIndex = edges.filter(
    (edge) => edge.source === targetNode.id && edge.target === targetNode.id
  ).length;

  return { previewId, parallelInfo, loopIndex, sourceEndpoint, targetEndpoint };
}

type PreviewGeometry = {
  path: string;
  sourceLabelPos: { x: number; y: number } | null;
  targetLabelPos: { x: number; y: number } | null;
  sourceLabel: string;
  targetLabel: string;
};

function buildLoopPreviewGeometry(params: {
  sourceNode: Node;
  viewport: { x: number; y: number; zoom: number };
  iconSize: number;
  loopIndex: number;
  sourceLabel: string;
  targetLabel: string;
}): PreviewGeometry {
  const { sourceNode, viewport, iconSize, loopIndex, sourceLabel, targetLabel } = params;
  const zoom = viewport.zoom;
  const sourcePos = getNodePosition(sourceNode);
  const nodeWidth = (sourceNode.measured?.width ?? LINK_PREVIEW_ICON_SIZE) * zoom;
  const nodeX = sourcePos.x * zoom + viewport.x + (nodeWidth - iconSize) / 2;
  const nodeY = sourcePos.y * zoom + viewport.y;
  const loopGeometry = calculateLoopEdgeGeometry(nodeX, nodeY, iconSize, loopIndex, zoom);

  return {
    path: loopGeometry.path,
    sourceLabelPos: sourceLabel ? loopGeometry.sourceLabelPos : null,
    targetLabelPos: targetLabel ? loopGeometry.targetLabelPos : null,
    sourceLabel,
    targetLabel,
  };
}

function buildEdgePreviewGeometry(params: {
  sourceNode: Node;
  targetNode: Node;
  viewport: { x: number; y: number; zoom: number };
  iconSize: number;
  stepSize: number;
  labelOffset: number;
  edges: Edge[];
  linkSourceNodeId: string;
  previewLinkInfo: PreviewLinkInfo | null;
  sourceLabel: string;
  targetLabel: string;
}): PreviewGeometry {
  const {
    sourceNode,
    targetNode,
    viewport,
    iconSize,
    stepSize,
    labelOffset,
    edges,
    linkSourceNodeId,
    previewLinkInfo,
    sourceLabel,
    targetLabel,
  } = params;

  const zoom = viewport.zoom;
  const sourcePos = getNodePosition(sourceNode);
  const targetPos = getNodePosition(targetNode);
  const sourceWidth = (sourceNode.measured?.width ?? LINK_PREVIEW_ICON_SIZE) * zoom;
  const targetWidth = (targetNode.measured?.width ?? LINK_PREVIEW_ICON_SIZE) * zoom;
  const sourceRect = {
    x: sourcePos.x * zoom + viewport.x + (sourceWidth - iconSize) / 2,
    y: sourcePos.y * zoom + viewport.y,
    width: iconSize,
    height: iconSize,
  };
  const targetRect = {
    x: targetPos.x * zoom + viewport.x + (targetWidth - iconSize) / 2,
    y: targetPos.y * zoom + viewport.y,
    width: iconSize,
    height: iconSize,
  };

  const points = getEdgePoints(sourceRect, targetRect);
  const parallelInfo =
    previewLinkInfo?.parallelInfo ?? getPreviewParallelInfo(edges, linkSourceNodeId, targetNode.id);
  const controlPoint = calculateControlPoint(
    points.sx,
    points.sy,
    points.tx,
    points.ty,
    parallelInfo.index,
    parallelInfo.total,
    parallelInfo.isCanonicalDirection,
    stepSize
  );

  return {
    path: buildPath(points.sx, points.sy, points.tx, points.ty, controlPoint),
    sourceLabelPos: sourceLabel
      ? getLabelPosition(
          points.sx,
          points.sy,
          points.tx,
          points.ty,
          labelOffset,
          controlPoint ?? undefined
        )
      : null,
    targetLabelPos: targetLabel
      ? getLabelPosition(
          points.tx,
          points.ty,
          points.sx,
          points.sy,
          labelOffset,
          controlPoint ?? undefined
        )
      : null,
    sourceLabel,
    targetLabel,
  };
}

function buildFreePreviewGeometry(params: {
  sourcePosition: { x: number; y: number };
  relativeMouseX: number;
  relativeMouseY: number;
  viewport: { x: number; y: number; zoom: number };
}): PreviewGeometry {
  const { sourcePosition, relativeMouseX, relativeMouseY, viewport } = params;
  const screenSourceX = sourcePosition.x * viewport.zoom + viewport.x;
  const screenSourceY = sourcePosition.y * viewport.zoom + viewport.y;
  return {
    path: `M ${screenSourceX} ${screenSourceY} L ${relativeMouseX} ${relativeMouseY}`,
    sourceLabelPos: null,
    targetLabelPos: null,
    sourceLabel: "",
    targetLabel: "",
  };
}

function computePreviewGeometry(params: {
  sourceNode: Node | null;
  targetNode: Node | null;
  mousePosition: { x: number; y: number } | null;
  bounds: DOMRect | null;
  previewLinkInfo: PreviewLinkInfo | null;
  edges: Edge[];
  linkSourceNodeId: string;
  sourcePosition: { x: number; y: number } | null;
  viewport: { x: number; y: number; zoom: number };
}): PreviewGeometry | null {
  const {
    sourceNode,
    targetNode,
    mousePosition,
    bounds,
    previewLinkInfo,
    edges,
    linkSourceNodeId,
    sourcePosition,
    viewport,
  } = params;
  if (!sourceNode || !mousePosition || !bounds) return null;

  const zoom = viewport.zoom;
  const iconSize = LINK_PREVIEW_ICON_SIZE * zoom;
  const stepSize = LINK_PREVIEW_CONTROL_POINT_STEP_SIZE * zoom;
  const labelOffset = LINK_LABEL_OFFSET * zoom;

  if (targetNode) {
    const sourceLabel = previewLinkInfo?.sourceEndpoint ?? "";
    const targetLabel = previewLinkInfo?.targetEndpoint ?? "";

    if (sourceNode.id === targetNode.id) {
      const loopIndex = previewLinkInfo?.loopIndex ?? 0;
      return buildLoopPreviewGeometry({
        sourceNode,
        viewport,
        iconSize,
        loopIndex,
        sourceLabel,
        targetLabel,
      });
    }

    return buildEdgePreviewGeometry({
      sourceNode,
      targetNode,
      viewport,
      iconSize,
      stepSize,
      labelOffset,
      edges,
      linkSourceNodeId,
      previewLinkInfo,
      sourceLabel,
      targetLabel,
    });
  }

  const relativeMouseX = mousePosition.x - bounds.left;
  const relativeMouseY = mousePosition.y - bounds.top;
  if (!sourcePosition) return null;
  return buildFreePreviewGeometry({ sourcePosition, relativeMouseX, relativeMouseY, viewport });
}

export interface LinkCreationLineProps {
  linkSourceNodeId: string;
  linkTargetNodeId: string | null;
  nodes: Node[];
  edges: Edge[];
  sourcePosition: { x: number; y: number } | null;
  linkCreationSeed?: number | null;
}

const LINK_LINE_SVG_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  zIndex: 999,
};

let cachedContainerBounds: DOMRect | null = null;
let boundsLastUpdated = 0;
const BOUNDS_CACHE_DURATION = 100;

function getContainerBounds(): DOMRect | null {
  const now = Date.now();
  if (cachedContainerBounds && now - boundsLastUpdated < BOUNDS_CACHE_DURATION) {
    return cachedContainerBounds;
  }
  const container = document.querySelector(".react-flow-canvas");
  if (!container) return null;
  cachedContainerBounds = container.getBoundingClientRect();
  boundsLastUpdated = now;
  return cachedContainerBounds;
}

export const LinkCreationLine = React.memo<LinkCreationLineProps>(
  ({ linkSourceNodeId, linkTargetNodeId, nodes, edges, sourcePosition, linkCreationSeed }) => {
    const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
      const throttledSetPosition = rafThrottle((x: number, y: number) => {
        setMousePosition({ x, y });
      });

      const handleMouseMove = (e: MouseEvent) => {
        throttledSetPosition(e.clientX, e.clientY);
      };

      window.addEventListener("mousemove", handleMouseMove);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        throttledSetPosition.cancel();
      };
    }, []);

    const [viewportX, viewportY, viewportZoom] = useStore((state) => state.transform);

    const sourceNode = useMemo(
      () => nodes.find((node) => node.id === linkSourceNodeId) ?? null,
      [nodes, linkSourceNodeId]
    );
    const targetNode = useMemo(
      () =>
        linkTargetNodeId !== null && linkTargetNodeId.length > 0
          ? (nodes.find((node) => node.id === linkTargetNodeId) ?? null)
          : null,
      [nodes, linkTargetNodeId]
    );
    const viewport = useMemo(
      () => ({ x: viewportX, y: viewportY, zoom: viewportZoom }),
      [viewportX, viewportY, viewportZoom]
    );
    const bounds = getContainerBounds();
    const labelStyle = useMemo(() => buildLinkLabelStyle(viewport.zoom), [viewport.zoom]);

    const previewLinkInfo = useMemo(
      () => buildPreviewLinkInfo(nodes, edges, linkSourceNodeId, targetNode, linkCreationSeed),
      [nodes, edges, linkSourceNodeId, targetNode, linkCreationSeed]
    );

    const previewGeometry = useMemo(
      () =>
        computePreviewGeometry({
          sourceNode,
          targetNode,
          mousePosition,
          bounds,
          previewLinkInfo,
          edges,
          linkSourceNodeId,
          sourcePosition,
          viewport,
        }),
      [
        sourceNode,
        targetNode,
        mousePosition,
        bounds,
        previewLinkInfo,
        edges,
        linkSourceNodeId,
        sourcePosition,
        viewport,
      ]
    );

    if (!previewGeometry) return null;

    const strokeWidth = LINK_PREVIEW_WIDTH * viewport.zoom;

    return (
      <div style={LINK_LINE_SVG_STYLE}>
        <svg style={{ width: "100%", height: "100%" }}>
          <path
            d={previewGeometry.path}
            fill="none"
            style={{
              stroke: LINK_PREVIEW_COLOR,
              strokeWidth,
              opacity: LINK_PREVIEW_OPACITY,
            }}
          />
        </svg>
        {previewGeometry.sourceLabel && previewGeometry.sourceLabelPos && (
          <div
            style={{
              ...labelStyle,
              transform: `translate(-50%, -50%) translate(${previewGeometry.sourceLabelPos.x}px, ${previewGeometry.sourceLabelPos.y}px)`,
            }}
          >
            {previewGeometry.sourceLabel}
          </div>
        )}
        {previewGeometry.targetLabel && previewGeometry.targetLabelPos && (
          <div
            style={{
              ...labelStyle,
              transform: `translate(-50%, -50%) translate(${previewGeometry.targetLabelPos.x}px, ${previewGeometry.targetLabelPos.y}px)`,
            }}
          >
            {previewGeometry.targetLabel}
          </div>
        )}
      </div>
    );
  }
);

LinkCreationLine.displayName = "LinkCreationLine";
