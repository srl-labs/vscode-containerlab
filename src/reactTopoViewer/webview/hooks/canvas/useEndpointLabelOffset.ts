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
const MIN_HALF_GAP = 2;
const LABEL_WIDTH_FACTOR = 8;
const DEFAULT_FONT_SIZE = 12;
const DEFAULT_FONT_FAMILY = 'sans-serif';
const DEFAULT_TEXT_PADDING = 1;

type EdgePrivateData = {
  rstyle?: Record<string, unknown>;
  rscratch?: Record<string, unknown>;
};

type Point = { x: number; y: number };

export type EndpointLabelOffsetConfig = {
  globalEnabled: boolean;
  globalOffset: number;
  edgeAnnotations?: EdgeAnnotation[];
};

let measureContext: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext) return measureContext;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  measureContext = canvas.getContext('2d');
  return measureContext;
}

function isValidPoint(point: Point | null | undefined): point is Point {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function getPolylineLength(points: Point[]): number | null {
  if (points.length < 2) return null;
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const segment = Math.hypot(current.x - prev.x, current.y - prev.y);
    if (!Number.isFinite(segment)) return null;
    length += segment;
  }
  return Number.isFinite(length) ? length : null;
}

function getLoopLength(edge: EdgeSingular): number | null {
  const points: Point[] = [];
  const sourceEndpoint = edge.sourceEndpoint();
  const targetEndpoint = edge.targetEndpoint();
  const controlPoints = edge.controlPoints();

  if (isValidPoint(sourceEndpoint)) points.push(sourceEndpoint);
  if (Array.isArray(controlPoints)) {
    controlPoints.forEach((point) => {
      if (isValidPoint(point)) points.push(point);
    });
  }
  if (isValidPoint(targetEndpoint)) points.push(targetEndpoint);

  const polylineLength = getPolylineLength(points);
  if (polylineLength !== null && polylineLength > 0) return polylineLength;

  const source = edge.source();
  if (source.empty()) return null;
  const stepSize = getStyleNumber(edge, 'control-point-step-size', 20);
  const nodeRadius = Math.max(source.width(), source.height()) / 2;
  const approxLength = Math.max(stepSize * 2.8, nodeRadius * Math.PI);
  return Number.isFinite(approxLength) && approxLength > 0 ? approxLength : null;
}

function getEdgeLength(edge: EdgeSingular): number | null {
  if (isSelfLoop(edge)) return getLoopLength(edge);
  const source = edge.source();
  const target = edge.target();
  if (source.empty() || target.empty()) return null;

  const sourcePos = source.position();
  const targetPos = target.position();
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  const length = Math.hypot(dx, dy);

  return Number.isFinite(length) ? length : null;
}

function isSelfLoop(edge: EdgeSingular): boolean {
  const source = edge.source();
  const target = edge.target();
  if (source.empty() || target.empty()) return false;
  return source.id() === target.id();
}

function getZoom(edge: EdgeSingular): number {
  const zoom = edge.cy().zoom();
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function getStyleNumber(edge: EdgeSingular, name: string, fallback: number): number {
  const raw = edge.style(name) as string | number | null | undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getStyleString(edge: EdgeSingular, name: string, fallback: string): string {
  const raw = edge.style(name) as string | number | null | undefined;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : fallback;
}

function getEdgeFontSpec(edge: EdgeSingular): string {
  const fontStyle = getStyleString(edge, 'font-style', 'normal');
  const fontWeight = getStyleString(edge, 'font-weight', 'normal');
  const fontSize = getStyleNumber(edge, 'font-size', DEFAULT_FONT_SIZE);
  const fontFamily = getStyleString(edge, 'font-family', DEFAULT_FONT_FAMILY);
  return `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
}

function getLabelText(edge: EdgeSingular, key: 'sourceEndpoint' | 'targetEndpoint'): string {
  const value = edge.data(key) as string | number | boolean | null | undefined;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value);
}

function getCachedLabelWidth(edge: EdgeSingular, prefix: 'source' | 'target'): number | null {
  const privateData = (edge as unknown as { _private?: EdgePrivateData })._private;
  const key = prefix === 'source' ? 'sourceLabelWidth' : 'targetLabelWidth';
  const fromRstyle = privateData?.rstyle?.[key];
  const fromRscratch = privateData?.rscratch?.[key];
  const candidate = typeof fromRstyle === 'number' ? fromRstyle : fromRscratch;
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

function measureLabelWidth(text: string, fontSpec: string): number {
  if (!text) return 0;
  const context = getMeasureContext();
  if (!context) return text.length * DEFAULT_FONT_SIZE * 0.6;
  context.font = fontSpec;
  return context.measureText(text).width;
}

function getLabelWidthPx(edge: EdgeSingular, prefix: 'source' | 'target', paddingPx: number): number {
  const cached = getCachedLabelWidth(edge, prefix);
  if (cached !== null) return cached + paddingPx * 2;
  const text = getLabelText(edge, prefix === 'source' ? 'sourceEndpoint' : 'targetEndpoint');
  if (!text) return 0;
  const fontSpec = getEdgeFontSpec(edge);
  return measureLabelWidth(text, fontSpec) + paddingPx * 2;
}

function clampOffset(edge: EdgeSingular, offset: number): number {
  const length = getEdgeLength(edge);
  if (length === null) return offset;

  const zoom = getZoom(edge);
  const paddingPx = getStyleNumber(edge, 'text-background-padding', DEFAULT_TEXT_PADDING);
  const sourceWidth = getLabelWidthPx(edge, 'source', paddingPx) / zoom;
  const targetWidth = getLabelWidthPx(edge, 'target', paddingPx) / zoom;

  const effectiveSourceWidth = sourceWidth * LABEL_WIDTH_FACTOR;
  const effectiveTargetWidth = targetWidth * LABEL_WIDTH_FACTOR;
  const maxSource = length / 2 - effectiveSourceWidth / 2 - MIN_HALF_GAP;
  const maxTarget = length / 2 - effectiveTargetWidth / 2 - MIN_HALF_GAP;
  const maxOffset = Math.max(0, Math.min(maxSource, maxTarget));

  return Math.min(offset, maxOffset);
}

function applyOffset(edge: EdgeSingular, offset: number): void {
  const clamped = clampOffset(edge, offset);
  edge.style({
    'source-text-offset': clamped,
    'target-text-offset': clamped
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
