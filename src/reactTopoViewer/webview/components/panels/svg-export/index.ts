/**
 * SVG Export module - barrel exports
 */

// Constants
export {
  NODE_ICON_SIZE,
  NODE_ICON_RADIUS,
  NODE_LABEL,
  DEFAULT_ICON_COLOR,
  EDGE_COLOR,
  EDGE_STYLE,
  EDGE_LABEL,
  CONTROL_POINT_STEP_SIZE,
  NETWORK_TYPE_COLOR,
  ROLE_SVG_MAP,
  TEXT_SHADOW_FILTER,
  getNetworkTypeColor,
  getRoleSvgType,
  buildSvgDefs
} from "./constants";

// Node rendering
export {
  topologyNodeToSvg,
  networkNodeToSvg,
  buildNodeLabelSvg,
  renderNodesToSvg
} from "./nodesToSvg";
export type { CustomIconMap } from "./nodesToSvg";

// Edge rendering
export {
  buildEdgeInfoForExport,
  edgeToSvg,
  renderEdgesToSvg
} from "./edgesToSvg";

// Annotation rendering (existing)
export {
  compositeAnnotationsIntoSvg,
  addBackgroundRect
} from "./annotationsToSvg";
export type { AnnotationData } from "./annotationsToSvg";
