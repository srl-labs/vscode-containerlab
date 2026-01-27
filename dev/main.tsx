/**
 * Dev Mode Entry Point for React TopoViewer (Host-authoritative)
 */
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { App } from "@webview/App";
import type { CustomNodeTemplate } from "@shared/types/editors";
import type { CustomIconInfo } from "@shared/types/icons";
import "@webview/styles/tailwind.css";

import { setHostContext } from "../src/reactTopoViewer/webview/services/topologyHostClient";
import { refreshTopologySnapshot } from "../src/reactTopoViewer/webview/services/topologyHostCommands";

import { DevStateManager } from "./mock/DevState";
import { sampleCustomNodes, sampleCustomIcons } from "./mockData";

import clabSchema from "../schema/clab.schema.json";
import { parseSchemaData } from "@shared/schema";
import type { SchemaData } from "@shared/schema";

// ============================================================================
// Session Management
// ============================================================================

function getSessionId(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("sessionId");
}

const sessionId = getSessionId();
if (sessionId) {
  console.log(`%c[Dev] Session ID: ${sessionId}`, "color: #9C27B0;");
}

// ============================================================================
// Dev State
// ============================================================================

const stateManager = new DevStateManager({
  mode: "edit",
  deploymentState: "undeployed",
  customNodes: sampleCustomNodes as CustomNodeTemplate[]
});

// ============================================================================
// Initial Bootstrap Data (non-topology)
// ============================================================================

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

// ============================================================================
// Render App
// ============================================================================

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

// ============================================================================
// Topology Loading
// ============================================================================

const TOPOLOGIES_DIR = "./dev/topologies";
const DEFAULT_TOPOLOGY = `${TOPOLOGIES_DIR}/simple.clab.yml`;

let currentFilePath: string | null = null;

async function loadTopologyFile(filePath: string): Promise<void> {
  console.log(`%c[Dev] Loading topology: ${filePath}`, "color: #2196F3;");
  currentFilePath = filePath;
  stateManager.setLoadedFile(filePath);

  setHostContext({
    path: filePath,
    mode: stateManager.getMode(),
    deploymentState: stateManager.getDeploymentState(),
    sessionId: sessionId ?? undefined
  });

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

// ============================================================================
// External File Changes (SSE)
// ============================================================================

function subscribeToFileChanges(): void {
  const url = sessionId ? `/api/events?sessionId=${sessionId}` : "/api/events";
  const source = new EventSource(url);
  source.addEventListener("file-changed", (event) => {
    if (!currentFilePath) return;
    const message = (event as MessageEvent).data;
    if (!message) return;
    try {
      const payload = JSON.parse(message) as { path?: string; type?: string };
      const filename = currentFilePath.split("/").pop();
      if (!filename || payload.type !== "yaml") return;
      if (payload.path !== filename) return;
      void refreshTopologySnapshot();
    } catch (err) {
      console.warn("[Dev] Failed to parse SSE message", err);
    }
  });
}

// ============================================================================
// Window Globals for Dev Console
// ============================================================================

interface DevServerInterface {
  loadTopologyFile: (filePath: string) => Promise<void>;
  listTopologyFiles: () => Promise<
    Array<{ filename: string; path: string; hasAnnotations: boolean }>
  >;
  resetFiles: () => Promise<void>;
  getCurrentFile: () => string | null;
  setMode: (mode: "edit" | "view") => void;
  setDeploymentState: (state: "deployed" | "undeployed" | "unknown") => void;
  stateManager: DevStateManager;
}

(window as unknown as { __DEV__: DevServerInterface }).__DEV__ = {
  loadTopologyFile,
  listTopologyFiles,
  resetFiles,
  getCurrentFile: () => currentFilePath,
  setMode: (mode: "edit" | "view") => {
    stateManager.setMode(mode);
    setHostContext({
      path: currentFilePath ?? DEFAULT_TOPOLOGY,
      mode: mode,
      deploymentState: stateManager.getDeploymentState(),
      sessionId: sessionId ?? undefined
    });
    void refreshTopologySnapshot();
  },
  setDeploymentState: (state: "deployed" | "undeployed" | "unknown") => {
    stateManager.setDeploymentState(state);
    setHostContext({
      path: currentFilePath ?? DEFAULT_TOPOLOGY,
      mode: stateManager.getMode(),
      deploymentState: state,
      sessionId: sessionId ?? undefined
    });
    void refreshTopologySnapshot();
  },
  stateManager
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

// ============================================================================
// Bootstrap
// ============================================================================

subscribeToFileChanges();
void loadTopologyFile(DEFAULT_TOPOLOGY);
