/**
 * Conversion utilities between CyElement and React Flow Node/Edge formats
 */
import type { Node, Edge } from "@xyflow/react";

import type { CyElement } from "../../../shared/types/topology";

import type {
  TopologyNodeData,
  CloudNodeData,
  GroupNodeData,
  FreeTextNodeData,
  FreeShapeNodeData,
  TopologyEdgeData,
  RFNodeType
} from "./types";
import { DEFAULT_ICON_COLOR } from "./types";

// Node type constants
const NODE_TYPE_CLOUD = "cloud-node" as const;
const NODE_TYPE_GROUP = "group-node" as const;
const NODE_TYPE_FREE_TEXT = "free-text-node" as const;
const NODE_TYPE_FREE_SHAPE = "free-shape-node" as const;
const NODE_TYPE_TOPOLOGY = "topology-node" as const;

/**
 * Role to SVG node type mapping
 */
export const ROLE_SVG_MAP: Record<string, string> = {
  router: "pe",
  default: "pe",
  pe: "pe",
  p: "pe",
  controller: "controller",
  pon: "pon",
  dcgw: "dcgw",
  leaf: "leaf",
  switch: "switch",
  rgw: "rgw",
  "super-spine": "super-spine",
  spine: "spine",
  server: "server",
  bridge: "bridge",
  ue: "ue",
  cloud: "cloud",
  client: "client"
};

/**
 * Check if a node is a cloud/external endpoint node
 */
function isCloudNode(data: Record<string, unknown>): boolean {
  const role = data.topoViewerRole as string | undefined;
  return (
    role === "cloud" ||
    (data.extraData as Record<string, unknown> | undefined)?.clabNodeType === "cloud"
  );
}

function getNodeRole(data: Record<string, unknown>): string | undefined {
  return data.topoViewerRole as string | undefined;
}

/**
 * Determine the React Flow node type from CyElement data
 */
function determineNodeType(data: Record<string, unknown>): RFNodeType {
  if (isCloudNode(data)) return NODE_TYPE_CLOUD;
  const role = getNodeRole(data);
  if (role === "group") return NODE_TYPE_GROUP;
  if (role === "freeText") return NODE_TYPE_FREE_TEXT;
  if (role === "freeShape") return NODE_TYPE_FREE_SHAPE;
  return NODE_TYPE_TOPOLOGY;
}

interface BaseNodeFields {
  id: string;
  position: { x: number; y: number };
  parentId: string | undefined;
  draggable: boolean;
  selectable: boolean;
  selected: boolean;
  label: string;
}

function extractBaseNodeFields(element: CyElement): BaseNodeFields {
  const data = element.data;
  const id = data.id as string;
  const label = (data.name as string) || (data.label as string) || id;
  const parent = data.parent as string | undefined;

  return {
    id,
    label,
    position: element.position ?? { x: 0, y: 0 },
    parentId: parent && parent !== "" ? parent : undefined,
    draggable: true,
    selectable: true,
    selected: element.selected ?? false
  };
}

function createCloudNode(base: BaseNodeFields, data: Record<string, unknown>): Node {
  const cloudData: CloudNodeData = {
    label: base.label,
    nodeType:
      ((data.extraData as Record<string, unknown>)?.clabNodeType as
        | "host"
        | "mgmt-net"
        | "macvlan"
        | "vxlan"
        | "bridge") ?? "host",
    extraData: data.extraData as Record<string, unknown>
  };
  return {
    id: base.id,
    position: base.position,
    parentId: base.parentId,
    draggable: base.draggable,
    selectable: base.selectable,
    selected: base.selected,
    type: NODE_TYPE_CLOUD,
    data: cloudData
  };
}

function createGroupNode(base: BaseNodeFields, data: Record<string, unknown>): Node {
  const groupData: GroupNodeData = {
    label: base.label,
    name: (data.name as string) || base.label,
    level: (data.level as string) || "default",
    backgroundColor: data.backgroundColor as string,
    backgroundOpacity: data.backgroundOpacity as number,
    borderColor: data.borderColor as string,
    borderWidth: data.borderWidth as number,
    borderStyle: data.borderStyle as "solid" | "dotted" | "dashed" | "double",
    borderRadius: data.borderRadius as number,
    labelColor: data.labelColor as string,
    labelPosition: data.labelPosition as string,
    width: (data.width as number) || 200,
    height: (data.height as number) || 150
  };
  return {
    id: base.id,
    position: base.position,
    parentId: base.parentId,
    draggable: base.draggable,
    selectable: base.selectable,
    selected: base.selected,
    type: NODE_TYPE_GROUP,
    data: groupData,
    style: { width: groupData.width, height: groupData.height }
  };
}

function createFreeTextNode(base: BaseNodeFields, data: Record<string, unknown>): Node {
  const textData: FreeTextNodeData = {
    text: (data.text as string) || base.label,
    fontSize: data.fontSize as number,
    fontColor: data.fontColor as string,
    backgroundColor: data.backgroundColor as string,
    fontWeight: data.fontWeight as "normal" | "bold",
    fontStyle: data.fontStyle as "normal" | "italic",
    textDecoration: data.textDecoration as "none" | "underline",
    textAlign: data.textAlign as "left" | "center" | "right",
    fontFamily: data.fontFamily as string,
    rotation: data.rotation as number,
    width: data.width as number,
    height: data.height as number,
    roundedBackground: data.roundedBackground as boolean
  };
  return {
    id: base.id,
    position: base.position,
    parentId: base.parentId,
    draggable: base.draggable,
    selectable: base.selectable,
    selected: base.selected,
    type: NODE_TYPE_FREE_TEXT,
    data: textData
  };
}

function createFreeShapeNode(base: BaseNodeFields, data: Record<string, unknown>): Node {
  const shapeData: FreeShapeNodeData = {
    shapeType: (data.shapeType as "rectangle" | "circle" | "line") || "rectangle",
    width: data.width as number,
    height: data.height as number,
    endPosition: data.endPosition as { x: number; y: number },
    fillColor: data.fillColor as string,
    fillOpacity: data.fillOpacity as number,
    borderColor: data.borderColor as string,
    borderWidth: data.borderWidth as number,
    borderStyle: data.borderStyle as "solid" | "dashed" | "dotted",
    rotation: data.rotation as number,
    lineStartArrow: data.lineStartArrow as boolean,
    lineEndArrow: data.lineEndArrow as boolean,
    lineArrowSize: data.lineArrowSize as number,
    cornerRadius: data.cornerRadius as number
  };
  return {
    id: base.id,
    position: base.position,
    parentId: base.parentId,
    draggable: base.draggable,
    selectable: base.selectable,
    selected: base.selected,
    type: NODE_TYPE_FREE_SHAPE,
    data: shapeData
  };
}

// eslint-disable-next-line complexity
function createTopologyNode(base: BaseNodeFields, data: Record<string, unknown>): Node {
  const role = (data.topoViewerRole as string) || "default";
  const extraData = data.extraData as Record<string, unknown> | undefined;

  const topoData: TopologyNodeData = {
    label: base.label,
    role,
    kind: (data.kind as string) || (extraData?.kind as string),
    image: (data.image as string) || (extraData?.image as string),
    iconColor: (data.iconColor as string) || (extraData?.iconColor as string) || DEFAULT_ICON_COLOR,
    iconCornerRadius: (data.iconCornerRadius as number) || (extraData?.iconCornerRadius as number),
    state: (data.state as string) || (extraData?.state as string),
    mgmtIpv4Address: (data.mgmtIpv4Address as string) || (extraData?.mgmtIpv4Address as string),
    mgmtIpv6Address: (data.mgmtIpv6Address as string) || (extraData?.mgmtIpv6Address as string),
    longname: (data.longname as string) || (extraData?.longname as string),
    extraData
  };
  return {
    id: base.id,
    position: base.position,
    parentId: base.parentId,
    draggable: base.draggable,
    selectable: base.selectable,
    selected: base.selected,
    type: NODE_TYPE_TOPOLOGY,
    data: topoData
  };
}

/**
 * Convert a CyElement node to a React Flow Node
 */
export function cyElementToRFNode(element: CyElement): Node {
  const data = element.data;
  const nodeType = determineNodeType(data);
  const base = extractBaseNodeFields(element);

  switch (nodeType) {
    case NODE_TYPE_CLOUD:
      return createCloudNode(base, data);
    case NODE_TYPE_GROUP:
      return createGroupNode(base, data);
    case NODE_TYPE_FREE_TEXT:
      return createFreeTextNode(base, data);
    case NODE_TYPE_FREE_SHAPE:
      return createFreeShapeNode(base, data);
    default:
      return createTopologyNode(base, data);
  }
}

/**
 * Convert a CyElement edge to a React Flow Edge
 */
export function cyElementToRFEdge(element: CyElement): Edge {
  const data = element.data;
  const id = data.id as string;
  const source = data.source as string;
  const target = data.target as string;

  // Determine link status from classes
  let linkStatus: "up" | "down" | "unknown" = "unknown";
  if (element.classes?.includes("link-up")) {
    linkStatus = "up";
  } else if (element.classes?.includes("link-down")) {
    linkStatus = "down";
  }

  const edgeData: TopologyEdgeData = {
    sourceEndpoint: (data.sourceEndpoint as string) || "",
    targetEndpoint: (data.targetEndpoint as string) || "",
    linkStatus,
    extraData: data.extraData as Record<string, unknown>
  };

  return {
    id,
    source,
    target,
    type: "topology-edge",
    data: edgeData,
    selected: element.selected ?? false
  };
}

/**
 * Convert an array of CyElements to React Flow nodes and edges
 */
export function convertElements(elements: CyElement[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const element of elements) {
    if (element.group === "nodes") {
      nodes.push(cyElementToRFNode(element));
    } else if (element.group === "edges") {
      edges.push(cyElementToRFEdge(element));
    }
  }

  return { nodes, edges };
}

/**
 * Convert a React Flow Node back to CyElement format
 */
export function rfNodeToCyElement(node: Node): CyElement {
  const data = node.data as Record<string, unknown>;

  const cyData: Record<string, unknown> = {
    id: node.id,
    name: data.label,
    ...data
  };

  if (node.parentId) {
    cyData.parent = node.parentId;
  }

  // Determine topoViewerRole from node type
  switch (node.type) {
    case NODE_TYPE_CLOUD:
      cyData.topoViewerRole = "cloud";
      break;
    case NODE_TYPE_GROUP:
      cyData.topoViewerRole = "group";
      break;
    case NODE_TYPE_FREE_TEXT:
      cyData.topoViewerRole = "freeText";
      break;
    case NODE_TYPE_FREE_SHAPE:
      cyData.topoViewerRole = "freeShape";
      break;
    default:
      cyData.topoViewerRole = (data as TopologyNodeData).role || "default";
  }

  return {
    group: "nodes",
    data: cyData,
    position: node.position,
    selected: node.selected
  };
}

/**
 * Convert a React Flow Edge back to CyElement format
 */
export function rfEdgeToCyElement(edge: Edge): CyElement {
  const data = edge.data as TopologyEdgeData | undefined;

  const cyData: Record<string, unknown> = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceEndpoint: data?.sourceEndpoint ?? "",
    targetEndpoint: data?.targetEndpoint ?? "",
    ...(data?.extraData ?? {})
  };

  let classes = "";
  if (data?.linkStatus === "up") {
    classes = "link-up";
  } else if (data?.linkStatus === "down") {
    classes = "link-down";
  }

  return {
    group: "edges",
    data: cyData,
    classes: classes || undefined,
    selected: edge.selected
  };
}

/**
 * Convert React Flow nodes and edges back to CyElement array
 */
export function convertToElements(nodes: Node[], edges: Edge[]): CyElement[] {
  const elements: CyElement[] = [];

  for (const node of nodes) {
    elements.push(rfNodeToCyElement(node));
  }

  for (const edge of edges) {
    elements.push(rfEdgeToCyElement(edge));
  }

  return elements;
}
