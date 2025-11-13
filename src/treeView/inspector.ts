import * as vscode from "vscode";
import * as c from "./common";
import { ensureEventStream, getGroupedContainers, getInterfaceSnapshot, getInterfaceVersion as getInterfaceVersionImpl } from "../services/containerlabEvents";
import type { ClabInterfaceSnapshot } from "../types/containerlab";

export let rawInspectData: Record<string, c.ClabDetailedJSON[]> | undefined;

export async function update(): Promise<void> {
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");

    console.log("[inspector]:\tUpdating inspect data via events stream");
    const start = Date.now();

    await ensureEventStream(runtime);
    rawInspectData = getGroupedContainers();

    const duration = (Date.now() - start) / 1000;
    const labsCount = rawInspectData ? Object.keys(rawInspectData).length : 0;
    console.log(`[inspector]:\tUpdated inspect data for ${labsCount} labs in ${duration.toFixed(3)} seconds.`);
}

export function getInterfacesSnapshot(containerShortId: string, containerName: string): ClabInterfaceSnapshot[] {
    return getInterfaceSnapshot(containerShortId, containerName);
}

export function getInterfaceVersion(containerShortId: string): number {
    return getInterfaceVersionImpl(containerShortId);
}

export function refreshFromEventStream(): void {
    rawInspectData = getGroupedContainers();
}
