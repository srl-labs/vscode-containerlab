/**
 * useNodeCreation - Hook for creating nodes via Shift+Click on canvas
 *
 * Uses ReactFlow instance for viewport operations.
 * The event handling should be integrated via ReactFlow's onPaneClick callback.
 */
import { useCallback, useEffect, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import { log } from "../../utils/logger";
import type { TopoNode, TopologyNodeData } from "../../../shared/types/graph";
import type { CustomNodeTemplate } from "../../../shared/types/editors";
import { getUniqueId } from "../../../shared/utilities/idUtils";
import { convertEditorDataToYaml } from "../../../shared/utilities/nodeEditorConversions";

interface NodeCreationOptions {
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  getUsedNodeIds: () => Set<string>;
  onNodeCreated: (
    nodeId: string,
    nodeElement: TopoNode,
    position: { x: number; y: number }
  ) => void;
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

/**
 * Generate a unique node name based on template or default
 * Uses getUniqueId to match legacy behavior (srl → srl1, srl2, etc.)
 */
function generateNodeName(baseName: string, usedIds: Set<string>): string {
  return getUniqueId(baseName, usedIds);
}

function resolveTemplate(
  template: CustomNodeTemplate | undefined,
  options: NodeCreationOptions
): CustomNodeTemplate | undefined {
  if (template) return template;
  if (options.defaultNode) {
    const defaultTemplate = options.customNodes.find((node) => node.name === options.defaultNode);
    if (defaultTemplate) return defaultTemplate;
  }
  return options.customNodes[0];
}

function resolveBaseName(template: CustomNodeTemplate): string | null {
  const baseName = (template.baseName ?? template.name).trim();
  return baseName ? baseName : null;
}

function toNonEmptyString(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined;
  return value;
}

function resolveTemplateRole(template: CustomNodeTemplate | undefined): string {
  return toNonEmptyString(template?.icon) ?? "pe";
}

function applyOptionalNodeStyle(
  nodeData: NodeData,
  template: CustomNodeTemplate | undefined
): void {
  const iconColor = toNonEmptyString(template?.iconColor);
  if (iconColor !== undefined) {
    nodeData.iconColor = iconColor;
  }
  if (template?.iconCornerRadius !== undefined) {
    nodeData.iconCornerRadius = template.iconCornerRadius;
  }
}

function getResolvedKind(template: CustomNodeTemplate): string {
  return template.kind.length > 0 ? template.kind : "nokia_srlinux";
}

/**
 * Determine the type for a node
 */
function determineType(kind: string, template?: CustomNodeTemplate): string | undefined {
  if (template?.type !== undefined && template.type.length > 0) {
    return template.type;
  }

  const nokiaKinds = ["nokia_srlinux", "nokia_srsim", "nokia_sros"];
  if (!nokiaKinds.includes(kind)) {
    return undefined;
  }

  // If this template represents a custom node (has a name) but no explicit type,
  // avoid assigning a default type.
  if (template?.name !== undefined && template.name.length > 0) {
    return undefined;
  }

  return "ixr-d2l";
}

/**
 * Fields that are handled separately and should not be included in extraData.
 * These are either top-level node properties or annotation-only fields.
 */
const TEMPLATE_EXCLUDED_FIELDS = new Set([
  "name",
  "kind",
  "type",
  "image",
  "icon",
  "iconColor",
  "iconCornerRadius",
  "setDefault",
  "baseName",
  "interfacePattern",
  "oldName"
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
  const interfacePattern = toNonEmptyString(template?.interfacePattern);

  const extraData: NodeExtraData = {
    kind,
    longname: "",
    image: template?.image ?? "",
    mgmtIpv4Address: "",
    fromCustomTemplate: Boolean(template?.name),
    ...(interfacePattern !== undefined ? { interfacePattern } : {}),
    ...extractExtraTemplate(template)
  };

  const type = determineType(kind, template);
  if (type !== undefined && type.length > 0) {
    extraData.type = type;
  }

  const nodeData: NodeData = {
    id: nodeId,
    editor: "true",
    weight: "30",
    name: nodeName,
    parent: "",
    topoViewerRole: resolveTemplateRole(template),
    sourceEndpoint: "",
    targetEndpoint: "",
    containerDockerExtraAttribute: { state: "", status: "" },
    extraData
  };

  applyOptionalNodeStyle(nodeData, template);

  return nodeData;
}

/**
 * Convert NodeData to TopoNode format
 */
function nodeDataToTopoNode(data: NodeData, position: { x: number; y: number }): TopoNode {
  const nodeData: TopologyNodeData = {
    label: data.name,
    role: data.topoViewerRole.length > 0 ? data.topoViewerRole : "pe",
    kind: data.extraData.kind,
    image: data.extraData.image,
    iconColor: data.iconColor,
    iconCornerRadius: data.iconCornerRadius,
    extraData: data.extraData
  };

  return {
    id: data.id,
    type: "topology-node",
    position,
    data: nodeData
  };
}

/**
 * Hook for handling node creation via Shift+Click on canvas
 *
 * For ReactFlow integration, use onPaneClick handler to call createNodeAtPosition
 * when the user shift-clicks on the canvas.
 */
export function useNodeCreation(
  _rfInstance: ReactFlowInstance | null,
  options: NodeCreationOptions
): {
  createNodeAtPosition: (position: { x: number; y: number }, template?: CustomNodeTemplate) => void;
} {
  const { onNodeCreated } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const reservedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (reservedIdsRef.current.size === 0) return;
    const usedIds = options.getUsedNodeIds();
    for (const id of reservedIdsRef.current) {
      if (!usedIds.has(id)) {
        reservedIdsRef.current.delete(id);
      }
    }
  }, [options.getUsedNodeIds]);

  const getUsedIds = () => {
    const base = optionsRef.current.getUsedNodeIds();
    const combined = new Set<string>(base);
    for (const id of reservedIdsRef.current) combined.add(id);
    return combined;
  };

  /**
   * Create a node at a specific position
   */
  const createNodeAtPosition = useCallback(
    (position: { x: number; y: number }, template?: CustomNodeTemplate) => {
      const resolvedTemplate = resolveTemplate(template, optionsRef.current);
      if (!resolvedTemplate) {
        log.warn("[NodeCreation] No custom node templates available for creation");
        return;
      }

      const baseName = resolveBaseName(resolvedTemplate);
      if (baseName === null) {
        log.warn(`[NodeCreation] Custom node template '${resolvedTemplate.name}' has no base name`);
        return;
      }

      const nodeId = generateNodeName(baseName, getUsedIds());
      const nodeName = nodeId;
      const kind = getResolvedKind(resolvedTemplate);
      const nodeData = createNodeData(nodeId, nodeName, resolvedTemplate, kind);

      // Create TopoNode for state update
      const topoNode = nodeDataToTopoNode(nodeData, position);

      log.info(`[NodeCreation] Created node: ${nodeId} at (${position.x}, ${position.y})`);

      reservedIdsRef.current.add(nodeId);
      onNodeCreated(nodeId, topoNode, position);
    },
    [onNodeCreated]
  );

  // Shift+Click to create nodes should be handled via ReactFlow's onPaneClick callback
  // with something like: if (event.shiftKey) createNodeAtPosition(screenToFlowPosition({ x, y }))

  return { createNodeAtPosition };
}
