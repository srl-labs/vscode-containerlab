/**
 * undoRedoStore - Zustand store for undo/redo state management
 *
 * Stores before/after snapshots for graph entities (nodes/edges)
 * plus optional edge annotation snapshots. All mutations should capture
 * a snapshot before applying changes, then commit the change with a description.
 *
 * This store reads from graphStore and topoViewerStore via getState() for snapshots.
 */
import { create } from "zustand";
import type { Node, Edge } from "@xyflow/react";

import type { EdgeAnnotation } from "../../shared/types/topology";
import { log } from "../utils/logger";
import { useGraphStore } from "./graphStore";
import { useTopoViewerStore } from "./topoViewerStore";

// ============================================================================
// Snapshot Types (same as useUndoRedo hook)
// ============================================================================

export interface NodeSnapshot {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data?: Node["data"];
  width?: number;
  height?: number;
  style?: Node["style"];
  className?: string;
  zIndex?: number;
  parentNode?: string;
  extent?: Node["extent"];
  draggable?: boolean;
  selectable?: boolean;
  hidden?: boolean;
}

export interface EdgeSnapshot {
  id: string;
  source: string;
  target: string;
  data?: Edge["data"];
  type?: string;
  label?: Edge["label"];
  style?: Edge["style"];
  className?: string;
  markerStart?: Edge["markerStart"];
  markerEnd?: Edge["markerEnd"];
  animated?: boolean;
}

export interface SnapshotEntry<T> {
  id: string;
  before?: T | null;
  after?: T | null;
}

export interface SnapshotMeta {
  nodeRenames?: Array<{ from: string; to: string }>;
}

export interface UndoRedoSnapshot {
  type: "snapshot";
  description: string;
  nodes: SnapshotEntry<NodeSnapshot>[];
  edges: SnapshotEntry<EdgeSnapshot>[];
  edgeAnnotations?: { before: EdgeAnnotation[]; after: EdgeAnnotation[] };
  meta?: SnapshotMeta;
  timestamp: number;
}

export interface SnapshotCapture {
  nodeIds: string[];
  edgeIds: string[];
  nodesBefore: SnapshotEntry<NodeSnapshot>[];
  edgesBefore: SnapshotEntry<EdgeSnapshot>[];
  edgeAnnotationsBefore?: EdgeAnnotation[];
  meta?: SnapshotMeta;
}

export interface CaptureSnapshotOptions {
  nodeIds?: string[];
  edgeIds?: string[];
  includeAll?: boolean;
  includeEdgeAnnotations?: boolean;
  meta?: SnapshotMeta;
}

export interface CommitChangeOptions {
  persist?: boolean;
  explicitNodes?: Node[];
  explicitEdges?: Edge[];
}

// ============================================================================
// Store State & Actions
// ============================================================================

interface UndoRedoState {
  past: UndoRedoSnapshot[];
  future: UndoRedoSnapshot[];
  isBatching: boolean;
  batchSnapshots: UndoRedoSnapshot[];
  batchPersist: boolean;
  enabled: boolean;
}

interface UndoRedoActions {
  setEnabled: (enabled: boolean) => void;
  captureSnapshot: (options?: CaptureSnapshotOptions) => SnapshotCapture;
  commitChange: (
    before: SnapshotCapture,
    description: string,
    options?: CommitChangeOptions
  ) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  beginBatch: () => void;
  endBatch: () => void;
  isInBatch: () => boolean;
}

export type UndoRedoStore = UndoRedoState &
  UndoRedoActions & {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  };

// ============================================================================
// Constants
// ============================================================================

const MAX_HISTORY_SIZE = 50;

// ============================================================================
// Helper Functions
// ============================================================================

function toNodeSnapshot(node: Node): NodeSnapshot {
  return {
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    data: node.data,
    width: node.width,
    height: node.height,
    style: node.style,
    className: node.className,
    zIndex: node.zIndex,
    parentNode: node.parentId,
    extent: node.extent,
    draggable: node.draggable,
    selectable: node.selectable,
    hidden: node.hidden
  };
}

function toEdgeSnapshot(edge: Edge): EdgeSnapshot {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data: edge.data,
    type: edge.type,
    label: edge.label,
    style: edge.style,
    className: edge.className,
    markerStart: edge.markerStart,
    markerEnd: edge.markerEnd,
    animated: edge.animated
  };
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function isSnapshotEqual<T>(a: T | null | undefined, b: T | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return stableStringify(a) === stableStringify(b);
}

function hasSnapshotChanges(snapshot: UndoRedoSnapshot): boolean {
  for (const entry of snapshot.nodes) {
    if (!isSnapshotEqual(entry.before, entry.after)) return true;
  }
  for (const entry of snapshot.edges) {
    if (!isSnapshotEqual(entry.before, entry.after)) return true;
  }
  if (snapshot.edgeAnnotations) {
    if (!isSnapshotEqual(snapshot.edgeAnnotations.before, snapshot.edgeAnnotations.after))
      return true;
  }
  return false;
}

function addToPastWithLimit(
  past: UndoRedoSnapshot[],
  snapshot: UndoRedoSnapshot
): UndoRedoSnapshot[] {
  const next = [...past, snapshot];
  if (next.length > MAX_HISTORY_SIZE) next.shift();
  return next;
}

function mergeEntry<T>(map: Map<string, SnapshotEntry<T>>, entry: SnapshotEntry<T>): void {
  const existing = map.get(entry.id);
  if (!existing) {
    map.set(entry.id, { id: entry.id, before: entry.before, after: entry.after });
  } else {
    if (existing.before === undefined) existing.before = entry.before;
    existing.after = entry.after;
  }
}

function mergeSnapshots(snapshots: UndoRedoSnapshot[]): UndoRedoSnapshot {
  const nodeMap = new Map<string, SnapshotEntry<NodeSnapshot>>();
  const edgeMap = new Map<string, SnapshotEntry<EdgeSnapshot>>();
  let annotationsBefore: EdgeAnnotation[] | undefined;
  let annotationsAfter: EdgeAnnotation[] | undefined;
  const meta: SnapshotMeta = {};

  for (const snapshot of snapshots) {
    for (const entry of snapshot.nodes) mergeEntry(nodeMap, entry);
    for (const entry of snapshot.edges) mergeEntry(edgeMap, entry);
    if (snapshot.edgeAnnotations) {
      if (!annotationsBefore) annotationsBefore = snapshot.edgeAnnotations.before;
      annotationsAfter = snapshot.edgeAnnotations.after;
    }
    if (snapshot.meta?.nodeRenames) {
      meta.nodeRenames = [...(meta.nodeRenames ?? []), ...snapshot.meta.nodeRenames];
    }
  }

  return {
    type: "snapshot",
    description: snapshots[snapshots.length - 1]?.description ?? "Batch change",
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    edgeAnnotations:
      annotationsBefore || annotationsAfter
        ? { before: annotationsBefore ?? [], after: annotationsAfter ?? [] }
        : undefined,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
    timestamp: Date.now()
  };
}

function mergeNodeSnapshot(current: Node | undefined, target: NodeSnapshot): Node {
  const base = current ?? (target as Node);
  const merged: Node = {
    ...base,
    ...target,
    data: target.data ?? {}
  };

  if (current) {
    merged.selected = current.selected;
    merged.dragging = current.dragging;
    merged.measured = current.measured;
  }

  return merged;
}

function mergeEdgeSnapshot(current: Edge | undefined, target: EdgeSnapshot): Edge {
  const base = current ?? (target as Edge);
  const merged: Edge = {
    ...base,
    ...target,
    data: target.data
  };

  if (current) {
    merged.selected = current.selected;
    merged.animated = current.animated;
  }

  return merged;
}

function applyNodeSnapshotEntries(
  currentNodes: Node[],
  entries: SnapshotEntry<NodeSnapshot>[],
  useBefore: boolean
): Node[] {
  const currentMap = new Map(currentNodes.map((n) => [n.id, n]));
  const existingOrder = currentNodes.map((n) => n.id);
  const addedOrder: string[] = [];

  for (const entry of entries) {
    const target = useBefore ? entry.before : entry.after;
    if (!target) {
      currentMap.delete(entry.id);
      continue;
    }

    const merged = mergeNodeSnapshot(currentMap.get(entry.id), target);
    if (!currentMap.has(entry.id)) {
      addedOrder.push(entry.id);
    }
    currentMap.set(entry.id, merged);
  }

  const nextNodes: Node[] = [];
  for (const id of existingOrder) {
    const node = currentMap.get(id);
    if (node) nextNodes.push(node);
  }
  for (const id of addedOrder) {
    const node = currentMap.get(id);
    if (node) nextNodes.push(node);
  }

  return nextNodes;
}

function applyEdgeSnapshotEntries(
  currentEdges: Edge[],
  entries: SnapshotEntry<EdgeSnapshot>[],
  useBefore: boolean
): Edge[] {
  const currentMap = new Map(currentEdges.map((e) => [e.id, e]));
  const existingOrder = currentEdges.map((e) => e.id);
  const addedOrder: string[] = [];

  for (const entry of entries) {
    const target = useBefore ? entry.before : entry.after;
    if (!target) {
      currentMap.delete(entry.id);
      continue;
    }

    const merged = mergeEdgeSnapshot(currentMap.get(entry.id), target);
    if (!currentMap.has(entry.id)) {
      addedOrder.push(entry.id);
    }
    currentMap.set(entry.id, merged);
  }

  const nextEdges: Edge[] = [];
  for (const id of existingOrder) {
    const edge = currentMap.get(id);
    if (edge) nextEdges.push(edge);
  }
  for (const id of addedOrder) {
    const edge = currentMap.get(id);
    if (edge) nextEdges.push(edge);
  }

  return nextEdges;
}

// ============================================================================
// Persistence callback type
// ============================================================================

export type PersistSnapshotCallback = (
  snapshot: UndoRedoSnapshot,
  direction: "undo" | "redo"
) => void;

// Global persistence callback (set by message subscription hook)
let persistSnapshotCallback: PersistSnapshotCallback | null = null;

export function setPersistSnapshotCallback(callback: PersistSnapshotCallback | null): void {
  persistSnapshotCallback = callback;
}

// ============================================================================
// Store Creation
// ============================================================================

export const useUndoRedoStore = create<UndoRedoStore>((set, get) => ({
  // Initial state
  past: [],
  future: [],
  isBatching: false,
  batchSnapshots: [],
  batchPersist: false,
  enabled: true,

  // Computed properties (accessed via selectors)
  get canUndo() {
    const state = get();
    return state.enabled && state.past.length > 0;
  },
  get canRedo() {
    const state = get();
    return state.enabled && state.future.length > 0;
  },
  get undoCount() {
    return get().past.length;
  },
  get redoCount() {
    return get().future.length;
  },

  setEnabled: (enabled) => {
    set({ enabled });
  },

  captureSnapshot: (opts) => {
    // Read from graphStore and topoViewerStore
    const { nodes, edges } = useGraphStore.getState();
    const { edgeAnnotations } = useTopoViewerStore.getState();

    const includeAll = opts?.includeAll ?? false;
    const nodeIds = includeAll ? nodes.map((n) => n.id) : (opts?.nodeIds ?? []);
    const edgeIds = includeAll ? edges.map((e) => e.id) : (opts?.edgeIds ?? []);

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const edgeMap = new Map(edges.map((e) => [e.id, e]));

    const nodesBefore = nodeIds.map((id) => ({
      id,
      before: nodeMap.has(id) ? toNodeSnapshot(nodeMap.get(id) as Node) : null
    }));

    const edgesBefore = edgeIds.map((id) => ({
      id,
      before: edgeMap.has(id) ? toEdgeSnapshot(edgeMap.get(id) as Edge) : null
    }));

    const edgeAnnotationsBefore = opts?.includeEdgeAnnotations ? edgeAnnotations : undefined;

    return {
      nodeIds,
      edgeIds,
      nodesBefore,
      edgesBefore,
      edgeAnnotationsBefore,
      meta: opts?.meta
    };
  },

  commitChange: (before, description, options) => {
    const state = get();
    if (!state.enabled) return;

    // Read current state from graphStore and topoViewerStore
    const { nodes, edges } = useGraphStore.getState();
    const { edgeAnnotations } = useTopoViewerStore.getState();

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const edgeMap = new Map(edges.map((e) => [e.id, e]));

    // Build explicit maps for quick lookup
    const explicitNodeMap = options?.explicitNodes
      ? new Map(options.explicitNodes.map((n) => [n.id, n]))
      : null;
    const explicitEdgeMap = options?.explicitEdges
      ? new Map(options.explicitEdges.map((e) => [e.id, e]))
      : null;

    const nodesEntries = before.nodeIds.map((id) => {
      const beforeEntry = before.nodesBefore.find((entry) => entry.id === id)?.before ?? null;
      let afterEntry: NodeSnapshot | null;
      if (explicitNodeMap !== null) {
        const explicitNode = explicitNodeMap.get(id);
        afterEntry = explicitNode ? toNodeSnapshot(explicitNode) : null;
      } else {
        afterEntry = nodeMap.has(id) ? toNodeSnapshot(nodeMap.get(id) as Node) : null;
      }
      return { id, before: beforeEntry, after: afterEntry };
    });

    const edgesEntries = before.edgeIds.map((id) => {
      const beforeEntry = before.edgesBefore.find((entry) => entry.id === id)?.before ?? null;
      let afterEntry: EdgeSnapshot | null;
      if (explicitEdgeMap !== null) {
        const explicitEdge = explicitEdgeMap.get(id);
        afterEntry = explicitEdge ? toEdgeSnapshot(explicitEdge) : null;
      } else {
        afterEntry = edgeMap.has(id) ? toEdgeSnapshot(edgeMap.get(id) as Edge) : null;
      }
      return { id, before: beforeEntry, after: afterEntry };
    });

    const snapshot: UndoRedoSnapshot = {
      type: "snapshot",
      description,
      nodes: nodesEntries,
      edges: edgesEntries,
      edgeAnnotations:
        before.edgeAnnotationsBefore !== undefined
          ? { before: before.edgeAnnotationsBefore, after: edgeAnnotations }
          : undefined,
      meta: before.meta,
      timestamp: Date.now()
    };

    if (!hasSnapshotChanges(snapshot)) {
      log.info("[UndoRedo] No changes detected, skipping snapshot");
      return;
    }

    const shouldPersist = options?.persist !== false;

    if (state.isBatching) {
      set((s) => ({
        batchSnapshots: [...s.batchSnapshots, snapshot],
        batchPersist: s.batchPersist || shouldPersist
      }));
      log.info(`[UndoRedo] Collected snapshot in batch: ${description}`);
      return;
    }

    set((s) => ({
      past: addToPastWithLimit(s.past, snapshot),
      future: []
    }));
    log.info(`[UndoRedo] Committed snapshot: ${description}`);

    if (persistSnapshotCallback && shouldPersist) {
      persistSnapshotCallback(snapshot, "redo");
    }
  },

  undo: () => {
    const state = get();
    if (!state.enabled || state.past.length === 0) return;

    const snapshot = state.past[state.past.length - 1];
    const useBefore = true;

    // Apply snapshot to graphStore
    const {
      nodes: currentNodes,
      edges: currentEdges,
      setNodes,
      setEdges
    } = useGraphStore.getState();
    const nextNodes = applyNodeSnapshotEntries(currentNodes, snapshot.nodes, useBefore);
    const nextEdges = applyEdgeSnapshotEntries(currentEdges, snapshot.edges, useBefore);
    setNodes(nextNodes);
    setEdges(nextEdges);

    // Apply edge annotations to topoViewerStore
    if (snapshot.edgeAnnotations) {
      useTopoViewerStore.getState().setEdgeAnnotations(snapshot.edgeAnnotations.before);
    }

    // Update history
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [snapshot, ...s.future]
    }));

    // Persist
    if (persistSnapshotCallback) {
      persistSnapshotCallback(snapshot, "undo");
    }
  },

  redo: () => {
    const state = get();
    if (!state.enabled || state.future.length === 0) return;

    const snapshot = state.future[0];
    const useBefore = false;

    // Apply snapshot to graphStore
    const {
      nodes: currentNodes,
      edges: currentEdges,
      setNodes,
      setEdges
    } = useGraphStore.getState();
    const nextNodes = applyNodeSnapshotEntries(currentNodes, snapshot.nodes, useBefore);
    const nextEdges = applyEdgeSnapshotEntries(currentEdges, snapshot.edges, useBefore);
    setNodes(nextNodes);
    setEdges(nextEdges);

    // Apply edge annotations to topoViewerStore
    if (snapshot.edgeAnnotations) {
      useTopoViewerStore.getState().setEdgeAnnotations(snapshot.edgeAnnotations.after);
    }

    // Update history
    set((s) => ({
      past: [...s.past, snapshot],
      future: s.future.slice(1)
    }));

    // Persist
    if (persistSnapshotCallback) {
      persistSnapshotCallback(snapshot, "redo");
    }
  },

  clearHistory: () => {
    set({ past: [], future: [] });
    log.info("[UndoRedo] History cleared");
  },

  beginBatch: () => {
    const state = get();
    if (state.isBatching) {
      log.warn("[UndoRedo] Already in batch mode");
      return;
    }
    set({ isBatching: true, batchSnapshots: [], batchPersist: false });
    log.info("[UndoRedo] Started batch mode");
  },

  endBatch: () => {
    const state = get();
    if (!state.isBatching) {
      log.warn("[UndoRedo] Not in batch mode");
      return;
    }

    const snapshots = state.batchSnapshots;
    const shouldPersist = state.batchPersist;

    set({ isBatching: false, batchSnapshots: [], batchPersist: false });

    if (snapshots.length > 0) {
      const merged = snapshots.length === 1 ? snapshots[0] : mergeSnapshots(snapshots);
      set((s) => ({
        past: addToPastWithLimit(s.past, merged),
        future: []
      }));

      if (persistSnapshotCallback && shouldPersist) {
        persistSnapshotCallback(merged, "redo");
      }
      log.info(`[UndoRedo] Committed batch with ${snapshots.length} snapshot(s)`);
    } else {
      log.info("[UndoRedo] Batch ended with no snapshots");
    }
  },

  isInBatch: () => get().isBatching
}));

// ============================================================================
// Selector Hooks (for convenience)
// ============================================================================

/** Get whether undo is available */
export const useCanUndo = () => {
  const enabled = useUndoRedoStore((state) => state.enabled);
  const pastLength = useUndoRedoStore((state) => state.past.length);
  return enabled && pastLength > 0;
};

/** Get whether redo is available */
export const useCanRedo = () => {
  const enabled = useUndoRedoStore((state) => state.enabled);
  const futureLength = useUndoRedoStore((state) => state.future.length);
  return enabled && futureLength > 0;
};

/** Get undo count */
export const useUndoCount = () => useUndoRedoStore((state) => state.past.length);

/** Get redo count */
export const useRedoCount = () => useUndoRedoStore((state) => state.future.length);

/** Get undo/redo actions (stable reference) */
export const useUndoRedoActions = () =>
  useUndoRedoStore((state) => ({
    captureSnapshot: state.captureSnapshot,
    commitChange: state.commitChange,
    undo: state.undo,
    redo: state.redo,
    clearHistory: state.clearHistory,
    beginBatch: state.beginBatch,
    endBatch: state.endBatch,
    isInBatch: state.isInBatch,
    setEnabled: state.setEnabled
  }));
