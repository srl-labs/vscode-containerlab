/**
 * useAnnotationLayerProps - Memoized props for annotation layer components
 *
 * Extracts the 3 large useMemo blocks from App.tsx that build props for:
 * - GroupLayer
 * - FreeTextLayer
 * - FreeShapeLayer
 */
import React from "react";

import type { GroupLayer } from "../../components/annotations/GroupLayer";
import type { FreeTextLayer } from "../../components/annotations/FreeTextLayer";
import type { FreeShapeLayer } from "../../components/annotations/FreeShapeLayer";
import type { MapLibreState } from "../canvas/maplibreUtils";
import type {
  GroupStyleAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation
} from "../../../shared/types/topology";

// Note: We use a subset type here instead of ReturnType<typeof useAnnotations>
// to avoid circular dependency with AnnotationContext.tsx
// The full type is defined in AnnotationContext.tsx but we only need specific properties

/** Props passed directly to GroupLayer */
type GroupLayerProps = React.ComponentProps<typeof GroupLayer>;

/** Props passed directly to FreeTextLayer */
type FreeTextLayerProps = React.ComponentProps<typeof FreeTextLayer>;

/** Props passed directly to FreeShapeLayer */
type FreeShapeLayerProps = React.ComponentProps<typeof FreeShapeLayer>;

/**
 * Annotations interface subset - the properties we need from useAnnotations()
 * This avoids circular dependency with AnnotationContext.tsx
 */
interface AnnotationsSubset {
  // Groups
  groups: GroupStyleAnnotation[];
  selectedGroupIds: Set<string>;
  editGroup: (id: string) => void;
  deleteGroupWithUndo: (id: string) => void;
  onGroupDragStart: (groupId: string) => void;
  onGroupDragEnd: (
    groupId: string,
    finalPosition: { x: number; y: number },
    delta: { dx: number; dy: number }
  ) => void;
  onGroupDragMove: (groupId: string, delta: { dx: number; dy: number }) => void;
  updateGroupSizeWithUndo: (id: string, width: number, height: number) => void;
  // Resize handlers (separate from drag to avoid undo spam)
  onResizeStart: (groupId: string) => void;
  onResizeMove: (
    groupId: string,
    width: number,
    height: number,
    position: { x: number; y: number }
  ) => void;
  onResizeEnd: (
    groupId: string,
    finalWidth: number,
    finalHeight: number,
    finalPosition: { x: number; y: number }
  ) => void;
  selectGroup: (id: string) => void;
  toggleGroupSelection: (id: string) => void;
  boxSelectGroups: (ids: string[]) => void;
  updateGroupParent: (id: string, parentId: string | null) => void;
  updateGroupGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  getGroupMembers: (groupId: string) => string[];

  // Text annotations
  textAnnotations: FreeTextAnnotation[];
  selectedTextIds: Set<string>;
  isAddTextMode: boolean;
  editTextAnnotation: (id: string) => void;
  deleteTextAnnotation: (id: string) => void;
  updateTextPosition: (id: string, position: { x: number; y: number }) => void;
  updateTextRotation: (id: string, rotation: number) => void;
  updateTextSize: (id: string, width: number, height: number) => void;
  handleTextCanvasClick: (position: { x: number; y: number }) => void;
  selectTextAnnotation: (id: string) => void;
  toggleTextAnnotationSelection: (id: string) => void;
  boxSelectTextAnnotations: (ids: string[]) => void;
  updateTextGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateTextAnnotation: (id: string, updates: Partial<FreeTextAnnotation>) => void;

  // Shape annotations
  shapeAnnotations: FreeShapeAnnotation[];
  selectedShapeIds: Set<string>;
  isAddShapeMode: boolean;
  editShapeAnnotation: (id: string) => void;
  deleteShapeAnnotationWithUndo: (id: string) => void;
  updateShapePositionWithUndo: (id: string, position: { x: number; y: number }) => void;
  updateShapeRotation: (id: string, rotation: number) => void;
  updateShapeSize: (id: string, width: number, height: number) => void;
  updateShapeEndPosition: (id: string, endPosition: { x: number; y: number }) => void;
  handleShapeCanvasClickWithUndo: (position: { x: number; y: number }) => void;
  selectShapeAnnotation: (id: string) => void;
  toggleShapeAnnotationSelection: (id: string) => void;
  boxSelectShapeAnnotations: (ids: string[]) => void;
  updateShapeGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateShapeEndGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  captureShapeAnnotationBefore: (id: string) => FreeShapeAnnotation | null;
  finalizeShapeWithUndo: (before: FreeShapeAnnotation | null, id: string) => void;
  updateShapeAnnotation: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
}

/**
 * Configuration for useAnnotationLayerProps hook
 */
export interface AnnotationLayerPropsConfig {
  annotations: AnnotationsSubset;
  state: {
    isLocked: boolean;
    mode: "edit" | "view";
  };
  layoutControls: {
    isGeoLayout: boolean;
    geoMode: "edit" | "pan" | undefined;
  };
  mapLibreState: MapLibreState | null;
  shapeLayerNode: HTMLElement | null;
  textLayerNode: HTMLElement | null;
}

/**
 * Return type for useAnnotationLayerProps hook
 */
export interface AnnotationLayerPropsReturn {
  groupLayerProps: GroupLayerProps;
  freeTextLayerProps: FreeTextLayerProps;
  freeShapeLayerProps: FreeShapeLayerProps;
}

// Constants for minimum bounds calculation
const MIN_BOUNDS_PADDING = 20;
const MIN_BOUNDS_FALLBACK = 40;

/** Bounds accumulator type */
interface BoundsAccumulator {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  hasContent: boolean;
}

/** Expand bounds to include a rectangular area */
function expandBoundsRect(
  bounds: BoundsAccumulator,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  bounds.minX = Math.min(bounds.minX, x - w / 2);
  bounds.maxX = Math.max(bounds.maxX, x + w / 2);
  bounds.minY = Math.min(bounds.minY, y - h / 2);
  bounds.maxY = Math.max(bounds.maxY, y + h / 2);
  bounds.hasContent = true;
}

/** Expand bounds to include a line between two points */
function expandBoundsLine(
  bounds: BoundsAccumulator,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  bounds.minX = Math.min(bounds.minX, x1, x2);
  bounds.maxX = Math.max(bounds.maxX, x1, x2);
  bounds.minY = Math.min(bounds.minY, y1, y2);
  bounds.maxY = Math.max(bounds.maxY, y1, y2);
  bounds.hasContent = true;
}

/** Process a shape annotation and expand bounds accordingly */
function processShapeBounds(bounds: BoundsAccumulator, shape: FreeShapeAnnotation): void {
  if (shape.shapeType === "line" && shape.endPosition) {
    expandBoundsLine(
      bounds,
      shape.position.x,
      shape.position.y,
      shape.endPosition.x,
      shape.endPosition.y
    );
  } else {
    expandBoundsRect(
      bounds,
      shape.position.x,
      shape.position.y,
      shape.width ?? 50,
      shape.height ?? 50
    );
  }
}

/** Process a child group and expand bounds accordingly */
function processChildGroupBounds(bounds: BoundsAccumulator, group: GroupStyleAnnotation): void {
  // Child group bounds: position is center, so expand by half width/height
  expandBoundsRect(bounds, group.position.x, group.position.y, group.width, group.height);
}

/**
 * Hook that builds memoized props for all annotation layer components.
 *
 * Consolidates 3 large useMemo blocks (~100 lines) into a single hook call.
 */
export function useAnnotationLayerProps(
  config: AnnotationLayerPropsConfig
): AnnotationLayerPropsReturn {
  const { annotations, state, layoutControls, mapLibreState, shapeLayerNode, textLayerNode } =
    config;

  // Helper callbacks for updating group IDs
  const updateTextGroupId = React.useCallback(
    (id: string, groupId: string | undefined) => annotations.updateTextAnnotation(id, { groupId }),
    [annotations.updateTextAnnotation]
  );

  const updateShapeGroupId = React.useCallback(
    (id: string, groupId: string | undefined) => annotations.updateShapeAnnotation(id, { groupId }),
    [annotations.updateShapeAnnotation]
  );

  // Calculate minimum bounds for group resize based on contained objects
  const getMinimumBounds = React.useCallback(
    (groupId: string) => {
      const bounds: BoundsAccumulator = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        hasContent: false
      };

      // TODO: Use ReactFlow's getNode() to get node positions
      void annotations.getGroupMembers(groupId);

      // Accumulate text annotation bounds
      for (const text of annotations.textAnnotations) {
        if (text.groupId === groupId)
          expandBoundsRect(
            bounds,
            text.position.x,
            text.position.y,
            text.width ?? 100,
            text.height ?? 24
          );
      }

      // Accumulate shape annotation bounds
      for (const shape of annotations.shapeAnnotations) {
        if (shape.groupId === groupId) processShapeBounds(bounds, shape);
      }

      // Accumulate child group bounds (groups with parentId === groupId)
      for (const childGroup of annotations.groups) {
        if (childGroup.parentId === groupId) processChildGroupBounds(bounds, childGroup);
      }

      if (!bounds.hasContent)
        return { minWidth: MIN_BOUNDS_FALLBACK, minHeight: MIN_BOUNDS_FALLBACK };
      return {
        minWidth: Math.max(MIN_BOUNDS_FALLBACK, bounds.maxX - bounds.minX + MIN_BOUNDS_PADDING * 2),
        minHeight: Math.max(MIN_BOUNDS_FALLBACK, bounds.maxY - bounds.minY + MIN_BOUNDS_PADDING * 2)
      };
    },
    [
      annotations.getGroupMembers,
      annotations.textAnnotations,
      annotations.shapeAnnotations,
      annotations.groups
    ]
  );

  // GroupLayer props
  const groupLayerProps = React.useMemo(
    () => ({
      groups: annotations.groups,
      isLocked: state.isLocked,
      onGroupEdit: annotations.editGroup,
      onGroupDelete: annotations.deleteGroupWithUndo,
      onDragStart: annotations.onGroupDragStart,
      onPositionChange: annotations.onGroupDragEnd,
      onDragMove: annotations.onGroupDragMove,
      // Resize handlers (use dedicated undo handler to avoid spam)
      onResizeStart: annotations.onResizeStart,
      onResizeMove: annotations.onResizeMove,
      onResizeEnd: annotations.onResizeEnd,
      selectedGroupIds: annotations.selectedGroupIds,
      onGroupSelect: annotations.selectGroup,
      onGroupToggleSelect: annotations.toggleGroupSelection,
      onGroupBoxSelect: annotations.boxSelectGroups,
      onGroupReparent: annotations.updateGroupParent,
      isGeoMode: layoutControls.isGeoLayout,
      geoMode: layoutControls.geoMode,
      mapLibreState,
      onGeoPositionChange: annotations.updateGroupGeoPosition,
      getMinimumBounds
    }),
    [
      annotations.groups,
      state.isLocked,
      annotations.editGroup,
      annotations.deleteGroupWithUndo,
      annotations.onGroupDragStart,
      annotations.onGroupDragEnd,
      annotations.onGroupDragMove,
      annotations.onResizeStart,
      annotations.onResizeMove,
      annotations.onResizeEnd,
      annotations.selectedGroupIds,
      annotations.selectGroup,
      annotations.toggleGroupSelection,
      annotations.boxSelectGroups,
      annotations.updateGroupParent,
      layoutControls.isGeoLayout,
      layoutControls.geoMode,
      mapLibreState,
      annotations.updateGroupGeoPosition,
      getMinimumBounds
    ]
  );

  // FreeTextLayer props
  const freeTextLayerProps = React.useMemo(
    () => ({
      annotations: annotations.textAnnotations,
      isLocked: state.isLocked,
      isAddTextMode: annotations.isAddTextMode,
      mode: state.mode,
      textLayerNode,
      onAnnotationDoubleClick: annotations.editTextAnnotation,
      onAnnotationDelete: annotations.deleteTextAnnotation,
      onPositionChange: annotations.updateTextPosition,
      onRotationChange: annotations.updateTextRotation,
      onSizeChange: annotations.updateTextSize,
      onCanvasClick: annotations.handleTextCanvasClick,
      selectedAnnotationIds: annotations.selectedTextIds,
      onAnnotationSelect: annotations.selectTextAnnotation,
      onAnnotationToggleSelect: annotations.toggleTextAnnotationSelection,
      onAnnotationBoxSelect: annotations.boxSelectTextAnnotations,
      isGeoMode: layoutControls.isGeoLayout,
      geoMode: layoutControls.geoMode,
      mapLibreState,
      onGeoPositionChange: annotations.updateTextGeoPosition,
      groups: annotations.groups,
      onUpdateGroupId: updateTextGroupId
    }),
    [
      annotations.textAnnotations,
      state.isLocked,
      annotations.isAddTextMode,
      state.mode,
      textLayerNode,
      annotations.editTextAnnotation,
      annotations.deleteTextAnnotation,
      annotations.updateTextPosition,
      annotations.updateTextRotation,
      annotations.updateTextSize,
      annotations.handleTextCanvasClick,
      annotations.selectedTextIds,
      annotations.selectTextAnnotation,
      annotations.toggleTextAnnotationSelection,
      annotations.boxSelectTextAnnotations,
      layoutControls.isGeoLayout,
      layoutControls.geoMode,
      mapLibreState,
      annotations.updateTextGeoPosition,
      annotations.groups,
      updateTextGroupId
    ]
  );

  // FreeShapeLayer props
  const freeShapeLayerProps = React.useMemo(
    () => ({
      annotations: annotations.shapeAnnotations,
      isLocked: state.isLocked,
      isAddShapeMode: annotations.isAddShapeMode,
      mode: state.mode,
      shapeLayerNode,
      onAnnotationEdit: annotations.editShapeAnnotation,
      onAnnotationDelete: annotations.deleteShapeAnnotationWithUndo,
      onPositionChange: annotations.updateShapePositionWithUndo,
      onRotationChange: annotations.updateShapeRotation,
      onSizeChange: annotations.updateShapeSize,
      onEndPositionChange: annotations.updateShapeEndPosition,
      onCanvasClick: annotations.handleShapeCanvasClickWithUndo,
      selectedAnnotationIds: annotations.selectedShapeIds,
      onAnnotationSelect: annotations.selectShapeAnnotation,
      onAnnotationToggleSelect: annotations.toggleShapeAnnotationSelection,
      onAnnotationBoxSelect: annotations.boxSelectShapeAnnotations,
      isGeoMode: layoutControls.isGeoLayout,
      geoMode: layoutControls.geoMode,
      mapLibreState,
      onGeoPositionChange: annotations.updateShapeGeoPosition,
      onEndGeoPositionChange: annotations.updateShapeEndGeoPosition,
      onCaptureAnnotationBefore: annotations.captureShapeAnnotationBefore,
      onFinalizeWithUndo: annotations.finalizeShapeWithUndo,
      groups: annotations.groups,
      onUpdateGroupId: updateShapeGroupId
    }),
    [
      annotations.shapeAnnotations,
      state.isLocked,
      annotations.isAddShapeMode,
      state.mode,
      shapeLayerNode,
      annotations.editShapeAnnotation,
      annotations.deleteShapeAnnotationWithUndo,
      annotations.updateShapePositionWithUndo,
      annotations.updateShapeRotation,
      annotations.updateShapeSize,
      annotations.updateShapeEndPosition,
      annotations.handleShapeCanvasClickWithUndo,
      annotations.selectedShapeIds,
      annotations.selectShapeAnnotation,
      annotations.toggleShapeAnnotationSelection,
      annotations.boxSelectShapeAnnotations,
      layoutControls.isGeoLayout,
      layoutControls.geoMode,
      mapLibreState,
      annotations.updateShapeGeoPosition,
      annotations.updateShapeEndGeoPosition,
      annotations.captureShapeAnnotationBefore,
      annotations.finalizeShapeWithUndo,
      annotations.groups,
      updateShapeGroupId
    ]
  );

  return {
    groupLayerProps,
    freeTextLayerProps,
    freeShapeLayerProps
  };
}
