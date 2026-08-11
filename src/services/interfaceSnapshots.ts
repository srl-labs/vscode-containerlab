import type { ClabInterfaceSnapshot, ClabInterfaceSnapshotEntry } from "../types/containerlab";

function interfacesMatch(
  inspected: ClabInterfaceSnapshotEntry,
  live: ClabInterfaceSnapshotEntry
): boolean {
  if (inspected.name === live.name) {
    return true;
  }

  const inspectedNames = new Set([inspected.name, inspected.alias].filter(Boolean));
  return [live.name, live.alias].some((name) => name !== "" && inspectedNames.has(name));
}

/**
 * Prefer `containerlab inspect interfaces` metadata while preserving live
 * event data such as traffic counters and netem state. Inspect resolves a
 * topology interface to its host-side tools interface when one exists.
 */
export function mergeInterfaceSnapshots(
  inspectedSnapshots: ClabInterfaceSnapshot[],
  liveSnapshots: ClabInterfaceSnapshot[]
): ClabInterfaceSnapshot[] {
  if (inspectedSnapshots.length === 0) {
    return liveSnapshots;
  }
  if (liveSnapshots.length === 0) {
    return inspectedSnapshots;
  }

  return inspectedSnapshots.map((inspectedSnapshot) => {
    const liveSnapshot =
      liveSnapshots.find((snapshot) => snapshot.name === inspectedSnapshot.name) ??
      liveSnapshots[0];
    const unmatchedLive = new Set(liveSnapshot.interfaces);

    const interfaces = inspectedSnapshot.interfaces.map((inspectedInterface) => {
      const liveInterface = liveSnapshot.interfaces.find((candidate) =>
        interfacesMatch(inspectedInterface, candidate)
      );
      if (!liveInterface) {
        return inspectedInterface;
      }

      unmatchedLive.delete(liveInterface);
      return { ...liveInterface, ...inspectedInterface };
    });

    interfaces.push(...unmatchedLive);
    return { ...liveSnapshot, ...inspectedSnapshot, interfaces };
  });
}
