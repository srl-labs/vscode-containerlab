/**
 * Helper functions for FreeTextLayer
 */
import type { Core as CyCore } from 'cytoscape';
import type React from 'react';
import { FreeTextAnnotation } from '../../../shared/types/topology';

// ============================================================================
// Coordinate Conversion
// ============================================================================

export function modelToRendered(cy: CyCore, modelX: number, modelY: number): { x: number; y: number } {
  const pan = cy.pan();
  const zoom = cy.zoom();
  return { x: modelX * zoom + pan.x, y: modelY * zoom + pan.y };
}

export function renderedToModel(cy: CyCore, renderedX: number, renderedY: number): { x: number; y: number } {
  const pan = cy.pan();
  const zoom = cy.zoom();
  return { x: (renderedX - pan.x) / zoom, y: (renderedY - pan.y) / zoom };
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

function computeBaseStyle(annotation: FreeTextAnnotation, renderedPos: RenderedPosition): React.CSSProperties {
  const fontSize = (annotation.fontSize || 14) * renderedPos.zoom;
  return {
    position: 'absolute',
    left: renderedPos.x,
    top: renderedPos.y,
    transform: `translate(-50%, -50%) rotate(${annotation.rotation || 0}deg)`,
    fontSize: `${fontSize}px`,
    fontFamily: annotation.fontFamily || 'monospace',
    fontWeight: annotation.fontWeight || 'normal',
    fontStyle: annotation.fontStyle || 'normal',
    textDecoration: annotation.textDecoration || 'none',
    textAlign: annotation.textAlign || 'left',
    color: annotation.fontColor || '#FFFFFF',
    userSelect: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    pointerEvents: 'auto',
    zIndex: annotation.zIndex || 11
  };
}

function computeBackgroundStyle(annotation: FreeTextAnnotation, renderedPos: RenderedPosition): React.CSSProperties {
  const hasBackground = Boolean(annotation.backgroundColor && annotation.backgroundColor !== 'transparent');
  const style: React.CSSProperties = {
    backgroundColor: hasBackground ? annotation.backgroundColor : 'transparent',
    padding: hasBackground ? '4px 8px' : '2px',
    borderRadius: getBorderRadius(hasBackground, annotation.roundedBackground)
  };

  // Apply explicit dimensions if set, otherwise use maxWidth constraint
  if (annotation.width) {
    style.width = `${annotation.width * renderedPos.zoom}px`;
  } else {
    style.maxWidth = '300px';
  }
  if (annotation.height) {
    style.height = `${annotation.height * renderedPos.zoom}px`;
  }
  // Never use overflow:hidden - it clips the rotation handle which is positioned above

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
