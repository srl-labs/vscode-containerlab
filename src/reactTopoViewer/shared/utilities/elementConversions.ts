/**
 * Element conversion utilities for converting between ParsedElement and ReactFlow formats.
 * These are pure functions with no dependencies on React or VS Code.
 */

import type { ParsedElement } from "../types/topology";
import type {
  TopoNode,
  TopoEdge,
  TopologyData,
  TopologyNodeData,
  NetworkNodeData,
  TopologyEdgeData
} from "../types/graph";
import { getNumber, getRecordUnknown, getString } from "./typeHelpers";

// ============================================================================
// ParsedElement to ReactFlow Conversion
// ============================================================================

/**
 * Converts a ParsedElement node to a ReactFlow Node (TopoNode).
 */
const NETWORK_NODE_ROLES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy",
  "bridge",
  "ovs-bridge"
]);

function getGeoCoordinates(
  data: Record<string, unknown>
): { lat: number; lng: number } | undefined {
  const latValue = data.lat;
  const lngValue = data.lng;
  const latRaw =
    latValue === "" || latValue === null || latValue === undefined ? NaN : Number(latValue);
  const lngRaw =
    lngValue === "" || lngValue === null || lngValue === undefined ? NaN : Number(lngValue);
  if (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw)) {
    return undefined;
  }
  return { lat: latRaw, lng: lngRaw };
}

function getNodeLabel(data: Record<string, unknown>): string {
  return getString(data.name) ?? getString(data.id) ?? "";
}

export function parsedElementToTopoNode(element: ParsedElement): TopoNode {
  if (element.group !== "nodes") {
    throw new Error("Cannot convert edge element to node");
  }

  const data = element.data;
  const extraData = getRecordUnknown(data.extraData) ?? {};
  const role = getString(data.topoViewerRole) ?? "pe";
  const geoCoordinates = getGeoCoordinates(data);
  const id = getString(data.id) ?? "";

  // Determine node type based on role
  const isNetworkNode = NETWORK_NODE_ROLES.has(role);

  if (isNetworkNode) {
    const networkNodeData: NetworkNodeData = {
      label: getNodeLabel(data),
      nodeType: role,
      labelPosition: getString(data.labelPosition),
      direction: getString(data.direction),
      labelBackgroundColor: getString(data.labelBackgroundColor),
      ...(geoCoordinates ? { geoCoordinates } : {}),
      extraData
    };

    const node: TopoNode = {
      id,
      type: "network-node",
      position: element.position ?? { x: 0, y: 0 },
      data: networkNodeData
    };
    return node;
  }

  // Regular topology node
  const nodeData: TopologyNodeData = {
    label: getNodeLabel(data),
    role,
    kind: getString(extraData.kind),
    image: getString(extraData.image),
    iconColor: getString(data.iconColor),
    iconCornerRadius: getNumber(data.iconCornerRadius),
    labelPosition: getString(data.labelPosition),
    direction: getString(data.direction),
    labelBackgroundColor: getString(data.labelBackgroundColor),
    state: getString(extraData.state),
    mgmtIpv4Address: getString(extraData.mgmtIpv4Address),
    mgmtIpv6Address: getString(extraData.mgmtIpv6Address),
    longname: getString(extraData.longname),
    ...(geoCoordinates ? { geoCoordinates } : {}),
    extraData
  };

  const node: TopoNode = {
    id,
    type: "topology-node",
    position: element.position ?? { x: 0, y: 0 },
    data: nodeData
  };
  return node;
}

/**
 * Converts a ParsedElement edge to a ReactFlow Edge (TopoEdge).
 */
export function parsedElementToTopoEdge(element: ParsedElement): TopoEdge {
  if (element.group !== "edges") {
    throw new Error("Cannot convert node element to edge");
  }

  const data = element.data;
  const extraData = getRecordUnknown(data.extraData) ?? {};
  const classes = element.classes ?? "";
  const sourceEndpoint = getString(data.sourceEndpoint) ?? "";
  const targetEndpoint = getString(data.targetEndpoint) ?? "";
  const edgeId = getString(data.id) ?? "";
  const source = getString(data.source) ?? "";
  const target = getString(data.target) ?? "";

  // Compute link status from CSS classes
  let linkStatus: "up" | "down" | undefined;
  if (classes.includes("link-up")) {
    linkStatus = "up";
  } else if (classes.includes("link-down")) {
    linkStatus = "down";
  }

  const edgeData: TopologyEdgeData = {
    sourceEndpoint,
    targetEndpoint,
    linkStatus,
    extraData
  };

  return {
    id: edgeId,
    source,
    target,
    type: "topology-edge",
    data: edgeData
  };
}

/**
 * Converts an array of ParsedElements to TopologyData (nodes and edges).
 */
export function convertElementsToTopologyData(elements: ParsedElement[]): TopologyData {
  const nodes: TopoNode[] = [];
  const edges: TopoEdge[] = [];

  for (const element of elements) {
    if (element.group === "nodes") {
      nodes.push(parsedElementToTopoNode(element));
    } else {
      edges.push(parsedElementToTopoEdge(element));
    }
  }

  return { nodes, edges };
}

// ============================================================================
// ReactFlow to ParsedElement Conversion (for backwards compatibility)
// ============================================================================

/**
 * Converts a TopoNode back to ParsedElement format.
 */
export function topoNodeToParsedElement(node: TopoNode): ParsedElement {
  const data = node.data;
  const extraData = getRecordUnknown(data.extraData);
  const geoRaw = data.geoCoordinates ?? extraData?.geoCoordinates;
  const geo = getRecordUnknown(geoRaw);
  const lat = typeof geo?.lat === "number" ? String(geo.lat) : "";
  const lng = typeof geo?.lng === "number" ? String(geo.lng) : "";
  const topoViewerRole =
    getString(data.role) ?? getString(data.nodeType) ?? "pe";

  return {
    group: "nodes",
    data: {
      id: node.id,
      weight: "30",
      name: data.label ?? node.id,
      topoViewerRole,
      iconColor: data.iconColor,
      iconCornerRadius: data.iconCornerRadius,
      labelPosition: data.labelPosition,
      direction: data.direction,
      labelBackgroundColor: data.labelBackgroundColor,
      lat,
      lng,
      extraData: extraData ?? {}
    },
    position: node.position,
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes: ""
  };
}

/**
 * Converts a TopoEdge back to ParsedElement format.
 */
export function topoEdgeToParsedElement(edge: TopoEdge): ParsedElement {
  const data = edge.data;
  const linkStatus = data?.linkStatus;
  let classes = "";
  if (linkStatus === "up") classes = "link-up";
  else if (linkStatus === "down") classes = "link-down";

  return {
    group: "edges",
    data: {
      id: edge.id,
      weight: "3",
      name: edge.id,
      parent: "",
      topoViewerRole: "link",
      sourceEndpoint: data?.sourceEndpoint ?? "",
      targetEndpoint: data?.targetEndpoint ?? "",
      lat: "",
      lng: "",
      source: edge.source,
      target: edge.target,
      extraData: data?.extraData ?? {}
    },
    position: { x: 0, y: 0 },
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes
  };
}

/**
 * Converts TopologyData back to ParsedElement array.
 */
export function convertTopologyDataToElements(data: TopologyData): ParsedElement[] {
  const elements: ParsedElement[] = [];

  for (const node of data.nodes) {
    elements.push(topoNodeToParsedElement(node));
  }

  for (const edge of data.edges) {
    elements.push(topoEdgeToParsedElement(edge));
  }

  return elements;
}
