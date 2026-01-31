/**
 * Layout algorithms for React Flow topology viewer
 */
import type { Node, Edge } from "@xyflow/react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum
} from "d3-force";

/**
 * Node types that participate in layout algorithms
 */
const LAYOUTABLE_NODE_TYPES = ["topology-node", "network-node"];

/**
 * Check if a node should be included in layout
 */
function isLayoutableNode(node: Node): boolean {
  return LAYOUTABLE_NODE_TYPES.includes(node.type || "");
}

function applyPositionMap(nodes: Node[], positions: Map<string, { x: number; y: number }>): Node[] {
  if (positions.size === 0) return nodes;
  return nodes.map((node) => {
    const newPos = positions.get(node.id);
    if (!newPos) return node;
    return {
      ...node,
      position: newPos
    };
  });
}

/**
 * Available layout types
 */
export type LayoutName = "preset" | "force";

/**
 * Layout options
 */
export interface LayoutOptions {
  animate?: boolean;
  padding?: number;
  nodeSpacing?: number;
}

/**
 * D3 simulation node extending SimulationNodeDatum
 */
interface SimNode extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/**
 * D3 simulation link
 */
interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

/**
 * Check if layoutable nodes have preset positions (non-zero coordinates)
 */
export function hasPresetPositions(nodes: Node[]): boolean {
  const layoutNodes = nodes.filter(isLayoutableNode);
  if (layoutNodes.length === 0) return false;
  return layoutNodes.some(
    (node) => node.position && (node.position.x !== 0 || node.position.y !== 0)
  );
}

/**
 * Apply force-directed layout using d3-force
 */
export function applyForceLayout(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  const { padding = 50, nodeSpacing = 100 } = options;

  if (nodes.length === 0) return nodes;

  // Filter out annotation nodes (groups, free text, free shapes)
  const layoutNodes = nodes.filter(isLayoutableNode);

  if (layoutNodes.length === 0) return nodes;

  // Create simulation nodes with deterministic initial positions
  const simNodes: SimNode[] = layoutNodes.map((node, index) => ({
    id: node.id,
    x: node.position.x || (index * 50) % 500,
    y: node.position.y || Math.floor(index / 10) * 50,
    width: 50,
    height: 50
  }));

  // Create simulation links
  const nodeIds = new Set(simNodes.map((n) => n.id));
  const simLinks: SimLink[] = edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({
      source: edge.source,
      target: edge.target
    }));

  // Calculate center
  const centerX = 400;
  const centerY = 300;

  // Create force simulation
  const simulation = forceSimulation<SimNode>(simNodes)
    .force(
      "link",
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(nodeSpacing * 1.5)
        .strength(0.5)
    )
    .force(
      "charge",
      forceManyBody<SimNode>()
        .strength(-300)
        .distanceMax(nodeSpacing * 5)
    )
    .force("center", forceCenter<SimNode>(centerX, centerY))
    .force(
      "collision",
      forceCollide<SimNode>()
        .radius(nodeSpacing / 2)
        .strength(0.7)
    )
    .stop();

  // Run simulation synchronously
  const iterations = 300;
  for (let i = 0; i < iterations; i++) {
    simulation.tick();
  }

  // Create node map for position updates
  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const simNode of simNodes) {
    nodePositions.set(simNode.id, {
      x: simNode.x + padding,
      y: simNode.y + padding
    });
  }

  // Return nodes with updated positions
  return applyPositionMap(nodes, nodePositions);
}

/**
 * Apply layout to nodes
 */
export function applyLayout(
  layoutName: LayoutName,
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  switch (layoutName) {
    case "force":
      return applyForceLayout(nodes, edges, options);
    case "preset":
    default:
      // Preset layout uses existing positions
      return nodes;
  }
}

/**
 * Get layout options for a given layout name
 * (For compatibility with existing code)
 */
export function getLayoutOptions(layoutName: string): { name: string } {
  return { name: layoutName };
}
