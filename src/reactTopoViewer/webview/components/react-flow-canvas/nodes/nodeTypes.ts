/**
 * Node type registry for React Flow
 */
import type { NodeTypes } from '@xyflow/react';
import { TopologyNode } from './TopologyNode';
import { CloudNode } from './CloudNode';
import { GroupNode } from './GroupNode';
import { FreeTextNode } from './FreeTextNode';
import { FreeShapeNode } from './FreeShapeNode';

/**
 * Registry of all custom node types for React Flow
 */
export const nodeTypes: NodeTypes = {
  'topology-node': TopologyNode,
  'cloud-node': CloudNode,
  'group-node': GroupNode,
  'free-text-node': FreeTextNode,
  'free-shape-node': FreeShapeNode
};
