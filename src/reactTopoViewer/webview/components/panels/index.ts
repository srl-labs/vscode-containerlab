/**
 * Panel components barrel file
 */

// Info panels
export { NodeInfoPanel } from "./NodeInfoPanel";
export { LinkInfoPanel } from "./LinkInfoPanel";

// Node editor
export { NodeEditorPanel, ComponentsTab, INTEGRATED_SROS_TYPES } from "./node-editor";
export type {
  NodeEditorData,
  NodeEditorTabId,
  SrosComponent,
  SrosMda,
  SrosXiom
} from "./node-editor";

// Link editor
export {
  LinkEditorPanel,
  LinkBasicTab,
  LinkExtendedTab,
  validateLinkEditorData
} from "./link-editor";
export type { LinkEditorData, LinkEditorTabId, LinkEndpoint, LinkTabProps } from "./link-editor";

// Network editor
export {
  NetworkEditorPanel,
  NETWORK_TYPES,
  VXLAN_TYPES,
  BRIDGE_TYPES,
  HOST_TYPES
} from "./network-editor";
export type { NetworkEditorData, NetworkType } from "./network-editor";

// Free text editor
export { FreeTextEditorPanel } from "./free-text-editor";

// Free shape editor
export { FreeShapeEditorPanel } from "./free-shape-editor";

// Group editor
export { GroupEditorPanel, GroupFormContent } from "./group-editor";

// Lab settings
export { LabSettingsPanel } from "./lab-settings";
export type { LabSettings, MgmtSettings } from "./lab-settings";

// Bulk link
export {
  BulkLinkPanel,
  CopyableCode,
  ConfirmBulkLinksModal,
  computeCandidates,
  buildBulkEdges,
  buildUndoRedoEntries
} from "./bulk-link";
export type { LinkCandidate } from "./bulk-link";

// Utility panels
export { AboutPanel } from "./AboutPanel";
export { ShortcutsPanel } from "./ShortcutsPanel";
export { FindNodePanel } from "./FindNodePanel";
export { SvgExportPanel } from "./SvgExportPanel";

// Floating panel
export {
  FloatingActionPanel,
  PanelButton,
  DrawerButton,
  DeployButtonGroup,
  PanelButtonWithDropdown,
  filterDropdownItems,
  buildMenuClass,
  buildItemClass,
  DropdownItem
} from "./floatingPanel";
export type { FloatingActionPanelHandle, DropdownMenuItem } from "./floatingPanel";
