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
  CloudNodeData,
  TopologyEdgeData
} from "../types/graph";

// ============================================================================
// ParsedElement to ReactFlow Conversion
// ============================================================================

/**
 * Converts a ParsedElement node to a ReactFlow Node (TopoNode).
 */
const CLOUD_NODE_ROLES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy",
  "bridge"
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
  return (data.name as string) ?? (data.id as string) ?? "";
}

export function parsedElementToTopoNode(element: ParsedElement): TopoNode {
  if (element.group !== "nodes") {
    throw new Error("Cannot convert edge element to node");
  }

  const data = element.data as Record<string, unknown>;
  const extraData = (data.extraData ?? {}) as Record<string, unknown>;
  const role = (data.topoViewerRole as string) ?? "pe";
  const geoCoordinates = getGeoCoordinates(data);

  // Determine node type based on role
  const isCloudNode = CLOUD_NODE_ROLES.has(role);

  if (isCloudNode) {
    const cloudData: CloudNodeData = {
      label: getNodeLabel(data),
      nodeType: role as CloudNodeData["nodeType"],
      ...(geoCoordinates ? { geoCoordinates } : {}),
      extraData: extraData
    };

    return {
      id: data.id as string,
      type: "cloud-node",
      position: element.position ?? { x: 0, y: 0 },
      data: cloudData
    } as TopoNode;
  }

  // Regular topology node
  const nodeData: TopologyNodeData = {
    label: getNodeLabel(data),
    role,
    kind: extraData.kind as string | undefined,
    image: extraData.image as string | undefined,
    iconColor: data.iconColor as string | undefined,
    iconCornerRadius: data.iconCornerRadius as number | undefined,
    state: extraData.state as string | undefined,
    mgmtIpv4Address: extraData.mgmtIpv4Address as string | undefined,
    mgmtIpv6Address: extraData.mgmtIpv6Address as string | undefined,
    longname: extraData.longname as string | undefined,
    ...(geoCoordinates ? { geoCoordinates } : {}),
    extraData
  };

  return {
    id: data.id as string,
    type: "topology-node",
    position: element.position ?? { x: 0, y: 0 },
    data: nodeData
  } as TopoNode;
}

/**
 * Converts a ParsedElement edge to a ReactFlow Edge (TopoEdge).
 */
export function parsedElementToTopoEdge(element: ParsedElement): TopoEdge {
  if (element.group !== "edges") {
    throw new Error("Cannot convert node element to edge");
  }

  const data = element.data as Record<string, unknown>;
  const extraData = (data.extraData ?? {}) as Record<string, unknown>;

  // Compute link status from CSS classes
  let linkStatus: "up" | "down" | undefined;
  if (element.classes?.includes("link-up")) {
    linkStatus = "up";
  } else if (element.classes?.includes("link-down")) {
    linkStatus = "down";
  }

  const edgeData: TopologyEdgeData = {
    sourceEndpoint: (data.sourceEndpoint as string) ?? "",
    targetEndpoint: (data.targetEndpoint as string) ?? "",
    linkStatus,
    extraData
  };

  return {
    id: data.id as string,
    source: data.source as string,
    target: data.target as string,
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
    } else if (element.group === "edges") {
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
  const data = node.data as Record<string, unknown>;
  const geo = (data.geoCoordinates ??
    (data.extraData as Record<string, unknown> | undefined)?.geoCoordinates) as
    | { lat?: number; lng?: number }
    | undefined;
  const lat = typeof geo?.lat === "number" ? String(geo.lat) : "";
  const lng = typeof geo?.lng === "number" ? String(geo.lng) : "";

  return {
    group: "nodes",
    data: {
      id: node.id,
      weight: "30",
      name: data.label ?? node.id,
      topoViewerRole: data.role ?? data.nodeType ?? "pe",
      iconColor: data.iconColor,
      iconCornerRadius: data.iconCornerRadius,
      lat,
      lng,
      extraData: data.extraData ?? {}
    },
    position: node.position ?? { x: 0, y: 0 },
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
  const data = edge.data as TopologyEdgeData | undefined;
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
