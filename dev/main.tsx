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
  sampleAnnotations,
  annotatedElements,
  annotatedTopologyAnnotations,
  emptyElements,
  networkElements,
  generateLargeTopology,
  generateYamlFromElements
} from './mockData';
import type { TopologyAnnotations } from '@shared/types/topology';

// ============================================================================
// Dev Mode State
// ============================================================================

interface DevState {
  splitViewOpen: boolean;
  currentElements: typeof sampleElements;
  currentAnnotations: TopologyAnnotations;
  clipboard: unknown | null;
  graphBatchDepth: number;
  pendingTopologyBroadcast: boolean;
}

// Empty annotations to simulate no annotations.json file on load
const emptyAnnotationsDefault: TopologyAnnotations = {
  freeTextAnnotations: [],
  freeShapeAnnotations: [],
  groupStyleAnnotations: [],
  cloudNodeAnnotations: [],
  nodeAnnotations: [],
  aliasEndpointAnnotations: []
};

/**
 * Strip positions from elements to simulate no annotations.json (triggers COSE layout)
 */
function stripPositions(elements: typeof sampleElements): typeof sampleElements {
  return elements.map(el => {
    if (el.group === 'nodes') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { position, ...rest } = el;
      return rest as typeof el;
    }
    return el;
  });
}

// Default annotations for sampleWithAnnotations - node positions only
const sampleWithAnnotationsDefault: TopologyAnnotations = {
  freeTextAnnotations: [],
  freeShapeAnnotations: [],
  groupStyleAnnotations: [],
  cloudNodeAnnotations: [],
  nodeAnnotations: sampleElements
    .filter(el => el.group === 'nodes' && el.position)
    .map(el => ({ id: el.data.id as string, position: el.position! })),
  aliasEndpointAnnotations: []
};

const devState: DevState = {
  splitViewOpen: false,
  currentElements: sampleElements,  // Use sampleWithAnnotations by default (with positions)
  currentAnnotations: { ...sampleWithAnnotationsDefault },  // Include node positions
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
        if (!devState.currentAnnotations.nodeAnnotations) {
          devState.currentAnnotations.nodeAnnotations = [];
        }
        devState.currentAnnotations.nodeAnnotations.push({
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
        if (devState.currentAnnotations.nodeAnnotations) {
          devState.currentAnnotations.nodeAnnotations = devState.currentAnnotations.nodeAnnotations.filter(a => a.id !== nodeId);
        }
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
        devState.currentAnnotations.freeTextAnnotations = message.annotations as TopologyAnnotations['freeTextAnnotations'];
        updateSplitViewContent();
      }
      break;

    case 'save-free-shape-annotations':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Saving free shape annotations:', message);
      if (message.annotations) {
        devState.currentAnnotations.freeShapeAnnotations = message.annotations as TopologyAnnotations['freeShapeAnnotations'];
        updateSplitViewContent();
      }
      break;

    case 'save-group-style-annotations':
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Saving group style annotations:', message);
      if (message.annotations) {
        devState.currentAnnotations.groupStyleAnnotations = message.annotations as TopologyAnnotations['groupStyleAnnotations'];
        updateSplitViewContent();
      }
      break;

    case 'save-node-group-membership': {
      console.log('%c[Mock Extension]', 'color: #FF9800;', 'Saving node group membership:', message);
      const { nodeId, group, level } = message as { nodeId?: string; group?: string | null; level?: string | null };
      if (nodeId) {
        if (!devState.currentAnnotations.nodeAnnotations) {
          devState.currentAnnotations.nodeAnnotations = [];
        }
        const existing = devState.currentAnnotations.nodeAnnotations.find(a => a.id === nodeId);
        if (existing) {
          if (group) {
            existing.group = group;
            existing.level = level || '1';
          } else {
            delete existing.group;
            delete existing.level;
          }
        } else if (group) {
          devState.currentAnnotations.nodeAnnotations.push({
            id: nodeId,
            group,
            level: level || '1'
          });
        }
        updateSplitViewContent();
      }
      break;
    }

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

        // Initialize annotation arrays if needed
        if (!devState.currentAnnotations.nodeAnnotations) {
          devState.currentAnnotations.nodeAnnotations = [];
        }
        if (!(devState.currentAnnotations as any).networkNodeAnnotations) {
          (devState.currentAnnotations as any).networkNodeAnnotations = [];
        }

        for (const posData of positionsArray) {
          // Check if this is a network/cloud node
          const element = devState.currentElements.find(el => el.group === 'nodes' && el.data.id === posData.id);
          const isNetworkNode = element?.data.topoViewerRole === 'cloud';

          if (isNetworkNode) {
            // Update networkNodeAnnotations
            const networkAnnotations = (devState.currentAnnotations as any).networkNodeAnnotations;
            const existing = networkAnnotations.find((a: any) => a.id === posData.id);
            if (existing) {
              existing.position = posData.position;
            } else {
              networkAnnotations.push({
                id: posData.id,
                type: element?.data.type || 'host',
                label: element?.data.name || posData.id,
                position: posData.position
              });
            }
          } else {
            // Update regular nodeAnnotations
            const existing = devState.currentAnnotations.nodeAnnotations.find(a => a.id === posData.id);
            if (existing) {
              existing.position = posData.position;
            } else {
              devState.currentAnnotations.nodeAnnotations.push({ id: posData.id, position: posData.position });
            }
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
    annotationsContent.textContent = JSON.stringify(devState.currentAnnotations, null, 2);
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
      loadTopology: (name: 'sample' | 'sampleWithAnnotations' | 'annotated' | 'network' | 'empty' | 'large' | 'large100' | 'large1000') => void;
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
  deploymentState: 'undeployed',
  elements: sampleElements,  // Use sampleWithAnnotations by default (with positions)
  includeAnnotations: false  // We'll add our own annotations below
});

// Flatten annotations to top level - hooks expect __INITIAL_DATA__.freeTextAnnotations, not nested
// Use sampleWithAnnotationsDefault (node positions only, no groups/text/shapes)
const flattenedInitialData = {
  ...initialData,
  freeTextAnnotations: sampleWithAnnotationsDefault.freeTextAnnotations,
  freeShapeAnnotations: sampleWithAnnotationsDefault.freeShapeAnnotations,
  groupStyleAnnotations: sampleWithAnnotationsDefault.groupStyleAnnotations,
  nodeAnnotations: sampleWithAnnotationsDefault.nodeAnnotations,
  cloudNodeAnnotations: sampleWithAnnotationsDefault.cloudNodeAnnotations
};

window.__INITIAL_DATA__ = flattenedInitialData;
// Cast to expected types - these are declared in webview code
(window as { __SCHEMA_DATA__?: unknown }).__SCHEMA_DATA__ = initialData.schemaData;
(window as { __DOCKER_IMAGES__?: string[] }).__DOCKER_IMAGES__ = initialData.dockerImages || [];

// ============================================================================
// Dev Utilities (accessible from browser console)
// ============================================================================

window.__DEV__ = {
  /**
   * Load different topology configurations
   * Usage: __DEV__.loadTopology('annotated')
   */
  loadTopology: (name: 'sample' | 'sampleWithAnnotations' | 'annotated' | 'network' | 'empty' | 'large' | 'large100' | 'large1000') => {
    let elements;
    let annotations: TopologyAnnotations;
    const emptyAnnotations: TopologyAnnotations = {
      freeTextAnnotations: [],
      freeShapeAnnotations: [],
      groupStyleAnnotations: [],
      cloudNodeAnnotations: [],
      nodeAnnotations: [],
      aliasEndpointAnnotations: []
    };
    switch (name) {
      case 'empty':
        elements = emptyElements;
        annotations = emptyAnnotations;
        break;
      case 'network':
        // All network types: host, mgmt-net, macvlan, vxlan, vxlan-stitch, dummy, bridge, ovs-bridge
        elements = networkElements;
        annotations = {
          freeTextAnnotations: [],
          freeShapeAnnotations: [],
          groupStyleAnnotations: [],
          cloudNodeAnnotations: [],
          // Regular nodes (non-cloud)
          nodeAnnotations: networkElements
            .filter(el => el.group === 'nodes' && el.position && el.data.topoViewerRole !== 'cloud')
            .map(el => ({ id: el.data.id as string, position: el.position! })),
          // Network/cloud nodes
          networkNodeAnnotations: networkElements
            .filter(el => el.group === 'nodes' && el.position && el.data.topoViewerRole === 'cloud')
            .map(el => ({
              id: el.data.id as string,
              type: el.data.type as 'host' | 'mgmt-net' | 'macvlan' | 'vxlan' | 'vxlan-stitch' | 'dummy' | 'bridge' | 'ovs-bridge',
              label: el.data.name as string,
              position: el.position!
            })),
          aliasEndpointAnnotations: []
        };
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
        // Only node positions - no groups, text, or shapes
        annotations = {
          freeTextAnnotations: [],
          freeShapeAnnotations: [],
          groupStyleAnnotations: [],
          cloudNodeAnnotations: [],
          nodeAnnotations: sampleElements
            .filter(el => el.group === 'nodes' && el.position)
            .map(el => ({ id: el.data.id as string, position: el.position! })),
          aliasEndpointAnnotations: []
        };
        break;
      case 'sample':
      default:
        elements = stripPositions(sampleElements);  // No positions = triggers COSE layout
        annotations = emptyAnnotations;  // No annotations.json
    }
    devState.currentElements = elements;
    devState.currentAnnotations = annotations;
    // Flatten annotations to top level - hooks expect data.freeTextAnnotations, not data.annotations.freeTextAnnotations
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
console.log('  __DEV__.loadTopology("sample" | "sampleWithAnnotations" | "annotated" | "network" | "empty" | ...)');
console.log('    - sample: Spine-leaf without annotations.json (triggers COSE layout)');
console.log('    - sampleWithAnnotations: Spine-leaf with saved positions and annotations');
console.log('    - annotated: DC topology with groups, freetext, and freeshapes');
console.log('    - network: All network types (host, mgmt-net, macvlan, vxlan, vxlan-stitch, dummy, bridge, ovs-bridge)');
console.log('    - empty: Empty canvas (no nodes, links, or annotations)');
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
