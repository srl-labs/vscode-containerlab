/**
 * Conversion utilities barrel file
 */

// Node editor conversions
export {
  convertToEditorData,
  convertEditorDataToYaml,
  convertEditorDataToNodeSaveData,
} from "../nodeEditorConversions";
export type { YamlExtraData } from "../nodeEditorConversions";

// Network editor conversions
export {
  convertToNetworkEditorData,
  convertNetworkEditorDataToYaml,
} from "../networkEditorConversions";

// Custom node conversions
export {
  convertCustomTemplateToEditorData,
  convertEditorDataToSaveData,
  convertTemplateToEditorData,
  createNewTemplateEditorData,
} from "../customNodeConversions";
export type { SaveCustomNodeData } from "../customNodeConversions";

// Element conversions (ParsedElement <-> ReactFlow)
export {
  parsedElementToTopoNode,
  parsedElementToTopoEdge,
  convertElementsToTopologyData,
  topoNodeToParsedElement,
  topoEdgeToParsedElement,
  convertTopologyDataToElements,
} from "../elementConversions";
