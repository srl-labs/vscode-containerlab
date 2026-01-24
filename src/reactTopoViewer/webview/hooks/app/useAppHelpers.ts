/**
 * App helper hooks - extracted from App.tsx to reduce file size
 */
import React from "react";

import type {
  CustomNodeTemplate,
  CustomTemplateEditorData,
  NetworkType
} from "../../../shared/types/editors";
import type { TopoNode } from "../../../shared/types/graph";
import {
  createNewTemplateEditorData,
  convertTemplateToEditorData
} from "../../../shared/utilities/customNodeConversions";
import {
  sendDeleteCustomNode,
  sendSetDefaultCustomNode,
  sendCommandToExtension
} from "../../utils/extensionMessaging";
import type { UseUndoRedoReturn } from "../state/useUndoRedo";
import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../../shared/types/topology";
import type { MapLibreState } from "../canvas/maplibreUtils";
import {
  assignMissingGeoCoordinatesToAnnotations,
  assignMissingGeoCoordinatesToShapeAnnotations
} from "../canvas/maplibreUtils";

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

  const onEditCustomNode = React.useCallback(
    (nodeName: string) => {
      const template = customNodes.find((n) => n.name === nodeName);
      if (!template) return;
      const templateData = convertTemplateToEditorData(template);
      editCustomTemplate(templateData);
    },
    [customNodes, editCustomTemplate]
  );

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
    sendCommandToExtension("topo-toggle-split-view");
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
 * Hook for shape layer (legacy compatibility).
 * Shape annotations are rendered as React components in the ReactFlow canvas.
 */
export function useShapeLayer(): UseShapeLayerReturn {
  const [shapeLayerNode] = React.useState<HTMLElement | null>(null);
  const updateLayer = React.useCallback(() => {}, []);
  return { shapeLayerNode, updateLayer };
}

/**
 * Return type for useTextLayer hook
 */
export interface UseTextLayerReturn {
  textLayerNode: HTMLElement | null;
}

/**
 * Hook for text layer (legacy compatibility).
 * Text annotations are rendered as React components in the ReactFlow canvas.
 */
export function useTextLayer(): UseTextLayerReturn {
  const [textLayerNode] = React.useState<HTMLElement | null>(null);
  return { textLayerNode };
}

/** Layout option type for E2E testing */
export type LayoutOption = "preset" | "cose" | "cola" | "radial" | "hierarchical";

/**
 * E2E testing exposure configuration
 */
export interface E2ETestingConfig {
  isLocked: boolean;
  mode: "edit" | "view";
  toggleLock: () => void;
  undoRedo: UseUndoRedoReturn;
  handleEdgeCreated: (
    sourceId: string,
    targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => void;
  handleNodeCreatedCallback: (
    nodeId: string,
    nodeElement: TopoNode,
    position: { x: number; y: number }
  ) => void;
  handleAddGroupWithUndo: () => void;
  createNetworkAtPosition: (
    position: { x: number; y: number },
    networkType: NetworkType
  ) => string | null;
  editNetwork?: (nodeId: string | null) => void;
  groups: GroupStyleAnnotation[];
  elements: unknown[];
  /** Layout controls for E2E testing */
  setLayout?: (layout: LayoutOption) => void;
  setGeoMode?: (mode: "pan" | "edit") => void;
  isGeoLayout?: boolean;
  geoMode?: "pan" | "edit";
}

/**
 * Hook to expose testing utilities for E2E tests.
 * Consolidates all window.__DEV__ assignments into one place.
 */
export function useE2ETestingExposure(config: E2ETestingConfig): void {
  const {
    isLocked,
    mode,
    toggleLock,
    undoRedo,
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleAddGroupWithUndo,
    createNetworkAtPosition,
    editNetwork,
    groups,
    elements,
    setLayout,
    setGeoMode,
    isGeoLayout,
    geoMode
  } = config;

  // Core E2E exposure (isLocked, mode, setLocked)
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.__DEV__) {
      window.__DEV__.isLocked = () => isLocked;
      window.__DEV__.mode = () => mode;
      window.__DEV__.setLocked = (locked: boolean) => {
        if (isLocked !== locked) toggleLock();
      };
    }
  }, [isLocked, mode, toggleLock]);

  // Undo/redo E2E exposure
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.__DEV__) {
      window.__DEV__.undoRedo = { canUndo: undoRedo.canUndo, canRedo: undoRedo.canRedo };
      window.__DEV__.handleEdgeCreated = handleEdgeCreated;
      window.__DEV__.handleNodeCreatedCallback = handleNodeCreatedCallback;
      window.__DEV__.createGroupFromSelected = handleAddGroupWithUndo;
      window.__DEV__.createNetworkAtPosition = createNetworkAtPosition;
    }
  }, [
    undoRedo.canUndo,
    undoRedo.canRedo,
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleAddGroupWithUndo,
    createNetworkAtPosition
  ]);

  // Network editor E2E exposure
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.__DEV__ && editNetwork) {
      window.__DEV__.openNetworkEditor = (nodeId: string | null) => {
        editNetwork(nodeId);
      };
    }
  }, [editNetwork]);

  // Groups E2E exposure
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.__DEV__) {
      window.__DEV__.getReactGroups = () => groups;
      window.__DEV__.groupsCount = groups.length;
    }
  }, [groups]);

  // Elements E2E exposure
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.__DEV__) {
      window.__DEV__.getElements = () => elements;
    }
  }, [elements]);

  // Layout controls E2E exposure
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.__DEV__) {
      if (setLayout) window.__DEV__.setLayout = setLayout;
      if (setGeoMode) window.__DEV__.setGeoMode = setGeoMode;
      window.__DEV__.isGeoLayout = () => isGeoLayout ?? false;
      window.__DEV__.geoMode = () => geoMode ?? "pan";
    }
  }, [setLayout, setGeoMode, isGeoLayout, geoMode]);
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
    mapLibreState,
    isGeoLayout,
    textAnnotations,
    shapeAnnotations,
    groups,
    updateTextGeoPosition,
    updateShapeGeoPosition,
    updateShapeEndGeoPosition,
    updateGroupGeoPosition
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

    const shapeResult = assignMissingGeoCoordinatesToShapeAnnotations(
      mapLibreState,
      shapeAnnotations
    );
    if (shapeResult.hasChanges) {
      shapeResult.updated.forEach((ann: FreeShapeAnnotation) => {
        if (ann.geoCoordinates) updateShapeGeoPosition(ann.id, ann.geoCoordinates);
        if ("endGeoCoordinates" in ann && ann.endGeoCoordinates) {
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
    mapLibreState,
    isGeoLayout,
    textAnnotations,
    shapeAnnotations,
    groups,
    updateTextGeoPosition,
    updateShapeGeoPosition,
    updateShapeEndGeoPosition,
    updateGroupGeoPosition
  ]);
}
