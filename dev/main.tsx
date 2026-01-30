/**
 * Dev Mode Entry Point for React TopoViewer (Host-authoritative)
 */
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { App } from "@webview/App";
import type { CustomNodeTemplate } from "@shared/types/editors";
import type { CustomIconInfo } from "@shared/types/icons";
import "@webview/styles/tailwind.css";

import { setHostContext } from "@webview/services/topologyHostClient";
import { refreshTopologySnapshot } from "@webview/services/topologyHostCommands";

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

  // Update split view if open
  if (splitViewOpen) {
    await updateSplitViewContent();
  }
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
// Split View
// ============================================================================

let splitViewOpen = false;

async function toggleSplitView(): Promise<void> {
  const panel = document.getElementById("splitViewPanel");
  const root = document.getElementById("root");
  const splitViewBtn = document.getElementById("splitViewBtn");

  if (!panel || !root) {
    console.warn("[Dev] Split view panel or root element not found");
    return;
  }

  splitViewOpen = !splitViewOpen;
  panel.classList.toggle("open", splitViewOpen);
  root.classList.toggle("split-view-active", splitViewOpen);
  splitViewBtn?.classList.toggle("active", splitViewOpen);

  if (splitViewOpen && currentFilePath) {
    await updateSplitViewContent();
  }
}

async function updateSplitViewContent(): Promise<void> {
  if (!currentFilePath) return;

  const yamlContent = document.getElementById("yamlContent");
  const annotationsContent = document.getElementById("annotationsContent");
  const filePathLabel = document.getElementById("splitViewFilePath");
  const yamlLabel = document.getElementById("splitViewYamlLabel");
  const annotLabel = document.getElementById("splitViewAnnotLabel");

  if (!yamlContent || !annotationsContent) return;

  const filename = currentFilePath.split("/").pop() || currentFilePath;
  if (filePathLabel) filePathLabel.textContent = `File: ${filename}`;
  if (yamlLabel) yamlLabel.textContent = filename;
  if (annotLabel) annotLabel.textContent = `${filename}.annotations.json`;

  try {
    // Fetch YAML content
    const yamlUrl = sessionId
      ? `/file/${encodeURIComponent(currentFilePath)}?sessionId=${sessionId}`
      : `/file/${encodeURIComponent(currentFilePath)}`;
    const yamlResponse = await fetch(yamlUrl);
    if (yamlResponse.ok) {
      yamlContent.textContent = await yamlResponse.text();
    } else {
      yamlContent.textContent = "# Failed to load YAML file";
    }

    // Fetch annotations content
    const annotPath = `${currentFilePath}.annotations.json`;
    const annotUrl = sessionId
      ? `/file/${encodeURIComponent(annotPath)}?sessionId=${sessionId}`
      : `/file/${encodeURIComponent(annotPath)}`;
    const annotResponse = await fetch(annotUrl);
    if (annotResponse.ok) {
      const annotText = await annotResponse.text();
      try {
        const parsed = JSON.parse(annotText);
        annotationsContent.textContent = JSON.stringify(parsed, null, 2);
      } catch {
        annotationsContent.textContent = annotText;
      }
    } else {
      annotationsContent.textContent = "{}";
    }
  } catch (error) {
    console.error("[Dev] Failed to update split view content:", error);
    yamlContent.textContent = "# Error loading content";
    annotationsContent.textContent = "{}";
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
      if (!filename) return;

      const isYamlChange = payload.type === "yaml" && payload.path === filename;
      const isAnnotationsChange =
        payload.type === "annotations" && payload.path === `${filename}.annotations.json`;

      // Refresh topology on YAML or annotations changes
      if (isYamlChange || isAnnotationsChange) {
        void refreshTopologySnapshot({ externalChange: true });
      }

      // Refresh split view on any file change for current topology
      if (
        splitViewOpen &&
        (payload.path === filename || payload.path === `${filename}.annotations.json`)
      ) {
        void updateSplitViewContent();
      }
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
  toggleSplitView: () => Promise<void>;
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
  toggleSplitView,
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
console.log("");
console.log("%cSplit view:", "color: #9C27B0; font-weight: bold;");
console.log("  __DEV__.toggleSplitView()");

// ============================================================================
// Dev Mode Command Interceptor
// ============================================================================

/**
 * In VS Code, the webview sends commands via window.vscode.postMessage().
 * In dev mode, we don't have VS Code, so we intercept these commands here.
 *
 * We mark the mock with __isDevMock__ so topologyHostClient.ts knows to use
 * HTTP endpoints instead of VS Code messaging for topology operations.
 */
function setupDevModeCommandInterceptor(): void {
  type DevVscodeMessage = {
    command?: string;
    type?: string;
    level?: string;
    message?: string;
    fileLine?: string;
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

  const handleViewerLog = (msg: DevVscodeMessage) => {
    const level = typeof msg.level === "string" ? msg.level : "info";
    const logger = logLevelMap[level] ?? console.log.bind(console);
    const fileLine = typeof msg.fileLine === "string" ? msg.fileLine : "";
    const message = typeof msg.message === "string" ? msg.message : "";
    const prefix = fileLine ? `[${fileLine}] ` : "";
    logger(`${prefix}${message}`);
  };

  const commandHandlers: Record<string, (msg: DevVscodeMessage) => void> = {
    "topo-toggle-split-view": () => {
      void toggleSplitView();
    },
    reactTopoViewerLog: handleViewerLog,
    topoViewerLog: handleViewerLog
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

// ============================================================================
// Bootstrap
// ============================================================================

setupDevModeCommandInterceptor();
subscribeToFileChanges();
void loadTopologyFile(DEFAULT_TOPOLOGY);
