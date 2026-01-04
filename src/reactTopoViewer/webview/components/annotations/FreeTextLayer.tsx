/**
 * FreeTextLayer - HTML overlay layer for rendering free text annotations
 *
 * Uses Cytoscape's viewport transform applied to the layer container so text
 * moves in sync with the canvas (no drift). Text is positioned using model
 * coordinates and scales with zoom like nodes do.
 */
import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { FreeTextAnnotation } from '../../../shared/types/topology';
import {
  computeAnnotationStyle,
  useAnnotationClickHandlers,
  useLayerClickHandler,
  useAnnotationBoxSelection,
  useAnnotationReparent
} from '../../hooks/annotations';
import { renderMarkdown } from '../../utils/markdownRenderer';
import type { MapLibreState } from '../../hooks/canvas/maplibreUtils';

import {
  HANDLE_SIZE,
  ROTATION_HANDLE_OFFSET,
  CENTER_TRANSLATE,
  AnnotationContextMenu,
  AnnotationHandles,
  createClickCaptureStyle,
  createBoundAnnotationCallbacks,
  type BaseAnnotationHandlers,
  type GroupRelatedProps
} from './shared';

// ============================================================================
// Types
// ============================================================================

interface FreeTextLayerProps extends GroupRelatedProps {
  cy: CyCore | null;
  annotations: FreeTextAnnotation[];
  isLocked: boolean;
  isAddTextMode: boolean;
  mode: 'edit' | 'view';
  textLayerNode?: HTMLElement | null;
  onAnnotationDoubleClick: (id: string) => void;
  onAnnotationDelete: (id: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onRotationChange: (id: string, rotation: number) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  onCanvasClick: (position: { x: number; y: number }) => void;
  selectedAnnotationIds?: Set<string>;
  onAnnotationSelect?: (id: string) => void;
  onAnnotationToggleSelect?: (id: string) => void;
  onAnnotationBoxSelect?: (ids: string[]) => void;
  isGeoMode?: boolean;
  geoMode?: 'pan' | 'edit';
  mapLibreState?: MapLibreState | null;
  onGeoPositionChange?: (id: string, geoCoords: { lat: number; lng: number }) => void;
}

// ============================================================================
// Hook: Sync layer transform with Cytoscape viewport
// ============================================================================

interface ViewportTransform {
  pan: { x: number; y: number };
  zoom: number;
}

/** Stable dummy position for computeAnnotationStyle (only style props like color/border are used, not x/y/zoom) */
const DUMMY_RENDERED_POS = { x: 0, y: 0, zoom: 1 } as const;

function useViewportTransform(cy: CyCore | null): ViewportTransform {
  const [transform, setTransform] = useState<ViewportTransform>({ pan: { x: 0, y: 0 }, zoom: 1 });

  useEffect(() => {
    if (!cy) return;

    const updateTransform = () => {
      setTransform({ pan: cy.pan(), zoom: cy.zoom() });
    };

    updateTransform();
    cy.on('pan zoom viewport', updateTransform);
    return () => { cy.off('pan zoom viewport', updateTransform); };
  }, [cy]);

  return transform;
}

// ============================================================================
// Helper: Document mouse event listeners
// ============================================================================

function addMouseListeners(
  onMouseMove: (e: MouseEvent) => void,
  onMouseUp: (e: MouseEvent) => void
): () => void {
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  return () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
}

// ============================================================================
// Hook: Drag handling for text annotations (model coords based)
// ============================================================================

interface UseDragOptions {
  cy: CyCore;
  modelPosition: { x: number; y: number };
  isLocked: boolean;
  onPositionChange: (position: { x: number; y: number }) => void;
  onDragStart?: () => void;
  onDragEnd?: (finalPosition: { x: number; y: number }) => void;
}

function useTextDrag(options: UseDragOptions) {
  const { cy, modelPosition, isLocked, onPositionChange, onDragStart, onDragEnd } = options;
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; modelX: number; modelY: number } | null>(null);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const zoom = cy.zoom();
      const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;
      const dy = (e.clientY - dragStartRef.current.mouseY) / zoom;
      setDragOffset({ dx, dy });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const zoom = cy.zoom();
      const dx = (e.clientX - dragStartRef.current.mouseX) / zoom;
      const dy = (e.clientY - dragStartRef.current.mouseY) / zoom;
      const finalX = Math.round(dragStartRef.current.modelX + dx);
      const finalY = Math.round(dragStartRef.current.modelY + dy);

      if (finalX !== modelPosition.x || finalY !== modelPosition.y) {
        onPositionChange({ x: finalX, y: finalY });
      }

      setIsDragging(false);
      setDragOffset(null);
      dragStartRef.current = null;
      onDragEnd?.({ x: finalX, y: finalY });
    };

    return addMouseListeners(handleMouseMove, handleMouseUp);
  }, [isDragging, cy, modelPosition, onPositionChange, onDragEnd]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      modelX: modelPosition.x,
      modelY: modelPosition.y
    };
    onDragStart?.();
  }, [isLocked, modelPosition, onDragStart]);

  // Current position = model position + drag offset
  const currentPosition = useMemo(() => {
    if (!dragOffset) return modelPosition;
    return { x: modelPosition.x + dragOffset.dx, y: modelPosition.y + dragOffset.dy };
  }, [modelPosition, dragOffset]);

  return { isDragging, currentPosition, handleMouseDown };
}

// ============================================================================
// Hook: Rotation handling
// ============================================================================

function useTextRotation(options: {
  cy: CyCore;
  modelPosition: { x: number; y: number };
  isLocked: boolean;
  onRotationChange: (rotation: number) => void;
}) {
  const { cy, modelPosition, isLocked, onRotationChange } = options;
  const [isRotating, setIsRotating] = useState(false);

  useEffect(() => {
    if (!isRotating) return;

    const handleMouseMove = (e: MouseEvent) => {
      const pan = cy.pan();
      const zoom = cy.zoom();
      const centerX = modelPosition.x * zoom + pan.x;
      const centerY = modelPosition.y * zoom + pan.y;

      const container = cy.container();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const angle = Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI) + 90;
      onRotationChange(Math.round(angle));
    };

    const handleMouseUp = () => {
      setIsRotating(false);
    };

    return addMouseListeners(handleMouseMove, handleMouseUp);
  }, [isRotating, cy, modelPosition, onRotationChange]);

  const handleRotationMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    setIsRotating(true);
  }, [isLocked]);

  return { isRotating, handleRotationMouseDown };
}

// ============================================================================
// Hook: Resize handling
// ============================================================================

function useTextResize(options: {
  cy: CyCore;
  currentWidth: number | undefined;
  currentHeight: number | undefined;
  contentRef: React.RefObject<HTMLDivElement | null>;
  isLocked: boolean;
  onSizeChange: (width: number, height: number) => void;
}) {
  const { cy, currentWidth, currentHeight, contentRef, isLocked, onSizeChange } = options;
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const dx = e.clientX - resizeStartRef.current.mouseX;
      const dy = e.clientY - resizeStartRef.current.mouseY;
      const newWidth = Math.max(10, resizeStartRef.current.width + dx);
      const newHeight = Math.max(10, resizeStartRef.current.height + dy);
      onSizeChange(Math.round(newWidth), Math.round(newHeight));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onSizeChange]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked) return;
    e.preventDefault();
    e.stopPropagation();

    const zoom = cy.zoom();
    const rect = contentRef.current?.getBoundingClientRect();
    // Divide by zoom to convert screen-space to model-space dimensions
    const width = currentWidth || (rect ? rect.width / zoom : 100);
    const height = currentHeight || (rect ? rect.height / zoom : 50);

    resizeStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, width, height };
    setIsResizing(true);
  }, [isLocked, cy, currentWidth, currentHeight, contentRef]);

  return { isResizing, handleResizeMouseDown };
}

// ============================================================================
// Text Item Component
// ============================================================================

interface TextItemProps {
  annotation: FreeTextAnnotation;
  cy: CyCore;
  isLocked: boolean;
  isSelected: boolean;
  isGeoMode?: boolean;
  geoMode?: 'pan' | 'edit';
  mapLibreState?: MapLibreState | null;
  groupDragOffset?: { dx: number; dy: number };
  onDoubleClick: () => void;
  onDelete: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onRotationChange: (rotation: number) => void;
  onSizeChange: (width: number, height: number) => void;
  onSelect: () => void;
  onToggleSelect: () => void;
  onGeoPositionChange?: (geoCoords: { lat: number; lng: number }) => void;
  onDragStart?: () => void;
  onDragEnd?: (finalPosition: { x: number; y: number }) => void;
  /** Callback to show context menu (rendered outside transformed layer) */
  onShowContextMenu: (position: { x: number; y: number }) => void;
}

function getAnnotationCursor(isLocked: boolean, isDragging: boolean): string {
  if (isLocked) return 'default';
  if (isDragging) return 'grabbing';
  return 'grab';
}

function getMarkdownContentStyle(annotation: FreeTextAnnotation): React.CSSProperties {
  const hasExplicitSize = annotation.width || annotation.height;
  if (!hasExplicitSize) return {};
  return { width: '100%', height: '100%', overflowX: 'hidden', overflowY: 'auto' };
}

function calculateEffectivelyLocked(isLocked: boolean, isGeoMode?: boolean, geoMode?: 'pan' | 'edit'): boolean {
  return isLocked || (isGeoMode === true && geoMode === 'pan');
}

const TextItem: React.FC<TextItemProps> = ({
  annotation, cy, isLocked, isSelected,
  isGeoMode, geoMode, groupDragOffset,
  onDoubleClick, onDelete, onPositionChange, onRotationChange, onSizeChange,
  onSelect, onToggleSelect, onDragStart, onDragEnd, onShowContextMenu
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const effectivelyLocked = calculateEffectivelyLocked(isLocked, isGeoMode, geoMode);

  // Drag handling
  const { isDragging, currentPosition, handleMouseDown } = useTextDrag({
    cy,
    modelPosition: annotation.position,
    isLocked: effectivelyLocked,
    onPositionChange,
    onDragStart,
    onDragEnd
  });

  // Rotation handling
  const { isRotating, handleRotationMouseDown } = useTextRotation({
    cy,
    modelPosition: annotation.position,
    isLocked: effectivelyLocked,
    onRotationChange
  });

  // Resize handling
  const { isResizing, handleResizeMouseDown } = useTextResize({
    cy,
    currentWidth: annotation.width,
    currentHeight: annotation.height,
    contentRef,
    isLocked: effectivelyLocked,
    onSizeChange
  });

  // Click handlers - use onShowContextMenu to render context menu outside transformed layer
  const { handleClick, handleDoubleClick } =
    useAnnotationClickHandlers(effectivelyLocked, onSelect, onToggleSelect, onDoubleClick, onDelete);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!effectivelyLocked) {
      onShowContextMenu({ x: e.clientX, y: e.clientY });
    }
  }, [effectivelyLocked, onShowContextMenu]);

  // Apply group drag offset
  const finalX = groupDragOffset ? currentPosition.x + groupDragOffset.dx : currentPosition.x;
  const finalY = groupDragOffset ? currentPosition.y + groupDragOffset.dy : currentPosition.y;

  const isInteracting = isDragging || isRotating || isResizing;
  const showHandles = (isHovered || isInteracting || isSelected) && !effectivelyLocked;
  const renderedHtml = useMemo(() => renderMarkdown(annotation.text || ''), [annotation.text]);

  const baseStyle = useMemo(() =>
    computeAnnotationStyle(annotation, DUMMY_RENDERED_POS, isInteracting, isHovered, effectivelyLocked),
    [annotation, isInteracting, isHovered, effectivelyLocked]
  );

  const contentStyle: React.CSSProperties = useMemo(() => ({
    ...baseStyle,
    position: 'relative',
    left: 'auto',
    top: 'auto',
    transform: 'none',
    zIndex: 'auto',
    cursor: getAnnotationCursor(effectivelyLocked, isDragging)
  }), [baseStyle, effectivelyLocked, isDragging]);

  const markdownStyle = useMemo(() => getMarkdownContentStyle(annotation), [annotation]);

  // Wrapper uses MODEL coordinates - layer transform handles screen conversion
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: finalX,
    top: finalY,
    transform: `${CENTER_TRANSLATE} rotate(${annotation.rotation || 0}deg)`,
    transformOrigin: 'center center',
    zIndex: annotation.zIndex ?? 11,
    pointerEvents: 'auto',
    padding: `${ROTATION_HANDLE_OFFSET + HANDLE_SIZE + 5}px 10px 10px 10px`,
    margin: `-${ROTATION_HANDLE_OFFSET + HANDLE_SIZE + 5}px -10px -10px -10px`
  };

  return (
    <div style={wrapperStyle}>
      <div
        ref={contentRef}
        style={contentStyle}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={effectivelyLocked ? undefined : 'Click to select, drag to move, double-click to edit, right-click for menu'}
      >
        <div className="free-text-markdown" style={markdownStyle} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        {showHandles && <AnnotationHandles onRotation={handleRotationMouseDown} onResize={handleResizeMouseDown} />}
      </div>
    </div>
  );
};

// ============================================================================
// Layer Styles
// ============================================================================

const CLICK_CAPTURE_STYLE = createClickCaptureStyle('text');

// ============================================================================
// Callback Helpers
// ============================================================================

interface TextAnnotationHandlers extends BaseAnnotationHandlers {
  onAnnotationDoubleClick: (id: string) => void;
}

function createTextAnnotationCallbacks(annotation: FreeTextAnnotation, handlers: TextAnnotationHandlers) {
  const id = annotation.id;
  const baseCallbacks = createBoundAnnotationCallbacks(id, handlers);
  return {
    ...baseCallbacks,
    onDoubleClick: () => handlers.onAnnotationDoubleClick(id)
  };
}

// ============================================================================
// Main Layer Component
// ============================================================================

export const FreeTextLayer: React.FC<FreeTextLayerProps> = ({
  cy, annotations, isLocked, isAddTextMode, mode,
  onAnnotationDoubleClick, onAnnotationDelete, onPositionChange, onRotationChange, onSizeChange, onCanvasClick,
  selectedAnnotationIds = new Set(),
  onAnnotationSelect, onAnnotationToggleSelect, onAnnotationBoxSelect,
  isGeoMode, geoMode, mapLibreState, onGeoPositionChange,
  groupDragOffsets, groups = [], onUpdateGroupId
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const transformedLayerRef = useRef<HTMLDivElement>(null);
  const handleLayerClick = useLayerClickHandler(cy, onCanvasClick, 'FreeTextLayer');

  // Context menu state - rendered outside transformed layer so position: fixed works
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; annotationId: string } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const createShowContextMenu = useCallback((annotationId: string) => (position: { x: number; y: number }) => {
    setContextMenu({ position, annotationId });
  }, []);

  // Get viewport transform from Cytoscape
  const { pan, zoom } = useViewportTransform(cy);

  // Sync transform to the layer via ref (avoids React re-render lag)
  useEffect(() => {
    if (transformedLayerRef.current && cy) {
      const p = cy.pan();
      const z = cy.zoom();
      transformedLayerRef.current.style.transform = `translate(${p.x}px, ${p.y}px) scale(${z})`;
    }
  }, [cy, pan, zoom]);

  // Also sync on animation frames for smoother updates during zoom
  useEffect(() => {
    if (!cy) return;
    let animationId: number;

    const syncTransform = () => {
      if (transformedLayerRef.current) {
        const p = cy.pan();
        const z = cy.zoom();
        transformedLayerRef.current.style.transform = `translate(${p.x}px, ${p.y}px) scale(${z})`;
      }
      animationId = window.requestAnimationFrame(syncTransform);
    };

    animationId = window.requestAnimationFrame(syncTransform);
    return () => window.cancelAnimationFrame(animationId);
  }, [cy]);

  useAnnotationBoxSelection(cy, annotations, onAnnotationBoxSelect, undefined, 'FreeTextLayer');

  const reparent = useAnnotationReparent({
    mode,
    isLocked,
    groups,
    onUpdateGroupId: onUpdateGroupId ?? (() => {})
  });

  const createDragCallbacks = useCallback((annotation: FreeTextAnnotation) => ({
    onDragStart: () => reparent.onDragStart(annotation.id, annotation.groupId),
    onDragEnd: (finalPosition: { x: number; y: number }) => reparent.onDragEnd(annotation.id, finalPosition)
  }), [reparent]);

  if (!cy || (annotations.length === 0 && !isAddTextMode)) return null;

  const handlers = {
    onAnnotationDoubleClick, onAnnotationDelete, onPositionChange, onRotationChange,
    onSizeChange, onAnnotationSelect, onAnnotationToggleSelect, onGeoPositionChange
  };

  // Layer style - clips content, no pointer events on container
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

  // Transformed layer - applies Cytoscape's viewport transform
  // Large explicit dimensions prevent CSS from constraining child widths based on position
  const transformedLayerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '10000px',
    height: '10000px',
    transformOrigin: '0 0',
    pointerEvents: 'none'
  };

  return (
    <div ref={layerRef} className="free-text-layer" style={layerStyle}>
      {isAddTextMode && <div style={CLICK_CAPTURE_STYLE} onClick={handleLayerClick} />}
      <div ref={transformedLayerRef} className="free-text-transformed" style={transformedLayerStyle}>
        {annotations.map(annotation => {
          const callbacks = createTextAnnotationCallbacks(annotation, handlers);
          const dragCallbacks = createDragCallbacks(annotation);
          const offset = annotation.groupId ? groupDragOffsets?.get(annotation.groupId) : undefined;
          return (
            <TextItem
              key={annotation.id}
              annotation={annotation}
              cy={cy}
              isLocked={isLocked}
              isSelected={selectedAnnotationIds.has(annotation.id)}
              isGeoMode={isGeoMode}
              geoMode={geoMode}
              mapLibreState={mapLibreState}
              groupDragOffset={offset}
              onShowContextMenu={createShowContextMenu(annotation.id)}
              {...callbacks}
              {...dragCallbacks}
            />
          );
        })}
      </div>
      {/* Context menu rendered outside transformed layer so position: fixed works correctly */}
      {contextMenu && (
        <AnnotationContextMenu
          position={contextMenu.position}
          onEdit={() => onAnnotationDoubleClick(contextMenu.annotationId)}
          onDelete={() => onAnnotationDelete(contextMenu.annotationId)}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
};

export default FreeTextLayer;
