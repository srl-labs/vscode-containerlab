/**
 * Mock data for standalone development of React TopoViewer.
 */

import type { CustomNodeTemplate } from '@webview/context/TopoViewerContext';
import type { CustomIconInfo } from '@shared/types/icons';

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
 * Sample custom icons for development.
 * These match the format of built-in icons (120x120 with viewBox).
 */
export const sampleCustomIcons: CustomIconInfo[] = [
  {
    name: 'my-router',
    source: 'global',
    format: 'svg',
    // Simple router icon (orange) - matches built-in icon format
    dataUri: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120px" height="120px"><rect width="120" height="120" fill="#FF9800" rx="8"/><text x="60" y="72" text-anchor="middle" fill="white" font-size="36" font-family="sans-serif" font-weight="bold">R</text></svg>`),
  },
  {
    name: 'my-switch',
    source: 'global',
    format: 'svg',
    // Simple switch icon (purple) - matches built-in icon format
    dataUri: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120px" height="120px"><rect width="120" height="120" fill="#9C27B0" rx="8"/><text x="60" y="72" text-anchor="middle" fill="white" font-size="36" font-family="sans-serif" font-weight="bold">S</text></svg>`),
  },
  {
    name: 'firewall',
    source: 'workspace',
    format: 'svg',
    // Simple firewall icon (red) - matches built-in icon format
    dataUri: 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120px" height="120px"><rect width="120" height="120" fill="#F44336" rx="8"/><text x="60" y="68" text-anchor="middle" fill="white" font-size="28" font-family="sans-serif" font-weight="bold">FW</text></svg>`),
  },
];
