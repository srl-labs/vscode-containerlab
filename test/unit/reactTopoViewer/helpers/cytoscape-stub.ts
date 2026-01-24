/**
 * Cytoscape stub/mock utilities for testing React TopoViewer hooks
 *
 * NOTE: These stubs replace the real Cytoscape library during the ReactFlow migration.
 * Tests that previously depended on Cytoscape behavior now use these minimal stubs.
 */

/** Element definition for nodes and edges */
export interface ElementDefinition {
  group: "nodes" | "edges";
  data: Record<string, unknown>;
  position?: { x: number; y: number };
}

/** Minimal Cytoscape-like core interface for testing */
export interface MockCore {
  nodes(): MockCollection;
  edges(): MockCollection;
  elements(): MockCollection;
  getElementById(id: string): MockElement;
  batch(fn: () => void): void;
}

/** Minimal Cytoscape-like element interface for testing */
export interface MockElement {
  id(): string;
  data(key?: string): unknown;
  position(pos?: { x: number; y: number }): { x: number; y: number };
  isNode(): boolean;
  isEdge(): boolean;
  length: number;
}

/** Minimal Cytoscape-like collection interface for testing */
export interface MockCollection {
  forEach(fn: (item: MockElement) => void): void;
  length: number;
}

/**
 * Creates a mock Cytoscape-like instance for testing.
 * NOTE: This is a minimal stub - full Cytoscape behavior is not available.
 */
export function createMockCytoscape(elements?: ElementDefinition[]): MockCore {
  const nodeElements: ElementDefinition[] = (elements || []).filter((e) => e.group === "nodes");
  const edgeElements: ElementDefinition[] = (elements || []).filter((e) => e.group === "edges");

  const createMockElement = (def: ElementDefinition): MockElement => ({
    id: () => def.data.id as string,
    data: (key?: string) => (key ? def.data[key] : def.data),
    position: (pos?: { x: number; y: number }) => {
      if (pos && def.position) {
        def.position.x = pos.x;
        def.position.y = pos.y;
      }
      return def.position || { x: 0, y: 0 };
    },
    isNode: () => def.group === "nodes",
    isEdge: () => def.group === "edges",
    length: 1
  });

  const emptyElement: MockElement = {
    id: () => "",
    data: () => undefined,
    position: () => ({ x: 0, y: 0 }),
    isNode: () => false,
    isEdge: () => false,
    length: 0
  };

  return {
    nodes: () => ({
      forEach: (fn: (item: MockElement) => void) => {
        nodeElements.forEach((el) => fn(createMockElement(el)));
      },
      length: nodeElements.length
    }),
    edges: () => ({
      forEach: (fn: (item: MockElement) => void) => {
        edgeElements.forEach((el) => fn(createMockElement(el)));
      },
      length: edgeElements.length
    }),
    elements: () => ({
      forEach: (fn: (item: MockElement) => void) => {
        [...nodeElements, ...edgeElements].forEach((el) => fn(createMockElement(el)));
      },
      length: nodeElements.length + edgeElements.length
    }),
    getElementById: (id: string) => {
      const all = [...nodeElements, ...edgeElements];
      const found = all.find((el) => el.data.id === id);
      return found ? createMockElement(found) : emptyElement;
    },
    batch: (fn: () => void) => fn()
  };
}

/**
 * Creates a test node element definition
 */
export function createTestNode(
  id: string,
  position: { x: number; y: number } = { x: 100, y: 100 },
  extraData: Record<string, unknown> = {}
): ElementDefinition {
  return {
    group: "nodes",
    data: { id, label: id, ...extraData },
    position
  };
}

/**
 * Creates a test edge element definition
 */
export function createTestEdge(
  id: string,
  source: string,
  target: string,
  sourceEndpoint: string = "e1-1",
  targetEndpoint: string = "e1-1",
  extraData: Record<string, unknown> = {}
): ElementDefinition {
  return {
    group: "edges",
    data: { id, source, target, sourceEndpoint, targetEndpoint, ...extraData }
  };
}

/**
 * Creates a mock Cytoscape instance pre-populated with a simple topology
 * (3 nodes in a triangle with edges between them)
 */
export function createSimpleTopology(): MockCore {
  return createMockCytoscape([
    createTestNode("node1", { x: 100, y: 100 }),
    createTestNode("node2", { x: 200, y: 100 }),
    createTestNode("node3", { x: 150, y: 200 }),
    createTestEdge("e1", "node1", "node2", "e1-1", "e1-1"),
    createTestEdge("e2", "node2", "node3", "e1-2", "e1-1"),
    createTestEdge("e3", "node1", "node3", "e1-2", "e1-2")
  ]);
}

/**
 * Gets all node positions from a mock Cytoscape instance
 */
export function getNodePositions(cy: MockCore): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  cy.nodes().forEach((node) => {
    const pos = node.position();
    positions.set(node.id(), { x: Math.round(pos.x), y: Math.round(pos.y) });
  });
  return positions;
}

/**
 * Sets node positions from a map
 */
export function setNodePositions(
  cy: MockCore,
  positions: Map<string, { x: number; y: number }>
): void {
  cy.batch(() => {
    positions.forEach((pos, id) => {
      const node = cy.getElementById(id);
      if (node.length > 0 && node.isNode()) {
        node.position(pos);
      }
    });
  });
}
