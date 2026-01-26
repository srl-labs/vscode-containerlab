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
const LAYOUTABLE_NODE_TYPES = ["topology-node", "cloud-node"];

/**
 * Check if a node should be included in layout
 */
function isLayoutableNode(node: Node): boolean {
  return LAYOUTABLE_NODE_TYPES.includes(node.type || "");
}

/**
 * Available layout types
 */
export type LayoutName = "preset" | "force" | "grid" | "circle" | "cola";

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
 * Check if nodes have preset positions (non-zero coordinates)
 */
export function hasPresetPositions(nodes: Node[]): boolean {
  return nodes.some((node) => node.position && (node.position.x !== 0 || node.position.y !== 0));
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
  return nodes.map((node) => {
    const newPos = nodePositions.get(node.id);
    if (newPos) {
      return {
        ...node,
        position: newPos
      };
    }
    return node;
  });
}

/**
 * Apply grid layout
 */
export function applyGridLayout(nodes: Node[], options: LayoutOptions = {}): Node[] {
  const { padding = 50, nodeSpacing = 120 } = options;

  if (nodes.length === 0) return nodes;

  // Filter out annotation nodes
  const layoutNodes = nodes.filter(isLayoutableNode);

  if (layoutNodes.length === 0) return nodes;

  // Calculate grid dimensions
  const cols = Math.ceil(Math.sqrt(layoutNodes.length));

  // Create position map
  const nodePositions = new Map<string, { x: number; y: number }>();

  layoutNodes.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    nodePositions.set(node.id, {
      x: padding + col * nodeSpacing,
      y: padding + row * nodeSpacing
    });
  });

  // Return nodes with updated positions
  return nodes.map((node) => {
    const newPos = nodePositions.get(node.id);
    if (newPos) {
      return {
        ...node,
        position: newPos
      };
    }
    return node;
  });
}

/**
 * Apply circle layout
 */
export function applyCircleLayout(nodes: Node[], options: LayoutOptions = {}): Node[] {
  const { padding = 100 } = options;

  if (nodes.length === 0) return nodes;

  // Filter out annotation nodes
  const layoutNodes = nodes.filter(isLayoutableNode);

  if (layoutNodes.length === 0) return nodes;

  // Calculate circle parameters
  const radius = Math.max(150, layoutNodes.length * 30);
  const centerX = radius + padding;
  const centerY = radius + padding;
  const angleStep = (2 * Math.PI) / layoutNodes.length;

  // Create position map
  const nodePositions = new Map<string, { x: number; y: number }>();

  layoutNodes.forEach((node, index) => {
    const angle = index * angleStep - Math.PI / 2; // Start from top
    nodePositions.set(node.id, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  });

  // Return nodes with updated positions
  return nodes.map((node) => {
    const newPos = nodePositions.get(node.id);
    if (newPos) {
      return {
        ...node,
        position: newPos
      };
    }
    return node;
  });
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
    case "cola": // Cola layout uses d3-force as fallback
      return applyForceLayout(nodes, edges, options);
    case "grid":
      return applyGridLayout(nodes, options);
    case "circle":
      return applyCircleLayout(nodes, options);
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
