import type { TopoViewerState } from './types/topoViewerState';
import type { LinkLabelMode } from './types/linkLabelMode';

const DEFAULT_LINK_LABEL_MODE: LinkLabelMode = 'show-all';

export const topoViewerState: TopoViewerState = {
  cy: null,
  selectedNode: null,
  selectedEdge: null,
  linkLabelMode: DEFAULT_LINK_LABEL_MODE,
  nodeContainerStatusVisibility: false,
  labName: '',
  prefixName: 'clab',
  multiLayerViewPortState: false,
  isGeoMapInitialized: false,
  isPanel01Cy: false,
  nodeClicked: false,
  edgeClicked: false,
  deploymentType: '',
  cytoscapeLeafletMap: null,
  cytoscapeLeafletLeaf: null,
  editorEngine: null,
};

export function resetState(): void {
  topoViewerState.cy = null;
  topoViewerState.selectedNode = null;
  topoViewerState.selectedEdge = null;
  topoViewerState.linkLabelMode = DEFAULT_LINK_LABEL_MODE;
  topoViewerState.nodeContainerStatusVisibility = false;
  topoViewerState.multiLayerViewPortState = false;
  topoViewerState.isGeoMapInitialized = false;
  topoViewerState.isPanel01Cy = false;
  topoViewerState.nodeClicked = false;
  topoViewerState.edgeClicked = false;
  topoViewerState.deploymentType = '';
  topoViewerState.cytoscapeLeafletMap = null;
  topoViewerState.cytoscapeLeafletLeaf = null;
  topoViewerState.editorEngine = null;
}

export default topoViewerState;
