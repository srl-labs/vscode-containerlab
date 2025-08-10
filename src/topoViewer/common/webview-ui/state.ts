import type { TopoViewerState } from '../types/topoViewerState';

export const topoViewerState: TopoViewerState = {
  cy: null,
  selectedNode: null,
  selectedEdge: null,
  linkEndpointVisibility: true,
  nodeContainerStatusVisibility: false,
  labName: '',
  prefixName: '',
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
  topoViewerState.linkEndpointVisibility = true;
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
