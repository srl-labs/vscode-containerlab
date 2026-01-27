/**
 * Node type registry for React Flow
 */
import type { NodeTypes } from "@xyflow/react";

import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../../annotations/annotationNodeConverters";

import { TopologyNode } from "./TopologyNode";
import { CloudNode } from "./CloudNode";
import { FreeTextNode } from "./FreeTextNode";
import { FreeShapeNode } from "./FreeShapeNode";
import { GroupNode } from "./GroupNode";

/**
 * Registry of all custom node types for React Flow
 */
export const nodeTypes: NodeTypes = {
  "topology-node": TopologyNode,
  "cloud-node": CloudNode,
  [FREE_TEXT_NODE_TYPE]: FreeTextNode,
  [FREE_SHAPE_NODE_TYPE]: FreeShapeNode,
  [GROUP_NODE_TYPE]: GroupNode
};
