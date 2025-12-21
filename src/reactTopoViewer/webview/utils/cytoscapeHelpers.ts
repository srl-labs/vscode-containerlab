/**
 * Cytoscape helper functions with proper typing.
 * These helpers provide type-safe access to element data.
 */

import type { CyElement } from '../../shared/types/topology';

/**
 * Node data properties from CyElement.data
 */
export interface CyNodeData {
  id: string;
  label?: string;
  name?: string;
  kind?: string;
  type?: string;
  image?: string;
  parent?: string;
  [key: string]: unknown;
}

/**
 * Edge data properties from CyElement.data
 */
export interface CyEdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  [key: string]: unknown;
}

/**
 * Type guard to check if an element is a node
 */
export function isNodeElement(el: CyElement): boolean {
  return el.group === 'nodes';
}

/**
 * Type guard to check if an element is an edge
 */
export function isEdgeElement(el: CyElement): boolean {
  return el.group === 'edges';
}

/**
 * Get typed node data from a CyElement
 */
export function getNodeData(el: CyElement): CyNodeData {
  return el.data as CyNodeData;
}

/**
 * Get typed edge data from a CyElement
 */
export function getEdgeData(el: CyElement): CyEdgeData {
  return el.data as CyEdgeData;
}

/**
 * Get element ID from data (works for both nodes and edges)
 */
export function getElementId(el: CyElement): string | undefined {
  return (el.data as { id?: string }).id;
}

/**
 * Get edge source node ID
 */
export function getEdgeSource(el: CyElement): string | undefined {
  return (el.data as { source?: string }).source;
}

/**
 * Get edge target node ID
 */
export function getEdgeTarget(el: CyElement): string | undefined {
  return (el.data as { target?: string }).target;
}
