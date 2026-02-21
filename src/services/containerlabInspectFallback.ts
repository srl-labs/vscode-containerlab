/**
 * Fallback data provider using `containerlab inspect` polling.
 *
 * This module provides an alternative to the event-based system for fetching
 * container and lab data. It polls containerlab inspect at configurable intervals.
 *
 * This is a temporary fallback that can be easily removed once the event system
 * is stable and widely available.
 */

import { promisify } from "util";
import { exec, execFileSync } from "child_process";

import * as vscode from "vscode";

import { containerlabBinaryPath, outputChannel } from "../globals";
import type { ClabDetailedJSON } from "../treeView/common";
import type { ClabInterfaceSnapshot, ClabInterfaceSnapshotEntry } from "../types/containerlab";

const execAsync = promisify(exec);

// Internal state
let rawInspectData: Record<string, ClabDetailedJSON[]> | undefined;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

// Listeners for data changes
type DataListener = () => void;
const dataListeners = new Set<DataListener>();
let dataChangedTimer: ReturnType<typeof setTimeout> | null = null;
const DATA_NOTIFY_DELAY_MS = 50;

// Default polling interval (ms)
const DEFAULT_POLL_INTERVAL_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isClabDetailedJSON(value: unknown): value is ClabDetailedJSON {
  if (!isRecord(value)) return false;
  return (
    isStringArray(value.Names) &&
    typeof value.ID === "string" &&
    typeof value.ShortID === "string" &&
    typeof value.Image === "string" &&
    typeof value.State === "string" &&
    typeof value.Status === "string" &&
    isRecord(value.Labels)
  );
}

function isClabDetailedArray(value: unknown): value is ClabDetailedJSON[] {
  return Array.isArray(value) && value.every((entry) => isClabDetailedJSON(entry));
}

function parseInspectDataJson(stdout: string): Record<string, ClabDetailedJSON[]> | undefined {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) return undefined;
  const result: Record<string, ClabDetailedJSON[]> = {};
  for (const [labName, value] of Object.entries(parsed)) {
    if (!isClabDetailedArray(value)) return undefined;
    result[labName] = value;
  }
  return result;
}

function isClabInspectInterfaceEntry(
  value: unknown
): value is ClabInspectInterfaceJSON["interfaces"][number] {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.state === "string" &&
    typeof value.alias === "string" &&
    typeof value.mac === "string" &&
    typeof value.mtu === "number" &&
    typeof value.ifindex === "number"
  );
}

function isClabInspectInterfaceJSON(value: unknown): value is ClabInspectInterfaceJSON {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    Array.isArray(value.interfaces) &&
    value.interfaces.every((entry) => isClabInspectInterfaceEntry(entry))
  );
}

function getArrayMetadataString<T>(items: T[], key: string): string | undefined {
  const metadataValue = Object.entries(items).find(([entryKey]) => entryKey === key)?.[1];
  return typeof metadataValue === "string" && metadataValue.length > 0 ? metadataValue : undefined;
}

function scheduleDataChanged(): void {
  if (dataListeners.size === 0) {
    return;
  }
  if (dataChangedTimer) {
    return;
  }
  dataChangedTimer = setTimeout(() => {
    dataChangedTimer = null;
    for (const listener of Array.from(dataListeners)) {
      try {
        listener();
      } catch (err) {
        console.error(
          `[containerlabInspectFallback]: Failed to notify listener: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }, DATA_NOTIFY_DELAY_MS);
}

/**
 * Fetch lab data using containerlab inspect command
 */
async function fetchInspectData(
  runtime: string
): Promise<Record<string, ClabDetailedJSON[]> | undefined> {
  const cmd = `${containerlabBinaryPath} inspect -r ${runtime} --all --details --format json 2>/dev/null`;

  try {
    const { stdout } = await execAsync(cmd);
    if (!stdout) {
      return undefined;
    }
    return parseInspectDataJson(stdout);
  } catch (err) {
    console.error(
      `[containerlabInspectFallback]: Failed to run inspect: ${err instanceof Error ? err.message : String(err)}`
    );
    return undefined;
  }
}

/**
 * Check if containers in a lab have changed
 */
function hasLabChanged(
  oldContainers: ClabDetailedJSON[],
  newContainers: ClabDetailedJSON[]
): boolean {
  if (oldContainers.length !== newContainers.length) {
    return true;
  }

  for (const newContainer of newContainers) {
    const oldContainer = oldContainers.find((c) => c.ShortID === newContainer.ShortID);
    if (!oldContainer || oldContainer.State !== newContainer.State) {
      return true;
    }
  }

  return false;
}

/**
 * Compare two data sets to detect changes
 */
function hasDataChanged(
  oldData: Record<string, ClabDetailedJSON[]> | undefined,
  newData: Record<string, ClabDetailedJSON[]> | undefined
): boolean {
  if (!oldData && !newData) {
    return false;
  }
  if (!oldData || !newData) {
    return true;
  }

  const oldLabs = Object.keys(oldData);
  const newLabs = Object.keys(newData);

  if (oldLabs.length !== newLabs.length) {
    return true;
  }

  for (const labName of newLabs) {
    if (!Object.prototype.hasOwnProperty.call(oldData, labName)) {
      return true;
    }

    if (hasLabChanged(oldData[labName], newData[labName])) {
      return true;
    }
  }

  return false;
}

/**
 * Poll for updates
 */
async function pollOnce(runtime: string): Promise<void> {
  const newData = await fetchInspectData(runtime);

  if (hasDataChanged(rawInspectData, newData)) {
    rawInspectData = newData;
    scheduleDataChanged();
  }
}

/**
 * Start polling for lab data
 */
export function startPolling(runtime: string, intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void {
  if (isPolling) {
    return;
  }

  isPolling = true;
  outputChannel.debug(
    `[containerlabInspectFallback] Starting polling with ${intervalMs}ms interval`
  );

  // Initial fetch
  void pollOnce(runtime);

  // Set up polling interval
  pollingInterval = setInterval(() => {
    void pollOnce(runtime);
  }, intervalMs);
}

/**
 * Stop polling
 */
export function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isPolling = false;
  outputChannel.debug("[containerlabInspectFallback] Stopped polling");
}

/**
 * Get the current grouped containers data
 */
export function getGroupedContainers(): Record<string, ClabDetailedJSON[]> {
  return rawInspectData ?? {};
}

/**
 * Force an immediate update
 */
export async function forceUpdate(runtime: string): Promise<void> {
  const newData = await fetchInspectData(runtime);
  rawInspectData = newData;
  scheduleDataChanged();
}

/**
 * Ensure the fallback is running (similar API to ensureEventStream)
 */
export async function ensureFallback(runtime: string): Promise<void> {
  const config = vscode.workspace.getConfiguration("containerlab");
  const pollInterval = config.get<number>("pollInterval", DEFAULT_POLL_INTERVAL_MS);

  if (!isPolling) {
    startPolling(runtime, pollInterval);
  }

  // Do an initial fetch and wait for it
  await forceUpdate(runtime);
}

/**
 * Register a listener for data changes
 */
export function onDataChanged(listener: DataListener): () => void {
  dataListeners.add(listener);
  return () => {
    dataListeners.delete(listener);
  };
}

/**
 * Reset for testing
 */
export function resetForTests(): void {
  stopPolling();
  rawInspectData = undefined;
  dataListeners.clear();
  interfaceCache.clear();
  if (dataChangedTimer) {
    clearTimeout(dataChangedTimer);
    dataChangedTimer = null;
  }
}

// Interface cache: key is `labPath::containerName`, value is cached interfaces
const interfaceCache = new Map<
  string,
  {
    timestamp: number;
    interfaces: ClabInterfaceSnapshot[];
  }
>();
const INTERFACE_CACHE_TTL_MS = 5000;

/**
 * Raw interface data from containerlab inspect interfaces
 */
interface ClabInspectInterfaceJSON {
  name: string;
  interfaces: Array<{
    name: string;
    type: string;
    state: string;
    alias: string;
    mac: string;
    mtu: number;
    ifindex: number;
  }>;
}

/**
 * Find the lab path for a container by looking through rawInspectData
 */
function findLabPathForContainer(containerName: string): string | undefined {
  if (!rawInspectData) {
    return undefined;
  }

  for (const labContainers of Object.values(rawInspectData)) {
    const container = labContainers.find((c) => c.Names[0] === containerName);
    if (container) {
      // The topo-file is stored as a property on the array
      return (
        getArrayMetadataString(labContainers, "topo-file") ?? container.Labels["clab-topo-file"]
      );
    }
  }
  return undefined;
}

/**
 * Fetch interface data for a container using containerlab inspect interfaces
 */
function fetchInterfacesSync(labPath: string, containerName: string): ClabInspectInterfaceJSON[] {
  try {
    const clabStdout = execFileSync(
      containerlabBinaryPath,
      ["inspect", "interfaces", "-t", labPath, "-f", "json", "-n", containerName],
      { stdio: ["pipe", "pipe", "ignore"], timeout: 10000 }
    ).toString();
    const parsed: unknown = JSON.parse(clabStdout);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => isClabInspectInterfaceJSON(entry));
  } catch (err) {
    console.error(
      `[containerlabInspectFallback]: Failed to fetch interfaces for ${containerName}: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }
}

/**
 * Convert raw interface data to snapshot format
 */
function toInterfaceSnapshot(raw: ClabInspectInterfaceJSON[]): ClabInterfaceSnapshot[] {
  if (raw.length === 0) {
    return [];
  }

  return raw.map((item) => ({
    name: item.name,
    interfaces: item.interfaces.map(
      (iface) =>
        ({
          name: iface.name,
          type: iface.type || "",
          state: iface.state || "",
          alias: iface.alias || "",
          mac: iface.mac || "",
          mtu: iface.mtu || 0,
          ifindex: iface.ifindex || 0,
        }) as ClabInterfaceSnapshotEntry
    ),
  }));
}

/**
 * Get interface snapshot for a container (fallback implementation)
 */
export function getInterfaceSnapshot(
  _containerShortId: string,
  containerName: string
): ClabInterfaceSnapshot[] {
  // Find the lab path for this container
  const labPath = findLabPathForContainer(containerName);
  if (labPath === undefined || labPath.length === 0) {
    console.warn(
      `[containerlabInspectFallback]: Could not find lab path for container ${containerName}`
    );
    return [];
  }

  const cacheKey = `${labPath}::${containerName}`;
  const cached = interfaceCache.get(cacheKey);

  // Return cached data if still valid
  if (cached && Date.now() - cached.timestamp < INTERFACE_CACHE_TTL_MS) {
    return cached.interfaces;
  }

  // Fetch fresh data
  const rawInterfaces = fetchInterfacesSync(labPath, containerName);
  const interfaces = toInterfaceSnapshot(rawInterfaces);

  // Update cache
  interfaceCache.set(cacheKey, {
    timestamp: Date.now(),
    interfaces,
  });

  return interfaces;
}

/**
 * Get interface version (always 0 for fallback since we don't track versions)
 */
export function getInterfaceVersion(_containerShortId: string): number {
  return 0;
}
