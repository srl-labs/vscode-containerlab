/**
 * useNodeCreation - Hook for creating nodes via Shift+Click on canvas
 */
import { useEffect, useCallback, useRef } from 'react';
import type { Core, EventObject } from 'cytoscape';

import { log } from '../../utils/logger';
import type { CyElement } from '../../../shared/types/messages';
import type { CustomNodeTemplate } from '../../../shared/types/editors';
import { getUniqueId } from '../../../shared/utilities/idUtils';
import { convertEditorDataToYaml } from '../../../shared/utilities/nodeEditorConversions';

interface NodeCreationOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  getUsedNodeNames: () => Set<string>;
  getUsedNodeIds: () => Set<string>;
  onNodeCreated: (nodeId: string, nodeElement: CyElement, position: { x: number; y: number }) => void;
  onLockedClick?: () => void;
}

interface NodeData {
  id: string;
  name: string;
  editor: string;
  weight: string;
  parent: string;
  topoViewerRole: string;
  iconColor?: string;
  iconCornerRadius?: number;
  sourceEndpoint: string;
  targetEndpoint: string;
  containerDockerExtraAttribute: { state: string; status: string };
  extraData: NodeExtraData;
  [key: string]: unknown;
}

interface NodeExtraData {
  kind: string;
  longname: string;
  image: string;
  type?: string;
  mgmtIpv4Address: string;
  fromCustomTemplate?: boolean;
  [key: string]: unknown;
}

let nodeCounter = 0;

/**
 * Initialize node counter based on existing nodes
 */
function initializeNodeCounter(nodeIds: Iterable<string>): void {
  if (nodeCounter !== 0) return;

  const maxId = [...nodeIds]
    .filter(id => id.startsWith('nodeId-'))
    .map(id => parseInt(id.replace('nodeId-', ''), 10))
    .filter(num => !isNaN(num))
    .reduce((max, current) => Math.max(max, current), 0);
  nodeCounter = maxId;
}

/**
 * Generate a unique node ID
 */
function generateNodeId(): string {
  nodeCounter++;
  return `nodeId-${nodeCounter}`;
}

/**
 * Generate a unique node name based on template or default
 * Uses getUniqueId to match legacy behavior (srl → srl1, srl2, etc.)
 */
function generateNodeName(defaultName: string, usedNames: Set<string>, template?: CustomNodeTemplate): string {
  if (!template?.baseName) {
    return defaultName;
  }

  return getUniqueId(template.baseName, usedNames);
}

/**
 * Determine the type for a node
 */
function determineType(kind: string, template?: CustomNodeTemplate): string | undefined {
  if (template?.type) {
    return template.type;
  }

  const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
  if (!nokiaKinds.includes(kind)) {
    return undefined;
  }

  // If this template represents a custom node (has a name) but no explicit type,
  // avoid assigning a default type.
  if (template?.name) {
    return undefined;
  }

  return 'ixr-d2l';
}

/**
 * Fields that are handled separately and should not be included in extraData.
 * These are either top-level node properties or annotation-only fields.
 */
const TEMPLATE_EXCLUDED_FIELDS = new Set([
  'name', 'kind', 'type', 'image', 'icon', 'iconColor', 'iconCornerRadius',
  'setDefault', 'baseName', 'interfacePattern', 'oldName'
]);

/**
 * Extract extra template data and convert to kebab-case for YAML compatibility.
 * Template fields are stored in camelCase (e.g., autoRemove) but extraData
 * needs kebab-case (e.g., auto-remove) for proper YAML persistence.
 */
function extractExtraTemplate(template?: CustomNodeTemplate): Record<string, unknown> {
  if (!template) return {};

  // Filter out excluded fields first
  const templateData = Object.fromEntries(
    Object.entries(template).filter(([key]) => !TEMPLATE_EXCLUDED_FIELDS.has(key))
  );

  // If no extra fields, return empty object
  if (Object.keys(templateData).length === 0) return {};

  // Convert camelCase fields to kebab-case using the same conversion as node editor
  // This ensures fields like autoRemove -> auto-remove, startupConfig -> startup-config
  const yamlData = convertEditorDataToYaml(templateData);

  // Filter out null values (used to signal deletion) and undefined values
  return Object.fromEntries(
    Object.entries(yamlData).filter(([, v]) => v !== null && v !== undefined)
  );
}

/**
 * Create node data for a new containerlab node
 */
function createNodeData(
  nodeId: string,
  nodeName: string,
  template: CustomNodeTemplate | undefined,
  kind: string
): NodeData {
  const extraData: NodeExtraData = {
    kind,
    longname: '',
    image: template?.image || '',
    mgmtIpv4Address: '',
    fromCustomTemplate: Boolean(template?.name),
    ...extractExtraTemplate(template)
  };

  const type = determineType(kind, template);
  if (type) {
    extraData.type = type;
  }

  // Include interfacePattern in extraData for edge creation
  if (template?.interfacePattern) {
    extraData.interfacePattern = template.interfacePattern;
  }

  const nodeData: NodeData = {
    id: nodeId,
    editor: 'true',
    weight: '30',
    name: nodeName,
    parent: '',
    topoViewerRole: template?.icon || 'pe',
    sourceEndpoint: '',
    targetEndpoint: '',
    containerDockerExtraAttribute: { state: '', status: '' },
    extraData
  };

  // Add icon styling properties if provided
  if (template?.iconColor) {
    (nodeData as Record<string, unknown>).iconColor = template.iconColor;
  }
  if (template?.iconCornerRadius !== undefined) {
    (nodeData as Record<string, unknown>).iconCornerRadius = template.iconCornerRadius;
  }

  return nodeData;
}

/**
 * Determine position for a new node
 */
function determinePosition(cy: Core, event: EventObject): { x: number; y: number } {
  const extent = cy.extent();
  let position = event.position;

  if (
    !position ||
    position.x < extent.x1 ||
    position.x > extent.x2 ||
    position.y < extent.y1 ||
    position.y > extent.y2
  ) {
    const viewportCenterX = (extent.x1 + extent.x2) / 2;
    const viewportCenterY = (extent.y1 + extent.y2) / 2;
    const viewportWidth = extent.x2 - extent.x1;
    const viewportHeight = extent.y2 - extent.y1;
    const maxOffsetX = viewportWidth * 0.3;
    const maxOffsetY = viewportHeight * 0.3;
    position = {
      x: viewportCenterX + maxOffsetX * 0.1,
      y: viewportCenterY + maxOffsetY * 0.1
    };
  }

  return position;
}

/**
 * Convert NodeData to CyElement format
 */
function nodeDataToCyElement(data: NodeData, position: { x: number; y: number }): CyElement {
  return {
    group: 'nodes',
    data: data as unknown as Record<string, unknown>,
    position
  };
}

/**
 * Hook for handling node creation via Shift+Click on canvas
 */
export function useNodeCreation(
  cy: Core | null,
  options: NodeCreationOptions
): { createNodeAtPosition: (position: { x: number; y: number }, template?: CustomNodeTemplate) => void } {
  const { onNodeCreated } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const reservedIdsRef = useRef<Set<string>>(new Set());
  const reservedNamesRef = useRef<Set<string>>(new Set());

  const getUsedNames = () => {
    const base = optionsRef.current.getUsedNodeNames();
    const combined = new Set<string>(base);
    for (const name of reservedNamesRef.current) combined.add(name);
    return combined;
  };

  const getUsedIds = () => {
    const base = optionsRef.current.getUsedNodeIds();
    const combined = new Set<string>(base);
    for (const id of reservedIdsRef.current) combined.add(id);
    return combined;
  };

  /**
   * Create a node at a specific position
   */
  const createNodeAtPosition = useCallback((
    position: { x: number; y: number },
    template?: CustomNodeTemplate
  ) => {
    if (!cy) return;

    initializeNodeCounter(getUsedIds());

    const generatedId = generateNodeId();
    const usedNames = getUsedNames();
    const nodeName = generateNodeName(generatedId, usedNames, template);
    const nodeId = nodeName || generatedId;

    const kind = template?.kind || 'nokia_srlinux';
    const nodeData = createNodeData(nodeId, nodeName, template, kind);

    // Create CyElement for state update
    const cyElement = nodeDataToCyElement(nodeData, position);

    log.info(`[NodeCreation] Created node: ${nodeId} at (${position.x}, ${position.y})`);

    reservedIdsRef.current.add(nodeId);
    if (nodeName) reservedNamesRef.current.add(nodeName);
    onNodeCreated(nodeId, cyElement, position);
  }, [cy, onNodeCreated]);

  useEffect(() => {
    if (!cy) return;

    const handleCanvasTap = (event: EventObject) => {
      const { mode, isLocked, customNodes, defaultNode, onLockedClick } = optionsRef.current;

      // Only handle in edit mode
      if (mode !== 'edit') return;

      // Check if clicking on the canvas itself (not on an element)
      if (event.target !== cy) return;

      const originalEvent = event.originalEvent as MouseEvent;

      // Only handle Shift+Click
      if (!originalEvent?.shiftKey) return;

      // Check if locked
      if (isLocked) {
        log.debug('[NodeCreation] Canvas is locked, cannot create node');
        onLockedClick?.();
        return;
      }

      // Find the template to use
      let template: CustomNodeTemplate | undefined;
      if (defaultNode) {
        template = customNodes.find(n => n.name === defaultNode);
      }

      // Determine position
      const position = determinePosition(cy, event);

      log.info(`[NodeCreation] Shift+Click on canvas at (${position.x}, ${position.y})`);

      createNodeAtPosition(position, template);
    };

    cy.on('tap', handleCanvasTap);

    return () => {
      cy.off('tap', handleCanvasTap);
    };
  }, [cy, createNodeAtPosition]);

  return { createNodeAtPosition };
}
