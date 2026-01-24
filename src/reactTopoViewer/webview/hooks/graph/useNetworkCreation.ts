/**
 * useNetworkCreation - Hook for creating network nodes (host, mgmt-net, macvlan, vxlan, etc.)
 *
 * Networks are external endpoints that connect to resources outside the containerlab topology.
 * They are rendered as "cloud" nodes with special styling and dashed link connections.
 */
import { useCallback, useRef } from "react";

import { log } from "../../utils/logger";
import type { CyElement } from "../../../shared/types/messages";

/** Network type definitions */
export type NetworkType =
  | "host"
  | "mgmt-net"
  | "macvlan"
  | "vxlan"
  | "vxlan-stitch"
  | "dummy"
  | "bridge"
  | "ovs-bridge";

interface NetworkCreationOptions {
  mode: "edit" | "view";
  isLocked: boolean;
  getExistingNodeIds: () => Set<string>;
  getExistingNetworkNodes: () => Array<{ id: string; kind: NetworkType }>;
  onNetworkCreated: (
    networkId: string,
    networkElement: CyElement,
    position: { x: number; y: number }
  ) => void;
  onLockedClick?: () => void;
}

interface NetworkData {
  id: string;
  name: string;
  topoViewerRole: "cloud";
  kind: NetworkType;
  type: NetworkType;
  extraData: NetworkExtraData;
}

interface NetworkExtraData {
  kind: NetworkType;
  extType: NetworkType;
  [key: string]: unknown;
}

/** Counters for each network type to generate unique IDs */
const networkCounters: Record<NetworkType, number> = {
  host: 0,
  "mgmt-net": 0,
  macvlan: 0,
  vxlan: 0,
  "vxlan-stitch": 0,
  dummy: 0,
  bridge: 0,
  "ovs-bridge": 0
};

// Regex patterns for extracting counter values from network IDs
const INTERFACE_PATTERN = /:eth(\d+)$|:net(\d+)$|:(\d+)$/;
// eslint-disable-next-line sonarjs/slow-regex -- Simple pattern, no backtracking risk
const TRAILING_NUMBER_PATTERN = /(\d+)$/;
const VXLAN_PATTERN = /:vxlan(\d+)$/;

/**
 * Extract counter value from a regex match result.
 */
function extractCounterFromMatch(match: RegExpExecArray | null): number | null {
  if (!match) return null;
  // Find the first captured group that has a value
  for (let i = 1; i < match.length; i++) {
    if (match[i] != null) {
      return parseInt(match[i], 10);
    }
  }
  return null;
}

/**
 * Update counter for a specific network type if the extracted number is higher.
 */
function updateCounter(kind: NetworkType, num: number): void {
  if (num >= networkCounters[kind]) {
    networkCounters[kind] = num + 1;
  }
}

/**
 * Process interface-type networks (host, mgmt-net, macvlan).
 */
function processInterfaceNetwork(nodeId: string, kind: NetworkType): void {
  const num = extractCounterFromMatch(INTERFACE_PATTERN.exec(nodeId));
  if (num !== null) {
    updateCounter(kind, num);
  }
}

/**
 * Process trailing-number networks (dummy, bridge, ovs-bridge).
 */
function processTrailingNumberNetwork(nodeId: string, kind: NetworkType): void {
  const num = extractCounterFromMatch(TRAILING_NUMBER_PATTERN.exec(nodeId));
  if (num !== null) {
    updateCounter(kind, num);
  }
}

/**
 * Process VXLAN-type networks.
 */
function processVxlanNetwork(nodeId: string, kind: NetworkType): void {
  const num = extractCounterFromMatch(VXLAN_PATTERN.exec(nodeId));
  if (num !== null) {
    updateCounter(kind, num);
  }
}

/**
 * Initialize network counters based on existing network nodes
 */
function initializeNetworkCounters(networkNodes: Array<{ id: string; kind: NetworkType }>): void {
  networkNodes.forEach((node) => {
    const nodeId = node.id;
    const kind = node.kind;

    // Parse existing ID to extract counter value
    // Format examples: "host:eth0", "host:eth1", "mgmt-net:net0", "bridge1"
    if (kind === "host" || kind === "mgmt-net" || kind === "macvlan") {
      processInterfaceNetwork(nodeId, kind);
    } else if (kind === "dummy" || kind === "bridge" || kind === "ovs-bridge") {
      processTrailingNumberNetwork(nodeId, kind);
    } else if (kind === "vxlan" || kind === "vxlan-stitch") {
      processVxlanNetwork(nodeId, kind);
    }
  });
}

/**
 * Generate a unique network ID based on type
 */
function generateNetworkId(networkType: NetworkType, existingIds: Set<string>): string {
  let id: string;
  let counter = networkCounters[networkType];

  do {
    switch (networkType) {
      case "host":
        id = `host:eth${counter}`;
        break;
      case "mgmt-net":
        id = `mgmt-net:net${counter}`;
        break;
      case "macvlan":
        id = `macvlan:${counter}`;
        break;
      case "vxlan":
        id = `vxlan:vxlan${counter}`;
        break;
      case "vxlan-stitch":
        id = `vxlan-stitch:vxlan${counter}`;
        break;
      case "dummy":
        id = `dummy${counter}`;
        break;
      case "bridge":
        id = `bridge${counter}`;
        break;
      case "ovs-bridge":
        id = `ovs-bridge${counter}`;
        break;
      default:
        id = `network${counter}`;
    }
    counter++;
  } while (existingIds.has(id));

  networkCounters[networkType] = counter;
  return id;
}

/**
 * Generate display label for a network node.
 * Labels use the full ID format (e.g., "host:eth0", "vxlan:vxlan0")
 * to clearly indicate both the type and the specific instance.
 */
function generateNetworkLabel(networkId: string, _networkType: NetworkType): string {
  // Use the full ID as the label for clarity
  return networkId;
}

/**
 * Create network node data
 */
function createNetworkData(networkId: string, networkType: NetworkType): NetworkData {
  const label = generateNetworkLabel(networkId, networkType);

  return {
    id: networkId,
    name: label,
    topoViewerRole: "cloud",
    kind: networkType,
    type: networkType,
    extraData: {
      kind: networkType,
      extType: networkType
    }
  };
}

/**
 * Convert NetworkData to CyElement format
 */
function networkDataToCyElement(data: NetworkData, position: { x: number; y: number }): CyElement {
  return {
    group: "nodes",
    data: data as unknown as Record<string, unknown>,
    position,
    classes: "special-endpoint"
  };
}

/**
 * Hook for creating network nodes
 */
export function useNetworkCreation(options: NetworkCreationOptions): {
  createNetworkAtPosition: (
    position: { x: number; y: number },
    networkType: NetworkType
  ) => string | null;
} {
  const { onNetworkCreated } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const countersInitializedRef = useRef(false);
  const reservedIdsRef = useRef<Set<string>>(new Set());

  const createNetworkAtPosition = useCallback(
    (position: { x: number; y: number }, networkType: NetworkType): string | null => {
      const { mode, isLocked, onLockedClick } = optionsRef.current;

      // Only allow in edit mode
      if (mode !== "edit") {
        log.debug("[NetworkCreation] Not in edit mode");
        return null;
      }

      // Check if locked
      if (isLocked) {
        log.debug("[NetworkCreation] Canvas is locked");
        onLockedClick?.();
        return null;
      }

      // Initialize counters on first use
      if (!countersInitializedRef.current) {
        initializeNetworkCounters(optionsRef.current.getExistingNetworkNodes());
        countersInitializedRef.current = true;
      }

      // Get existing IDs to avoid duplicates
      const existingIds = optionsRef.current.getExistingNodeIds();
      for (const id of reservedIdsRef.current) existingIds.add(id);

      // Generate unique ID
      const networkId = generateNetworkId(networkType, existingIds);
      const networkData = createNetworkData(networkId, networkType);

      // Create CyElement for state update
      const cyElement = networkDataToCyElement(networkData, position);

      log.info(
        `[NetworkCreation] Created network: ${networkId} (${networkType}) at (${position.x}, ${position.y})`
      );

      reservedIdsRef.current.add(networkId);
      onNetworkCreated(networkId, cyElement, position);
      return networkId;
    },
    [onNetworkCreated]
  );

  return { createNetworkAtPosition };
}
