/**
 * Test fixtures for undo/redo hook tests
 */
import type {
  NodePositionEntry,
  MembershipEntry,
  UndoRedoActionMove,
  UndoRedoActionGraph,
  UndoRedoActionPropertyEdit,
  UndoRedoActionAnnotation,
  UndoRedoActionGroupMove
} from '../../../../src/reactTopoViewer/webview/hooks/state/useUndoRedo';
import type { CyElement, FreeShapeAnnotation, GroupStyleAnnotation } from '../../../../src/reactTopoViewer/shared/types/topology';

// ============================================================================
// Sample Cytoscape Elements
// ============================================================================

export const sampleNodes: CyElement[] = [
  {
    group: 'nodes',
    data: { id: 'node1', label: 'Router1', kind: 'nokia_srlinux' },
    position: { x: 100, y: 100 }
  },
  {
    group: 'nodes',
    data: { id: 'node2', label: 'Router2', kind: 'nokia_srlinux' },
    position: { x: 200, y: 200 }
  },
  {
    group: 'nodes',
    data: { id: 'node3', label: 'Client1', kind: 'linux' },
    position: { x: 300, y: 300 }
  }
];

export const sampleEdges: CyElement[] = [
  {
    group: 'edges',
    data: { id: 'e1', source: 'node1', target: 'node2', sourceEndpoint: 'e1-1', targetEndpoint: 'e1-1' }
  },
  {
    group: 'edges',
    data: { id: 'e2', source: 'node2', target: 'node3', sourceEndpoint: 'e1-2', targetEndpoint: 'eth1' }
  }
];

// ============================================================================
// Sample Position Entries
// ============================================================================

export const samplePositionsBefore: NodePositionEntry[] = [
  { id: 'node1', position: { x: 100, y: 100 } },
  { id: 'node2', position: { x: 200, y: 200 } }
];

export const samplePositionsAfter: NodePositionEntry[] = [
  { id: 'node1', position: { x: 150, y: 150 } },
  { id: 'node2', position: { x: 250, y: 250 } }
];

// ============================================================================
// Sample Membership Entries
// ============================================================================

export const sampleMembershipBefore: MembershipEntry[] = [
  { nodeId: 'node1', groupId: null },
  { nodeId: 'node2', groupId: 'group1:1' }
];

export const sampleMembershipAfter: MembershipEntry[] = [
  { nodeId: 'node1', groupId: 'group1:1' },
  { nodeId: 'node2', groupId: null }
];

// ============================================================================
// Sample Annotations
// ============================================================================

export const sampleFreeShape: FreeShapeAnnotation = {
  id: 'shape1',
  shapeType: 'rectangle',
  position: { x: 50, y: 50 },
  width: 100,
  height: 80,
  fillColor: '#ff0000',
  fillOpacity: 0.5,
  borderColor: '#000000',
  borderWidth: 2
};

export const sampleGroup: GroupStyleAnnotation = {
  id: 'group1',
  name: 'Spine',
  level: '1',
  position: { x: 100, y: 100 },
  width: 300,
  height: 200,
  backgroundColor: '#e0e0e0',
  borderColor: '#333333'
};

// ============================================================================
// Action Factory Functions
// ============================================================================

/**
 * Creates a move action for testing
 */
export function createMoveAction(
  before: NodePositionEntry[] = samplePositionsBefore,
  after: NodePositionEntry[] = samplePositionsAfter,
  membershipBefore?: MembershipEntry[],
  membershipAfter?: MembershipEntry[]
): UndoRedoActionMove {
  return {
    type: 'move',
    before,
    after,
    membershipBefore,
    membershipAfter
  };
}

/**
 * Creates a graph action for adding a node
 */
export function createGraphAddNodeAction(node: CyElement): UndoRedoActionGraph {
  return {
    type: 'graph',
    before: [{ entity: 'node', kind: 'delete', before: node }],
    after: [{ entity: 'node', kind: 'add', after: node }]
  };
}

/**
 * Creates a graph action for deleting a node (with connected edges)
 */
export function createGraphDeleteNodeAction(
  node: CyElement,
  connectedEdges: CyElement[] = []
): UndoRedoActionGraph {
  return {
    type: 'graph',
    before: [
      { entity: 'node', kind: 'add', after: node },
      ...connectedEdges.map(e => ({ entity: 'edge' as const, kind: 'add' as const, after: e }))
    ],
    after: [{ entity: 'node', kind: 'delete', before: node }]
  };
}

/**
 * Creates a graph action for adding an edge
 */
export function createGraphAddEdgeAction(edge: CyElement): UndoRedoActionGraph {
  return {
    type: 'graph',
    before: [{ entity: 'edge', kind: 'delete', before: edge }],
    after: [{ entity: 'edge', kind: 'add', after: edge }]
  };
}

/**
 * Creates a graph action for deleting an edge
 */
export function createGraphDeleteEdgeAction(edge: CyElement): UndoRedoActionGraph {
  return {
    type: 'graph',
    before: [{ entity: 'edge', kind: 'add', after: edge }],
    after: [{ entity: 'edge', kind: 'delete', before: edge }]
  };
}

/**
 * Creates a property edit action
 */
export function createPropertyEditAction(
  entityType: 'node' | 'link',
  entityId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): UndoRedoActionPropertyEdit {
  return {
    type: 'property-edit',
    entityType,
    entityId,
    before,
    after
  };
}

/**
 * Creates a node rename property edit action
 */
export function createNodeRenameAction(
  originalName: string,
  newName: string,
  otherProps: Record<string, unknown> = {}
): UndoRedoActionPropertyEdit {
  return {
    type: 'property-edit',
    entityType: 'node',
    entityId: originalName,
    before: { name: originalName, ...otherProps },
    after: { name: newName, ...otherProps }
  };
}

/**
 * Creates an annotation action
 */
export function createAnnotationAction(
  annotationType: 'freeText' | 'freeShape' | 'group',
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): UndoRedoActionAnnotation {
  return {
    type: 'annotation',
    annotationType,
    before,
    after
  };
}

/**
 * Creates a free shape creation annotation action
 */
export function createFreeShapeCreationAction(
  shape: FreeShapeAnnotation = sampleFreeShape
): UndoRedoActionAnnotation {
  return createAnnotationAction('freeShape', null, shape as unknown as Record<string, unknown>);
}

/**
 * Creates a free shape deletion annotation action
 */
export function createFreeShapeDeletionAction(
  shape: FreeShapeAnnotation = sampleFreeShape
): UndoRedoActionAnnotation {
  return createAnnotationAction('freeShape', shape as unknown as Record<string, unknown>, null);
}

/**
 * Creates a group creation annotation action
 */
export function createGroupCreationAction(
  group: GroupStyleAnnotation = sampleGroup
): UndoRedoActionAnnotation {
  return createAnnotationAction('group', null, group as unknown as Record<string, unknown>);
}

/**
 * Creates a group move action (compound action for group + member nodes)
 */
export function createGroupMoveAction(
  groupBefore: Record<string, unknown>,
  groupAfter: Record<string, unknown>,
  nodesBefore: NodePositionEntry[] = samplePositionsBefore,
  nodesAfter: NodePositionEntry[] = samplePositionsAfter
): UndoRedoActionGroupMove {
  return {
    type: 'group-move',
    groupBefore,
    groupAfter,
    nodesBefore,
    nodesAfter
  };
}

/**
 * Creates multiple unique move actions for history limit testing
 */
export function createMultipleMoveActions(count: number): UndoRedoActionMove[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'move' as const,
    before: [{ id: `node${i}`, position: { x: i * 10, y: i * 10 } }],
    after: [{ id: `node${i}`, position: { x: i * 10 + 50, y: i * 10 + 50 } }]
  }));
}

/**
 * Deep clones an object (for creating isolated test data)
 */
export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
