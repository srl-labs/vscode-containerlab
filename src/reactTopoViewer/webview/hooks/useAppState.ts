/**
 * App State Hook
 * Manages cytoscape instance and selection data
 */
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Core } from 'cytoscape';
import { CytoscapeCanvasRef } from '../components/canvas/CytoscapeCanvas';
import { sendCommandToExtension } from '../utils/extensionMessaging';
import { log } from '../utils/logger';

export type LayoutOption = 'preset' | 'cola' | 'radial' | 'hierarchical' | 'cose' | 'geo';

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

function normalizeLayoutName(option: LayoutOption): string {
  if (option === 'radial') return 'concentric';
  if (option === 'hierarchical') return 'breadthfirst';
  if (option === 'geo') return 'preset';
  return option;
}

function applyGridSettings(cy: Core | null): void {
  if (!cy) return;
  const cyAny = cy as any;
  if (typeof cyAny.gridGuide !== 'function') {
    log.warn('[GridGuide] gridGuide extension unavailable on Cytoscape instance');
    return;
  }
  try {
    cyAny.gridGuide({
      drawGrid: true,
      gridSpacing: 40,
      gridColor: 'rgba(140,140,140,0.28)',
      lineWidth: 1.5,
      snapToGridOnRelease: true,
      snapToGridDuringDrag: true,
      snapToGridCenter: true,
      panGrid: true
    });
  } catch (err) {
    log.warn(`[GridGuide] Failed to apply grid settings: ${err}`);
  }
}

export function useLayoutControls(
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>,
  cyInstance: Core | null
): {
  layout: LayoutOption;
  setLayout: (layout: LayoutOption) => void;
  geoMode: 'pan' | 'edit';
  setGeoMode: (mode: 'pan' | 'edit') => void;
  isGeoLayout: boolean;
} {
  const [layout, setLayoutState] = useState<LayoutOption>('preset');
  const [geoMode, setGeoModeState] = useState<'pan' | 'edit'>('pan');

  useEffect(() => {
    applyGridSettings(cyInstance);
  }, [cyInstance]);

  const setGeoMode = useCallback((mode: 'pan' | 'edit') => {
    setGeoModeState(mode);
    if (layout !== 'geo') return;
    const cy = cytoscapeRef.current?.getCy();
    if (!cy) return;
    cy.autoungrabify(mode === 'pan');
    cy.boxSelectionEnabled(mode === 'edit');
    sendCommandToExtension('nav-geo-controls', { geoMode: mode });
  }, [cytoscapeRef, layout]);

  const setLayout = useCallback((nextLayout: LayoutOption) => {
    setLayoutState(nextLayout);
    const cyApi = cytoscapeRef.current;
    if (!cyApi) return;
    const cy = cyApi.getCy();
    if (!cy) return;
    if (nextLayout === 'geo') {
      cy.fit(undefined, 50);
      cy.autoungrabify(geoMode === 'pan');
      cy.boxSelectionEnabled(geoMode === 'edit');
      sendCommandToExtension('nav-geo-controls', { geoMode });
      return;
    }
    const normalized = normalizeLayoutName(nextLayout);
    cy.autoungrabify(false);
    cy.boxSelectionEnabled(true);
    cyApi.runLayout(normalized);
  }, [cytoscapeRef, geoMode]);

  return {
    layout,
    setLayout,
    geoMode,
    setGeoMode,
    isGeoLayout: layout === 'geo'
  };
}

interface SelectionCallbacks {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
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
 * Hook for context menu handlers
 */
export function useContextMenuHandlers(
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>,
  callbacks: SelectionCallbacks
): ContextMenuHandlersResult {
  const { selectNode, selectEdge, removeNodeAndEdges, removeEdge } = callbacks;

  const handleEditNode = useCallback((nodeId: string) => {
    sendCommandToExtension('panel-edit-node', { nodeId });
    selectNode(nodeId);
  }, [selectNode]);

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
    selectEdge(edgeId);
  }, [selectEdge]);
  const handleCloseNodePanel = useCallback(() => selectNode(null), [selectNode]);
  const handleCloseLinkPanel = useCallback(() => selectEdge(null), [selectEdge]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    sendCommandToExtension('panel-delete-node', { nodeId });
    removeNodeAndEdges(nodeId);
    const cy = cytoscapeRef.current?.getCy();
    if (cy) {
      cy.getElementById(nodeId).remove();
    }
    selectNode(null);
  }, [selectNode, removeNodeAndEdges, cytoscapeRef]);

  const handleDeleteLink = useCallback((edgeId: string) => {
    sendCommandToExtension('panel-delete-link', { edgeId });
    removeEdge(edgeId);
    const cy = cytoscapeRef.current?.getCy();
    if (cy) {
      cy.getElementById(edgeId).remove();
    }
    selectEdge(null);
  }, [selectEdge, removeEdge, cytoscapeRef]);

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
