/**
 * Cytoscape stylesheet definitions and style builders
 */
import cytoscape from 'cytoscape';
import { generateEncodedSVG, NodeType } from '../../utils/SvgGenerator';

// Style constants to avoid duplication
const DATA_NAME = 'data(name)';
const SELECTION_COLOR = 'var(--vscode-focusBorder, #007ACC)';

/**
 * Role to SVG node type mapping
 */
export const ROLE_SVG_MAP: Record<string, NodeType> = {
  router: 'pe',
  default: 'pe',
  pe: 'pe',
  p: 'pe',
  controller: 'controller',
  pon: 'pon',
  dcgw: 'dcgw',
  leaf: 'leaf',
  switch: 'switch',
  rgw: 'rgw',
  'super-spine': 'super-spine',
  spine: 'spine',
  server: 'server',
  bridge: 'bridge',
  ue: 'ue',
  cloud: 'cloud',
  client: 'client'
};

/**
 * Common style for role-based nodes
 */
const commonRoleStyle = {
  width: '14',
  height: '14',
  'background-fit': 'cover',
  'background-position-x': '50%',
  'background-position-y': '50%',
  'background-repeat': 'no-repeat'
};

/**
 * Generate role-based styles with SVG icons
 */
export function generateRoleStyles(): cytoscape.StylesheetCSS[] {
  const defaultColor = '#005aff';
  return Object.entries(ROLE_SVG_MAP).map(([role, svgId]) => ({
    selector: `node[topoViewerRole="${role}"]`,
    style: {
      ...commonRoleStyle,
      'background-image': generateEncodedSVG(svgId, defaultColor),
      'background-clip': role === 'router' || role === 'default' ? 'none' : undefined
    } as cytoscape.Css.Node
  }));
}

/**
 * Basic Cytoscape styles for nodes and edges
 */
export const cytoscapeStylesBase: cytoscape.StylesheetCSS[] = [
  {
    selector: 'node',
    style: {
      shape: 'rectangle',
      width: '10',
      height: '10',
      content: DATA_NAME,
      label: DATA_NAME,
      'font-size': '0.58em',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'background-color': '#8F96AC',
      'min-zoomed-font-size': '0.58em',
      color: '#F5F5F5',
      'text-outline-color': '#3C3E41',
      'text-outline-width': '0.3px',
      'text-background-color': '#000000',
      'text-background-opacity': 0.7,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': '1px',
      'z-index': '2'
    }
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': '3px',
      'border-color': SELECTION_COLOR,
      'border-opacity': 1,
      'border-style': 'solid',
      'overlay-color': SELECTION_COLOR,
      'overlay-opacity': 0.3,
      'overlay-padding': '3px'
    }
  },
  {
    selector: 'edge',
    style: {
      'target-arrow-shape': 'none',
      'font-size': '0.42em',
      'source-label': 'data(sourceEndpoint)',
      'target-label': 'data(targetEndpoint)',
      'source-text-offset': 20,
      'target-text-offset': 20,
      'arrow-scale': '0.5',
      color: '#000000',
      'text-outline-width': '0.3px',
      'text-outline-color': '#FFFFFF',
      'text-background-color': '#CACBCC',
      'text-opacity': 1,
      'text-background-opacity': 1,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': '1px',
      'curve-style': 'bezier',
      'control-point-step-size': 20,
      opacity: 0.7,
      'line-color': '#969799',
      width: '1.5',
      label: ' ',
      'overlay-padding': '2px'
    }
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': SELECTION_COLOR,
      'target-arrow-color': SELECTION_COLOR,
      'source-arrow-color': SELECTION_COLOR,
      'overlay-color': SELECTION_COLOR,
      'overlay-opacity': 0.2,
      'overlay-padding': '6px',
      width: '4px',
      opacity: 1,
      'z-index': '10'
    }
  },
  {
    selector: 'edge.link-up',
    style: {
      'line-color': '#00df2b'
    }
  },
  {
    selector: 'edge.link-down',
    style: {
      'line-color': '#df2b00'
    }
  },
  // Special endpoint nodes (host, mgmt-net, etc.)
  {
    selector: 'node.special-endpoint',
    style: {
      'background-color': '#E8E8E8',
      'border-width': '1px',
      'border-color': '#969799',
      'background-opacity': 0.9,
      shape: 'round-rectangle',
      width: '14',
      height: '14'
    }
  },
  // Cloud node styles
  {
    selector: 'node[topoViewerRole="cloud"]',
    style: {
      'background-color': '#E8E8E8',
      'border-width': '0px',
      'border-color': '#969799',
      'background-opacity': 0.9,
      shape: 'rectangle',
      width: '14',
      height: '14',
      'font-size': '0.5em',
      content: DATA_NAME,
      label: DATA_NAME
    }
  }
];

/**
 * Complete Cytoscape stylesheet with role-based styles inserted
 */
export const cytoscapeStyles: cytoscape.StylesheetCSS[] = [
  ...cytoscapeStylesBase.slice(0, 4), // core + node styles
  ...generateRoleStyles(),
  ...cytoscapeStylesBase.slice(4) // edge styles and rest
];
