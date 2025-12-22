/**
 * Dev Mode Entry Point for React TopoViewer
 *
 * This file bootstraps the React TopoViewer in standalone mode (outside VS Code).
 *
 * Architecture:
 * - HttpFsAdapter: Provides file I/O via HTTP to the dev server
 * - TopologyIO/AnnotationsIO: Run in browser for YAML manipulation
 * - TopologyParser: Runs in browser for YAML → Cytoscape conversion
 * - Dev server: Thin file I/O layer only (/file/:path, /files, /reset)
 *
 * Key behavior:
 * - Loads default topology BEFORE React renders (no placeholder state)
 * - Switching topologies triggers a FULL re-render for clean state reset
 */
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { App } from '@webview/App';
import { TopoViewerProvider } from '@webview/context/TopoViewerContext';
import type { CustomNodeTemplate } from '@shared/types/editors';
import '@webview/styles/tailwind.css';

// File system adapter for dev server
import { HttpFsAdapter } from '../src/reactTopoViewer/webview/adapters/HttpFsAdapter';
import { initializeServices, getTopologyIO, getAnnotationsIO } from '../src/reactTopoViewer/webview/services';
import { TopologyParser } from '../src/reactTopoViewer/shared/parsing';
import type { TopologyAnnotations } from '../src/reactTopoViewer/shared/types/topology';

// Mock state for mode/deployment (not file-based)
import { DevStateManager } from './mock/DevState';
import { LatencySimulator } from './mock/LatencySimulator';

// Mock data for initial state
import { sampleCustomNodes } from './mockData';

// Schema parsing - import JSON directly and use shared parser
import clabSchema from '../schema/clab.schema.json';
import { parseSchemaData } from '@shared/schema';

// Types
import type { SchemaData } from '@shared/schema';

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get session ID from URL parameter (for test isolation)
 */
function getSessionId(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('sessionId');
}

// Initialize session ID early
const sessionId = getSessionId();
if (sessionId) {
  console.log(`%c[Dev] Session ID: ${sessionId}`, 'color: #9C27B0;');
}

// ============================================================================
// Initialize Services
// ============================================================================

// Create file system adapter for dev server
const fsAdapter = new HttpFsAdapter('', sessionId);

// Initialize the I/O services (TopologyIO, AnnotationsIO)
initializeServices(fsAdapter, { verbose: true });

// ============================================================================
// Dev State Manager (for mode/deployment state, not file-based)
// ============================================================================

const stateManager = new DevStateManager({
  mode: 'edit',
  deploymentState: 'undeployed',
  customNodes: sampleCustomNodes,
});

const latencySimulator = new LatencySimulator({
  profile: 'fast',
  jitter: 0.2,
  verbose: false
});

// Track current file path
let currentFilePath: string | null = null;

// React root (created once, reused for re-renders)
let reactRoot: ReactRoot | null = null;

// Parse schema data once (static)
const schemaData = parseSchemaData(clabSchema as Record<string, unknown>);

// Docker images for dropdowns
const dockerImages = [
  'ghcr.io/nokia/srlinux:latest',
  'ghcr.io/nokia/srlinux:24.10.1',
  'alpine:latest',
  'ubuntu:latest'
];

// Default topology path
const TOPOLOGIES_DIR = '/home/clab/projects/flosch/vscode-containerlab/dev/topologies';
const DEFAULT_TOPOLOGY = `${TOPOLOGIES_DIR}/simple.clab.yml`;

// ============================================================================
// Initial Data Type
// ============================================================================

interface InitialData {
  elements: unknown[];
  labName: string;
  mode: 'edit' | 'view';
  deploymentState: string;
  isLocked: boolean;
  yamlFilePath: string;
  schemaData: SchemaData;
  dockerImages: string[];
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  freeTextAnnotations: unknown[];
  freeShapeAnnotations: unknown[];
  groupStyleAnnotations: unknown[];
  nodeAnnotations: unknown[];
  cloudNodeAnnotations: unknown[];
  networkNodeAnnotations: unknown[];
}

// ============================================================================
// Build Initial Data from Topology File
// ============================================================================

/**
 * Build initial data from a topology file (for React provider)
 */
async function buildInitialData(filePath: string): Promise<InitialData> {
  // Read YAML content
  const yamlContent = await fsAdapter.readFile(filePath);

  // Load annotations
  const annotationsIO = getAnnotationsIO();
  const annotations = await annotationsIO.loadAnnotations(filePath);

  // Parse YAML → Cytoscape elements
  const parseResult = TopologyParser.parse(yamlContent, {
    annotations: annotations as TopologyAnnotations
  });

  // Initialize TopologyIO for future mutations
  const topologyIO = getTopologyIO();
  await topologyIO.initializeFromFile(filePath);

  // Record current file
  currentFilePath = filePath;
  stateManager.setCurrentFilePath(filePath);

  return {
    elements: parseResult.elements,
    labName: parseResult.labName,
    mode: 'edit',
    deploymentState: 'undeployed',
    isLocked: false,
    yamlFilePath: filePath,
    schemaData,
    dockerImages,
    customNodes: sampleCustomNodes,
    defaultNode: stateManager.getDefaultCustomNode(),
    freeTextAnnotations: annotations.freeTextAnnotations || [],
    freeShapeAnnotations: annotations.freeShapeAnnotations || [],
    groupStyleAnnotations: annotations.groupStyleAnnotations || [],
    nodeAnnotations: annotations.nodeAnnotations || [],
    cloudNodeAnnotations: annotations.cloudNodeAnnotations || [],
    networkNodeAnnotations: annotations.networkNodeAnnotations || []
  };
}

// ============================================================================
// Render App (can be called multiple times for full re-init)
// ============================================================================

// Counter to generate unique keys for forcing React re-mounts
let renderKey = 0;

/**
 * Render or re-render the React app with given initial data.
 * Uses a unique key to force React to unmount/remount with fresh state.
 */
function renderApp(initialData: InitialData): void {
  // Update window globals
  (window as unknown as Record<string, unknown>).__INITIAL_DATA__ = initialData;
  (window as unknown as Record<string, unknown>).__SCHEMA_DATA__ = initialData.schemaData;
  (window as unknown as Record<string, unknown>).__DOCKER_IMAGES__ = initialData.dockerImages;

  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element not found');
  }

  // Create root only once
  if (!reactRoot) {
    reactRoot = createRoot(container);
  }

  // Increment key to force React to unmount old tree and mount fresh
  renderKey++;

  // Re-render with new key - this forces a full remount with fresh state
  reactRoot.render(
    <TopoViewerProvider key={renderKey} initialData={initialData}>
      <App />
    </TopoViewerProvider>
  );
}

// ============================================================================
// Topology Loading (full re-init via React re-render)
// ============================================================================

/**
 * Load a topology file and fully re-initialize React (clean state)
 */
async function loadTopologyFile(filePath: string): Promise<void> {
  console.log(`%c[Dev] Loading topology: ${filePath}`, 'color: #2196F3;');

  try {
    const initialData = await buildInitialData(filePath);
    renderApp(initialData);

    console.log(
      `%c[Dev] Loaded ${initialData.labName}: ${initialData.elements.length} elements`,
      'color: #4CAF50;'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`%c[Dev] Failed to load topology: ${message}`, 'color: #f44336;');
    throw error;
  }
}

/**
 * List available topology files
 */
async function listTopologyFiles(): Promise<Array<{ filename: string; path: string; hasAnnotations: boolean }>> {
  try {
    const response = await fetch(sessionId ? `/files?sessionId=${sessionId}` : '/files');
    return await response.json();
  } catch (error) {
    console.error('[Dev] Failed to list topology files:', error);
    return [];
  }
}

/**
 * Reset files to original state
 */
async function resetFiles(): Promise<void> {
  console.log('%c[Dev] Resetting files...', 'color: #f44336;');

  const url = sessionId ? `/api/reset?sessionId=${sessionId}` : '/api/reset';
  const response = await fetch(url, { method: 'POST' });
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Failed to reset files');
  }

  console.log('%c[Dev] Files reset successfully', 'color: #4CAF50;');

  // Reload current file if one is loaded
  if (currentFilePath) {
    await loadTopologyFile(currentFilePath);
  }
}

// ============================================================================
// VS Code API Mock (minimal - just for mode changes)
// ============================================================================

/**
 * Broadcast custom nodes update to webview (matches production message format)
 */
function broadcastCustomNodesUpdate(): void {
  window.postMessage({
    type: 'custom-nodes-updated',
    customNodes: stateManager.getCustomNodes(),
    defaultNode: stateManager.getDefaultCustomNode()
  }, '*');
}

// Minimal VS Code API mock for mode switching and custom nodes
window.vscode = {
  postMessage: (data: unknown) => {
    const msg = data as Record<string, unknown>;
    console.log('%c[vscode.postMessage]', 'color: #9C27B0;', msg.type || msg.command, msg);

    // Handle mode changes
    if (msg.type === 'topo-switch-mode') {
      const payload = msg.payload as { mode?: string; deploymentState?: string } | undefined;
      if (payload?.mode) {
        stateManager.setMode(payload.mode as 'edit' | 'view');
      }
      if (payload?.deploymentState) {
        stateManager.setDeploymentState(payload.deploymentState as 'deployed' | 'undeployed' | 'unknown');
      }

      // Broadcast mode change
      window.postMessage({
        type: 'topo-mode-changed',
        data: {
          mode: stateManager.getMode(),
          deploymentState: stateManager.getDeploymentState()
        }
      }, '*');
    }

    // Handle lifecycle commands (mock)
    if (msg.type === 'POST') {
      const endpointName = msg.endpointName as string;
      if (endpointName?.includes('deploy') || endpointName?.includes('destroy')) {
        console.log(`%c[Mock] Lifecycle: ${endpointName}`, 'color: #FF9800;');

        // Simulate deployment state change
        latencySimulator.simulateCallback('lifecycle', () => {
          const newState = endpointName.includes('destroy') ? 'undeployed' : 'deployed';
          const newMode = newState === 'deployed' ? 'view' : 'edit';

          stateManager.setDeploymentState(newState);
          stateManager.setMode(newMode);

          window.postMessage({
            type: 'topo-mode-changed',
            data: {
              mode: newMode,
              deploymentState: newState
            }
          }, '*');
        });
      }
    }

    // Handle custom node commands (matches production behavior)
    if (msg.command === 'save-custom-node') {
      if (msg.name) {
        stateManager.saveCustomNode(msg as CustomNodeTemplate & { oldName?: string });
        broadcastCustomNodesUpdate();
        console.log(`%c[Mock] Custom node saved: ${msg.name}`, 'color: #4CAF50;');
      }
    }

    if (msg.command === 'delete-custom-node') {
      const name = msg.name as string;
      if (name) {
        stateManager.deleteCustomNode(name);
        broadcastCustomNodesUpdate();
        console.log(`%c[Mock] Custom node deleted: ${name}`, 'color: #f44336;');
      }
    }

    if (msg.command === 'set-default-custom-node') {
      const name = msg.name as string;
      if (name) {
        stateManager.setDefaultCustomNodeByName(name);
        broadcastCustomNodesUpdate();
        console.log(`%c[Mock] Custom node set as default: ${name}`, 'color: #2196F3;');
      }
    }
  }
};

// ============================================================================
// Window Globals for Dev Console
// ============================================================================

// Extended __DEV__ interface for dev server functions
// (extends DevModeInterface from devMode.d.ts which has runtime stuff)
interface DevServerInterface {
  // File operations
  loadTopologyFile: (filePath: string) => Promise<void>;
  listTopologyFiles: () => Promise<Array<{ filename: string; path: string; hasAnnotations: boolean }>>;
  resetFiles: () => Promise<void>;
  getCurrentFile: () => string | null;

  // Mode and state
  setMode: (mode: 'edit' | 'view') => void;
  setDeploymentState: (state: 'deployed' | 'undeployed' | 'unknown') => void;
  setLatencyProfile: (profile: 'instant' | 'fast' | 'normal' | 'slow') => void;

  // Services (for debugging)
  getTopologyIO: typeof getTopologyIO;
  getAnnotationsIO: typeof getAnnotationsIO;
  fsAdapter: HttpFsAdapter;
  stateManager: DevStateManager;
  latencySimulator: LatencySimulator;

  // Runtime (set by App.tsx via DevModeInterface)
  cy?: unknown;
  isLocked?: () => boolean;
  setLocked?: (locked: boolean) => void;
  undoRedo?: { canUndo: () => boolean; canRedo: () => boolean };
}

declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void };
  }
}

// Assign dev server functions to window.__DEV__
// This extends the DevModeInterface from devMode.d.ts with dev server-specific functions
(window as unknown as { __DEV__: DevServerInterface }).__DEV__ = {
  // File operations
  loadTopologyFile,
  listTopologyFiles,
  resetFiles,
  getCurrentFile: () => currentFilePath,

  // Mode and state
  setMode: (mode: 'edit' | 'view') => {
    stateManager.setMode(mode);
    window.postMessage({
      type: 'topo-mode-changed',
      data: {
        mode: mode,
        deploymentState: stateManager.getDeploymentState()
      }
    }, '*');
    console.log(`%c[Dev] Switched to ${mode} mode`, 'color: #2196F3;');
  },

  setDeploymentState: (state: 'deployed' | 'undeployed' | 'unknown') => {
    stateManager.setDeploymentState(state);
    window.postMessage({
      type: 'topo-mode-changed',
      data: {
        mode: stateManager.getMode(),
        deploymentState: state
      }
    }, '*');
    console.log(`%c[Dev] Set deployment state to ${state}`, 'color: #2196F3;');
  },

  setLatencyProfile: (profile: 'instant' | 'fast' | 'normal' | 'slow') => {
    latencySimulator.setProfile(profile);
    console.log(`%c[Dev] Set latency profile to ${profile}`, 'color: #9C27B0;');
  },

  // Services for debugging
  getTopologyIO,
  getAnnotationsIO,
  fsAdapter,
  stateManager,
  latencySimulator
};

// ============================================================================
// Console Instructions
// ============================================================================

console.log(
  '%c[React TopoViewer - Dev Mode]',
  'color: #E91E63; font-weight: bold; font-size: 14px;'
);
console.log('%cFile operations:', 'color: #4CAF50; font-weight: bold;');
console.log('  __DEV__.loadTopologyFile("/path/to/file.clab.yml")');
console.log('  __DEV__.listTopologyFiles()');
console.log('  __DEV__.resetFiles()');
console.log('  __DEV__.getCurrentFile()');
console.log('');
console.log('%cMode and state:', 'color: #2196F3; font-weight: bold;');
console.log('  __DEV__.setMode("edit" | "view")');
console.log('  __DEV__.setDeploymentState("deployed" | "undeployed")');
console.log('  __DEV__.setLatencyProfile("instant" | "fast" | "normal" | "slow")');
console.log('');
console.log('%cServices (for debugging):', 'color: #9C27B0; font-weight: bold;');
console.log('  __DEV__.getTopologyIO() - TopologyIO instance');
console.log('  __DEV__.getAnnotationsIO() - AnnotationsIO instance');
console.log('  __DEV__.fsAdapter - HttpFsAdapter instance');

// ============================================================================
// Bootstrap: Load default topology and render
// ============================================================================

/**
 * Bootstrap the application:
 * 1. Load the default topology file
 * 2. Render React with the loaded data
 *
 * This ensures the app starts with real data (not placeholders)
 */
async function bootstrap(): Promise<void> {
  console.log(`%c[Dev] Bootstrapping with: ${DEFAULT_TOPOLOGY}`, 'color: #9C27B0;');

  try {
    const initialData = await buildInitialData(DEFAULT_TOPOLOGY);
    renderApp(initialData);
    console.log(`%c[Dev] Ready: ${initialData.labName}`, 'color: #4CAF50;');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`%c[Dev] Bootstrap failed: ${message}`, 'color: #f44336;');
    // Show error in UI
    const container = document.getElementById('root');
    if (container) {
      container.innerHTML = `<div style="color: red; padding: 20px;">
        <h2>Failed to load topology</h2>
        <pre>${message}</pre>
      </div>`;
    }
  }
}

// Start the app
bootstrap();
