/**
 * Dev Mode Entry Point for React TopoViewer
 *
 * This file bootstraps the React TopoViewer in standalone mode (outside VS Code)
 * with mock data and a modular mock system for rapid UI development.
 */
import { createRoot } from 'react-dom/client';
import { App } from '@webview/App';
import { TopoViewerProvider } from '@webview/context/TopoViewerContext';
import '@webview/styles/tailwind.css';

// Mock system modules
import { DevStateManager } from './mock/DevState';
import { LatencySimulator } from './mock/LatencySimulator';
import { RequestHandler } from './mock/RequestHandler';
import { MessageHandler } from './mock/MessageHandler';
import { SplitViewPanel } from './mock/SplitViewPanel';
import { createVscodeApiMock, installVscodeApiMock } from './mock/VscodeApiMock';

// Mock data
import {
  buildInitialData,
  sampleElements,
  sampleCustomNodes
} from './mockData';


// ============================================================================
// Initialize Mock System
// ============================================================================

// Initialize state manager (elements/annotations come from server, not local state)
const stateManager = new DevStateManager({
  mode: 'edit',
  deploymentState: 'undeployed',
  customNodes: sampleCustomNodes,
  defaultCustomNode: 'SRLinux Latest',
});

// Initialize latency simulator
const latencySimulator = new LatencySimulator({
  profile: 'fast',
  jitter: 0.2,
  verbose: false
});

// Initialize handlers
const requestHandler = new RequestHandler(stateManager, latencySimulator);
const messageHandler = new MessageHandler(stateManager, requestHandler, latencySimulator);

// Initialize split view panel
const splitViewPanel = new SplitViewPanel(stateManager);
messageHandler.setSplitViewPanel(splitViewPanel);

// Create and install mock VS Code API
const vscodeMock = createVscodeApiMock(messageHandler, { verbose: true });
installVscodeApiMock(vscodeMock);

// ============================================================================
// Load Topology Functions
// ============================================================================

/**
 * Initialize session ID from URL parameter (for test isolation).
 * This must be called early, before any API calls.
 */
function initSessionIdFromUrl(): void {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');
  if (sessionId) {
    (window as any).__TEST_SESSION_ID__ = sessionId;
    console.log(`%c[Dev] Session ID from URL: ${sessionId}`, 'color: #9C27B0;');
  }
}

// Initialize session ID from URL before anything else
initSessionIdFromUrl();

/**
 * Get the current session ID (for test isolation)
 */
function getSessionId(): string | undefined {
  return (window as any).__TEST_SESSION_ID__;
}

/**
 * Build API URL with optional session ID
 */
function buildApiUrl(path: string): string {
  const sessionId = getSessionId();
  if (sessionId) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}sessionId=${sessionId}`;
  }
  return path;
}

/**
 * Load a topology from a file (real file I/O via API)
 */
async function loadTopologyFile(filename: string, sessionId?: string): Promise<void> {
  // Allow passing session ID directly (for tests)
  if (sessionId) {
    (window as any).__TEST_SESSION_ID__ = sessionId;
  }

  console.log(`%c[Dev] Loading topology file: ${filename}`, 'color: #2196F3;');

  try {
    // Fetch parsed elements from API
    const url = buildApiUrl(`/api/topology/${encodeURIComponent(filename)}/elements`);
    const response = await fetch(url);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to load topology');
    }

    const { elements, annotations, labName } = result.data;

    // Record which file is loaded
    stateManager.setCurrentFilePath(filename);

    // Broadcast to webview (same message format as real extension)
    window.postMessage({
      type: 'topology-data',
      data: {
        elements,
        labName,
        freeTextAnnotations: annotations.freeTextAnnotations || [],
        freeShapeAnnotations: annotations.freeShapeAnnotations || [],
        groupStyleAnnotations: annotations.groupStyleAnnotations || [],
        nodeAnnotations: annotations.nodeAnnotations || [],
        cloudNodeAnnotations: annotations.cloudNodeAnnotations || [],
        networkNodeAnnotations: annotations.networkNodeAnnotations || []
      }
    }, '*');

    console.log(
      `%c[Dev] Loaded ${filename}: ${elements.length} elements`,
      'color: #4CAF50;'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`%c[Dev] Failed to load topology file: ${message}`, 'color: #f44336;');
  }
}

/**
 * List available topology files
 */
async function listTopologyFiles(): Promise<Array<{ filename: string; hasAnnotations: boolean }>> {
  try {
    const url = buildApiUrl('/api/topologies');
    const response = await fetch(url);
    const result = await response.json();
    if (result.success && result.data) {
      return result.data;
    }
  } catch (error) {
    console.error('[Dev] Failed to list topology files:', error);
  }
  return [];
}

// ============================================================================
// Window Globals
// ============================================================================

// Extend window with dev mode utilities
// Note: __SCHEMA_DATA__, __DOCKER_IMAGES__, __INITIAL_DATA__ are declared in webview code
declare global {
  interface Window {
    __DEV__: {
      // File-based operations (real file I/O)
      loadTopologyFile: (filename: string, sessionId?: string) => Promise<void>;
      listTopologyFiles: () => Promise<Array<{ filename: string; hasAnnotations: boolean }>>;
      resetFiles: () => Promise<void>;
      getCurrentFile: () => string | null;
      // Legacy: in-memory topology loading (maps to file-based)
      loadTopology: (name: string) => Promise<void>;
      // Mode and state
      setMode: (mode: 'edit' | 'view') => void;
      setDeploymentState: (state: 'deployed' | 'undeployed' | 'unknown') => void;
      setLatencyProfile: (profile: 'instant' | 'fast' | 'normal' | 'slow') => void;
      // UI
      toggleSplitView: () => void;
      // Managers
      stateManager: DevStateManager;
      latencySimulator: LatencySimulator;
      // Set by App.tsx at runtime
      cy?: unknown;
      isLocked?: () => boolean;
      setLocked?: (locked: boolean) => void;
      undoRedo?: { canUndo: () => boolean; canRedo: () => boolean };
    };
  }
}

// Build initial data for TopoViewerProvider (data will come from server after mount)
const initialData = buildInitialData({
  mode: 'edit',
  deploymentState: 'undeployed',
  elements: sampleElements,
  includeAnnotations: false
});

(window as any).__INITIAL_DATA__ = initialData;
(window as any).__SCHEMA_DATA__ = initialData.schemaData;
(window as any).__DOCKER_IMAGES__ = initialData.dockerImages || [];

// Topology name to file mapping for backward compatibility with tests
const topologyNameToFile: Record<string, string> = {
  sample: 'simple.clab.yml',
  sampleWithAnnotations: 'simple.clab.yml',
  annotated: 'simple.clab.yml',
  network: 'network.clab.yml',
  empty: 'empty.clab.yml',
  large: 'datacenter.clab.yml',
  large100: 'datacenter.clab.yml',
  large1000: 'datacenter.clab.yml'
};

// Dev utilities (console API)
window.__DEV__ = {
  // File-based operations (real file I/O)
  loadTopologyFile,
  listTopologyFiles,
  getCurrentFile: () => stateManager.getCurrentFilePath(),

  // Legacy: load topology by name (maps to file-based loading)
  loadTopology: async (name: string) => {
    const filename = topologyNameToFile[name] || 'simple.clab.yml';
    console.log(`%c[Dev] loadTopology('${name}') -> ${filename}`, 'color: #9C27B0;');
    await loadTopologyFile(filename);
  },

  resetFiles: async () => {
    console.log('%c[Dev] Resetting files to original state...', 'color: #f44336;');
    try {
      const response = await fetch('/api/reset', { method: 'POST' });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to reset files');
      }
      console.log('%c[Dev] Files reset successfully', 'color: #4CAF50;');

      // Reload current file if one is loaded
      const currentFile = stateManager.getCurrentFilePath();
      if (currentFile) {
        await loadTopologyFile(currentFile);
        console.log('%c[Dev] Reloaded: ' + currentFile, 'color: #4CAF50;');
      }
    } catch (error) {
      console.error('%c[Dev] Reset failed:', 'color: #f44336;', error);
      throw error;
    }
  },

  setMode: (mode: 'edit' | 'view') => {
    stateManager.setMode(mode);
    window.postMessage({
      type: 'topo-mode-changed',
      data: {
        mode: mode === 'view' ? 'viewer' : 'editor',
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
        mode: stateManager.getMode() === 'view' ? 'viewer' : 'editor',
        deploymentState: state
      }
    }, '*');
    console.log(`%c[Dev] Set deployment state to ${state}`, 'color: #2196F3;');
  },

  setLatencyProfile: (profile: 'instant' | 'fast' | 'normal' | 'slow') => {
    latencySimulator.setProfile(profile);
    console.log(`%c[Dev] Set latency profile to ${profile}`, 'color: #9C27B0;');
  },

  toggleSplitView: () => splitViewPanel.toggle(),

  // Expose managers for advanced debugging
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
console.log('  __DEV__.loadTopologyFile("simple.clab.yml")  - Load a YAML file');
console.log('  __DEV__.listTopologyFiles()                  - List available topology files');
console.log('  __DEV__.getCurrentFile()                     - Get currently loaded file path');
console.log('  __DEV__.resetFiles()                         - Reset all files to original state');
console.log('');
console.log('%cMode and state:', 'color: #2196F3; font-weight: bold;');
console.log('  __DEV__.setMode("edit" | "view")');
console.log('  __DEV__.setDeploymentState("deployed" | "undeployed" | "unknown")');
console.log('  __DEV__.setLatencyProfile("instant" | "fast" | "normal" | "slow")');
console.log('');
console.log('%cUI utilities:', 'color: #9C27B0; font-weight: bold;');
console.log('  __DEV__.toggleSplitView()');
console.log('%cUse the gear icon (top-right) for visual controls', 'color: #9C27B0;');

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

// Load the default topology file after app mounts (simulates real extension behavior)
// Use setTimeout to ensure React has mounted before we send messages
setTimeout(async () => {
  const defaultTopology = 'simple.clab.yml';
  console.log(`%c[Dev] Auto-loading default topology: ${defaultTopology}`, 'color: #9C27B0;');
  await loadTopologyFile(defaultTopology);
}, 100);
