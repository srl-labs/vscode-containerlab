import * as vscode from "vscode";

import * as events from "../services/containerlabEvents";
import * as fallback from "../services/containerlabInspectFallback";
import type { ClabInterfaceSnapshot } from "../types/containerlab";

import type * as c from "./common";

export let rawInspectData: Record<string, c.ClabDetailedJSON[]> | undefined;

// Track if we've fallen back to polling due to events not being available
let forcedPollingMode = false;

/**
 * Check if we should use polling mode (fallback) instead of events
 */
export function isPollingMode(): boolean {
    if (forcedPollingMode) {
        return true;
    }
    const config = vscode.workspace.getConfiguration("containerlab");
    return config.get<string>("refreshMode", "events") === "polling";
}

/**
 * Check if interface stats are enabled
 */
export function isInterfaceStatsEnabled(): boolean {
    const config = vscode.workspace.getConfiguration("containerlab");
    return config.get<boolean>("enableInterfaceStats", true);
}

/**
 * Check if events were available or we had to fall back
 */
export function isUsingForcedPolling(): boolean {
    return forcedPollingMode;
}

export async function update(): Promise<void> {
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");
    const preferPolling = config.get<string>("refreshMode", "events") === "polling";

    // If user explicitly wants polling, or we've been forced into polling mode
    if (preferPolling || forcedPollingMode) {
        await updateWithPolling(runtime);
        return;
    }

    // Try events first, fall back to polling if it fails
    try {
        console.log("[inspector]:\tUpdating inspect data via events stream");
        const start = Date.now();

        await events.ensureEventStream(runtime);
        rawInspectData = events.getGroupedContainers();

        const duration = (Date.now() - start) / 1000;
        const labsCount = rawInspectData ? Object.keys(rawInspectData).length : 0;
        console.log(`[inspector]:\tUpdated inspect data for ${labsCount} labs in ${duration.toFixed(3)} seconds.`);
    } catch (err) {
        // Events failed - likely "Unknown command" error
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[inspector]:\tEvents stream failed: ${errorMsg}`);
        console.log("[inspector]:\tFalling back to polling mode");

        // Mark that we've been forced into polling mode
        forcedPollingMode = true;

        // Use polling fallback
        await updateWithPolling(runtime);
    }
}

async function updateWithPolling(runtime: string): Promise<void> {
    console.log("[inspector]:\tUpdating inspect data via polling fallback");
    const start = Date.now();

    await fallback.ensureFallback(runtime);
    rawInspectData = fallback.getGroupedContainers();

    const duration = (Date.now() - start) / 1000;
    const labsCount = rawInspectData ? Object.keys(rawInspectData).length : 0;
    console.log(`[inspector]:\tUpdated inspect data for ${labsCount} labs in ${duration.toFixed(3)} seconds (polling).`);
}

export function getInterfacesSnapshot(containerShortId: string, containerName: string): ClabInterfaceSnapshot[] {
    if (isPollingMode()) {
        // Use fallback's interface fetching via containerlab inspect interfaces
        return fallback.getInterfaceSnapshot(containerShortId, containerName);
    }
    return events.getInterfaceSnapshot(containerShortId, containerName);
}

export function getInterfaceVersion(containerShortId: string): number {
    if (isPollingMode()) {
        // Fallback doesn't track versions
        return fallback.getInterfaceVersion(containerShortId);
    }
    return events.getInterfaceVersion(containerShortId);
}

export function refreshFromEventStream(): void {
    if (isPollingMode()) {
        rawInspectData = fallback.getGroupedContainers();
    } else {
        rawInspectData = events.getGroupedContainers();
    }
}

/**
 * Reset forced polling mode (for testing or reconfiguration)
 */
export function resetForcedPollingMode(): void {
    forcedPollingMode = false;
}
