/**
 * Shared utilities barrel file
 *
 * For large imports, prefer importing from sub-barrels directly:
 * - './conversions' - Node/network/element conversion utilities
 * - './identifiers' - ID generation and link type utilities
 * - './helpers' - Type helpers and migration utilities
 */

// Re-export from conversions
export {
  convertToEditorData,
  convertEditorDataToYaml,
  convertEditorDataToNodeSaveData,
  convertToNetworkEditorData,
  convertNetworkEditorDataToYaml,
  convertCustomTemplateToEditorData,
  convertEditorDataToSaveData,
  convertTemplateToEditorData,
  createNewTemplateEditorData,
  parsedElementToTopoNode,
  parsedElementToTopoEdge,
  convertElementsToTopologyData,
  topoNodeToParsedElement,
  topoEdgeToParsedElement,
  convertTopologyDataToElements,
} from "./conversions";
export type { YamlExtraData, SaveCustomNodeData } from "./conversions";

// Re-export from identifiers
export {
  generateDummyId,
  generateAdapterNodeId,
  generateSpecialNodeId,
  generateRegularNodeId,
  getUniqueId,
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
  splitEndpointLike,
} from "./identifiers";

// Re-export from helpers
export {
  getString,
  getStringOrEmpty,
  getNumber,
  getBoolean,
  getStringArray,
  getRecord,
  applyInterfacePatternMigrations,
} from "./helpers";
export type { InterfacePatternMigration } from "./helpers";
