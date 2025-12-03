/**
 * App State Hook
 * Manages cytoscape instance and selection data
 */
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Core } from 'cytoscape';
import { CytoscapeCanvasRef } from '../components/canvas/CytoscapeCanvas';

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
 * Extract node data from cytoscape instance
 */
function getNodeDataFromCy(cy: Core | null, nodeId: string | null): NodeData | null {
  if (!cy || !nodeId) return null;
  const node = cy.getElementById(nodeId);
  return node.length > 0 ? (node.data() as NodeData) : null;
}

/**
 * Extract link data from cytoscape instance
 */
function getLinkDataFromCy(cy: Core | null, edgeId: string | null): LinkData | null {
  if (!cy || !edgeId) return null;
  const edge = cy.getElementById(edgeId);
  if (edge.length === 0) return null;

  const data = edge.data();
  return {
    id: data.id,
    source: data.source,
    target: data.target,
    sourceEndpoint: data.sourceEndpoint || data.sourceInterface,
    targetEndpoint: data.targetEndpoint || data.targetInterface,
    ...data
  } as LinkData;
}

/**
 * Hook for managing cytoscape instance
 */
export function useCytoscapeInstance(elements: unknown[]): {
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>;
  cyInstance: Core | null;
} {
  const cytoscapeRef = useRef<CytoscapeCanvasRef>(null);
  const [cyInstance, setCyInstance] = useState<Core | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const cy = cytoscapeRef.current?.getCy() || null;
      if (cy && cy !== cyInstance) setCyInstance(cy);
    }, 100);
    return () => clearTimeout(timer);
  }, [elements, cyInstance]);

  return { cytoscapeRef, cyInstance };
}

/**
 * Hook for selection data
 */
export function useSelectionData(
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>,
  selectedNode: string | null,
  selectedEdge: string | null
): { selectedNodeData: NodeData | null; selectedLinkData: LinkData | null } {
  const [selectedNodeData, setSelectedNodeData] = useState<NodeData | null>(null);
  const [selectedLinkData, setSelectedLinkData] = useState<LinkData | null>(null);

  useEffect(() => {
    const cy = cytoscapeRef.current?.getCy();
    setSelectedNodeData(getNodeDataFromCy(cy || null, selectedNode));
    setSelectedLinkData(getLinkDataFromCy(cy || null, selectedEdge));
  }, [selectedNode, selectedEdge, cytoscapeRef]);

  return { selectedNodeData, selectedLinkData };
}

/**
 * Hook for navbar actions
 */
export function useNavbarActions(cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>): {
  handleZoomToFit: () => void;
  handleToggleLayout: () => void;
} {
  const handleZoomToFit = useCallback(() => cytoscapeRef.current?.fit(), [cytoscapeRef]);
  const handleToggleLayout = useCallback(() => cytoscapeRef.current?.runLayout('cose'), [cytoscapeRef]);
  return { handleZoomToFit, handleToggleLayout };
}

interface SelectionCallbacks {
  /* eslint-disable no-unused-vars */
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  /* eslint-enable no-unused-vars */
}

/* eslint-disable no-unused-vars */
interface ContextMenuHandlersResult {
  handleEditNode: (nodeId: string) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleEditLink: (edgeId: string) => void;
  handleDeleteLink: (edgeId: string) => void;
  handleShowNodeProperties: (nodeId: string) => void;
  handleShowLinkProperties: (edgeId: string) => void;
  handleCloseNodePanel: () => void;
  handleCloseLinkPanel: () => void;
}
/* eslint-enable no-unused-vars */

/**
 * Hook for context menu handlers
 */
export function useContextMenuHandlers(
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>,
  callbacks: SelectionCallbacks
): ContextMenuHandlersResult {
  const { selectNode, selectEdge } = callbacks;

  const handleEditNode = useCallback((nodeId: string) => selectNode(nodeId), [selectNode]);
  const handleShowNodeProperties = useCallback((nodeId: string) => selectNode(nodeId), [selectNode]);
  const handleShowLinkProperties = useCallback((edgeId: string) => selectEdge(edgeId), [selectEdge]);
  const handleEditLink = useCallback((edgeId: string) => selectEdge(edgeId), [selectEdge]);
  const handleCloseNodePanel = useCallback(() => selectNode(null), [selectNode]);
  const handleCloseLinkPanel = useCallback(() => selectEdge(null), [selectEdge]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    const cy = cytoscapeRef.current?.getCy();
    if (cy) {
      cy.getElementById(nodeId).remove();
      selectNode(null);
    }
  }, [selectNode, cytoscapeRef]);

  const handleDeleteLink = useCallback((edgeId: string) => {
    const cy = cytoscapeRef.current?.getCy();
    if (cy) {
      cy.getElementById(edgeId).remove();
      selectEdge(null);
    }
  }, [selectEdge, cytoscapeRef]);

  return {
    handleEditNode,
    handleDeleteNode,
    handleEditLink,
    handleDeleteLink,
    handleShowNodeProperties,
    handleShowLinkProperties,
    handleCloseNodePanel,
    handleCloseLinkPanel
  };
}
