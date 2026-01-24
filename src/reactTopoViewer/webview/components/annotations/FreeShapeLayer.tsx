/**
 * FreeShapeLayer - SVG overlay layer for rendering free shape annotations
 * Renders shape visuals below nodes (via cytoscape-layers) and interaction handles above nodes.
 */
import React, { useRef, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";

import type { FreeShapeAnnotation } from "../../../shared/types/topology";
import {
  useAnnotationDrag,
  useRotationDrag,
  useResizeDrag,
  useLineResizeDrag,
  useAnnotationClickHandlers,
  useLayerClickHandler,
  useAnnotationBoxSelection,
  useAnnotationReparent,
  getLineCenter,
  useDebouncedHover
} from "../../hooks/annotations";
import type { MapLibreState } from "../../hooks/canvas/maplibreUtils";
import { projectAnnotationGeoCoords, calculateScale } from "../../hooks/canvas/maplibreUtils";
import { useViewportTransform } from "../../context/ViewportContext";

import { buildShapeSvg } from "./FreeShapeLayerHelpers";
import {
  HANDLE_SIZE,
  HANDLE_BORDER,
  HANDLE_BOX_SHADOW,
  CENTER_TRANSLATE,
  RotationHandle,
  SelectionOutline,
  AnnotationContextMenu,
  AnnotationHandles,
  createClickCaptureStyle,
  createBoundAnnotationCallbacks,
  type BaseAnnotationHandlers,
  type GroupRelatedProps,
  type ResizeCorner
} from "./shared";

// ============================================================================
// Types
// ============================================================================

interface FreeShapeLayerProps extends GroupRelatedProps {
  annotations: FreeShapeAnnotation[];
  isLocked: boolean;
  isAddShapeMode: boolean;
  mode: "edit" | "view";
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
  geoMode?: "pan" | "edit";
  mapLibreState?: MapLibreState | null;
  onGeoPositionChange?: (id: string, geoCoords: { lat: number; lng: number }) => void;
  onEndGeoPositionChange?: (id: string, geoCoords: { lat: number; lng: number }) => void;
  // Deferred undo callbacks for drag operations
  onCaptureAnnotationBefore?: (id: string) => FreeShapeAnnotation | null;
  onFinalizeWithUndo?: (before: FreeShapeAnnotation | null, id: string) => void;
}

// ============================================================================
// Handle Components
// ============================================================================

/** Props for ShapeHandles component */
interface ShapeHandlesProps {
  isLine: boolean;
  endHandlePos?: { x: number; y: number };
  handleRotationMouseDown: (e: React.MouseEvent) => void;
  handleResizeMouseDown: (e: React.MouseEvent, corner: ResizeCorner) => void;
  handleLineResizeMouseDown: (e: React.MouseEvent) => void;
  hoverHandlers: { onMouseEnter: () => void; onMouseLeave: () => void };
}

/** Renders shape handles based on shape type (line vs box) */
const ShapeHandles: React.FC<ShapeHandlesProps> = ({
  isLine,
  endHandlePos,
  handleRotationMouseDown,
  handleResizeMouseDown,
  handleLineResizeMouseDown,
  hoverHandlers
}) => {
  if (isLine) {
    return (
      <>
        <SelectionOutline />
        <RotationHandle
          onMouseDown={handleRotationMouseDown}
          onMouseEnter={hoverHandlers.onMouseEnter}
          onMouseLeave={hoverHandlers.onMouseLeave}
        />
        {endHandlePos && (
          <LineEndHandle position={endHandlePos} onMouseDown={handleLineResizeMouseDown} />
        )}
      </>
    );
  }
  return (
    <AnnotationHandles
      onRotation={handleRotationMouseDown}
      onResize={handleResizeMouseDown}
      onMouseEnter={hoverHandlers.onMouseEnter}
      onMouseLeave={hoverHandlers.onMouseLeave}
    />
  );
};

const LineEndHandle: React.FC<{
  position: { x: number; y: number };
  onMouseDown: (e: React.MouseEvent) => void;
}> = ({ position, onMouseDown }) => (
  <div
    onMouseDown={onMouseDown}
    style={{
      position: "absolute",
      left: position.x,
      top: position.y,
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
      backgroundColor: "white",
      border: HANDLE_BORDER,
      borderRadius: "2px",
      transform: CENTER_TRANSLATE,
      boxShadow: HANDLE_BOX_SHADOW,
      cursor: "nwse-resize",
      pointerEvents: "auto"
    }}
    title="Drag to resize line"
  />
);

// ============================================================================
// Helper Functions
// ============================================================================

function getCursorStyle(isLocked: boolean, isDragging: boolean): string {
  if (isLocked) return "default";
  return isDragging ? "grabbing" : "grab";
}

function getModelPosition(annotation: FreeShapeAnnotation): { x: number; y: number } {
  return annotation.shapeType === "line" ? getLineCenter(annotation) : annotation.position;
}

function computeShowHandles(params: {
  isHovered: boolean;
  isInteracting: boolean;
  isSelected: boolean;
  isLocked: boolean;
}): boolean {
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

const UNLOCKED_ANNOTATION_TOOLTIP = "Click to select, drag to move, right-click for menu";

/**
 * Apply group drag offset to a position if present
 */
function applyGroupOffset(
  pos: { x: number; y: number },
  offset?: { dx: number; dy: number }
): { x: number; y: number } {
  if (!offset) return pos;
  return { x: pos.x + offset.dx, y: pos.y + offset.dy };
}

// ============================================================================
// Background Item (rendered in cytoscape-layer, below nodes)
// ============================================================================

interface ShapeBackgroundItemProps {
  annotation: FreeShapeAnnotation;
  position: { x: number; y: number; scale: number };
  /** Offset to apply during group drag (from parent group being dragged) */
  groupDragOffset?: { dx: number; dy: number };
}

const ShapeBackgroundItem: React.FC<ShapeBackgroundItemProps> = ({
  annotation,
  position,
  groupDragOffset
}) => {
  const { svg, width, height } = useMemo(() => buildShapeSvg(annotation), [annotation]);

  // Apply group drag offset if present
  const finalX = groupDragOffset ? position.x + groupDragOffset.dx : position.x;
  const finalY = groupDragOffset ? position.y + groupDragOffset.dy : position.y;

  return (
    <div
      style={{
        position: "absolute",
        left: finalX,
        top: finalY,
        transform: `translate(-50%, -50%) rotate(${annotation.rotation ?? 0}deg) scale(${position.scale})`,
        transformOrigin: "center center",
        width: `${width}px`,
        height: `${height}px`,
        zIndex: annotation.zIndex ?? 10,
        pointerEvents: "none"
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
  pan: { x: number; y: number };
  zoom: number;
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
  geoMode?: "pan" | "edit";
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
  pan,
  zoom,
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
  const contentRef = useRef<HTMLDivElement>(null);
  const { isHovered, hoverHandlers } = useDebouncedHover();

  const effectivelyLocked = isLocked || (isGeoMode === true && geoMode === "pan");
  const modelPosition = getModelPosition(annotation);
  const isLine = annotation.shapeType === "line";

  // Compose drag end handlers: clear visual position AND call reparent callback
  const handleDragEnd = useCallback(
    (finalPosition: { x: number; y: number }) => {
      onVisualPositionClear?.();
      onReparentDragEnd?.(finalPosition);
    },
    [onVisualPositionClear, onReparentDragEnd]
  );

  const { isDragging, renderedPos, handleMouseDown } = useAnnotationDrag({
    pan,
    zoom,
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
    pan,
    zoom,
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

  const { isResizing: isLineResizing, handleMouseDown: handleLineResizeMouseDown } =
    useLineResizeDrag({
      zoom,
      annotation,
      isLocked: effectivelyLocked,
      onEndPositionChange,
      onDragStart,
      onDragEnd
    });

  const { contextMenu, handleClick, handleContextMenu, closeContextMenu } =
    useAnnotationClickHandlers(effectivelyLocked, onSelect, onToggleSelect, undefined, onDelete);

  const isInteracting = [isDragging, isRotating, isBoxResizing, isLineResizing].some(Boolean);
  const showHandles = computeShowHandles({
    isHovered,
    isInteracting,
    isSelected,
    isLocked: effectivelyLocked
  });

  const { width, height, endHandlePos } = useMemo(() => buildShapeSvg(annotation), [annotation]);

  // Apply group drag offset if present
  const finalPos = applyGroupOffset(renderedPos, groupDragOffset);

  // Border edge width for interaction (like groups)
  const borderDragWidth = 12;

  // Wrapper has pointerEvents: 'none' - clicks pass through to nodes
  // Only border edges and handles have pointerEvents: 'auto'
  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: finalPos.x,
    top: finalPos.y,
    transform: `translate(-50%, -50%) rotate(${annotation.rotation ?? 0}deg) scale(${renderedPos.zoom})`,
    transformOrigin: "center center",
    width: `${width}px`,
    height: `${height}px`,
    zIndex: annotation.zIndex ?? 10,
    pointerEvents: "none"
  };

  const cursor = getCursorStyle(effectivelyLocked, isDragging);

  // Frame style using clip-path to create a hollow rectangle (only edges are interactive)
  const frameStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: effectivelyLocked ? "none" : "auto",
    cursor,
    // Clip to create a frame: outer rectangle minus inner rectangle
    clipPath: `polygon(
      0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
      ${borderDragWidth}px ${borderDragWidth}px,
      ${borderDragWidth}px calc(100% - ${borderDragWidth}px),
      calc(100% - ${borderDragWidth}px) calc(100% - ${borderDragWidth}px),
      calc(100% - ${borderDragWidth}px) ${borderDragWidth}px,
      ${borderDragWidth}px ${borderDragWidth}px
    )`
  };

  return (
    <>
      <div ref={contentRef} style={wrapperStyle}>
        {/* Single frame element for hover/interaction - no flicker between edges */}
        <div
          style={frameStyle}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
          onMouseEnter={hoverHandlers.onMouseEnter}
          onMouseLeave={hoverHandlers.onMouseLeave}
          title={effectivelyLocked ? undefined : UNLOCKED_ANNOTATION_TOOLTIP}
        />
        {showHandles && (
          <ShapeHandles
            isLine={isLine}
            endHandlePos={endHandlePos}
            handleRotationMouseDown={handleRotationMouseDown}
            handleResizeMouseDown={handleResizeMouseDown}
            handleLineResizeMouseDown={handleLineResizeMouseDown}
            hoverHandlers={hoverHandlers}
          />
        )}
      </div>
      {contextMenu && (
        <AnnotationContextMenu
          position={contextMenu}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={closeContextMenu}
        />
      )}
    </>
  );
};

// ============================================================================
// Layer Styles
// ============================================================================

const PORTAL_CONTENT_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  overflow: "visible"
};

const INTERACTION_LAYER_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: "none",
  zIndex: 9,
  overflow: "hidden"
};

const CLICK_CAPTURE_STYLE = createClickCaptureStyle("crosshair");

function getShapeCenter(annotation: FreeShapeAnnotation): { x: number; y: number } {
  return annotation.shapeType === "line" ? getLineCenter(annotation) : annotation.position;
}

interface ShapeAnnotationHandlers extends BaseAnnotationHandlers {
  onAnnotationEdit: (id: string) => void;
  onEndPositionChange: (id: string, endPosition: { x: number; y: number }) => void;
  onCaptureAnnotationBefore?: (id: string) => FreeShapeAnnotation | null;
  onFinalizeWithUndo?: (before: FreeShapeAnnotation | null, id: string) => void;
}

function createAnnotationCallbacks(
  annotation: FreeShapeAnnotation,
  handlers: ShapeAnnotationHandlers
) {
  const id = annotation.id;
  const baseCallbacks = createBoundAnnotationCallbacks(id, handlers);
  return {
    ...baseCallbacks,
    onEdit: () => handlers.onAnnotationEdit(id),
    onEndPositionChange: (endPos: { x: number; y: number }) =>
      handlers.onEndPositionChange(id, endPos),
    onDragStart: handlers.onCaptureAnnotationBefore
      ? () => handlers.onCaptureAnnotationBefore!(id)
      : undefined,
    onDragEnd: handlers.onFinalizeWithUndo
      ? (before: FreeShapeAnnotation | null) => handlers.onFinalizeWithUndo!(before, id)
      : undefined
  };
}

// ============================================================================
// Main Layer Component
// ============================================================================

export const FreeShapeLayer: React.FC<FreeShapeLayerProps> = ({
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
  const handleLayerClick = useLayerClickHandler(onCanvasClick, "FreeShapeLayer");

  // Get viewport transform from ViewportContext
  const { pan, zoom } = useViewportTransform();

  // Track drag positions for syncing background layer during drag
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});

  const setDragPosition = React.useCallback((id: string, position: { x: number; y: number }) => {
    setDragPositions((prev) => ({ ...prev, [id]: position }));
  }, []);

  const clearDragPosition = React.useCallback((id: string) => {
    setDragPositions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  useAnnotationBoxSelection(annotations, onAnnotationBoxSelect, getShapeCenter, "FreeShapeLayer");

  // Reparenting hook - allows dragging annotations into/out of groups
  const reparent = useAnnotationReparent({
    mode,
    isLocked,
    groups,
    onUpdateGroupId: onUpdateGroupId ?? (() => {})
  });

  // Create stable callbacks for reparenting
  const createReparentCallbacks = useCallback(
    (annotation: FreeShapeAnnotation) => ({
      onReparentDragStart: () => reparent.onDragStart(annotation.id, annotation.groupId),
      onReparentDragEnd: (finalPosition: { x: number; y: number }) =>
        reparent.onDragEnd(annotation.id, finalPosition)
    }),
    [reparent]
  );

  if (annotations.length === 0 && !isAddShapeMode) return null;

  const handlers = {
    onAnnotationEdit,
    onAnnotationDelete,
    onPositionChange,
    onRotationChange,
    onSizeChange,
    onEndPositionChange,
    onAnnotationSelect,
    onAnnotationToggleSelect,
    onGeoPositionChange,
    onCaptureAnnotationBefore,
    onFinalizeWithUndo
  };

  // Background content: shape visuals rendered into cytoscape-layer (below nodes)
  const backgroundContent = shapeLayerNode && (
    <div className="free-shape-layer-background" style={PORTAL_CONTENT_STYLE}>
      {annotations.map((annotation) => {
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
      {annotations.map((annotation) => {
        const callbacks = createAnnotationCallbacks(annotation, handlers);
        const reparentCallbacks = createReparentCallbacks(annotation);
        // Get offset for this annotation if its group is being dragged
        const offset = annotation.groupId ? groupDragOffsets?.get(annotation.groupId) : undefined;
        return (
          <ShapeInteractionItem
            key={annotation.id}
            annotation={annotation}
            pan={pan}
            zoom={zoom}
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
