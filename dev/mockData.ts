/**
 * Mock data for standalone development of React TopoViewer.
 */

import type { CustomNodeTemplate } from '@webview/context/TopoViewerContext';

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
