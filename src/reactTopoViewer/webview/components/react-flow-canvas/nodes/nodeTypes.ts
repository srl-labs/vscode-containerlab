/**
 * Node type registry for React Flow
 */
import type { NodeTypes } from "@xyflow/react";

import { TopologyNode } from "./TopologyNode";
import { CloudNode } from "./CloudNode";
import { FreeTextNode } from "./FreeTextNode";
import { FreeShapeNode } from "./FreeShapeNode";

/**
 * Registry of all custom node types for React Flow
 * Note: Groups are rendered via GroupLayer, not as React Flow nodes
 */
export const nodeTypes: NodeTypes = {
  "topology-node": TopologyNode,
  "cloud-node": CloudNode,
  "free-text-node": FreeTextNode,
  "free-shape-node": FreeShapeNode
};
