/**
 * FreeTextLayer - HTML overlay layer for rendering free text annotations
 * Renders text annotations with markdown support on top of the Cytoscape canvas.
 */
import React, { useRef, useState, useMemo, useCallback } from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { FreeTextAnnotation } from '../../../shared/types/topology';
import { computeAnnotationStyle } from '../../hooks/annotations/text';
import {
  useAnnotationInteractions,
  useAnnotationClickHandlers,
  useLayerClickHandler,
  useAnnotationBoxSelection
} from '../../hooks/annotations/interactions';
import { useAnnotationReparent } from '../../hooks/annotations/management';
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
  onAnnotationDoubleClick: (id: string) => void;
  onAnnotationDelete: (id: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onRotationChange: (id: string, rotation: number) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  onCanvasClick: (position: { x: number; y: number }) => void;
  /** IDs of currently selected annotations */
  selectedAnnotationIds?: Set<string>;
  /** Handler for selecting an annotation (single click) */
  onAnnotationSelect?: (id: string) => void;
  /** Handler for toggling annotation selection (Ctrl+click) */
  onAnnotationToggleSelect?: (id: string) => void;
  /** Handler for box selection of multiple annotations */
  onAnnotationBoxSelect?: (ids: string[]) => void;
  // Geo mode props
  isGeoMode?: boolean;
  geoMode?: 'pan' | 'edit';
  mapLibreState?: MapLibreState | null;
  onGeoPositionChange?: (id: string, geoCoords: { lat: number; lng: number }) => void;
}

// ============================================================================
// Individual Text Annotation Component
// ============================================================================

interface TextAnnotationItemProps {
  annotation: FreeTextAnnotation;
  cy: CyCore;
  isLocked: boolean;
  isSelected: boolean;
  onDoubleClick: () => void;
  onDelete: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onRotationChange: (rotation: number) => void;
  onSizeChange: (width: number, height: number) => void;
  onSelect: () => void;
  onToggleSelect: () => void;
  // Geo mode props
  isGeoMode?: boolean;
  geoMode?: 'pan' | 'edit';
  mapLibreState?: MapLibreState | null;
  onGeoPositionChange?: (geoCoords: { lat: number; lng: number }) => void;
  /** Offset to apply during group drag (from parent group being dragged) */
  groupDragOffset?: { dx: number; dy: number };
  /** Called when drag starts (for reparenting) */
  onDragStart?: () => void;
  /** Called when drag ends with final position (for reparenting) */
  onDragEnd?: (finalPosition: { x: number; y: number }) => void;
}

/** Get cursor style for annotation content */
function getAnnotationCursor(isLocked: boolean, isDragging: boolean): string {
  if (isLocked) return 'default';
  if (isDragging) return 'grabbing';
  return 'grab';
}

/** Get style for inner markdown content */
function getMarkdownContentStyle(annotation: FreeTextAnnotation): React.CSSProperties {
  const hasExplicitSize = annotation.width || annotation.height;
  if (!hasExplicitSize) return {};
  return { width: '100%', height: '100%', overflowX: 'hidden', overflowY: 'auto' };
}

/** Compute outer wrapper style for positioning (centering only) */
function computeOuterWrapperStyle(
  renderedPos: { x: number; y: number },
  zIndex: number
): React.CSSProperties {
  return {
    position: 'absolute',
    left: renderedPos.x,
    top: renderedPos.y,
    // Only translate for centering - NOT affected by scale
    transform: CENTER_TRANSLATE,
    zIndex,
    pointerEvents: 'auto'
  };
}

/** Compute inner wrapper style for scale and rotation */
function computeInnerWrapperStyle(
  zoom: number,
  rotation: number
): React.CSSProperties {
  return {
    // Scale and rotate around center
    transform: `rotate(${rotation}deg) scale(${zoom})`,
    transformOrigin: 'center center',
    padding: `${ROTATION_HANDLE_OFFSET + HANDLE_SIZE + 5}px 10px 10px 10px`,
    margin: `-${ROTATION_HANDLE_OFFSET + HANDLE_SIZE + 5}px -10px -10px -10px`
  };
}

/** Compute content style for annotation */
function computeContentStyle(
  baseStyle: React.CSSProperties,
  isLocked: boolean,
  isDragging: boolean
): React.CSSProperties {
  return {
    ...baseStyle,
    position: 'relative',
    left: 'auto',
    top: 'auto',
    transform: 'none',
    zIndex: 'auto',
    cursor: getAnnotationCursor(isLocked, isDragging)
  };
}

/** Hook to compute all styles for a text annotation to reduce component complexity */
function useTextAnnotationStyles(
  annotation: FreeTextAnnotation,
  renderedPos: { x: number; y: number; zoom: number },
  isInteracting: boolean,
  isHovered: boolean,
  effectivelyLocked: boolean,
  isDragging: boolean
) {
  return useMemo(() => ({
    outerWrapperStyle: computeOuterWrapperStyle(renderedPos, annotation.zIndex || 11),
    innerWrapperStyle: computeInnerWrapperStyle(renderedPos.zoom, annotation.rotation || 0),
    contentStyle: computeContentStyle(
      computeAnnotationStyle(annotation, renderedPos, isInteracting, isHovered, effectivelyLocked),
      effectivelyLocked,
      isDragging
    ),
    markdownStyle: getMarkdownContentStyle(annotation)
  }), [annotation, renderedPos, isInteracting, isHovered, effectivelyLocked, isDragging]);
}

/** Calculate if annotation should be effectively locked (geo pan mode or locked state) */
function calculateEffectivelyLocked(isLocked: boolean, isGeoMode?: boolean, geoMode?: 'pan' | 'edit'): boolean {
  return isLocked || (isGeoMode === true && geoMode === 'pan');
}

/** Calculate if handles should be shown */
function calculateShowHandles(isHovered: boolean, isInteracting: boolean, isSelected: boolean, effectivelyLocked: boolean): boolean {
  return (isHovered || isInteracting || isSelected) && !effectivelyLocked;
}

const TextAnnotationItem: React.FC<TextAnnotationItemProps> = ({
  annotation, cy, isLocked, isSelected, onDoubleClick, onDelete, onPositionChange, onRotationChange, onSizeChange, onSelect, onToggleSelect,
  isGeoMode, geoMode, mapLibreState, onGeoPositionChange, groupDragOffset, onDragStart, onDragEnd
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const effectivelyLocked = calculateEffectivelyLocked(isLocked, isGeoMode, geoMode);

  const interactions = useAnnotationInteractions({
    cy,
    annotation,
    isLocked: effectivelyLocked,
    onPositionChange,
    onRotationChange,
    onSizeChange,
    contentRef,
    isGeoMode: isGeoMode ?? false,
    geoMode,
    mapLibreState: mapLibreState ?? null,
    onGeoPositionChange,
    onDragStart,
    onDragEnd
  });
  const { isDragging, isRotating, isResizing, renderedPos, handleMouseDown, handleRotationMouseDown, handleResizeMouseDown } = interactions;
  const { contextMenu, handleClick, handleDoubleClick, handleContextMenu, closeContextMenu } = useAnnotationClickHandlers(effectivelyLocked, onSelect, onToggleSelect, onDoubleClick);

  // Apply group drag offset if annotation is in a group being dragged
  const finalRenderedPos = useMemo(() => {
    if (!groupDragOffset) return renderedPos;
    return { x: renderedPos.x + groupDragOffset.dx, y: renderedPos.y + groupDragOffset.dy, zoom: renderedPos.zoom };
  }, [renderedPos, groupDragOffset]);

  const isInteracting = isDragging || isRotating || isResizing;
  const showHandles = calculateShowHandles(isHovered, isInteracting, isSelected, effectivelyLocked);
  const renderedHtml = useMemo(() => renderMarkdown(annotation.text || ''), [annotation.text]);
  const styles = useTextAnnotationStyles(annotation, finalRenderedPos, isInteracting, isHovered, effectivelyLocked, isDragging);

  return (
    <>
      <div style={styles.outerWrapperStyle}>
        <div style={styles.innerWrapperStyle}>
          <div
            ref={contentRef}
            style={styles.contentStyle}
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title={effectivelyLocked ? undefined : 'Click to select, drag to move, double-click to edit, right-click for menu'}
          >
            <div className="free-text-markdown" style={styles.markdownStyle} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            {showHandles && <AnnotationHandles onRotation={handleRotationMouseDown} onResize={handleResizeMouseDown} />}
          </div>
        </div>
      </div>
      {contextMenu && (
        <AnnotationContextMenu position={contextMenu} onEdit={onDoubleClick} onDelete={onDelete} onClose={closeContextMenu} />
      )}
    </>
  );
};

// ============================================================================
// Layer Styles (extracted for complexity reduction)
// ============================================================================

/** Base layer style - pointer-events: none so clicks pass through to Cytoscape */
const LAYER_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  zIndex: 10,
  overflow: 'hidden'
};

/** Click capture overlay style - only active in add-text mode */
const CLICK_CAPTURE_STYLE = createClickCaptureStyle('text');

// ============================================================================
// Helper for callback binding
// ============================================================================

interface TextAnnotationHandlers extends BaseAnnotationHandlers {
  onAnnotationDoubleClick: (id: string) => void;
}

/** Create bound callback props for TextAnnotationItem to reduce main component complexity */
function createTextAnnotationCallbacks(
  annotation: FreeTextAnnotation,
  handlers: TextAnnotationHandlers
) {
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
  onAnnotationSelect,
  onAnnotationToggleSelect,
  onAnnotationBoxSelect,
  isGeoMode,
  geoMode,
  mapLibreState,
  onGeoPositionChange,
  groupDragOffsets,
  groups = [],
  onUpdateGroupId
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const handleLayerClick = useLayerClickHandler(cy, onCanvasClick, 'FreeTextLayer');

  // Enable box selection of annotations when shift+dragging in Cytoscape
  useAnnotationBoxSelection(cy, annotations, onAnnotationBoxSelect, undefined, 'FreeTextLayer');

  // Reparenting hook - allows dragging annotations into/out of groups
  const reparent = useAnnotationReparent({
    mode,
    isLocked,
    groups,
    onUpdateGroupId: onUpdateGroupId ?? (() => {})
  });

  // Create stable callbacks for reparenting
  const createDragCallbacks = useCallback((annotation: FreeTextAnnotation) => ({
    onDragStart: () => reparent.onDragStart(annotation.id, annotation.groupId),
    onDragEnd: (finalPosition: { x: number; y: number }) => reparent.onDragEnd(annotation.id, finalPosition)
  }), [reparent]);

  if (!cy || (annotations.length === 0 && !isAddTextMode)) return null;

  const handlers = {
    onAnnotationDoubleClick, onAnnotationDelete, onPositionChange, onRotationChange,
    onSizeChange, onAnnotationSelect, onAnnotationToggleSelect, onGeoPositionChange
  };

  return (
    <div ref={layerRef} className="free-text-layer" style={LAYER_STYLE}>
      {isAddTextMode && <div style={CLICK_CAPTURE_STYLE} onClick={handleLayerClick} />}
      {annotations.map(annotation => {
        const callbacks = createTextAnnotationCallbacks(annotation, handlers);
        const dragCallbacks = createDragCallbacks(annotation);
        // Get offset for this annotation if its group is being dragged
        const offset = annotation.groupId ? groupDragOffsets?.get(annotation.groupId) : undefined;
        return (
          <TextAnnotationItem
            key={annotation.id}
            annotation={annotation}
            cy={cy}
            isLocked={isLocked}
            isSelected={selectedAnnotationIds.has(annotation.id)}
            isGeoMode={isGeoMode}
            geoMode={geoMode}
            mapLibreState={mapLibreState}
            groupDragOffset={offset}
            {...callbacks}
            {...dragCallbacks}
          />
        );
      })}
    </div>
  );
};

export default FreeTextLayer;
