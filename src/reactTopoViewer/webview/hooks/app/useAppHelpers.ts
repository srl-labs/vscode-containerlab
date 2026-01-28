/**
 * App helper hooks - extracted from App.tsx to reduce file size
 */
import React from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type {
  CustomNodeTemplate,
  CustomTemplateEditorData,
  NetworkType
} from "../../../shared/types/editors";
import type { EdgeCreatedHandler, NodeCreatedHandler } from "../../../shared/types/graph";
import {
  createNewTemplateEditorData,
  convertTemplateToEditorData
} from "../../../shared/utilities/customNodeConversions";
import {
  sendDeleteCustomNode,
  sendSetDefaultCustomNode,
  sendCommandToExtension
} from "../../messaging/extensionMessaging";
import type { GroupStyleAnnotation } from "../../../shared/types/topology";

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
      // Handle special "__new__" case for creating new custom nodes
      if (nodeName === "__new__") {
        const templateData = createNewTemplateEditorData();
        editCustomTemplate(templateData);
        return;
      }
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

/** Layout option type for E2E testing */
export type LayoutOption = "preset" | "cose" | "cola" | "radial" | "hierarchical" | "geo";

/**
 * E2E testing exposure configuration
 */
export interface E2ETestingConfig {
  isLocked: boolean;
  mode: "edit" | "view";
  toggleLock: () => void;
  setMode?: (mode: "edit" | "view") => void;
  undoRedo: {
    canUndo: boolean;
    canRedo: boolean;
  };
  handleEdgeCreated: EdgeCreatedHandler;
  handleNodeCreatedCallback: NodeCreatedHandler;
  handleAddGroup: () => void;
  createNetworkAtPosition: (
    position: { x: number; y: number },
    networkType: NetworkType
  ) => string | null;
  editNetwork?: (nodeId: string | null) => void;
  groups: GroupStyleAnnotation[];
  elements: unknown[];
  /** Layout controls for E2E testing */
  setLayout?: (layout: LayoutOption) => void;
  isGeoLayout?: boolean;
  /** React Flow instance for E2E testing */
  rfInstance?: ReactFlowInstance | null;
  /** Selection state for E2E testing */
  selectedNode?: string | null;
  selectedEdge?: string | null;
  /** Selection actions for E2E testing */
  selectNode?: (nodeId: string | null) => void;
  selectEdge?: (edgeId: string | null) => void;
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
    setMode,
    undoRedo,
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleAddGroup,
    createNetworkAtPosition,
    editNetwork,
    groups,
    elements,
    setLayout,
    isGeoLayout,
    rfInstance,
    selectedNode,
    selectedEdge,
    selectNode,
    selectEdge
  } = config;

  // Core E2E exposure (isLocked, mode, setLocked)
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.__DEV__) {
      window.__DEV__.isLocked = () => isLocked;
      window.__DEV__.mode = () => mode;
      window.__DEV__.setLocked = (locked: boolean) => {
        if (isLocked !== locked) toggleLock();
      };
      if (setMode) {
        window.__DEV__.setModeState = (nextMode: "edit" | "view") => {
          setMode(nextMode);
        };
      }
    }
  }, [isLocked, mode, toggleLock, setMode]);

  // Undo/redo E2E exposure
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.__DEV__) {
      window.__DEV__.undoRedo = { canUndo: undoRedo.canUndo, canRedo: undoRedo.canRedo };
      window.__DEV__.handleEdgeCreated = handleEdgeCreated;
      window.__DEV__.handleNodeCreatedCallback = handleNodeCreatedCallback;
      window.__DEV__.createGroupFromSelected = handleAddGroup;
      window.__DEV__.createNetworkAtPosition = createNetworkAtPosition;
    }
  }, [
    undoRedo.canUndo,
    undoRedo.canRedo,
    handleEdgeCreated,
    handleNodeCreatedCallback,
    handleAddGroup,
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
      window.__DEV__.isGeoLayout = () => isGeoLayout ?? false;
    }
  }, [setLayout, isGeoLayout]);

  // React Flow instance E2E exposure (replaces Cytoscape cy)
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.__DEV__) {
      window.__DEV__.rfInstance = rfInstance ?? undefined;
    }
  }, [rfInstance]);

  // Selection state and actions E2E exposure
  // Use refs to ensure the exposed functions always return the latest value
  const selectedNodeRef = React.useRef(selectedNode);
  const selectedEdgeRef = React.useRef(selectedEdge);
  selectedNodeRef.current = selectedNode;
  selectedEdgeRef.current = selectedEdge;

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.__DEV__) {
      // Use ref.current to always get the latest value
      window.__DEV__.selectedNode = () => selectedNodeRef.current ?? null;
      window.__DEV__.selectedEdge = () => selectedEdgeRef.current ?? null;
      if (selectNode) window.__DEV__.selectNode = selectNode;
      if (selectEdge) window.__DEV__.selectEdge = selectEdge;

      // React Flow node selection for clipboard operations
      // This updates the React Flow nodes' `selected` property directly
      window.__DEV__.selectNodesForClipboard = (nodeIds: string[]) => {
        if (!rfInstance) return;
        const nodeIdSet = new Set(nodeIds);
        const nodes = rfInstance.getNodes();
        const updatedNodes = nodes.map((node) => ({
          ...node,
          selected: nodeIdSet.has(node.id)
        }));
        rfInstance.setNodes(updatedNodes);
      };

      // Clear all React Flow node selections
      window.__DEV__.clearNodeSelection = () => {
        if (!rfInstance) return;
        const nodes = rfInstance.getNodes();
        const updatedNodes = nodes.map((node) => ({
          ...node,
          selected: false
        }));
        rfInstance.setNodes(updatedNodes);
      };
    }
  }, [selectNode, selectEdge, rfInstance]); // Include rfInstance in dependencies
}
