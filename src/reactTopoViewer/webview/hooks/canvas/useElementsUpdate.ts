/**
 * Hook for updating Cytoscape elements when they change
 * Uses useLayoutEffect to ensure Cytoscape is updated before other effects read from it
 */
import type React from 'react';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Core } from 'cytoscape';

import type { CyElement } from '../../../shared/types/messages';
import type { CustomIconInfo } from '../../../shared/types/icons';
import {
  applyStubLinkClasses,
  updateCytoscapeElements,
  hasPresetPositions,
  nodesNeedAutoLayout,
  getLayoutOptions,
  collectNodePositions
} from '../../components/canvas/init';
import type { NodePositions } from '../../components/canvas/init';
import { log } from '../../utils/logger';
import { generateEncodedSVG, type NodeType } from '../../utils/SvgGenerator';
import { ROLE_SVG_MAP } from '../../components/canvas/styles';
import { applyCustomIconStyles, DEFAULT_ICON_COLOR } from '../../utils/cytoscapeHelpers';

export { collectNodePositions };
export type { NodePositions };

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

  // Don't reset from layout-generated positions back to origin
  // This preserves COSE layout positions when React state hasn't been synced yet
  const reactAtOrigin = Math.abs(position.x) < 1 && Math.abs(position.y) < 1;
  const cyNotAtOrigin = Math.abs(cyPos.x) >= 1 || Math.abs(cyPos.y) >= 1;
  if (reactAtOrigin && cyNotAtOrigin) {
    return;
  }

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
 * Check if any edge's classes have changed
 * Returns the IDs of edges with changed classes (for link-up/link-down state)
 */
function getEdgesWithChangedClasses(cy: Core, elements: CyElement[]): string[] {
  const changedIds: string[] = [];
  for (const reactEl of elements) {
    if (reactEl.group !== 'edges') continue;
    const id = reactEl.data?.id as string;
    if (!id) continue;

    const cyEl = cy.getElementById(id);
    if (cyEl.empty()) continue;

    const reactClasses = reactEl.classes ?? '';
    const cyClasses = cyEl.classes().join(' ');

    if (reactClasses !== cyClasses) {
      changedIds.push(id);
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
 * Find a React element by group and ID and return its top-level data
 */
function findReactNodeData(
  elements: CyElement[],
  id: string
): Record<string, unknown> | undefined {
  const reactEl = elements.find(e =>
    e.group === 'nodes' && (e.data as Record<string, unknown>)?.id === id
  );
  if (!reactEl) return undefined;
  return reactEl.data as Record<string, unknown>;
}

/**
 * Find a React edge element by ID and return its classes
 */
function findReactEdgeClasses(
  elements: CyElement[],
  edgeId: string
): string | undefined {
  const reactEl = elements.find(e =>
    e.group === 'edges' && (e.data as Record<string, unknown>)?.id === edgeId
  );
  return reactEl?.classes;
}

/** Visual properties extracted from React data */
interface NodeVisualProps {
  topoViewerRole?: unknown;
  iconColor?: unknown;
  iconCornerRadius?: unknown;
}

/**
 * Extract visual properties from React extraData and node data
 */
function extractNodeVisualProps(
  reactExtraData: Record<string, unknown> | undefined,
  reactNodeData: Record<string, unknown> | undefined
): NodeVisualProps {
  return {
    topoViewerRole: reactExtraData?.topoViewerRole ?? reactNodeData?.topoViewerRole,
    iconColor: reactExtraData?.iconColor ?? reactNodeData?.iconColor,
    iconCornerRadius: reactExtraData?.iconCornerRadius ?? reactNodeData?.iconCornerRadius,
  };
}

/**
 * Apply visual properties to a Cytoscape node
 * @param customIconMap - Map of custom icon names to their data URIs
 */
function applyNodeVisualProps(
  cyEl: ReturnType<Core['getElementById']>,
  props: NodeVisualProps,
  customIconMap?: Map<string, string>
): void {
  const { topoViewerRole, iconColor, iconCornerRadius } = props;

  // Update data properties
  if (topoViewerRole !== undefined) cyEl.data('topoViewerRole', topoViewerRole);
  if (iconColor !== undefined) cyEl.data('iconColor', iconColor);
  if (iconCornerRadius !== undefined) cyEl.data('iconCornerRadius', iconCornerRadius);

  // Update background-image style
  const role = (topoViewerRole as string) || (cyEl.data('topoViewerRole') as string) || 'default';

  // Check if this is a custom icon
  const customIconDataUri = customIconMap?.get(role);
  if (customIconDataUri) {
    applyCustomIconStyles(cyEl, customIconDataUri, iconCornerRadius as number | undefined);
  } else {
    // Built-in icon with optional color
    const svgType = ROLE_SVG_MAP[role] as NodeType | undefined;
    if (svgType) {
      const color = (iconColor as string) || DEFAULT_ICON_COLOR;
      cyEl.style('background-image', generateEncodedSVG(svgType, color));
    }
  }

  // Apply iconCornerRadius - requires round-rectangle shape
  if (iconCornerRadius !== undefined && (iconCornerRadius as number) > 0) {
    cyEl.style('shape', 'round-rectangle');
    cyEl.style('corner-radius', iconCornerRadius as number);
  }
}

/**
 * Update extraData for specific nodes in Cytoscape without full reload
 * Also updates top-level visual properties that Cytoscape uses for styling
 * @param customIconMap - Map of custom icon names to their data URIs
 */
function updateNodeExtraData(
  cy: Core,
  elements: CyElement[],
  nodeIds: string[],
  customIconMap?: Map<string, string>
): void {
  if (nodeIds.length === 0) return;

  cy.batch(() => {
    for (const nodeId of nodeIds) {
      const cyEl = cy.getElementById(nodeId);
      if (cyEl.empty()) continue;

      const reactExtraData = findReactExtraData(elements, 'nodes', nodeId);
      const reactNodeData = findReactNodeData(elements, nodeId);
      if (reactExtraData === undefined && !reactNodeData) continue;

      // Update extraData on the Cytoscape element
      if (reactExtraData !== undefined) {
        cyEl.data('extraData', reactExtraData || {});
      }

      // Extract and apply visual properties
      const visualProps = extractNodeVisualProps(reactExtraData, reactNodeData);
      applyNodeVisualProps(cyEl, visualProps, customIconMap);
    }
  });
}

/**
 * Update extraData and classes for specific edges in Cytoscape without full reload
 * This is critical for real-time traffic stats updates and link state visualization
 */
function updateEdgeExtraData(cy: Core, elements: CyElement[], edgeIds: string[]): void {
  if (edgeIds.length === 0) return;

  cy.batch(() => {
    for (const edgeId of edgeIds) {
      const cyEl = cy.getElementById(edgeId);
      if (cyEl.empty()) continue;

      const reactExtraData = findReactExtraData(elements, 'edges', edgeId);
      if (reactExtraData !== undefined) {
        // Update extraData on the Cytoscape element
        cyEl.data('extraData', reactExtraData || {});
      }

      // Sync classes (link-up/link-down) for edge state visualization
      const reactClasses = findReactEdgeClasses(elements, edgeId);
      if (reactClasses !== undefined) {
        const cyClasses = cyEl.classes().join(' ');
        if (reactClasses !== cyClasses) {
          // Clear existing classes and apply new ones
          cyEl.classes(reactClasses);
        }
      }
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
 * Set up layoutstop listener to mark layout as done and optionally sync positions
 */
function setupLayoutstopListener(
  cy: Core,
  onInitialLayoutPositions?: (positions: NodePositions) => void
): void {
  cy.one('layoutstop', () => {
    cy.scratch('initialLayoutDone', true);
    if (onInitialLayoutPositions) {
      onInitialLayoutPositions(collectNodePositions(cy));
    }
  });
}

/**
 * Run COSE layout for elements without preset positions
 */
function runInitialCoseLayout(
  cy: Core,
  onInitialLayoutPositions?: (positions: NodePositions) => void
): void {
  log.info('[useElementsUpdate] Running COSE layout for elements without positions');
  setupLayoutstopListener(cy, onInitialLayoutPositions);
  cy.layout(getLayoutOptions('cose')).run();
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

function shouldApplyVisualProps(
  visualProps: NodeVisualProps,
  role: string,
  customIconMap?: Map<string, string>
): boolean {
  return visualProps.iconColor !== undefined ||
    visualProps.iconCornerRadius !== undefined ||
    Boolean(customIconMap?.has(role));
}

function applyVisualPropsForElement(
  cy: Core,
  reactEl: CyElement,
  customIconMap?: Map<string, string>
): void {
  if (reactEl.group !== 'nodes') return;
  const id = getElementId(reactEl);
  if (!id) return;
  const cyEl = cy.getElementById(id);
  if (cyEl.empty()) return;

  const reactData = reactEl.data as Record<string, unknown>;
  const reactExtraData = reactData.extraData as Record<string, unknown> | undefined;
  const visualProps = extractNodeVisualProps(reactExtraData, reactData);
  const role = (visualProps.topoViewerRole as string) || (reactData.topoViewerRole as string) || 'default';
  if (!shouldApplyVisualProps(visualProps, role, customIconMap)) return;

  applyNodeVisualProps(cyEl, { ...visualProps, topoViewerRole: role }, customIconMap);
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

function addMissingNodes(
  cy: Core,
  elements: CyElement[],
  fallbackPosition: { x: number; y: number },
  customIconMap?: Map<string, string>
): void {
  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    const id = getElementId(el);
    if (!id) continue;
    if (cy.getElementById(id).nonempty()) continue;
    const position = el.position ?? fallbackPosition;
    cy.add({ group: 'nodes', data: el.data, position, classes: el.classes });
    applyVisualPropsForElement(cy, el, customIconMap);
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

/**
 * Update elements when structure is the same (fast path)
 * @param customIconMap - Map of custom icon names to their data URIs
 */
function updateSameStructure(
  cy: Core,
  elements: CyElement[],
  customIconMap?: Map<string, string>
): void {
  const nodesWithChangedExtraData = getElementsWithChangedExtraData(cy, elements, 'nodes');
  const edgesWithChangedExtraData = getElementsWithChangedExtraData(cy, elements, 'edges');
  const edgesWithChangedClasses = getEdgesWithChangedClasses(cy, elements);

  // Merge edge IDs that need updating (extraData or classes changes)
  const edgesToUpdate = [...new Set([...edgesWithChangedExtraData, ...edgesWithChangedClasses])];

  updateNodeExtraData(cy, elements, nodesWithChangedExtraData, customIconMap);
  updateEdgeExtraData(cy, elements, edgesToUpdate);

  // Check visual data BEFORE updating - comparison needs pre-update state
  const needsStubClassUpdate = hasVisualDataChanged(cy, elements);
  cy.batch(() => updateElementData(cy, elements));
  if (needsStubClassUpdate) {
    applyStubLinkClasses(cy);
  }
}

function reconcileStructure(cy: Core, elements: CyElement[], customIconMap?: Map<string, string>): void {
  const reactById = indexElementsById(elements);
  const reactIds = new Set(reactById.keys());
  const fallbackPosition = getFallbackPosition(cy);

  cy.batch(() => {
    removeUnknownElements(cy, reactIds);
    addMissingNodes(cy, elements, fallbackPosition, customIconMap);
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
function handleRenameInPlace(
  cy: Core,
  oldId: string,
  newId: string,
  elements: CyElement[],
  customIconMap?: Map<string, string>
): void {
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

  applyVisualPropsForElement(cy, newNodeEl, customIconMap);
}

/**
 * Handle initialization when Cytoscape already has elements from initCytoscape.
 * Returns true if initialization is complete and no further processing needed.
 */
function handleAlreadyInitialized(
  cy: Core,
  elements: CyElement[],
  usePresetLayout: boolean,
  onInitialLayoutPositions?: (positions: NodePositions) => void
): boolean {
  const alreadySynced = structureMatches(cy, elements);

  if (alreadySynced) {
    // First initialization after mount - Cytoscape and React state match
    log.info(`[useElementsUpdate] Cytoscape already initialized with ${cy.nodes().length} nodes`);

    // Check if layout was already handled by cy.ready() in CytoscapeCanvas
    const layoutDone = cy.scratch('initialLayoutDone') as boolean | undefined;
    if (layoutDone) {
      log.info('[useElementsUpdate] Layout already done, skipping');
      return true;
    }

    // Run COSE if no preset positions OR all nodes are at origin (fallback check)
    const needsAutoLayout = !usePresetLayout || nodesNeedAutoLayout(cy);
    if (needsAutoLayout) {
      runInitialCoseLayout(cy, onInitialLayoutPositions);
    } else {
      cy.scratch('initialLayoutDone', true);
    }
    return true; // Done, no reconcile needed
  }

  // Cytoscape has elements but they don't match React state.
  // This happens when elements changed before isInitializedRef was set.
  log.info(`[useElementsUpdate] Cytoscape needs reconcile: cy=${cy.nodes().length + cy.edges().length}, react=${elements.length}`);
  return false; // Need to reconcile
}

/**
 * Handle first initialization when Cytoscape has no elements yet.
 * @param customIcons - Custom icons to use for rendering
 */
function handleFirstInit(
  cy: Core,
  elements: CyElement[],
  _usePresetLayout: boolean,
  onInitialLayoutPositions?: (positions: NodePositions) => void,
  customIcons?: CustomIconInfo[]
): void {
  log.info(`[useElementsUpdate] First init: hasPresetPositions=${_usePresetLayout}, elements=${elements.length}`);
  // Pass the callback to updateCytoscapeElements so positions are synced after any auto-layout
  updateCytoscapeElements(cy, elements, customIcons, onInitialLayoutPositions);
}

/**
 * Hook for updating elements when they change
 * Uses useLayoutEffect to ensure updates complete before other effects (like useSelectionData) read data
 *
 * Design: React state is the source of truth for graph structure and element data.
 * Cytoscape is treated as a rendering layer that is incrementally reconciled from state
 * to preserve positions, zoom, and selection whenever possible.
 *
 * @param customIcons - Custom icons to use for rendering nodes
 */
export function useElementsUpdate(
  cyRef: React.RefObject<Core | null>,
  elements: CyElement[],
  onInitialLayoutPositions?: (positions: NodePositions) => void,
  customIcons?: CustomIconInfo[]
): void {
  const isInitializedRef = useRef(false);

  // Memoize custom icon map to prevent unnecessary re-renders
  const customIconMap = useMemo(() => {
    if (!customIcons || customIcons.length === 0) return undefined;
    return new Map(customIcons.map(icon => [icon.name, icon.dataUri]));
  }, [customIcons]);

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
      const cyHasElements = cy.nodes().length > 0;
      const usePresetLayout = hasPresetPositions(elements);

      if (cyHasElements) {
        const initComplete = handleAlreadyInitialized(cy, elements, usePresetLayout, onInitialLayoutPositions);
        isInitializedRef.current = true;
        if (initComplete) return;
        // Fall through to reconcile logic below
      } else {
        handleFirstInit(cy, elements, usePresetLayout, onInitialLayoutPositions, customIcons);
        isInitializedRef.current = true;
        return;
      }
    }

    // Keep Cytoscape in sync with React state without full resets:
    // 1) If structure matches, only update changed data/extraData (fast path).
    // 2) Otherwise reconcile missing/extra elements incrementally (preserves positions).
    const isSameStructure = structureMatches(cy, elements);

    // Handle node rename in-place (preserves position + connected edges).
    const rename = detectRename(cy, elements);
    if (rename) {
      handleRenameInPlace(cy, rename.oldId, rename.newId, elements, customIconMap);
    }

    if (isSameStructure) {
      updateSameStructure(cy, elements, customIconMap);
      return;
    }

    reconcileStructure(cy, elements, customIconMap);
    // After reconciling a significant structure change (e.g., file switch),
    // update initialLayoutDone based on whether the new elements have preset positions.
    if (hasPresetPositions(elements)) {
      cy.scratch('initialLayoutDone', true);
    }
  }, [cyRef, elements, customIcons, customIconMap]);
}
