/**
 * Snapshot-based Undo/Redo Hook
 *
 * Stores before/after snapshots for a set of graph entities (nodes/edges)
 * plus optional edge annotation snapshots. All mutations should capture
 * a snapshot before applying changes, then commit the change with a description.
 */
import React, { useCallback, useMemo, useReducer, useRef } from "react";
import type { Node, Edge } from "@xyflow/react";

import type { EdgeAnnotation } from "../../../shared/types/topology";
import { log } from "../../utils/logger";

// ============================================================================
// Snapshot Types
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
  /** Optional explicit node rename hints (oldId -> newId) */
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

// ============================================================================
// Undo/Redo State
// ============================================================================

interface UndoRedoState {
  past: UndoRedoSnapshot[];
  future: UndoRedoSnapshot[];
}

type UndoRedoReducerAction =
  | { type: "PUSH"; snapshot: UndoRedoSnapshot }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "CLEAR" }
  | { type: "PUSH_BATCH"; snapshots: UndoRedoSnapshot[] };

const MAX_HISTORY_SIZE = 50;

const initialState: UndoRedoState = {
  past: [],
  future: []
};

// ============================================================================
// Helpers
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

function mergeSnapshots(snapshots: UndoRedoSnapshot[]): UndoRedoSnapshot {
  const nodeMap = new Map<string, SnapshotEntry<NodeSnapshot>>();
  const edgeMap = new Map<string, SnapshotEntry<EdgeSnapshot>>();
  let edgeAnnotationsBefore: EdgeAnnotation[] | undefined;
  let edgeAnnotationsAfter: EdgeAnnotation[] | undefined;
  const meta: SnapshotMeta = {};

  for (const snapshot of snapshots) {
    for (const entry of snapshot.nodes) {
      const existing = nodeMap.get(entry.id);
      if (!existing) {
        nodeMap.set(entry.id, { id: entry.id, before: entry.before, after: entry.after });
      } else {
        if (existing.before === undefined) existing.before = entry.before;
        existing.after = entry.after;
      }
    }

    for (const entry of snapshot.edges) {
      const existing = edgeMap.get(entry.id);
      if (!existing) {
        edgeMap.set(entry.id, { id: entry.id, before: entry.before, after: entry.after });
      } else {
        if (existing.before === undefined) existing.before = entry.before;
        existing.after = entry.after;
      }
    }

    if (snapshot.edgeAnnotations) {
      if (!edgeAnnotationsBefore) edgeAnnotationsBefore = snapshot.edgeAnnotations.before;
      edgeAnnotationsAfter = snapshot.edgeAnnotations.after;
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
      edgeAnnotationsBefore || edgeAnnotationsAfter
        ? { before: edgeAnnotationsBefore ?? [], after: edgeAnnotationsAfter ?? [] }
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
// Public API
// ============================================================================

export interface UseUndoRedoOptions {
  enabled?: boolean;
  getNodes: () => Node[];
  getEdges: () => Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  getEdgeAnnotations?: () => EdgeAnnotation[];
  setEdgeAnnotations?: (annotations: EdgeAnnotation[]) => void;
  onPersistSnapshot?: (snapshot: UndoRedoSnapshot, direction: "undo" | "redo") => void;
  onBeginBatch?: () => void;
  onEndBatch?: () => void;
}

/** Options for commitChange */
export interface CommitChangeOptions {
  /** Whether to persist the change (default: true) */
  persist?: boolean;
  /** Explicit nodes to use as "after" state (bypasses stale ref for new nodes) */
  explicitNodes?: Node[];
  /** Explicit edges to use as "after" state (bypasses stale ref for new edges) */
  explicitEdges?: Edge[];
}

export interface UseUndoRedoReturn {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  captureSnapshot: (options?: CaptureSnapshotOptions) => SnapshotCapture;
  commitChange: (
    before: SnapshotCapture,
    description: string,
    options?: CommitChangeOptions
  ) => void;
  beginBatch: () => void;
  endBatch: () => void;
  isInBatch: () => boolean;
}

function undoRedoReducer(state: UndoRedoState, action: UndoRedoReducerAction): UndoRedoState {
  switch (action.type) {
    case "PUSH":
      return { past: addToPastWithLimit(state.past, action.snapshot), future: [] };
    case "PUSH_BATCH": {
      if (action.snapshots.length === 0) return state;
      if (action.snapshots.length === 1) {
        return { past: addToPastWithLimit(state.past, action.snapshots[0]), future: [] };
      }
      const merged = mergeSnapshots(action.snapshots);
      return { past: addToPastWithLimit(state.past, merged), future: [] };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      const last = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), future: [last, ...state.future] };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return { past: [...state.past, next], future: state.future.slice(1) };
    }
    case "CLEAR":
      return initialState;
    default:
      return state;
  }
}

export function useUndoRedo(options: UseUndoRedoOptions): UseUndoRedoReturn {
  const {
    enabled = true,
    getNodes,
    getEdges,
    setNodes,
    setEdges,
    getEdgeAnnotations,
    setEdgeAnnotations,
    onPersistSnapshot,
    onBeginBatch,
    onEndBatch
  } = options;

  const [state, dispatch] = useReducer(undoRedoReducer, initialState);

  const isBatchingRef = useRef(false);
  const batchSnapshotsRef = useRef<UndoRedoSnapshot[]>([]);
  const batchPersistRef = useRef(true);

  const canUndo = enabled && state.past.length > 0;
  const canRedo = enabled && state.future.length > 0;

  const captureSnapshot = useCallback(
    (opts?: CaptureSnapshotOptions): SnapshotCapture => {
      const nodes = getNodes();
      const edges = getEdges();

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

      const edgeAnnotationsBefore = opts?.includeEdgeAnnotations
        ? (getEdgeAnnotations?.() ?? [])
        : undefined;

      return {
        nodeIds,
        edgeIds,
        nodesBefore,
        edgesBefore,
        edgeAnnotationsBefore,
        meta: opts?.meta
      };
    },
    [getNodes, getEdges, getEdgeAnnotations]
  );

  const commitChange = useCallback(
    (before: SnapshotCapture, description: string, options?: CommitChangeOptions) => {
      if (!enabled) return;

      const nodes = getNodes();
      const edges = getEdges();
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
        // Use explicit node if provided, otherwise look in current state
        const explicitNode = explicitNodeMap?.get(id);
        const afterEntry = explicitNode
          ? toNodeSnapshot(explicitNode)
          : nodeMap.has(id)
            ? toNodeSnapshot(nodeMap.get(id) as Node)
            : null;
        return { id, before: beforeEntry, after: afterEntry };
      });

      const edgesEntries = before.edgeIds.map((id) => {
        const beforeEntry = before.edgesBefore.find((entry) => entry.id === id)?.before ?? null;
        // Use explicit edge if provided, otherwise look in current state
        const explicitEdge = explicitEdgeMap?.get(id);
        const afterEntry = explicitEdge
          ? toEdgeSnapshot(explicitEdge)
          : edgeMap.has(id)
            ? toEdgeSnapshot(edgeMap.get(id) as Edge)
            : null;
        return { id, before: beforeEntry, after: afterEntry };
      });

      const snapshot: UndoRedoSnapshot = {
        type: "snapshot",
        description,
        nodes: nodesEntries,
        edges: edgesEntries,
        edgeAnnotations:
          before.edgeAnnotationsBefore !== undefined && getEdgeAnnotations
            ? { before: before.edgeAnnotationsBefore, after: getEdgeAnnotations() }
            : undefined,
        meta: before.meta,
        timestamp: Date.now()
      };

      if (!hasSnapshotChanges(snapshot)) {
        log.info("[UndoRedo] No changes detected, skipping snapshot");
        return;
      }

      const shouldPersist = options?.persist !== false;

      if (isBatchingRef.current) {
        batchSnapshotsRef.current.push(snapshot);
        if (shouldPersist) {
          batchPersistRef.current = true;
        }
        log.info(`[UndoRedo] Collected snapshot in batch: ${description}`);
        return;
      }

      dispatch({ type: "PUSH", snapshot });
      log.info(`[UndoRedo] Committed snapshot: ${description}`);
      if (onPersistSnapshot && shouldPersist) {
        onPersistSnapshot(snapshot, "redo");
      }
    },
    [enabled, getNodes, getEdges, getEdgeAnnotations, onPersistSnapshot]
  );

  const applySnapshot = useCallback(
    (snapshot: UndoRedoSnapshot, direction: "undo" | "redo") => {
      const useBefore = direction === "undo";
      setNodes((currentNodes) => applyNodeSnapshotEntries(currentNodes, snapshot.nodes, useBefore));
      setEdges((currentEdges) => applyEdgeSnapshotEntries(currentEdges, snapshot.edges, useBefore));
      if (snapshot.edgeAnnotations && setEdgeAnnotations) {
        setEdgeAnnotations(
          useBefore ? snapshot.edgeAnnotations.before : snapshot.edgeAnnotations.after
        );
      }
      if (onPersistSnapshot) {
        onPersistSnapshot(snapshot, direction);
      }
    },
    [setNodes, setEdges, setEdgeAnnotations, onPersistSnapshot]
  );

  const undo = useCallback(() => {
    if (!canUndo) return;
    const snapshot = state.past[state.past.length - 1];
    applySnapshot(snapshot, "undo");
    dispatch({ type: "UNDO" });
  }, [canUndo, state.past, applySnapshot]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const snapshot = state.future[0];
    applySnapshot(snapshot, "redo");
    dispatch({ type: "REDO" });
  }, [canRedo, state.future, applySnapshot]);

  const clearHistory = useCallback(() => {
    dispatch({ type: "CLEAR" });
    log.info("[UndoRedo] History cleared");
  }, []);

  const beginBatch = useCallback(() => {
    if (isBatchingRef.current) {
      log.warn("[UndoRedo] Already in batch mode");
      return;
    }
    isBatchingRef.current = true;
    batchSnapshotsRef.current = [];
    batchPersistRef.current = false;
    onBeginBatch?.();
    log.info("[UndoRedo] Started batch mode");
  }, [onBeginBatch]);

  const endBatch = useCallback(() => {
    if (!isBatchingRef.current) {
      log.warn("[UndoRedo] Not in batch mode");
      return;
    }
    isBatchingRef.current = false;
    const snapshots = batchSnapshotsRef.current;
    batchSnapshotsRef.current = [];

    if (snapshots.length > 0) {
      dispatch({ type: "PUSH_BATCH", snapshots });
      const merged = snapshots.length === 1 ? snapshots[0] : mergeSnapshots(snapshots);
      if (onPersistSnapshot && batchPersistRef.current) {
        onPersistSnapshot(merged, "redo");
      }
      log.info(`[UndoRedo] Committed batch with ${snapshots.length} snapshot(s)`);
    } else {
      log.info("[UndoRedo] Batch ended with no snapshots");
    }

    onEndBatch?.();
  }, [onEndBatch]);

  const isInBatch = useCallback(() => isBatchingRef.current, []);

  return useMemo(
    () => ({
      canUndo,
      canRedo,
      undoCount: state.past.length,
      redoCount: state.future.length,
      undo,
      redo,
      clearHistory,
      captureSnapshot,
      commitChange,
      beginBatch,
      endBatch,
      isInBatch
    }),
    [
      canUndo,
      canRedo,
      state.past.length,
      state.future.length,
      undo,
      redo,
      clearHistory,
      captureSnapshot,
      commitChange,
      beginBatch,
      endBatch,
      isInBatch
    ]
  );
}
