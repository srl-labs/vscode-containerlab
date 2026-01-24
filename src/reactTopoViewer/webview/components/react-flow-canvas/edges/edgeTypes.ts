/**
 * Edge type registry for React Flow
 */
import type { EdgeTypes } from '@xyflow/react';

import { TopologyEdge } from './TopologyEdge';

/**
 * Registry of all custom edge types for React Flow
 */
export const edgeTypes: EdgeTypes = {
  'topology-edge': TopologyEdge
};
