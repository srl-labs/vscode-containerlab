// file: topoViewerState.ts
// Shape of the shared webview state object.

import type cytoscape from 'cytoscape';

export interface TopoViewerState {
  cy: cytoscape.Core | null;
  selectedNode: string | null;
  selectedEdge: string | null;
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
  editorEngine?: any;
}
