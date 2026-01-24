/**
 * GroupLayer - Renders group annotations using two HTML layers:
 * - Filled background below ReactFlow nodes
 * - Interaction overlay above ReactFlow nodes
 */
import React, { useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import { useViewportTransform } from "../../context/ViewportContext";
import {
  getLabelPositionStyles,
  getGroupDepth,
  findDeepestGroupAtPosition,
  validateNoCircularReference,
  useGroupDragInteraction,
  useGroupResize,
  useDragPositionOverrides
} from "../../hooks/groups";
import type { ResizeCorner } from "../../hooks/groups";
import { useDelayedHover } from "../../hooks/ui";
import { useAnnotationBoxSelection } from "../../hooks/annotations";
import type { MapLibreState } from "../../hooks/canvas/maplibreUtils";
import {
  projectAnnotationGeoCoords,
  calculateScale,
  unprojectToGeoCoords
} from "../../hooks/canvas/maplibreUtils";
import { log } from "../../utils/logger";

import { HANDLE_SIZE, CENTER_TRANSLATE, CORNER_STYLES, applyAlphaToColor } from "./shared";
import { AnnotationContextMenu } from "./shared/AnnotationContextMenu";

// ============================================================================
// Types
// ============================================================================

/** Shared handler types for group drag/resize operations (eliminates duplication) */
interface GroupDragResizeHandlers {
  onDragStart?: (id: string) => void;
  onPositionChange: (
    id: string,
    position: { x: number; y: number },
    delta: { dx: number; dy: number }
  ) => void;
  onDragMove?: (id: string, delta: { dx: number; dy: number }) => void;
  onResizeStart: (id: string) => void;
  onResizeMove: (
    id: string,
    width: number,
    height: number,
    position: { x: number; y: number }
  ) => void;
  onResizeEnd: (
    id: string,
    finalWidth: number,
    finalHeight: number,
    finalPosition: { x: number; y: number }
  ) => void;
}

interface GroupLayerProps extends GroupDragResizeHandlers {
  /** Current zoom level for coordinate conversion */
  zoom?: number;
  groups: GroupStyleAnnotation[];
  isLocked: boolean;
  onGroupEdit: (id: string) => void;
  onGroupDelete: (id: string) => void;
  selectedGroupIds?: Set<string>;
  onGroupSelect?: (id: string) => void;
  onGroupToggleSelect?: (id: string) => void;
  onGroupBoxSelect?: (ids: string[]) => void;
  /** Called when a group is reparented by dragging into another group */
  onGroupReparent?: (groupId: string, newParentId: string | null) => void;
  // Geo mode props
  isGeoMode?: boolean;
  geoMode?: "pan" | "edit";
  mapLibreState?: MapLibreState | null;
  onGeoPositionChange?: (id: string, geoCoords: { lat: number; lng: number }) => void;
  /** Calculate minimum bounds for group resize based on contained objects */
  getMinimumBounds: (groupId: string) => { minWidth: number; minHeight: number };
}

interface GroupInteractionItemProps extends GroupDragResizeHandlers {
  group: GroupStyleAnnotation;
  /** Current zoom level for coordinate conversion */
  zoom?: number;
  isLocked: boolean;
  isSelected: boolean;
  onGroupEdit: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelect?: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onVisualPositionChange?: (id: string, position: { x: number; y: number }) => void;
  onVisualPositionClear?: (id: string) => void;
  /** Callback to show context menu - rendered outside portal to avoid transform issues */
  onShowContextMenu: (groupId: string, position: { x: number; y: number }) => void;
  /** Called when drag ends, used for detecting drop targets */
  onDragEnd?: (id: string, finalPosition: { x: number; y: number }) => void;
  // Geo mode props
  isGeoMode?: boolean;
  mapLibreState?: MapLibreState | null;
  /** Calculate minimum bounds for group resize based on contained objects */
  getMinimumBounds: (groupId: string) => { minWidth: number; minHeight: number };
}

// ============================================================================
// Constants
// ============================================================================

// Layer content styles (the layer container is managed by useGroupLayer)
const LAYER_CONTENT_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  overflow: "visible"
};

/** Configuration for the four draggable border edges */
type BorderEdge = "top" | "bottom" | "left" | "right";

interface BorderEdgeConfig {
  edge: BorderEdge;
  getStyle: (borderWidth: number) => React.CSSProperties;
}

const BORDER_EDGE_CONFIGS: BorderEdgeConfig[] = [
  { edge: "top", getStyle: (bw) => ({ top: 0, left: 0, right: 0, height: bw }) },
  { edge: "bottom", getStyle: (bw) => ({ bottom: 0, left: 0, right: 0, height: bw }) },
  { edge: "left", getStyle: (bw) => ({ top: bw, bottom: bw, left: 0, width: bw }) },
  { edge: "right", getStyle: (bw) => ({ top: bw, bottom: bw, right: 0, width: bw }) }
];

// ============================================================================
// Group Layer Hook
// ============================================================================

interface UseGroupLayerReturn {
  /** Layer node transformed with pan/zoom, rendered BELOW nodes */
  backgroundLayerNode: HTMLElement | null;
  /** Layer node transformed with pan/zoom, rendered ABOVE nodes */
  interactionLayerNode: HTMLElement | null;
  updateLayers: () => void;
}

/**
 * Creates a layer node for portal rendering.
 */
function createLayerNode(pointerEvents: "auto" | "none", className: string): HTMLElement {
  const node = document.createElement("div");
  node.style.position = "absolute";
  node.style.top = "0";
  node.style.left = "0";
  node.style.width = "100%";
  node.style.height = "100%";
  node.style.pointerEvents = pointerEvents;
  node.style.overflow = "visible";
  node.style.transformOrigin = "0 0";
  node.classList.add(className);
  return node;
}

/**
 * Creates two HTML layers for group rendering:
 * - Background layer (visual fill, below nodes)
 * - Interaction layer (drag/resize handles, above nodes)
 *
 * These layers are rendered via React portals in the main canvas area.
 */
function useGroupLayer(): UseGroupLayerReturn {
  const backgroundLayerRef = useRef<HTMLElement | null>(null);
  const interactionLayerRef = useRef<HTMLElement | null>(null);
  const [backgroundLayerNode, setBackgroundLayerNode] = useState<HTMLElement | null>(null);
  const [interactionLayerNode, setInteractionLayerNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Find the ReactFlow container to append layers
    const container = document.querySelector(".react-flow");
    if (!container) {
      log.info("[GroupLayer] ReactFlow container not found, waiting...");
      return;
    }

    log.info("[GroupLayer] Creating background + interaction layers");

    // Create background layer (rendered below nodes)
    const backgroundLayer = createLayerNode("none", "group-background-layer-container");
    backgroundLayerRef.current = backgroundLayer;

    // Create interaction layer (rendered above nodes)
    const interactionLayer = createLayerNode("auto", "group-interaction-layer-container");
    interactionLayerRef.current = interactionLayer;

    // Append layers to the ReactFlow container
    container.appendChild(backgroundLayer);
    container.appendChild(interactionLayer);

    log.info("[GroupLayer] Layers created");
    setBackgroundLayerNode(backgroundLayer);
    setInteractionLayerNode(interactionLayer);

    return () => {
      backgroundLayerRef.current?.remove();
      interactionLayerRef.current?.remove();
      backgroundLayerRef.current = null;
      interactionLayerRef.current = null;
      setBackgroundLayerNode(null);
      setInteractionLayerNode(null);
    };
  }, []);

  const updateLayers = useCallback(() => {
    // No-op - layers update automatically via React portals
  }, []);

  return { backgroundLayerNode, interactionLayerNode, updateLayers };
}

// ============================================================================
// Style Builders
// ============================================================================

function getCursor(isLocked: boolean, isDragging: boolean): string {
  if (isLocked) return "default";
  if (isDragging) return "grabbing";
  return "grab";
}

function buildWrapperStyle(
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number
): React.CSSProperties {
  return {
    position: "absolute",
    left: x,
    top: y,
    width: `${width}px`,
    height: `${height}px`,
    transform: CENTER_TRANSLATE,
    zIndex,
    pointerEvents: "auto"
  };
}

function buildContentStyle(group: GroupStyleAnnotation): React.CSSProperties {
  const bgColor = group.backgroundColor ?? "#d9d9d9";
  const bgOpacity = (group.backgroundOpacity ?? 20) / 100;
  // Use rgba for background to properly cover grid, keep border fully opaque
  const bgColorWithAlpha = applyAlphaToColor(bgColor, bgOpacity);

  return {
    position: "relative",
    width: "100%",
    height: "100%",
    backgroundColor: bgColorWithAlpha,
    borderColor: group.borderColor ?? "#dddddd",
    borderWidth: `${group.borderWidth ?? 0.5}px`,
    borderStyle: group.borderStyle ?? "solid",
    borderRadius: `${group.borderRadius ?? 0}px`,
    boxSizing: "border-box",
    pointerEvents: "none" // Allow clicking through to nodes below
  };
}

function buildLabelStyle(
  labelPosition: string | undefined,
  labelColor: string | undefined
): React.CSSProperties {
  return {
    position: "absolute",
    ...getLabelPositionStyles(labelPosition),
    color: labelColor ?? "#ebecf0",
    fontSize: "9px",
    fontWeight: 500,
    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    userSelect: "none"
  };
}

// ============================================================================
// Geo Position Helpers
// ============================================================================

/**
 * Compute rendered position for a group in geo mode.
 * If geo coordinates are available and map is initialized, project them to screen position.
 * Otherwise fall back to model position.
 */
function computeGroupRenderedPosition(
  group: GroupStyleAnnotation,
  mapLibreState: MapLibreState | null | undefined,
  isGeoMode: boolean | undefined
): { x: number; y: number; scale: number } {
  // If geo mode is active and group has geo coordinates, project them
  if (isGeoMode && mapLibreState?.isInitialized && group.geoCoordinates) {
    const projected = projectAnnotationGeoCoords(mapLibreState, group.geoCoordinates);
    if (projected) {
      const scale = calculateScale(mapLibreState);
      return { x: projected.x, y: projected.y, scale };
    }
  }
  // Fall back to model position
  return { x: group.position.x, y: group.position.y, scale: 1 };
}

// ============================================================================
// Handle Components
// ============================================================================

const ResizeHandle: React.FC<{
  position: ResizeCorner;
  groupId: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}> = ({ position, groupId, onMouseDown, onMouseEnter, onMouseLeave }) => (
  <div
    data-testid={`resize-${position}-${groupId}`}
    onMouseDown={onMouseDown}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    style={{
      position: "absolute",
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
      backgroundColor: "white",
      border: "2px solid #64b4ff",
      borderRadius: "2px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
      pointerEvents: "auto",
      ...CORNER_STYLES[position]
    }}
    title="Drag to resize"
  />
);

const GroupHandles: React.FC<{
  groupId: string;
  onResize: (e: React.MouseEvent, corner: ResizeCorner) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}> = ({ groupId, onResize, onMouseEnter, onMouseLeave }) => (
  <>
    <div
      style={{
        position: "absolute",
        inset: "-2px",
        border: "2px solid #64b4ff",
        borderRadius: "4px",
        pointerEvents: "none"
      }}
    />
    <ResizeHandle
      groupId={groupId}
      position="nw"
      onMouseDown={(e) => onResize(e, "nw")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
    <ResizeHandle
      groupId={groupId}
      position="ne"
      onMouseDown={(e) => onResize(e, "ne")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
    <ResizeHandle
      groupId={groupId}
      position="sw"
      onMouseDown={(e) => onResize(e, "sw")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
    <ResizeHandle
      groupId={groupId}
      position="se"
      onMouseDown={(e) => onResize(e, "se")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  </>
);

// ============================================================================
// Group Item Components
// ============================================================================

const GroupBackgroundItem: React.FC<{
  group: GroupStyleAnnotation;
  position: { x: number; y: number; scale: number };
}> = ({ group, position }) => {
  // Apply scale to dimensions
  const scaledWidth = group.width * position.scale;
  const scaledHeight = group.height * position.scale;

  return (
    <div
      data-testid={`group-bg-${group.id}`}
      style={{
        ...buildWrapperStyle(position.x, position.y, scaledWidth, scaledHeight, group.zIndex ?? 5),
        pointerEvents: "none"
      }}
    >
      <div style={buildContentStyle(group)} />
    </div>
  );
};

const GroupInteractionItem: React.FC<GroupInteractionItemProps> = (props) => {
  const {
    group,
    zoom = 1,
    isLocked,
    isSelected,
    onGroupEdit,
    onDelete,
    onDragStart,
    onPositionChange,
    onDragMove,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
    onSelect,
    onToggleSelect,
    onVisualPositionChange,
    onVisualPositionClear,
    onShowContextMenu,
    onDragEnd,
    isGeoMode,
    mapLibreState,
    getMinimumBounds
  } = props;

  const { isHovered, onEnter: handleMouseEnter, onLeave: handleMouseLeave } = useDelayedHover();

  const { isDragging, dragPos, handleMouseDown } = useGroupDragInteraction({
    zoom,
    groupId: group.id,
    isLocked,
    position: group.position,
    onDragStart,
    onPositionChange,
    onDragMove,
    onVisualPositionChange,
    onVisualPositionClear,
    onDragEnd
  });

  const { isResizing, handleResizeMouseDown } = useGroupResize(
    zoom,
    group,
    group.id,
    isLocked,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
    getMinimumBounds
  );

  // Group item event handlers
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 2) return;
      e.stopPropagation();

      // Alt+Click deletes the group (only when not locked)
      if (e.altKey && onDelete && !isLocked) {
        onDelete(group.id);
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        onToggleSelect?.(group.id);
        return;
      }
      onSelect?.(group.id);
    },
    [group.id, isLocked, onSelect, onToggleSelect, onDelete]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isLocked) onShowContextMenu(group.id, { x: e.clientX, y: e.clientY });
    },
    [isLocked, group.id, onShowContextMenu]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isLocked) onGroupEdit(group.id);
    },
    [group.id, isLocked, onGroupEdit]
  );

  // Force re-render on map move for geo mode
  const [, setMapMoveCounter] = useState(0);
  useEffect(() => {
    if (!isGeoMode || !mapLibreState?.isInitialized || !mapLibreState.map) return;
    const handleMapMove = () => setMapMoveCounter((c) => c + 1);
    mapLibreState.map.on("move", handleMapMove);
    return () => {
      mapLibreState.map?.off("move", handleMapMove);
    };
  }, [isGeoMode, mapLibreState]);

  // Compute rendered position: use geo coordinates in geo mode, otherwise use drag position
  const renderedPos = isDragging
    ? { x: dragPos.x, y: dragPos.y, scale: 1 }
    : computeGroupRenderedPosition(group, mapLibreState, isGeoMode);

  const showHandles = !isLocked && (isHovered || isDragging || isResizing || isSelected);
  const cursor = getCursor(isLocked, isDragging);

  // Apply scale to dimensions in geo mode
  const scaledWidth = group.width * renderedPos.scale;
  const scaledHeight = group.height * renderedPos.scale;

  // Border width for draggable frame (also scaled in geo mode)
  const borderDragWidth = 12 * renderedPos.scale;

  return (
    <div
      data-testid={`group-${group.id}`}
      style={{
        ...buildWrapperStyle(
          renderedPos.x,
          renderedPos.y,
          scaledWidth,
          scaledHeight,
          group.zIndex ?? 5
        ),
        pointerEvents: "none"
      }}
    >
      {/* Draggable border frame edges (only when interacting, to avoid blocking node clicks) */}
      {showHandles &&
        BORDER_EDGE_CONFIGS.map(({ edge, getStyle }) => (
          <div
            key={edge}
            data-testid={`group-drag-${edge}-${group.id}`}
            style={{
              position: "absolute",
              ...getStyle(borderDragWidth),
              pointerEvents: isLocked ? "none" : "auto",
              cursor
            }}
            onMouseDown={handleMouseDown}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
          />
        ))}
      {/* Label is outside the border */}
      <div
        data-testid={`group-label-${group.id}`}
        style={{
          ...buildLabelStyle(group.labelPosition, group.labelColor ?? group.color),
          pointerEvents: isLocked ? "none" : "auto",
          padding: "2px 6px",
          borderRadius: "2px",
          backgroundColor: "rgba(0,0,0,0.4)",
          cursor
        }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        title={isLocked ? group.name : "Drag to move group, right-click for menu"}
      >
        {group.name}
      </div>
      {showHandles && (
        <GroupHandles
          groupId={group.id}
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

/**
 * Sort groups by depth (parents first) then by zIndex.
 * This ensures parent groups render before their children.
 */
function sortGroupsByDepthThenZIndex(groups: GroupStyleAnnotation[]): GroupStyleAnnotation[] {
  return [...groups].sort((a, b) => {
    const depthA = getGroupDepth(a.id, groups);
    const depthB = getGroupDepth(b.id, groups);

    // Sort by depth first (lower depth = parent = render first)
    if (depthA !== depthB) {
      return depthA - depthB;
    }

    // Then by zIndex
    return (a.zIndex ?? 5) - (b.zIndex ?? 5);
  });
}

const GroupBackgroundPortal: React.FC<{
  layerNode: HTMLElement;
  groups: GroupStyleAnnotation[];
  dragPositions: Record<string, { x: number; y: number }>;
  isGeoMode?: boolean;
  mapLibreState?: MapLibreState | null;
}> = ({ layerNode, groups, dragPositions, isGeoMode, mapLibreState }) =>
  createPortal(
    <div
      className="group-layer-content group-layer-content--background"
      style={LAYER_CONTENT_STYLE}
    >
      {groups.map((group) => {
        // Use drag position if available (scale: 1 during drag), otherwise compute from geo coordinates
        const dragPos = dragPositions[group.id];
        const pos = dragPos
          ? { x: dragPos.x, y: dragPos.y, scale: 1 }
          : computeGroupRenderedPosition(group, mapLibreState, isGeoMode);
        return <GroupBackgroundItem key={group.id} group={group} position={pos} />;
      })}
    </div>,
    layerNode
  );

interface GroupInteractionPortalProps extends GroupDragResizeHandlers {
  layerNode: HTMLElement;
  groups: GroupStyleAnnotation[];
  /** Current zoom level for coordinate conversion */
  zoom?: number;
  isLocked: boolean;
  selectedGroupIds: Set<string>;
  onGroupEdit: (id: string) => void;
  onGroupDelete?: (id: string) => void;
  onGroupSelect?: (id: string) => void;
  onGroupToggleSelect?: (id: string) => void;
  onVisualPositionChange: (id: string, position: { x: number; y: number }) => void;
  onVisualPositionClear: (id: string) => void;
  onShowContextMenu: (groupId: string, position: { x: number; y: number }) => void;
  onDragEnd?: (id: string, finalPosition: { x: number; y: number }) => void;
  isGeoMode?: boolean;
  mapLibreState?: MapLibreState | null;
  getMinimumBounds: (groupId: string) => { minWidth: number; minHeight: number };
}

const GroupInteractionPortal: React.FC<GroupInteractionPortalProps> = ({
  layerNode,
  groups,
  zoom,
  isLocked,
  selectedGroupIds,
  onGroupEdit,
  onGroupDelete,
  onDragStart,
  onPositionChange,
  onDragMove,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onGroupSelect,
  onGroupToggleSelect,
  onVisualPositionChange,
  onVisualPositionClear,
  onShowContextMenu,
  onDragEnd,
  isGeoMode,
  mapLibreState,
  getMinimumBounds
}) =>
  createPortal(
    <div
      className="group-layer-content group-layer-content--interaction"
      style={LAYER_CONTENT_STYLE}
    >
      {groups.map((group) => (
        <GroupInteractionItem
          key={group.id}
          group={group}
          zoom={zoom}
          isLocked={isLocked}
          isSelected={selectedGroupIds.has(group.id)}
          onGroupEdit={onGroupEdit}
          onDelete={onGroupDelete}
          onDragStart={onDragStart}
          onPositionChange={onPositionChange}
          onDragMove={onDragMove}
          onResizeStart={onResizeStart}
          onResizeMove={onResizeMove}
          onResizeEnd={onResizeEnd}
          onSelect={onGroupSelect}
          onToggleSelect={onGroupToggleSelect}
          onVisualPositionChange={onVisualPositionChange}
          onVisualPositionClear={onVisualPositionClear}
          onShowContextMenu={onShowContextMenu}
          onDragEnd={onDragEnd}
          isGeoMode={isGeoMode}
          mapLibreState={mapLibreState}
          getMinimumBounds={getMinimumBounds}
        />
      ))}
    </div>,
    layerNode
  );

export const GroupLayer: React.FC<GroupLayerProps> = ({
  zoom = 1,
  groups,
  isLocked,
  onGroupEdit,
  onGroupDelete,
  onDragStart,
  onPositionChange,
  onDragMove,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  selectedGroupIds = new Set(),
  onGroupSelect,
  onGroupToggleSelect,
  onGroupBoxSelect,
  onGroupReparent,
  isGeoMode,
  geoMode,
  mapLibreState,
  onGeoPositionChange,
  getMinimumBounds
}) => {
  // Create group background + interaction layers
  const { backgroundLayerNode, interactionLayerNode } = useGroupLayer();

  // Get viewport transform from ViewportContext and sync to layer nodes
  const { pan, zoom: viewportZoom } = useViewportTransform();

  // Sync viewport transform to layer nodes so groups pan/zoom with the canvas
  useEffect(() => {
    const transform = `translate(${pan.x}px, ${pan.y}px) scale(${viewportZoom})`;
    if (backgroundLayerNode) {
      backgroundLayerNode.style.transform = transform;
    }
    if (interactionLayerNode) {
      interactionLayerNode.style.transform = transform;
    }
  }, [pan, viewportZoom, backgroundLayerNode, interactionLayerNode]);

  // In geo pan mode, groups should not be interactive
  const effectivelyLocked = isLocked || (isGeoMode === true && geoMode === "pan");
  const dragOverrides = useDragPositionOverrides();

  // Enable box selection of groups
  useAnnotationBoxSelection(groups, onGroupBoxSelect, undefined, "GroupLayer");

  // Force re-render when map moves in geo mode so groups stay at their geo positions
  const [, setMapMoveCounter] = useState(0);
  useEffect(() => {
    if (!isGeoMode || !mapLibreState?.isInitialized || !mapLibreState.map) return;

    const handleMapMove = () => {
      setMapMoveCounter((c) => c + 1);
    };

    mapLibreState.map.on("move", handleMapMove);
    return () => {
      mapLibreState.map?.off("move", handleMapMove);
    };
  }, [isGeoMode, mapLibreState]);

  // Context menu state - lifted out of portal to avoid transform issues with position:fixed
  const [contextMenu, setContextMenu] = useState<{ groupId: string; x: number; y: number } | null>(
    null
  );

  const handleShowContextMenu = useCallback(
    (groupId: string, position: { x: number; y: number }) => {
      setContextMenu({ groupId, x: position.x, y: position.y });
    },
    []
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Wrapper for position change that also updates geo coordinates when in geo mode
  const handlePositionChangeWithGeo = useCallback(
    (id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }) => {
      // Always call the original position change handler
      onPositionChange(id, position, delta);

      // In geo mode, also update the geo coordinates
      if (isGeoMode && mapLibreState?.isInitialized && onGeoPositionChange) {
        const geoCoords = unprojectToGeoCoords(mapLibreState, position);
        if (geoCoords) {
          onGeoPositionChange(id, geoCoords);
        }
      }
    },
    [onPositionChange, isGeoMode, mapLibreState, onGeoPositionChange]
  );

  // Handler for detecting drop targets when a group drag ends
  const handleDragEnd = useCallback(
    (draggedGroupId: string, finalPosition: { x: number; y: number }) => {
      if (!onGroupReparent) return;

      const draggedGroup = groups.find((g) => g.id === draggedGroupId);
      if (!draggedGroup) return;

      // Find the deepest group at the drop position, excluding the dragged group and its descendants
      // We need to exclude descendants to avoid reparenting into own children
      const descendantIds = new Set<string>();
      const collectDescendants = (parentId: string) => {
        for (const g of groups) {
          if (g.parentId === parentId) {
            descendantIds.add(g.id);
            collectDescendants(g.id);
          }
        }
      };
      collectDescendants(draggedGroupId);

      const eligibleGroups = groups.filter(
        (g) => g.id !== draggedGroupId && !descendantIds.has(g.id)
      );
      const dropTarget = findDeepestGroupAtPosition(finalPosition, eligibleGroups);

      if (dropTarget) {
        // Dropped inside another group - make it a child
        if (validateNoCircularReference(draggedGroupId, dropTarget.id, groups)) {
          // Only reparent if the target is different from current parent
          if (draggedGroup.parentId !== dropTarget.id) {
            onGroupReparent(draggedGroupId, dropTarget.id);
          }
        }
      } else {
        // Dropped outside all groups - remove from parent (make root)
        if (draggedGroup.parentId) {
          onGroupReparent(draggedGroupId, null);
        }
      }
    },
    [groups, onGroupReparent]
  );

  // Don't render if no groups or no layer nodes
  if (groups.length === 0 || (!backgroundLayerNode && !interactionLayerNode)) return null;

  const sortedGroups = sortGroupsByDepthThenZIndex(groups);

  return (
    <>
      {backgroundLayerNode && (
        <GroupBackgroundPortal
          layerNode={backgroundLayerNode}
          groups={sortedGroups}
          dragPositions={dragOverrides.dragPositions}
          isGeoMode={isGeoMode}
          mapLibreState={mapLibreState}
        />
      )}
      {interactionLayerNode && (
        <GroupInteractionPortal
          layerNode={interactionLayerNode}
          groups={sortedGroups}
          zoom={zoom}
          isLocked={effectivelyLocked}
          selectedGroupIds={selectedGroupIds}
          onGroupEdit={onGroupEdit}
          onGroupDelete={onGroupDelete}
          onDragStart={onDragStart}
          onPositionChange={handlePositionChangeWithGeo}
          onDragMove={onDragMove}
          onResizeStart={onResizeStart}
          onResizeMove={onResizeMove}
          onResizeEnd={onResizeEnd}
          onGroupSelect={onGroupSelect}
          onGroupToggleSelect={onGroupToggleSelect}
          onVisualPositionChange={dragOverrides.setDragPosition}
          onVisualPositionClear={dragOverrides.clearDragPosition}
          onShowContextMenu={handleShowContextMenu}
          onDragEnd={handleDragEnd}
          isGeoMode={isGeoMode}
          mapLibreState={mapLibreState}
          getMinimumBounds={getMinimumBounds}
        />
      )}
      {/* Context menu rendered outside portals to avoid transform issues */}
      {contextMenu && (
        <AnnotationContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onEdit={() => onGroupEdit(contextMenu.groupId)}
          onDelete={() => onGroupDelete(contextMenu.groupId)}
          onClose={handleCloseContextMenu}
        />
      )}
    </>
  );
};

export default GroupLayer;
