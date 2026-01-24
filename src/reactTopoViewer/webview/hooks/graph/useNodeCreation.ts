/**
 * useNodeCreation - Hook for creating nodes via Shift+Click on canvas
 *
 * Uses ReactFlow instance for viewport operations.
 * The event handling should be integrated via ReactFlow's onPaneClick callback.
 */
import { useEffect, useCallback, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import { log } from "../../utils/logger";
import type { TopoNode, TopologyNodeData } from "../../../shared/types/graph";
import type { CustomNodeTemplate } from "../../../shared/types/editors";
import { getUniqueId } from "../../../shared/utilities/idUtils";
import { convertEditorDataToYaml } from "../../../shared/utilities/nodeEditorConversions";

interface NodeCreationOptions {
  mode: "edit" | "view";
  isLocked: boolean;
  customNodes: CustomNodeTemplate[];
  defaultNode: string;
  getUsedNodeNames: () => Set<string>;
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

let nodeCounter = 0;

/**
 * Initialize node counter based on existing nodes
 */
function initializeNodeCounter(nodeIds: Iterable<string>): void {
  if (nodeCounter !== 0) return;

  const maxId = [...nodeIds]
    .filter((id) => id.startsWith("nodeId-"))
    .map((id) => parseInt(id.replace("nodeId-", ""), 10))
    .filter((num) => !isNaN(num))
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
function generateNodeName(
  defaultName: string,
  usedNames: Set<string>,
  template?: CustomNodeTemplate
): string {
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

  const nokiaKinds = ["nokia_srlinux", "nokia_srsim", "nokia_sros"];
  if (!nokiaKinds.includes(kind)) {
    return undefined;
  }

  // If this template represents a custom node (has a name) but no explicit type,
  // avoid assigning a default type.
  if (template?.name) {
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
  const extraData: NodeExtraData = {
    kind,
    longname: "",
    image: template?.image || "",
    mgmtIpv4Address: "",
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
    editor: "true",
    weight: "30",
    name: nodeName,
    parent: "",
    topoViewerRole: template?.icon || "pe",
    sourceEndpoint: "",
    targetEndpoint: "",
    containerDockerExtraAttribute: { state: "", status: "" },
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
 * In ReactFlow, position comes directly from the pane click event
 */
function determinePosition(eventPosition?: { x: number; y: number }): { x: number; y: number } {
  return eventPosition ?? { x: 0, y: 0 };
}

/**
 * Convert NodeData to TopoNode format
 */
function nodeDataToTopoNode(data: NodeData, position: { x: number; y: number }): TopoNode {
  const nodeData: TopologyNodeData = {
    label: data.name,
    role: data.topoViewerRole || "pe",
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
  const createNodeAtPosition = useCallback(
    (position: { x: number; y: number }, template?: CustomNodeTemplate) => {
      initializeNodeCounter(getUsedIds());

      const generatedId = generateNodeId();
      const usedNames = getUsedNames();
      const nodeName = generateNodeName(generatedId, usedNames, template);
      const nodeId = nodeName || generatedId;

      const kind = template?.kind || "nokia_srlinux";
      const nodeData = createNodeData(nodeId, nodeName, template, kind);

      // Create TopoNode for state update
      const topoNode = nodeDataToTopoNode(nodeData, position);

      log.info(`[NodeCreation] Created node: ${nodeId} at (${position.x}, ${position.y})`);

      reservedIdsRef.current.add(nodeId);
      if (nodeName) reservedNamesRef.current.add(nodeName);
      onNodeCreated(nodeId, topoNode, position);
    },
    [onNodeCreated]
  );

  useEffect(() => {
    // Shift+Click to create nodes should be handled via ReactFlow's onPaneClick callback
    // with something like: if (event.shiftKey) createNodeAtPosition(screenToFlowPosition({ x, y }))
    void determinePosition;
  }, [createNodeAtPosition]);

  return { createNodeAtPosition };
}
