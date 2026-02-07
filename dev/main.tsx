/**
 * Dev Mode Entry Point for React TopoViewer (Host-authoritative)
 */
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { App } from "@webview/App";
import type { CustomNodeTemplate } from "@shared/types/editors";
import type { CustomIconInfo } from "@shared/types/icons";
import "@webview/styles/global.css";
import * as monaco from "monaco-editor";
import "monaco-editor/min/vs/editor/editor.main.css";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import { conf as yamlConf, language as yamlLanguage } from "monaco-editor/esm/vs/basic-languages/yaml/yaml";

import { setHostContext } from "@webview/services/topologyHostClient";
import { refreshTopologySnapshot } from "@webview/services/topologyHostCommands";

import { DevStateManager } from "./mock/DevState";
import { sampleCustomNodes, sampleCustomIcons } from "./mockData";

import clabSchema from "../schema/clab.schema.json";
import { parseSchemaData } from "@shared/schema";
import type { SchemaData } from "@shared/schema";

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
  clearSplitViewSaveTimers();
  setYamlDirty(false);
  setAnnotationsDirty(false);
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
const SPLIT_VIEW_REFRESH_DEBOUNCE_MS = 200;
const MONACO_THEME_LIGHT = "dev-vscode-light";
const MONACO_THEME_DARK = "dev-vscode-dark";
const SPLIT_VIEW_FONT_FAMILY = "Consolas, Monaco, 'Courier New', monospace";
const YAML_DIRTY_ID = "splitViewYamlDirty";
const ANNOT_DIRTY_ID = "splitViewAnnotDirty";
const YAML_SAVE_ID = "splitViewYamlSave";
const ANNOT_SAVE_ID = "splitViewAnnotSave";
const SAVE_ALL_ID = "splitViewSaveAll";

let yamlEditor: monaco.editor.IStandaloneCodeEditor | null = null;
let annotationsEditor: monaco.editor.IStandaloneCodeEditor | null = null;
let yamlModel: monaco.editor.ITextModel | null = null;
let annotationsModel: monaco.editor.ITextModel | null = null;
let yamlRemoteUpdate = false;
let annotationsRemoteUpdate = false;
let splitViewRefreshTimer: number | null = null;
let splitViewLayoutListenerBound = false;
let monacoInitialized = false;
let yamlLanguageRegistered = false;
let yamlDirty = false;
let annotationsDirty = false;

function registerYamlLanguage(): void {
  if (yamlLanguageRegistered) return;
  if (monaco.languages.getLanguages().some((lang) => lang.id === "yaml")) {
    yamlLanguageRegistered = true;
    return;
  }

  monaco.languages.register({ id: "yaml" });
  monaco.languages.setMonarchTokensProvider("yaml", yamlLanguage);
  monaco.languages.setLanguageConfiguration("yaml", yamlConf);
  yamlLanguageRegistered = true;
}

function getCssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function applyMonacoTheme(): void {
  const isLight = document.documentElement.classList.contains("light");
  const themeName = isLight ? MONACO_THEME_LIGHT : MONACO_THEME_DARK;
  const background = getCssVar("--vscode-editor-background", isLight ? "#ffffff" : "#1e1e1e");
  const foreground = getCssVar("--vscode-editor-foreground", isLight ? "#333333" : "#cccccc");
  const selection = getCssVar("--vscode-editor-selectionBackground", isLight ? "#add6ff" : "#264f78");
  const inactiveSelection = getCssVar(
    "--vscode-editor-inactiveSelectionBackground",
    isLight ? "#e5ebf1" : "#3a3d41"
  );

  monaco.editor.defineTheme(themeName, {
    base: isLight ? "vs" : "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": background,
      "editor.foreground": foreground,
      "editor.selectionBackground": selection,
      "editor.inactiveSelectionBackground": inactiveSelection
    }
  });

  monaco.editor.setTheme(themeName);
}

function ensureMonacoInitialized(): void {
  if (monacoInitialized) return;
  registerYamlLanguage();
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: false });
  applyMonacoTheme();
  monacoInitialized = true;
}

function layoutSplitViewEditors(): void {
  yamlEditor?.layout();
  annotationsEditor?.layout();
}

function scheduleSplitViewLayout(): void {
  if (!yamlEditor && !annotationsEditor) return;
  requestAnimationFrame(() => {
    layoutSplitViewEditors();
    window.setTimeout(layoutSplitViewEditors, 350);
  });
}

function clearSplitViewSaveTimers(): void {
  if (splitViewRefreshTimer) {
    window.clearTimeout(splitViewRefreshTimer);
    splitViewRefreshTimer = null;
  }
}

async function writeSplitViewFile(filePath: string, content: string): Promise<void> {
  const url = sessionId
    ? `/file/${encodeURIComponent(filePath)}?sessionId=${sessionId}`
    : `/file/${encodeURIComponent(filePath)}`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      },
      body: content
    });

    if (!response.ok) {
      console.error(`[Dev] Failed to write file: ${filePath}`, response.statusText);
    }
  } catch (error) {
    console.error(`[Dev] Failed to write file: ${filePath}`, error);
  }
}

function scheduleSplitViewRefresh(): void {
  if (!splitViewOpen || !currentFilePath) return;
  if (splitViewRefreshTimer) {
    window.clearTimeout(splitViewRefreshTimer);
  }
  splitViewRefreshTimer = window.setTimeout(() => {
    if (!splitViewOpen || !currentFilePath) return;
    void updateSplitViewContent();
  }, SPLIT_VIEW_REFRESH_DEBOUNCE_MS);
}

function updateDirtyUI(): void {
  const yamlDirtyEl = document.getElementById(YAML_DIRTY_ID);
  const annotDirtyEl = document.getElementById(ANNOT_DIRTY_ID);
  const yamlSaveBtn = document.getElementById(YAML_SAVE_ID) as HTMLButtonElement | null;
  const annotSaveBtn = document.getElementById(ANNOT_SAVE_ID) as HTMLButtonElement | null;
  const saveAllBtn = document.getElementById(SAVE_ALL_ID) as HTMLButtonElement | null;

  if (yamlDirtyEl) {
    yamlDirtyEl.style.visibility = yamlDirty ? "visible" : "hidden";
  }
  if (annotDirtyEl) {
    annotDirtyEl.style.visibility = annotationsDirty ? "visible" : "hidden";
  }
  if (yamlSaveBtn) {
    yamlSaveBtn.disabled = !yamlDirty;
  }
  if (annotSaveBtn) {
    annotSaveBtn.disabled = !annotationsDirty;
  }
  if (saveAllBtn) {
    saveAllBtn.disabled = !(yamlDirty || annotationsDirty);
  }
}

function setYamlDirty(next: boolean): void {
  yamlDirty = next;
  updateDirtyUI();
}

function setAnnotationsDirty(next: boolean): void {
  annotationsDirty = next;
  updateDirtyUI();
}

async function saveYamlFromEditor(): Promise<void> {
  if (!currentFilePath || !yamlModel) return;
  await writeSplitViewFile(currentFilePath, yamlModel.getValue());
  setYamlDirty(false);
}

async function saveAnnotationsFromEditor(): Promise<void> {
  if (!currentFilePath || !annotationsModel) return;
  await writeSplitViewFile(`${currentFilePath}.annotations.json`, annotationsModel.getValue());
  setAnnotationsDirty(false);
}

async function saveAllFromEditor(): Promise<void> {
  await Promise.all([saveYamlFromEditor(), saveAnnotationsFromEditor()]);
}

function ensureSplitViewEditors(): void {
  if (yamlEditor && annotationsEditor) return;

  const yamlContainer = document.getElementById("yamlEditor");
  const annotationsContainer = document.getElementById("annotationsEditor");

  if (!yamlContainer || !annotationsContainer) {
    console.warn("[Dev] Split view editor containers not found");
    return;
  }

  ensureMonacoInitialized();

  yamlModel = monaco.editor.createModel("# Loading...", "yaml");
  annotationsModel = monaco.editor.createModel("{}", "json");

  yamlEditor = monaco.editor.create(yamlContainer, {
    model: yamlModel,
    minimap: { enabled: false },
    wordWrap: "on",
    fontFamily: SPLIT_VIEW_FONT_FAMILY,
    fontSize: 12,
    scrollBeyondLastLine: false,
    padding: { top: 8, bottom: 8 },
    automaticLayout: false
  });

  annotationsEditor = monaco.editor.create(annotationsContainer, {
    model: annotationsModel,
    minimap: { enabled: false },
    wordWrap: "on",
    fontFamily: SPLIT_VIEW_FONT_FAMILY,
    fontSize: 12,
    scrollBeyondLastLine: false,
    padding: { top: 8, bottom: 8 },
    automaticLayout: false
  });

  yamlEditor.onDidChangeModelContent(() => {
    if (yamlRemoteUpdate || !currentFilePath) return;
    setYamlDirty(true);
  });

  annotationsEditor.onDidChangeModelContent(() => {
    if (annotationsRemoteUpdate || !currentFilePath) return;
    setAnnotationsDirty(true);
  });

  if (!splitViewLayoutListenerBound) {
    window.addEventListener("resize", layoutSplitViewEditors);
    splitViewLayoutListenerBound = true;
  }

  scheduleSplitViewLayout();
}

function setYamlContent(value: string): void {
  if (!yamlModel) return;
  if (yamlModel.getValue() === value) return;
  if (yamlDirty) {
    console.warn("[Dev] Skipping YAML refresh; editor has unsaved changes.");
    return;
  }
  yamlRemoteUpdate = true;
  yamlModel.setValue(value);
  yamlRemoteUpdate = false;
  setYamlDirty(false);
}

function setAnnotationsContent(value: string): void {
  if (!annotationsModel) return;
  if (annotationsModel.getValue() === value) return;
  if (annotationsDirty) {
    console.warn("[Dev] Skipping annotations refresh; editor has unsaved changes.");
    return;
  }
  annotationsRemoteUpdate = true;
  annotationsModel.setValue(value);
  annotationsRemoteUpdate = false;
  setAnnotationsDirty(false);
}

function updateSplitViewTheme(): void {
  applyMonacoTheme();
}

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
    ensureSplitViewEditors();
    await updateSplitViewContent();
    scheduleSplitViewLayout();
    updateDirtyUI();
  }
}

async function updateSplitViewContent(): Promise<void> {
  if (!currentFilePath) return;

  const filePathLabel = document.getElementById("splitViewFilePath");
  const yamlLabel = document.getElementById("splitViewYamlLabel");
  const annotLabel = document.getElementById("splitViewAnnotLabel");

  ensureSplitViewEditors();

  if (!yamlModel || !annotationsModel) return;

  const filename = currentFilePath.split("/").pop() || currentFilePath;
  if (filePathLabel) filePathLabel.textContent = `File: ${filename}`;
  if (yamlLabel) yamlLabel.textContent = filename;
  if (annotLabel) annotLabel.textContent = `${filename}.annotations.json`;

  updateDirtyUI();

  try {
    // Fetch YAML content
    const yamlUrl = sessionId
      ? `/file/${encodeURIComponent(currentFilePath)}?sessionId=${sessionId}`
      : `/file/${encodeURIComponent(currentFilePath)}`;
    const yamlResponse = await fetch(yamlUrl);
    if (yamlResponse.ok) {
      setYamlContent(await yamlResponse.text());
    } else {
      setYamlContent("# Failed to load YAML file");
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
        setAnnotationsContent(JSON.stringify(parsed, null, 2));
      } catch {
        setAnnotationsContent(annotText);
      }
    } else {
      setAnnotationsContent("{}");
    }
  } catch (error) {
    console.error("[Dev] Failed to update split view content:", error);
    setYamlContent("# Error loading content");
    setAnnotationsContent("{}");
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
  updateSplitViewTheme: () => void;
  onHostUpdate: () => void;
  saveSplitViewYaml: () => Promise<void>;
  saveSplitViewAnnotations: () => Promise<void>;
  saveSplitViewAll: () => Promise<void>;
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
  updateSplitViewTheme,
  onHostUpdate: scheduleSplitViewRefresh,
  saveSplitViewYaml: saveYamlFromEditor,
  saveSplitViewAnnotations: saveAnnotationsFromEditor,
  saveSplitViewAll: saveAllFromEditor,
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
