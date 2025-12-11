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
    zIndex: annotation.zIndex || 1000
  };
}

function computeBackgroundStyle(annotation: FreeTextAnnotation, renderedPos: RenderedPosition): React.CSSProperties {
  const hasBackground = Boolean(annotation.backgroundColor && annotation.backgroundColor !== 'transparent');
  return {
    backgroundColor: hasBackground ? annotation.backgroundColor : 'transparent',
    padding: hasBackground ? '4px 8px' : '2px',
    borderRadius: getBorderRadius(hasBackground, annotation.roundedBackground),
    maxWidth: annotation.width ? `${annotation.width * renderedPos.zoom}px` : '300px'
  };
}

function computeInteractionStyle(isDragging: boolean, isHovered: boolean, isLocked: boolean): React.CSSProperties {
  return {
    cursor: getCursorStyle(isLocked, isDragging),
    outline: isHovered && !isLocked ? '2px solid rgba(100, 180, 255, 0.6)' : 'none',
    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.3)' : 'none',
    transition: isDragging ? 'none' : 'box-shadow 0.15s ease, outline 0.15s ease'
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
  isHovered: boolean,
  isLocked: boolean
): React.CSSProperties {
  const hasBackground = Boolean(annotation.backgroundColor && annotation.backgroundColor !== 'transparent');
  return {
    ...computeBaseStyle(annotation, renderedPos),
    ...computeBackgroundStyle(annotation, renderedPos),
    ...computeInteractionStyle(isDragging, isHovered, isLocked),
    ...computeTextShadow(hasBackground)
  };
}
