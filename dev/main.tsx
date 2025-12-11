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
import { buildInitialData, sampleElements, emptyElements, generateLargeTopology } from './mockData';

// ============================================================================
// VS Code API Mock
// ============================================================================

interface MockMessage {
  type: string;
  data?: unknown;
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
  // Add artificial delays to simulate real extension behavior
  switch (message.type) {
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

    case 'save-node-editor':
    case 'apply-node-editor':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Node editor data:', message);
      break;

    case 'save-link-editor':
    case 'apply-link-editor':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Link editor data:', message);
      break;
  }
}

// Install mock VS Code API on window
declare global {
  interface Window {
    vscode: typeof vscodeApiMock;
    __INITIAL_DATA__: ReturnType<typeof buildInitialData>;
    __SCHEMA_DATA__: unknown;
    __DOCKER_IMAGES__: string[];
    // Dev mode utilities
    __DEV__: {
      loadTopology: (name: 'sample' | 'empty' | 'large') => void;
      setMode: (mode: 'edit' | 'view') => void;
      setDeploymentState: (state: 'deployed' | 'undeployed' | 'unknown') => void;
    };
  }
}

window.vscode = vscodeApiMock;

// ============================================================================
// Initial Data Setup
// ============================================================================

const initialData = buildInitialData({
  mode: 'edit',
  deploymentState: 'undeployed',
});

window.__INITIAL_DATA__ = initialData;
window.__SCHEMA_DATA__ = initialData.schemaData;
window.__DOCKER_IMAGES__ = initialData.dockerImages || [];

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
    window.postMessage({
      type: 'topology-data',
      data: { elements }
    }, '*');
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
};

// ============================================================================
// Render App
// ============================================================================

console.log('%c[React TopoViewer - Dev Mode]', 'color: #E91E63; font-weight: bold; font-size: 14px;');
console.log('Available dev utilities:');
console.log('  __DEV__.loadTopology("sample" | "empty" | "large")');
console.log('  __DEV__.setMode("edit" | "view")');
console.log('  __DEV__.setDeploymentState("deployed" | "undeployed" | "unknown")');

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
