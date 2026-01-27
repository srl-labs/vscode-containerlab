/**
 * Test fixtures for undo/redo hook tests
 *
 * Note: The useUndoRedo hook API was significantly changed during the ReactFlow migration.
 * The new API uses captureSnapshot/commitChange instead of pushAction.
 * This file provides sample data for tests.
 */
import type { TopoNode, TopoEdge } from "../../../../src/reactTopoViewer/shared/types/graph";
import type {
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../../../src/reactTopoViewer/shared/types/topology";

// ============================================================================
// Sample ReactFlow Elements
// ============================================================================

const TOPOLOGY_NODE_TYPE = "topology-node";

export const sampleNodes: TopoNode[] = [
  {
    id: "node1",
    type: TOPOLOGY_NODE_TYPE,
    position: { x: 100, y: 100 },
    data: { label: "Router1", role: "pe", kind: "nokia_srlinux" }
  },
  {
    id: "node2",
    type: TOPOLOGY_NODE_TYPE,
    position: { x: 200, y: 200 },
    data: { label: "Router2", role: "pe", kind: "nokia_srlinux" }
  },
  {
    id: "node3",
    type: TOPOLOGY_NODE_TYPE,
    position: { x: 300, y: 300 },
    data: { label: "Client1", role: "client", kind: "linux" }
  }
];

export const sampleEdges: TopoEdge[] = [
  {
    id: "e1",
    source: "node1",
    target: "node2",
    type: "topology-edge",
    data: { sourceEndpoint: "e1-1", targetEndpoint: "e1-1" }
  },
  {
    id: "e2",
    source: "node2",
    target: "node3",
    type: "topology-edge",
    data: { sourceEndpoint: "e1-2", targetEndpoint: "eth1" }
  }
];

// ============================================================================
// Sample Position Data
// ============================================================================

export interface NodePositionEntry {
  id: string;
  position: { x: number; y: number };
}

export const samplePositionsBefore: NodePositionEntry[] = [
  { id: "node1", position: { x: 100, y: 100 } },
  { id: "node2", position: { x: 200, y: 200 } }
];

export const samplePositionsAfter: NodePositionEntry[] = [
  { id: "node1", position: { x: 150, y: 150 } },
  { id: "node2", position: { x: 250, y: 250 } }
];

// ============================================================================
// Sample Annotations
// ============================================================================

export const sampleFreeShape: FreeShapeAnnotation = {
  id: "shape1",
  shapeType: "rectangle",
  position: { x: 50, y: 50 },
  width: 100,
  height: 80,
  fillColor: "#ff0000",
  fillOpacity: 0.5,
  borderColor: "#000000",
  borderWidth: 2
};

export const sampleGroup: GroupStyleAnnotation = {
  id: "group1",
  name: "Spine",
  level: "1",
  position: { x: 100, y: 100 },
  width: 300,
  height: 200,
  backgroundColor: "#e0e0e0",
  borderColor: "#333333"
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Deep clones an object (for creating isolated test data)
 */
export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
