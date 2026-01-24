/**
 * Graph Query Utilities
 * Helper functions to query nodes and edges in React Flow graphs.
 * These replace Cytoscape-style queries like cy.getElementById(), cy.edges(), etc.
 */
import type { TopoNode, TopoEdge } from "../../../shared/types/graph";

/**
 * Get a node by its ID
 * Replaces cy.getElementById(id) for nodes
 */
export function getNodeById(nodes: TopoNode[], id: string): TopoNode | null {
  return nodes.find((node) => node.id === id) ?? null;
}

/**
 * Get an edge by its ID
 * Replaces cy.getElementById(id) for edges
 */
export function getEdgeById(edges: TopoEdge[], id: string): TopoEdge | null {
  return edges.find((edge) => edge.id === id) ?? null;
}

/**
 * Check if an edge exists between two nodes (in either direction)
 * Replaces cy.edges('[source = "a"][target = "b"]').nonempty()
 */
export function hasEdgeBetween(edges: TopoEdge[], sourceId: string, targetId: string): boolean {
  return edges.some(
    (edge) =>
      (edge.source === sourceId && edge.target === targetId) ||
      (edge.source === targetId && edge.target === sourceId)
  );
}

/**
 * Get all edges connected to a node (as source or target)
 * Replaces node.connectedEdges()
 */
export function getConnectedEdges(edges: TopoEdge[], nodeId: string): TopoEdge[] {
  return edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
}

/**
 * Get edges where the given node is the source
 * Replaces node.outgoers().edges()
 */
export function getOutgoingEdges(edges: TopoEdge[], nodeId: string): TopoEdge[] {
  return edges.filter((edge) => edge.source === nodeId);
}

/**
 * Get edges where the given node is the target
 * Replaces node.incomers().edges()
 */
export function getIncomingEdges(edges: TopoEdge[], nodeId: string): TopoEdge[] {
  return edges.filter((edge) => edge.target === nodeId);
}

/**
 * Search nodes by a query string (matches id, label, kind, or role)
 * Case-insensitive substring matching
 */
export function searchNodes(nodes: TopoNode[], query: string): TopoNode[] {
  if (!query.trim()) return [];
  const lowerQuery = query.toLowerCase();

  return nodes.filter((node) => {
    // Check node ID
    if (node.id.toLowerCase().includes(lowerQuery)) return true;

    // Check node data properties based on node type
    const data = node.data as Record<string, unknown>;

    // Check label (common to all node types)
    const label = data.label;
    if (typeof label === "string" && label.toLowerCase().includes(lowerQuery)) return true;

    // Check topology-specific fields
    const role = data.role;
    if (typeof role === "string" && role.toLowerCase().includes(lowerQuery)) return true;

    const kind = data.kind;
    if (typeof kind === "string" && kind.toLowerCase().includes(lowerQuery)) return true;

    // Check cloud node type
    const nodeType = data.nodeType;
    if (typeof nodeType === "string" && nodeType.toLowerCase().includes(lowerQuery)) return true;

    return false;
  });
}

/**
 * Find the first node matching a query
 */
export function findNode(nodes: TopoNode[], query: string): TopoNode | null {
  const results = searchNodes(nodes, query);
  return results.length > 0 ? results[0] : null;
}

/**
 * Get all nodes of a specific type
 */
export function getNodesByType(nodes: TopoNode[], type: string): TopoNode[] {
  return nodes.filter((node) => node.type === type);
}

/**
 * Get node position by ID
 */
export function getNodePosition(
  nodes: TopoNode[],
  nodeId: string
): { x: number; y: number } | null {
  const node = getNodeById(nodes, nodeId);
  return node?.position ?? null;
}

/**
 * Get positions for multiple nodes
 */
export function getNodePositions(
  nodes: TopoNode[],
  nodeIds: string[]
): Array<{ id: string; position: { x: number; y: number } }> {
  return nodeIds
    .map((id) => {
      const node = getNodeById(nodes, id);
      if (!node) return null;
      return { id, position: { x: node.position.x, y: node.position.y } };
    })
    .filter((item): item is { id: string; position: { x: number; y: number } } => item !== null);
}

/**
 * Get all node IDs
 */
export function getNodeIds(nodes: TopoNode[]): string[] {
  return nodes.map((node) => node.id);
}

/**
 * Get all edge IDs
 */
export function getEdgeIds(edges: TopoEdge[]): string[] {
  return edges.map((edge) => edge.id);
}

/**
 * Check if a node exists
 */
export function nodeExists(nodes: TopoNode[], nodeId: string): boolean {
  return nodes.some((node) => node.id === nodeId);
}

/**
 * Check if an edge exists
 */
export function edgeExists(edges: TopoEdge[], edgeId: string): boolean {
  return edges.some((edge) => edge.id === edgeId);
}

/**
 * Get the bounding box of selected nodes
 */
export function getNodesBoundingBox(
  nodes: TopoNode[]
): { x: number; y: number; width: number; height: number } | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const { x, y } = node.position;
    const width = node.measured?.width ?? 100;
    const height = node.measured?.height ?? 100;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
