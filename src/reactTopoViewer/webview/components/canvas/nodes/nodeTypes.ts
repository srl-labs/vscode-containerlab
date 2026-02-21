/**
 * Node type registry for React Flow
 */
import type { NodeTypes } from "@xyflow/react";

import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  TRAFFIC_RATE_NODE_TYPE,
  GROUP_NODE_TYPE,
} from "../../../annotations/annotationNodeConverters";

import { TopologyNode } from "./TopologyNode";
import { TopologyNodeLite } from "./TopologyNodeLite";
import { NetworkNode } from "./NetworkNode";
import { NetworkNodeLite } from "./NetworkNodeLite";
import { FreeTextNode } from "./FreeTextNode";
import { FreeShapeNode } from "./FreeShapeNode";
import { GroupNode } from "./GroupNode";
import { TrafficRateNode } from "./TrafficRateNode";

/**
 * Registry of all custom node types for React Flow
 */
export const nodeTypes: NodeTypes = {
  "topology-node": TopologyNode,
  "network-node": NetworkNode,
  [FREE_TEXT_NODE_TYPE]: FreeTextNode,
  [FREE_SHAPE_NODE_TYPE]: FreeShapeNode,
  [TRAFFIC_RATE_NODE_TYPE]: TrafficRateNode,
  [GROUP_NODE_TYPE]: GroupNode,
};

/**
 * Lightweight node registry for large/zoomed-out graphs.
 */
export const nodeTypesLite: NodeTypes = {
  "topology-node": TopologyNodeLite,
  "network-node": NetworkNodeLite,
  [FREE_TEXT_NODE_TYPE]: FreeTextNode,
  [FREE_SHAPE_NODE_TYPE]: FreeShapeNode,
  [TRAFFIC_RATE_NODE_TYPE]: TrafficRateNode,
  [GROUP_NODE_TYPE]: GroupNode,
};
