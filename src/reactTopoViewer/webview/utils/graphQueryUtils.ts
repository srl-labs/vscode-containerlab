/**
 * Graph Query Utilities
 * Helper functions to query nodes and edges in React Flow graphs.
 */
import type { TopoNode, TopoEdge } from "../../shared/types/graph";

/**
 * Get a node by its ID
 */
export function getNodeById(nodes: TopoNode[], id: string): TopoNode | null {
  return nodes.find((node) => node.id === id) ?? null;
}

/**
 * Check if an edge exists between two nodes (in either direction)
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
 */
export function getConnectedEdges(edges: TopoEdge[], nodeId: string): TopoEdge[] {
  return edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
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
