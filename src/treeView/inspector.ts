import * as vscode from "vscode";

import type { ClabInterfaceSnapshot } from "../types/containerlab";
import { backendHasCapability } from "../backends/types";
import {
  getActiveBackend,
  onActiveBackendContainerStateChanged,
  onActiveBackendDataChanged
} from "../backends/manager";

import type * as c from "./common";

export let rawInspectData: Record<string, c.ClabDetailedJSON[]> | undefined;

export function isPollingMode(): boolean {
  return getActiveBackend().isPollingMode();
}

export function isInterfaceStatsEnabled(): boolean {
  const enabled = vscode.workspace
    .getConfiguration("containerlab")
    .get<boolean>("enableInterfaceStats", true);
  return enabled && backendHasCapability(getActiveBackend(), "interface-stats");
}

export function isUsingForcedPolling(): boolean {
  return getActiveBackend().isPollingMode();
}

export async function update(): Promise<void> {
  const snapshot = await getActiveBackend().refreshRuntimeSnapshot();
  rawInspectData = snapshot.labs;
}

export function getInterfacesSnapshot(
  containerShortId: string,
  containerName: string,
  backendId?: string
): ClabInterfaceSnapshot[] {
  return getActiveBackend().getInterfaceSnapshot(containerShortId, containerName, backendId);
}

export function getInterfaceVersion(containerShortId: string, backendId?: string): number {
  return getActiveBackend().getInterfaceVersion(containerShortId, backendId);
}

export function refreshFromEventStream(): void {
  rawInspectData = getActiveBackend().getRuntimeSnapshot().labs;
}

export function resetForcedPollingMode(): void {
  getActiveBackend().resetPollingMode();
}

export function onDataChanged(listener: () => void): () => void {
  return onActiveBackendDataChanged(listener);
}

export function onContainerStateChanged(
  listener: (containerShortId: string, newState: string, backendId?: string) => void
): () => void {
  return onActiveBackendContainerStateChanged(listener);
}

export function stop(): void {
  getActiveBackend().dispose();
}
