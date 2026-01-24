/**
 * Shared utilities barrel file
 */

// Node editor conversions
export {
  convertToEditorData,
  convertEditorDataToYaml,
  convertEditorDataToNodeSaveData
} from "./nodeEditorConversions";
export type { YamlExtraData } from "./nodeEditorConversions";

// Network editor conversions
export {
  convertToNetworkEditorData,
  convertNetworkEditorDataToYaml
} from "./networkEditorConversions";

// Custom node conversions
export {
  convertCustomTemplateToEditorData,
  convertEditorDataToSaveData,
  convertTemplateToEditorData,
  createNewTemplateEditorData
} from "./customNodeConversions";
export type { SaveCustomNodeData } from "./customNodeConversions";

// ID utilities
export {
  generateDummyId,
  generateAdapterNodeId,
  generateSpecialNodeId,
  generateRegularNodeId,
  getUniqueId
} from "./idUtils";

// Link types and utilities
export {
  STR_HOST,
  STR_MGMT_NET,
  PREFIX_MACVLAN,
  PREFIX_VXLAN,
  PREFIX_VXLAN_STITCH,
  PREFIX_DUMMY,
  PREFIX_BRIDGE,
  PREFIX_OVS_BRIDGE,
  TYPE_DUMMY,
  SINGLE_ENDPOINT_TYPES,
  VX_TYPES,
  HOSTY_TYPES,
  isSpecialEndpointId,
  isSpecialNodeOrBridge,
  splitEndpointLike
} from "./LinkTypes";

// Type helpers
export {
  getString,
  getStringOrEmpty,
  getNumber,
  getBoolean,
  getStringArray,
  getRecord
} from "./typeHelpers";

// Annotation migrations
export { applyInterfacePatternMigrations } from "./annotationMigrations";
export type { InterfacePatternMigration } from "./annotationMigrations";

// Element conversions (CyElement <-> ReactFlow)
export {
  cyElementToTopoNode,
  cyElementToTopoEdge,
  convertElementsToTopologyData,
  topoNodeToCyElement,
  topoEdgeToCyElement,
  convertTopologyDataToElements
} from "./elementConversions";
