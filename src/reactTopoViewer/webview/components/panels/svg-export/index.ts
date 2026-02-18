// SVG export barrel.

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
export { buildEdgeInfoForExport, edgeToSvg, renderEdgesToSvg } from "./edgesToSvg";

// Annotation rendering (existing)
export { compositeAnnotationsIntoSvg, addBackgroundRect } from "./annotationsToSvg";
export type { AnnotationData } from "./annotationsToSvg";

// Graph export helpers
export { getViewportSize, buildViewportTransform, buildGraphSvg, applyPadding } from "./graphSvg";
export type { GraphSvgResult, ViewportSize } from "./graphSvg";

// Grafana export helpers
export {
  collectGrafanaEdgeCellMappings,
  sanitizeSvgForGrafana,
  applyGrafanaCellIdsToSvg,
  buildGrafanaPanelYaml,
  buildGrafanaDashboardJson
} from "./grafanaExport";
export type { GrafanaEdgeCellMapping } from "./grafanaExport";
