/* eslint-disable */
import type { ManagerLayoutAlgo } from '../webview-ui/managerLayoutAlgo';
import type { ManagerGroupManagement } from '../webview-ui/managerGroupManagement';
import type { TopologyWebviewController } from '../webview-ui/topologyWebviewController';

declare global {
  interface LayoutManager extends ManagerLayoutAlgo {}

  interface GlobalState {
    layoutManager?: LayoutManager;
    groupManager?: ManagerGroupManagement;
    // layout control functions
    layoutAlgoChange?: (..._args: any[]) => void;
    viewportButtonsLayoutAlgo?: (..._args: any[]) => void;
    viewportDrawerLayoutGeoMap?: (..._args: any[]) => void;
    viewportDrawerDisableGeoMap?: (..._args: any[]) => void;
    viewportDrawerLayoutForceDirected?: (..._args: any[]) => void;
    viewportDrawerLayoutForceDirectedRadial?: (..._args: any[]) => void;
    viewportDrawerLayoutVertical?: (..._args: any[]) => void;
    viewportDrawerLayoutHorizontal?: (..._args: any[]) => void;
    viewportDrawerPreset?: (..._args: any[]) => void;
    viewportButtonsGeoMapPan?: (..._args: any[]) => void;
    viewportButtonsGeoMapEdit?: (..._args: any[]) => void;
    viewportButtonsTopologyOverview?: (..._args: any[]) => void;
    viewportButtonsZoomToFit?: () => void;
    viewportButtonsLabelEndpoint?: () => void;
    viewportButtonsCaptureViewportAsSvg?: () => void;
    viewportButtonsReloadTopo?: () => void;
    viewportButtonsSaveTopo?: () => void;
    viewportButtonsUndo?: () => void;
    showPanelAbout?: () => void;
    // group manager bindings
    orphaningNode?: (..._args: any[]) => void;
    createNewParent?: (..._args: any[]) => void;
    panelNodeEditorParentToggleDropdown?: (..._args: any[]) => void;
    nodeParentPropertiesUpdate?: (..._args: any[]) => void;
    nodeParentPropertiesUpdateClose?: (..._args: any[]) => void;
    nodeParentRemoval?: (..._args: any[]) => void;
    viewportButtonsAddGroup?: (..._args: any[]) => void;
    showPanelGroupEditor?: (..._args: any[]) => void;
    // library globals
    cytoscape?: typeof import('cytoscape');
    L?: any;
    tippy?: any;
    cytoscapePopper?: any;
    // environment globals
    isVscodeDeployment?: boolean;
    loadCytoStyle?: (cy: any, theme?: 'light' | 'dark') => void;
    jsonFileUrlDataCytoMarshall?: string;
    jsonFileUrlDataEnvironment?: string;
    schemaUrl?: string;
    ifacePatternMapping?: Record<string, string>;
    imageMapping?: Record<string, string>;
    updateLinkEndpointsOnKindChange?: boolean;
    defaultKind?: string;
    defaultType?: string;
    vscode?: { postMessage(data: unknown): void };
    topologyWebviewController?: TopologyWebviewController;
  }

  // Augment the Window interface
  interface Window extends GlobalState {}
}

export {};
