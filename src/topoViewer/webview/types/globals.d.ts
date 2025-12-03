/* eslint-disable */
import type { ManagerLayoutAlgo } from '../features/canvas/LayoutAlgorithms';
import type { ManagerGroupManagement } from '../features/groups/GroupManager';
import type TopologyWebviewController from '../app/TopologyShell';

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
    viewportSetLinkLabelMode?: (mode: string) => void;
    viewportToggleLinkLabelMenu?: (event?: MouseEvent) => void;
    viewportSelectLinkLabelMode?: (mode: string) => void;
    viewportCloseLinkLabelMenu?: () => void;
    viewportButtonsCaptureViewportAsSvg?: () => void;
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
    loadCytoStyle?: (cy: any, theme?: 'light' | 'dark', options?: { preserveExisting?: boolean }) => void;
    jsonFileUrlDataCytoMarshall?: string;
    jsonFileUrlDataEnvironment?: string;
    schemaUrl?: string;
    ifacePatternMapping?: Record<string, string>;
    imageMapping?: Record<string, string>;
    updateLinkEndpointsOnKindChange?: boolean;
    lockLabByDefault?: boolean;
    defaultKind?: string;
    defaultType?: string;
    customNodes?: Array<{
      name: string;
      kind: string;
      type?: string;
      image?: string;
      baseName?: string;
      icon?: string;
      interfacePattern?: string;
      setDefault?: boolean;
    }>;
    defaultNode?: string;
    topologyDefaults?: Record<string, any>;
    topologyKinds?: Record<string, any>;
    topologyGroups?: Record<string, any>;
    customIcons?: Record<string, string>;
    vscode?: { postMessage(data: unknown): void };
    topologyWebviewController?: TopologyWebviewController;
  }

  // Augment the Window interface
  interface Window extends GlobalState {}
}

export {};
