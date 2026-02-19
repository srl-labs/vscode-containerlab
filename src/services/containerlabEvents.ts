import type { ChildProcess } from "child_process";
import { spawn } from "child_process";
import * as readline from "readline";

import * as vscode from "vscode";

import type { ClabDetailedJSON } from "../treeView/common";
import type { ClabInterfaceSnapshot, ClabInterfaceSnapshotEntry } from "../types/containerlab";
import { containerlabBinaryPath } from "../globals";

interface ContainerlabEvent {
  timestamp?: string;
  type: string;
  action: string;
  actor_id: string;
  actor_name?: string;
  actor_full_id?: string;
  attributes?: Record<string, unknown>;
}

interface ContainerRecord {
  labName: string;
  topoFile?: string;
  data: ClabDetailedJSON;
}

interface InterfaceRecord {
  ifname: string;
  type: string;
  state: string;
  alias?: string;
  mac?: string;
  mtu?: number;
  ifindex?: number;
  rxBps?: number;
  rxPps?: number;
  rxBytes?: number;
  rxPackets?: number;
  txBps?: number;
  txPps?: number;
  txBytes?: number;
  txPackets?: number;
  statsIntervalSeconds?: number;
  netemDelay?: string;
  netemJitter?: string;
  netemLoss?: string;
  netemRate?: string;
  netemCorruption?: string;
}

const INTERFACE_KEYS: (keyof InterfaceRecord)[] = [
  "ifname",
  "type",
  "state",
  "alias",
  "mac",
  "mtu",
  "ifindex",
  "rxBps",
  "rxPps",
  "rxBytes",
  "rxPackets",
  "txBps",
  "txPps",
  "txBytes",
  "txPackets",
  "statsIntervalSeconds",
  "netemDelay",
  "netemJitter",
  "netemLoss",
  "netemRate",
  "netemCorruption"
];

type MutableInterfaceRecord = InterfaceRecord & { [key: string]: unknown };
type MutableSnapshotEntry = ClabInterfaceSnapshotEntry & { [key: string]: unknown };

const STRING_ATTRIBUTE_MAPPINGS: Array<[keyof InterfaceRecord, string]> = [
  ["type", "type"],
  ["state", "state"],
  ["alias", "alias"],
  ["mac", "mac"]
];

const NUMERIC_ATTRIBUTE_MAPPINGS: Array<[keyof InterfaceRecord, string]> = [
  ["mtu", "mtu"],
  ["ifindex", "index"],
  ["rxBps", "rx_bps"],
  ["txBps", "tx_bps"],
  ["rxPps", "rx_pps"],
  ["txPps", "tx_pps"],
  ["rxBytes", "rx_bytes"],
  ["txBytes", "tx_bytes"],
  ["rxPackets", "rx_packets"],
  ["txPackets", "tx_packets"],
  ["statsIntervalSeconds", "interval_seconds"]
];

const SNAPSHOT_FIELD_MAPPINGS: Array<[keyof ClabInterfaceSnapshotEntry, keyof InterfaceRecord]> = [
  ["rxBps", "rxBps"],
  ["rxPps", "rxPps"],
  ["rxBytes", "rxBytes"],
  ["rxPackets", "rxPackets"],
  ["txBps", "txBps"],
  ["txPps", "txPps"],
  ["txBytes", "txBytes"],
  ["txPackets", "txPackets"],
  ["statsIntervalSeconds", "statsIntervalSeconds"]
];

// Clab event doesn't pass default values.
// Explicitly set to default value when absent for merging.
const NETEM_FIELD_MAPPINGS: Array<[keyof InterfaceRecord, string, string]> = [
  ["netemDelay", "netem_delay", "0ms"],
  ["netemJitter", "netem_jitter", "0ms"],
  ["netemLoss", "netem_loss", "0%"],
  ["netemRate", "netem_rate", "0"],
  ["netemCorruption", "netem_corruption", "0"]
];

function parseNumericAttribute(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function interfaceRecordsEqual(a: InterfaceRecord | undefined, b: InterfaceRecord): boolean {
  if (!a) {
    return false;
  }

  return INTERFACE_KEYS.every((key) => a[key] === b[key]);
}

function assignStringAttributes(
  record: MutableInterfaceRecord,
  attributes: Record<string, unknown>,
  mappings: Array<[keyof InterfaceRecord, string]>
): void {
  for (const [targetKey, attributeKey] of mappings) {
    const value = attributes[attributeKey];
    if (typeof value === "string") {
      record[targetKey as string] = value;
    }
  }
}

function assignNumericAttributes(
  record: MutableInterfaceRecord,
  attributes: Record<string, unknown>,
  mappings: Array<[keyof InterfaceRecord, string]>
): void {
  for (const [targetKey, attributeKey] of mappings) {
    const parsed = parseNumericAttribute(attributes[attributeKey]);
    if (parsed !== undefined) {
      record[targetKey as string] = parsed;
    }
  }
}

function assignNetemAttributes(
  record: MutableInterfaceRecord,
  attributes: Record<string, unknown>,
  mappings: Array<[keyof InterfaceRecord, string, string]>
): void {
  for (const [targetKey, attributeKey, defaultValue] of mappings) {
    record[targetKey as string] = attributes[attributeKey] ?? defaultValue;
  }
}

function buildUpdatedInterfaceRecord(
  ifaceName: string,
  attributes: Record<string, unknown>,
  existing: InterfaceRecord | undefined
): InterfaceRecord {
  const base: MutableInterfaceRecord = existing
    ? { ...existing }
    : {
        ifname: ifaceName,
        type: "",
        state: ""
      };

  base.ifname = ifaceName;

  assignStringAttributes(base, attributes, STRING_ATTRIBUTE_MAPPINGS);
  assignNumericAttributes(base, attributes, NUMERIC_ATTRIBUTE_MAPPINGS);
  assignNetemAttributes(base, attributes, NETEM_FIELD_MAPPINGS);

  if (typeof base.type !== "string" || !base.type) {
    base.type = "";
  }
  if (typeof base.state !== "string" || !base.state) {
    base.state = "";
  }

  return base as InterfaceRecord;
}

function assignSnapshotFields(entry: MutableSnapshotEntry, iface: InterfaceRecord): void {
  for (const [entryKey, ifaceKey] of SNAPSHOT_FIELD_MAPPINGS) {
    const value = iface[ifaceKey];
    if (value !== undefined) {
      entry[entryKey as string] = value as number;
    }
  }
}

function toInterfaceSnapshotEntry(iface: InterfaceRecord): ClabInterfaceSnapshotEntry {
  const entry: MutableSnapshotEntry = {
    name: iface.ifname,
    type: iface.type || "",
    state: iface.state || "",
    alias: iface.alias || "",
    mac: iface.mac || "",
    mtu: iface.mtu ?? 0,
    ifindex: iface.ifindex ?? 0,
    netemDelay: iface.netemDelay ?? "",
    netemJitter: iface.netemJitter ?? "",
    netemLoss: iface.netemLoss ?? "",
    netemRate: iface.netemRate ?? "",
    netemCorruption: iface.netemCorruption ?? ""
  };

  assignSnapshotFields(entry, iface);

  return entry as ClabInterfaceSnapshotEntry;
}

interface NodeSnapshot {
  ipv4?: string;
  ipv4Prefix?: number;
  ipv6?: string;
  ipv6Prefix?: number;
  startedAt?: number;
}

interface LabRecord {
  topoFile?: string;
  containers: Map<string, ClabDetailedJSON>;
}

const INITIAL_IDLE_TIMEOUT_MS = 250;
const INITIAL_FALLBACK_TIMEOUT_MS = 2000;

let currentRuntime: string | undefined;
let receivedInitialEvent = false;
let child: ChildProcess | null = null;
let stdoutInterface: readline.Interface | null = null;
let initialLoadComplete = false;
let initialLoadPromise: Promise<void> | null = null;
let resolveInitialLoad: (() => void) | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

type RejectInitialLoad = (error: Error) => void;
let rejectInitialLoad: RejectInitialLoad | null = null;

const containersById = new Map<string, ContainerRecord>();
const labsByName = new Map<string, LabRecord>();
const interfacesByContainer = new Map<string, Map<string, InterfaceRecord>>();
const interfaceVersions = new Map<string, number>();
const nodeSnapshots = new Map<string, NodeSnapshot>();
type DataListener = () => void;
type ContainerStateChangedListener = (containerShortId: string, newState: string) => void;
const dataListeners = new Set<DataListener>();
const containerStateChangedListeners = new Set<ContainerStateChangedListener>();
let dataChangedTimer: ReturnType<typeof setTimeout> | null = null;
const DATA_NOTIFY_DELAY_MS = 50;

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
          `[containerlabEvents]: Failed to notify listener: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }, DATA_NOTIFY_DELAY_MS);
}

function notifyContainerStateChanged(containerShortId: string, newState: string): void {
  if (containerStateChangedListeners.size === 0) {
    return;
  }
  for (const listener of Array.from(containerStateChangedListeners)) {
    try {
      listener(containerShortId, newState);
    } catch (err) {
      console.error(
        `[containerlabEvents]: Failed to notify state change listener: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

function scheduleInitialResolution(): void {
  if (initialLoadComplete) {
    return;
  }

  // Once we receive the first event, cancel the fallback timer.
  // We'll rely on the idle timer to finalize after events stop arriving.
  if (!receivedInitialEvent) {
    receivedInitialEvent = true;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  if (idleTimer) {
    clearTimeout(idleTimer);
  }

  idleTimer = setTimeout(() => finalizeInitialLoad(), INITIAL_IDLE_TIMEOUT_MS);
}

function finalizeInitialLoad(error?: Error): void {
  if (initialLoadComplete) {
    return;
  }

  initialLoadComplete = true;

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }

  if (error) {
    if (rejectInitialLoad) {
      rejectInitialLoad(error);
    }
    return;
  }

  if (resolveInitialLoad) {
    resolveInitialLoad();
  }
}

function stopProcess(): void {
  if (stdoutInterface) {
    stdoutInterface.removeAllListeners();
    stdoutInterface.close();
    stdoutInterface = null;
  }

  if (child) {
    child.removeAllListeners();
    try {
      child.kill();
    } catch {
      // ignore errors during shutdown
    }
    child = null;
  }

  initialLoadComplete = false;
  initialLoadPromise = null;
  resolveInitialLoad = null;
  rejectInitialLoad = null;
  receivedInitialEvent = false;

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function parseCidr(value?: string): { address?: string; prefixLength?: number } {
  if (!value || typeof value !== "string") {
    return {};
  }
  const parts = value.split("/");
  if (parts.length === 2) {
    const prefix = Number(parts[1]);
    return {
      address: parts[0],
      prefixLength: Number.isFinite(prefix) ? prefix : undefined
    };
  }
  return { address: value };
}

function resolveLabName(attributes: Record<string, unknown>): string {
  const containerlab = isString(attributes.containerlab) ? attributes.containerlab : "";
  const lab = isString(attributes.lab) ? attributes.lab : "";
  return containerlab || lab || "unknown";
}

function resolveContainerIds(
  event: ContainerlabEvent,
  attributes: Record<string, unknown>
): { id: string; shortId: string } {
  const fullId = isString(attributes.id) ? attributes.id : event.actor_full_id || "";
  const shortFromEvent = event.actor_id || "";
  const shortId = shortFromEvent || (fullId ? fullId.slice(0, 12) : "");
  const id = fullId || shortId;
  return { id, shortId };
}

function resolveNames(
  event: ContainerlabEvent,
  attributes: Record<string, unknown>
): { name: string; nodeName: string } {
  const nameAttr = isString(attributes.name) ? attributes.name : "";
  const longName = isString(attributes["clab-node-longname"])
    ? attributes["clab-node-longname"]
    : "";
  const name = nameAttr || longName || event.actor_name || "";
  const nodeName = isString(attributes["clab-node-name"]) ? attributes["clab-node-name"] : name;
  return { name, nodeName };
}

function resolveImage(attributes: Record<string, unknown>): string {
  const image = isString(attributes.image) ? attributes.image : "";
  const imageRef = isString(attributes["org.opencontainers.image.ref.name"])
    ? attributes["org.opencontainers.image.ref.name"]
    : "";
  return image || imageRef || "";
}

function buildLabels(
  attributes: Record<string, unknown>,
  labName: string,
  name: string,
  nodeName: string,
  topoFile?: string
): ClabDetailedJSON["Labels"] {
  const labels: ClabDetailedJSON["Labels"] = {
    "clab-node-kind": isString(attributes["clab-node-kind"]) ? attributes["clab-node-kind"] : "",
    "clab-node-lab-dir": isString(attributes["clab-node-lab-dir"])
      ? attributes["clab-node-lab-dir"]
      : "",
    "clab-node-longname": isString(attributes["clab-node-longname"])
      ? attributes["clab-node-longname"]
      : name,
    "clab-node-name": nodeName,
    "clab-owner": isString(attributes["clab-owner"]) ? attributes["clab-owner"] : "",
    "clab-topo-file": topoFile || "",
    containerlab: labName
  };

  if (isString(attributes["clab-node-type"])) {
    labels["clab-node-type"] = attributes["clab-node-type"];
  }
  if (isString(attributes["clab-node-group"])) {
    labels["clab-node-group"] = attributes["clab-node-group"];
  }
  if (isString(attributes["clab-root-node-name"])) {
    labels["clab-root-node-name"] = attributes["clab-root-node-name"];
  }
  return labels;
}

function buildNetworkSettings(
  attributes: Record<string, unknown>
): ClabDetailedJSON["NetworkSettings"] {
  const mgmtIpv4 = isString(attributes.mgmt_ipv4) ? attributes.mgmt_ipv4 : undefined;
  const mgmtIpv6 = isString(attributes.mgmt_ipv6) ? attributes.mgmt_ipv6 : undefined;
  const ipv4 = parseCidr(mgmtIpv4);
  const ipv6 = parseCidr(mgmtIpv6);
  return {
    IPv4addr: ipv4.address,
    IPv4pLen: ipv4.prefixLength,
    IPv6addr: ipv6.address,
    IPv6pLen: ipv6.prefixLength
  };
}

function resolveNetworkName(attributes: Record<string, unknown>): string | undefined {
  const network = isString(attributes.network) ? attributes.network : undefined;
  const bridge = isString(attributes["clab-mgmt-net-bridge"])
    ? attributes["clab-mgmt-net-bridge"]
    : undefined;
  return network || bridge;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toClabDetailed(event: ContainerlabEvent): ContainerRecord | undefined {
  const attributes = event.attributes ?? {};

  const labName = resolveLabName(attributes);
  const topoFile: string | undefined = isString(attributes["clab-topo-file"])
    ? attributes["clab-topo-file"]
    : undefined;
  const { id, shortId } = resolveContainerIds(event, attributes);
  const { name, nodeName } = resolveNames(event, attributes);
  const image = resolveImage(attributes);
  const stateAttr = isString(attributes.state) ? attributes.state : "";
  const state = stateAttr || deriveStateFromAction(event.action);
  const status = isString(attributes.status) ? attributes.status : "";
  const labels = buildLabels(attributes, labName, name, nodeName, topoFile);
  const networkSettings = buildNetworkSettings(attributes);
  const networkName = resolveNetworkName(attributes);

  const detailed: ClabDetailedJSON = {
    Names: name ? [name] : [],
    ID: id,
    ShortID: shortId,
    Image: image,
    State: state,
    Status: status,
    Labels: labels,
    NetworkSettings: networkSettings,
    Mounts: [],
    Ports: [],
    Pid: toOptionalNumber(attributes.pid),
    NetworkName: networkName
  };

  return { labName, topoFile, data: detailed };
}

function deriveStateFromAction(action: string): string {
  switch (action) {
    case "die":
    case "kill":
    case "destroy":
    case "stop":
      return "exited";
    case "pause":
      return "paused";
    case "unpause":
      return "running";
    case "start":
    case "restart":
    case "running":
      return "running";
    case "create":
    case "create: container":
      return "created";
    default:
      return action;
  }
}

function isExecAction(action: string | undefined): boolean {
  if (!action) {
    return false;
  }
  return action.startsWith("exec");
}

function shouldRemoveContainer(action: string): boolean {
  // Keep containers in the tree when they stop or exit so users can still
  // interact with them until they are actually removed.
  return action === "destroy";
}

function mergeContainerRecord(
  existing: ContainerRecord | undefined,
  incoming: ContainerRecord,
  action: string
): ContainerRecord {
  if (!existing) {
    return incoming;
  }

  return {
    labName: resolveLabNameForMerge(existing, incoming),
    topoFile: resolveTopoFileForMerge(existing, incoming),
    data: mergeContainerData(existing, incoming, action)
  };
}

function resolveLabNameForMerge(existing: ContainerRecord, incoming: ContainerRecord): string {
  if ((!incoming.labName || incoming.labName === "unknown") && existing.labName) {
    return existing.labName;
  }
  return incoming.labName;
}

function resolveTopoFileForMerge(
  existing: ContainerRecord,
  incoming: ContainerRecord
): string | undefined {
  return incoming.topoFile || existing.topoFile;
}

function mergeContainerData(
  existing: ContainerRecord,
  incoming: ContainerRecord,
  action: string
): ClabDetailedJSON {
  const previousData = existing.data;
  const nextData = incoming.data;

  const mergedNetwork = mergeNetworkSettings(
    previousData.NetworkSettings,
    nextData.NetworkSettings
  );

  const merged: ClabDetailedJSON = {
    ...nextData,
    Labels: { ...previousData.Labels, ...nextData.Labels },
    NetworkSettings: mergedNetwork,
    Status: resolveStatusValue(nextData.Status, previousData.Status, action),
    Image: pickNonEmpty(nextData.Image, previousData.Image),
    State: resolveStateValue(nextData.State, previousData.State, action)
  };

  if (nextData.StartedAt !== undefined || previousData.StartedAt !== undefined) {
    merged.StartedAt = nextData.StartedAt ?? previousData.StartedAt;
  }

  if (!merged.NetworkName && previousData.NetworkName) {
    merged.NetworkName = previousData.NetworkName;
  }

  return merged;
}

function mergeNetworkSettings(
  previous: ClabDetailedJSON["NetworkSettings"],
  next: ClabDetailedJSON["NetworkSettings"]
): ClabDetailedJSON["NetworkSettings"] {
  const merged = { ...next };

  if (!merged.IPv4addr && previous.IPv4addr) {
    merged.IPv4addr = previous.IPv4addr;
    merged.IPv4pLen = previous.IPv4pLen;
  }
  if (!merged.IPv6addr && previous.IPv6addr) {
    merged.IPv6addr = previous.IPv6addr;
    merged.IPv6pLen = previous.IPv6pLen;
  }

  return merged;
}

/**
 * Extract healthcheck suffix from health_status action.
 * Actions like "health_status: healthy" -> "(healthy)"
 */
function extractHealthSuffix(action: string): string | undefined {
  if (!action.startsWith("health_status:")) {
    return undefined;
  }
  const status = action.slice("health_status:".length).trim();
  if (!status) {
    return undefined;
  }
  // Map to display format
  if (status === "healthy") return "(healthy)";
  if (status === "unhealthy") return "(unhealthy)";
  return `(health: ${status})`; // e.g., "(health: starting)"
}

/**
 * Update status string with new healthcheck suffix.
 * Replaces any existing healthcheck suffix or appends if none.
 */
function updateStatusWithHealthSuffix(status: string, healthSuffix: string): string {
  if (!status) {
    return status;
  }
  // Remove any existing healthcheck suffix
  const trimmed = status.trim();
  const openIdx = trimmed.lastIndexOf("(");
  if (openIdx !== -1 && trimmed.endsWith(")")) {
    const baseStatus = trimmed.slice(0, openIdx).trimEnd();
    return `${baseStatus} ${healthSuffix}`;
  }
  // No existing suffix, append new one
  return `${trimmed} ${healthSuffix}`;
}

function resolveStatusValue(current: string, fallback: string | undefined, action: string): string {
  // For termination events (stop/die/kill), reset status - don't preserve old "Up X" for stopped containers
  if (action === "stop" || action === "die" || action === "kill") {
    return current;
  }

  // For health_status events, update the status with healthcheck suffix
  const healthSuffix = extractHealthSuffix(action);
  if (healthSuffix && fallback) {
    return updateStatusWithHealthSuffix(fallback, healthSuffix);
  }

  // For other events (including "running"), preserve status if current is empty
  // This ensures healthcheck suffix like "(healthy)" is not lost when events have empty status
  return pickNonEmpty(current, fallback);
}

function shouldResetLifecycleStatus(action: string): boolean {
  switch (action) {
    case "create":
    case "start":
    case "running":
    case "restart":
    case "pause":
    case "unpause":
    case "stop":
    case "kill":
    case "die":
      return true;
    default:
      return false;
  }
}

function pickNonEmpty(current: string, fallback?: string): string {
  if (current && current.trim().length > 0) {
    return current;
  }
  return fallback ?? current;
}

function resolveStateValue(current: string, fallback: string | undefined, action: string): string {
  if ((!current || current === action) && fallback) {
    return fallback;
  }
  return current;
}

function updateLabMappings(previous: ContainerRecord | undefined, next: ContainerRecord): void {
  if (previous && previous.labName !== next.labName) {
    const previousLab = labsByName.get(previous.labName);
    if (previousLab) {
      previousLab.containers.delete(next.data.ShortID);
      if (previousLab.containers.size === 0) {
        labsByName.delete(previous.labName);
      }
    }
  }

  let lab = labsByName.get(next.labName);
  if (!lab) {
    lab = { topoFile: next.topoFile, containers: new Map() };
    labsByName.set(next.labName, lab);
  }
  if (next.topoFile) {
    lab.topoFile = next.topoFile;
  }
  lab.containers.set(next.data.ShortID, next.data);
}

function makeNodeSnapshotKey(record: ContainerRecord): string | undefined {
  const labels = record.data.Labels;
  const nodeName = labels["clab-node-name"] || labels["clab-node-longname"] || record.data.Names[0];
  if (!nodeName) {
    return undefined;
  }
  const lab = record.labName || labels.containerlab || "unknown";
  return `${lab}::${nodeName}`.toLowerCase();
}

function applyNodeSnapshot(record: ContainerRecord): ContainerRecord {
  const key = makeNodeSnapshotKey(record);
  if (!key) {
    return record;
  }
  const snapshot = nodeSnapshots.get(key);
  if (!snapshot) {
    return record;
  }

  const settings = record.data.NetworkSettings;
  if (!settings.IPv4addr && snapshot.ipv4) {
    settings.IPv4addr = snapshot.ipv4;
    settings.IPv4pLen = snapshot.ipv4Prefix;
  }
  if (!settings.IPv6addr && snapshot.ipv6) {
    settings.IPv6addr = snapshot.ipv6;
    settings.IPv6pLen = snapshot.ipv6Prefix;
  }

  if (record.data.State === "running") {
    record.data.StartedAt = snapshot.startedAt;
    if (!hasNonEmptyStatus(record.data.Status)) {
      record.data.Status = "Running";
    }
  } else {
    record.data.StartedAt = undefined;
    if (!hasNonEmptyStatus(record.data.Status)) {
      record.data.Status = formatStateLabel(record.data.State);
    }
  }

  return record;
}

function estimateStartedAtFromStatus(
  status: string | undefined,
  eventTimestamp?: number
): number | undefined {
  if (!status) {
    return undefined;
  }

  const trimmed = status.trim();
  if (!trimmed.toLowerCase().startsWith("up ")) {
    return undefined;
  }

  let withoutSuffix = trimmed;
  const lastOpen = trimmed.lastIndexOf("(");
  const hasClosing = trimmed.endsWith(")");
  if (lastOpen !== -1 && hasClosing) {
    withoutSuffix = trimmed.slice(0, lastOpen).trimEnd();
  }

  const durationText = withoutSuffix.slice(2).trim();

  const tokens = durationText.split(" ").filter(Boolean);
  let totalSeconds = 0;
  let matched = false;

  let index = 0;
  while (index < tokens.length - 1) {
    const value = Number(tokens[index]);
    if (!Number.isFinite(value)) {
      index += 1;
      continue;
    }
    const unitToken = tokens[index + 1];
    if (!unitToken) {
      break;
    }
    const unitSeconds = toDurationSeconds(unitToken);
    if (unitSeconds === 0) {
      index += 1;
      continue;
    }
    totalSeconds += value * unitSeconds;
    matched = true;
    index += 2;
  }

  if (!matched || totalSeconds <= 0) {
    return undefined;
  }

  const reference = eventTimestamp ?? Date.now();
  const estimated = reference - totalSeconds * 1000;
  return estimated > 0 ? estimated : 0;
}

function toDurationSeconds(unit: string): number {
  let normalized = unit.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.endsWith("s")) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized === "mins") {
    normalized = "min";
  }
  if (normalized === "hrs") {
    normalized = "hour";
  }
  switch (normalized) {
    case "second":
      return 1;
    case "minute":
    case "min":
      return 60;
    case "hour":
      return 3600;
    case "day":
      return 86400;
    default:
      return 0;
  }
}

function updateNodeSnapshot(
  record: ContainerRecord,
  eventTimestamp?: number,
  action?: string
): void {
  const key = makeNodeSnapshotKey(record);
  if (!key) {
    return;
  }

  const settings = record.data.NetworkSettings;
  const snapshot = nodeSnapshots.get(key) ?? {};

  if (settings.IPv4addr) {
    snapshot.ipv4 = settings.IPv4addr;
    snapshot.ipv4Prefix = settings.IPv4pLen;
  }

  if (settings.IPv6addr) {
    snapshot.ipv6 = settings.IPv6addr;
    snapshot.ipv6Prefix = settings.IPv6pLen;
  }

  if (record.data.State === "running") {
    const estimatedStart = estimateStartedAtFromStatus(record.data.Status, eventTimestamp);
    if (estimatedStart !== undefined) {
      snapshot.startedAt = estimatedStart;
    } else if (shouldResetLifecycleStatus(action ?? "") || snapshot.startedAt === undefined) {
      snapshot.startedAt = resolveStartTimestamp(eventTimestamp, snapshot.startedAt);
    }
  } else {
    snapshot.startedAt = undefined;
  }

  nodeSnapshots.set(key, snapshot);
}

function clearNodeSnapshot(record: ContainerRecord): void {
  const key = makeNodeSnapshotKey(record);
  if (!key) {
    return;
  }
  nodeSnapshots.delete(key);
}

function parseEventTimestamp(timestamp?: string): number | undefined {
  if (!timestamp) {
    return undefined;
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function resolveStartTimestamp(eventTimestamp?: number, current?: number): number {
  if (typeof eventTimestamp === "number" && !Number.isNaN(eventTimestamp)) {
    return eventTimestamp;
  }
  if (typeof current === "number" && !Number.isNaN(current)) {
    return current;
  }
  return Date.now();
}

function hasNonEmptyStatus(value: string | undefined): boolean {
  return !!(value && value.trim().length > 0);
}

function formatStateLabel(state: string | undefined): string {
  if (!state) {
    return "Unknown";
  }
  const normalized = state.replace(/[_-]+/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function shouldMarkInterfacesDown(state: string | undefined): boolean {
  if (!state) {
    return true;
  }

  const normalized = state.toLowerCase();
  return normalized !== "running" && normalized !== "paused";
}

function applyContainerEvent(event: ContainerlabEvent): void {
  const action = event.action || "";

  if (isExecAction(action)) {
    return;
  }

  if (shouldRemoveContainer(action)) {
    removeContainer(event.actor_id);
    scheduleInitialResolution();
    return;
  }

  const record = toClabDetailed(event);
  if (!record) {
    return;
  }

  const eventTimestamp = parseEventTimestamp(event.timestamp);
  const existing = containersById.get(record.data.ShortID);
  const oldState = existing?.data.State;
  const mergedRecord = mergeContainerRecord(existing, record, action);
  updateNodeSnapshot(mergedRecord, eventTimestamp, action);
  const enrichedRecord = applyNodeSnapshot(mergedRecord);
  const newState = enrichedRecord.data.State;

  containersById.set(enrichedRecord.data.ShortID, enrichedRecord);
  updateLabMappings(existing, enrichedRecord);

  if (oldState && oldState !== newState) {
    notifyContainerStateChanged(enrichedRecord.data.ShortID, newState);
  }

  if (shouldMarkInterfacesDown(enrichedRecord.data.State)) {
    if (markInterfacesDown(enrichedRecord.data.ShortID)) {
      scheduleInitialResolution();
      scheduleDataChanged();
      return;
    }
  }

  scheduleInitialResolution();
  scheduleDataChanged();
}

function removeContainer(containerShortId: string): void {
  const record = containersById.get(containerShortId);
  if (!record) {
    return;
  }

  const lab = labsByName.get(record.labName);
  if (lab) {
    lab.containers.delete(containerShortId);
    if (lab.containers.size === 0) {
      labsByName.delete(record.labName);
    }
  }

  clearNodeSnapshot(record);
  containersById.delete(containerShortId);
  interfacesByContainer.delete(containerShortId);
  interfaceVersions.delete(containerShortId);
  scheduleDataChanged();
}

function applyInterfaceEvent(event: ContainerlabEvent): void {
  const attributes = event.attributes ?? {};
  const containerId = event.actor_id;
  if (!containerId) {
    return;
  }

  const ifaceName = typeof attributes.ifname === "string" ? attributes.ifname : undefined;
  if (!ifaceName) {
    return;
  }

  if (event.action === "delete") {
    if (removeInterfaceRecord(containerId, ifaceName)) {
      bumpInterfaceVersion(containerId);
      scheduleInitialResolution();
      scheduleDataChanged();
    }
    return;
  }

  if (ifaceName.startsWith("clab-")) {
    removeInterfaceRecord(containerId, ifaceName);
    return;
  }

  let ifaceMap = interfacesByContainer.get(containerId);
  if (!ifaceMap) {
    ifaceMap = new Map();
    interfacesByContainer.set(containerId, ifaceMap);
  }
  const existing = ifaceMap.get(ifaceName);
  const updated = buildUpdatedInterfaceRecord(ifaceName, attributes, existing);
  const removedRenamedEntries = removeInterfaceRecordsWithSameIndex(
    ifaceMap,
    ifaceName,
    updated.ifindex
  );

  const changed = removedRenamedEntries || !interfaceRecordsEqual(existing, updated);

  // Check if this event contains traffic stats - we always want to notify
  // for stats updates to ensure real-time traffic monitoring works
  const hasStats = attributes.rx_bps !== undefined || attributes.tx_bps !== undefined;

  // No changes and no stats - nothing to do
  if (!changed && !hasStats) {
    return;
  }

  // Always update the record if we have new data
  ifaceMap.set(ifaceName, updated);

  // For structural changes, bump version
  if (changed) {
    bumpInterfaceVersion(containerId);
  }

  // Always notify for stats updates (real-time traffic monitoring)
  // or when structural data changed
  scheduleInitialResolution();
  scheduleDataChanged();
}

function removeInterfaceRecordsWithSameIndex(
  ifaceMap: Map<string, InterfaceRecord>,
  incomingName: string,
  incomingIfindex: number | undefined
): boolean {
  if (incomingIfindex === undefined) {
    return false;
  }

  let removed = false;
  for (const [existingName, existingRecord] of ifaceMap.entries()) {
    if (existingName === incomingName) {
      continue;
    }
    if (existingRecord.ifindex === incomingIfindex) {
      ifaceMap.delete(existingName);
      removed = true;
    }
  }

  return removed;
}

function removeInterfaceRecord(containerId: string, ifaceName: string): boolean {
  const ifaceMap = interfacesByContainer.get(containerId);
  if (!ifaceMap) {
    return false;
  }

  const removed = ifaceMap.delete(ifaceName);
  if (ifaceMap.size === 0) {
    interfacesByContainer.delete(containerId);
  }
  return removed;
}

function bumpInterfaceVersion(containerId: string): void {
  const next = (interfaceVersions.get(containerId) ?? 0) + 1;
  interfaceVersions.set(containerId, next);
}

function markInterfacesDown(containerId: string): boolean {
  const ifaceMap = interfacesByContainer.get(containerId);
  if (!ifaceMap || ifaceMap.size === 0) {
    return false;
  }

  // When a container goes down, clear all interfaces
  interfacesByContainer.delete(containerId);
  bumpInterfaceVersion(containerId);

  return true;
}

function handleEventLine(line: string): void {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  try {
    const event = JSON.parse(trimmed) as ContainerlabEvent;
    if (event.type === "container") {
      applyContainerEvent(event);
    } else if (event.type === "interface") {
      applyInterfaceEvent(event);
    }
  } catch (err) {
    console.error(
      `[containerlabEvents]: Failed to parse event line: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function startProcess(runtime: string): void {
  currentRuntime = runtime;
  initialLoadComplete = false;

  initialLoadPromise = new Promise<void>((resolve, reject) => {
    resolveInitialLoad = resolve;
    rejectInitialLoad = reject;
  });

  const config = vscode.workspace.getConfiguration("containerlab");
  const enableInterfaceStats = config.get<boolean>("enableInterfaceStats", true);

  const containerlabBinary = containerlabBinaryPath;
  const baseArgs = ["events", "--format", "json", "--initial-state"];

  // Only add --interface-stats if enabled in settings
  if (enableInterfaceStats) {
    baseArgs.push("--interface-stats");
  }

  if (runtime) {
    baseArgs.splice(1, 0, "-r", runtime);
  }

  const spawned = spawn(containerlabBinary, baseArgs, { stdio: ["ignore", "pipe", "pipe"] });
  child = spawned;

  if (!spawned.stdout) {
    finalizeInitialLoad(new Error("Failed to start containerlab events process"));
    return;
  }

  stdoutInterface = readline.createInterface({ input: spawned.stdout });
  stdoutInterface.on("line", handleEventLine);

  spawned.stderr?.on("data", (chunk) => {
    console.warn(`[containerlabEvents]: stderr: ${chunk}`);
  });

  spawned.on("error", (err) => {
    finalizeInitialLoad(err instanceof Error ? err : new Error(String(err)));
    stopProcess();
  });

  spawned.on("exit", (code, signal) => {
    if (!initialLoadComplete) {
      const message = `containerlab events exited prematurely (code=${code}, signal=${signal ?? ""})`;
      finalizeInitialLoad(new Error(message));
    }
    stopProcess();
  });

  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
  }
  fallbackTimer = setTimeout(() => finalizeInitialLoad(), INITIAL_FALLBACK_TIMEOUT_MS);
}

export async function ensureEventStream(runtime: string): Promise<void> {
  if (child && currentRuntime === runtime) {
    if (initialLoadComplete) {
      return;
    }
    if (initialLoadPromise) {
      return initialLoadPromise;
    }
  }

  stopProcess();
  startProcess(runtime);

  if (!initialLoadPromise) {
    throw new Error("Failed to initialize containerlab events stream");
  }
  return initialLoadPromise;
}

export function stopEventStream(): void {
  stopProcess();
}

export function getGroupedContainers(): Record<string, ClabDetailedJSON[]> {
  const result: Record<string, ClabDetailedJSON[]> = {};

  for (const [labName, lab] of labsByName.entries()) {
    const containers = Array.from(lab.containers.values()).map((container) => ({
      ...container,
      Names: [...container.Names],
      Labels: { ...container.Labels },
      NetworkSettings: { ...container.NetworkSettings },
      Mounts: container.Mounts?.map((mount) => ({ ...mount })) ?? [],
      Ports: container.Ports?.map((port) => ({ ...port })) ?? []
    }));

    const arrayWithMeta = containers as unknown as ClabDetailedJSON[] & { [key: string]: unknown };
    if (lab.topoFile) {
      arrayWithMeta["topo-file"] = lab.topoFile;
    }
    result[labName] = arrayWithMeta;
  }

  return result;
}

export function getInterfaceSnapshot(
  containerShortId: string,
  containerName: string
): ClabInterfaceSnapshot[] {
  const ifaceMap = interfacesByContainer.get(containerShortId);
  if (!ifaceMap || ifaceMap.size === 0) {
    return [];
  }

  const interfaces = Array.from(ifaceMap.values()).map(toInterfaceSnapshotEntry);

  interfaces.sort((a, b) => a.name.localeCompare(b.name));

  return [
    {
      name: containerName,
      interfaces
    }
  ];
}

export function getInterfaceVersion(containerShortId: string): number {
  return interfaceVersions.get(containerShortId) ?? 0;
}

export function resetForTests(): void {
  stopProcess();
  containersById.clear();
  labsByName.clear();
  interfacesByContainer.clear();
  interfaceVersions.clear();
  nodeSnapshots.clear();
  scheduleDataChanged();
}

export function onDataChanged(listener: DataListener): () => void {
  dataListeners.add(listener);
  return () => {
    dataListeners.delete(listener);
  };
}

export function onContainerStateChanged(listener: ContainerStateChangedListener): () => void {
  containerStateChangedListeners.add(listener);
  return () => {
    containerStateChangedListeners.delete(listener);
  };
}
