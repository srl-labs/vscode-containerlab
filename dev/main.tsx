/**
 * Dev Mode Entry Point for React TopoViewer
 *
 * This file bootstraps the React TopoViewer in standalone mode (outside VS Code)
 * with mock data and a fake VS Code API for rapid UI development.
 */
import { createRoot } from 'react-dom/client';
import { App } from '@webview/App';
import { TopoViewerProvider } from '@webview/context/TopoViewerContext';
import '@webview/styles/tailwind.css';
import {
  buildInitialData,
  sampleElements,
  emptyElements,
  generateLargeTopology,
  generateYamlFromElements
} from './mockData';

// ============================================================================
// Dev Mode State
// ============================================================================

interface DevState {
  splitViewOpen: boolean;
  currentElements: typeof sampleElements;
  currentAnnotations: {
    freeTextAnnotations: unknown[];
    nodeAnnotations: unknown[];
  };
  clipboard: unknown | null;
  graphBatchDepth: number;
  pendingTopologyBroadcast: boolean;
}

const devState: DevState = {
  splitViewOpen: false,
  currentElements: sampleElements,
  currentAnnotations: {
    freeTextAnnotations: [],
    nodeAnnotations: []
  },
  clipboard: null,
  graphBatchDepth: 0,
  pendingTopologyBroadcast: false
};

// ============================================================================
// VS Code API Mock
// ============================================================================

interface MockMessage {
  type?: string;
  command?: string;
  data?: unknown;
  positions?: unknown;
  annotations?: unknown;
  nodeId?: string;
  edgeId?: string;
  [key: string]: unknown;
}

/**
 * Mock VS Code API that logs messages instead of sending them to the extension
 */
const vscodeApiMock = {
  postMessage: (message: MockMessage) => {
    console.log('%c[postMessage to Extension]', 'color: #4CAF50; font-weight: bold;', message);

    // Simulate some extension responses
    handleMockExtensionResponse(message);
  },
  getState: () => {
    return JSON.parse(localStorage.getItem('topoviewer-state') || '{}');
  },
  setState: (state: unknown) => {
    localStorage.setItem('topoviewer-state', JSON.stringify(state));
  },
};

/**
 * Simulate extension responses for certain messages
 */
function handleMockExtensionResponse(message: MockMessage) {
  // Messages can use either 'type' or 'command' field
  const messageType = (message.command || message.type) as string;

  const maybeBroadcastTopologyData = () => {
    if (devState.graphBatchDepth > 0) {
      devState.pendingTopologyBroadcast = true;
      return;
    }
    // React TopoViewer updates the graph based on incoming 'topology-data' messages.
    // Some features (e.g. bulk link creation) only persist via postMessage and rely
    // on an extension refresh; in dev mode we simulate that refresh here.
    window.postMessage({
      type: 'topology-data',
      data: { elements: [...devState.currentElements] }
    }, '*');
    devState.pendingTopologyBroadcast = false;
  };

  // Add artificial delays to simulate real extension behavior
  switch (messageType) {
    case 'deployLab':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Simulating deploy...');
      setTimeout(() => {
        window.postMessage({
          type: 'topo-mode-changed',
          data: { mode: 'viewer', deploymentState: 'deployed' }
        }, '*');
      }, 1000);
      break;

    case 'destroyLab':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Simulating destroy...');
      setTimeout(() => {
        window.postMessage({
          type: 'topo-mode-changed',
          data: { mode: 'editor', deploymentState: 'undeployed' }
        }, '*');
      }, 500);
      break;

    case 'begin-graph-batch':
      devState.graphBatchDepth += 1;
      break;

    case 'end-graph-batch': {
      devState.graphBatchDepth = Math.max(0, devState.graphBatchDepth - 1);
      if (devState.graphBatchDepth === 0 && devState.pendingTopologyBroadcast) {
        maybeBroadcastTopologyData();
      }
      break;
    }

    case 'save-node-editor':
    case 'apply-node-editor':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Node editor data:', message);
      break;

    case 'save-link-editor':
    case 'apply-link-editor':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Link editor data:', message);
      break;

    case 'copyElements': {
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Copying elements to clipboard:', message);
      // Store the copy data for later paste
      devState.clipboard = message.payload;
      break;
    }

    case 'getCopiedElements': {
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Paste requested, clipboard:', devState.clipboard);
      if (devState.clipboard) {
        // Send the clipboard data back to the webview asynchronously
        // (simulates real extension behavior where message comes on next tick)
        setTimeout(() => {
          window.postMessage({
            type: 'copiedElements',
            data: devState.clipboard  // Note: listener expects 'data', not 'payload'
          }, '*');
          console.log('%c[Mock Extension]', 'color: #FF9800;', 'Sent copiedElements message');
        }, 0);
      } else {
        console.log('%c[Mock Extension]', 'color: #FF9800;', 'Clipboard is empty');
      }
      break;
    }

    case 'create-node': {
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Creating node:', message);
      const { nodeId, nodeData, position } = message as { nodeId: string; nodeData: Record<string, unknown>; position: { x: number; y: number } };
      if (nodeId && nodeData) {
        const exists = devState.currentElements.some(el => el.group === 'nodes' && el.data.id === nodeId);
        if (exists) break;
        // Add new node to elements
        const nodePosition = position || { x: 100, y: 100 };
        devState.currentElements = [
          ...devState.currentElements,
          {
            group: 'nodes',
            data: { id: nodeId, ...nodeData },
            position: nodePosition
          }
        ];
        // Add to node annotations
        (devState.currentAnnotations.nodeAnnotations as Array<{ id: string; position: { x: number; y: number } }>).push({
          id: nodeId,
          position: nodePosition
        });
        updateSplitViewContent();
        if (devState.graphBatchDepth > 0) {
          devState.pendingTopologyBroadcast = true;
        }
      }
      break;
    }

    case 'create-link': {
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Creating link:', message);
      const { linkData } = message as { linkData: { id: string; source: string; target: string; sourceEndpoint?: string; targetEndpoint?: string } };
      if (linkData) {
        const edgeId = linkData.id;
        const exists = devState.currentElements.some(el => el.group === 'edges' && el.data.id === edgeId);
        if (!exists) {
          devState.currentElements = [
            ...devState.currentElements,
            {
              group: 'edges',
              data: {
                id: edgeId,
                source: linkData.source,
                target: linkData.target,
                sourceEndpoint: linkData.sourceEndpoint || 'eth1',
                targetEndpoint: linkData.targetEndpoint || 'eth1'
              }
            }
          ];
        }
        updateSplitViewContent();
        if (devState.graphBatchDepth > 0) {
          devState.pendingTopologyBroadcast = true;
        }
      }
      break;
    }

    case 'panel-delete-node': {
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Deleting node:', message);
      const nodeId = message.nodeId as string;
      if (nodeId) {
        // Remove node and its connected edges from elements
        devState.currentElements = devState.currentElements.filter(el => {
          if (el.group === 'nodes' && el.data.id === nodeId) return false;
          if (el.group === 'edges' && (el.data.source === nodeId || el.data.target === nodeId)) return false;
          return true;
        });
        // Remove from node annotations
        devState.currentAnnotations.nodeAnnotations = (devState.currentAnnotations.nodeAnnotations as Array<{ id: string }>)
          .filter(a => a.id !== nodeId);
        updateSplitViewContent();
        if (devState.graphBatchDepth > 0) {
          devState.pendingTopologyBroadcast = true;
        }
      }
      break;
    }

    case 'panel-delete-link': {
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Deleting link:', message);
      const edgeId = message.edgeId as string;
      if (edgeId) {
        devState.currentElements = devState.currentElements.filter(el =>
          !(el.group === 'edges' && el.data.id === edgeId)
        );
        updateSplitViewContent();
        if (devState.graphBatchDepth > 0) {
          devState.pendingTopologyBroadcast = true;
        }
      }
      break;
    }

    case 'topo-toggle-split-view':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Toggling split view...');
      toggleSplitViewPanel();
      break;

    case 'save-free-text-annotations':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Saving annotations:', message);
      // Update stored annotations and refresh split view
      if (message.annotations) {
        devState.currentAnnotations.freeTextAnnotations = message.annotations as unknown[];
        updateSplitViewContent();
      }
      break;

    case 'save-node-positions':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Saving node positions:', message);
      // Update node positions in current elements and annotations
      // positions is an array of {id, position} objects
      if (message.positions && Array.isArray(message.positions)) {
        const positionsArray = message.positions as Array<{ id: string; position: { x: number; y: number } }>;

        // Update element positions for YAML
        devState.currentElements = devState.currentElements.map(el => {
          if (el.group === 'nodes') {
            const posData = positionsArray.find(p => p.id === el.data.id);
            if (posData) {
              return { ...el, position: posData.position };
            }
          }
          return el;
        });

        // Update node annotations (merge with existing)
        const existingAnnotations = devState.currentAnnotations.nodeAnnotations as Array<{ id: string; position?: { x: number; y: number } }>;
        for (const posData of positionsArray) {
          const existing = existingAnnotations.find(a => a.id === posData.id);
          if (existing) {
            existing.position = posData.position;
          } else {
            existingAnnotations.push({ id: posData.id, position: posData.position });
          }
        }
        updateSplitViewContent();
      }
      break;
  }
}

// ============================================================================
// Split View Panel
// ============================================================================

function toggleSplitViewPanel() {
  devState.splitViewOpen = !devState.splitViewOpen;
  const panel = document.getElementById('splitViewPanel');
  const mainContent = document.getElementById('root');

  if (devState.splitViewOpen) {
    updateSplitViewContent();
    panel?.classList.add('open');
    mainContent?.classList.add('split-view-active');
    console.log('%c[Dev] Split view opened', 'color: #2196F3;');
  } else {
    panel?.classList.remove('open');
    mainContent?.classList.remove('split-view-active');
    console.log('%c[Dev] Split view closed', 'color: #2196F3;');
  }

  // Update button state
  updateSplitViewButton();
}

function updateSplitViewContent() {
  if (!devState.splitViewOpen) return;

  // Update YAML content
  const yaml = generateYamlFromElements(devState.currentElements);
  const yamlContent = document.getElementById('yamlContent');
  if (yamlContent) {
    yamlContent.textContent = yaml;
  }

  // Update annotations JSON
  const annotationsContent = document.getElementById('annotationsContent');
  if (annotationsContent) {
    const annotationsData = {
      freeTextAnnotations: devState.currentAnnotations.freeTextAnnotations,
      freeShapeAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: devState.currentAnnotations.nodeAnnotations
    };
    annotationsContent.textContent = JSON.stringify(annotationsData, null, 2);
  }
}

function updateSplitViewButton() {
  const btn = document.getElementById('splitViewBtn');
  if (btn) {
    btn.classList.toggle('active', devState.splitViewOpen);
  }
}

// Extend window with dev mode utilities only
// Note: vscode, __SCHEMA_DATA__, __DOCKER_IMAGES__ are already declared in webview code
declare global {
  interface Window {
    // __INITIAL_DATA__ specific type for dev mode
    __INITIAL_DATA__: ReturnType<typeof buildInitialData>;
    // Dev mode utilities (only exists in dev mode)
    __DEV__: {
      loadTopology: (name: 'sample' | 'empty' | 'large') => void;
      setMode: (mode: 'edit' | 'view') => void;
      setDeploymentState: (state: 'deployed' | 'undeployed' | 'unknown') => void;
      toggleSplitView: () => void;
      getYaml: () => string;
      getAnnotationsJson: () => string;
    };
  }
}

// Cast vscode mock to the type expected by webview code
(window as { vscode?: { postMessage(data: unknown): void } }).vscode = vscodeApiMock;

// ============================================================================
// Initial Data Setup
// ============================================================================

const initialData = buildInitialData({
  mode: 'edit',
  deploymentState: 'undeployed'
});

window.__INITIAL_DATA__ = initialData;
// Cast to expected types - these are declared in webview code
(window as { __SCHEMA_DATA__?: unknown }).__SCHEMA_DATA__ = initialData.schemaData;
(window as { __DOCKER_IMAGES__?: string[] }).__DOCKER_IMAGES__ = initialData.dockerImages || [];

// ============================================================================
// Dev Utilities (accessible from browser console)
// ============================================================================

window.__DEV__ = {
  /**
   * Load different topology configurations
   * Usage: __DEV__.loadTopology('large')
   */
  loadTopology: (name: 'sample' | 'empty' | 'large') => {
    let elements;
    switch (name) {
      case 'empty':
        elements = emptyElements;
        break;
      case 'large':
        elements = generateLargeTopology(25);
        break;
      case 'sample':
      default:
        elements = sampleElements;
    }
    devState.currentElements = elements;
    // Reset annotations when loading new topology
    devState.currentAnnotations = { freeTextAnnotations: [], nodeAnnotations: [] };
    window.postMessage({
      type: 'topology-data',
      data: { elements }
    }, '*');
    // Update split view if open
    updateSplitViewContent();
    console.log(`%c[Dev] Loaded ${name} topology with ${elements.length} elements`, 'color: #2196F3;');
  },

  /**
   * Switch between edit and view mode
   * Usage: __DEV__.setMode('view')
   */
  setMode: (mode: 'edit' | 'view') => {
    window.postMessage({
      type: 'topo-mode-changed',
      data: { mode: mode === 'view' ? 'viewer' : 'editor' }
    }, '*');
    console.log(`%c[Dev] Switched to ${mode} mode`, 'color: #2196F3;');
  },

  /**
   * Set deployment state
   * Usage: __DEV__.setDeploymentState('deployed')
   */
  setDeploymentState: (state: 'deployed' | 'undeployed' | 'unknown') => {
    window.postMessage({
      type: 'topo-mode-changed',
      data: { deploymentState: state }
    }, '*');
    console.log(`%c[Dev] Set deployment state to ${state}`, 'color: #2196F3;');
  },

  /**
   * Toggle split view panel
   * Usage: __DEV__.toggleSplitView()
   */
  toggleSplitView: () => {
    toggleSplitViewPanel();
  },

  /**
   * Get current topology as YAML
   * Usage: __DEV__.getYaml()
   */
  getYaml: () => {
    const yaml = generateYamlFromElements(devState.currentElements);
    console.log(yaml);
    return yaml;
  },

  /**
   * Get current annotations as JSON
   * Usage: __DEV__.getAnnotationsJson()
   */
  getAnnotationsJson: () => {
    const json = JSON.stringify(devState.currentAnnotations, null, 2);
    console.log(json);
    return json;
  }
};

// ============================================================================
// Render App
// ============================================================================

console.log('%c[React TopoViewer - Dev Mode]', 'color: #E91E63; font-weight: bold; font-size: 14px;');
console.log('Available dev utilities:');
console.log('  __DEV__.loadTopology("sample" | "empty" | "large")');
console.log('  __DEV__.setMode("edit" | "view")');
console.log('  __DEV__.setDeploymentState("deployed" | "undeployed" | "unknown")');
console.log('  __DEV__.toggleSplitView()     - Toggle split view (clab.yml + annotations)');
console.log('  __DEV__.getYaml()             - Get current topology as YAML');
console.log('  __DEV__.getAnnotationsJson()  - Get current annotations as JSON');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
// Note: StrictMode disabled for dev to avoid double-render issues with HMR
root.render(
  <TopoViewerProvider initialData={initialData}>
    <App />
  </TopoViewerProvider>
);
