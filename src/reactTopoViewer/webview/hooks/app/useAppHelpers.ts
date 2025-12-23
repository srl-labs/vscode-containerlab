/**
 * App helper hooks - extracted from App.tsx to reduce file size
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { CustomNodeTemplate, CustomTemplateEditorData } from '../../../shared/types/editors';
import {
  createNewTemplateEditorData,
  convertTemplateToEditorData
} from '../../../shared/utilities/customNodeConversions';
import {
  ensureCytoscapeLayersRegistered,
  getCytoscapeLayers,
  configureLayerNode,
  type IHTMLLayer
} from '../shared/cytoscapeLayers';
import { log } from '../../utils/logger';
import { sendDeleteCustomNode, sendSetDefaultCustomNode, sendCommandToExtension } from '../../utils/extensionMessaging';
import type { UseUndoRedoReturn } from '../state/useUndoRedo';
import type { FreeTextAnnotation, FreeShapeAnnotation, GroupStyleAnnotation } from '../../../shared/types/topology';
import type { MapLibreState } from '../canvas/maplibreUtils';
import { assignMissingGeoCoordinatesToAnnotations, assignMissingGeoCoordinatesToShapeAnnotations } from '../canvas/maplibreUtils';

/**
 * Custom node template UI commands interface
 */
export interface CustomNodeCommands {
  onNewCustomNode: () => void;
  onEditCustomNode: (nodeName: string) => void;
  onDeleteCustomNode: (nodeName: string) => void;
  onSetDefaultCustomNode: (nodeName: string) => void;
}

/**
 * Hook for custom node template UI commands
 */
export function useCustomNodeCommands(
  customNodes: CustomNodeTemplate[],
  editCustomTemplate: (data: CustomTemplateEditorData | null) => void
): CustomNodeCommands {
  const onNewCustomNode = React.useCallback(() => {
    const templateData = createNewTemplateEditorData();
    editCustomTemplate(templateData);
  }, [editCustomTemplate]);

  const onEditCustomNode = React.useCallback((nodeName: string) => {
    const template = customNodes.find(n => n.name === nodeName);
    if (!template) return;
    const templateData = convertTemplateToEditorData(template);
    editCustomTemplate(templateData);
  }, [customNodes, editCustomTemplate]);

  const onDeleteCustomNode = React.useCallback((nodeName: string) => {
    sendDeleteCustomNode(nodeName);
  }, []);

  const onSetDefaultCustomNode = React.useCallback((nodeName: string) => {
    sendSetDefaultCustomNode(nodeName);
  }, []);

  return {
    onNewCustomNode,
    onEditCustomNode,
    onDeleteCustomNode,
    onSetDefaultCustomNode
  };
}

/**
 * Navbar commands interface
 */
export interface NavbarCommands {
  onLayoutToggle: () => void;
  onToggleSplit: () => void;
}

/**
 * Hook for navbar UI commands
 */
export function useNavbarCommands(): NavbarCommands {
  const onLayoutToggle = React.useCallback(() => {
    // Layout selection is handled entirely in the webview.
  }, []);

  const onToggleSplit = React.useCallback(() => {
    sendCommandToExtension('topo-toggle-split-view');
  }, []);

  return {
    onLayoutToggle,
    onToggleSplit
  };
}

/**
 * Return type for useShapeLayer hook
 */
export interface UseShapeLayerReturn {
  shapeLayerNode: HTMLElement | null;
  updateLayer: () => void;
}

/**
 * Hook to create and manage a Cytoscape layer for shape annotations.
 * Uses cytoscape-layers to render shapes BELOW the node layer but above the grid.
 */
export function useShapeLayer(cy: CyCore | null): UseShapeLayerReturn {
  const layerRef = React.useRef<IHTMLLayer | null>(null);
  const [shapeLayerNode, setShapeLayerNode] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!cy) return;

    ensureCytoscapeLayersRegistered();

    try {
      const layers = getCytoscapeLayers(cy);
      log.info('[ShapeLayer] Creating shape layer below nodes');

      // Create layer BELOW the node layer
      const shapeLayer = layers.nodeLayer.insertBefore('html');
      layerRef.current = shapeLayer;

      // Configure the layer node
      configureLayerNode(shapeLayer.node, 'auto', 'shape-layer-container');

      log.info('[ShapeLayer] Shape layer created');
      setShapeLayerNode(shapeLayer.node);
    } catch (err) {
      log.error(`[ShapeLayer] Failed to create layer: ${err}`);
    }

    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
      setShapeLayerNode(null);
    };
  }, [cy]);

  const updateLayer = () => {
    layerRef.current?.update();
  };

  return { shapeLayerNode, updateLayer };
}

/**
 * E2E testing exposure configuration
 */
export interface E2ETestingConfig {
  cyInstance: CyCore | null;
  isLocked: boolean;
  mode: 'edit' | 'view';
  toggleLock: () => void;
  undoRedo: UseUndoRedoReturn;
  handleEdgeCreated: (sourceId: string, targetId: string, edgeData: { id: string; source: string; target: string; sourceEndpoint: string; targetEndpoint: string }) => void;
  handleNodeCreatedCallback: (nodeId: string, nodeElement: { group: 'nodes' | 'edges'; data: Record<string, unknown>; position?: { x: number; y: number }; classes?: string }, position: { x: number; y: number }) => void;
  handleAddGroupWithUndo: () => void;
  groups: GroupStyleAnnotation[];
}

/**
 * Hook to expose testing utilities for E2E tests.
 * Consolidates all window.__DEV__ assignments into one place.
 */
export function useE2ETestingExposure(config: E2ETestingConfig): void {
  const { cyInstance, isLocked, mode, toggleLock, undoRedo, handleEdgeCreated, handleNodeCreatedCallback, handleAddGroupWithUndo, groups } = config;

  // Core E2E exposure (cy, isLocked, mode, setLocked)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.__DEV__) {
      if (cyInstance) window.__DEV__.cy = cyInstance;
      window.__DEV__.isLocked = () => isLocked;
      window.__DEV__.mode = () => mode;
      window.__DEV__.setLocked = (locked: boolean) => {
        if (isLocked !== locked) toggleLock();
      };
    }
  }, [cyInstance, isLocked, mode, toggleLock]);

  // Undo/redo E2E exposure
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.__DEV__) {
      window.__DEV__.undoRedo = { canUndo: undoRedo.canUndo, canRedo: undoRedo.canRedo };
      window.__DEV__.handleEdgeCreated = handleEdgeCreated;
      window.__DEV__.handleNodeCreatedCallback = handleNodeCreatedCallback;
      window.__DEV__.createGroupFromSelected = handleAddGroupWithUndo;
    }
  }, [undoRedo.canUndo, undoRedo.canRedo, handleEdgeCreated, handleNodeCreatedCallback, handleAddGroupWithUndo]);

  // Groups E2E exposure
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.__DEV__) {
      window.__DEV__.getReactGroups = () => groups;
      window.__DEV__.groupsCount = groups.length;
    }
  }, [groups]);
}

/**
 * Geo coordinate sync configuration
 */
export interface GeoCoordinateSyncConfig {
  mapLibreState: MapLibreState | null;
  isGeoLayout: boolean;
  textAnnotations: FreeTextAnnotation[];
  shapeAnnotations: FreeShapeAnnotation[];
  groups: GroupStyleAnnotation[];
  updateTextGeoPosition: (id: string, coords: { lng: number; lat: number }) => void;
  updateShapeGeoPosition: (id: string, coords: { lng: number; lat: number }) => void;
  updateShapeEndGeoPosition: (id: string, coords: { lng: number; lat: number }) => void;
  updateGroupGeoPosition: (id: string, coords: { lng: number; lat: number }) => void;
}

/**
 * Hook to sync missing geo coordinates when switching to geo layout.
 * Automatically assigns geo coordinates to annotations that don't have them.
 */
export function useGeoCoordinateSync(config: GeoCoordinateSyncConfig): void {
  const {
    mapLibreState, isGeoLayout, textAnnotations, shapeAnnotations, groups,
    updateTextGeoPosition, updateShapeGeoPosition, updateShapeEndGeoPosition, updateGroupGeoPosition
  } = config;

  const geoAssignedRef = React.useRef(false);

  React.useEffect(() => {
    if (!mapLibreState?.isInitialized || !isGeoLayout) {
      geoAssignedRef.current = false;
      return;
    }
    if (geoAssignedRef.current) return;
    geoAssignedRef.current = true;

    const textResult = assignMissingGeoCoordinatesToAnnotations(mapLibreState, textAnnotations);
    if (textResult.hasChanges) {
      textResult.updated.forEach((ann: FreeTextAnnotation) => {
        if (ann.geoCoordinates) updateTextGeoPosition(ann.id, ann.geoCoordinates);
      });
    }

    const shapeResult = assignMissingGeoCoordinatesToShapeAnnotations(mapLibreState, shapeAnnotations);
    if (shapeResult.hasChanges) {
      shapeResult.updated.forEach((ann: FreeShapeAnnotation) => {
        if (ann.geoCoordinates) updateShapeGeoPosition(ann.id, ann.geoCoordinates);
        if ('endGeoCoordinates' in ann && ann.endGeoCoordinates) {
          updateShapeEndGeoPosition(ann.id, ann.endGeoCoordinates);
        }
      });
    }

    const groupResult = assignMissingGeoCoordinatesToAnnotations(mapLibreState, groups);
    if (groupResult.hasChanges) {
      groupResult.updated.forEach((grp: GroupStyleAnnotation) => {
        if (grp.geoCoordinates) updateGroupGeoPosition(grp.id, grp.geoCoordinates);
      });
    }
  }, [
    mapLibreState, isGeoLayout, textAnnotations, shapeAnnotations, groups,
    updateTextGeoPosition, updateShapeGeoPosition, updateShapeEndGeoPosition, updateGroupGeoPosition
  ]);
}
