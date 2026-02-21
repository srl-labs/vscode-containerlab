/**
 * LinkPersistenceIO - Pure YAML AST operations for link CRUD
 *
 * Contains only the YAML manipulation logic without file I/O.
 * Used by both VS Code extension and dev server.
 */

import * as YAML from "yaml";

import type { SaveResult, IOLogger } from "./types";
import { ERROR_LINKS_NOT_SEQ, noopLogger } from "./types";
import { createQuotedScalar, setOrDelete } from "./YamlDocumentIO";

/**
 * Gets the links sequence from a YAML document, returning an error result if not found.
 */
function getLinksSeqOrError(
  doc: YAML.Document.Parsed
): { linksSeq: YAML.YAMLSeq } | { error: SaveResult } {
  const linksNode = doc.getIn(["topology", "links"], true);
  if (!YAML.isSeq(linksNode)) {
    return { error: { success: false, error: ERROR_LINKS_NOT_SEQ } };
  }
  return { linksSeq: linksNode };
}

/**
 * Gets the links sequence, returning it directly or the error SaveResult if not found.
 * Helper to reduce code duplication for the common pattern of error checking.
 */
function getValidatedLinksSeq(doc: YAML.Document.Parsed): YAML.YAMLSeq | SaveResult {
  const result = getLinksSeqOrError(doc);
  if ("error" in result) return result.error;
  return result.linksSeq;
}

/** Link data for save operations */
export interface LinkSaveData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  extraData?: {
    extType?: string;
    extMtu?: string | number;
    extHostInterface?: string;
    extMode?: string;
    extRemote?: string;
    extVni?: string | number;
    extDstPort?: string | number;
    extSrcPort?: string | number;
    extSourceMac?: string;
    extTargetMac?: string;
    extSourceIpv4?: string;
    extSourceIpv6?: string;
    extTargetIpv4?: string;
    extTargetIpv6?: string;
    extVars?: Record<string, unknown>;
    extLabels?: Record<string, unknown>;
    [key: string]: unknown;
  };
  // Original values for finding the link when endpoints change
  originalSource?: string;
  originalTarget?: string;
  originalSourceEndpoint?: string;
  originalTargetEndpoint?: string;
}

/** Link types that use single endpoint format (type + endpoint, not endpoints array) */
const SINGLE_ENDPOINT_TYPES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy",
]);

function hasText(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/**
 * Creates a link entry in brief format: endpoints: ["node1:eth1", "node2:eth1"]
 */
function createBriefLink(doc: YAML.Document, linkData: LinkSaveData): YAML.YAMLMap {
  const linkMap = new YAML.YAMLMap();
  linkMap.flow = false;

  const srcStr = hasText(linkData.sourceEndpoint)
    ? `${linkData.source}:${linkData.sourceEndpoint}`
    : linkData.source;
  const dstStr = hasText(linkData.targetEndpoint)
    ? `${linkData.target}:${linkData.targetEndpoint}`
    : linkData.target;

  const endpointsSeq = new YAML.YAMLSeq();
  endpointsSeq.flow = true;
  endpointsSeq.add(createQuotedScalar(doc, srcStr));
  endpointsSeq.add(createQuotedScalar(doc, dstStr));

  linkMap.set("endpoints", endpointsSeq);
  return linkMap;
}

/** Prefixes that indicate a special/visualization node (not a real YAML node) */
const SPECIAL_NODE_PREFIXES = [
  "host:",
  "mgmt-net:",
  "macvlan:",
  "vxlan:",
  "vxlan-stitch:",
  "dummy",
];

/**
 * Check if a node ID represents a special/visualization node.
 */
function isSpecialNode(nodeId: string): boolean {
  return SPECIAL_NODE_PREFIXES.some((prefix) => nodeId.startsWith(prefix));
}

function pickEndpointValue<T>(useTarget: boolean, sourceValue: T, targetValue: T): T {
  return useTarget ? targetValue : sourceValue;
}

function setEndpointField(
  doc: YAML.Document,
  epMap: YAML.YAMLMap,
  key: string,
  value: string | undefined,
  quoted = false
): void {
  if (!hasText(value)) return;
  epMap.set(key, quoted ? createQuotedScalar(doc, value) : doc.createNode(value));
}

/**
 * Creates a single endpoint map for special link types.
 * The endpoint should reference the REAL containerlab node, not the visualization node.
 * We detect which side is the real node by checking for special node prefixes.
 */
function createSingleEndpointMap(
  doc: YAML.Document,
  linkData: LinkSaveData,
  extra: LinkSaveData["extraData"],
  _linkType: string
): YAML.YAMLMap {
  const epMap = new YAML.YAMLMap();
  epMap.flow = false;

  // Determine which side is the real node (the one without special prefix)
  const sourceIsSpecial = isSpecialNode(linkData.source);
  const useTarget = sourceIsSpecial;

  const node = pickEndpointValue(useTarget, linkData.source, linkData.target);
  const iface = pickEndpointValue(useTarget, linkData.sourceEndpoint, linkData.targetEndpoint);
  const mac = pickEndpointValue(useTarget, extra?.extSourceMac, extra?.extTargetMac);
  const ipv4 = pickEndpointValue(useTarget, extra?.extSourceIpv4, extra?.extTargetIpv4);
  const ipv6 = pickEndpointValue(useTarget, extra?.extSourceIpv6, extra?.extTargetIpv6);

  epMap.set("node", createQuotedScalar(doc, node));
  setEndpointField(doc, epMap, "interface", iface, true);
  setEndpointField(doc, epMap, "mac", mac);
  setEndpointField(doc, epMap, "ipv4", ipv4);
  setEndpointField(doc, epMap, "ipv6", ipv6);
  return epMap;
}

/**
 * Extract the interface/identifier from a special node ID.
 * e.g., "host:eth0" → "eth0", "macvlan:0" → "0"
 */
function extractSpecialNodeInterface(nodeId: string): string | undefined {
  const colonIndex = nodeId.indexOf(":");
  if (colonIndex === -1) return undefined;
  return nodeId.slice(colonIndex + 1) || undefined;
}

/**
 * Simple IPv4 validation check.
 * Returns true if the string looks like an IP address (contains dots with numbers).
 */
function looksLikeIpAddress(value: string): boolean {
  // Basic check: should contain at least one dot and only valid IP chars
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}

/**
 * Extract vxlan properties from the special node ID.
 * Format: "vxlan:remote/vni/dst-port/src-port" or "vxlan-stitch:remote/vni/dst-port/src-port"
 * Only extracts remote if it looks like an IP address to avoid using counter-based names.
 */
function extractVxlanProperties(nodeId: string): {
  remote?: string;
  vni?: string;
  dstPort?: string;
  srcPort?: string;
} {
  const colonIndex = nodeId.indexOf(":");
  if (colonIndex === -1) return {};

  const parts = nodeId.slice(colonIndex + 1).split("/");
  // Only use remote if it looks like an IP address
  const remoteCandidate = parts[0];
  return {
    remote: remoteCandidate && looksLikeIpAddress(remoteCandidate) ? remoteCandidate : undefined,
    vni: parts[1] || undefined,
    dstPort: parts[2] || undefined,
    srcPort: parts[3] || undefined,
  };
}

/** Host/macvlan/mgmt-net link types that use host-interface */
const HOST_INTERFACE_TYPES = new Set(["host", "macvlan", "mgmt-net"]);

/**
 * Apply host-interface properties for host/macvlan/mgmt-net link types
 */
function applyHostInterfaceProperties(
  doc: YAML.Document,
  linkMap: YAML.YAMLMap,
  linkType: string,
  extra: LinkSaveData["extraData"],
  specialNodeId: string
): void {
  const hostInterface = extra?.extHostInterface ?? extractSpecialNodeInterface(specialNodeId);
  if (hasText(hostInterface)) {
    linkMap.set("host-interface", doc.createNode(hostInterface));
  }
  if (linkType === "macvlan" && hasText(extra?.extMode)) {
    linkMap.set("mode", doc.createNode(extra.extMode));
  }
}

/** Default values for required VXLAN properties */
const VXLAN_DEFAULTS = { remote: "127.0.0.1", vni: 100, dstPort: 4789 };

/** Converts a value to number, returns default if conversion fails */
function toNumber(value: string | number | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const num = Number(value);
  return Number.isNaN(num) ? defaultValue : num;
}

/**
 * Apply vxlan-specific properties (remote, vni, dst-port, src-port)
 */
function applyVxlanProperties(
  doc: YAML.Document,
  linkMap: YAML.YAMLMap,
  extra: LinkSaveData["extraData"],
  specialNodeId: string
): void {
  const parsed = extractVxlanProperties(specialNodeId);

  const remote = extra?.extRemote ?? parsed.remote ?? VXLAN_DEFAULTS.remote;
  const vni = toNumber(extra?.extVni ?? parsed.vni, VXLAN_DEFAULTS.vni);
  const dstPort = toNumber(extra?.extDstPort ?? parsed.dstPort, VXLAN_DEFAULTS.dstPort);

  linkMap.set("remote", doc.createNode(remote));
  linkMap.set("vni", doc.createNode(vni));
  linkMap.set("dst-port", doc.createNode(dstPort));

  const srcPort = extra?.extSrcPort ?? parsed.srcPort;
  if (srcPort !== undefined && srcPort !== "") {
    linkMap.set("src-port", doc.createNode(toNumber(srcPort, 0)));
  }
}

/**
 * Applies type-specific properties for single endpoint links
 */
function applySingleEndpointProperties(
  doc: YAML.Document,
  linkMap: YAML.YAMLMap,
  linkType: string,
  extra: LinkSaveData["extraData"],
  linkData: LinkSaveData
): void {
  // Get the special node ID (the one with the prefix like host:, vxlan:, etc.)
  const specialNodeId = isSpecialNode(linkData.source) ? linkData.source : linkData.target;

  if (HOST_INTERFACE_TYPES.has(linkType)) {
    applyHostInterfaceProperties(doc, linkMap, linkType, extra, specialNodeId);
  } else if (linkType === "vxlan" || linkType === "vxlan-stitch") {
    applyVxlanProperties(doc, linkMap, extra, specialNodeId);
  }
}

/**
 * Creates dual endpoint sequence for veth links
 */
function createDualEndpointSeq(
  doc: YAML.Document,
  linkData: LinkSaveData,
  extra: LinkSaveData["extraData"]
): YAML.YAMLSeq {
  const endpointsSeq = new YAML.YAMLSeq();
  endpointsSeq.flow = false;

  const srcEp = new YAML.YAMLMap();
  srcEp.flow = false;
  srcEp.set("node", createQuotedScalar(doc, linkData.source));
  if (hasText(linkData.sourceEndpoint)) {
    srcEp.set("interface", createQuotedScalar(doc, linkData.sourceEndpoint));
  }
  if (hasText(extra?.extSourceMac)) {
    srcEp.set("mac", doc.createNode(extra.extSourceMac));
  }
  if (hasText(extra?.extSourceIpv4)) {
    srcEp.set("ipv4", doc.createNode(extra.extSourceIpv4));
  }
  if (hasText(extra?.extSourceIpv6)) {
    srcEp.set("ipv6", doc.createNode(extra.extSourceIpv6));
  }

  const dstEp = new YAML.YAMLMap();
  dstEp.flow = false;
  dstEp.set("node", createQuotedScalar(doc, linkData.target));
  if (hasText(linkData.targetEndpoint)) {
    dstEp.set("interface", createQuotedScalar(doc, linkData.targetEndpoint));
  }
  if (hasText(extra?.extTargetMac)) {
    dstEp.set("mac", doc.createNode(extra.extTargetMac));
  }
  if (hasText(extra?.extTargetIpv4)) {
    dstEp.set("ipv4", doc.createNode(extra.extTargetIpv4));
  }
  if (hasText(extra?.extTargetIpv6)) {
    dstEp.set("ipv6", doc.createNode(extra.extTargetIpv6));
  }

  endpointsSeq.add(srcEp);
  endpointsSeq.add(dstEp);
  return endpointsSeq;
}

/**
 * Creates a link entry in extended format with type and additional properties
 */
function createExtendedLink(doc: YAML.Document, linkData: LinkSaveData): YAML.YAMLMap {
  const linkMap = new YAML.YAMLMap();
  linkMap.flow = false;

  const extra = linkData.extraData ?? {};
  const inferredType = inferSpecialLinkType(linkData);
  const rawType = typeof extra.extType === "string" ? extra.extType.trim() : "";
  const linkType = rawType && rawType !== "veth" ? rawType : (inferredType ?? "veth");

  linkMap.set("type", doc.createNode(linkType));

  if (SINGLE_ENDPOINT_TYPES.has(linkType)) {
    linkMap.set("endpoint", createSingleEndpointMap(doc, linkData, extra, linkType));
    applySingleEndpointProperties(doc, linkMap, linkType, extra, linkData);
  } else {
    linkMap.set("endpoints", createDualEndpointSeq(doc, linkData, extra));
  }

  // Common extended properties
  setOrDelete(doc, linkMap, "mtu", extra.extMtu);
  setOrDelete(doc, linkMap, "vars", extra.extVars);
  setOrDelete(doc, linkMap, "labels", extra.extLabels);

  return linkMap;
}

/**
 * Checks if link data has extended properties requiring extended format
 */
function hasExtendedProperties(linkData: LinkSaveData): boolean {
  const extra = linkData.extraData ?? {};
  const extendedKeys = [
    "extMtu",
    "extSourceMac",
    "extTargetMac",
    "extSourceIpv4",
    "extSourceIpv6",
    "extTargetIpv4",
    "extTargetIpv6",
    "extHostInterface",
    "extMode",
    "extRemote",
    "extVni",
    "extDstPort",
    "extSrcPort",
  ];

  if (extendedKeys.some((k) => extra[k] !== undefined && extra[k] !== "")) return true;
  if (
    extra.extVars !== undefined &&
    typeof extra.extVars === "object" &&
    Object.keys(extra.extVars).length > 0
  ) {
    return true;
  }
  if (
    extra.extLabels !== undefined &&
    typeof extra.extLabels === "object" &&
    Object.keys(extra.extLabels).length > 0
  ) {
    return true;
  }
  if (hasText(extra.extType) && extra.extType !== "veth") return true;
  const inferredType = inferSpecialLinkType(linkData);
  if (inferredType !== null && inferredType !== "veth") return true;

  return false;
}

/**
 * Extracts the link type from a special node ID.
 * E.g., "vxlan:vxlan0" -> "vxlan", "host:eth0" -> "host"
 */
function extractLinkTypeFromSpecialNode(nodeId: string): string | null {
  const colonIdx = nodeId.indexOf(":");
  if (colonIdx === -1) {
    // Handle dummy nodes which don't have a colon prefix
    if (nodeId.startsWith("dummy")) return "dummy";
    return null;
  }
  return nodeId.substring(0, colonIdx);
}

function inferSpecialLinkType(linkData: LinkSaveData): string | null {
  if (isSpecialNode(linkData.source)) {
    const sourceType = extractLinkTypeFromSpecialNode(linkData.source);
    if (sourceType !== null && sourceType !== "") return sourceType;
  }
  if (isSpecialNode(linkData.target)) {
    const targetType = extractLinkTypeFromSpecialNode(linkData.target);
    if (targetType !== null && targetType !== "") return targetType;
  }
  return null;
}

/**
 * Generates a canonical key for a link to find duplicates.
 * For special nodes (vxlan, host, etc.), uses the link type instead of the full node ID
 * to match the YAML format.
 */
function getLinkKey(linkData: LinkSaveData): string {
  const sourceIsSpecial = isSpecialNode(linkData.source);
  const targetIsSpecial = isSpecialNode(linkData.target);

  let src: string;
  let dst: string;

  if (sourceIsSpecial) {
    const linkType = extractLinkTypeFromSpecialNode(linkData.source);
    src = linkType ?? linkData.source;
    dst = hasText(linkData.targetEndpoint)
      ? `${linkData.target}:${linkData.targetEndpoint}`
      : linkData.target;
  } else if (targetIsSpecial) {
    const linkType = extractLinkTypeFromSpecialNode(linkData.target);
    src = hasText(linkData.sourceEndpoint)
      ? `${linkData.source}:${linkData.sourceEndpoint}`
      : linkData.source;
    dst = linkType ?? linkData.target;
  } else {
    src = hasText(linkData.sourceEndpoint)
      ? `${linkData.source}:${linkData.sourceEndpoint}`
      : linkData.source;
    dst = hasText(linkData.targetEndpoint)
      ? `${linkData.target}:${linkData.targetEndpoint}`
      : linkData.target;
  }

  // Sort to ensure consistent key regardless of direction
  return [src, dst].slice().sort().join("|");
}

/**
 * Extracts endpoint string from a YAML endpoint item
 */
function extractEndpointString(ep: unknown): string | null {
  if (YAML.isScalar(ep)) {
    return String(ep.value);
  }
  if (YAML.isMap(ep)) {
    const node = ep.get("node");
    const iface = ep.get("interface");
    if (iface === undefined || iface === null || iface === "") return String(node);
    return `${node}:${String(iface)}`;
  }
  return null;
}

/**
 * Gets the canonical key from an existing YAML link map
 */
function getYamlLinkKey(linkMap: YAML.YAMLMap): string | null {
  const endpoints: string[] = [];

  // Check endpoints array
  const endpointsSeq = linkMap.get("endpoints", true);
  if (YAML.isSeq(endpointsSeq)) {
    for (const ep of endpointsSeq.items) {
      const epStr = extractEndpointString(ep);
      if (epStr !== null && epStr !== "") endpoints.push(epStr);
    }
  }

  // Check single endpoint
  const endpoint = linkMap.get("endpoint", true);
  if (YAML.isMap(endpoint)) {
    const epStr = extractEndpointString(endpoint);
    if (epStr !== null && epStr !== "") endpoints.push(epStr);
  }

  if (endpoints.length < 1) return null;

  // For single-endpoint types, the second endpoint is the type (host, mgmt-net, etc.)
  const linkType = linkMap.get("type");
  if (endpoints.length === 1 && linkType !== undefined && linkType !== null) {
    endpoints.push(String(linkType));
  }

  return [...endpoints].sort().join("|");
}

/**
 * Gets the lookup key for finding an existing link
 * Uses original values if provided (for when endpoints have changed)
 * For special nodes (vxlan, host, etc.), uses the link type instead of the full node ID
 * to match the YAML format where single-endpoint links use the type as the second key part.
 */
function getLookupKey(linkData: LinkSaveData): string {
  const source = linkData.originalSource ?? linkData.source;
  const target = linkData.originalTarget ?? linkData.target;
  const sourceEndpoint = linkData.originalSourceEndpoint ?? linkData.sourceEndpoint;
  const targetEndpoint = linkData.originalTargetEndpoint ?? linkData.targetEndpoint;

  // Check if either endpoint is a special node
  const sourceIsSpecial = isSpecialNode(source);
  const targetIsSpecial = isSpecialNode(target);

  let src: string;
  let dst: string;

  if (sourceIsSpecial) {
    // Source is special node - use link type for that side, node:iface for other side
    const linkType = extractLinkTypeFromSpecialNode(source);
    src = linkType ?? source;
    dst = hasText(targetEndpoint) ? `${target}:${targetEndpoint}` : target;
  } else if (targetIsSpecial) {
    // Target is special node - use link type for that side, node:iface for other side
    const linkType = extractLinkTypeFromSpecialNode(target);
    src = hasText(sourceEndpoint) ? `${source}:${sourceEndpoint}` : source;
    dst = linkType ?? target;
  } else {
    // Normal veth link - use both endpoints
    src = hasText(sourceEndpoint) ? `${source}:${sourceEndpoint}` : source;
    dst = hasText(targetEndpoint) ? `${target}:${targetEndpoint}` : target;
  }

  return [src, dst].slice().sort().join("|");
}

/**
 * Builds a lookup key that treats all endpoints literally.
 * This is used as a fallback for legacy links that used special node IDs
 * directly in endpoints arrays (e.g. "host:eth0") instead of type-based links.
 */
function getLegacyLookupKey(linkData: LinkSaveData): string {
  const source = linkData.originalSource ?? linkData.source;
  const target = linkData.originalTarget ?? linkData.target;
  const sourceEndpoint = linkData.originalSourceEndpoint ?? linkData.sourceEndpoint;
  const targetEndpoint = linkData.originalTargetEndpoint ?? linkData.targetEndpoint;

  const src = hasText(sourceEndpoint) ? `${source}:${sourceEndpoint}` : source;
  const dst = hasText(targetEndpoint) ? `${target}:${targetEndpoint}` : target;
  return [src, dst].slice().sort().join("|");
}

/**
 * Adds a new link to the topology
 */
export function addLinkToDoc(
  doc: YAML.Document.Parsed,
  linkData: LinkSaveData,
  logger: IOLogger = noopLogger
): SaveResult {
  try {
    // Ensure links array exists
    const linksNode = doc.getIn(["topology", "links"], true);
    let linksSeq: YAML.YAMLSeq;
    if (YAML.isSeq(linksNode)) {
      linksSeq = linksNode;
    } else {
      linksSeq = new YAML.YAMLSeq();
      linksSeq.flow = false;
      const topoNode = doc.getIn(["topology"], true);
      if (YAML.isMap(topoNode)) {
        const topoMap = topoNode;
        topoMap.set("links", linksSeq);
      } else {
        return { success: false, error: "YAML topology is not a map" };
      }
    }

    // Check for duplicate
    const newKey = getLinkKey(linkData);
    for (const item of linksSeq.items) {
      if (YAML.isMap(item)) {
        const existingKey = getYamlLinkKey(item);
        if (existingKey === newKey) {
          return { success: false, error: "Link already exists" };
        }
      }
    }

    // Create the link
    const linkMap = hasExtendedProperties(linkData)
      ? createExtendedLink(doc, linkData)
      : createBriefLink(doc, linkData);

    linksSeq.add(linkMap);

    logger.info(`[SaveTopology] Added link: ${linkData.source} <-> ${linkData.target}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Updates an existing link in the topology
 */
export function editLinkInDoc(
  doc: YAML.Document.Parsed,
  linkData: LinkSaveData,
  logger: IOLogger = noopLogger
): SaveResult {
  try {
    const linksSeq = getValidatedLinksSeq(doc);
    if (!YAML.isSeq(linksSeq)) return linksSeq;

    // Use original values to find the existing link (if endpoints were changed)
    const lookupKey = getLookupKey(linkData);
    let found = false;

    logger.info(`[SaveTopology] Looking for link with key: ${lookupKey}`);

    const tryUpdateWithKey = (key: string): boolean => {
      for (let i = 0; i < linksSeq.items.length; i++) {
        const item = linksSeq.items[i];
        if (!YAML.isMap(item)) continue;

        const existingKey = getYamlLinkKey(item);
        if (existingKey === key) {
          // Replace with updated link (using the new values)
          const updatedLink = hasExtendedProperties(linkData)
            ? createExtendedLink(doc, linkData)
            : createBriefLink(doc, linkData);
          linksSeq.items[i] = updatedLink;
          logger.info(`[SaveTopology] Found and updated link at index ${i}`);
          return true;
        }
      }
      return false;
    };

    found = tryUpdateWithKey(lookupKey);

    if (!found) {
      const legacyKey = getLegacyLookupKey(linkData);
      if (legacyKey !== lookupKey) {
        logger.info(`[SaveTopology] Falling back to legacy link key: ${legacyKey}`);
        found = tryUpdateWithKey(legacyKey);
      }
    }

    if (!found) {
      return { success: false, error: `Link not found (lookup key: ${lookupKey})` };
    }

    logger.info(
      `[SaveTopology] Updated link: ${linkData.source}:${linkData.sourceEndpoint} <-> ${linkData.target}:${linkData.targetEndpoint}`
    );
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Removes a link from the topology
 */
export function deleteLinkFromDoc(
  doc: YAML.Document.Parsed,
  linkData: LinkSaveData,
  logger: IOLogger = noopLogger
): SaveResult {
  try {
    const linksSeq = getValidatedLinksSeq(doc);
    if (!YAML.isSeq(linksSeq)) return linksSeq;

    const targetKey = getLinkKey(linkData);
    const initialLength = linksSeq.items.length;

    linksSeq.items = linksSeq.items.filter((item) => {
      if (!YAML.isMap(item)) return true;
      const existingKey = getYamlLinkKey(item);
      return existingKey !== targetKey;
    });

    if (linksSeq.items.length === initialLength) {
      const legacyKey = getLegacyLookupKey(linkData);
      if (legacyKey !== targetKey) {
        linksSeq.items = linksSeq.items.filter((item) => {
          if (!YAML.isMap(item)) return true;
          const existingKey = getYamlLinkKey(item);
          return existingKey !== legacyKey;
        });
      }
    }

    if (linksSeq.items.length === initialLength) {
      return { success: false, error: "Link not found" };
    }

    logger.info(`[SaveTopology] Deleted link: ${linkData.source} <-> ${linkData.target}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
