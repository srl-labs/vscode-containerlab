export function calculateGroupBoundsFromNodes(
  selectedNodes: Array<{
    id: string;
    position: { x: number; y: number };
    measured?: { width?: number; height?: number };
  }>,
  padding: number
): { position: { x: number; y: number }; width: number; height: number; members: string[] } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const members: string[] = [];

  for (const node of selectedNodes) {
    const nodeWidth = node.measured?.width ?? 100;
    const nodeHeight = node.measured?.height ?? 100;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + nodeWidth);
    maxY = Math.max(maxY, node.position.y + nodeHeight);
    members.push(node.id);
  }

  return {
    position: { x: minX - padding, y: minY - padding },
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    members
  };
}

export function calculateDefaultGroupPosition(viewport: { x: number; y: number; zoom: number }): {
  position: { x: number; y: number };
  width: number;
  height: number;
  members: string[];
} {
  return {
    position: { x: -viewport.x / viewport.zoom + 200, y: -viewport.y / viewport.zoom + 200 },
    width: 300,
    height: 200,
    members: []
  };
}

export function handleAnnotationNodeDrop(
  nodeId: string,
  targetGroupId: string | null,
  annotationList: Array<{ id: string; groupId?: string }>,
  updateFn: (id: string, updates: { groupId?: string }) => void
): void {
  const annotation = annotationList.find((a) => a.id === nodeId);
  const currentGroupId = annotation?.groupId ?? null;
  if (currentGroupId !== targetGroupId) {
    updateFn(nodeId, { groupId: targetGroupId ?? undefined });
  }
}

export function handleTopologyNodeDrop(
  nodeId: string,
  targetGroupId: string | null,
  currentGroupId: string | null,
  addToGroup: (nodeId: string, groupId: string) => void,
  removeFromGroup: (nodeId: string) => void
): void {
  if (currentGroupId === targetGroupId) return;

  if (targetGroupId !== null && targetGroupId.length > 0) {
    addToGroup(nodeId, targetGroupId);
  } else {
    removeFromGroup(nodeId);
  }
}
