/**
 * Cytoscape stub/mock utilities for testing React TopoViewer hooks
 */
import cytoscape, { Core, ElementDefinition } from 'cytoscape';

/**
 * Creates a headless Cytoscape instance for integration testing.
 * Uses real Cytoscape behavior but without DOM rendering.
 */
export function createMockCytoscape(elements?: ElementDefinition[]): Core {
  return cytoscape({
    headless: true,
    elements: elements || []
  });
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
    group: 'nodes',
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
  sourceEndpoint: string = 'e1-1',
  targetEndpoint: string = 'e1-1',
  extraData: Record<string, unknown> = {}
): ElementDefinition {
  return {
    group: 'edges',
    data: { id, source, target, sourceEndpoint, targetEndpoint, ...extraData }
  };
}

/**
 * Creates a Cytoscape instance pre-populated with a simple topology
 * (3 nodes in a triangle with edges between them)
 */
export function createSimpleTopology(): Core {
  return createMockCytoscape([
    createTestNode('node1', { x: 100, y: 100 }),
    createTestNode('node2', { x: 200, y: 100 }),
    createTestNode('node3', { x: 150, y: 200 }),
    createTestEdge('e1', 'node1', 'node2', 'e1-1', 'e1-1'),
    createTestEdge('e2', 'node2', 'node3', 'e1-2', 'e1-1'),
    createTestEdge('e3', 'node1', 'node3', 'e1-2', 'e1-2')
  ]);
}

/**
 * Gets all node positions from a Cytoscape instance
 */
export function getNodePositions(cy: Core): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  cy.nodes().forEach(node => {
    const pos = node.position();
    positions.set(node.id(), { x: Math.round(pos.x), y: Math.round(pos.y) });
  });
  return positions;
}

/**
 * Sets node positions from a map
 */
export function setNodePositions(cy: Core, positions: Map<string, { x: number; y: number }>): void {
  cy.batch(() => {
    positions.forEach((pos, id) => {
      const node = cy.getElementById(id);
      if (node.length > 0 && node.isNode()) {
        node.position(pos);
      }
    });
  });
}
