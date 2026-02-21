/**
 * Hook to track used custom icons and trigger reconciliation when usage changes.
 * This ensures custom icons used by nodes are copied to the workspace .clab-icons/ folder.
 */
import { useEffect, useRef } from "react";

import { extractUsedCustomIcons } from "../../../shared/types/icons";
import { getRecordUnknown } from "../../../shared/utilities/typeHelpers";
import { sendIconReconcile } from "../../messaging/extensionMessaging";
import { useGraphStore } from "../../stores/graphStore";

interface IconUsageEntry {
  id: string;
  topoViewerRole: string | null;
}

function selectIconUsageEntries(state: {
  nodes: Array<{ id: string; data?: unknown }>;
}): IconUsageEntry[] {
  const entries: IconUsageEntry[] = [];
  for (const node of state.nodes) {
    const data = getRecordUnknown(node.data);
    const extraData = getRecordUnknown(data?.extraData) ?? {};
    const role = data?.role;
    const fallbackRole = extraData.topoViewerRole;
    let topoViewerRole: string | null = null;
    if (typeof role === "string" && role.length > 0) {
      topoViewerRole = role;
    } else if (typeof fallbackRole === "string" && fallbackRole.length > 0) {
      topoViewerRole = fallbackRole;
    }
    entries.push({ id: node.id, topoViewerRole });
  }
  return entries;
}

function areIconUsageEntriesEqual(left: IconUsageEntry[], right: IconUsageEntry[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i].id !== right[i].id || left[i].topoViewerRole !== right[i].topoViewerRole) {
      return false;
    }
  }
  return true;
}

/**
 * Tracks custom icons used by nodes and triggers reconciliation when usage changes.
 * Reconciliation copies used icons from global (~/.clab/icons/) to workspace (.clab-icons/).
 *
 * Subscribes only to icon-relevant node fields so drag position updates do not trigger work.
 */
export function useIconReconciliation(): void {
  const iconUsageEntries = useGraphStore(selectIconUsageEntries, areIconUsageEntriesEqual);
  const prevUsedIconsRef = useRef<string[]>([]);

  useEffect(() => {
    const usedIcons = extractUsedCustomIcons(
      iconUsageEntries.map((entry) => ({
        data: { topoViewerRole: entry.topoViewerRole ?? undefined },
      }))
    );
    const prevUsedIcons = prevUsedIconsRef.current;

    // Check if the set of used icons has changed
    const usedSet = new Set(usedIcons);
    const prevSet = new Set(prevUsedIcons);
    const hasChanged =
      usedIcons.length !== prevUsedIcons.length ||
      usedIcons.some((icon) => !prevSet.has(icon)) ||
      prevUsedIcons.some((icon) => !usedSet.has(icon));

    if (hasChanged && iconUsageEntries.length > 0) {
      prevUsedIconsRef.current = usedIcons;
      // Trigger icon reconciliation on extension side
      sendIconReconcile(usedIcons);
    }
  }, [iconUsageEntries]);
}
