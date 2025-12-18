/**
 * TopologyParser - Parse containerlab YAML into Cytoscape elements
 *
 * Simplified version of TopologyAdapter for dev server use.
 * Converts .clab.yml files to the same format used by the real extension.
 */

import * as YAML from 'yaml';

// ============================================================================
// Types (mirroring shared/types/topology.ts)
// ============================================================================

export interface CyElement {
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
  position?: { x: number; y: number };
  classes?: string;
}

export interface TopologyAnnotations {
  freeTextAnnotations?: unknown[];
  freeShapeAnnotations?: unknown[];
  groupStyleAnnotations?: unknown[];
  networkNodeAnnotations?: unknown[];
  nodeAnnotations?: NodeAnnotation[];
  aliasEndpointAnnotations?: unknown[];
  cloudNodeAnnotations?: unknown[];
}

interface NodeAnnotation {
  id: string;
  position?: { x: number; y: number };
  icon?: string;
  group?: string;
  level?: string;
  interfacePattern?: string;
}

interface ClabTopology {
  name?: string;
  prefix?: string;
  topology?: {
    defaults?: Record<string, unknown>;
    kinds?: Record<string, Record<string, unknown>>;
    nodes?: Record<string, ClabNode | null>;
    links?: ClabLink[];
  };
}

interface ClabNode {
  kind?: string;
  type?: string;
  image?: string;
  group?: string;
  labels?: Record<string, unknown>;
  [key: string]: unknown;
}

type ClabLink = string[] | { endpoints: string[]; [key: string]: unknown };

// ============================================================================
// Role Detection
// ============================================================================

const ROUTER_KINDS = new Set([
  'nokia_srlinux',
  'nokia_sros',
  'arista_ceos',
  'arista_veos',
  'cisco_xrd',
  'cisco_xrv',
  'cisco_xrv9k',
  'juniper_crpd',
  'juniper_vjunos_router',
  'juniper_vjunos_switch',
  'juniper_vmx',
  'juniper_vqfx',
  'juniper_vsrx',
  'frr',
  'gobgp',
  'bird',
  'openbgpd',
]);

const CLIENT_KINDS = new Set(['linux', 'alpine', 'debian', 'ubuntu', 'centos', 'rocky']);

function detectRole(kind: string | undefined): string {
  if (!kind) return 'default';
  const k = kind.toLowerCase();
  if (ROUTER_KINDS.has(k)) return 'router';
  if (CLIENT_KINDS.has(k)) return 'client';
  return 'default';
}

// ============================================================================
// Link Parsing
// ============================================================================

interface ParsedEndpoint {
  node: string;
  iface: string;
}

function parseEndpoint(ep: string): ParsedEndpoint | null {
  const match = ep.match(/^([^:]+):(.+)$/);
  if (!match) return null;
  return { node: match[1], iface: match[2] };
}

function parseLink(link: ClabLink): { endpoints: string[] } | null {
  if (Array.isArray(link)) {
    // Brief format: ["node1:eth1", "node2:eth1"]
    return { endpoints: link };
  }
  if (link && typeof link === 'object' && 'endpoints' in link) {
    return { endpoints: link.endpoints };
  }
  return null;
}

// ============================================================================
// Main Parser
// ============================================================================

export interface ParseResult {
  elements: CyElement[];
  annotations: TopologyAnnotations;
  labName: string;
}

/**
 * Parse YAML content and annotations into Cytoscape elements
 */
export function parseTopology(
  yamlContent: string,
  annotations: TopologyAnnotations = {}
): ParseResult {
  const doc = YAML.parseDocument(yamlContent);
  const parsed = doc.toJS() as ClabTopology;

  const elements: CyElement[] = [];
  const labName = parsed.name || 'topology';

  if (!parsed.topology) {
    return { elements, annotations, labName };
  }

  const nodeAnnotationsMap = new Map<string, NodeAnnotation>();
  for (const na of annotations.nodeAnnotations || []) {
    nodeAnnotationsMap.set(na.id, na);
  }

  // Build node elements
  const nodes = parsed.topology.nodes || {};
  const defaults = parsed.topology.defaults || {};
  const kinds = parsed.topology.kinds || {};

  for (const [nodeName, nodeConfig] of Object.entries(nodes)) {
    if (!nodeConfig && nodeConfig !== null) continue;

    const node = nodeConfig || {};
    const kindDefaults = node.kind ? kinds[node.kind] || {} : {};

    // Merge: defaults < kind defaults < node config
    const kind = node.kind || kindDefaults.kind || defaults.kind;
    const type = node.type || kindDefaults.type || defaults.type;
    const image = node.image || kindDefaults.image || defaults.image;

    const nodeAnnotation = nodeAnnotationsMap.get(nodeName);
    const position = nodeAnnotation?.position;

    elements.push({
      group: 'nodes',
      data: {
        id: nodeName,
        name: nodeName,
        kind,
        type,
        image,
        topoViewerRole: detectRole(kind as string),
        // Include extra data for editing
        ...(node.group && { nodeGroup: node.group }),
        ...(node.labels && { labels: node.labels }),
      },
      ...(position && { position }),
    });
  }

  // Build edge elements
  const links = parsed.topology.links || [];
  const seenEdges = new Set<string>();

  for (const link of links) {
    const parsed = parseLink(link);
    if (!parsed || parsed.endpoints.length < 2) continue;

    const ep1 = parseEndpoint(parsed.endpoints[0]);
    const ep2 = parseEndpoint(parsed.endpoints[1]);
    if (!ep1 || !ep2) continue;

    // Create canonical edge ID (sorted to handle bidirectional)
    const edgeKey = [ep1.node, ep2.node].sort().join('-');
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    elements.push({
      group: 'edges',
      data: {
        id: `${ep1.node}-${ep2.node}`,
        source: ep1.node,
        target: ep2.node,
        sourceEndpoint: ep1.iface,
        targetEndpoint: ep2.iface,
      },
    });
  }

  // Add network nodes from annotations (if present)
  const networkNodes = annotations.networkNodeAnnotations || [];
  for (const nn of networkNodes as any[]) {
    if (!nn.id) continue;

    elements.push({
      group: 'nodes',
      data: {
        id: nn.id,
        name: nn.label || nn.id,
        type: nn.type || 'host',
        topoViewerRole: 'cloud',
      },
      ...(nn.position && { position: nn.position }),
    });
  }

  return { elements, annotations, labName };
}

/**
 * Generate YAML content from Cytoscape elements
 */
export function generateYaml(elements: CyElement[], labName = 'topology'): string {
  const nodes = elements.filter(el => el.group === 'nodes' && el.data.topoViewerRole !== 'cloud');
  const edges = elements.filter(el => el.group === 'edges');

  // Build nodes section
  const nodesYaml = nodes.map(node => {
    const data = node.data;
    const lines = [`    ${data.id}:`];
    if (data.kind) lines.push(`      kind: ${data.kind}`);
    if (data.type) lines.push(`      type: ${data.type}`);
    if (data.image) lines.push(`      image: ${data.image}`);
    return lines.join('\n');
  }).join('\n');

  // Build links section
  const linksYaml = edges.map(edge => {
    const data = edge.data;
    // Skip edges to cloud/network nodes
    const targetNode = nodes.find(n => n.data.id === data.target);
    const sourceNode = nodes.find(n => n.data.id === data.source);
    if (!targetNode || !sourceNode) return null;

    const srcEp = data.sourceEndpoint || 'eth1';
    const tgtEp = data.targetEndpoint || 'eth1';
    return `    - endpoints: ["${data.source}:${srcEp}", "${data.target}:${tgtEp}"]`;
  }).filter(Boolean).join('\n');

  return `name: ${labName}

topology:
  nodes:
${nodesYaml}

  links:
${linksYaml}
`;
}
