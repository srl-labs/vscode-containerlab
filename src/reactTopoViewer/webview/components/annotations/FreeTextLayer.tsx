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
import { useRotationDrag, useResizeDrag } from './useAnnotationHandles';

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
  onRotationChange: (id: string, rotation: number) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  onCanvasClick: (position: { x: number; y: number }) => void;
}

// ============================================================================
// Handle Components
// ============================================================================

const HANDLE_SIZE = 14;
const ROTATION_HANDLE_OFFSET = 32;

interface RotationHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

const RotationHandle: React.FC<RotationHandleProps> = ({ onMouseDown }) => (
  <>
    {/* Line connecting to rotation handle */}
    <div
      style={{
        position: 'absolute',
        top: `-${ROTATION_HANDLE_OFFSET}px`,
        left: '50%',
        width: '2px',
        height: `${ROTATION_HANDLE_OFFSET - HANDLE_SIZE/2}px`,
        backgroundColor: 'rgba(100, 180, 255, 0.8)',
        transform: 'translateX(-50%)',
        pointerEvents: 'none'
      }}
    />
    {/* Rotation handle circle */}
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        top: `-${ROTATION_HANDLE_OFFSET}px`,
        left: '50%',
        width: `${HANDLE_SIZE}px`,
        height: `${HANDLE_SIZE}px`,
        backgroundColor: '#64b4ff',
        border: '2px solid white',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        cursor: 'grab',
        boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
      }}
      title="Drag to rotate (Shift for 15° snap)"
    />
  </>
);

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface ResizeHandleProps {
  position: ResizeCorner;
  onMouseDown: (e: React.MouseEvent) => void;
}

const CORNER_STYLES: Record<ResizeCorner, React.CSSProperties> = {
  nw: { top: 0, left: 0, cursor: 'nw-resize', transform: 'translate(-50%, -50%)' },
  ne: { top: 0, right: 0, cursor: 'ne-resize', transform: 'translate(50%, -50%)' },
  sw: { bottom: 0, left: 0, cursor: 'sw-resize', transform: 'translate(-50%, 50%)' },
  se: { bottom: 0, right: 0, cursor: 'se-resize', transform: 'translate(50%, 50%)' }
};

const ResizeHandle: React.FC<ResizeHandleProps> = ({ position, onMouseDown }) => (
  <div
    onMouseDown={onMouseDown}
    style={{
      position: 'absolute',
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
      backgroundColor: 'white',
      border: '2px solid #64b4ff',
      borderRadius: '2px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
      ...CORNER_STYLES[position]
    }}
    title="Drag to resize (Shift for aspect ratio)"
  />
);

/** Selection outline shown when handles are visible */
const SelectionOutline: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: '-2px',
      border: '2px solid #64b4ff',
      borderRadius: '4px',
      pointerEvents: 'none'
    }}
  />
);

// ============================================================================
// Individual Text Annotation Component
// ============================================================================

interface TextAnnotationItemProps {
  annotation: FreeTextAnnotation;
  cy: CyCore;
  isLocked: boolean;
  onDoubleClick: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onRotationChange: (rotation: number) => void;
  onSizeChange: (width: number, height: number) => void;
}

/** Get cursor style for annotation content */
function getAnnotationCursor(isLocked: boolean, isDragging: boolean): string {
  if (isLocked) return 'default';
  if (isDragging) return 'grabbing';
  return 'grab';
}

/** Hook for annotation interaction state */
function useAnnotationInteractions(
  cy: CyCore,
  annotation: FreeTextAnnotation,
  isLocked: boolean,
  onPositionChange: (position: { x: number; y: number }) => void,
  onRotationChange: (rotation: number) => void,
  onSizeChange: (width: number, height: number) => void,
  contentRef: React.RefObject<HTMLDivElement | null>
) {
  const { isDragging, renderedPos, handleMouseDown } = useAnnotationDrag({
    cy,
    modelPosition: annotation.position,
    isLocked,
    onPositionChange
  });

  const { isRotating, handleRotationMouseDown } = useRotationDrag({
    cy,
    renderedPos,
    currentRotation: annotation.rotation || 0,
    isLocked,
    onRotationChange
  });

  const { isResizing, handleResizeMouseDown } = useResizeDrag({
    renderedPos,
    currentWidth: annotation.width,
    currentHeight: annotation.height,
    contentRef,
    isLocked,
    onSizeChange
  });

  return {
    isDragging, isRotating, isResizing,
    renderedPos, handleMouseDown, handleRotationMouseDown, handleResizeMouseDown
  };
}

/** Handles container component - positioned relative to annotation */
const AnnotationHandles: React.FC<{
  onRotation: (e: React.MouseEvent) => void;
  onResize: (e: React.MouseEvent, corner: ResizeCorner) => void;
}> = ({ onRotation, onResize }) => (
  <>
    <SelectionOutline />
    <RotationHandle onMouseDown={onRotation} />
    <ResizeHandle position="nw" onMouseDown={(e) => onResize(e, 'nw')} />
    <ResizeHandle position="ne" onMouseDown={(e) => onResize(e, 'ne')} />
    <ResizeHandle position="sw" onMouseDown={(e) => onResize(e, 'sw')} />
    <ResizeHandle position="se" onMouseDown={(e) => onResize(e, 'se')} />
  </>
);

const TextAnnotationItem: React.FC<TextAnnotationItemProps> = ({
  annotation, cy, isLocked, onDoubleClick, onPositionChange, onRotationChange, onSizeChange
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const interactions = useAnnotationInteractions(
    cy, annotation, isLocked, onPositionChange, onRotationChange, onSizeChange, contentRef
  );
  const { isDragging, isRotating, isResizing, renderedPos, handleMouseDown, handleRotationMouseDown, handleResizeMouseDown } = interactions;

  const isInteracting = isDragging || isRotating || isResizing;
  const baseStyle = computeAnnotationStyle(annotation, renderedPos, isInteracting, isHovered, isLocked);
  const showHandles = (isHovered || isInteracting) && !isLocked;

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLocked) onDoubleClick();
  }, [isLocked, onDoubleClick]);

  // Wrapper style that includes extended hover area for handles
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: renderedPos.x,
    top: renderedPos.y,
    transform: `translate(-50%, -50%) rotate(${annotation.rotation || 0}deg)`,
    zIndex: annotation.zIndex || 11,
    // Extended padding to capture hover for rotation handle (always present)
    padding: `${ROTATION_HANDLE_OFFSET + HANDLE_SIZE + 5}px 10px 10px 10px`,
    margin: `-${ROTATION_HANDLE_OFFSET + HANDLE_SIZE + 5}px -10px -10px -10px`,
    pointerEvents: 'auto'
  };

  // Content style without position (handled by wrapper)
  const contentStyle: React.CSSProperties = {
    ...baseStyle,
    position: 'relative',
    left: 'auto',
    top: 'auto',
    transform: 'none',
    zIndex: 'auto',
    cursor: getAnnotationCursor(isLocked, isDragging)
  };

  return (
    <div
      style={wrapperStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={contentRef}
        style={contentStyle}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title={isLocked ? undefined : 'Drag to move, double-click to edit'}
      >
        {annotation.text}
        {/* Visible handles */}
        {showHandles && <AnnotationHandles onRotation={handleRotationMouseDown} onResize={handleResizeMouseDown} />}
      </div>
    </div>
  );
};

// ============================================================================
// Main Layer Component
// ============================================================================

export const FreeTextLayer: React.FC<FreeTextLayerProps> = ({
  cy, annotations, isLocked, isAddTextMode,
  onAnnotationDoubleClick, onPositionChange, onRotationChange, onSizeChange, onCanvasClick
}) => {
  const layerRef = useRef<HTMLDivElement>(null);

  const handleLayerClick = useCallback((e: React.MouseEvent) => {
    if (!cy) return;
    const container = cy.container();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const renderedX = e.clientX - rect.left;
    const renderedY = e.clientY - rect.top;
    const modelPos = renderedToModel(cy, renderedX, renderedY);
    onCanvasClick(modelPos);
    log.info(`[FreeTextLayer] Canvas clicked at model (${modelPos.x}, ${modelPos.y})`);
  }, [cy, onCanvasClick]);

  // Base layer style - always pointer-events: none so clicks pass through to Cytoscape
  // zIndex 10 keeps it above canvas but below panels (zIndex 21+)
  const layerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 10,
    overflow: 'hidden'
  };

  // Click capture overlay - only active in add-text mode
  const clickCaptureStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'auto',
    cursor: 'text',
    zIndex: 9
  };

  if (!cy || (annotations.length === 0 && !isAddTextMode)) return null;

  return (
    <div ref={layerRef} className="free-text-layer" style={layerStyle}>
      {/* Click capture overlay - only visible in add-text mode */}
      {isAddTextMode && (
        <div style={clickCaptureStyle} onClick={handleLayerClick} />
      )}
      {/* Annotation items - always interactive */}
      {annotations.map(annotation => (
        <TextAnnotationItem
          key={annotation.id}
          annotation={annotation}
          cy={cy}
          isLocked={isLocked}
          onDoubleClick={() => onAnnotationDoubleClick(annotation.id)}
          onPositionChange={(pos) => onPositionChange(annotation.id, pos)}
          onRotationChange={(rotation) => onRotationChange(annotation.id, rotation)}
          onSizeChange={(width, height) => onSizeChange(annotation.id, width, height)}
        />
      ))}
    </div>
  );
};

export default FreeTextLayer;
