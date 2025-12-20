/**
 * Helper functions for FreeTextLayer
 */
import type { Core as CyCore } from 'cytoscape';
import type React from 'react';

import type { FreeTextAnnotation } from '../../../shared/types/topology';
import type { MapLibreState} from '../canvas/maplibreUtils';
import { projectAnnotationGeoCoords, calculateScale } from '../canvas/maplibreUtils';

// ============================================================================
// Coordinate Conversion
// ============================================================================

export function modelToRendered(cy: CyCore, modelX: number, modelY: number): { x: number; y: number; zoom: number } {
  const pan = cy.pan();
  const zoom = cy.zoom();
  return { x: modelX * zoom + pan.x, y: modelY * zoom + pan.y, zoom };
}

export function renderedToModel(cy: CyCore, renderedX: number, renderedY: number): { x: number; y: number } {
  const pan = cy.pan();
  const zoom = cy.zoom();
  return { x: (renderedX - pan.x) / zoom, y: (renderedY - pan.y) / zoom };
}

/**
 * Convert model coordinates to rendered coordinates with geo mode support.
 * When geo mode is active and annotation has geo coords, use MapLibre projection.
 * The zoom returned is the scale factor for annotation sizing.
 */
export function modelToRenderedGeo(
  mapLibreState: MapLibreState | null,
  geoCoords: { lat: number; lng: number } | undefined,
  modelX: number,
  modelY: number
): RenderedPosition {
  // If geo mode is active and annotation has geo coordinates, project them
  if (mapLibreState?.isInitialized && geoCoords) {
    const projected = projectAnnotationGeoCoords(mapLibreState, geoCoords);
    if (projected) {
      const scale = calculateScale(mapLibreState);
      return { x: projected.x, y: projected.y, zoom: scale };
    }
  }
  // Fallback to model position (non-geo mode or no geo coords)
  return { x: modelX, y: modelY, zoom: 1 };
}

// ============================================================================
// Style Helpers
// ============================================================================

export function getCursorStyle(isLocked: boolean, isDragging: boolean): string {
  if (isLocked) return 'default';
  return isDragging ? 'grabbing' : 'grab';
}

export function getBorderRadius(hasBackground: boolean, roundedBackground?: boolean): string {
  if (!hasBackground) return '0';
  return roundedBackground !== false ? '4px' : '0';
}

// ============================================================================
// Rendered Position Type
// ============================================================================

export interface RenderedPosition {
  x: number;
  y: number;
  zoom: number;
}

// ============================================================================
// Style Computation - Split into smaller functions
// ============================================================================

function computeBaseStyle(annotation: FreeTextAnnotation, _renderedPos: RenderedPosition): React.CSSProperties {
  // Base font size - scaling is done via transform: scale(zoom) on the wrapper
  const baseFontSize = annotation.fontSize || 14;
  return {
    // Position/transform are handled by the wrapper in FreeTextLayer
    fontSize: `${baseFontSize}px`,
    fontFamily: annotation.fontFamily || 'monospace',
    fontWeight: annotation.fontWeight || 'normal',
    fontStyle: annotation.fontStyle || 'normal',
    textDecoration: annotation.textDecoration || 'none',
    textAlign: annotation.textAlign || 'left',
    color: annotation.fontColor || '#FFFFFF',
    userSelect: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    pointerEvents: 'auto'
  };
}

function computeBackgroundStyle(annotation: FreeTextAnnotation, _renderedPos: RenderedPosition): React.CSSProperties {
  const hasBackground = Boolean(annotation.backgroundColor && annotation.backgroundColor !== 'transparent');
  const style: React.CSSProperties = {
    backgroundColor: hasBackground ? annotation.backgroundColor : 'transparent',
    padding: hasBackground ? '4px 8px' : '2px',
    borderRadius: getBorderRadius(hasBackground, annotation.roundedBackground)
  };

  // Apply explicit dimensions if set (base values - scaling is done via transform)
  // otherwise use maxWidth constraint
  if (annotation.width) {
    style.width = `${annotation.width}px`;
  } else {
    style.maxWidth = '300px';
  }
  if (annotation.height) {
    style.height = `${annotation.height}px`;
  }

  // Note: overflow is NOT set here to avoid clipping the handles (rotation/resize)
  // Overflow should be applied to the inner markdown content div instead

  return style;
}

function computeInteractionStyle(isDragging: boolean): React.CSSProperties {
  return {
    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.3)' : 'none',
    transition: isDragging ? 'none' : 'box-shadow 0.15s ease'
  };
}

function computeTextShadow(hasBackground: boolean): React.CSSProperties {
  if (hasBackground) return {};
  return { textShadow: '0 0 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)' };
}

export function computeAnnotationStyle(
  annotation: FreeTextAnnotation,
  renderedPos: RenderedPosition,
  isDragging: boolean,
  _isHovered: boolean,
  _isLocked: boolean
): React.CSSProperties {
  const hasBackground = Boolean(annotation.backgroundColor && annotation.backgroundColor !== 'transparent');
  return {
    ...computeBaseStyle(annotation, renderedPos),
    ...computeBackgroundStyle(annotation, renderedPos),
    ...computeInteractionStyle(isDragging),
    ...computeTextShadow(hasBackground)
  };
}
