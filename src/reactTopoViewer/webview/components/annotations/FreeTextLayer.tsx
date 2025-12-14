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
}

// ============================================================================
// Handle Components
// ============================================================================

const HANDLE_SIZE = 6;
const ROTATION_HANDLE_OFFSET = 18;

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
  isSelected: boolean;
  onDoubleClick: () => void;
  onDelete: () => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onRotationChange: (rotation: number) => void;
  onSizeChange: (width: number, height: number) => void;
  onSelect: () => void;
  onToggleSelect: () => void;
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

/** Compute wrapper style for annotation positioning */
function computeWrapperStyle(
  renderedPos: { x: number; y: number; zoom: number },
  rotation: number,
  zIndex: number
): React.CSSProperties {
  return {
    position: 'absolute',
    left: renderedPos.x,
    top: renderedPos.y,
    transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${renderedPos.zoom})`,
    transformOrigin: 'center center',
    zIndex,
    padding: `${ROTATION_HANDLE_OFFSET + HANDLE_SIZE + 5}px 10px 10px 10px`,
    margin: `-${ROTATION_HANDLE_OFFSET + HANDLE_SIZE + 5}px -10px -10px -10px`,
    pointerEvents: 'auto'
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

const TextAnnotationItem: React.FC<TextAnnotationItemProps> = ({
  annotation, cy, isLocked, isSelected, onDoubleClick, onDelete, onPositionChange, onRotationChange, onSizeChange, onSelect, onToggleSelect
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const interactions = useAnnotationInteractions(cy, annotation, isLocked, onPositionChange, onRotationChange, onSizeChange, contentRef);
  const { isDragging, isRotating, isResizing, renderedPos, handleMouseDown, handleRotationMouseDown, handleResizeMouseDown } = interactions;
  const { contextMenu, handleClick, handleDoubleClick, handleContextMenu, closeContextMenu } = useAnnotationClickHandlers(isLocked, onSelect, onToggleSelect, onDoubleClick);

  const isInteracting = isDragging || isRotating || isResizing;
  const showHandles = (isHovered || isInteracting || isSelected) && !isLocked;
  const renderedHtml = useMemo(() => renderMarkdown(annotation.text || ''), [annotation.text]);

  const wrapperStyle = computeWrapperStyle(renderedPos, annotation.rotation || 0, annotation.zIndex || 11);
  const baseStyle = computeAnnotationStyle(annotation, renderedPos, isInteracting, isHovered, isLocked);
  const contentStyle = computeContentStyle(baseStyle, isLocked, isDragging);
  const markdownStyle = getMarkdownContentStyle(annotation);

  return (
    <>
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
          title={isLocked ? undefined : 'Click to select, drag to move, double-click to edit, right-click for menu'}
        >
          {/* Markdown content with scrolling when resized */}
          <div className="free-text-markdown" style={markdownStyle} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          {/* Handles inside content div for proper positioning */}
          {showHandles && <AnnotationHandles onRotation={handleRotationMouseDown} onResize={handleResizeMouseDown} />}
        </div>
      </div>
      {/* Context menu */}
      {contextMenu && (
        <AnnotationContextMenu
          position={contextMenu}
          onEdit={onDoubleClick}
          onDelete={onDelete}
          onClose={closeContextMenu}
        />
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
// Main Layer Component
// ============================================================================

export const FreeTextLayer: React.FC<FreeTextLayerProps> = ({
  cy, annotations, isLocked, isAddTextMode,
  onAnnotationDoubleClick, onAnnotationDelete, onPositionChange, onRotationChange, onSizeChange, onCanvasClick,
  selectedAnnotationIds = new Set(),
  onAnnotationSelect,
  onAnnotationToggleSelect,
  onAnnotationBoxSelect
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const handleLayerClick = useLayerClickHandler(cy, onCanvasClick, 'FreeTextLayer');

  // Enable box selection of annotations when shift+dragging in Cytoscape
  useAnnotationBoxSelection(cy, annotations, onAnnotationBoxSelect, undefined, 'FreeTextLayer');

  if (!cy || (annotations.length === 0 && !isAddTextMode)) return null;

  return (
    <div ref={layerRef} className="free-text-layer" style={LAYER_STYLE}>
      {isAddTextMode && <div style={CLICK_CAPTURE_STYLE} onClick={handleLayerClick} />}
      {annotations.map(annotation => (
        <TextAnnotationItem
          key={annotation.id}
          annotation={annotation}
          cy={cy}
          isLocked={isLocked}
          isSelected={selectedAnnotationIds.has(annotation.id)}
          onDoubleClick={() => onAnnotationDoubleClick(annotation.id)}
          onDelete={() => onAnnotationDelete(annotation.id)}
          onPositionChange={(pos) => onPositionChange(annotation.id, pos)}
          onRotationChange={(rotation) => onRotationChange(annotation.id, rotation)}
          onSizeChange={(width, height) => onSizeChange(annotation.id, width, height)}
          onSelect={() => onAnnotationSelect?.(annotation.id)}
          onToggleSelect={() => onAnnotationToggleSelect?.(annotation.id)}
        />
      ))}
    </div>
  );
};

export default FreeTextLayer;
