/**
 * FreeShapeLayer - SVG overlay layer for rendering free shape annotations
 * Renders rectangle, circle, and line annotations on top of the Cytoscape canvas.
 */
import React, { useRef, useCallback, useState, useMemo, useEffect } from 'react';
// [MIGRATION] Replace with ReactFlow types from @xyflow/react
type CyCore = { zoom: () => number; pan: () => { x: number; y: number }; container: () => HTMLElement | null };
import { FreeShapeAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';
import { renderedToModel } from './freeTextLayerHelpers';
import { useAnnotationDrag } from './useAnnotationDrag';
import { useRotationDrag, useResizeDrag } from './useAnnotationHandles';
import { buildShapeSvg } from './freeShapeLayerHelpers';
import { getLineCenter, MIN_SHAPE_SIZE, DEFAULT_LINE_LENGTH } from '../../hooks/annotations/freeShapeHelpers';

// ============================================================================
// Types
// ============================================================================

interface FreeShapeLayerProps {
  cy: CyCore | null;
  annotations: FreeShapeAnnotation[];
  isLocked: boolean;
  isAddShapeMode: boolean;
  onAnnotationEdit: (id: string) => void;
  onAnnotationDelete: (id: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onRotationChange: (id: string, rotation: number) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  onEndPositionChange: (id: string, endPosition: { x: number; y: number }) => void;
  onCanvasClick: (position: { x: number; y: number }) => void;
  selectedAnnotationIds?: Set<string>;
  onAnnotationSelect?: (id: string) => void;
  onAnnotationToggleSelect?: (id: string) => void;
  onAnnotationBoxSelect?: (ids: string[]) => void;
}

// ============================================================================
// Handle Components (copied from FreeTextLayer with minimal tweaks)
// ============================================================================

const HANDLE_SIZE = 6;
const ROTATION_HANDLE_OFFSET = 18;
const HANDLE_BOX_SHADOW = '0 2px 4px rgba(0,0,0,0.3)';
const HANDLE_BORDER = '2px solid #64b4ff';
const CENTER_TRANSLATE = 'translate(-50%, -50%)';

const RotationHandle: React.FC<{ onMouseDown: (e: React.MouseEvent) => void }> = ({ onMouseDown }) => (
  <>
    {/* Wider invisible hit area for easier access to rotation handle */}
    <div
      style={{
        position: 'absolute',
        top: `-${ROTATION_HANDLE_OFFSET}px`,
        left: '50%',
        width: '16px',
        height: `${ROTATION_HANDLE_OFFSET + 4}px`,
        transform: 'translateX(-50%)',
        pointerEvents: 'auto'
      }}
    />
    {/* Visual connecting line */}
    <div
      style={{
        position: 'absolute',
        top: `-${ROTATION_HANDLE_OFFSET}px`,
        left: '50%',
        width: '2px',
        height: `${ROTATION_HANDLE_OFFSET - HANDLE_SIZE / 2}px`,
        backgroundColor: 'rgba(100, 180, 255, 0.8)',
        transform: 'translateX(-50%)',
        pointerEvents: 'none'
      }}
    />
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
        transform: CENTER_TRANSLATE,
        cursor: 'grab',
        boxShadow: HANDLE_BOX_SHADOW
      }}
      title="Drag to rotate (Shift for 15° snap)"
    />
  </>
);

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

const CORNER_STYLES: Record<ResizeCorner, React.CSSProperties> = {
  nw: { top: 0, left: 0, cursor: 'nw-resize', transform: CENTER_TRANSLATE },
  ne: { top: 0, right: 0, cursor: 'ne-resize', transform: 'translate(50%, -50%)' },
  sw: { bottom: 0, left: 0, cursor: 'sw-resize', transform: 'translate(-50%, 50%)' },
  se: { bottom: 0, right: 0, cursor: 'se-resize', transform: 'translate(50%, 50%)' }
};

const ResizeHandle: React.FC<{ position: ResizeCorner; onMouseDown: (e: React.MouseEvent) => void }> = ({ position, onMouseDown }) => (
  <div
    onMouseDown={onMouseDown}
    style={{
      position: 'absolute',
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
      backgroundColor: 'white',
      border: HANDLE_BORDER,
      borderRadius: '2px',
      boxShadow: HANDLE_BOX_SHADOW,
      ...CORNER_STYLES[position]
    }}
    title="Drag to resize (Shift for aspect ratio)"
  />
);

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

const LineEndHandle: React.FC<{ position: { x: number; y: number }; onMouseDown: (e: React.MouseEvent) => void }> = ({ position, onMouseDown }) => (
  <div
    onMouseDown={onMouseDown}
    style={{
      position: 'absolute',
      left: position.x,
      top: position.y,
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
      backgroundColor: 'white',
      border: HANDLE_BORDER,
      borderRadius: '2px',
      transform: CENTER_TRANSLATE,
      boxShadow: HANDLE_BOX_SHADOW,
      cursor: 'nwse-resize'
    }}
    title="Drag to resize line"
  />
);

// ============================================================================
// Interaction Hooks
// ============================================================================

function getCursorStyle(isLocked: boolean, isDragging: boolean): string {
  if (isLocked) return 'default';
  return isDragging ? 'grabbing' : 'grab';
}

function computeWrapperStyle(
  renderedPos: { x: number; y: number; zoom: number },
  rotation: number,
  zIndex: number
): React.CSSProperties {
  return {
    position: 'absolute',
    left: renderedPos.x,
    top: renderedPos.y,
    transform: `${CENTER_TRANSLATE} rotate(${rotation}deg) scale(${renderedPos.zoom})`,
    transformOrigin: 'center center',
    zIndex,
    padding: `${ROTATION_HANDLE_OFFSET + HANDLE_SIZE + 5}px 10px 10px 10px`,
    margin: `-${ROTATION_HANDLE_OFFSET + HANDLE_SIZE + 5}px -10px -10px -10px`,
    pointerEvents: 'auto'
  };
}

function getModelPosition(annotation: FreeShapeAnnotation): { x: number; y: number } {
  return annotation.shapeType === 'line' ? getLineCenter(annotation) : annotation.position;
}

function computeShowHandles(params: { isHovered: boolean; isInteracting: boolean; isSelected: boolean; isLocked: boolean }): boolean {
  const { isHovered, isInteracting, isSelected, isLocked } = params;
  return (isHovered || isInteracting || isSelected) && !isLocked;
}

// Tooltip constants
const UNLOCKED_ANNOTATION_TOOLTIP = 'Click to select, drag to move, right-click for menu';

function useLineResizeDrag(
  cy: CyCore,
  annotation: FreeShapeAnnotation,
  isLocked: boolean,
  onEndPositionChange: (pos: { x: number; y: number }) => void
) {
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startDx: number;
    startDy: number;
    rotationRad: number;
  } | null>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const zoom = cy.zoom();
      const dxClient = e.clientX - dragRef.current.startClientX;
      const dyClient = e.clientY - dragRef.current.startClientY;

      const rotatedDx = (dxClient * Math.cos(-dragRef.current.rotationRad) - dyClient * Math.sin(-dragRef.current.rotationRad)) / zoom;
      const rotatedDy = (dxClient * Math.sin(-dragRef.current.rotationRad) + dyClient * Math.cos(-dragRef.current.rotationRad)) / zoom;

      let newDx = dragRef.current.startDx + rotatedDx;
      let newDy = dragRef.current.startDy + rotatedDy;
      const length = Math.hypot(newDx, newDy);
      if (length > 0 && length < MIN_SHAPE_SIZE) {
        const scale = MIN_SHAPE_SIZE / length;
        newDx *= scale;
        newDy *= scale;
      }

      onEndPositionChange({
        x: annotation.position.x + newDx,
        y: annotation.position.y + newDy
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      dragRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, cy, annotation.position.x, annotation.position.y, onEndPositionChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const end = annotation.endPosition ?? {
      x: annotation.position.x + DEFAULT_LINE_LENGTH,
      y: annotation.position.y
    };
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startDx: end.x - annotation.position.x,
      startDy: end.y - annotation.position.y,
      rotationRad: ((annotation.rotation ?? 0) * Math.PI) / 180
    };
    setIsResizing(true);
  }, [isLocked, annotation]);

  return { isResizing, handleMouseDown };
}

function useAnnotationClickHandlers(
  isLocked: boolean,
  onSelect: () => void,
  onToggleSelect: () => void
) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) return;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      onToggleSelect();
    } else {
      onSelect();
    }
  }, [onSelect, onToggleSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLocked) setContextMenu({ x: e.clientX, y: e.clientY });
  }, [isLocked]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return { contextMenu, handleClick, handleContextMenu, closeContextMenu };
}

const AnnotationContextMenu: React.FC<{
  position: { x: number; y: number };
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ position, onEdit, onDelete, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    zIndex: 10000,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    padding: '4px 0',
    minWidth: '120px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    pointerEvents: 'auto'
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    background: 'none',
    color: 'white',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left'
  };

  return (
    <div ref={menuRef} style={menuStyle}>
      <button
        style={itemStyle}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        onClick={() => { onEdit(); onClose(); }}
      >
        <i className="fas fa-pen" style={{ width: 16 }} />
        Edit
      </button>
      <button
        style={itemStyle}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        onClick={() => { onDelete(); onClose(); }}
      >
        <i className="fas fa-trash" style={{ width: 16 }} />
        Delete
      </button>
    </div>
  );
};

// ============================================================================
// Individual Shape Annotation Component
// ============================================================================

interface ShapeAnnotationItemProps {
  annotation: FreeShapeAnnotation;
  cy: CyCore;
  isLocked: boolean;
  isSelected: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onRotationChange: (rotation: number) => void;
  onSizeChange: (width: number, height: number) => void;
  onEndPositionChange: (endPosition: { x: number; y: number }) => void;
  onSelect: () => void;
  onToggleSelect: () => void;
}

const ShapeAnnotationItem: React.FC<ShapeAnnotationItemProps> = ({
  annotation,
  cy,
  isLocked,
  isSelected,
  onEdit,
  onDelete,
  onPositionChange,
  onRotationChange,
  onSizeChange,
  onEndPositionChange,
  onSelect,
  onToggleSelect
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const modelPosition = getModelPosition(annotation);
  const isLine = annotation.shapeType === 'line';

  const { isDragging, renderedPos, handleMouseDown } = useAnnotationDrag({
    cy,
    modelPosition,
    isLocked,
    onPositionChange
  });

  const { isRotating, handleRotationMouseDown } = useRotationDrag({
    cy,
    renderedPos,
    currentRotation: annotation.rotation ?? 0,
    isLocked,
    onRotationChange
  });

  const { isResizing: isBoxResizing, handleResizeMouseDown } = useResizeDrag({
    renderedPos,
    currentWidth: annotation.width,
    currentHeight: annotation.height,
    contentRef,
    isLocked,
    onSizeChange
  });

  const { isResizing: isLineResizing, handleMouseDown: handleLineResizeMouseDown } = useLineResizeDrag(
    cy,
    annotation,
    isLocked,
    onEndPositionChange
  );

  const { contextMenu, handleClick, handleContextMenu, closeContextMenu } = useAnnotationClickHandlers(isLocked, onSelect, onToggleSelect);

  const isInteracting = [isDragging, isRotating, isBoxResizing, isLineResizing].some(Boolean);
  const showHandles = computeShowHandles({ isHovered, isInteracting, isSelected, isLocked });

  const { svg, width, height, endHandlePos } = useMemo(
    () => buildShapeSvg(annotation),
    [annotation]
  );

  const wrapperStyle = computeWrapperStyle(renderedPos, annotation.rotation ?? 0, annotation.zIndex ?? 10);

  const contentStyle: React.CSSProperties = {
    position: 'relative',
    width: `${width}px`,
    height: `${height}px`,
    cursor: getCursorStyle(isLocked, isDragging),
    pointerEvents: 'auto'
  };

  return (
    <>
      <div style={wrapperStyle}>
        <div
          ref={contentRef}
          style={contentStyle}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          title={isLocked ? undefined : UNLOCKED_ANNOTATION_TOOLTIP}
        >
          {svg}
          <ShapeHandles
            showHandles={showHandles}
            isLine={isLine}
            endHandlePos={endHandlePos}
            onRotationMouseDown={handleRotationMouseDown}
            onResizeMouseDown={handleResizeMouseDown}
            onLineResizeMouseDown={handleLineResizeMouseDown}
          />
        </div>
      </div>
      {contextMenu && (
        <AnnotationContextMenu position={contextMenu} onEdit={onEdit} onDelete={onDelete} onClose={closeContextMenu} />
      )}
    </>
  );
};

const ShapeHandles: React.FC<{
  showHandles: boolean;
  isLine: boolean;
  endHandlePos?: { x: number; y: number };
  onRotationMouseDown: (e: React.MouseEvent) => void;
  onResizeMouseDown: (e: React.MouseEvent, corner: ResizeCorner) => void;
  onLineResizeMouseDown: (e: React.MouseEvent) => void;
}> = ({ showHandles, isLine, endHandlePos, onRotationMouseDown, onResizeMouseDown, onLineResizeMouseDown }) => {
  if (!showHandles) return null;
  if (isLine) {
    return (
      <>
        <SelectionOutline />
        <RotationHandle onMouseDown={onRotationMouseDown} />
        {endHandlePos && <LineEndHandle position={endHandlePos} onMouseDown={onLineResizeMouseDown} />}
      </>
    );
  }
  return <AnnotationHandles onRotation={onRotationMouseDown} onResize={onResizeMouseDown} />;
};

// ============================================================================
// Layer Styles
// ============================================================================

const LAYER_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  zIndex: 9,
  overflow: 'hidden'
};

const CLICK_CAPTURE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'auto',
  cursor: 'crosshair',
  zIndex: 8
};

function useLayerClickHandler(cy: CyCore | null, onCanvasClick: (pos: { x: number; y: number }) => void) {
  return useCallback((e: React.MouseEvent) => {
    if (!cy) return;
    const container = cy.container();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const modelPos = renderedToModel(cy, e.clientX - rect.left, e.clientY - rect.top);
    onCanvasClick(modelPos);
    log.info(`[FreeShapeLayer] Canvas clicked at model (${modelPos.x}, ${modelPos.y})`);
  }, [cy, onCanvasClick]);
}

function isAnnotationInBox(annotation: FreeShapeAnnotation, box: { x1: number; y1: number; x2: number; y2: number }): boolean {
  const center = annotation.shapeType === 'line' ? getLineCenter(annotation) : annotation.position;
  const minX = Math.min(box.x1, box.x2);
  const maxX = Math.max(box.x1, box.x2);
  const minY = Math.min(box.y1, box.y2);
  const maxY = Math.max(box.y1, box.y2);
  return center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY;
}

function useAnnotationBoxSelection(
  cy: CyCore | null,
  annotations: FreeShapeAnnotation[],
  onBoxSelect?: (ids: string[]) => void
) {
  const boxStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!cy || !onBoxSelect) return;

    const handleBoxStart = (event: { position: { x: number; y: number } }) => {
      boxStartRef.current = { x: event.position.x, y: event.position.y };
    };

    const handleBoxEnd = (event: { position: { x: number; y: number } }) => {
      if (!boxStartRef.current) return;
      const box = {
        x1: boxStartRef.current.x,
        y1: boxStartRef.current.y,
        x2: event.position.x,
        y2: event.position.y
      };

      const selectedIds = annotations.filter(a => isAnnotationInBox(a, box)).map(a => a.id);
      if (selectedIds.length > 0) {
        log.info(`[FreeShapeLayer] Box selected ${selectedIds.length} annotations`);
        onBoxSelect(selectedIds);
      }
      boxStartRef.current = null;
    };

    cy.on('boxstart', handleBoxStart);
    cy.on('boxend', handleBoxEnd);
    return () => {
      cy.off('boxstart', handleBoxStart);
      cy.off('boxend', handleBoxEnd);
    };
  }, [cy, annotations, onBoxSelect]);
}

// ============================================================================
// Main Layer Component
// ============================================================================

export const FreeShapeLayer: React.FC<FreeShapeLayerProps> = ({
  cy,
  annotations,
  isLocked,
  isAddShapeMode,
  onAnnotationEdit,
  onAnnotationDelete,
  onPositionChange,
  onRotationChange,
  onSizeChange,
  onEndPositionChange,
  onCanvasClick,
  selectedAnnotationIds = new Set(),
  onAnnotationSelect,
  onAnnotationToggleSelect,
  onAnnotationBoxSelect
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const handleLayerClick = useLayerClickHandler(cy, onCanvasClick);

  useAnnotationBoxSelection(cy, annotations, onAnnotationBoxSelect);

  if (!cy || (annotations.length === 0 && !isAddShapeMode)) return null;

  return (
    <div ref={layerRef} className="free-shape-layer" style={LAYER_STYLE}>
      {isAddShapeMode && <div style={CLICK_CAPTURE_STYLE} onClick={handleLayerClick} />}
      {annotations.map(annotation => (
        <ShapeAnnotationItem
          key={annotation.id}
          annotation={annotation}
          cy={cy}
          isLocked={isLocked}
          isSelected={selectedAnnotationIds.has(annotation.id)}
          onEdit={() => onAnnotationEdit(annotation.id)}
          onDelete={() => onAnnotationDelete(annotation.id)}
          onPositionChange={(pos) => onPositionChange(annotation.id, pos)}
          onRotationChange={(rotation) => onRotationChange(annotation.id, rotation)}
          onSizeChange={(width, height) => onSizeChange(annotation.id, width, height)}
          onEndPositionChange={(endPos) => onEndPositionChange(annotation.id, endPos)}
          onSelect={() => onAnnotationSelect?.(annotation.id)}
          onToggleSelect={() => onAnnotationToggleSelect?.(annotation.id)}
        />
      ))}
    </div>
  );
};

export default FreeShapeLayer;
