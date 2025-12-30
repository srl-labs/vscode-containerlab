export type MembershipUpdateEntry = {
  nodeId: string;
  groupId: string | null;
  groupName?: string;
  groupLevel?: string;
};

type MembershipAnnotation = {
  id: string;
  groupId?: string;
  group?: string;
  level?: string;
};

type MembershipGroupInfo = {
  id: string;
  name: string;
  level: string;
};

export type MembershipAnnotations = {
  nodeAnnotations?: MembershipAnnotation[];
  groupStyleAnnotations?: MembershipGroupInfo[];
};

function resolveMembershipInfo(
  groupLookup: Map<string, MembershipGroupInfo>,
  entry: MembershipUpdateEntry
): { name?: string; level?: string } {
  if (!entry.groupId) {
    return { name: entry.groupName, level: entry.groupLevel };
  }

  const group = groupLookup.get(entry.groupId);
  return {
    name: entry.groupName ?? group?.name,
    level: entry.groupLevel ?? group?.level
  };
}

function upsertMembershipAnnotation(
  nodeAnnotations: MembershipAnnotation[],
  entry: MembershipUpdateEntry,
  resolved: { name?: string; level?: string }
): void {
  const existing = nodeAnnotations.find(n => n.id === entry.nodeId);
  if (existing) {
    existing.groupId = entry.groupId ?? undefined;
    existing.group = resolved.name ?? undefined;
    existing.level = resolved.level ?? undefined;
    return;
  }

  nodeAnnotations.push({
    id: entry.nodeId,
    groupId: entry.groupId ?? undefined,
    group: resolved.name ?? undefined,
    level: resolved.level ?? undefined
  });
}

export function applyMembershipUpdates(
  annotations: MembershipAnnotations,
  entries: MembershipUpdateEntry[]
): void {
  const nodeAnnotations = annotations.nodeAnnotations ?? [];
  if (!annotations.nodeAnnotations) {
    annotations.nodeAnnotations = nodeAnnotations;
  }

  const groupLookup = new Map(
    (annotations.groupStyleAnnotations ?? []).map(g => [g.id, g])
  );

  for (const entry of entries) {
    const resolved = resolveMembershipInfo(groupLookup, entry);
    upsertMembershipAnnotation(nodeAnnotations, entry, resolved);
  }
}
