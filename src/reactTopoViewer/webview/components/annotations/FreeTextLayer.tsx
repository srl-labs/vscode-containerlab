/**
 * FreeTextLayer - HTML overlay layer for rendering free text annotations
 * Renders text annotations with markdown support on top of the Cytoscape canvas.
 */
import React, { useRef, useState, useMemo } from 'react';
import type { Core as CyCore } from 'cytoscape';
import { FreeTextAnnotation } from '../../../shared/types/topology';
import {
  computeAnnotationStyle,
  useAnnotationInteractions,
  useAnnotationClickHandlers,
  useLayerClickHandler,
  useAnnotationBoxSelection
} from '../../hooks/annotations';
import { renderMarkdown } from '../../utils/markdownRenderer';
import { MapLibreState } from '../../hooks/canvas/maplibreUtils';

// ============================================================================
// Types
// ============================================================================

interface FreeTextLayerProps {
  cy: CyCore | null;
  annotations: FreeTextAnnotation[];
  isLocked: boolean;
  isAddTextMode: boolean;
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
// Handle Components
// ============================================================================

const HANDLE_SIZE = 6;
const ROTATION_HANDLE_OFFSET = 18;
const CENTER_TRANSLATE = 'translate(-50%, -50%)';

interface RotationHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

const RotationHandle: React.FC<RotationHandleProps> = ({ onMouseDown }) => (
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
        transform: CENTER_TRANSLATE,
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
  nw: { top: 0, left: 0, cursor: 'nw-resize', transform: CENTER_TRANSLATE },
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

/** Simple context menu for annotations */
const AnnotationContextMenu: React.FC<{
  position: { x: number; y: number };
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ position, onEdit, onDelete, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClickOutside);
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
  isGeoMode, geoMode, mapLibreState, onGeoPositionChange
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const effectivelyLocked = calculateEffectivelyLocked(isLocked, isGeoMode, geoMode);

  const interactions = useAnnotationInteractions(
    cy, annotation, effectivelyLocked, onPositionChange, onRotationChange, onSizeChange, contentRef,
    isGeoMode ?? false, geoMode, mapLibreState ?? null, onGeoPositionChange
  );
  const { isDragging, isRotating, isResizing, renderedPos, handleMouseDown, handleRotationMouseDown, handleResizeMouseDown } = interactions;
  const { contextMenu, handleClick, handleDoubleClick, handleContextMenu, closeContextMenu } = useAnnotationClickHandlers(effectivelyLocked, onSelect, onToggleSelect, onDoubleClick);

  const isInteracting = isDragging || isRotating || isResizing;
  const showHandles = calculateShowHandles(isHovered, isInteracting, isSelected, effectivelyLocked);
  const renderedHtml = useMemo(() => renderMarkdown(annotation.text || ''), [annotation.text]);
  const styles = useTextAnnotationStyles(annotation, renderedPos, isInteracting, isHovered, effectivelyLocked, isDragging);

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
const CLICK_CAPTURE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'auto',
  cursor: 'text',
  zIndex: 9
};

// ============================================================================
// Helper for callback binding
// ============================================================================

/** Create bound callback props for TextAnnotationItem to reduce main component complexity */
function createTextAnnotationCallbacks(
  annotation: FreeTextAnnotation,
  handlers: {
    onAnnotationDoubleClick: (id: string) => void;
    onAnnotationDelete: (id: string) => void;
    onPositionChange: (id: string, position: { x: number; y: number }) => void;
    onRotationChange: (id: string, rotation: number) => void;
    onSizeChange: (id: string, width: number, height: number) => void;
    onAnnotationSelect?: (id: string) => void;
    onAnnotationToggleSelect?: (id: string) => void;
    onGeoPositionChange?: (id: string, geoCoords: { lat: number; lng: number }) => void;
  }
) {
  const id = annotation.id;
  return {
    onDoubleClick: () => handlers.onAnnotationDoubleClick(id),
    onDelete: () => handlers.onAnnotationDelete(id),
    onPositionChange: (pos: { x: number; y: number }) => handlers.onPositionChange(id, pos),
    onRotationChange: (rotation: number) => handlers.onRotationChange(id, rotation),
    onSizeChange: (width: number, height: number) => handlers.onSizeChange(id, width, height),
    onSelect: () => handlers.onAnnotationSelect?.(id),
    onToggleSelect: () => handlers.onAnnotationToggleSelect?.(id),
    onGeoPositionChange: handlers.onGeoPositionChange ? (geoCoords: { lat: number; lng: number }) => handlers.onGeoPositionChange!(id, geoCoords) : undefined
  };
}

// ============================================================================
// Main Layer Component
// ============================================================================

export const FreeTextLayer: React.FC<FreeTextLayerProps> = ({
  cy, annotations, isLocked, isAddTextMode,
  onAnnotationDoubleClick, onAnnotationDelete, onPositionChange, onRotationChange, onSizeChange, onCanvasClick,
  selectedAnnotationIds = new Set(),
  onAnnotationSelect,
  onAnnotationToggleSelect,
  onAnnotationBoxSelect,
  isGeoMode,
  geoMode,
  mapLibreState,
  onGeoPositionChange
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const handleLayerClick = useLayerClickHandler(cy, onCanvasClick, 'FreeTextLayer');

  // Enable box selection of annotations when shift+dragging in Cytoscape
  useAnnotationBoxSelection(cy, annotations, onAnnotationBoxSelect, undefined, 'FreeTextLayer');

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
            {...callbacks}
          />
        );
      })}
    </div>
  );
};

export default FreeTextLayer;
