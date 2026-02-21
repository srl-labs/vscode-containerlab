/**
 * Group membership helpers for applying nodeAnnotations to graph store nodes.
 */
import type { Node } from "@xyflow/react";

import type { TopoNode } from "../../shared/types/graph";
import type { GroupStyleAnnotation, NodeAnnotation } from "../../shared/types/topology";
import { getRecordUnknown, getString } from "../../shared/utilities/typeHelpers";

import { isAnnotationNodeType } from "./annotationNodeConverters";

function buildGroupLookup(groups: GroupStyleAnnotation[]): {
  ids: Set<string>;
  nameToId: Map<string, string>;
} {
  const ids = new Set<string>();
  const nameToId = new Map<string, string>();
  for (const group of groups) {
    ids.add(group.id);
    nameToId.set(group.name, group.id);
  }
  return { ids, nameToId };
}

function resolveGroupId(
  annotation: NodeAnnotation,
  lookup: { ids: Set<string>; nameToId: Map<string, string> }
): string | null {
  const groupId = getString(annotation.groupId);
  if (groupId !== undefined && groupId.length > 0) return groupId;

  const legacy = getString(annotation.group);
  if (legacy === undefined || legacy.length === 0) return null;
  if (lookup.ids.has(legacy)) return legacy;
  return lookup.nameToId.get(legacy) ?? null;
}

function withGroupId<T extends TopoNode>(node: T, groupId: string): T {
  return {
    ...node,
    data: {
      ...node.data,
      groupId,
    },
  };
}

export function applyGroupMembershipToNodes(
  nodes: TopoNode[],
  nodeAnnotations: NodeAnnotation[] | undefined,
  groups: GroupStyleAnnotation[]
): TopoNode[] {
  if (!nodeAnnotations || nodeAnnotations.length === 0) return nodes;

  const lookup = buildGroupLookup(groups);
  const membership = new Map<string, string>();

  for (const annotation of nodeAnnotations) {
    const groupId = resolveGroupId(annotation, lookup);
    if (groupId !== null) {
      membership.set(annotation.id, groupId);
    }
  }

  if (membership.size === 0) return nodes;

  return nodes.map((node) => {
    if (isAnnotationNodeType(node.type)) return node;
    const groupId = membership.get(node.id);
    if (groupId === undefined) return node;
    return withGroupId(node, groupId);
  });
}

export interface NodeGroupMembership {
  id: string;
  groupId: string;
}

export function collectNodeGroupMemberships(nodes: Node[]): NodeGroupMembership[] {
  return nodes
    .filter((node) => !isAnnotationNodeType(node.type))
    .map((node) => {
      const data = getRecordUnknown(node.data);
      const groupId = getString(data?.groupId);
      if (groupId === undefined || groupId.length === 0) return null;
      return { id: node.id, groupId };
    })
    .filter((entry): entry is NodeGroupMembership => entry !== null);
}
