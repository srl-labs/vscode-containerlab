/**
 * Group membership helpers for applying nodeAnnotations to GraphContext nodes.
 */
import type { TopoNode } from "../../shared/types/graph";
import type { GroupStyleAnnotation, NodeAnnotation } from "../../shared/types/topology";
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
  if (annotation.groupId) return annotation.groupId;
  if (!annotation.group) return null;
  const legacy = annotation.group;
  if (lookup.ids.has(legacy)) return legacy;
  return lookup.nameToId.get(legacy) ?? null;
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
    if (groupId) {
      membership.set(annotation.id, groupId);
    }
  }

  if (membership.size === 0) return nodes;

  return nodes.map((node) => {
    if (isAnnotationNodeType(node.type)) return node;
    const groupId = membership.get(node.id);
    if (!groupId) return node;
    const data = node.data as Record<string, unknown> | undefined;
    return {
      ...node,
      data: { ...(data ?? {}), groupId }
    };
  });
}
