/**
 * Type declarations for development mode globals.
 * The __DEV__ interface is exposed on window only in development builds
 * to support E2E testing and debugging.
 */

import type { Core as CyCore } from 'cytoscape';

import type { GroupStyleAnnotation } from '../../shared/types/topology';
import type { NetworkType } from '../../shared/types/editors';

/**
 * Development mode interface for E2E testing and debugging.
 * Exposed on window.__DEV__ only in development builds.
 */
export interface DevModeInterface {
  /** Cytoscape instance for graph manipulation */
  cy?: CyCore;
  /** Check if topology is locked */
  isLocked?: () => boolean;
  /** Get current mode */
  mode?: () => 'edit' | 'view';
  /** Set locked state */
  setLocked?: (locked: boolean) => void;
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
    nodeElement: {
      group: 'nodes' | 'edges';
      data: Record<string, unknown>;
      position?: { x: number; y: number };
      classes?: string;
    },
    position: { x: number; y: number }
  ) => void;
  /** Create group from selected nodes */
  createGroupFromSelected?: () => void;
  /** Create a network node at a position */
  createNetworkAtPosition?: (
    position: { x: number; y: number },
    networkType: NetworkType
  ) => string | null;
  /** Get React groups state */
  getReactGroups?: () => GroupStyleAnnotation[];
  /** Current group count */
  groupsCount?: number;
  /** Get React elements state */
  getElements?: () => unknown[];
}

/**
 * Initial data passed from extension to webview.
 */
export interface WebviewInitialData {
  elements?: Array<{
    group: 'nodes' | 'edges';
    data: Record<string, unknown>;
    position?: { x: number; y: number };
    classes?: string;
  }>;
  schemaData?: Record<string, unknown>;
  dockerImages?: string[];
  annotations?: Record<string, unknown>;
  viewerSettings?: {
    gridLineWidth?: number;
    endpointLabelOffsetEnabled?: boolean;
    endpointLabelOffset?: number;
  };
  isViewMode?: boolean;
  labName?: string;
  yamlFilePath?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    __DEV__?: DevModeInterface;
    __INITIAL_DATA__?: WebviewInitialData;
    // Note: __SCHEMA_DATA__ is typed in hooks/data/useSchema.ts
    __DOCKER_IMAGES__?: string[];
  }
}
