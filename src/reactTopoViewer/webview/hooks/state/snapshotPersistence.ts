/**
 * Snapshot persistence helpers
 *
 * Applies snapshot changes to the persistence layer (YAML + annotations JSON).
 * This is used for both forward changes (commit) and undo/redo.
 */
import type { Node } from "@xyflow/react";

import type { TopologyEdgeData } from "../../../shared/types/graph";
import type { NodeSaveData, LinkSaveData, NetworkNodeData } from "../../services";
import {
  beginBatch,
  endBatch,
  createNode,
  editNode,
  deleteNode,
  createLink,
  editLink,
  deleteLink,
  createNetworkNode,
  saveNodePositions,
  saveFreeTextAnnotations,
  saveFreeShapeAnnotations,
  saveGroupStyleAnnotations,
  saveNodeGroupMembership
} from "../../services";
import { isAnnotationNodeType, nodesToAnnotations } from "../../utils/annotationNodeConverters";
import { log } from "../../utils/logger";

import type { UndoRedoSnapshot, NodeSnapshot, EdgeSnapshot } from "./useUndoRedo";

// ============================================================================
// Constants and helpers
// ============================================================================

/** Network types stored in networkNodeAnnotations (not YAML nodes) */
const SPECIAL_NETWORK_TYPES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy"
]);

/** Bridge types stored as YAML nodes */
const BRIDGE_NETWORK_TYPES = new Set(["bridge", "ovs-bridge"]);

/** Properties that fall back to top-level data if not in extraData */
const NODE_FALLBACK_PROPS = [
  "kind",
  "type",
  "image",
  "group",
  "groupId",
  "topoViewerRole",
  "iconColor",
  "iconCornerRadius",
  "interfacePattern"
] as const;

type NodeElementData = Record<string, unknown> & {
  extraData?: Record<string, unknown>;
};

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function isAnnotationSnapshot(node?: NodeSnapshot | null): boolean {
  return Boolean(node?.type && isAnnotationNodeType(node.type));
}

function isNetworkNode(data: Record<string, unknown>): boolean {
  return data.topoViewerRole === "cloud" || data.role === "cloud";
}

function getNetworkType(data: Record<string, unknown>): string | undefined {
  const kind = data.kind;
  if (typeof kind === "string") return kind;
  const nodeType = data.nodeType;
  if (typeof nodeType === "string") return nodeType;
  const extraData = data.extraData as Record<string, unknown> | undefined;
  const extraKind = extraData?.kind;
  if (typeof extraKind === "string") return extraKind;
  return undefined;
}

function mergeNodeExtraData(data: NodeElementData): NodeSaveData["extraData"] {
  const ed = (data.extraData ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = { ...ed };
  for (const key of NODE_FALLBACK_PROPS) {
    if (result[key] === undefined) {
      const topLevelValue = (data as Record<string, unknown>)[key];
      if (topLevelValue !== undefined) {
        result[key] = topLevelValue;
      }
    }
  }
  return result;
}

function toNodeSaveData(node: NodeSnapshot): NodeSaveData {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const name = (data.label as string) || (data.name as string) || node.id;
  return {
    id: node.id,
    name,
    position: node.position,
    extraData: mergeNodeExtraData(data as NodeElementData)
  };
}

function toLinkSaveData(edge: EdgeSnapshot, original?: EdgeSnapshot): LinkSaveData {
  const data = edge.data as TopologyEdgeData | undefined;
  const originalData = original?.data as TopologyEdgeData | undefined;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceEndpoint: data?.sourceEndpoint,
    targetEndpoint: data?.targetEndpoint,
    ...(data?.extraData && { extraData: data.extraData }),
    ...(original && {
      originalSource: original.source,
      originalTarget: original.target,
      originalSourceEndpoint: originalData?.sourceEndpoint,
      originalTargetEndpoint: originalData?.targetEndpoint
    })
  };
}

function getGroupId(node?: NodeSnapshot | null): string | null {
  if (!node?.data) return null;
  const data = node.data as Record<string, unknown>;
  if (typeof data.groupId === "string") return data.groupId;
  const extraData = data.extraData as Record<string, unknown> | undefined;
  if (typeof extraData?.groupId === "string") return extraData.groupId as string;
  return null;
}

function hasPositionChanged(before?: NodeSnapshot | null, after?: NodeSnapshot | null): boolean {
  if (!before || !after) return false;
  return before.position.x !== after.position.x || before.position.y !== after.position.y;
}

function hasDataChanged(before?: NodeSnapshot | null, after?: NodeSnapshot | null): boolean {
  if (!before || !after) return false;
  return stableStringify(before.data) !== stableStringify(after.data);
}

function hasEdgeChanged(before?: EdgeSnapshot | null, after?: EdgeSnapshot | null): boolean {
  if (!before || !after) return false;
  return stableStringify(before) !== stableStringify(after);
}

// ============================================================================
// Persistence Logic
// ============================================================================

interface PersistOptions {
  getNodes: () => Node[];
}

function handleNodeAdd(node: NodeSnapshot): Promise<void> | void {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (isNetworkNode(data)) {
    const networkType = getNetworkType(data);
    if (networkType && BRIDGE_NETWORK_TYPES.has(networkType)) {
      return createNode(toNodeSaveData(node));
    }
    if (networkType && SPECIAL_NETWORK_TYPES.has(networkType)) {
      const networkData: NetworkNodeData = {
        id: node.id,
        label: (data.label as string) || node.id,
        type: networkType as NetworkNodeData["type"],
        position: node.position
      };
      return createNetworkNode(networkData);
    }
    return createNode(toNodeSaveData(node));
  }
  return createNode(toNodeSaveData(node));
}

function handleNodeDelete(node: NodeSnapshot): Promise<void> | void {
  return deleteNode(node.id);
}

function handleNodeEdit(node: NodeSnapshot): Promise<void> | void {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (isNetworkNode(data)) {
    const networkType = getNetworkType(data);
    if (
      networkType &&
      SPECIAL_NETWORK_TYPES.has(networkType) &&
      !BRIDGE_NETWORK_TYPES.has(networkType)
    ) {
      return;
    }
  }
  return editNode(toNodeSaveData(node));
}

function handleEdgeAdd(edge: EdgeSnapshot): Promise<void> | void {
  return createLink(toLinkSaveData(edge));
}

function handleEdgeDelete(edge: EdgeSnapshot): Promise<void> | void {
  return deleteLink(toLinkSaveData(edge));
}

function handleEdgeEdit(edge: EdgeSnapshot, before: EdgeSnapshot): Promise<void> | void {
  return editLink(toLinkSaveData(edge, before));
}

// ============================================================================
// Extracted helpers for persistence operations
// ============================================================================

interface PersistenceContext {
  useBefore: boolean;
  renameIds: Set<string>;
  positionUpdates: Array<{ id: string; position: { x: number; y: number } }>;
  membershipUpdates: Array<{ nodeId: string; groupId: string | null }>;
  annotationsChanged: boolean;
}

/** Convert a NodeSnapshot to a React Flow Node */
function snapshotToNode(snap: NodeSnapshot): Node {
  return {
    id: snap.id,
    type: snap.type,
    position: snap.position,
    data: snap.data ?? {},
    width: snap.width,
    height: snap.height,
    style: snap.style,
    parentId: snap.parentNode
  } as Node;
}

/** Handle node renames to preserve link rewrites */
async function persistNodeRenames(snapshot: UndoRedoSnapshot, useBefore: boolean): Promise<void> {
  const renamePairs = snapshot.meta?.nodeRenames ?? [];
  for (const rename of renamePairs) {
    const fromEntry = snapshot.nodes.find((n) => n.id === rename.from);
    const toEntry = snapshot.nodes.find((n) => n.id === rename.to);
    const beforeNode = useBefore ? toEntry?.after : fromEntry?.before;
    const afterNode = useBefore ? fromEntry?.before : toEntry?.after;
    if (beforeNode && afterNode) {
      const data = (afterNode.data ?? {}) as Record<string, unknown>;
      const name = (data.label as string) || (data.name as string) || afterNode.id;
      const nodeData: NodeSaveData = {
        ...toNodeSaveData(afterNode),
        id: beforeNode.id,
        name
      };
      await editNode(nodeData);
    }
  }
}

/** Handle node creation and return whether it was an annotation */
async function persistNodeCreation(
  to: NodeSnapshot,
  membershipUpdates: Array<{ nodeId: string; groupId: string | null }>
): Promise<boolean> {
  if (isAnnotationSnapshot(to)) {
    return true; // annotationsChanged
  }
  await handleNodeAdd(to);
  const addedGroupId = getGroupId(to);
  if (addedGroupId) {
    membershipUpdates.push({ nodeId: to.id, groupId: addedGroupId });
  }
  return false;
}

/** Handle node deletion and return whether it was an annotation */
async function persistNodeDeletion(from: NodeSnapshot): Promise<boolean> {
  if (isAnnotationSnapshot(from)) {
    return true; // annotationsChanged
  }
  await handleNodeDelete(from);
  return false;
}

/** Track position and membership updates for a node */
function trackNodeUpdates(from: NodeSnapshot, to: NodeSnapshot, ctx: PersistenceContext): void {
  if (hasPositionChanged(from, to)) {
    ctx.positionUpdates.push({ id: to.id, position: to.position });
  }

  const beforeGroupId = getGroupId(from);
  const afterGroupId = getGroupId(to);
  if (beforeGroupId !== afterGroupId) {
    ctx.membershipUpdates.push({ nodeId: to.id, groupId: afterGroupId });
  }
}

/** Process a single node entry and return whether annotations changed */
async function persistSingleNodeEntry(
  from: NodeSnapshot | null | undefined,
  to: NodeSnapshot | null | undefined,
  ctx: PersistenceContext
): Promise<boolean> {
  // Node creation
  if (!from && to) {
    return persistNodeCreation(to, ctx.membershipUpdates);
  }

  // Node deletion
  if (from && !to) {
    return persistNodeDeletion(from);
  }

  // Both null - no change
  if (!from || !to) return false;

  // Annotation update
  if (isAnnotationSnapshot(to)) {
    return true;
  }

  // Regular node update
  trackNodeUpdates(from, to, ctx);
  if (hasDataChanged(from, to)) {
    await handleNodeEdit(to);
  }
  return false;
}

/** Process all node entries in the snapshot */
async function persistNodeChanges(
  snapshot: UndoRedoSnapshot,
  ctx: PersistenceContext
): Promise<void> {
  for (const entry of snapshot.nodes) {
    if (ctx.renameIds.has(entry.id)) continue;
    const from = ctx.useBefore ? entry.after : entry.before;
    const to = ctx.useBefore ? entry.before : entry.after;
    const annotationChanged = await persistSingleNodeEntry(from, to, ctx);
    if (annotationChanged) ctx.annotationsChanged = true;
  }
}

/** Process all edge entries in the snapshot */
async function persistEdgeChanges(snapshot: UndoRedoSnapshot, useBefore: boolean): Promise<void> {
  for (const entry of snapshot.edges) {
    const from = useBefore ? entry.after : entry.before;
    const to = useBefore ? entry.before : entry.after;

    if (!from && to) {
      await handleEdgeAdd(to);
      continue;
    }

    if (from && !to) {
      await handleEdgeDelete(from);
      continue;
    }

    if (!from || !to) continue;

    if (hasEdgeChanged(from, to)) {
      await handleEdgeEdit(to, from);
    }
  }
}

/** Apply position updates in batch */
async function persistPositionUpdates(
  positionUpdates: Array<{ id: string; position: { x: number; y: number } }>
): Promise<void> {
  if (positionUpdates.length > 0) {
    await saveNodePositions(positionUpdates);
  }
}

/** Apply membership updates */
async function persistMembershipUpdates(
  membershipUpdates: Array<{ nodeId: string; groupId: string | null }>
): Promise<void> {
  for (const update of membershipUpdates) {
    await saveNodeGroupMembership(update.nodeId, update.groupId);
  }
}

/** Apply a snapshot entry to the annotation node map */
function applyAnnotationEntry(
  entry: { before?: NodeSnapshot | null; after?: NodeSnapshot | null },
  useBefore: boolean,
  nodeMap: Map<string, Node>
): void {
  const from = useBefore ? entry.after : entry.before;
  const to = useBefore ? entry.before : entry.after;

  if (!isAnnotationSnapshot(from) && !isAnnotationSnapshot(to)) return;

  if (!from && to) {
    // Creation: add node to map
    nodeMap.set(to.id, snapshotToNode(to));
  } else if (from && !to) {
    // Deletion: remove node from map
    nodeMap.delete(from.id);
  } else if (from && to) {
    // Update: use the 'to' state
    nodeMap.set(to.id, snapshotToNode(to));
  }
}

/** Rebuild and persist annotations from snapshot changes */
async function rebuildAnnotationNodes(
  snapshot: UndoRedoSnapshot,
  useBefore: boolean,
  renameIds: Set<string>,
  getNodes: () => Node[]
): Promise<void> {
  const currentAnnotationNodes = getNodes().filter((n) => isAnnotationNodeType(n.type));
  const nodeMap = new Map(currentAnnotationNodes.map((n) => [n.id, n]));

  for (const entry of snapshot.nodes) {
    if (renameIds.has(entry.id)) continue;
    applyAnnotationEntry(entry, useBefore, nodeMap);
  }

  const annotationNodes = Array.from(nodeMap.values());
  const { freeTextAnnotations, freeShapeAnnotations, groups } = nodesToAnnotations(annotationNodes);
  await saveFreeTextAnnotations(freeTextAnnotations);
  await saveFreeShapeAnnotations(freeShapeAnnotations);
  await saveGroupStyleAnnotations(groups);
  log.info(
    `[UndoRedo] Persisted annotations (${freeTextAnnotations.length} text, ${freeShapeAnnotations.length} shape, ${groups.length} groups)`
  );
}

// ============================================================================
// Main export
// ============================================================================

export function persistSnapshotChange(
  snapshot: UndoRedoSnapshot,
  direction: "undo" | "redo",
  options: PersistOptions
): void {
  const useBefore = direction === "undo";
  const renamePairs = snapshot.meta?.nodeRenames ?? [];
  const renameIds = new Set(renamePairs.flatMap((r) => [r.from, r.to]));

  void (async () => {
    beginBatch();
    try {
      const ctx: PersistenceContext = {
        useBefore,
        renameIds,
        positionUpdates: [],
        membershipUpdates: [],
        annotationsChanged: false
      };

      await persistNodeRenames(snapshot, useBefore);
      await persistNodeChanges(snapshot, ctx);
      await persistEdgeChanges(snapshot, useBefore);
      await persistPositionUpdates(ctx.positionUpdates);
      await persistMembershipUpdates(ctx.membershipUpdates);

      if (ctx.annotationsChanged) {
        await rebuildAnnotationNodes(snapshot, useBefore, renameIds, options.getNodes);
      }
    } finally {
      await endBatch();
    }
  })();
}
