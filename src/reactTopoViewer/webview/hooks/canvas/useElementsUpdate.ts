/**
 * Hook for updating Cytoscape elements when they change
 * Uses useLayoutEffect to ensure Cytoscape is updated before other effects read from it
 */
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import type { Core } from 'cytoscape';

import type { CyElement } from '../../../shared/types/messages';
import { updateCytoscapeElements } from '../../components/canvas/init';

/**
 * Get element data pair (React element data and Cytoscape element data)
 * Returns null if element doesn't exist or has no id
 */
function getElementDataPair(
  cy: Core,
  reactEl: CyElement
): { reactData: Record<string, unknown>; cyData: Record<string, unknown> } | null {
  const id = reactEl.data?.id as string;
  if (!id) return null;
  const cyEl = cy.getElementById(id);
  if (cyEl.empty()) return null;
  return {
    reactData: reactEl.data as Record<string, unknown>,
    cyData: cyEl.data() as Record<string, unknown>
  };
}

/**
 * Check if any element's visual data has changed (icon, color, etc.)
 */
function hasVisualDataChanged(cy: Core, elements: CyElement[]): boolean {
  for (const reactEl of elements) {
    const pair = getElementDataPair(cy, reactEl);
    if (!pair) continue;
    const { reactData, cyData } = pair;
    if (reactData.topoViewerRole !== cyData.topoViewerRole ||
        reactData.iconColor !== cyData.iconColor ||
        reactData.iconCornerRadius !== cyData.iconCornerRadius) {
      return true;
    }
  }
  return false;
}

/**
 * Compare two extraData objects for equality
 */
function extraDataEqual(
  reactExtraData: Record<string, unknown> | undefined,
  cyExtraData: Record<string, unknown> | undefined
): boolean {
  // If one has extraData and the other doesn't, they're different
  if ((!reactExtraData && cyExtraData) || (reactExtraData && !cyExtraData)) {
    return false;
  }
  // Both undefined means equal
  if (!reactExtraData && !cyExtraData) {
    return true;
  }
  // Both exist - compare keys
  const reactKeys = Object.keys(reactExtraData!);
  const cyKeys = Object.keys(cyExtraData!);
  const allKeys = new Set([...reactKeys, ...cyKeys]);

  for (const key of allKeys) {
    if (JSON.stringify(reactExtraData![key]) !== JSON.stringify(cyExtraData![key])) {
      return false;
    }
  }
  return true;
}

/**
 * Check if any node's extraData has changed (kind, user, startup-config, etc.)
 * Returns the IDs of nodes with changed extraData
 */
function getNodesWithChangedExtraData(cy: Core, elements: CyElement[]): string[] {
  const changedIds: string[] = [];
  for (const reactEl of elements) {
    if (reactEl.group !== 'nodes') continue;
    const pair = getElementDataPair(cy, reactEl);
    if (!pair) continue;

    const reactExtraData = pair.reactData.extraData as Record<string, unknown> | undefined;
    const cyExtraData = pair.cyData.extraData as Record<string, unknown> | undefined;

    if (!extraDataEqual(reactExtraData, cyExtraData)) {
      changedIds.push(reactEl.data?.id as string);
    }
  }
  return changedIds;
}

/**
 * Check if any edge's extraData has changed (traffic stats, etc.)
 * Returns the IDs of edges with changed extraData
 */
function getEdgesWithChangedExtraData(cy: Core, elements: CyElement[]): string[] {
  const changedIds: string[] = [];
  for (const reactEl of elements) {
    if (reactEl.group !== 'edges') continue;
    const pair = getElementDataPair(cy, reactEl);
    if (!pair) continue;

    const reactExtraData = pair.reactData.extraData as Record<string, unknown> | undefined;
    const cyExtraData = pair.cyData.extraData as Record<string, unknown> | undefined;

    if (!extraDataEqual(reactExtraData, cyExtraData)) {
      changedIds.push(reactEl.data?.id as string);
    }
  }
  return changedIds;
}

/**
 * Update extraData for specific nodes in Cytoscape without full reload
 * Also updates top-level visual properties that Cytoscape uses for styling
 */
function updateNodeExtraData(cy: Core, elements: CyElement[], nodeIds: string[]): void {
  if (nodeIds.length === 0) return;

  cy.batch(() => {
    for (const nodeId of nodeIds) {
      const cyEl = cy.getElementById(nodeId);
      if (cyEl.empty()) continue;

      const reactEl = elements.find(e =>
        e.group === 'nodes' && (e.data as Record<string, unknown>)?.id === nodeId
      );
      if (!reactEl) continue;

      const reactData = reactEl.data as Record<string, unknown>;
      const reactExtraData = reactData.extraData as Record<string, unknown> | undefined;

      // Update extraData on the Cytoscape element
      cyEl.data('extraData', reactExtraData || {});

      // Also update top-level visual properties that Cytoscape uses for styling
      // These need to be at the data root level for Cytoscape style selectors
      if (reactExtraData?.topoViewerRole !== undefined) {
        cyEl.data('topoViewerRole', reactExtraData.topoViewerRole);
      }
      if (reactExtraData?.iconColor !== undefined) {
        cyEl.data('iconColor', reactExtraData.iconColor);
      }
      if (reactExtraData?.iconCornerRadius !== undefined) {
        cyEl.data('iconCornerRadius', reactExtraData.iconCornerRadius);
      }
    }
  });
}

/**
 * Update extraData for specific edges in Cytoscape without full reload
 * This is critical for real-time traffic stats updates
 */
function updateEdgeExtraData(cy: Core, elements: CyElement[], edgeIds: string[]): void {
  if (edgeIds.length === 0) return;

  cy.batch(() => {
    for (const edgeId of edgeIds) {
      const cyEl = cy.getElementById(edgeId);
      if (cyEl.empty()) continue;

      const reactEl = elements.find(e =>
        e.group === 'edges' && (e.data as Record<string, unknown>)?.id === edgeId
      );
      if (!reactEl) continue;

      const reactData = reactEl.data as Record<string, unknown>;
      const reactExtraData = reactData.extraData as Record<string, unknown> | undefined;

      // Update extraData on the Cytoscape element
      cyEl.data('extraData', reactExtraData || {});
    }
  });
}

/**
 * Check if all IDs match between Cytoscape and React state
 */
function idsMatch(cyIds: Set<string>, reactIds: Set<string>): boolean {
  for (const id of reactIds) {
    if (!cyIds.has(id)) return false;
  }
  for (const id of cyIds) {
    if (!reactIds.has(id)) return false;
  }
  return true;
}

/**
 * Check if the React state update is just an addition of elements already in Cytoscape
 * In this case, we can skip the full reset since Cytoscape already has the correct state.
 * Also checks if any element data has changed (e.g., icon/topoViewerRole updates).
 */
function canSkipUpdate(cy: Core, elements: CyElement[]): boolean {
  const cyIds = new Set(cy.elements().map(el => el.id()));
  const reactIds = new Set(elements.map(el => el.data?.id).filter(Boolean) as string[]);

  // Check if Cytoscape has exactly the same or more elements than React state
  if (cyIds.size < reactIds.size) return false;
  if (!idsMatch(cyIds, reactIds)) return false;
  if (hasVisualDataChanged(cy, elements)) return false;

  return true;
}

/**
 * Detect if the change is a single node rename (same element count, one ID swapped)
 * Returns the old and new ID if it's a rename, null otherwise
 */
function detectRename(cy: Core, elements: CyElement[]): { oldId: string; newId: string } | null {
  const cyNodeIds = new Set(cy.nodes().map(n => n.id()));
  const reactNodeIds = new Set(
    elements.filter(e => e.group === 'nodes').map(e => (e.data as Record<string, unknown>)?.id as string).filter(Boolean)
  );

  // Must have same number of nodes
  if (cyNodeIds.size !== reactNodeIds.size) return null;

  let missing: string | null = null;
  let added: string | null = null;

  // Find the node that's in Cytoscape but not in React (the old ID)
  for (const id of cyNodeIds) {
    if (!reactNodeIds.has(id)) {
      if (missing) return null; // More than one missing - not a simple rename
      missing = id;
    }
  }

  // Find the node that's in React but not in Cytoscape (the new ID)
  for (const id of reactNodeIds) {
    if (!cyNodeIds.has(id)) {
      if (added) return null; // More than one added - not a simple rename
      added = id;
    }
  }

  if (missing && added) {
    return { oldId: missing, newId: added };
  }
  return null;
}

/**
 * Handle node rename in-place without full graph reload
 * Preserves position and updates edges surgically
 *
 * IMPORTANT: When removing a node in Cytoscape, connected edges are automatically removed too.
 * So we must save the edge data, remove the node (which removes edges), add the new node,
 * then re-add the edges with updated source/target references.
 */
function handleRenameInPlace(cy: Core, oldId: string, newId: string, elements: CyElement[]): void {
  const oldNode = cy.getElementById(oldId);
  if (!oldNode.length) return;

  // Get the new node element data from React state
  const newNodeEl = elements.find(
    e => e.group === 'nodes' && (e.data as Record<string, unknown>)?.id === newId
  );
  if (!newNodeEl) return;

  // Preserve the current position
  const position = oldNode.position();

  // Save connected edges BEFORE removing the node (they'll be auto-removed with the node)
  // Update source/target references to point to the new node ID
  const edgesToRestore: Array<{ group: 'edges'; data: Record<string, unknown> }> = [];
  oldNode.connectedEdges().forEach(edge => {
    const edgeData = { ...(edge.data() as Record<string, unknown>) } as { source?: string; target?: string; [key: string]: unknown };
    // Update source/target to new node ID
    if (edgeData.source === oldId) edgeData.source = newId;
    if (edgeData.target === oldId) edgeData.target = newId;
    edgesToRestore.push({ group: 'edges', data: edgeData });
  });

  cy.batch(() => {
    // Remove old node (this also removes connected edges)
    oldNode.remove();
    // Add new node with preserved position
    cy.add({ ...newNodeEl, position });
    // Re-add the edges with updated references
    edgesToRestore.forEach(edge => cy.add(edge));
  });
}

/**
 * Hook for updating elements when they change
 * Uses useLayoutEffect to ensure updates complete before other effects (like useSelectionData) read data
 *
 * IMPORTANT: This hook detects when React state changes are already reflected in Cytoscape
 * (e.g., when we add a node via cy.add() and then dispatch ADD_NODE). In such cases,
 * we skip the full reset to preserve node positions and avoid visual jumps.
 */
export function useElementsUpdate(cyRef: React.RefObject<Core | null>, elements: CyElement[]): void {
  const isInitializedRef = useRef(false);

  useLayoutEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (!elements.length) {
      cy.elements().remove();
      isInitializedRef.current = false;
      return;
    }

    // Skip update if Cytoscape already has all the elements (e.g., after direct cy.add())
    // This preserves positions when adding nodes via UI
    if (isInitializedRef.current && canSkipUpdate(cy, elements)) {
      // Even if we can skip the full update, check for extraData changes
      // and update Cytoscape surgically for both nodes and edges
      const nodesWithChangedExtraData = getNodesWithChangedExtraData(cy, elements);
      if (nodesWithChangedExtraData.length > 0) {
        updateNodeExtraData(cy, elements, nodesWithChangedExtraData);
      }
      // Also check for edge extraData changes (critical for real-time traffic stats)
      const edgesWithChangedExtraData = getEdgesWithChangedExtraData(cy, elements);
      if (edgesWithChangedExtraData.length > 0) {
        updateEdgeExtraData(cy, elements, edgesWithChangedExtraData);
      }
      return;
    }

    // Check if this is a node rename - handle it surgically without full reload
    if (isInitializedRef.current) {
      const rename = detectRename(cy, elements);
      if (rename) {
        handleRenameInPlace(cy, rename.oldId, rename.newId, elements);
        return;
      }
    }

    // Full update for other cases
    updateCytoscapeElements(cy, elements);
    isInitializedRef.current = true;
  }, [cyRef, elements]);
}
