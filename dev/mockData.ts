/**
 * Mock data for standalone development of React TopoViewer.
 * This provides sample topology data without needing the VS Code extension.
 */

import type { CyElement, FreeTextAnnotation, FreeShapeAnnotation, GroupStyleAnnotation, TopologyAnnotations } from '@shared/types/topology';
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
 * Annotated topology - a larger data center layout with groups, text, and shapes
 */
export const annotatedElements: CyElement[] = [
  // Border routers
  {
    group: 'nodes',
    data: {
      id: 'border1',
      name: 'border1',
      kind: 'nokia_srlinux',
      type: 'ixrd3',
      image: 'ghcr.io/nokia/srlinux:latest',
      topoViewerRole: 'router',
    },
    position: { x: 250, y: 50 },
  },
  {
    group: 'nodes',
    data: {
      id: 'border2',
      name: 'border2',
      kind: 'nokia_srlinux',
      type: 'ixrd3',
      image: 'ghcr.io/nokia/srlinux:latest',
      topoViewerRole: 'router',
    },
    position: { x: 450, y: 50 },
  },
  // Spine layer
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
    position: { x: 200, y: 150 },
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
    position: { x: 350, y: 150 },
  },
  {
    group: 'nodes',
    data: {
      id: 'spine3',
      name: 'spine3',
      kind: 'nokia_srlinux',
      type: 'ixrd3',
      image: 'ghcr.io/nokia/srlinux:latest',
      topoViewerRole: 'router',
    },
    position: { x: 500, y: 150 },
  },
  // Leaf layer - Rack A
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
    position: { x: 120, y: 280 },
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
    position: { x: 220, y: 280 },
  },
  // Leaf layer - Rack B
  {
    group: 'nodes',
    data: {
      id: 'leaf3',
      name: 'leaf3',
      kind: 'nokia_srlinux',
      type: 'ixrd2',
      image: 'ghcr.io/nokia/srlinux:latest',
      topoViewerRole: 'router',
    },
    position: { x: 480, y: 280 },
  },
  {
    group: 'nodes',
    data: {
      id: 'leaf4',
      name: 'leaf4',
      kind: 'nokia_srlinux',
      type: 'ixrd2',
      image: 'ghcr.io/nokia/srlinux:latest',
      topoViewerRole: 'router',
    },
    position: { x: 580, y: 280 },
  },
  // Servers - Rack A
  {
    group: 'nodes',
    data: {
      id: 'server1',
      name: 'server1',
      kind: 'linux',
      image: 'ghcr.io/srl-labs/network-multitool:latest',
      topoViewerRole: 'server',
    },
    position: { x: 100, y: 400 },
  },
  {
    group: 'nodes',
    data: {
      id: 'server2',
      name: 'server2',
      kind: 'linux',
      image: 'ghcr.io/srl-labs/network-multitool:latest',
      topoViewerRole: 'server',
    },
    position: { x: 170, y: 400 },
  },
  {
    group: 'nodes',
    data: {
      id: 'server3',
      name: 'server3',
      kind: 'linux',
      image: 'ghcr.io/srl-labs/network-multitool:latest',
      topoViewerRole: 'server',
    },
    position: { x: 240, y: 400 },
  },
  // Servers - Rack B
  {
    group: 'nodes',
    data: {
      id: 'server4',
      name: 'server4',
      kind: 'linux',
      image: 'ghcr.io/srl-labs/network-multitool:latest',
      topoViewerRole: 'server',
    },
    position: { x: 460, y: 400 },
  },
  {
    group: 'nodes',
    data: {
      id: 'server5',
      name: 'server5',
      kind: 'linux',
      image: 'ghcr.io/srl-labs/network-multitool:latest',
      topoViewerRole: 'server',
    },
    position: { x: 530, y: 400 },
  },
  {
    group: 'nodes',
    data: {
      id: 'server6',
      name: 'server6',
      kind: 'linux',
      image: 'ghcr.io/srl-labs/network-multitool:latest',
      topoViewerRole: 'server',
    },
    position: { x: 600, y: 400 },
  },

  // Edges - Border to Spine
  { group: 'edges', data: { id: 'border1-spine1', source: 'border1', target: 'spine1', sourceEndpoint: 'e1-1', targetEndpoint: 'e1-49' } },
  { group: 'edges', data: { id: 'border1-spine2', source: 'border1', target: 'spine2', sourceEndpoint: 'e1-2', targetEndpoint: 'e1-49' } },
  { group: 'edges', data: { id: 'border2-spine2', source: 'border2', target: 'spine2', sourceEndpoint: 'e1-1', targetEndpoint: 'e1-50' } },
  { group: 'edges', data: { id: 'border2-spine3', source: 'border2', target: 'spine3', sourceEndpoint: 'e1-2', targetEndpoint: 'e1-49' } },

  // Edges - Spine to Leaf (full mesh)
  { group: 'edges', data: { id: 'spine1-leaf1', source: 'spine1', target: 'leaf1', sourceEndpoint: 'e1-1', targetEndpoint: 'e1-49' } },
  { group: 'edges', data: { id: 'spine1-leaf2', source: 'spine1', target: 'leaf2', sourceEndpoint: 'e1-2', targetEndpoint: 'e1-49' } },
  { group: 'edges', data: { id: 'spine2-leaf1', source: 'spine2', target: 'leaf1', sourceEndpoint: 'e1-1', targetEndpoint: 'e1-50' } },
  { group: 'edges', data: { id: 'spine2-leaf2', source: 'spine2', target: 'leaf2', sourceEndpoint: 'e1-2', targetEndpoint: 'e1-50' } },
  { group: 'edges', data: { id: 'spine2-leaf3', source: 'spine2', target: 'leaf3', sourceEndpoint: 'e1-3', targetEndpoint: 'e1-49' } },
  { group: 'edges', data: { id: 'spine2-leaf4', source: 'spine2', target: 'leaf4', sourceEndpoint: 'e1-4', targetEndpoint: 'e1-49' } },
  { group: 'edges', data: { id: 'spine3-leaf3', source: 'spine3', target: 'leaf3', sourceEndpoint: 'e1-1', targetEndpoint: 'e1-50' } },
  { group: 'edges', data: { id: 'spine3-leaf4', source: 'spine3', target: 'leaf4', sourceEndpoint: 'e1-2', targetEndpoint: 'e1-50' } },

  // Edges - Leaf to Servers (Rack A)
  { group: 'edges', data: { id: 'leaf1-server1', source: 'leaf1', target: 'server1', sourceEndpoint: 'e1-1', targetEndpoint: 'eth1' } },
  { group: 'edges', data: { id: 'leaf1-server2', source: 'leaf1', target: 'server2', sourceEndpoint: 'e1-2', targetEndpoint: 'eth1' } },
  { group: 'edges', data: { id: 'leaf2-server2', source: 'leaf2', target: 'server2', sourceEndpoint: 'e1-1', targetEndpoint: 'eth2' } },
  { group: 'edges', data: { id: 'leaf2-server3', source: 'leaf2', target: 'server3', sourceEndpoint: 'e1-2', targetEndpoint: 'eth1' } },

  // Edges - Leaf to Servers (Rack B)
  { group: 'edges', data: { id: 'leaf3-server4', source: 'leaf3', target: 'server4', sourceEndpoint: 'e1-1', targetEndpoint: 'eth1' } },
  { group: 'edges', data: { id: 'leaf3-server5', source: 'leaf3', target: 'server5', sourceEndpoint: 'e1-2', targetEndpoint: 'eth1' } },
  { group: 'edges', data: { id: 'leaf4-server5', source: 'leaf4', target: 'server5', sourceEndpoint: 'e1-1', targetEndpoint: 'eth2' } },
  { group: 'edges', data: { id: 'leaf4-server6', source: 'leaf4', target: 'server6', sourceEndpoint: 'e1-2', targetEndpoint: 'eth1' } },
];

/**
 * Annotations for the annotated topology
 */
export const annotatedTopologyAnnotations: TopologyAnnotations = {
  freeTextAnnotations: [
    {
      id: 'text-title',
      text: 'Data Center West',
      position: { x: 350, y: 10 },
      fontSize: 20,
      fontColor: '#1e40af',
      backgroundColor: 'transparent',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      fontFamily: 'sans-serif',
      rotation: 0,
      roundedBackground: false
    },
    {
      id: 'text-border',
      text: 'Border Layer',
      position: { x: 620, y: 50 },
      fontSize: 12,
      fontColor: '#dc2626',
      backgroundColor: '#fef2f2',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      fontFamily: 'monospace',
      rotation: 0,
      roundedBackground: true
    },
    {
      id: 'text-spine',
      text: 'Spine Layer',
      position: { x: 620, y: 150 },
      fontSize: 12,
      fontColor: '#7c3aed',
      backgroundColor: '#f5f3ff',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      fontFamily: 'monospace',
      rotation: 0,
      roundedBackground: true
    },
    {
      id: 'text-leaf',
      text: 'Leaf Layer',
      position: { x: 350, y: 250 },
      fontSize: 12,
      fontColor: '#059669',
      backgroundColor: '#ecfdf5',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      fontFamily: 'monospace',
      rotation: 0,
      roundedBackground: true
    },
    {
      id: 'text-rack-a',
      text: 'Rack A',
      position: { x: 170, y: 450 },
      fontSize: 14,
      fontColor: '#0369a1',
      backgroundColor: 'transparent',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      fontFamily: 'sans-serif',
      rotation: 0,
      roundedBackground: false
    },
    {
      id: 'text-rack-b',
      text: 'Rack B',
      position: { x: 530, y: 450 },
      fontSize: 14,
      fontColor: '#0369a1',
      backgroundColor: 'transparent',
      fontWeight: 'bold',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      fontFamily: 'sans-serif',
      rotation: 0,
      roundedBackground: false
    },
    {
      id: 'text-wan',
      text: 'To WAN',
      position: { x: 350, y: -20 },
      fontSize: 11,
      fontColor: '#6b7280',
      backgroundColor: 'transparent',
      fontWeight: 'normal',
      fontStyle: 'italic',
      textDecoration: 'none',
      textAlign: 'center',
      fontFamily: 'sans-serif',
      rotation: 0,
      roundedBackground: false
    }
  ],
  freeShapeAnnotations: [
    // Border layer background
    {
      id: 'shape-border-bg',
      shapeType: 'rectangle',
      position: { x: 200, y: 25 },
      width: 300,
      height: 60,
      fillColor: '#dc2626',
      fillOpacity: 0.05,
      borderColor: '#dc2626',
      borderWidth: 2,
      borderStyle: 'solid',
      rotation: 0,
      zIndex: -10,
      cornerRadius: 8
    },
    // Spine layer background
    {
      id: 'shape-spine-bg',
      shapeType: 'rectangle',
      position: { x: 150, y: 120 },
      width: 400,
      height: 70,
      fillColor: '#7c3aed',
      fillOpacity: 0.05,
      borderColor: '#7c3aed',
      borderWidth: 2,
      borderStyle: 'solid',
      rotation: 0,
      zIndex: -10,
      cornerRadius: 8
    },
    // Rack A background
    {
      id: 'shape-rack-a',
      shapeType: 'rectangle',
      position: { x: 70, y: 250 },
      width: 220,
      height: 220,
      fillColor: '#0369a1',
      fillOpacity: 0.05,
      borderColor: '#0369a1',
      borderWidth: 2,
      borderStyle: 'dashed',
      rotation: 0,
      zIndex: -10,
      cornerRadius: 12
    },
    // Rack B background
    {
      id: 'shape-rack-b',
      shapeType: 'rectangle',
      position: { x: 430, y: 250 },
      width: 220,
      height: 220,
      fillColor: '#0369a1',
      fillOpacity: 0.05,
      borderColor: '#0369a1',
      borderWidth: 2,
      borderStyle: 'dashed',
      rotation: 0,
      zIndex: -10,
      cornerRadius: 12
    },
    // WAN arrow
    {
      id: 'shape-wan-arrow',
      shapeType: 'line',
      position: { x: 350, y: -10 },
      endPosition: { x: 350, y: 20 },
      fillColor: 'transparent',
      fillOpacity: 0,
      borderColor: '#6b7280',
      borderWidth: 2,
      borderStyle: 'solid',
      rotation: 0,
      zIndex: 0,
      lineStartArrow: true,
      lineEndArrow: false,
      lineArrowSize: 8
    },
    // Decorative separator line
    {
      id: 'shape-separator',
      shapeType: 'line',
      position: { x: 350, y: 210 },
      endPosition: { x: 350, y: 240 },
      fillColor: 'transparent',
      fillOpacity: 0,
      borderColor: '#d1d5db',
      borderWidth: 1,
      borderStyle: 'dotted',
      rotation: 0,
      zIndex: -5,
      lineStartArrow: false,
      lineEndArrow: false
    }
  ],
  groupStyleAnnotations: [
    {
      id: 'group-border',
      name: 'Border',
      level: 'L0',
      position: { x: 210, y: 30 },
      width: 280,
      height: 50,
      color: '#dc2626',
      backgroundColor: '#dc2626',
      backgroundOpacity: 0.08,
      borderColor: '#dc2626',
      borderWidth: 2,
      borderStyle: 'solid',
      borderRadius: 8,
      labelColor: '#dc2626',
      labelPosition: 'top-left',
      zIndex: -5
    },
    {
      id: 'group-spine',
      name: 'Spine',
      level: 'L1',
      position: { x: 160, y: 125 },
      width: 380,
      height: 60,
      color: '#7c3aed',
      backgroundColor: '#7c3aed',
      backgroundOpacity: 0.08,
      borderColor: '#7c3aed',
      borderWidth: 2,
      borderStyle: 'solid',
      borderRadius: 8,
      labelColor: '#7c3aed',
      labelPosition: 'top-left',
      zIndex: -5
    },
    {
      id: 'group-leaf-a',
      name: 'Leaf A',
      level: 'L2',
      position: { x: 80, y: 255 },
      width: 180,
      height: 55,
      color: '#059669',
      backgroundColor: '#059669',
      backgroundOpacity: 0.08,
      borderColor: '#059669',
      borderWidth: 2,
      borderStyle: 'solid',
      borderRadius: 6,
      labelColor: '#059669',
      labelPosition: 'top-left',
      zIndex: -4
    },
    {
      id: 'group-leaf-b',
      name: 'Leaf B',
      level: 'L2',
      position: { x: 440, y: 255 },
      width: 180,
      height: 55,
      color: '#059669',
      backgroundColor: '#059669',
      backgroundOpacity: 0.08,
      borderColor: '#059669',
      borderWidth: 2,
      borderStyle: 'solid',
      borderRadius: 6,
      labelColor: '#059669',
      labelPosition: 'top-right',
      zIndex: -4
    },
    {
      id: 'group-servers-a',
      name: 'Compute A',
      level: 'L3',
      position: { x: 80, y: 370 },
      width: 180,
      height: 60,
      color: '#ea580c',
      backgroundColor: '#ea580c',
      backgroundOpacity: 0.06,
      borderColor: '#ea580c',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 6,
      labelColor: '#ea580c',
      labelPosition: 'bottom-center',
      zIndex: -4
    },
    {
      id: 'group-servers-b',
      name: 'Compute B',
      level: 'L3',
      position: { x: 440, y: 370 },
      width: 180,
      height: 60,
      color: '#ea580c',
      backgroundColor: '#ea580c',
      backgroundOpacity: 0.06,
      borderColor: '#ea580c',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 6,
      labelColor: '#ea580c',
      labelPosition: 'bottom-center',
      zIndex: -4
    }
  ],
  cloudNodeAnnotations: [],
  nodeAnnotations: [
    { id: 'border1', position: { x: 250, y: 50 }, group: 'group-border', level: 'L0' },
    { id: 'border2', position: { x: 450, y: 50 }, group: 'group-border', level: 'L0' },
    { id: 'spine1', position: { x: 200, y: 150 }, group: 'group-spine', level: 'L1' },
    { id: 'spine2', position: { x: 350, y: 150 }, group: 'group-spine', level: 'L1' },
    { id: 'spine3', position: { x: 500, y: 150 }, group: 'group-spine', level: 'L1' },
    { id: 'leaf1', position: { x: 120, y: 280 }, group: 'group-leaf-a', level: 'L2' },
    { id: 'leaf2', position: { x: 220, y: 280 }, group: 'group-leaf-a', level: 'L2' },
    { id: 'leaf3', position: { x: 480, y: 280 }, group: 'group-leaf-b', level: 'L2' },
    { id: 'leaf4', position: { x: 580, y: 280 }, group: 'group-leaf-b', level: 'L2' },
    { id: 'server1', position: { x: 100, y: 400 }, group: 'group-servers-a', level: 'L3' },
    { id: 'server2', position: { x: 170, y: 400 }, group: 'group-servers-a', level: 'L3' },
    { id: 'server3', position: { x: 240, y: 400 }, group: 'group-servers-a', level: 'L3' },
    { id: 'server4', position: { x: 460, y: 400 }, group: 'group-servers-b', level: 'L3' },
    { id: 'server5', position: { x: 530, y: 400 }, group: 'group-servers-b', level: 'L3' },
    { id: 'server6', position: { x: 600, y: 400 }, group: 'group-servers-b', level: 'L3' },
  ],
  aliasEndpointAnnotations: []
};

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
  includeAnnotations?: boolean;
} = {}): Partial<TopoViewerState> & {
  schemaData?: unknown;
  dockerImages?: string[];
  annotations?: TopologyAnnotations;
} {
  return {
    elements: options.elements || sampleElements,
    labName: 'dev-topology',
    mode: options.mode || 'edit',
    deploymentState: options.deploymentState || 'undeployed',
    isLocked: false, // Always unlocked in dev mode
    customNodes: sampleCustomNodes,
    defaultNode: 'SRLinux Latest',
    // Include sample annotations by default in dev mode
    annotations: options.includeAnnotations !== false ? sampleAnnotations : undefined,
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
    text: 'Spine Layer',
    position: { x: 300, y: 40 },
    fontSize: 16,
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
    text: 'Leaf Layer',
    position: { x: 300, y: 190 },
    fontSize: 14,
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
    text: 'Client Endpoints',
    position: { x: 300, y: 340 },
    fontSize: 12,
    fontColor: '#f59e0b',
    backgroundColor: 'transparent',
    fontWeight: 'normal',
    fontStyle: 'italic',
    textDecoration: 'none',
    textAlign: 'center',
    fontFamily: 'sans-serif',
    rotation: 0,
    roundedBackground: false
  },
  {
    id: 'freeText_dev_4',
    text: 'DC West',
    position: { x: 50, y: 500 },
    fontSize: 20,
    fontColor: '#ef4444',
    backgroundColor: 'transparent',
    fontWeight: 'bold',
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'left',
    fontFamily: 'sans-serif',
    rotation: -15,
    roundedBackground: false
  },
  {
    id: 'freeText_dev_5',
    text: 'Management Network',
    position: { x: 550, y: 60 },
    fontSize: 11,
    fontColor: '#6b7280',
    backgroundColor: '#f3f4f6',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'underline',
    textAlign: 'center',
    fontFamily: 'monospace',
    rotation: 0,
    roundedBackground: true
  }
];

/**
 * Sample free shape annotations for development
 */
export const sampleFreeShapeAnnotations: FreeShapeAnnotation[] = [
  // Rectangle around spine layer
  {
    id: 'freeShape_dev_1',
    shapeType: 'rectangle',
    position: { x: 120, y: 60 },
    width: 360,
    height: 100,
    fillColor: '#3b82f6',
    fillOpacity: 0.1,
    borderColor: '#3b82f6',
    borderWidth: 2,
    borderStyle: 'dashed',
    rotation: 0,
    zIndex: -1,
    cornerRadius: 8
  },
  // Rectangle around leaf layer
  {
    id: 'freeShape_dev_2',
    shapeType: 'rectangle',
    position: { x: 70, y: 210 },
    width: 460,
    height: 100,
    fillColor: '#22c55e',
    fillOpacity: 0.1,
    borderColor: '#22c55e',
    borderWidth: 2,
    borderStyle: 'dashed',
    rotation: 0,
    zIndex: -1,
    cornerRadius: 8
  },
  // Circle around client1
  {
    id: 'freeShape_dev_3',
    shapeType: 'circle',
    position: { x: 100, y: 400 },
    width: 80,
    height: 80,
    fillColor: '#f59e0b',
    fillOpacity: 0.15,
    borderColor: '#f59e0b',
    borderWidth: 2,
    borderStyle: 'solid',
    rotation: 0,
    zIndex: -1
  },
  // Circle around client2
  {
    id: 'freeShape_dev_4',
    shapeType: 'circle',
    position: { x: 500, y: 400 },
    width: 80,
    height: 80,
    fillColor: '#f59e0b',
    fillOpacity: 0.15,
    borderColor: '#f59e0b',
    borderWidth: 2,
    borderStyle: 'solid',
    rotation: 0,
    zIndex: -1
  },
  // Decorative line
  {
    id: 'freeShape_dev_5',
    shapeType: 'line',
    position: { x: 50, y: 170 },
    endPosition: { x: 550, y: 170 },
    fillColor: 'transparent',
    fillOpacity: 0,
    borderColor: '#9ca3af',
    borderWidth: 1,
    borderStyle: 'dotted',
    rotation: 0,
    zIndex: -2,
    lineStartArrow: false,
    lineEndArrow: false
  },
  // Arrow pointing to spine layer
  {
    id: 'freeShape_dev_6',
    shapeType: 'line',
    position: { x: 550, y: 85 },
    endPosition: { x: 480, y: 100 },
    fillColor: 'transparent',
    fillOpacity: 0,
    borderColor: '#6b7280',
    borderWidth: 2,
    borderStyle: 'solid',
    rotation: 0,
    zIndex: 0,
    lineStartArrow: false,
    lineEndArrow: true,
    lineArrowSize: 10
  },
  // Large background rectangle
  {
    id: 'freeShape_dev_7',
    shapeType: 'rectangle',
    position: { x: 30, y: 30 },
    width: 540,
    height: 470,
    fillColor: '#1e293b',
    fillOpacity: 0.03,
    borderColor: '#334155',
    borderWidth: 1,
    borderStyle: 'solid',
    rotation: 0,
    zIndex: -10,
    cornerRadius: 16
  }
];

/**
 * Sample group style annotations for development
 */
export const sampleGroupStyleAnnotations: GroupStyleAnnotation[] = [
  {
    id: 'group_spine',
    name: 'Spine',
    level: 'L1',
    position: { x: 130, y: 70 },
    width: 340,
    height: 80,
    color: '#3b82f6',
    backgroundColor: '#3b82f6',
    backgroundOpacity: 0.08,
    borderColor: '#3b82f6',
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: 12,
    labelColor: '#3b82f6',
    labelPosition: 'top-left',
    zIndex: -5
  },
  {
    id: 'group_leaf_west',
    name: 'Leaf West',
    level: 'L2',
    position: { x: 80, y: 220 },
    width: 140,
    height: 80,
    color: '#22c55e',
    backgroundColor: '#22c55e',
    backgroundOpacity: 0.08,
    borderColor: '#22c55e',
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: 10,
    labelColor: '#22c55e',
    labelPosition: 'top-left',
    zIndex: -5
  },
  {
    id: 'group_leaf_east',
    name: 'Leaf East',
    level: 'L2',
    position: { x: 380, y: 220 },
    width: 140,
    height: 80,
    color: '#22c55e',
    backgroundColor: '#22c55e',
    backgroundOpacity: 0.08,
    borderColor: '#22c55e',
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: 10,
    labelColor: '#22c55e',
    labelPosition: 'top-right',
    zIndex: -5
  },
  {
    id: 'group_clients',
    name: 'Clients',
    level: 'L3',
    position: { x: 50, y: 360 },
    width: 500,
    height: 100,
    color: '#f59e0b',
    backgroundColor: '#f59e0b',
    backgroundOpacity: 0.05,
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    labelColor: '#f59e0b',
    labelPosition: 'bottom-center',
    zIndex: -6
  }
];

/**
 * Sample complete annotations object for development
 */
export const sampleAnnotations: TopologyAnnotations = {
  freeTextAnnotations: sampleFreeTextAnnotations,
  freeShapeAnnotations: sampleFreeShapeAnnotations,
  groupStyleAnnotations: sampleGroupStyleAnnotations,
  cloudNodeAnnotations: [],
  nodeAnnotations: sampleElements
    .filter(el => el.group === 'nodes')
    .map(el => ({
      id: el.data.id as string,
      position: el.position,
      interfacePattern: (el.data.kind as string)?.includes('srlinux') ? 'e1-{n}' : 'eth{n}',
      // Assign nodes to groups based on their role
      group: (el.data.id as string).includes('spine') ? 'group_spine' :
             (el.data.id as string).includes('leaf') ? ((el.data.id as string).includes('1') ? 'group_leaf_west' : 'group_leaf_east') :
             'group_clients',
      level: (el.data.id as string).includes('spine') ? 'L1' :
             (el.data.id as string).includes('leaf') ? 'L2' : 'L3'
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
