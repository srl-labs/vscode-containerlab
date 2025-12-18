/**
 * TopologyParser - YAML generation for dev server
 *
 * Note: Parsing functionality has been moved to the shared parser module.
 * This file only contains YAML generation for dev server use.
 */

import { CyElement } from '../../src/reactTopoViewer/shared/types/topology';

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
