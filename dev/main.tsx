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
import type { TopologyAnnotations, CyElement } from '@shared/types/topology';

// Mock system modules
import { DevStateManager, createDefaultAnnotations } from './mock/DevState';
import { LatencySimulator } from './mock/LatencySimulator';
import { RequestHandler } from './mock/RequestHandler';
import { MessageHandler } from './mock/MessageHandler';
import { SplitViewPanel } from './mock/SplitViewPanel';
import { createVscodeApiMock, installVscodeApiMock } from './mock/VscodeApiMock';

// Mock data
import {
  buildInitialData,
  sampleElements,
  annotatedElements,
  annotatedTopologyAnnotations,
  emptyElements,
  networkElements,
  generateLargeTopology,
  sampleCustomNodes
} from './mockData';


// ============================================================================
// Topology Helpers
// ============================================================================

/**
 * Strip positions from elements to simulate no annotations.json (triggers COSE layout)
 */
function stripPositions(elements: CyElement[]): CyElement[] {
  return elements.map(el => {
    if (el.group === 'nodes') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { position, ...rest } = el;
      return rest as typeof el;
    }
    return el;
  });
}

/**
 * Create node annotations from elements with positions
 */
function createNodeAnnotations(elements: CyElement[]): TopologyAnnotations['nodeAnnotations'] {
  return elements
    .filter(el => el.group === 'nodes' && el.position && el.data.topoViewerRole !== 'cloud')
    .map(el => ({ id: el.data.id as string, position: el.position! }));
}

/**
 * Create network node annotations from elements
 */
function createNetworkNodeAnnotations(elements: CyElement[]): any[] {
  return elements
    .filter(el => el.group === 'nodes' && el.position && el.data.topoViewerRole === 'cloud')
    .map(el => ({
      id: el.data.id as string,
      type: el.data.type as string || 'host',
      label: el.data.name as string || el.data.id as string,
      position: el.position!
    }));
}

// ============================================================================
// Initialize Mock System
// ============================================================================

// Create default annotations for initial load (just node positions)
const defaultAnnotations: TopologyAnnotations = {
  ...createDefaultAnnotations(),
  nodeAnnotations: createNodeAnnotations(sampleElements)
};

// Initialize state manager
const stateManager = new DevStateManager({
  currentElements: sampleElements,
  currentAnnotations: defaultAnnotations,
  mode: 'edit',
  deploymentState: 'undeployed',
  customNodes: sampleCustomNodes,
  defaultCustomNode: 'SRLinux Latest',
  labName: 'dev-topology'
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
// Load Topology Function
// ============================================================================

type TopologyName =
  | 'sample'
  | 'sampleWithAnnotations'
  | 'annotated'
  | 'network'
  | 'empty'
  | 'large'
  | 'large100'
  | 'large1000';

function loadTopology(name: TopologyName): void {
  let elements: CyElement[];
  let annotations: TopologyAnnotations;

  const emptyAnnotations = createDefaultAnnotations();

  switch (name) {
    case 'empty':
      elements = emptyElements;
      annotations = emptyAnnotations;
      break;

    case 'network':
      elements = networkElements;
      annotations = {
        ...emptyAnnotations,
        nodeAnnotations: createNodeAnnotations(networkElements),
        networkNodeAnnotations: createNetworkNodeAnnotations(networkElements)
      } as TopologyAnnotations;
      break;

    case 'large':
      elements = generateLargeTopology(25);
      annotations = emptyAnnotations;
      break;

    case 'large100':
      elements = generateLargeTopology(100);
      annotations = emptyAnnotations;
      break;

    case 'large1000':
      elements = generateLargeTopology(1000);
      annotations = emptyAnnotations;
      break;

    case 'annotated':
      elements = annotatedElements;
      annotations = { ...annotatedTopologyAnnotations };
      break;

    case 'sampleWithAnnotations':
      elements = sampleElements;
      annotations = {
        ...emptyAnnotations,
        nodeAnnotations: createNodeAnnotations(sampleElements)
      };
      break;

    case 'sample':
    default:
      elements = stripPositions(sampleElements);
      annotations = emptyAnnotations;
  }

  // Update state
  stateManager.loadTopology(elements, annotations);

  // Broadcast to webview
  window.postMessage({
    type: 'topology-data',
    data: {
      elements,
      freeTextAnnotations: annotations.freeTextAnnotations,
      freeShapeAnnotations: annotations.freeShapeAnnotations,
      groupStyleAnnotations: annotations.groupStyleAnnotations,
      nodeAnnotations: annotations.nodeAnnotations,
      cloudNodeAnnotations: annotations.cloudNodeAnnotations,
      networkNodeAnnotations: (annotations as any).networkNodeAnnotations
    }
  }, '*');

  console.log(
    `%c[Dev] Loaded ${name} topology with ${elements.length} elements`,
    'color: #2196F3;'
  );
}

// ============================================================================
// Window Globals
// ============================================================================

// Extend window with dev mode utilities
// Note: __SCHEMA_DATA__, __DOCKER_IMAGES__, __INITIAL_DATA__ are declared in webview code
declare global {
  interface Window {
    __DEV__: {
      loadTopology: (name: TopologyName) => void;
      setMode: (mode: 'edit' | 'view') => void;
      setDeploymentState: (state: 'deployed' | 'undeployed' | 'unknown') => void;
      setLatencyProfile: (profile: 'instant' | 'fast' | 'normal' | 'slow') => void;
      toggleSplitView: () => void;
      getYaml: () => string;
      getAnnotationsJson: () => string;
      stateManager: DevStateManager;
      latencySimulator: LatencySimulator;
    };
  }
}

// Build initial data for TopoViewerProvider
const initialData = buildInitialData({
  mode: 'edit',
  deploymentState: 'undeployed',
  elements: sampleElements,
  includeAnnotations: false
});

// Flatten annotations to top level
const flattenedInitialData = {
  ...initialData,
  freeTextAnnotations: defaultAnnotations.freeTextAnnotations,
  freeShapeAnnotations: defaultAnnotations.freeShapeAnnotations,
  groupStyleAnnotations: defaultAnnotations.groupStyleAnnotations,
  nodeAnnotations: defaultAnnotations.nodeAnnotations,
  cloudNodeAnnotations: defaultAnnotations.cloudNodeAnnotations
};

(window as any).__INITIAL_DATA__ = flattenedInitialData;
(window as any).__SCHEMA_DATA__ = initialData.schemaData;
(window as any).__DOCKER_IMAGES__ = initialData.dockerImages || [];

// Dev utilities (console API)
window.__DEV__ = {
  loadTopology,

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
  getYaml: () => {
    const yaml = splitViewPanel.getYaml();
    console.log(yaml);
    return yaml;
  },
  getAnnotationsJson: () => {
    const json = splitViewPanel.getAnnotationsJson();
    console.log(json);
    return json;
  },

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
console.log('Available dev utilities:');
console.log('  __DEV__.loadTopology("sample" | "sampleWithAnnotations" | "annotated" | ...)');
console.log('  __DEV__.setMode("edit" | "view")');
console.log('  __DEV__.setDeploymentState("deployed" | "undeployed" | "unknown")');
console.log('  __DEV__.setLatencyProfile("instant" | "fast" | "normal" | "slow")');
console.log('  __DEV__.toggleSplitView()');
console.log('  __DEV__.getYaml() / __DEV__.getAnnotationsJson()');
console.log('');
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
