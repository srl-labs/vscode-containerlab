/**
 * React Flow Canvas barrel export
 */
export { ReactFlowCanvas } from "./ReactFlowCanvas";

// Types
// Note: Groups are rendered via GroupLayer, not as React Flow nodes
export type {
  ReactFlowCanvasRef,
  ReactFlowCanvasProps,
  TopologyNodeData,
  NetworkNodeData,
  FreeTextNodeData,
  FreeShapeNodeData,
  TopologyEdgeData,
  RFNodeData,
  RFNodeType,
  TopologyRFNode,
  NetworkRFNode,
  FreeTextRFNode,
  FreeShapeRFNode,
  TopologyRFEdge,
  AnnotationModeState,
  AnnotationHandlers,
  MovePositionEntry
} from "./types";
export { SELECTION_COLOR, DEFAULT_ICON_COLOR, ROLE_SVG_MAP } from "./types";

// Layout utilities
export type { LayoutName, LayoutOptions } from "./layout";
export {
  hasPresetPositions,
  applyForceLayout,
  applyLayout,
  getLayoutOptions
} from "./layout";

// Node and edge types
export { nodeTypes } from "./nodes";
export { edgeTypes } from "./edges";
