import type { TopoViewerState } from './types/topoViewerState';

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
};
