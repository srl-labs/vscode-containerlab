export interface TopoViewerState {
  cy: any;
  selectedNode: any;
  selectedEdge: any;
  linkEndpointVisibility: boolean;
  nodeContainerStatusVisibility: boolean;
  labName: string;
  prefixName: string;
  multiLayerViewPortState: boolean;
  isGeoMapInitialized: boolean;
  isPanel01Cy: boolean;
  nodeClicked: boolean;
  edgeClicked: boolean;
  deploymentType: string;
  cytoscapeLeafletMap: any;
  cytoscapeLeafletLeaf: any;
}

export const topoViewerState: TopoViewerState = {
  cy: undefined,
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
  cytoscapeLeafletMap: undefined,
  cytoscapeLeafletLeaf: undefined,
};
