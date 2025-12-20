/**
 * FreeShapeLayer - SVG overlay layer for rendering free shape annotations
 * Renders shape visuals below nodes (via cytoscape-layers) and interaction handles above nodes.
 */
import React, { useRef, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Core as CyCore } from 'cytoscape';

import { FreeShapeAnnotation, GroupStyleAnnotation } from '../../../shared/types/topology';
import {
  useAnnotationDrag,
  useRotationDrag,
  useResizeDrag,
  useLineResizeDrag,
  useAnnotationClickHandlers,
  useLayerClickHandler,
  useAnnotationBoxSelection
} from '../../hooks/annotations';
import { useAnnotationReparent } from '../../hooks/annotations/useAnnotationReparent';
import { getLineCenter } from '../../hooks/annotations/freeShapeHelpers';
import { MapLibreState, projectAnnotationGeoCoords, calculateScale } from '../../hooks/canvas/maplibreUtils';

import { buildShapeSvg } from './freeShapeLayerHelpers';
import {
  HANDLE_SIZE,
  HANDLE_BORDER,
  HANDLE_BOX_SHADOW,
  CENTER_TRANSLATE,
  RotationHandle,
  ResizeHandle,
  SelectionOutline,
  AnnotationContextMenu,
  type ResizeCorner
} from './shared';

// ============================================================================
// Types
// ============================================================================

interface FreeShapeLayerProps {
  cy: CyCore | null;
  annotations: FreeShapeAnnotation[];
  isLocked: boolean;
  isAddShapeMode: boolean;
  mode: 'edit' | 'view';
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
  // Cytoscape layer node for rendering below nodes
  shapeLayerNode?: HTMLElement | null;
  // Geo mode props
  isGeoMode?: boolean;
  geoMode?: 'pan' | 'edit';
  mapLibreState?: MapLibreState | null;
  onGeoPositionChange?: (id: string, geoCoords: { lat: number; lng: number }) => void;
  onEndGeoPositionChange?: (id: string, geoCoords: { lat: number; lng: number }) => void;
  // Deferred undo callbacks for drag operations
  onCaptureAnnotationBefore?: (id: string) => FreeShapeAnnotation | null;
  onFinalizeWithUndo?: (before: FreeShapeAnnotation | null, id: string) => void;
  /** Offsets to apply during group drag operations */
  groupDragOffsets?: Map<string, { dx: number; dy: number }>;
  /** Groups for drag-to-reparent functionality */
  groups?: GroupStyleAnnotation[];
  /** Callback to update annotation's groupId */
  onUpdateGroupId?: (annotationId: string, groupId: string | undefined) => void;
}

// ============================================================================
// Handle Components
// ============================================================================

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
// Helper Functions
// ============================================================================

function getCursorStyle(isLocked: boolean, isDragging: boolean): string {
  if (isLocked) return 'default';
  return isDragging ? 'grabbing' : 'grab';
}

function getModelPosition(annotation: FreeShapeAnnotation): { x: number; y: number } {
  return annotation.shapeType === 'line' ? getLineCenter(annotation) : annotation.position;
}

function computeShowHandles(params: { isHovered: boolean; isInteracting: boolean; isSelected: boolean; isLocked: boolean }): boolean {
  const { isHovered, isInteracting, isSelected, isLocked } = params;
  return (isHovered || isInteracting || isSelected) && !isLocked;
}

/**
 * Compute rendered position for a shape in geo mode or standard mode.
 * Returns model position (for cytoscape-layer which handles transform).
 */
function computeShapeRenderedPosition(
  annotation: FreeShapeAnnotation,
  mapLibreState: MapLibreState | null | undefined,
  isGeoMode: boolean | undefined
): { x: number; y: number; scale: number } {
  const modelPos = getModelPosition(annotation);

  if (isGeoMode && mapLibreState?.isInitialized && annotation.geoCoordinates) {
    const projected = projectAnnotationGeoCoords(mapLibreState, annotation.geoCoordinates);
    if (projected) {
      const scale = calculateScale(mapLibreState);
      return { x: projected.x, y: projected.y, scale };
    }
  }
  // Return model position with scale 1 (cytoscape-layer handles transform)
  return { x: modelPos.x, y: modelPos.y, scale: 1 };
}

const UNLOCKED_ANNOTATION_TOOLTIP = 'Click to select, drag to move, right-click for menu';

// ============================================================================
// Background Item (rendered in cytoscape-layer, below nodes)
// ============================================================================

interface ShapeBackgroundItemProps {
  annotation: FreeShapeAnnotation;
  position: { x: number; y: number; scale: number };
  /** Offset to apply during group drag (from parent group being dragged) */
  groupDragOffset?: { dx: number; dy: number };
}

const ShapeBackgroundItem: React.FC<ShapeBackgroundItemProps> = ({ annotation, position, groupDragOffset }) => {
  const { svg, width, height } = useMemo(() => buildShapeSvg(annotation), [annotation]);

  // Apply group drag offset if present
  const finalX = groupDragOffset ? position.x + groupDragOffset.dx : position.x;
  const finalY = groupDragOffset ? position.y + groupDragOffset.dy : position.y;

  return (
    <div
      style={{
        position: 'absolute',
        left: finalX,
        top: finalY,
        transform: `translate(-50%, -50%) rotate(${annotation.rotation ?? 0}deg) scale(${position.scale})`,
        transformOrigin: 'center center',
        width: `${width}px`,
        height: `${height}px`,
        zIndex: annotation.zIndex ?? 10,
        pointerEvents: 'none'
      }}
    >
      {svg}
    </div>
  );
};

// ============================================================================
// Interaction Item (rendered above nodes for handle access)
// ============================================================================

interface ShapeInteractionItemProps {
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
  // Drag visual sync callbacks
  onVisualPositionChange?: (position: { x: number; y: number }) => void;
  onVisualPositionClear?: () => void;
  isGeoMode?: boolean;
  geoMode?: 'pan' | 'edit';
  mapLibreState?: MapLibreState | null;
  onGeoPositionChange?: (geoCoords: { lat: number; lng: number }) => void;
  // Deferred undo callbacks for drag operations
  onDragStart?: () => FreeShapeAnnotation | null;
  onDragEnd?: (before: FreeShapeAnnotation | null) => void;
  /** Offset to apply during group drag (from parent group being dragged) */
  groupDragOffset?: { dx: number; dy: number };
  /** Called when drag starts (for reparenting) */
  onReparentDragStart?: () => void;
  /** Called when drag ends with final position (for reparenting) */
  onReparentDragEnd?: (finalPosition: { x: number; y: number }) => void;
}

const ShapeInteractionItem: React.FC<ShapeInteractionItemProps> = ({
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
  onToggleSelect,
  onVisualPositionChange,
  onVisualPositionClear,
  isGeoMode,
  geoMode,
  mapLibreState,
  onGeoPositionChange,
  onDragStart,
  onDragEnd,
  groupDragOffset,
  onReparentDragStart,
  onReparentDragEnd
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const effectivelyLocked = isLocked || (isGeoMode === true && geoMode === 'pan');
  const modelPosition = getModelPosition(annotation);
  const isLine = annotation.shapeType === 'line';

  // Compose drag end handlers: clear visual position AND call reparent callback
  const handleDragEnd = useCallback((finalPosition: { x: number; y: number }) => {
    onVisualPositionClear?.();
    onReparentDragEnd?.(finalPosition);
  }, [onVisualPositionClear, onReparentDragEnd]);

  const { isDragging, renderedPos, handleMouseDown } = useAnnotationDrag({
    cy,
    modelPosition,
    isLocked: effectivelyLocked,
    onPositionChange,
    onDragStart: onReparentDragStart,
    onDragMove: onVisualPositionChange,
    onDragEnd: handleDragEnd,
    isGeoMode: isGeoMode ?? false,
    geoMode,
    geoCoordinates: annotation.geoCoordinates,
    mapLibreState: mapLibreState ?? null,
    onGeoPositionChange
  });

  const { isRotating, handleRotationMouseDown } = useRotationDrag({
    cy,
    renderedPos,
    currentRotation: annotation.rotation ?? 0,
    isLocked: effectivelyLocked,
    onRotationChange,
    onDragStart,
    onDragEnd
  });

  const { isResizing: isBoxResizing, handleResizeMouseDown } = useResizeDrag({
    renderedPos,
    currentWidth: annotation.width,
    currentHeight: annotation.height,
    contentRef,
    isLocked: effectivelyLocked,
    onSizeChange,
    onDragStart,
    onDragEnd
  });

  const { isResizing: isLineResizing, handleMouseDown: handleLineResizeMouseDown } = useLineResizeDrag({
    cy,
    annotation,
    isLocked: effectivelyLocked,
    onEndPositionChange,
    onDragStart,
    onDragEnd
  });

  const { contextMenu, handleClick, handleContextMenu, closeContextMenu } = useAnnotationClickHandlers(effectivelyLocked, onSelect, onToggleSelect);

  const isInteracting = [isDragging, isRotating, isBoxResizing, isLineResizing].some(Boolean);
  const showHandles = computeShowHandles({ isHovered, isInteracting, isSelected, isLocked: effectivelyLocked });

  const { width, height, endHandlePos } = useMemo(() => buildShapeSvg(annotation), [annotation]);

  // Apply group drag offset if present
  const finalX = groupDragOffset ? renderedPos.x + groupDragOffset.dx : renderedPos.x;
  const finalY = groupDragOffset ? renderedPos.y + groupDragOffset.dy : renderedPos.y;

  // Use same transform approach as background layer for alignment
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: finalX,
    top: finalY,
    transform: `translate(-50%, -50%) rotate(${annotation.rotation ?? 0}deg) scale(${renderedPos.zoom})`,
    transformOrigin: 'center center',
    width: `${width}px`,
    height: `${height}px`,
    zIndex: annotation.zIndex ?? 10,
    cursor: getCursorStyle(effectivelyLocked, isDragging),
    pointerEvents: 'auto'
  };

  return (
    <>
      <div
        ref={contentRef}
        style={wrapperStyle}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={effectivelyLocked ? undefined : UNLOCKED_ANNOTATION_TOOLTIP}
      >
        {showHandles && (
          isLine ? (
            <>
              <SelectionOutline />
              <RotationHandle onMouseDown={handleRotationMouseDown} />
              {endHandlePos && <LineEndHandle position={endHandlePos} onMouseDown={handleLineResizeMouseDown} />}
            </>
          ) : (
            <AnnotationHandles onRotation={handleRotationMouseDown} onResize={handleResizeMouseDown} />
          )
        )}
      </div>
      {contextMenu && (
        <AnnotationContextMenu position={contextMenu} onEdit={onEdit} onDelete={onDelete} onClose={closeContextMenu} />
      )}
    </>
  );
};

// ============================================================================
// Layer Styles
// ============================================================================

const PORTAL_CONTENT_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  overflow: 'visible'
};

const INTERACTION_LAYER_STYLE: React.CSSProperties = {
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

function getShapeCenter(annotation: FreeShapeAnnotation): { x: number; y: number } {
  return annotation.shapeType === 'line' ? getLineCenter(annotation) : annotation.position;
}

function createAnnotationCallbacks(
  annotation: FreeShapeAnnotation,
  handlers: {
    onAnnotationEdit: (id: string) => void;
    onAnnotationDelete: (id: string) => void;
    onPositionChange: (id: string, position: { x: number; y: number }) => void;
    onRotationChange: (id: string, rotation: number) => void;
    onSizeChange: (id: string, width: number, height: number) => void;
    onEndPositionChange: (id: string, endPosition: { x: number; y: number }) => void;
    onAnnotationSelect?: (id: string) => void;
    onAnnotationToggleSelect?: (id: string) => void;
    onGeoPositionChange?: (id: string, geoCoords: { lat: number; lng: number }) => void;
    onCaptureAnnotationBefore?: (id: string) => FreeShapeAnnotation | null;
    onFinalizeWithUndo?: (before: FreeShapeAnnotation | null, id: string) => void;
  }
) {
  const id = annotation.id;
  return {
    onEdit: () => handlers.onAnnotationEdit(id),
    onDelete: () => handlers.onAnnotationDelete(id),
    onPositionChange: (pos: { x: number; y: number }) => handlers.onPositionChange(id, pos),
    onRotationChange: (rotation: number) => handlers.onRotationChange(id, rotation),
    onSizeChange: (width: number, height: number) => handlers.onSizeChange(id, width, height),
    onEndPositionChange: (endPos: { x: number; y: number }) => handlers.onEndPositionChange(id, endPos),
    onSelect: () => handlers.onAnnotationSelect?.(id),
    onToggleSelect: () => handlers.onAnnotationToggleSelect?.(id),
    onGeoPositionChange: handlers.onGeoPositionChange ? (geoCoords: { lat: number; lng: number }) => handlers.onGeoPositionChange!(id, geoCoords) : undefined,
    onDragStart: handlers.onCaptureAnnotationBefore ? () => handlers.onCaptureAnnotationBefore!(id) : undefined,
    onDragEnd: handlers.onFinalizeWithUndo ? (before: FreeShapeAnnotation | null) => handlers.onFinalizeWithUndo!(before, id) : undefined
  };
}

// ============================================================================
// Main Layer Component
// ============================================================================

export const FreeShapeLayer: React.FC<FreeShapeLayerProps> = ({
  cy,
  annotations,
  isLocked,
  isAddShapeMode,
  mode,
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
  onAnnotationBoxSelect,
  shapeLayerNode,
  isGeoMode,
  geoMode,
  mapLibreState,
  onGeoPositionChange,
  onCaptureAnnotationBefore,
  onFinalizeWithUndo,
  groupDragOffsets,
  groups = [],
  onUpdateGroupId
}) => {
  const handleLayerClick = useLayerClickHandler(cy, onCanvasClick, 'FreeShapeLayer');

  // Track drag positions for syncing background layer during drag
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});

  const setDragPosition = React.useCallback((id: string, position: { x: number; y: number }) => {
    setDragPositions(prev => ({ ...prev, [id]: position }));
  }, []);

  const clearDragPosition = React.useCallback((id: string) => {
    setDragPositions(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  useAnnotationBoxSelection(cy, annotations, onAnnotationBoxSelect, getShapeCenter, 'FreeShapeLayer');

  // Reparenting hook - allows dragging annotations into/out of groups
  const reparent = useAnnotationReparent({
    mode,
    isLocked,
    groups,
    onUpdateGroupId: onUpdateGroupId ?? (() => {})
  });

  // Create stable callbacks for reparenting
  const createReparentCallbacks = useCallback((annotation: FreeShapeAnnotation) => ({
    onReparentDragStart: () => reparent.onDragStart(annotation.id, annotation.groupId),
    onReparentDragEnd: (finalPosition: { x: number; y: number }) => reparent.onDragEnd(annotation.id, finalPosition)
  }), [reparent]);

  if (!cy || (annotations.length === 0 && !isAddShapeMode)) return null;

  const handlers = {
    onAnnotationEdit, onAnnotationDelete, onPositionChange, onRotationChange,
    onSizeChange, onEndPositionChange, onAnnotationSelect, onAnnotationToggleSelect,
    onGeoPositionChange, onCaptureAnnotationBefore, onFinalizeWithUndo
  };

  // Background content: shape visuals rendered into cytoscape-layer (below nodes)
  const backgroundContent = shapeLayerNode && (
    <div className="free-shape-layer-background" style={PORTAL_CONTENT_STYLE}>
      {annotations.map(annotation => {
        // Use drag position if available, otherwise compute from model/geo
        const dragPos = dragPositions[annotation.id];
        const pos = dragPos
          ? { x: dragPos.x, y: dragPos.y, scale: 1 }
          : computeShapeRenderedPosition(annotation, mapLibreState, isGeoMode);
        // Get offset for this annotation if its group is being dragged
        const offset = annotation.groupId ? groupDragOffsets?.get(annotation.groupId) : undefined;
        return (
          <ShapeBackgroundItem
            key={annotation.id}
            annotation={annotation}
            position={pos}
            groupDragOffset={offset}
          />
        );
      })}
    </div>
  );

  // Interaction content: handles and hit areas (above nodes in main DOM)
  const interactionContent = (
    <div className="free-shape-layer-interaction" style={INTERACTION_LAYER_STYLE}>
      {annotations.map(annotation => {
        const callbacks = createAnnotationCallbacks(annotation, handlers);
        const reparentCallbacks = createReparentCallbacks(annotation);
        // Get offset for this annotation if its group is being dragged
        const offset = annotation.groupId ? groupDragOffsets?.get(annotation.groupId) : undefined;
        return (
          <ShapeInteractionItem
            key={annotation.id}
            annotation={annotation}
            cy={cy}
            isLocked={isLocked}
            isSelected={selectedAnnotationIds.has(annotation.id)}
            onVisualPositionChange={(pos) => setDragPosition(annotation.id, pos)}
            onVisualPositionClear={() => clearDragPosition(annotation.id)}
            isGeoMode={isGeoMode}
            geoMode={geoMode}
            mapLibreState={mapLibreState}
            groupDragOffset={offset}
            {...callbacks}
            {...reparentCallbacks}
          />
        );
      })}
    </div>
  );

  return (
    <>
      {/* Shape visuals rendered into cytoscape-layer (below nodes) */}
      {shapeLayerNode && createPortal(backgroundContent, shapeLayerNode)}
      {/* Interaction layer (above nodes) */}
      {interactionContent}
      {/* Click capture overlay for add-shape mode */}
      {isAddShapeMode && <div style={CLICK_CAPTURE_STYLE} onClick={handleLayerClick} />}
    </>
  );
};

export default FreeShapeLayer;
