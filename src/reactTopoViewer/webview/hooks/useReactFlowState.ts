/**
 * React Flow State Hooks
 * Manages React Flow instance and selection data (replaces Cytoscape-based hooks)
 */
import React, { useRef, useCallback, useEffect, useState } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { ReactFlowCanvasRef } from '../components/react-flow-canvas';
import { sendCommandToExtension } from '../utils/extensionMessaging';

export type LayoutOption = 'preset' | 'force' | 'grid' | 'circle' | 'geo';
export const DEFAULT_GRID_LINE_WIDTH = 0.5;

export interface NodeData {
  id: string;
  label?: string;
  name?: string;
  kind?: string;
  state?: string;
  image?: string;
  mgmtIpv4?: string;
  mgmtIpv6?: string;
  fqdn?: string;
  [key: string]: unknown;
}

export interface LinkData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  [key: string]: unknown;
}

/**
 * Hook for managing React Flow instance
 */
export function useReactFlowInstance(elements: unknown[]): {
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>;
  rfInstance: ReactFlowInstance | null;
} {
  const reactFlowRef = useRef<ReactFlowCanvasRef>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const instance = reactFlowRef.current?.getReactFlowInstance() || null;
      if (instance && instance !== rfInstance) setRfInstance(instance);
    }, 100);
    return () => clearTimeout(timer);
  }, [elements, rfInstance]);

  return { reactFlowRef, rfInstance };
}

/**
 * Extract node data from React Flow instance
 */
function getNodeDataFromRF(rfInstance: ReactFlowInstance | null, nodeId: string | null): NodeData | null {
  if (!rfInstance || !nodeId) return null;
  const node = rfInstance.getNode(nodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;
  return {
    id: node.id,
    label: data.label as string,
    name: data.label as string,
    kind: data.kind as string,
    state: data.state as string,
    image: data.image as string,
    mgmtIpv4: data.mgmtIpv4Address as string,
    mgmtIpv6: data.mgmtIpv6Address as string,
    fqdn: data.fqdn as string,
    ...data
  };
}

/**
 * Extract link data from React Flow instance
 */
function getLinkDataFromRF(rfInstance: ReactFlowInstance | null, edgeId: string | null): LinkData | null {
  if (!rfInstance || !edgeId) return null;
  const edge = rfInstance.getEdge(edgeId);
  if (!edge) return null;

  const data = edge.data as Record<string, unknown> | undefined;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceEndpoint: data?.sourceEndpoint as string,
    targetEndpoint: data?.targetEndpoint as string,
    ...data
  };
}

/**
 * Hook for selection data (React Flow version)
 */
export function useRFSelectionData(
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>,
  selectedNode: string | null,
  selectedEdge: string | null
): { selectedNodeData: NodeData | null; selectedLinkData: LinkData | null } {
  const [selectedNodeData, setSelectedNodeData] = useState<NodeData | null>(null);
  const [selectedLinkData, setSelectedLinkData] = useState<LinkData | null>(null);

  useEffect(() => {
    const rfInstance = reactFlowRef.current?.getReactFlowInstance();
    setSelectedNodeData(getNodeDataFromRF(rfInstance || null, selectedNode));
    setSelectedLinkData(getLinkDataFromRF(rfInstance || null, selectedEdge));
  }, [selectedNode, selectedEdge, reactFlowRef]);

  return { selectedNodeData, selectedLinkData };
}

/**
 * Hook for navbar actions (React Flow version)
 */
export function useRFNavbarActions(reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>): {
  handleZoomToFit: () => void;
  handleToggleLayout: () => void;
} {
  const handleZoomToFit = useCallback(() => reactFlowRef.current?.fit(), [reactFlowRef]);
  const handleToggleLayout = useCallback(() => reactFlowRef.current?.runLayout('force'), [reactFlowRef]);
  return { handleZoomToFit, handleToggleLayout };
}

/**
 * Hook for layout controls (React Flow version)
 */
export function useRFLayoutControls(
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>,
  rfInstance: ReactFlowInstance | null
): {
  layout: LayoutOption;
  setLayout: (layout: LayoutOption) => void;
  geoMode: 'pan' | 'edit';
  setGeoMode: (mode: 'pan' | 'edit') => void;
  isGeoLayout: boolean;
  gridLineWidth: number;
  setGridLineWidth: (width: number) => void;
} {
  const [layout, setLayoutState] = useState<LayoutOption>('preset');
  const [geoMode, setGeoModeState] = useState<'pan' | 'edit'>('pan');
  const [gridLineWidth, setGridLineWidthState] = useState<number>(DEFAULT_GRID_LINE_WIDTH);

  const setGridLineWidth = useCallback((width: number) => {
    setGridLineWidthState(width);
    // React Flow's Background component handles grid display
  }, []);

  const setGeoMode = useCallback((mode: 'pan' | 'edit') => {
    setGeoModeState(mode);
    if (layout !== 'geo') return;
    sendCommandToExtension('nav-geo-controls', { geoMode: mode });
  }, [layout]);

  const setLayout = useCallback((nextLayout: LayoutOption) => {
    setLayoutState(nextLayout);
    const refApi = reactFlowRef.current;
    if (!refApi) return;

    if (nextLayout === 'geo') {
      refApi.fit();
      sendCommandToExtension('nav-geo-controls', { geoMode });
      return;
    }

    refApi.runLayout(nextLayout);
  }, [reactFlowRef, geoMode]);

  return {
    layout,
    setLayout,
    geoMode,
    setGeoMode,
    isGeoLayout: layout === 'geo',
    gridLineWidth,
    setGridLineWidth
  };
}

interface SelectionCallbacks {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
  editEdge: (id: string | null) => void;
  removeNodeAndEdges: (id: string) => void;
  removeEdge: (id: string) => void;
}

interface ContextMenuHandlersResult {
  handleEditNode: (nodeId: string) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleCreateLinkFromNode: (nodeId: string) => void;
  handleEditLink: (edgeId: string) => void;
  handleDeleteLink: (edgeId: string) => void;
  handleShowNodeProperties: (nodeId: string) => void;
  handleShowLinkProperties: (edgeId: string) => void;
  handleCloseNodePanel: () => void;
  handleCloseLinkPanel: () => void;
}

/**
 * Hook for context menu handlers (React Flow version)
 */
export function useRFContextMenuHandlers(
  reactFlowRef: React.RefObject<ReactFlowCanvasRef | null>,
  callbacks: SelectionCallbacks
): ContextMenuHandlersResult {
  const { selectNode, selectEdge, editNode, editEdge, removeNodeAndEdges, removeEdge } = callbacks;

  const handleEditNode = useCallback((nodeId: string) => {
    sendCommandToExtension('panel-edit-node', { nodeId });
    editNode(nodeId);
  }, [editNode]);

  const handleCreateLinkFromNode = useCallback((nodeId: string) => {
    sendCommandToExtension('panel-start-link', { nodeId });
  }, []);

  const handleShowNodeProperties = useCallback((nodeId: string) => {
    sendCommandToExtension('panel-node-info', { nodeId });
    selectNode(nodeId);
  }, [selectNode]);

  const handleShowLinkProperties = useCallback((edgeId: string) => {
    sendCommandToExtension('panel-link-info', { edgeId });
    selectEdge(edgeId);
  }, [selectEdge]);

  const handleEditLink = useCallback((edgeId: string) => {
    sendCommandToExtension('panel-edit-link', { edgeId });
    editEdge(edgeId);
  }, [editEdge]);

  const handleCloseNodePanel = useCallback(() => selectNode(null), [selectNode]);
  const handleCloseLinkPanel = useCallback(() => selectEdge(null), [selectEdge]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    sendCommandToExtension('panel-delete-node', { nodeId });
    removeNodeAndEdges(nodeId);
    selectNode(null);
  }, [selectNode, removeNodeAndEdges]);

  const handleDeleteLink = useCallback((edgeId: string) => {
    const rfInstance = reactFlowRef.current?.getReactFlowInstance();
    if (rfInstance) {
      const edge = rfInstance.getEdge(edgeId);
      if (edge) {
        const edgeData = edge.data as Record<string, unknown> | undefined;
        sendCommandToExtension('panel-delete-link', {
          edgeId,
          linkData: {
            source: edge.source,
            target: edge.target,
            sourceEndpoint: edgeData?.sourceEndpoint || '',
            targetEndpoint: edgeData?.targetEndpoint || ''
          }
        });
      }
    }
    removeEdge(edgeId);
    selectEdge(null);
  }, [selectEdge, removeEdge, reactFlowRef]);

  return {
    handleEditNode,
    handleDeleteNode,
    handleCreateLinkFromNode,
    handleEditLink,
    handleDeleteLink,
    handleShowNodeProperties,
    handleShowLinkProperties,
    handleCloseNodePanel,
    handleCloseLinkPanel
  };
}
