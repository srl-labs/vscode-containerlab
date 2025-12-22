/**
 * useAnnotationLayerProps - Memoized props for annotation layer components
 *
 * Extracts the 3 large useMemo blocks from App.tsx that build props for:
 * - GroupLayer
 * - FreeTextLayer
 * - FreeShapeLayer
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { GroupLayer } from '../../components/annotations/GroupLayer';
import type { FreeTextLayer } from '../../components/annotations/FreeTextLayer';
import type { FreeShapeLayer } from '../../components/annotations/FreeShapeLayer';
import type { MapLibreState } from '../canvas/maplibreUtils';

// Note: We use a subset type here instead of ReturnType<typeof useAnnotations>
// to avoid circular dependency with AnnotationContext.tsx
// The full type is defined in AnnotationContext.tsx but we only need specific properties

/** Props passed directly to GroupLayer */
type GroupLayerProps = React.ComponentProps<typeof GroupLayer>;

/** Props passed directly to FreeTextLayer */
type FreeTextLayerProps = React.ComponentProps<typeof FreeTextLayer>;

/** Props passed directly to FreeShapeLayer */
type FreeShapeLayerProps = React.ComponentProps<typeof FreeShapeLayer>;

import type { GroupStyleAnnotation, FreeTextAnnotation, FreeShapeAnnotation } from '../../../shared/types/topology';

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
  onGroupDragEnd: (groupId: string, finalPosition: { x: number; y: number }, delta: { dx: number; dy: number }) => void;
  onGroupDragMove: (groupId: string, delta: { dx: number; dy: number }) => void;
  updateGroupSizeWithUndo: (id: string, width: number, height: number) => void;
  selectGroup: (id: string) => void;
  toggleGroupSelection: (id: string) => void;
  boxSelectGroups: (ids: string[]) => void;
  updateGroupParent: (id: string, parentId: string | null) => void;
  updateGroupGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;

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
  cyInstance: CyCore | null;
  annotations: AnnotationsSubset;
  state: {
    isLocked: boolean;
    mode: 'edit' | 'view';
  };
  layoutControls: {
    isGeoLayout: boolean;
    geoMode: 'edit' | 'pan' | undefined;
  };
  mapLibreState: MapLibreState | null;
  shapeLayerNode: HTMLElement | null;
}

/**
 * Return type for useAnnotationLayerProps hook
 */
export interface AnnotationLayerPropsReturn {
  groupLayerProps: GroupLayerProps;
  freeTextLayerProps: FreeTextLayerProps;
  freeShapeLayerProps: FreeShapeLayerProps;
}

/**
 * Hook that builds memoized props for all annotation layer components.
 *
 * Consolidates 3 large useMemo blocks (~100 lines) into a single hook call.
 */
export function useAnnotationLayerProps(config: AnnotationLayerPropsConfig): AnnotationLayerPropsReturn {
  const { cyInstance, annotations, state, layoutControls, mapLibreState, shapeLayerNode } = config;

  // Helper callbacks for updating group IDs
  const updateTextGroupId = React.useCallback(
    (id: string, groupId: string | undefined) => annotations.updateTextAnnotation(id, { groupId }),
    [annotations.updateTextAnnotation]
  );

  const updateShapeGroupId = React.useCallback(
    (id: string, groupId: string | undefined) => annotations.updateShapeAnnotation(id, { groupId }),
    [annotations.updateShapeAnnotation]
  );

  // GroupLayer props
  const groupLayerProps = React.useMemo(() => ({
    cy: cyInstance,
    groups: annotations.groups,
    isLocked: state.isLocked,
    onGroupEdit: annotations.editGroup,
    onGroupDelete: annotations.deleteGroupWithUndo,
    onDragStart: annotations.onGroupDragStart,
    onPositionChange: annotations.onGroupDragEnd,
    onDragMove: annotations.onGroupDragMove,
    onSizeChange: annotations.updateGroupSizeWithUndo,
    selectedGroupIds: annotations.selectedGroupIds,
    onGroupSelect: annotations.selectGroup,
    onGroupToggleSelect: annotations.toggleGroupSelection,
    onGroupBoxSelect: annotations.boxSelectGroups,
    onGroupReparent: annotations.updateGroupParent,
    isGeoMode: layoutControls.isGeoLayout,
    geoMode: layoutControls.geoMode,
    mapLibreState,
    onGeoPositionChange: annotations.updateGroupGeoPosition
  }), [
    cyInstance, annotations.groups, state.isLocked, annotations.editGroup,
    annotations.deleteGroupWithUndo, annotations.onGroupDragStart, annotations.onGroupDragEnd,
    annotations.onGroupDragMove, annotations.updateGroupSizeWithUndo, annotations.selectedGroupIds,
    annotations.selectGroup, annotations.toggleGroupSelection, annotations.boxSelectGroups,
    annotations.updateGroupParent, layoutControls.isGeoLayout, layoutControls.geoMode,
    mapLibreState, annotations.updateGroupGeoPosition
  ]);

  // FreeTextLayer props
  const freeTextLayerProps = React.useMemo(() => ({
    cy: cyInstance,
    annotations: annotations.textAnnotations,
    isLocked: state.isLocked,
    isAddTextMode: annotations.isAddTextMode,
    mode: state.mode,
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
  }), [
    cyInstance, annotations.textAnnotations, state.isLocked, annotations.isAddTextMode,
    state.mode, annotations.editTextAnnotation, annotations.deleteTextAnnotation,
    annotations.updateTextPosition, annotations.updateTextRotation, annotations.updateTextSize,
    annotations.handleTextCanvasClick, annotations.selectedTextIds, annotations.selectTextAnnotation,
    annotations.toggleTextAnnotationSelection, annotations.boxSelectTextAnnotations,
    layoutControls.isGeoLayout, layoutControls.geoMode, mapLibreState,
    annotations.updateTextGeoPosition, annotations.groups, updateTextGroupId
  ]);

  // FreeShapeLayer props
  const freeShapeLayerProps = React.useMemo(() => ({
    cy: cyInstance,
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
  }), [
    cyInstance, annotations.shapeAnnotations, state.isLocked, annotations.isAddShapeMode,
    state.mode, shapeLayerNode, annotations.editShapeAnnotation, annotations.deleteShapeAnnotationWithUndo,
    annotations.updateShapePositionWithUndo, annotations.updateShapeRotation, annotations.updateShapeSize,
    annotations.updateShapeEndPosition, annotations.handleShapeCanvasClickWithUndo,
    annotations.selectedShapeIds, annotations.selectShapeAnnotation, annotations.toggleShapeAnnotationSelection,
    annotations.boxSelectShapeAnnotations, layoutControls.isGeoLayout, layoutControls.geoMode,
    mapLibreState, annotations.updateShapeGeoPosition, annotations.updateShapeEndGeoPosition,
    annotations.captureShapeAnnotationBefore, annotations.finalizeShapeWithUndo,
    annotations.groups, updateShapeGroupId
  ]);

  return {
    groupLayerProps,
    freeTextLayerProps,
    freeShapeLayerProps
  };
}
