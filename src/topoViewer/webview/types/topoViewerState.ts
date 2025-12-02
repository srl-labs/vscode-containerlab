import type cytoscape from 'cytoscape';
import type { LinkLabelMode } from './linkLabelMode';

export interface TopoViewerState {
  cy: cytoscape.Core | null;
  selectedNode: string | null;
  selectedEdge: string | null;
  linkLabelMode: LinkLabelMode;
  nodeContainerStatusVisibility: boolean;
  dummyLinksVisible: boolean;
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
