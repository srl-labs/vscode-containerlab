/**
 * LinkPersistenceIO - Pure YAML AST operations for link CRUD
 *
 * Contains only the YAML manipulation logic without file I/O.
 * Used by both VS Code extension and dev server.
 */

import * as YAML from 'yaml';

import type { SaveResult, IOLogger} from './types';
import { ERROR_LINKS_NOT_SEQ, noopLogger } from './types';
import { createQuotedScalar, setOrDelete } from './YamlDocumentIO';

/**
 * Gets the links sequence from a YAML document, returning an error result if not found.
 */
function getLinksSeqOrError(doc: YAML.Document.Parsed): { linksSeq: YAML.YAMLSeq } | { error: SaveResult } {
  const linksSeq = doc.getIn(['topology', 'links'], true) as YAML.YAMLSeq | undefined;
  if (!linksSeq || !YAML.isSeq(linksSeq)) {
    return { error: { success: false, error: ERROR_LINKS_NOT_SEQ } };
  }
  return { linksSeq };
}

/**
 * Gets the links sequence, returning it directly or the error SaveResult if not found.
 * Helper to reduce code duplication for the common pattern of error checking.
 */
function getValidatedLinksSeq(doc: YAML.Document.Parsed): YAML.YAMLSeq | SaveResult {
  const result = getLinksSeqOrError(doc);
  if ('error' in result) return result.error;
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

/** Link types that use single endpoint format */
const SINGLE_ENDPOINT_TYPES = new Set(['host', 'mgmt-net', 'macvlan', 'vxlan', 'vxlan-stitch']);

/**
 * Creates a link entry in brief format: endpoints: ["node1:eth1", "node2:eth1"]
 */
function createBriefLink(doc: YAML.Document, linkData: LinkSaveData): YAML.YAMLMap {
  const linkMap = new YAML.YAMLMap();
  linkMap.flow = false;

  const srcStr = linkData.sourceEndpoint
    ? `${linkData.source}:${linkData.sourceEndpoint}`
    : linkData.source;
  const dstStr = linkData.targetEndpoint
    ? `${linkData.target}:${linkData.targetEndpoint}`
    : linkData.target;

  const endpointsSeq = new YAML.YAMLSeq();
  endpointsSeq.flow = true;
  endpointsSeq.add(createQuotedScalar(doc, srcStr));
  endpointsSeq.add(createQuotedScalar(doc, dstStr));

  linkMap.set('endpoints', endpointsSeq);
  return linkMap;
}

/**
 * Creates a single endpoint map for special link types
 */
function createSingleEndpointMap(
  doc: YAML.Document,
  linkData: LinkSaveData,
  extra: LinkSaveData['extraData']
): YAML.YAMLMap {
  const epMap = new YAML.YAMLMap();
  epMap.flow = false;
  epMap.set('node', createQuotedScalar(doc, linkData.source));
  if (linkData.sourceEndpoint) {
    epMap.set('interface', createQuotedScalar(doc, linkData.sourceEndpoint));
  }
  if (extra?.extSourceMac) {
    epMap.set('mac', doc.createNode(extra.extSourceMac));
  }
  return epMap;
}

/**
 * Applies type-specific properties for single endpoint links
 */
function applySingleEndpointProperties(
  doc: YAML.Document,
  linkMap: YAML.YAMLMap,
  linkType: string,
  extra: LinkSaveData['extraData']
): void {
  if (extra?.extHostInterface) {
    linkMap.set('host-interface', doc.createNode(extra.extHostInterface));
  }
  if (linkType === 'macvlan' && extra?.extMode) {
    linkMap.set('mode', doc.createNode(extra.extMode));
  }
  if (linkType === 'vxlan' || linkType === 'vxlan-stitch') {
    setOrDelete(doc, linkMap, 'remote', extra?.extRemote);
    setOrDelete(doc, linkMap, 'vni', extra?.extVni);
    setOrDelete(doc, linkMap, 'dst-port', extra?.extDstPort);
    setOrDelete(doc, linkMap, 'src-port', extra?.extSrcPort);
  }
}

/**
 * Creates dual endpoint sequence for veth links
 */
function createDualEndpointSeq(
  doc: YAML.Document,
  linkData: LinkSaveData,
  extra: LinkSaveData['extraData']
): YAML.YAMLSeq {
  const endpointsSeq = new YAML.YAMLSeq();
  endpointsSeq.flow = false;

  const srcEp = new YAML.YAMLMap();
  srcEp.flow = false;
  srcEp.set('node', createQuotedScalar(doc, linkData.source));
  if (linkData.sourceEndpoint) {
    srcEp.set('interface', createQuotedScalar(doc, linkData.sourceEndpoint));
  }
  if (extra?.extSourceMac) {
    srcEp.set('mac', doc.createNode(extra.extSourceMac));
  }

  const dstEp = new YAML.YAMLMap();
  dstEp.flow = false;
  dstEp.set('node', createQuotedScalar(doc, linkData.target));
  if (linkData.targetEndpoint) {
    dstEp.set('interface', createQuotedScalar(doc, linkData.targetEndpoint));
  }
  if (extra?.extTargetMac) {
    dstEp.set('mac', doc.createNode(extra.extTargetMac));
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

  const extra = linkData.extraData || {};
  const linkType = extra.extType || 'veth';

  linkMap.set('type', doc.createNode(linkType));

  if (SINGLE_ENDPOINT_TYPES.has(linkType)) {
    linkMap.set('endpoint', createSingleEndpointMap(doc, linkData, extra));
    applySingleEndpointProperties(doc, linkMap, linkType, extra);
  } else {
    linkMap.set('endpoints', createDualEndpointSeq(doc, linkData, extra));
  }

  // Common extended properties
  setOrDelete(doc, linkMap, 'mtu', extra.extMtu);
  setOrDelete(doc, linkMap, 'vars', extra.extVars);
  setOrDelete(doc, linkMap, 'labels', extra.extLabels);

  return linkMap;
}

/**
 * Checks if link data has extended properties requiring extended format
 */
function hasExtendedProperties(linkData: LinkSaveData): boolean {
  const extra = linkData.extraData || {};
  const extendedKeys = [
    'extMtu', 'extSourceMac', 'extTargetMac', 'extHostInterface',
    'extMode', 'extRemote', 'extVni', 'extDstPort', 'extSrcPort'
  ];

  if (extendedKeys.some(k => extra[k] !== undefined && extra[k] !== '')) return true;
  if (extra.extVars && typeof extra.extVars === 'object' && Object.keys(extra.extVars).length > 0) return true;
  if (extra.extLabels && typeof extra.extLabels === 'object' && Object.keys(extra.extLabels).length > 0) return true;
  if (extra.extType && extra.extType !== 'veth') return true;

  return false;
}

/**
 * Generates a canonical key for a link to find duplicates
 */
function getLinkKey(linkData: LinkSaveData): string {
  const src = linkData.sourceEndpoint
    ? `${linkData.source}:${linkData.sourceEndpoint}`
    : linkData.source;
  const dst = linkData.targetEndpoint
    ? `${linkData.target}:${linkData.targetEndpoint}`
    : linkData.target;

  // Sort to ensure consistent key regardless of direction
  return [src, dst].toSorted().join('|');
}

/**
 * Extracts endpoint string from a YAML endpoint item
 */
function extractEndpointString(ep: unknown): string | null {
  if (YAML.isScalar(ep)) {
    return String(ep.value);
  }
  if (YAML.isMap(ep)) {
    const node = (ep as YAML.YAMLMap).get('node');
    const iface = (ep as YAML.YAMLMap).get('interface');
    return iface ? `${node}:${iface}` : String(node);
  }
  return null;
}

/**
 * Gets the canonical key from an existing YAML link map
 */
function getYamlLinkKey(linkMap: YAML.YAMLMap): string | null {
  const endpoints: string[] = [];

  // Check endpoints array
  const endpointsSeq = linkMap.get('endpoints', true);
  if (YAML.isSeq(endpointsSeq)) {
    for (const ep of endpointsSeq.items) {
      const epStr = extractEndpointString(ep);
      if (epStr) endpoints.push(epStr);
    }
  }

  // Check single endpoint
  const endpoint = linkMap.get('endpoint', true);
  if (YAML.isMap(endpoint)) {
    const epStr = extractEndpointString(endpoint);
    if (epStr) endpoints.push(epStr);
  }

  if (endpoints.length < 1) return null;

  // For single-endpoint types, the second endpoint is the type (host, mgmt-net, etc.)
  const linkType = linkMap.get('type');
  if (endpoints.length === 1 && linkType) {
    endpoints.push(String(linkType));
  }

  return [...endpoints].sort().join('|');
}

/**
 * Gets the lookup key for finding an existing link
 * Uses original values if provided (for when endpoints have changed)
 */
function getLookupKey(linkData: LinkSaveData): string {
  const source = linkData.originalSource || linkData.source;
  const target = linkData.originalTarget || linkData.target;
  const sourceEndpoint = linkData.originalSourceEndpoint ?? linkData.sourceEndpoint;
  const targetEndpoint = linkData.originalTargetEndpoint ?? linkData.targetEndpoint;

  const src = sourceEndpoint ? `${source}:${sourceEndpoint}` : source;
  const dst = targetEndpoint ? `${target}:${targetEndpoint}` : target;

  return [src, dst].toSorted().join('|');
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
    let linksSeq = doc.getIn(['topology', 'links'], true) as YAML.YAMLSeq | undefined;
    if (!linksSeq) {
      linksSeq = new YAML.YAMLSeq();
      linksSeq.flow = false;
      const topoMap = doc.getIn(['topology'], true) as YAML.YAMLMap;
      if (topoMap && YAML.isMap(topoMap)) {
        topoMap.set('links', linksSeq);
      } else {
        return { success: false, error: 'YAML topology is not a map' };
      }
    }

    // Check for duplicate
    const newKey = getLinkKey(linkData);
    for (const item of linksSeq.items) {
      if (YAML.isMap(item)) {
        const existingKey = getYamlLinkKey(item as YAML.YAMLMap);
        if (existingKey === newKey) {
          return { success: false, error: 'Link already exists' };
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

    for (let i = 0; i < linksSeq.items.length; i++) {
      const item = linksSeq.items[i];
      if (!YAML.isMap(item)) continue;

      const existingKey = getYamlLinkKey(item as YAML.YAMLMap);
      if (existingKey === lookupKey) {
        // Replace with updated link (using the new values)
        const updatedLink = hasExtendedProperties(linkData)
          ? createExtendedLink(doc, linkData)
          : createBriefLink(doc, linkData);
        linksSeq.items[i] = updatedLink;
        found = true;
        logger.info(`[SaveTopology] Found and updated link at index ${i}`);
        break;
      }
    }

    if (!found) {
      return { success: false, error: `Link not found (lookup key: ${lookupKey})` };
    }

    logger.info(`[SaveTopology] Updated link: ${linkData.source}:${linkData.sourceEndpoint} <-> ${linkData.target}:${linkData.targetEndpoint}`);
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

    linksSeq.items = linksSeq.items.filter(item => {
      if (!YAML.isMap(item)) return true;
      const existingKey = getYamlLinkKey(item as YAML.YAMLMap);
      return existingKey !== targetKey;
    });

    if (linksSeq.items.length === initialLength) {
      return { success: false, error: 'Link not found' };
    }

    logger.info(`[SaveTopology] Deleted link: ${linkData.source} <-> ${linkData.target}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
