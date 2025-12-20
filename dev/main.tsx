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
 */
import { createRoot } from 'react-dom/client';
import { App } from '@webview/App';
import { TopoViewerProvider } from '@webview/context/TopoViewerContext';
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
import { sampleElements, sampleCustomNodes } from './mockData';

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
  defaultCustomNode: 'SRLinux Latest',
});

const latencySimulator = new LatencySimulator({
  profile: 'fast',
  jitter: 0.2,
  verbose: false
});

// Track current file path
let currentFilePath: string | null = null;

// ============================================================================
// Topology Loading (uses browser-side TopologyIO)
// ============================================================================

/**
 * Load a topology file and broadcast to webview
 */
async function loadTopologyFile(filePath: string): Promise<void> {
  console.log(`%c[Dev] Loading topology: ${filePath}`, 'color: #2196F3;');

  try {
    // Read YAML content
    const yamlContent = await fsAdapter.readFile(filePath);

    // Load annotations
    const annotationsIO = getAnnotationsIO();
    const annotations = await annotationsIO.loadAnnotations(filePath);

    // Parse YAML → Cytoscape elements (runs in browser!)
    const parseResult = TopologyParser.parse(yamlContent, {
      annotations: annotations as TopologyAnnotations
    });

    // Record current file
    currentFilePath = filePath;
    stateManager.setCurrentFilePath(filePath);

    // Initialize TopologyIO with the parsed document for future mutations
    const topologyIO = getTopologyIO();
    await topologyIO.initializeFromFile(filePath);

    // Broadcast topology data to webview
    window.postMessage({
      type: 'topology-data',
      data: {
        elements: parseResult.elements,
        labName: parseResult.labName,
        freeTextAnnotations: annotations.freeTextAnnotations || [],
        freeShapeAnnotations: annotations.freeShapeAnnotations || [],
        groupStyleAnnotations: annotations.groupStyleAnnotations || [],
        nodeAnnotations: annotations.nodeAnnotations || [],
        cloudNodeAnnotations: annotations.cloudNodeAnnotations || [],
        networkNodeAnnotations: annotations.networkNodeAnnotations || []
      }
    }, '*');

    console.log(
      `%c[Dev] Loaded ${filePath}: ${parseResult.elements.length} elements`,
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

  const url = sessionId ? `/reset?sessionId=${sessionId}` : '/reset';
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

declare global {
  interface Window {
    vscode?: { postMessage(data: unknown): void };
  }
}

// Minimal VS Code API mock for mode switching
window.vscode = {
  postMessage: (data: unknown) => {
    const msg = data as Record<string, unknown>;
    console.log('%c[vscode.postMessage]', 'color: #9C27B0;', msg.type, msg);

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
  }
};

// ============================================================================
// Window Globals for Dev Console
// ============================================================================

declare global {
  interface Window {
    __DEV__: {
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

      // Runtime (set by App.tsx)
      cy?: unknown;
      isLocked?: () => boolean;
      setLocked?: (locked: boolean) => void;
      undoRedo?: { canUndo: () => boolean; canRedo: () => boolean };
    };
  }
}

window.__DEV__ = {
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
// Initial Data for Provider
// ============================================================================

// Build minimal initial data (topology loads async after mount)
const initialData = {
  elements: sampleElements,
  labName: 'dev-topology',
  mode: 'edit' as const,
  deploymentState: 'undeployed',
  isLocked: false,  // Dev mode starts unlocked for testing
  yamlFilePath: '',
  schemaData: {
    nodeKinds: [
      { kind: 'nokia_srlinux', defaultImage: 'ghcr.io/nokia/srlinux:latest' },
      { kind: 'linux', defaultImage: 'alpine:latest' },
      { kind: 'nokia_sros', defaultImage: '' },
      { kind: 'arista_ceos', defaultImage: '' }
    ]
  },
  dockerImages: [
    'ghcr.io/nokia/srlinux:latest',
    'ghcr.io/nokia/srlinux:24.10.1',
    'alpine:latest',
    'ubuntu:latest'
  ],
  customNodes: sampleCustomNodes,
  defaultCustomNode: 'SRLinux Latest',
  freeTextAnnotations: [],
  freeShapeAnnotations: [],
  groupStyleAnnotations: [],
  nodeAnnotations: [],
  cloudNodeAnnotations: [],
  networkNodeAnnotations: []
};

(window as any).__INITIAL_DATA__ = initialData;
(window as any).__SCHEMA_DATA__ = initialData.schemaData;
(window as any).__DOCKER_IMAGES__ = initialData.dockerImages || [];

// ============================================================================
// Render App
// ============================================================================

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
  <TopoViewerProvider initialData={initialData}>
    <App />
  </TopoViewerProvider>
);

// ============================================================================
// Auto-load Default Topology
// ============================================================================

// Determine default topology path
const TOPOLOGIES_DIR = '/home/clab/projects/flosch/vscode-containerlab/dev/topologies';
const defaultTopology = `${TOPOLOGIES_DIR}/simple.clab.yml`;

// Load the default topology file after app mounts
setTimeout(async () => {
  console.log(`%c[Dev] Auto-loading: ${defaultTopology}`, 'color: #9C27B0;');
  await loadTopologyFile(defaultTopology);
}, 100);
