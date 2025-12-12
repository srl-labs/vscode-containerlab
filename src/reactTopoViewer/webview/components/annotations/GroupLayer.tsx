/**
 * GroupLayer - Renders group annotations using two Cytoscape HTML layers:
 * - Filled background below Cytoscape nodes
 * - Interaction overlay above Cytoscape nodes
 */
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Core as CyCore } from 'cytoscape';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { getLabelPositionStyles } from '../../hooks/groups/groupHelpers';

// ============================================================================
// Types
// ============================================================================

interface GroupLayerProps {
  cy: CyCore | null;
  groups: GroupStyleAnnotation[];
  backgroundLayerNode: HTMLElement | null; // From useGroupLayer - below Cytoscape nodes
  interactionLayerNode: HTMLElement | null; // From useGroupLayer - above Cytoscape nodes
  isLocked: boolean;
  onGroupEdit: (id: string) => void;
  onGroupDelete: (id: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }) => void;
  onDragMove?: (id: string, delta: { dx: number; dy: number }) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  selectedGroupIds?: Set<string>;
  onGroupSelect?: (id: string) => void;
  onGroupToggleSelect?: (id: string) => void;
}

interface GroupInteractionItemProps {
  group: GroupStyleAnnotation;
  cy: CyCore;
  isLocked: boolean;
  isSelected: boolean;
  onGroupEdit: (id: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }) => void;
  onDragMove?: (id: string, delta: { dx: number; dy: number }) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  onSelect?: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onVisualPositionChange?: (id: string, position: { x: number; y: number }) => void;
  onVisualPositionClear?: (id: string) => void;
  /** Callback to show context menu - rendered outside portal to avoid transform issues */
  onShowContextMenu: (groupId: string, position: { x: number; y: number }) => void;
}

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

// ============================================================================
// Constants
// ============================================================================

const CENTER_TRANSLATE = 'translate(-50%, -50%)';
const HANDLE_SIZE = 6;

const CORNER_STYLES: Record<ResizeCorner, React.CSSProperties> = {
  nw: { top: 0, left: 0, cursor: 'nw-resize', transform: CENTER_TRANSLATE },
  ne: { top: 0, right: 0, cursor: 'ne-resize', transform: 'translate(50%, -50%)' },
  sw: { bottom: 0, left: 0, cursor: 'sw-resize', transform: 'translate(-50%, 50%)' },
  se: { bottom: 0, right: 0, cursor: 'se-resize', transform: 'translate(50%, 50%)' }
};

// Layer content styles (the layer container is managed by cytoscape-layers)
const LAYER_CONTENT_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  overflow: 'visible'
};

// ============================================================================
// Style Builders
// ============================================================================

function getCursor(isLocked: boolean, isDragging: boolean): string {
  if (isLocked) return 'default';
  if (isDragging) return 'grabbing';
  return 'grab';
}

function buildWrapperStyle(
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number
): React.CSSProperties {
  return {
    position: 'absolute',
    left: x,
    top: y,
    width: `${width}px`,
    height: `${height}px`,
    transform: CENTER_TRANSLATE,
    zIndex,
    pointerEvents: 'auto'
  };
}

function buildContentStyle(
  group: GroupStyleAnnotation
): React.CSSProperties {
  return {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: group.backgroundColor ?? '#d9d9d9',
    opacity: (group.backgroundOpacity ?? 20) / 100,
    borderColor: group.borderColor ?? '#dddddd',
    borderWidth: `${group.borderWidth ?? 0.5}px`,
    borderStyle: group.borderStyle ?? 'solid',
    borderRadius: `${group.borderRadius ?? 0}px`,
    boxSizing: 'border-box',
    pointerEvents: 'none' // Allow clicking through to nodes below
  };
}

function buildLabelStyle(
  labelPosition: string | undefined,
  labelColor: string | undefined
): React.CSSProperties {
  return {
    position: 'absolute',
    ...getLabelPositionStyles(labelPosition),
    color: labelColor ?? '#ebecf0',
    fontSize: '9px',
    fontWeight: 500,
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    userSelect: 'none'
  };
}

// ============================================================================
// Handle Components
// ============================================================================

const ResizeHandle: React.FC<{
  position: ResizeCorner;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}> = ({ position, onMouseDown, onMouseEnter, onMouseLeave }) => (
  <div
    onMouseDown={onMouseDown}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    style={{
      position: 'absolute',
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
      backgroundColor: 'white',
      border: '2px solid #64b4ff',
      borderRadius: '2px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
      pointerEvents: 'auto',
      ...CORNER_STYLES[position]
    }}
    title="Drag to resize"
  />
);

const GroupHandles: React.FC<{
  onResize: (e: React.MouseEvent, corner: ResizeCorner) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}> = ({ onResize, onMouseEnter, onMouseLeave }) => (
  <>
    <div style={{
      position: 'absolute',
      inset: '-2px',
      border: '2px solid #64b4ff',
      borderRadius: '4px',
      pointerEvents: 'none'
    }} />
    <ResizeHandle position="nw" onMouseDown={(e) => onResize(e, 'nw')} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
    <ResizeHandle position="ne" onMouseDown={(e) => onResize(e, 'ne')} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
    <ResizeHandle position="sw" onMouseDown={(e) => onResize(e, 'sw')} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
    <ResizeHandle position="se" onMouseDown={(e) => onResize(e, 'se')} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
  </>
);

// ============================================================================
// Context Menu
// ============================================================================

const GroupContextMenu: React.FC<{
  groupId: string;
  position: { x: number; y: number };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}> = ({ groupId, position, onEdit, onDelete, onClose }) => {
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
    <div ref={menuRef} style={{
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
    }}>
      <button
        style={itemStyle}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        onClick={() => { onEdit(groupId); onClose(); }}
      >
        <i className="fas fa-pen" style={{ width: 16 }} />
        Edit Group
      </button>
      <button
        style={itemStyle}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        onClick={() => { onDelete(groupId); onClose(); }}
      >
        <i className="fas fa-trash" style={{ width: 16 }} />
        Delete Group
      </button>
    </div>
  );
};

// ============================================================================
// Hover Hook (with delayed off for reaching resize handles)
// ============================================================================

function useDelayedHover(delay: number = 150) {
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const onLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setIsHovered(false), delay);
  }, [delay]);

  return { isHovered, onEnter, onLeave };
}

// ============================================================================
// Drag/Resize Hooks
// ============================================================================

interface DragState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  modelX: number;
  modelY: number;
}

interface UseGroupDragInteractionOptions {
  cy: CyCore;
  groupId: string;
  isLocked: boolean;
  position: { x: number; y: number };
  onPositionChange: (id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }) => void;
  onDragMove?: (id: string, delta: { dx: number; dy: number }) => void;
  onVisualPositionChange?: (id: string, position: { x: number; y: number }) => void;
  onVisualPositionClear?: (id: string) => void;
}

function useGroupDragInteraction(options: UseGroupDragInteractionOptions) {
  const {
    cy,
    groupId,
    isLocked,
    position,
    onPositionChange,
    onDragMove,
    onVisualPositionChange,
    onVisualPositionClear
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState(position);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!isDragging) setDragPos(position);
  }, [position, isDragging]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const ref = dragRef.current;
      if (!ref) return;
      const zoom = cy.zoom();

      const incrDx = (e.clientX - ref.lastX) / zoom;
      const incrDy = (e.clientY - ref.lastY) / zoom;
      const totalDx = (e.clientX - ref.startX) / zoom;
      const totalDy = (e.clientY - ref.startY) / zoom;

      ref.lastX = e.clientX;
      ref.lastY = e.clientY;

      const nextPos = { x: ref.modelX + totalDx, y: ref.modelY + totalDy };
      setDragPos(nextPos);
      onVisualPositionChange?.(groupId, nextPos);

      onDragMove?.(groupId, { dx: incrDx, dy: incrDy });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const ref = dragRef.current;
      if (!ref) return;
      const zoom = cy.zoom();
      const dx = (e.clientX - ref.startX) / zoom;
      const dy = (e.clientY - ref.startY) / zoom;
      onPositionChange(groupId, { x: ref.modelX + dx, y: ref.modelY + dy }, { dx, dy });
      setIsDragging(false);
      dragRef.current = null;
      onVisualPositionClear?.(groupId);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, cy, groupId, onPositionChange, onDragMove, onVisualPositionChange, onVisualPositionClear]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      modelX: position.x,
      modelY: position.y
    };
    setIsDragging(true);
  }, [isLocked, position.x, position.y]);

  return { isDragging, dragPos, handleMouseDown };
}

interface ResizeState {
  corner: ResizeCorner;
  startX: number;
  startY: number;
  width: number;
  height: number;
  posX: number;
  posY: number;
}

function calcResizedDimensions(ref: ResizeState, dx: number, dy: number): { w: number; h: number } {
  const isEast = ref.corner === 'se' || ref.corner === 'ne';
  const isSouth = ref.corner === 'se' || ref.corner === 'sw';
  // Allow any size down to 20px minimum (just to prevent collapse)
  const w = Math.max(20, ref.width + dx * (isEast ? 1 : -1));
  const h = Math.max(20, ref.height + dy * (isSouth ? 1 : -1));
  return { w, h };
}

function calcResizedPosition(ref: ResizeState, w: number, h: number): { x: number; y: number } {
  const dw = (w - ref.width) / 2;
  const dh = (h - ref.height) / 2;
  const xMult = ref.corner.includes('e') ? 1 : -1;
  const yMult = ref.corner.includes('s') ? 1 : -1;
  return { x: ref.posX + dw * xMult, y: ref.posY + dh * yMult };
}

function useGroupResize(
  cy: CyCore,
  group: GroupStyleAnnotation,
  groupId: string,
  isLocked: boolean,
  onSizeChange: (id: string, width: number, height: number) => void,
  onPositionChange: (id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }) => void
) {
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<ResizeState | null>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const zoom = cy.zoom();
      const dx = (e.clientX - dragRef.current.startX) / zoom;
      const dy = (e.clientY - dragRef.current.startY) / zoom;

      const { w, h } = calcResizedDimensions(dragRef.current, dx, dy);
      const pos = calcResizedPosition(dragRef.current, w, h);
      onSizeChange(groupId, w, h);
      onPositionChange(groupId, pos, { dx: 0, dy: 0 });
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
  }, [isResizing, cy, groupId, onSizeChange, onPositionChange]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, corner: ResizeCorner) => {
    if (isLocked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      corner,
      startX: e.clientX,
      startY: e.clientY,
      width: group.width,
      height: group.height,
      posX: group.position.x,
      posY: group.position.y
    };
    setIsResizing(true);
  }, [isLocked, group]);

  return { isResizing, handleResizeMouseDown };
}

// ============================================================================
// Group Item Event Handlers Hook
// ============================================================================

function useGroupItemHandlers(
  groupId: string,
  isLocked: boolean,
  onGroupEdit: (id: string) => void,
  onGroupSelect: ((id: string) => void) | undefined,
  onGroupToggleSelect: ((id: string) => void) | undefined,
  onShowContextMenu: (groupId: string, position: { x: number; y: number }) => void
) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) return;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      onGroupToggleSelect?.(groupId);
      return;
    }
    onGroupSelect?.(groupId);
  }, [groupId, onGroupSelect, onGroupToggleSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLocked) onShowContextMenu(groupId, { x: e.clientX, y: e.clientY });
  }, [isLocked, groupId, onShowContextMenu]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLocked) onGroupEdit(groupId);
  }, [groupId, isLocked, onGroupEdit]);

  return { handleClick, handleContextMenu, handleDoubleClick };
}

// ============================================================================
// Group Item Components
// ============================================================================

const GroupBackgroundItem: React.FC<{
  group: GroupStyleAnnotation;
  position: { x: number; y: number };
}> = ({ group, position }) => (
  <div
    style={{
      ...buildWrapperStyle(position.x, position.y, group.width, group.height, group.zIndex ?? 5),
      pointerEvents: 'none'
    }}
  >
    <div style={buildContentStyle(group)} />
  </div>
);

const GroupInteractionItem: React.FC<GroupInteractionItemProps> = (props) => {
  const {
    group,
    cy,
    isLocked,
    isSelected,
    onGroupEdit,
    onPositionChange,
    onDragMove,
    onSizeChange,
    onSelect,
    onToggleSelect,
    onVisualPositionChange,
    onVisualPositionClear,
    onShowContextMenu
  } = props;

  const { isHovered, onEnter: handleMouseEnter, onLeave: handleMouseLeave } = useDelayedHover();

  const { isDragging, dragPos, handleMouseDown } = useGroupDragInteraction({
    cy,
    groupId: group.id,
    isLocked,
    position: group.position,
    onPositionChange,
    onDragMove,
    onVisualPositionChange,
    onVisualPositionClear
  });

  const { isResizing, handleResizeMouseDown } = useGroupResize(
    cy,
    group,
    group.id,
    isLocked,
    onSizeChange,
    onPositionChange
  );

  const { handleClick, handleContextMenu, handleDoubleClick } = useGroupItemHandlers(
    group.id,
    isLocked,
    onGroupEdit,
    onSelect,
    onToggleSelect,
    onShowContextMenu
  );

  const showHandles = !isLocked && (isHovered || isDragging || isResizing || isSelected);
  const cursor = getCursor(isLocked, isDragging);

  // Border width for draggable frame
  const borderDragWidth = 12;

  return (
    <div
      style={{
        ...buildWrapperStyle(dragPos.x, dragPos.y, group.width, group.height, group.zIndex ?? 5),
        pointerEvents: 'none'
      }}
    >
      {/* Draggable border frame - top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: borderDragWidth,
          pointerEvents: isLocked ? 'none' : 'auto',
          cursor
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      />
      {/* Draggable border frame - bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: borderDragWidth,
          pointerEvents: isLocked ? 'none' : 'auto',
          cursor
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      />
      {/* Draggable border frame - left */}
      <div
        style={{
          position: 'absolute',
          top: borderDragWidth,
          bottom: borderDragWidth,
          left: 0,
          width: borderDragWidth,
          pointerEvents: isLocked ? 'none' : 'auto',
          cursor
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      />
      {/* Draggable border frame - right */}
      <div
        style={{
          position: 'absolute',
          top: borderDragWidth,
          bottom: borderDragWidth,
          right: 0,
          width: borderDragWidth,
          pointerEvents: isLocked ? 'none' : 'auto',
          cursor
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
      />
      {/* Label is outside the border */}
      <div
        style={{
          ...buildLabelStyle(group.labelPosition, group.labelColor),
          pointerEvents: isLocked ? 'none' : 'auto',
          padding: '2px 6px',
          borderRadius: '2px',
          backgroundColor: 'rgba(0,0,0,0.4)',
          cursor
        }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        title={isLocked ? group.name : 'Drag to move group, right-click for menu'}
      >
        {group.name}
      </div>
      {showHandles && (
        <GroupHandles
          onResize={handleResizeMouseDown}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      )}
    </div>
  );
};

// ============================================================================
// Main Layer Component
// ============================================================================

function sortGroupsByZIndex(groups: GroupStyleAnnotation[]): GroupStyleAnnotation[] {
  return [...groups].sort((a, b) => (a.zIndex ?? 5) - (b.zIndex ?? 5));
}

function useDragPositionOverrides() {
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});

  const setDragPosition = useCallback((groupId: string, position: { x: number; y: number }) => {
    setDragPositions(prev => ({ ...prev, [groupId]: position }));
  }, []);

  const clearDragPosition = useCallback((groupId: string) => {
    setDragPositions(prev => {
      if (!(groupId in prev)) return prev;
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
  }, []);

  return { dragPositions, setDragPosition, clearDragPosition };
}

const GroupBackgroundPortal: React.FC<{
  layerNode: HTMLElement;
  groups: GroupStyleAnnotation[];
  dragPositions: Record<string, { x: number; y: number }>;
}> = ({ layerNode, groups, dragPositions }) => createPortal(
  <div className="group-layer-content group-layer-content--background" style={LAYER_CONTENT_STYLE}>
    {groups.map(group => (
      <GroupBackgroundItem
        key={group.id}
        group={group}
        position={dragPositions[group.id] ?? group.position}
      />
    ))}
  </div>,
  layerNode
);

const GroupInteractionPortal: React.FC<{
  layerNode: HTMLElement;
  groups: GroupStyleAnnotation[];
  cy: CyCore;
  isLocked: boolean;
  selectedGroupIds: Set<string>;
  onGroupEdit: (id: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }) => void;
  onDragMove?: (id: string, delta: { dx: number; dy: number }) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  onGroupSelect?: (id: string) => void;
  onGroupToggleSelect?: (id: string) => void;
  onVisualPositionChange: (id: string, position: { x: number; y: number }) => void;
  onVisualPositionClear: (id: string) => void;
  onShowContextMenu: (groupId: string, position: { x: number; y: number }) => void;
}> = ({
  layerNode,
  groups,
  cy,
  isLocked,
  selectedGroupIds,
  onGroupEdit,
  onPositionChange,
  onDragMove,
  onSizeChange,
  onGroupSelect,
  onGroupToggleSelect,
  onVisualPositionChange,
  onVisualPositionClear,
  onShowContextMenu
}) => createPortal(
  <div className="group-layer-content group-layer-content--interaction" style={LAYER_CONTENT_STYLE}>
    {groups.map(group => (
      <GroupInteractionItem
        key={group.id}
        group={group}
        cy={cy}
        isLocked={isLocked}
        isSelected={selectedGroupIds.has(group.id)}
        onGroupEdit={onGroupEdit}
        onPositionChange={onPositionChange}
        onDragMove={onDragMove}
        onSizeChange={onSizeChange}
        onSelect={onGroupSelect}
        onToggleSelect={onGroupToggleSelect}
        onVisualPositionChange={onVisualPositionChange}
        onVisualPositionClear={onVisualPositionClear}
        onShowContextMenu={onShowContextMenu}
      />
    ))}
  </div>,
  layerNode
);

export const GroupLayer: React.FC<GroupLayerProps> = ({
  cy,
  groups,
  backgroundLayerNode,
  interactionLayerNode,
  isLocked,
  onGroupEdit,
  onGroupDelete,
  onPositionChange,
  onDragMove,
  onSizeChange,
  selectedGroupIds = new Set(),
  onGroupSelect,
  onGroupToggleSelect
}) => {
  const dragOverrides = useDragPositionOverrides();

  // Context menu state - lifted out of portal to avoid transform issues with position:fixed
  const [contextMenu, setContextMenu] = useState<{ groupId: string; x: number; y: number } | null>(null);

  const handleShowContextMenu = useCallback((groupId: string, position: { x: number; y: number }) => {
    setContextMenu({ groupId, x: position.x, y: position.y });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Don't render if no cy, no groups, or no layer nodes from cytoscape-layers
  if (!cy || groups.length === 0 || (!backgroundLayerNode && !interactionLayerNode)) return null;

  const sortedGroups = sortGroupsByZIndex(groups);

  return (
    <>
      {backgroundLayerNode && (
        <GroupBackgroundPortal
          layerNode={backgroundLayerNode}
          groups={sortedGroups}
          dragPositions={dragOverrides.dragPositions}
        />
      )}
      {interactionLayerNode && (
        <GroupInteractionPortal
          layerNode={interactionLayerNode}
          groups={sortedGroups}
          cy={cy}
          isLocked={isLocked}
          selectedGroupIds={selectedGroupIds}
          onGroupEdit={onGroupEdit}
          onPositionChange={onPositionChange}
          onDragMove={onDragMove}
          onSizeChange={onSizeChange}
          onGroupSelect={onGroupSelect}
          onGroupToggleSelect={onGroupToggleSelect}
          onVisualPositionChange={dragOverrides.setDragPosition}
          onVisualPositionClear={dragOverrides.clearDragPosition}
          onShowContextMenu={handleShowContextMenu}
        />
      )}
      {/* Context menu rendered outside portals to avoid transform issues */}
      {contextMenu && (
        <GroupContextMenu
          groupId={contextMenu.groupId}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onEdit={onGroupEdit}
          onDelete={onGroupDelete}
          onClose={handleCloseContextMenu}
        />
      )}
    </>
  );
};

export default GroupLayer;
