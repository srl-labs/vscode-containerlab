/**
 * Mock data for standalone development of React TopoViewer.
 * This provides sample topology data without needing the VS Code extension.
 */

import type { CyElement, FreeTextAnnotation, TopologyAnnotations } from '@shared/types/topology';
import type { TopoViewerState, CustomNodeTemplate } from '@webview/context/TopoViewerContext';

/**
 * Sample Cytoscape elements representing a spine-leaf topology
 */
export const sampleElements: CyElement[] = [
  // Spine nodes
  {
    group: 'nodes',
    data: {
      id: 'spine1',
      name: 'spine1',
      kind: 'nokia_srlinux',
      type: 'ixrd3',
      image: 'ghcr.io/nokia/srlinux:latest',
      topoViewerRole: 'router',
    },
    position: { x: 200, y: 100 },
  },
  {
    group: 'nodes',
    data: {
      id: 'spine2',
      name: 'spine2',
      kind: 'nokia_srlinux',
      type: 'ixrd3',
      image: 'ghcr.io/nokia/srlinux:latest',
      topoViewerRole: 'router',
    },
    position: { x: 400, y: 100 },
  },
  // Leaf nodes
  {
    group: 'nodes',
    data: {
      id: 'leaf1',
      name: 'leaf1',
      kind: 'nokia_srlinux',
      type: 'ixrd2',
      image: 'ghcr.io/nokia/srlinux:latest',
      topoViewerRole: 'router',
    },
    position: { x: 150, y: 250 },
  },
  {
    group: 'nodes',
    data: {
      id: 'leaf2',
      name: 'leaf2',
      kind: 'nokia_srlinux',
      type: 'ixrd2',
      image: 'ghcr.io/nokia/srlinux:latest',
      topoViewerRole: 'router',
    },
    position: { x: 450, y: 250 },
  },
  // Client nodes
  {
    group: 'nodes',
    data: {
      id: 'client1',
      name: 'client1',
      kind: 'linux',
      image: 'ghcr.io/srl-labs/network-multitool:latest',
      topoViewerRole: 'client',
    },
    position: { x: 100, y: 400 },
  },
  {
    group: 'nodes',
    data: {
      id: 'client2',
      name: 'client2',
      kind: 'linux',
      image: 'ghcr.io/srl-labs/network-multitool:latest',
      topoViewerRole: 'client',
    },
    position: { x: 500, y: 400 },
  },

  // Edges - Spine to Leaf connections
  {
    group: 'edges',
    data: {
      id: 'spine1-leaf1',
      source: 'spine1',
      target: 'leaf1',
      sourceEndpoint: 'e1-1',
      targetEndpoint: 'e1-49',
    },
  },
  {
    group: 'edges',
    data: {
      id: 'spine1-leaf2',
      source: 'spine1',
      target: 'leaf2',
      sourceEndpoint: 'e1-2',
      targetEndpoint: 'e1-49',
    },
  },
  {
    group: 'edges',
    data: {
      id: 'spine2-leaf1',
      source: 'spine2',
      target: 'leaf1',
      sourceEndpoint: 'e1-1',
      targetEndpoint: 'e1-50',
    },
  },
  {
    group: 'edges',
    data: {
      id: 'spine2-leaf2',
      source: 'spine2',
      target: 'leaf2',
      sourceEndpoint: 'e1-2',
      targetEndpoint: 'e1-50',
    },
  },
  // Client connections
  {
    group: 'edges',
    data: {
      id: 'leaf1-client1',
      source: 'leaf1',
      target: 'client1',
      sourceEndpoint: 'e1-1',
      targetEndpoint: 'eth1',
    },
  },
  {
    group: 'edges',
    data: {
      id: 'leaf2-client2',
      source: 'leaf2',
      target: 'client2',
      sourceEndpoint: 'e1-1',
      targetEndpoint: 'eth1',
    },
  },
];

/**
 * Sample custom node templates (from VS Code settings)
 */
export const sampleCustomNodes: CustomNodeTemplate[] = [
  {
    name: 'SRLinux Latest',
    kind: 'nokia_srlinux',
    type: 'ixrd1',
    image: 'ghcr.io/nokia/srlinux:latest',
    icon: 'router',
    baseName: 'srl',
    interfacePattern: 'e1-{n}',
    setDefault: true,
  },
  {
    name: 'Network Multitool',
    kind: 'linux',
    image: 'ghcr.io/srl-labs/network-multitool:latest',
    icon: 'client',
    baseName: 'client',
    interfacePattern: 'eth{n}',
    setDefault: false,
  },
  {
    name: 'Arista cEOS',
    kind: 'arista_ceos',
    image: 'ceos:latest',
    icon: 'router',
    baseName: 'ceos',
    interfacePattern: 'Ethernet{n}',
    setDefault: false,
  },
];

/**
 * Build the initial data object that would normally be injected by the extension
 */
export function buildInitialData(options: {
  mode?: 'edit' | 'view';
  deploymentState?: 'deployed' | 'undeployed' | 'unknown';
  elements?: CyElement[];
  isLocked?: boolean;
} = {}): Partial<TopoViewerState> & {
  schemaData?: unknown;
  dockerImages?: string[];
} {
  return {
    elements: options.elements || sampleElements,
    labName: 'dev-topology',
    mode: options.mode || 'edit',
    deploymentState: options.deploymentState || 'undeployed',
    isLocked: options.isLocked ?? false,
    customNodes: sampleCustomNodes,
    defaultNode: 'SRLinux Latest',
    // Additional data that gets stored on window
    schemaData: null, // Would contain the JSON schema for clab files
    dockerImages: [
      'ghcr.io/nokia/srlinux:latest',
      'ghcr.io/srl-labs/network-multitool:latest',
      'ceos:latest',
      'alpine:latest',
      'nginx:latest',
    ],
  };
}

/**
 * Empty topology for testing new topology creation
 */
export const emptyElements: CyElement[] = [];

/**
 * Larger topology for performance testing
 */
export function generateLargeTopology(nodeCount: number): CyElement[] {
  const elements: CyElement[] = [];
  const cols = Math.ceil(Math.sqrt(nodeCount));

  for (let i = 0; i < nodeCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    elements.push({
      group: 'nodes',
      data: {
        id: `node${i}`,
        name: `node${i}`,
        kind: i % 3 === 0 ? 'nokia_srlinux' : 'linux',
        topoViewerRole: i % 3 === 0 ? 'router' : 'client',
      },
      position: { x: 100 + col * 150, y: 100 + row * 150 },
    });
  }

  // Create mesh connections
  for (let i = 0; i < nodeCount - 1; i++) {
    if ((i + 1) % cols !== 0) {
      elements.push({
        group: 'edges',
        data: {
          id: `edge-h-${i}`,
          source: `node${i}`,
          target: `node${i + 1}`,
          sourceEndpoint: 'eth0',
          targetEndpoint: 'eth0',
        },
      });
    }
    if (i + cols < nodeCount) {
      elements.push({
        group: 'edges',
        data: {
          id: `edge-v-${i}`,
          source: `node${i}`,
          target: `node${i + cols}`,
          sourceEndpoint: 'eth1',
          targetEndpoint: 'eth1',
        },
      });
    }
  }

  return elements;
}

/**
 * Sample free text annotations for development
 */
export const sampleFreeTextAnnotations: FreeTextAnnotation[] = [
  {
    id: 'freeText_dev_1',
    text: '## Spine Layer\nData center spine switches',
    position: { x: 200, y: 30 },
    fontSize: 14,
    fontColor: '#FFFFFF',
    backgroundColor: '#3b82f6',
    fontWeight: 'bold',
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'center',
    fontFamily: 'monospace',
    rotation: 0,
    roundedBackground: true
  },
  {
    id: 'freeText_dev_2',
    text: '### Leaf Layer\nTop-of-rack switches',
    position: { x: 200, y: 180 },
    fontSize: 12,
    fontColor: '#FFFFFF',
    backgroundColor: '#22c55e',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'center',
    fontFamily: 'monospace',
    rotation: 0,
    roundedBackground: true
  },
  {
    id: 'freeText_dev_3',
    text: 'Client endpoints',
    position: { x: 200, y: 340 },
    fontSize: 11,
    fontColor: '#9ca3af',
    backgroundColor: 'transparent',
    fontWeight: 'normal',
    fontStyle: 'italic',
    textDecoration: 'none',
    textAlign: 'center',
    fontFamily: 'sans-serif',
    rotation: 0,
    roundedBackground: false
  }
];

/**
 * Sample complete annotations object for development
 */
export const sampleAnnotations: TopologyAnnotations = {
  freeTextAnnotations: sampleFreeTextAnnotations,
  freeShapeAnnotations: [],
  groupStyleAnnotations: [],
  cloudNodeAnnotations: [],
  nodeAnnotations: sampleElements
    .filter(el => el.group === 'nodes')
    .map(el => ({
      id: el.data.id as string,
      position: el.position,
      interfacePattern: (el.data.kind as string)?.includes('srlinux') ? 'e1-{n}' : 'eth{n}'
    }))
};

/**
 * Generate YAML content from Cytoscape elements
 * This creates a containerlab-compatible YAML representation
 */
export function generateYamlFromElements(elements: CyElement[], labName = 'dev-topology'): string {
  const nodes = elements.filter(el => el.group === 'nodes');
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
    const srcEp = data.sourceEndpoint || 'eth1';
    const tgtEp = data.targetEndpoint || 'eth1';
    return `    - endpoints: ["${data.source}:${srcEp}", "${data.target}:${tgtEp}"]`;
  }).join('\n');

  return `# Containerlab Topology
# Generated from mock data for development
name: ${labName}

topology:
  nodes:
${nodesYaml}

  links:
${linksYaml}
`;
}

/**
 * Generate mock annotations JSON content
 */
export function generateAnnotationsJson(annotations: TopologyAnnotations): string {
  return JSON.stringify(annotations, null, 2);
}
