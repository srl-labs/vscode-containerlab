/**
 * Type declarations for development mode globals.
 * The __DEV__ interface is exposed on window only in development builds
 * to support E2E testing and debugging.
 */

import type { ReactFlowInstance } from "@xyflow/react";

import type { GroupStyleAnnotation } from "../../shared/types/topology";
import type { NetworkType } from "../../shared/types/editors";
import type { TopoNode } from "../../shared/types/graph";
import type { CustomIconInfo } from "../../shared/types/icons";
import type { CustomNodeTemplate, SchemaData } from "../../shared/schema";

/** Layout option type */
type LayoutOption = "preset" | "cose" | "cola" | "radial" | "hierarchical" | "geo";

/**
 * Development mode interface for E2E testing and debugging.
 * Exposed on window.__DEV__ only in development builds.
 */
export interface DevModeInterface {
  /** Check if topology is locked */
  isLocked?: () => boolean;
  /** Get current mode */
  mode?: () => "edit" | "view";
  /** Set locked state */
  setLocked?: (locked: boolean) => void;
  /** Set mode state directly */
  setModeState?: (mode: "edit" | "view") => void;
  /** Undo/redo state */
  undoRedo?: {
    canUndo: boolean;
    canRedo: boolean;
  };
  /** Handler for edge creation with undo support */
  handleEdgeCreated?: (
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
  /** Handler for node creation with undo support */
  handleNodeCreatedCallback?: (
    nodeId: string,
    nodeElement: TopoNode,
    position: { x: number; y: number }
  ) => void;
  /** Create group from selected nodes */
  createGroupFromSelected?: () => void;
  /** Create a network node at a position */
  createNetworkAtPosition?: (
    position: { x: number; y: number },
    networkType: NetworkType
  ) => string | null;
  /** Open or close the network editor panel */
  openNetworkEditor?: (nodeId: string | null) => void;
  /** Get React groups state */
  getReactGroups?: () => GroupStyleAnnotation[];
  /** Current group count */
  groupsCount?: number;
  /** Get React elements state */
  getElements?: () => unknown[];
  /** Set layout for the graph (for E2E testing) */
  setLayout?: (layout: LayoutOption) => void;
  /** Check if currently in geo layout mode */
  isGeoLayout?: () => boolean;
  /** React Flow instance for E2E testing (replaces Cytoscape cy) */
  rfInstance?: ReactFlowInstance;
  /** Get current selected node ID */
  selectedNode?: () => string | null;
  /** Get current selected edge ID */
  selectedEdge?: () => string | null;
  /** Select a node by ID (for E2E testing) */
  selectNode?: (nodeId: string | null) => void;
  /** Select an edge by ID (for E2E testing) */
  selectEdge?: (edgeId: string | null) => void;
  /** Select multiple nodes for clipboard operations (for E2E testing) */
  selectNodesForClipboard?: (nodeIds: string[]) => void;
  /** Clear all node selections (for E2E testing) */
  clearNodeSelection?: () => void;
}

/**
 * Initial bootstrap data passed from extension/dev host (non-topology).
 */
export interface WebviewInitialData {
  schemaData?: SchemaData;
  dockerImages?: string[];
  customNodes?: CustomNodeTemplate[];
  defaultNode?: string;
  customIcons?: CustomIconInfo[];
  [key: string]: unknown;
}

declare global {
  interface Window {
    __DEV__?: DevModeInterface;
    __INITIAL_DATA__?: WebviewInitialData;
    // Note: __SCHEMA_DATA__ is typed in hooks/editor/useSchema.ts
    __DOCKER_IMAGES__?: string[];
    maplibreWorkerUrl?: string;
  }
}
