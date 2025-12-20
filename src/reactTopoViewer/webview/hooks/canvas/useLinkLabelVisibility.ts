/**
 * Hook to manage link label visibility based on linkLabelMode
 * Implements legacy behavior: node selection shows connected edge labels,
 * edge selection shows its label and highlights connected nodes.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { Core as CyCore, EventObject, NodeSingular, EdgeSingular, EdgeCollection, NodeCollection } from 'cytoscape';

import type { LinkLabelMode } from '../../context/TopoViewerContext';

// CSS class names for visual highlighting
const HIGHLIGHT_EDGE_CLASS = 'link-label-highlight-edge';
const HIGHLIGHT_NODE_CLASS = 'link-label-highlight-node';
const NODE_EDGE_SELECTOR = 'node, edge';

type SelectionEvent = EventObject & { target: NodeSingular | EdgeSingular };

/** Clear all highlight classes from the graph */
function clearHighlights(cy: CyCore): void {
  cy.elements().removeClass([HIGHLIGHT_EDGE_CLASS, HIGHLIGHT_NODE_CLASS]);
}

/** Apply label visibility styles to edges */
function applyLabelStyles(cyInstance: CyCore, mode: LinkLabelMode): void {
  const edges = cyInstance.edges();
  if (edges.length === 0) return;

  // Clear any existing highlights when mode changes
  clearHighlights(cyInstance);

  if (mode === 'show-all') {
    edges.style({ 'text-opacity': 1, 'text-background-opacity': 1 });
  } else if (mode === 'hide') {
    edges.style({ 'text-opacity': 0, 'text-background-opacity': 0 });
  } else {
    // 'on-select': hide all, then apply selection-based visibility
    edges.style({ 'text-opacity': 0, 'text-background-opacity': 0 });
    applySelectionHighlights(cyInstance);
  }
}

/** Apply highlights based on current selection state */
function applySelectionHighlights(cy: CyCore): void {
  const selectedNodes = cy.nodes(':selected');
  const selectedEdges = cy.edges(':selected');

  // Edges to highlight: selected edges + edges connected to selected nodes
  const edgesToHighlight: EdgeCollection = selectedEdges.union(selectedNodes.connectedEdges());

  // Nodes to highlight: selected nodes + nodes connected to selected edges
  const nodesToHighlight: NodeCollection = selectedNodes.union(selectedEdges.connectedNodes());

  // Apply edge highlighting
  edgesToHighlight.forEach((edge: EdgeSingular) => {
    edge.addClass(HIGHLIGHT_EDGE_CLASS);
    edge.style({ 'text-opacity': 1, 'text-background-opacity': 0.7 });
  });

  // Apply node highlighting
  nodesToHighlight.forEach((node: NodeSingular) => {
    node.addClass(HIGHLIGHT_NODE_CLASS);
  });
}

/**
 * Applies link label visibility based on the selected mode
 *
 * In 'on-select' mode (matching legacy behavior):
 * - Clicking a node shows labels for all connected edges and highlights them
 * - Clicking an edge shows its label and highlights connected nodes
 */
export function useLinkLabelVisibility(
  cyInstance: CyCore | null,
  linkLabelMode: LinkLabelMode
): void {
  const previousModeRef = useRef<LinkLabelMode | null>(null);

  // Memoized handler for selection changes
  const handleSelectionChange = useCallback(() => {
    if (!cyInstance || linkLabelMode !== 'on-select') return;

    // First, reset all edges to hidden
    cyInstance.edges().style({ 'text-opacity': 0, 'text-background-opacity': 0 });
    clearHighlights(cyInstance);

    // Then apply highlights based on current selection
    applySelectionHighlights(cyInstance);
  }, [cyInstance, linkLabelMode]);

  // Apply styles when mode changes
  useEffect(() => {
    if (!cyInstance) return;
    if (previousModeRef.current === linkLabelMode) return;
    previousModeRef.current = linkLabelMode;
    applyLabelStyles(cyInstance, linkLabelMode);
  }, [cyInstance, linkLabelMode]);

  // Handle selection changes for 'on-select' mode
  useEffect(() => {
    if (!cyInstance || linkLabelMode !== 'on-select') return;

    // Handle both node and edge selection/unselection
    const handleSelect = (_evt: SelectionEvent) => handleSelectionChange();
    const handleUnselect = (_evt: SelectionEvent) => handleSelectionChange();

    // Listen for selection events on both nodes and edges
    cyInstance.on('select', NODE_EDGE_SELECTOR, handleSelect);
    cyInstance.on('unselect', NODE_EDGE_SELECTOR, handleUnselect);

    return () => {
      cyInstance.off('select', NODE_EDGE_SELECTOR, handleSelect);
      cyInstance.off('unselect', NODE_EDGE_SELECTOR, handleUnselect);
      // Clean up highlights when leaving on-select mode
      clearHighlights(cyInstance);
    };
  }, [cyInstance, linkLabelMode, handleSelectionChange]);
}
