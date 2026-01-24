/**
 * Element conversion utilities for converting between CyElement and ReactFlow formats.
 * These are pure functions with no dependencies on React or VS Code.
 */

import type { CyElement } from "../types/topology";
import type {
  TopoNode,
  TopoEdge,
  TopologyData,
  TopologyNodeData,
  CloudNodeData,
  TopologyEdgeData
} from "../types/graph";

// ============================================================================
// CyElement to ReactFlow Conversion
// ============================================================================

/**
 * Converts a CyElement node to a ReactFlow Node (TopoNode).
 */
export function cyElementToTopoNode(element: CyElement): TopoNode {
  if (element.group !== "nodes") {
    throw new Error("Cannot convert edge element to node");
  }

  const data = element.data as Record<string, unknown>;
  const extraData = (data.extraData ?? {}) as Record<string, unknown>;
  const role = (data.topoViewerRole as string) ?? "pe";

  // Determine node type based on role
  const isCloudNode = [
    "host",
    "mgmt-net",
    "macvlan",
    "vxlan",
    "vxlan-stitch",
    "dummy",
    "bridge"
  ].includes(role);

  if (isCloudNode) {
    const cloudData: CloudNodeData = {
      label: (data.name as string) ?? (data.id as string) ?? "",
      nodeType: role as CloudNodeData["nodeType"],
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
    label: (data.name as string) ?? (data.id as string) ?? "",
    role,
    kind: extraData.kind as string | undefined,
    image: extraData.image as string | undefined,
    iconColor: data.iconColor as string | undefined,
    iconCornerRadius: data.iconCornerRadius as number | undefined,
    state: extraData.state as string | undefined,
    mgmtIpv4Address: extraData.mgmtIpv4Address as string | undefined,
    mgmtIpv6Address: extraData.mgmtIpv6Address as string | undefined,
    longname: extraData.longname as string | undefined,
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
 * Converts a CyElement edge to a ReactFlow Edge (TopoEdge).
 */
export function cyElementToTopoEdge(element: CyElement): TopoEdge {
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
 * Converts an array of CyElements to TopologyData (nodes and edges).
 */
export function convertElementsToTopologyData(elements: CyElement[]): TopologyData {
  const nodes: TopoNode[] = [];
  const edges: TopoEdge[] = [];

  for (const element of elements) {
    if (element.group === "nodes") {
      nodes.push(cyElementToTopoNode(element));
    } else if (element.group === "edges") {
      edges.push(cyElementToTopoEdge(element));
    }
  }

  return { nodes, edges };
}

// ============================================================================
// ReactFlow to CyElement Conversion (for backwards compatibility)
// ============================================================================

/**
 * Converts a TopoNode back to CyElement format.
 */
export function topoNodeToCyElement(node: TopoNode): CyElement {
  const data = node.data as Record<string, unknown>;

  return {
    group: "nodes",
    data: {
      id: node.id,
      weight: "30",
      name: data.label ?? node.id,
      topoViewerRole: data.role ?? data.nodeType ?? "pe",
      iconColor: data.iconColor,
      iconCornerRadius: data.iconCornerRadius,
      lat: "",
      lng: "",
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
 * Converts a TopoEdge back to CyElement format.
 */
export function topoEdgeToCyElement(edge: TopoEdge): CyElement {
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
 * Converts TopologyData back to CyElement array.
 */
export function convertTopologyDataToElements(data: TopologyData): CyElement[] {
  const elements: CyElement[] = [];

  for (const node of data.nodes) {
    elements.push(topoNodeToCyElement(node));
  }

  for (const edge of data.edges) {
    elements.push(topoEdgeToCyElement(edge));
  }

  return elements;
}
