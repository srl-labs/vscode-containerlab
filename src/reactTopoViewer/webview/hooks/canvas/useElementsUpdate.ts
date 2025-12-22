/**
 * Hook for updating Cytoscape elements when they change
 * Uses useLayoutEffect to ensure Cytoscape is updated before other effects read from it
 */
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import type { Core } from 'cytoscape';

import type { CyElement } from '../../../shared/types/messages';
import { applyStubLinkClasses, updateCytoscapeElements, hasPresetPositions } from '../../components/canvas/init';

type NodePositions = Array<{ id: string; position: { x: number; y: number } }>;

function collectNodePositions(cy: Core): NodePositions {
  const excludedRoles = new Set(['group', 'freeText', 'freeShape']);
  const positions: NodePositions = [];

  cy.nodes().forEach(node => {
    const id = node.id();
    const role = node.data('topoViewerRole') as string | undefined;
    if (!id) return;
    if (role && excludedRoles.has(role)) return;
    const pos = node.position();
    positions.push({ id, position: { x: Math.round(pos.x), y: Math.round(pos.y) } });
  });

  return positions;
}

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

function isEqualValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function reactDataMatchesCy(
  reactData: Record<string, unknown>,
  cyData: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(reactData)) {
    if (key === 'extraData') {
      const reactExtra = value as Record<string, unknown> | undefined;
      const cyExtra = cyData.extraData as Record<string, unknown> | undefined;
      if (!extraDataEqual(reactExtra, cyExtra)) return false;
      continue;
    }
    if (!isEqualValue(value, cyData[key])) return false;
  }
  return true;
}

function getElementId(reactEl: CyElement): string | null {
  const id = reactEl.data?.id;
  return typeof id === 'string' && id ? id : null;
}

function syncNodePosition(cy: Core, nodeId: string, position: { x: number; y: number }): void {
  const cyEl = cy.getElementById(nodeId);
  if (cyEl.empty()) return;
  const cyPos = cyEl.position();
  if (Math.round(cyPos.x) !== Math.round(position.x) || Math.round(cyPos.y) !== Math.round(position.y)) {
    cyEl.position({ x: position.x, y: position.y });
  }
}

function syncNodeData(cy: Core, reactEl: CyElement, nodeId: string): void {
  const cyEl = cy.getElementById(nodeId);
  if (cyEl.empty()) return;
  const reactData = reactEl.data as Record<string, unknown>;
  const cyData = cyEl.data() as Record<string, unknown>;
  if (!reactDataMatchesCy(reactData, cyData)) {
    cyEl.data(reactData);
  }
  if (reactEl.position) {
    syncNodePosition(cy, nodeId, reactEl.position);
  }
}

function edgeEndpointsChanged(reactData: Record<string, unknown>, cyData: Record<string, unknown>): boolean {
  const nextSource = reactData.source as string | undefined;
  const nextTarget = reactData.target as string | undefined;
  const curSource = cyData.source as string | undefined;
  const curTarget = cyData.target as string | undefined;
  return (nextSource !== undefined && curSource !== undefined && nextSource !== curSource) ||
    (nextTarget !== undefined && curTarget !== undefined && nextTarget !== curTarget);
}

function replaceEdgeIfNeeded(cy: Core, reactEl: CyElement, edgeId: string): void {
  const cyEl = cy.getElementById(edgeId);
  if (cyEl.empty()) return;
  const reactData = reactEl.data as Record<string, unknown>;
  const cyData = cyEl.data() as Record<string, unknown>;
  if (!edgeEndpointsChanged(reactData, cyData)) return;

  const nextSource = reactData.source as string | undefined;
  const nextTarget = reactData.target as string | undefined;
  if (!nextSource || !nextTarget) return;
  if (cy.getElementById(nextSource).empty() || cy.getElementById(nextTarget).empty()) return;

  cyEl.remove();
  cy.add({ group: 'edges', data: reactEl.data, classes: reactEl.classes });
}

function syncEdgeData(cy: Core, reactEl: CyElement, edgeId: string): void {
  replaceEdgeIfNeeded(cy, reactEl, edgeId);
  const cyEl = cy.getElementById(edgeId);
  if (cyEl.empty()) return;
  const reactData = reactEl.data as Record<string, unknown>;
  const cyData = cyEl.data() as Record<string, unknown>;
  if (!reactDataMatchesCy(reactData, cyData)) {
    cyEl.data(reactData);
  }
}

function updateElementData(cy: Core, elements: CyElement[]): void {
  for (const reactEl of elements) {
    const id = getElementId(reactEl);
    if (!id) continue;
    if (reactEl.group === 'nodes') {
      syncNodeData(cy, reactEl, id);
    } else if (reactEl.group === 'edges') {
      syncEdgeData(cy, reactEl, id);
    }
  }
}

/**
 * Check if any element's extraData has changed for a specific group
 * Returns the IDs of elements with changed extraData
 */
function getElementsWithChangedExtraData(cy: Core, elements: CyElement[], group: 'nodes' | 'edges'): string[] {
  const changedIds: string[] = [];
  for (const reactEl of elements) {
    if (reactEl.group !== group) continue;
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
 * Find a React element by group and ID and return its extraData
 */
function findReactExtraData(
  elements: CyElement[],
  group: 'nodes' | 'edges',
  id: string
): Record<string, unknown> | undefined {
  const reactEl = elements.find(e =>
    e.group === group && (e.data as Record<string, unknown>)?.id === id
  );
  if (!reactEl) return undefined;
  return (reactEl.data as Record<string, unknown>).extraData as Record<string, unknown> | undefined;
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

      const reactExtraData = findReactExtraData(elements, 'nodes', nodeId);
      if (reactExtraData === undefined) continue;

      // Update extraData on the Cytoscape element
      cyEl.data('extraData', reactExtraData || {});

      // Also update top-level visual properties that Cytoscape uses for styling
      // These need to be at the data root level for Cytoscape style selectors
      if (reactExtraData.topoViewerRole !== undefined) {
        cyEl.data('topoViewerRole', reactExtraData.topoViewerRole);
      }
      if (reactExtraData.iconColor !== undefined) {
        cyEl.data('iconColor', reactExtraData.iconColor);
      }
      if (reactExtraData.iconCornerRadius !== undefined) {
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

      const reactExtraData = findReactExtraData(elements, 'edges', edgeId);
      if (reactExtraData === undefined) continue;

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

function structureMatches(cy: Core, elements: CyElement[]): boolean {
  const cyIds = new Set(cy.elements().map(el => el.id()));
  const reactIds = new Set(elements.map(el => el.data?.id).filter(Boolean) as string[]);
  if (cyIds.size !== reactIds.size) return false;
  return idsMatch(cyIds, reactIds);
}

function getFallbackPosition(cy: Core): { x: number; y: number } {
  const extent = cy.extent();
  return { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 };
}

function indexElementsById(elements: CyElement[]): Map<string, CyElement> {
  const map = new Map<string, CyElement>();
  for (const el of elements) {
    const id = el.data?.id as string;
    if (!id) continue;
    map.set(id, el);
  }
  return map;
}

function removeUnknownElements(cy: Core, allowedIds: Set<string>): void {
  const toRemove = cy.elements().filter(el => !allowedIds.has(el.id()));
  if (toRemove.nonempty()) {
    toRemove.remove();
  }
}

function addMissingNodes(cy: Core, elements: CyElement[], fallbackPosition: { x: number; y: number }): void {
  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    const id = getElementId(el);
    if (!id) continue;
    if (cy.getElementById(id).nonempty()) continue;
    const position = el.position ?? fallbackPosition;
    cy.add({ group: 'nodes', data: el.data, position, classes: el.classes });
  }
}

function addMissingEdges(cy: Core, elements: CyElement[]): void {
  for (const el of elements) {
    if (el.group !== 'edges') continue;
    const id = getElementId(el);
    if (!id) continue;
    if (cy.getElementById(id).nonempty()) continue;

    const data = el.data as Record<string, unknown>;
    const source = data.source as string | undefined;
    const target = data.target as string | undefined;
    if (source && target) {
      if (cy.getElementById(source).empty() || cy.getElementById(target).empty()) continue;
    }

    cy.add({ group: 'edges', data: el.data, classes: el.classes });
  }
}

function reconcileStructure(cy: Core, elements: CyElement[]): void {
  const reactById = indexElementsById(elements);
  const reactIds = new Set(reactById.keys());
  const fallbackPosition = getFallbackPosition(cy);

  cy.batch(() => {
    removeUnknownElements(cy, reactIds);
    addMissingNodes(cy, elements, fallbackPosition);
    addMissingEdges(cy, elements);
    updateElementData(cy, [...reactById.values()]);
  });

  applyStubLinkClasses(cy);
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
 * Design: React state is the source of truth for graph structure and element data.
 * Cytoscape is treated as a rendering layer that is incrementally reconciled from state
 * to preserve positions, zoom, and selection whenever possible.
 */
export function useElementsUpdate(
  cyRef: React.RefObject<Core | null>,
  elements: CyElement[],
  onInitialLayoutPositions?: (positions: NodePositions) => void
): void {
  const isInitializedRef = useRef(false);

  useLayoutEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (!elements.length) {
      cy.elements().remove();
      cy.scratch('initialLayoutDone', false);
      isInitializedRef.current = false;
      return;
    }

    if (!isInitializedRef.current) {
      const usePresetLayout = hasPresetPositions(elements);
      cy.scratch('initialLayoutDone', usePresetLayout);
      if (!usePresetLayout && onInitialLayoutPositions) {
        // `updateCytoscapeElements` will run COSE when there are no preset positions.
        // COSE changes positions inside Cytoscape; sync them back into React state once.
        cy.one('layoutstop', () => {
          cy.scratch('initialLayoutDone', true);
          onInitialLayoutPositions(collectNodePositions(cy));
        });
      } else if (!usePresetLayout) {
        cy.one('layoutstop', () => {
          cy.scratch('initialLayoutDone', true);
        });
      }
      updateCytoscapeElements(cy, elements);
      isInitializedRef.current = true;
      return;
    }

    // Keep Cytoscape in sync with React state without full resets:
    // 1) If structure matches, only update changed data/extraData (fast path).
    // 2) Otherwise reconcile missing/extra elements incrementally (preserves positions).
    const isSameStructure = structureMatches(cy, elements);

    // Handle node rename in-place (preserves position + connected edges).
    const rename = detectRename(cy, elements);
    if (rename) {
      handleRenameInPlace(cy, rename.oldId, rename.newId, elements);
    }

    if (isSameStructure) {
      const nodesWithChangedExtraData = getElementsWithChangedExtraData(cy, elements, 'nodes');
      const edgesWithChangedExtraData = getElementsWithChangedExtraData(cy, elements, 'edges');

      if (nodesWithChangedExtraData.length > 0) {
        updateNodeExtraData(cy, elements, nodesWithChangedExtraData);
      }
      if (edgesWithChangedExtraData.length > 0) {
        updateEdgeExtraData(cy, elements, edgesWithChangedExtraData);
      }
      if (hasVisualDataChanged(cy, elements)) {
        cy.batch(() => updateElementData(cy, elements));
        applyStubLinkClasses(cy);
      } else {
        cy.batch(() => updateElementData(cy, elements));
      }
      return;
    }

    reconcileStructure(cy, elements);
  }, [cyRef, elements]);
}
