// Dev mode entry point.
import React from "react";
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { App } from "@webview/App";
import type { CustomNodeTemplate } from "@shared/types/editors";
import type { CustomIconInfo } from "@shared/types/icons";
import "@webview/styles/global.css";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

import { setHostContext } from "@webview/services/topologyHostClient";
import { refreshTopologySnapshot } from "@webview/services/topologyHostCommands";
import { useGraphStore, useTopoViewerStore } from "@webview/stores";
import { applyDevVars } from "@webview/theme/devTheme";
import { vscodeTheme } from "@webview/theme/vscodeTheme";
import { EXPORT_COMMANDS } from "@shared/messages/extension";
import { MSG_SVG_EXPORT_RESULT } from "@shared/messages/webview";

import { DevStateManager } from "./mock/DevState";
import { DevSettingsOverlay } from "./components/DevSettingsOverlay";
import { sampleCustomNodes, sampleCustomIcons } from "./mockData";

import clabSchema from "../schema/clab.schema.json";
import { parseSchemaData } from "@shared/schema";
import type { SchemaData } from "@shared/schema";
import {
  buildExplorerSnapshot,
  type ExplorerActionInvocation,
  type ExplorerSnapshotOptions,
  type ExplorerSnapshotProviders
} from "../src/webviews/explorer/explorerSnapshotAdapter";
import type {
  ExplorerIncomingMessage,
  ExplorerOutgoingMessage,
  ExplorerUiState
} from "../src/webviews/shared/explorer/types";

const monacoGlobal = self as typeof self & {
  MonacoEnvironment?: {
    getWorker: (workerId: string, label: string) => Worker;
  };
};

if (!monacoGlobal.MonacoEnvironment) {
  monacoGlobal.MonacoEnvironment = {
    getWorker: (_workerId: string, label: string) => {
      if (label === "json") {
        return new JsonWorker();
      }
      return new EditorWorker();
    }
  };
}

// Session Management

function getSessionId(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("sessionId");
}

const sessionId = getSessionId();
if (sessionId) {
  console.log(`%c[Dev] Session ID: ${sessionId}`, "color: #9C27B0;");
}

// Dev State

const stateManager = new DevStateManager({
  mode: "edit",
  deploymentState: "undeployed",
  customNodes: sampleCustomNodes as CustomNodeTemplate[]
});

// Initial Bootstrap Data

const schemaData = parseSchemaData(clabSchema as Record<string, unknown>);

const dockerImages = [
  "ghcr.io/nokia/srlinux:latest",
  "ghcr.io/nokia/srlinux:24.10.1",
  "alpine:latest",
  "ubuntu:latest"
];

interface InitialData {
  schemaData: SchemaData;
  dockerImages: string[];
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  customIcons: CustomIconInfo[];
}

const initialData: InitialData = {
  schemaData,
  dockerImages,
  customNodes: sampleCustomNodes as CustomNodeTemplate[],
  defaultNode: stateManager.getDefaultCustomNode(),
  customIcons: sampleCustomIcons as CustomIconInfo[]
};

// Render App

let reactRoot: ReactRoot | null = null;
let renderKey = 0;

function renderApp(): void {
  (window as unknown as Record<string, unknown>).__INITIAL_DATA__ = initialData;
  (window as unknown as Record<string, unknown>).__SCHEMA_DATA__ = initialData.schemaData;
  (window as unknown as Record<string, unknown>).__DOCKER_IMAGES__ = initialData.dockerImages;

  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root element not found");
  }

  if (!reactRoot) {
    reactRoot = createRoot(container);
  }

  renderKey++;
  reactRoot.render(<App key={renderKey} initialData={initialData} />);
}

// Topology Loading

const DEFAULT_TOPOLOGY = "simple.clab.yml";

let currentFilePath: string | null = null;

function normalizeTopologyRequestPath(pathValue: string): string {
  const trimmed = pathValue.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/^\.\//, "");
  const marker = "/topologies/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex + marker.length);
  }
  if (normalized.startsWith("topologies/")) {
    return normalized.slice("topologies/".length);
  }
  if (normalized.startsWith("dev/topologies/")) {
    return normalized.slice("dev/topologies/".length);
  }

  return trimmed;
}

function syncHostContext(
  options: {
    mode?: "edit" | "view";
    deploymentState?: "deployed" | "undeployed" | "unknown";
  } = {}
): void {
  const path = normalizeTopologyRequestPath(currentFilePath ?? DEFAULT_TOPOLOGY);
  setHostContext({
    path,
    mode: options.mode ?? stateManager.getMode(),
    deploymentState: options.deploymentState ?? stateManager.getDeploymentState(),
    sessionId: sessionId ?? undefined
  });
}

async function loadTopologyFile(filePath: string): Promise<void> {
  const normalizedPath = normalizeTopologyRequestPath(filePath);
  console.log(`%c[Dev] Loading topology: ${normalizedPath}`, "color: #2196F3;");
  currentFilePath = normalizedPath;
  stateManager.setLoadedFile(normalizedPath);

  syncHostContext();

  renderApp();
  await refreshTopologySnapshot();
}

async function listTopologyFiles(): Promise<
  Array<{ filename: string; path: string; hasAnnotations: boolean }>
> {
  try {
    const response = await fetch(sessionId ? `/files?sessionId=${sessionId}` : "/files");
    return await response.json();
  } catch (error) {
    console.error("[Dev] Failed to list topology files:", error);
    return [];
  }
}

async function resetFiles(): Promise<void> {
  console.log("%c[Dev] Resetting files...", "color: #f44336;");

  const url = sessionId ? `/api/reset?sessionId=${sessionId}` : "/api/reset";
  const response = await fetch(url, { method: "POST" });
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Failed to reset files");
  }

  console.log("%c[Dev] Files reset successfully", "color: #4CAF50;");

  if (currentFilePath) {
    await loadTopologyFile(currentFilePath);
  }
}

// External File Changes (SSE)

function subscribeToFileChanges(): void {
  const url = sessionId ? `/api/events?sessionId=${sessionId}` : "/api/events";
  const source = new EventSource(url);
  source.addEventListener("file-changed", (event) => {
    const message = (event as MessageEvent).data;
    if (!message) return;
    try {
      const payload = JSON.parse(message) as { path?: string; type?: string };
      if (payload.type === "yaml") {
        scheduleExplorerSnapshot(0);
      }

      if (!currentFilePath) {
        return;
      }

      const filename = currentFilePath.split("/").pop();
      if (!filename) return;

      const isYamlChange = payload.type === "yaml" && payload.path === filename;
      const isAnnotationsChange =
        payload.type === "annotations" && payload.path === `${filename}.annotations.json`;

      // Refresh topology on YAML or annotations changes
      if (isYamlChange || isAnnotationsChange) {
        void refreshTopologySnapshot({ externalChange: true });
      }
    } catch (err) {
      console.warn("[Dev] Failed to parse SSE message", err);
    }
  });
}

// Window Globals for Dev Console

interface DevServerInterface {
  loadTopologyFile: (filePath: string) => Promise<void>;
  listTopologyFiles: () => Promise<
    Array<{ filename: string; path: string; hasAnnotations: boolean }>
  >;
  resetFiles: () => Promise<void>;
  getCurrentFile: () => string | null;
  setMode: (mode: "edit" | "view") => void;
  setDeploymentState: (state: "deployed" | "undeployed" | "unknown") => void;
  onHostUpdate: () => void;
  stateManager: DevStateManager;
}

(window as unknown as { __DEV__: DevServerInterface }).__DEV__ = {
  loadTopologyFile,
  listTopologyFiles,
  resetFiles,
  getCurrentFile: () => currentFilePath,
  setMode: (mode: "edit" | "view") => {
    stateManager.setMode(mode);
    syncHostContext({ mode });
    void refreshTopologySnapshot();
  },
  setDeploymentState: (state: "deployed" | "undeployed" | "unknown") => {
    stateManager.setDeploymentState(state);
    syncHostContext({ deploymentState: state });
    void refreshTopologySnapshot();
  },
  onHostUpdate: () => {},
  stateManager
};

// Explorer bridge for Vite dev mode (uses the same snapshot adapter as the extension host).

const EXPLORER_REFRESH_DEBOUNCE_MS = 90;
const TREE_ITEM_NONE = 0;
const TREE_ITEM_COLLAPSED = 1;

interface DevExplorerTreeItem {
  id?: string;
  label: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  command?: { command: string; title: string; arguments?: unknown[] };
  collapsibleState?: number;
  state?: string;
  status?: string;
  link?: string;
  labPath?: { absolute: string; relative: string };
  name?: string;
  cID?: string;
  kind?: string;
  image?: string;
  mac?: string;
  v4Address?: string;
  v6Address?: string;
  children?: DevExplorerTreeItem[];
}

class DevExplorerProvider {
  constructor(private readonly roots: DevExplorerTreeItem[]) {}

  getChildren(element?: DevExplorerTreeItem): DevExplorerTreeItem[] {
    if (!element) {
      return this.roots;
    }
    return Array.isArray(element.children) ? element.children : [];
  }
}

const HELP_LINKS = [
  { label: "Containerlab Documentation", url: "https://containerlab.dev/" },
  { label: "VS Code Extension Documentation", url: "https://containerlab.dev/manual/vsc-extension/" },
  { label: "Browse Labs on GitHub (srl-labs)", url: "https://github.com/srl-labs/" },
  {
    label: 'Find more labs tagged with "clab-topo"',
    url: "https://github.com/search?q=topic%3Aclab-topo++fork%3Atrue&type=repositories"
  },
  { label: "Join our Discord server", url: "https://discord.gg/vAyddtaEV9" },
  {
    label: "Download cshargextcap Wireshark plugin",
    url: "https://github.com/siemens/cshargextcap/releases/latest"
  }
] as const;

let explorerFilterText = "";
let explorerUiState: ExplorerUiState = {};
let explorerRefreshTimer: number | null = null;
let explorerActionBindings = new Map<string, ExplorerActionInvocation>();
const unhandledExplorerCommands = new Set<string>();
const favoriteLabPaths = new Set<string>();
const sshxShareLinksByLab = new Map<string, string>();
const gottyShareLinksByLab = new Map<string, string>();

function stripTopologySuffix(name: string): string {
  return name.replace(/\.clab\.(ya?ml)$/i, "");
}

function safeFilename(pathValue: string): string {
  const segments = pathValue.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : pathValue;
}

function sendExplorerMessage(message: ExplorerIncomingMessage): void {
  window.dispatchEvent(new MessageEvent<ExplorerIncomingMessage>("message", { data: message }));
}

function postExplorerFilterState(): void {
  sendExplorerMessage({ command: "filterState", filterText: explorerFilterText });
}

function postExplorerUiState(): void {
  sendExplorerMessage({ command: "uiState", state: explorerUiState });
}

function postExplorerError(message: string): void {
  sendExplorerMessage({ command: "error", message });
}

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    console.info(`[Dev Explorer] Clipboard write unavailable, value: ${text}`);
  }
}

function filterTreeItems(items: DevExplorerTreeItem[], filterText: string): DevExplorerTreeItem[] {
  const query = filterText.trim().toLowerCase();
  if (query.length === 0) {
    return items;
  }

  const visit = (item: DevExplorerTreeItem): DevExplorerTreeItem | null => {
    const filteredChildren = (item.children ?? [])
      .map((child) => visit(child))
      .filter((child): child is DevExplorerTreeItem => child !== null);
    const haystack = [item.label, item.description, item.tooltip]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();

    if (haystack.includes(query) || filteredChildren.length > 0) {
      return { ...item, children: filteredChildren };
    }
    return null;
  };

  return items.map((item) => visit(item)).filter((item): item is DevExplorerTreeItem => item !== null);
}

interface DevLocalLabFile {
  filename: string;
  path: string;
  hasAnnotations: boolean;
}

interface DevLocalFolderBranch {
  name: string;
  relativePath: string;
  folders: Map<string, DevLocalFolderBranch>;
  labs: DevExplorerTreeItem[];
}

function toPosixPath(pathValue: string): string {
  return pathValue.replace(/\\/g, "/");
}

function toFavoriteLabKey(pathValue: string): string {
  return toPosixPath(normalizeTopologyRequestPath(pathValue));
}

function isFavoriteLabPath(pathValue: string | undefined): boolean {
  if (!pathValue) {
    return false;
  }
  return favoriteLabPaths.has(toFavoriteLabKey(pathValue));
}

function createDevShareLink(sessionType: "sshx" | "gotty", labPath: string): string {
  const labKey = toFavoriteLabKey(labPath);
  const labSlug = encodeURIComponent(stripTopologySuffix(safeFilename(labKey)));
  if (sessionType === "sshx") {
    return `https://sshx.dev/dev-${labSlug}`;
  }
  return `http://localhost:8080/?lab=${labSlug}`;
}

function getShareLinksForLab(
  pathValue: string | undefined
): { sshxLink?: string; gottyLink?: string } {
  if (!pathValue) {
    return {};
  }
  const labKey = toFavoriteLabKey(pathValue);
  return {
    sshxLink: sshxShareLinksByLab.get(labKey),
    gottyLink: gottyShareLinksByLab.get(labKey)
  };
}

function buildShareNodesForLab(pathValue: string | undefined): DevExplorerTreeItem[] {
  if (!pathValue) {
    return [];
  }
  const labKey = toFavoriteLabKey(pathValue);
  const shareLinks = getShareLinksForLab(pathValue);
  const nodes: DevExplorerTreeItem[] = [];

  if (shareLinks.gottyLink) {
    nodes.push({
      id: `running-gotty-link:${labKey}`,
      label: "Web Terminal",
      tooltip: shareLinks.gottyLink,
      contextValue: "containerlabGottyLink",
      collapsibleState: TREE_ITEM_NONE,
      link: shareLinks.gottyLink,
      command: {
        command: "containerlab.lab.gotty.copyLink",
        title: "Copy GoTTY link",
        arguments: [shareLinks.gottyLink]
      },
      children: []
    });
  }

  if (shareLinks.sshxLink) {
    nodes.push({
      id: `running-sshx-link:${labKey}`,
      label: "Shared Terminal",
      tooltip: shareLinks.sshxLink,
      contextValue: "containerlabSSHXLink",
      collapsibleState: TREE_ITEM_NONE,
      link: shareLinks.sshxLink,
      command: {
        command: "containerlab.lab.sshx.copyLink",
        title: "Copy SSHX link",
        arguments: [shareLinks.sshxLink]
      },
      children: []
    });
  }

  return nodes;
}

function topologyRelativePath(pathValue: string): string {
  const normalized = toPosixPath(pathValue);
  const marker = "/topologies/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex + marker.length);
  }
  return safeFilename(pathValue);
}

interface DevContainerTooltipInput {
  name: string;
  state: string;
  status: string;
  kind: string;
  type: string;
  image: string;
  id: string;
  ipv4?: string;
  ipv6?: string;
}

function buildDevContainerTooltip(input: DevContainerTooltipInput): string {
  const lines = [
    `Name: ${input.name}`,
    `State: ${input.state}`,
    `Status: ${input.status}`,
    `Kind: ${input.kind}`,
    `Type: ${input.type}`,
    `Image: ${input.image}`,
    `ID: ${input.id}`
  ];

  if (input.ipv4 && input.ipv4 !== "N/A") {
    lines.push(`IPv4: ${input.ipv4}`);
  }
  if (input.ipv6 && input.ipv6 !== "N/A") {
    lines.push(`IPv6: ${input.ipv6}`);
  }

  return lines.join("\n");
}

function buildDevInterfaceTooltip(name: string, peer: string, mac: string): string {
  return [
    `Name: ${name}`,
    "State: up",
    "Type: veth",
    `Peer: ${peer}`,
    `MAC: ${mac}`
  ].join("\n");
}

function createMockRunningLabItem(): DevExplorerTreeItem {
  const pathValue = "test/test.clab.yml";
  const isFavorite = isFavoriteLabPath(pathValue);
  const shareLinks = getShareLinksForLab(pathValue);
  const spineStatus = "Up 18 minutes";
  const leafStatus = "Up 11 minutes";
  const image = "ghcr.io/nokia/srlinux:latest";
  const type = "ixrd2";

  const containers: DevExplorerTreeItem[] = [
    {
      id: "running-container:dev-mock-spine1",
      label: "dev-mock-spine1",
      description: spineStatus,
      tooltip: buildDevContainerTooltip({
        name: "dev-mock-spine1",
        state: "running",
        status: spineStatus,
        kind: "srl",
        type,
        image,
        id: "dev-mock-spine1",
        ipv4: "N/A",
        ipv6: "N/A"
      }),
      contextValue: "containerlabContainer",
      collapsibleState: TREE_ITEM_COLLAPSED,
      state: "running",
      status: spineStatus,
      name: "dev-mock-spine1",
      cID: "dev-mock-spine1",
      kind: "srl",
      image,
      v4Address: "N/A",
      v6Address: "N/A",
      children: [
        {
          id: "running-interface:dev-mock-spine1:0",
          label: "eth1",
          description: "dev-mock-leaf1",
          tooltip: buildDevInterfaceTooltip("eth1", "dev-mock-leaf1", "00:00:5e:00:53:01"),
          contextValue: "containerlabInterfaceUp",
          collapsibleState: TREE_ITEM_NONE,
          cID: "dev-mock-spine1",
          name: "eth1",
          mac: "00:00:5e:00:53:01"
        }
      ]
    },
    {
      id: "running-container:dev-mock-leaf1",
      label: "dev-mock-leaf1",
      description: leafStatus,
      tooltip: buildDevContainerTooltip({
        name: "dev-mock-leaf1",
        state: "running",
        status: leafStatus,
        kind: "srl",
        type,
        image,
        id: "dev-mock-leaf1",
        ipv4: "N/A",
        ipv6: "N/A"
      }),
      contextValue: "containerlabContainer",
      collapsibleState: TREE_ITEM_COLLAPSED,
      state: "running",
      status: leafStatus,
      name: "dev-mock-leaf1",
      cID: "dev-mock-leaf1",
      kind: "srl",
      image,
      v4Address: "N/A",
      v6Address: "N/A",
      children: [
        {
          id: "running-interface:dev-mock-leaf1:0",
          label: "eth1",
          description: "dev-mock-spine1",
          tooltip: buildDevInterfaceTooltip("eth1", "dev-mock-spine1", "00:00:5e:00:53:02"),
          contextValue: "containerlabInterfaceUp",
          collapsibleState: TREE_ITEM_NONE,
          cID: "dev-mock-leaf1",
          name: "eth1",
          mac: "00:00:5e:00:53:02"
        }
      ]
    }
  ];
  const shareNodes = buildShareNodesForLab(pathValue);

  const labItem: DevExplorerTreeItem = {
    id: "running-lab:dev-mock",
    label: "dev-mock-running-lab",
    description: pathValue,
    tooltip: pathValue,
    contextValue: isFavorite ? "containerlabLabDeployedFavorite" : "containerlabLabDeployed",
    collapsibleState: TREE_ITEM_COLLAPSED,
    labPath: {
      absolute: pathValue,
      relative: pathValue
    },
    children: [...shareNodes, ...containers]
  };

  if (shareLinks.sshxLink) {
    labItem.command = {
      command: "containerlab.lab.sshx.copyLink",
      title: "Copy SSHX link",
      arguments: [shareLinks.sshxLink]
    };
  } else if (shareLinks.gottyLink) {
    labItem.command = {
      command: "containerlab.lab.gotty.copyLink",
      title: "Copy GoTTY link",
      arguments: [shareLinks.gottyLink]
    };
  } else {
    labItem.command = {
      command: "containerlab.lab.graph.topoViewer",
      title: "Open TopoViewer",
      arguments: [labItem]
    };
  }

  return labItem;
}

function buildRunningLabItems(filterText: string): DevExplorerTreeItem[] {
  const items: DevExplorerTreeItem[] = [];

  if (stateManager.getDeploymentState() === "deployed") {
    const graphState = useGraphStore.getState();
    const topoState = useTopoViewerStore.getState();
    const pathValue = currentFilePath ?? topoState.yamlFileName;
    const labName = stripTopologySuffix(topoState.labName || safeFilename(pathValue || "Current Lab"));
    const labPath = pathValue || labName;
    const isFavorite = isFavoriteLabPath(labPath);
    const shareLinks = getShareLinksForLab(labPath);

    const edgeGroups = new Map<string, Array<{ peer: string; edgeId: string }>>();
    for (const edge of graphState.edges) {
      const source = String(edge.source);
      const target = String(edge.target);
      const edgeId = String(edge.id);
      const sourceList = edgeGroups.get(source) ?? [];
      sourceList.push({ peer: target, edgeId });
      edgeGroups.set(source, sourceList);
      const targetList = edgeGroups.get(target) ?? [];
      targetList.push({ peer: source, edgeId });
      edgeGroups.set(target, targetList);
    }

    const containers = graphState.nodes.map((node, index) => {
      const nodeId = String(node.id);
      const uptime = `Up ${(index + 1) * 3} minutes`;
      const nodeType = typeof node.type === "string" ? node.type : "node";
      const nodeImage = nodeType;
      const interfaces = (edgeGroups.get(nodeId) ?? []).map((entry, index) => ({
        id: `running-interface:${nodeId}:${index}`,
        label: `eth${index}`,
        description: entry.peer,
        tooltip: buildDevInterfaceTooltip(`eth${index}`, entry.peer, entry.edgeId),
        contextValue: "containerlabInterfaceUp",
        collapsibleState: TREE_ITEM_NONE,
        cID: nodeId,
        name: `eth${index}`,
        mac: entry.edgeId
      }));

      return {
        id: `running-container:${nodeId}`,
        label: nodeId,
        description: uptime,
        tooltip: buildDevContainerTooltip({
          name: nodeId,
          state: "running",
          status: uptime,
          kind: nodeType,
          type: nodeType,
          image: nodeImage,
          id: nodeId,
          ipv4: "N/A",
          ipv6: "N/A"
        }),
        contextValue: "containerlabContainer",
        collapsibleState: interfaces.length > 0 ? TREE_ITEM_COLLAPSED : TREE_ITEM_NONE,
        state: "running",
        status: uptime,
        name: nodeId,
        cID: nodeId,
        kind: nodeType,
        image: nodeImage,
        v4Address: "N/A",
        v6Address: "N/A",
        children: interfaces
      };
    });
    const shareNodes = buildShareNodesForLab(labPath);
    const labChildren = [...shareNodes, ...containers];

    const labItem: DevExplorerTreeItem = {
      id: `running-lab:${labPath}`,
      label: labName,
      description: pathValue,
      tooltip: pathValue,
      contextValue: isFavorite ? "containerlabLabDeployedFavorite" : "containerlabLabDeployed",
      collapsibleState: labChildren.length > 0 ? TREE_ITEM_COLLAPSED : TREE_ITEM_NONE,
      labPath: {
        absolute: labPath,
        relative: labPath
      },
      children: labChildren
    };
    if (shareLinks.sshxLink) {
      labItem.command = {
        command: "containerlab.lab.sshx.copyLink",
        title: "Copy SSHX link",
        arguments: [shareLinks.sshxLink]
      };
    } else if (shareLinks.gottyLink) {
      labItem.command = {
        command: "containerlab.lab.gotty.copyLink",
        title: "Copy GoTTY link",
        arguments: [shareLinks.gottyLink]
      };
    } else {
      labItem.command = {
        command: "containerlab.lab.graph.topoViewer",
        title: "Open TopoViewer",
        arguments: [labItem]
      };
    }
    items.push(labItem);
  }

  items.push(createMockRunningLabItem());
  return filterTreeItems(items, filterText);
}

async function buildLocalLabItems(filterText: string): Promise<DevExplorerTreeItem[]> {
  const localFiles = await listTopologyFiles();
  if (!Array.isArray(localFiles) || localFiles.length === 0) {
    return [];
  }

  const root: DevLocalFolderBranch = {
    name: "",
    relativePath: "",
    folders: new Map<string, DevLocalFolderBranch>(),
    labs: []
  };

  const files = localFiles as DevLocalLabFile[];
  for (const file of files) {
    const relativePath = topologyRelativePath(file.path);
    const segments = toPosixPath(relativePath).split("/").filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    const folderSegments = segments.slice(0, -1);
    let current = root;
    let currentRelativePath = "";
    for (const segment of folderSegments) {
      currentRelativePath = currentRelativePath
        ? `${currentRelativePath}/${segment}`
        : segment;
      if (!current.folders.has(segment)) {
        current.folders.set(segment, {
          name: segment,
          relativePath: currentRelativePath,
          folders: new Map<string, DevLocalFolderBranch>(),
          labs: []
        });
      }
      current = current.folders.get(segment)!;
    }

    const item: DevExplorerTreeItem = {
      id: `local-lab:${file.path}`,
      label: file.filename || safeFilename(file.path),
      description: file.path,
      tooltip: file.path,
      contextValue: isFavoriteLabPath(file.path)
        ? "containerlabLabUndeployedFavorite"
        : "containerlabLabUndeployed",
      collapsibleState: TREE_ITEM_NONE,
      labPath: {
        absolute: file.path,
        relative: relativePath
      },
      children: []
    };
    item.command = {
      command: "containerlab.lab.graph.topoViewer",
      title: "Open TopoViewer",
      arguments: [item]
    };
    current.labs.push(item);
  }

  const toTreeItems = (branch: DevLocalFolderBranch): DevExplorerTreeItem[] => {
    const labItems = [...branch.labs].sort((a, b) => String(a.label).localeCompare(String(b.label)));
    const folderItems = Array.from(branch.folders.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => ({
        id: `local-folder:${folder.relativePath}`,
        label: folder.name,
        tooltip: folder.relativePath,
        contextValue: "containerlabFolder",
        collapsibleState: TREE_ITEM_COLLAPSED,
        children: toTreeItems(folder)
      }));
    return [...labItems, ...folderItems];
  };

  return filterTreeItems(toTreeItems(root), filterText);
}

function buildHelpItems(): DevExplorerTreeItem[] {
  return HELP_LINKS.map((link) => ({
    id: `help:${link.url}`,
    label: link.label,
    tooltip: link.url,
    collapsibleState: TREE_ITEM_NONE,
    command: {
      command: "containerlab.openLink",
      title: "Open Link",
      arguments: [link.url]
    },
    children: []
  }));
}

async function buildExplorerProviders(): Promise<ExplorerSnapshotProviders> {
  const runningItems = buildRunningLabItems(explorerFilterText);
  const localItems = await buildLocalLabItems(explorerFilterText);
  const helpItems = buildHelpItems();

  return {
    runningProvider: new DevExplorerProvider(runningItems) as unknown as ExplorerSnapshotProviders["runningProvider"],
    localProvider: new DevExplorerProvider(localItems) as unknown as ExplorerSnapshotProviders["localProvider"],
    helpProvider: new DevExplorerProvider(helpItems) as unknown as ExplorerSnapshotProviders["helpProvider"]
  };
}

async function postExplorerSnapshot(): Promise<void> {
  try {
    const providers = await buildExplorerProviders();
    const options: ExplorerSnapshotOptions = {
      hideNonOwnedLabs: false,
      isLocalCaptureAllowed: true
    };
    const { snapshot, actionBindings } = await buildExplorerSnapshot(
      providers,
      explorerFilterText,
      options
    );
    explorerActionBindings = actionBindings;
    sendExplorerMessage(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postExplorerError(`Explorer refresh failed in dev mode: ${message}`);
  }
}

function scheduleExplorerSnapshot(delay = EXPLORER_REFRESH_DEBOUNCE_MS): void {
  if (explorerRefreshTimer !== null) {
    window.clearTimeout(explorerRefreshTimer);
  }
  explorerRefreshTimer = window.setTimeout(() => {
    explorerRefreshTimer = null;
    void postExplorerSnapshot();
  }, delay);
}

function firstArgAsTreeItem(args: unknown[]): DevExplorerTreeItem | undefined {
  const arg = args[0];
  if (!arg || typeof arg !== "object") {
    return undefined;
  }
  return arg as DevExplorerTreeItem;
}

function resolveLabPath(args: unknown[]): string | undefined {
  const first = args[0];
  if (typeof first === "string" && first.length > 0) {
    return normalizeTopologyRequestPath(first);
  }
  const item = firstArgAsTreeItem(args);
  if (!item) {
    return currentFilePath ? normalizeTopologyRequestPath(currentFilePath) : undefined;
  }
  if (item.labPath?.absolute) {
    return normalizeTopologyRequestPath(item.labPath.absolute);
  }
  if (typeof item.description === "string" && item.description.includes(".clab.")) {
    return normalizeTopologyRequestPath(item.description);
  }
  return currentFilePath ? normalizeTopologyRequestPath(currentFilePath) : undefined;
}

async function setDeploymentStateAndRefresh(
  state: "deployed" | "undeployed" | "unknown",
  labPath?: string
): Promise<void> {
  stateManager.setDeploymentState(state);
  syncHostContext({ deploymentState: state });
  if (state !== "deployed") {
    sshxShareLinksByLab.clear();
    gottyShareLinksByLab.clear();
  }
  if (labPath) {
    await loadTopologyFile(labPath);
    return;
  }
  await refreshTopologySnapshot();
}

function openExternalLink(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function executeExplorerCommand(commandId: string, args: unknown[]): Promise<void> {
  const item = firstArgAsTreeItem(args);
  const labPath = resolveLabPath(args);

  switch (commandId) {
    case "containerlab.openLink": {
      const link = typeof args[0] === "string" ? args[0] : undefined;
      if (link) {
        openExternalLink(link);
      }
      return;
    }
    case "containerlab.lab.graph.topoViewer":
    case "containerlab.lab.openFile":
    case "containerlab.editor.topoViewerEditor.open": {
      if (labPath) {
        await loadTopologyFile(labPath);
      }
      return;
    }
    case "containerlab.lab.copyPath": {
      if (labPath) {
        await copyTextToClipboard(labPath);
      }
      return;
    }
    case "containerlab.lab.toggleFavorite": {
      if (!labPath) {
        return;
      }
      const favoriteKey = toFavoriteLabKey(labPath);
      if (favoriteLabPaths.has(favoriteKey)) {
        favoriteLabPaths.delete(favoriteKey);
      } else {
        favoriteLabPaths.add(favoriteKey);
      }
      return;
    }
    case "containerlab.lab.sshx.attach":
    case "containerlab.lab.sshx.reattach":
    case "containerlab.lab.sshx.detach": {
      if (!labPath) {
        return;
      }
      const labKey = toFavoriteLabKey(labPath);
      if (commandId.endsWith(".detach")) {
        sshxShareLinksByLab.delete(labKey);
      } else if (!sshxShareLinksByLab.has(labKey)) {
        sshxShareLinksByLab.set(labKey, createDevShareLink("sshx", labPath));
      }
      return;
    }
    case "containerlab.lab.gotty.attach":
    case "containerlab.lab.gotty.reattach":
    case "containerlab.lab.gotty.detach": {
      if (!labPath) {
        return;
      }
      const labKey = toFavoriteLabKey(labPath);
      if (commandId.endsWith(".detach")) {
        gottyShareLinksByLab.delete(labKey);
      } else if (!gottyShareLinksByLab.has(labKey)) {
        gottyShareLinksByLab.set(labKey, createDevShareLink("gotty", labPath));
      }
      return;
    }
    case "containerlab.lab.deploy":
    case "containerlab.lab.deploy.cleanup":
    case "containerlab.lab.deploy.specificFile": {
      await setDeploymentStateAndRefresh("deployed", labPath);
      return;
    }
    case "containerlab.lab.destroy":
    case "containerlab.lab.destroy.cleanup": {
      await setDeploymentStateAndRefresh("undeployed");
      return;
    }
    case "containerlab.lab.redeploy":
    case "containerlab.lab.redeploy.cleanup": {
      await setDeploymentStateAndRefresh("deployed", labPath);
      return;
    }
    case "containerlab.node.copyName": {
      await copyTextToClipboard(item?.name || item?.label || "");
      return;
    }
    case "containerlab.node.copyID": {
      await copyTextToClipboard(item?.cID || "");
      return;
    }
    case "containerlab.node.copyKind": {
      await copyTextToClipboard(item?.kind || "");
      return;
    }
    case "containerlab.node.copyImage": {
      await copyTextToClipboard(item?.image || "");
      return;
    }
    case "containerlab.node.copyIPv4Address": {
      await copyTextToClipboard(item?.v4Address || "");
      return;
    }
    case "containerlab.node.copyIPv6Address": {
      await copyTextToClipboard(item?.v6Address || "");
      return;
    }
    case "containerlab.interface.copyMACAddress": {
      await copyTextToClipboard(item?.mac || "");
      return;
    }
    case "containerlab.lab.sshx.copyLink":
    case "containerlab.lab.gotty.copyLink": {
      const link = typeof args[0] === "string" ? args[0] : item?.link;
      if (link) {
        await copyTextToClipboard(link);
      }
      return;
    }
    default: {
      if (!unhandledExplorerCommands.has(commandId)) {
        unhandledExplorerCommands.add(commandId);
        console.info(`[Dev Explorer] Command not implemented in dev mode: ${commandId}`);
      }
    }
  }
}

(window as unknown as { __DEV__: DevServerInterface }).__DEV__.onHostUpdate = () => {
  scheduleExplorerSnapshot();
};

console.log(
  "%c[React TopoViewer - Dev Mode]",
  "color: #E91E63; font-weight: bold; font-size: 14px;"
);
console.log("%cFile operations:", "color: #4CAF50; font-weight: bold;");
console.log('  __DEV__.loadTopologyFile("/path/to/file.clab.yml")');
console.log("  __DEV__.listTopologyFiles()");
console.log("  __DEV__.resetFiles()");
console.log("  __DEV__.getCurrentFile()");
console.log("");
console.log("%cMode and state:", "color: #2196F3; font-weight: bold;");
console.log('  __DEV__.setMode("edit" | "view")');
console.log('  __DEV__.setDeploymentState("deployed" | "undeployed")');

// Dev mode command interceptor — mocks window.vscode.postMessage for HTTP.
function setupDevModeCommandInterceptor(): void {
  type DevVscodeMessage = {
    command?: string;
    type?: string;
    level?: string;
    message?: string;
    fileLine?: string;
    actionRef?: string;
    value?: string;
    state?: ExplorerUiState;
    requestId?: string;
    baseName?: string;
    svgContent?: string;
    dashboardJson?: string;
    panelYaml?: string;
  };

  const warnedCommands = new Set<string>();
  const logLevelMap: Record<string, (...args: unknown[]) => void> = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };

  const warnOnce = (command: string) => {
    if (warnedCommands.has(command)) return;
    warnedCommands.add(command);
    console.warn(`[Dev] Unhandled VS Code command: ${command}`);
  };

  const postToWebview = (data: Record<string, unknown>): void => {
    window.dispatchEvent(new MessageEvent("message", { data }));
  };

  const triggerDownload = (filename: string, content: string, mimeType: string): void => {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const sanitizeBaseName = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return "topology";
    const withoutSvg = trimmed.replace(/\.svg$/i, "");
    const sanitized = withoutSvg
      .split("")
      .map((char) => {
        const code = char.charCodeAt(0);
        const isInvalid = code < 32 || "<>:\"/\\|?*".includes(char);
        return isInvalid ? "-" : char;
      })
      .join("")
      .trim();
    return sanitized || "topology";
  };

  const handleGrafanaBundleExport = (msg: DevVscodeMessage): void => {
    const requestId = typeof msg.requestId === "string" ? msg.requestId.trim() : "";
    const svgContent = typeof msg.svgContent === "string" ? msg.svgContent : "";
    const dashboardJson = typeof msg.dashboardJson === "string" ? msg.dashboardJson : "";
    const panelYaml = typeof msg.panelYaml === "string" ? msg.panelYaml : "";
    const baseName = sanitizeBaseName(typeof msg.baseName === "string" ? msg.baseName : "topology");

    if (!requestId || !svgContent || !dashboardJson || !panelYaml) {
      postToWebview({
        type: MSG_SVG_EXPORT_RESULT,
        requestId,
        success: false,
        error: "Invalid SVG Grafana export payload"
      });
      return;
    }

    try {
      const svgFilename = `${baseName}.svg`;
      const dashboardFilename = `${baseName}.grafana.json`;
      const panelFilename = `${baseName}.flow_panel.yaml`;

      triggerDownload(svgFilename, svgContent, "image/svg+xml");
      triggerDownload(dashboardFilename, dashboardJson, "application/json");
      triggerDownload(panelFilename, panelYaml, "application/x-yaml");

      postToWebview({
        type: MSG_SVG_EXPORT_RESULT,
        requestId,
        success: true,
        files: [svgFilename, dashboardFilename, panelFilename]
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      postToWebview({
        type: MSG_SVG_EXPORT_RESULT,
        requestId,
        success: false,
        error: message
      });
    }
  };

  const handleViewerLog = (msg: DevVscodeMessage) => {
    const level = typeof msg.level === "string" ? msg.level : "info";
    const logger = logLevelMap[level] ?? console.log.bind(console);
    const fileLine = typeof msg.fileLine === "string" ? msg.fileLine : "";
    const message = typeof msg.message === "string" ? msg.message : "";
    const prefix = fileLine ? `[${fileLine}] ` : "";
    logger(`${prefix}${message}`);
  };

  const isExplorerOutgoingMessage = (
    message: DevVscodeMessage
  ): message is ExplorerOutgoingMessage => {
    return (
      message.command === "ready" ||
      message.command === "setFilter" ||
      message.command === "invokeAction" ||
      message.command === "requestRefresh" ||
      message.command === "persistUiState"
    );
  };

  const handleExplorerMessage = (message: ExplorerOutgoingMessage): void => {
    if (message.command === "ready") {
      postExplorerFilterState();
      postExplorerUiState();
      scheduleExplorerSnapshot(0);
      return;
    }

    if (message.command === "setFilter") {
      explorerFilterText = message.value.trim();
      postExplorerFilterState();
      scheduleExplorerSnapshot(0);
      return;
    }

    if (message.command === "persistUiState") {
      explorerUiState = message.state || {};
      return;
    }

    if (message.command === "requestRefresh") {
      scheduleExplorerSnapshot(0);
      return;
    }

    if (message.command === "invokeAction") {
      const binding = explorerActionBindings.get(message.actionRef);
      if (!binding) {
        postExplorerError("Action is no longer available. Refresh the explorer and try again.");
        return;
      }

      Promise.resolve(executeExplorerCommand(binding.commandId, binding.args ?? []))
        .then(() => {
          scheduleExplorerSnapshot(0);
        })
        .catch((error: unknown) => {
          const actionError = error instanceof Error ? error.message : String(error);
          postExplorerError(`Failed to execute action: ${actionError}`);
        });
    }
  };

  const commandHandlers: Record<string, (msg: DevVscodeMessage) => void> = {
    reactTopoViewerLog: handleViewerLog,
    topoViewerLog: handleViewerLog,
    [EXPORT_COMMANDS.EXPORT_SVG_GRAFANA_BUNDLE]: handleGrafanaBundleExport
  };

  // Create a mock vscode API that intercepts postMessage calls
  const mockVscodeApi = {
    __isDevMock__: true,
    postMessage: (message: unknown) => {
      const msg = message as DevVscodeMessage | undefined;

      // Ignore topology-host messages - these should use HTTP in dev mode
      if (msg?.type?.startsWith("topology-host:")) {
        return;
      }

      if (!msg?.command) return;

      if (isExplorerOutgoingMessage(msg)) {
        handleExplorerMessage(msg);
        return;
      }

      const handler = commandHandlers[msg.command];
      if (handler) {
        handler(msg);
        return;
      }

      warnOnce(msg.command);
    }
  };

  // Expose the mock API on window.vscode
  (window as unknown as { vscode: typeof mockVscodeApi }).vscode = mockVscodeApi;
}

// Dev Overlay

function mountDevOverlay(): void {
  const container = document.getElementById("dev-overlay");
  if (!container) return;

  const detectMode = () =>
    document.documentElement.classList.contains("light") ? ("light" as const) : ("dark" as const);

  function DevOverlayWrapper() {
    const handleToggleTheme = React.useCallback(() => {
      document.documentElement.classList.toggle("light");
      applyDevVars(detectMode());
    }, []);

    return (
      <ThemeProvider theme={vscodeTheme}>
        <CssBaseline enableColorScheme />
        <DevSettingsOverlay
          stateManager={stateManager}
          loadTopologyFile={loadTopologyFile}
          listTopologyFiles={listTopologyFiles}
          resetFiles={resetFiles}
          getCurrentFile={() => currentFilePath}
          setMode={(mode) => {
            (window as unknown as { __DEV__: { setMode: (m: string) => void } }).__DEV__.setMode(
              mode
            );
          }}
          onToggleTheme={handleToggleTheme}
        />
      </ThemeProvider>
    );
  }

  createRoot(container).render(<DevOverlayWrapper />);
}

// Bootstrap

applyDevVars("dark");
setupDevModeCommandInterceptor();
subscribeToFileChanges();
mountDevOverlay();
void loadTopologyFile(DEFAULT_TOPOLOGY);
