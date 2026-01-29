/**
 * Edge type registry for React Flow
 */
import type { EdgeTypes } from "@xyflow/react";

import { TopologyEdge } from "./TopologyEdge";
import { TopologyEdgeLite } from "./TopologyEdgeLite";

/**
 * Registry of all custom edge types for React Flow
 */
export const edgeTypes: EdgeTypes = {
  "topology-edge": TopologyEdge
};

/**
 * Lightweight edge registry for large/zoomed-out graphs.
 */
export const edgeTypesLite: EdgeTypes = {
  "topology-edge": TopologyEdgeLite
};
