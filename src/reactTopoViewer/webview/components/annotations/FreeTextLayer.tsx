/**
 * FreeTextLayer - HTML overlay layer for rendering free text annotations
 * Renders text annotations on top of the Cytoscape canvas.
 */
import React, { useRef, useCallback, useState } from 'react';
import type { Core as CyCore } from 'cytoscape';
import { FreeTextAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';
import { renderedToModel, computeAnnotationStyle } from './freeTextLayerHelpers';
import { useAnnotationDrag } from './useAnnotationDrag';

// ============================================================================
// Types
// ============================================================================

interface FreeTextLayerProps {
  cy: CyCore | null;
  annotations: FreeTextAnnotation[];
  isLocked: boolean;
  isAddTextMode: boolean;
  onAnnotationDoubleClick: (id: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onCanvasClick: (position: { x: number; y: number }) => void;
}

// ============================================================================
// Individual Text Annotation Component
// ============================================================================

interface TextAnnotationItemProps {
  annotation: FreeTextAnnotation;
  cy: CyCore;
  isLocked: boolean;
  onDoubleClick: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
}

const TextAnnotationItem: React.FC<TextAnnotationItemProps> = ({
  annotation, cy, isLocked, onDoubleClick, onPositionChange
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const { isDragging, renderedPos, handleMouseDown } = useAnnotationDrag({
    cy,
    modelPosition: annotation.position,
    isLocked,
    onPositionChange
  });

  const style = computeAnnotationStyle(annotation, renderedPos, isDragging, isHovered, isLocked);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLocked) onDoubleClick();
  }, [isLocked, onDoubleClick]);

  return (
    <div
      style={style}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={isLocked ? undefined : 'Double-click to edit'}
    >
      {annotation.text}
    </div>
  );
};

// ============================================================================
// Main Layer Component
// ============================================================================

export const FreeTextLayer: React.FC<FreeTextLayerProps> = ({
  cy, annotations, isLocked, isAddTextMode,
  onAnnotationDoubleClick, onPositionChange, onCanvasClick
}) => {
  const layerRef = useRef<HTMLDivElement>(null);

  const handleLayerClick = useCallback((e: React.MouseEvent) => {
    if (!isAddTextMode || !cy) return;
    const container = cy.container();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const renderedX = e.clientX - rect.left;
    const renderedY = e.clientY - rect.top;
    const modelPos = renderedToModel(cy, renderedX, renderedY);
    onCanvasClick(modelPos);
    log.info(`[FreeTextLayer] Canvas clicked at model (${modelPos.x}, ${modelPos.y})`);
  }, [cy, isAddTextMode, onCanvasClick]);

  const layerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: isAddTextMode ? 'auto' : 'none',
    cursor: isAddTextMode ? 'text' : 'default',
    zIndex: 999,
    overflow: 'hidden'
  };

  if (!cy || (annotations.length === 0 && !isAddTextMode)) return null;

  return (
    <div ref={layerRef} className="free-text-layer" style={layerStyle} onClick={handleLayerClick}>
      {annotations.map(annotation => (
        <TextAnnotationItem
          key={annotation.id}
          annotation={annotation}
          cy={cy}
          isLocked={isLocked}
          onDoubleClick={() => onAnnotationDoubleClick(annotation.id)}
          onPositionChange={(pos) => onPositionChange(annotation.id, pos)}
        />
      ))}
    </div>
  );
};

export default FreeTextLayer;
