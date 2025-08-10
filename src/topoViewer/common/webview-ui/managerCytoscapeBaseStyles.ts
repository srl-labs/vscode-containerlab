// file: managerCytoscapeBaseStyles.ts

import cytoscape from 'cytoscape';
import { log } from '../logging/webviewLogger';
import { generateEncodedSVG } from './managerSvgGenerator';
import topoViewerState from './state';

/**
 * Cytoscape styles shared between view and edit webviews.
 * Additional styles specific to the editor (edge handles, status nodes, etc.)
 * are included as they are harmless for the read-only view.
 */
const cytoscapeStylesBase = [
  {
    selector: 'core',
    style: {
      'selection-box-color': '#AAD8FF',
      'selection-box-border-color': '#8BB0D0',
      'selection-box-opacity': '0.5'
    }
  },
  {
    selector: 'node',
    style: {
      shape: 'rectangle',
      width: '10',
      height: '10',
      content: 'data(name)',
      label: 'data(name)',
      'font-size': '7px',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'background-color': '#8F96AC',
      'min-zoomed-font-size': '7px',
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
    selector: 'node[?attr]',
    style: {
      shape: 'rectangle',
      'background-color': '#aaa',
      'text-outline-color': '#aaa',
      width: '10px',
      height: '10px',
      'font-size': '8px',
      'z-index': '2'
    }
  },
  {
    selector: 'node[?query]',
    style: { 'background-clip': 'none', 'background-fit': 'contain' }
  },
  {
    selector: 'node:parent',
    style: {
      shape: 'rectangle',
      'border-width': '0.5px',
      'border-color': '#DDDDDD',
      'background-color': '#d9d9d9',
      width: '80px',
      height: '80px',
      'background-opacity': '0.2',
      color: '#EBECF0',
      'text-outline-color': '#000000',
      'font-size': '8px',
      'z-index': '1'
    }
  },
  // Alignment for parent nodes
  {
    selector: 'node:parent.top-center',
    style: {
      'text-halign': 'center',
      'text-valign': 'top',
      'text-margin-y': -2
    }
  },
  {
    selector: 'node:parent.top-left',
    style: {
      'text-halign': 'right',
      'text-valign': 'top',
      'text-margin-x': (ele: any) => -ele.outerWidth(),
      'text-margin-y': -2
    }
  },
  {
    selector: 'node:parent.top-right',
    style: {
      'text-halign': 'left',
      'text-valign': 'top',
      'text-margin-x': (ele: any) => ele.outerWidth(),
      'text-margin-y': -2
    }
  },
  {
    selector: 'node:parent.bottom-center',
    style: {
      'text-halign': 'center',
      'text-valign': 'bottom',
      'text-margin-y': 2
    }
  },
  {
    selector: 'node:parent.bottom-left',
    style: {
      'text-halign': 'right',
      'text-valign': 'bottom',
      'text-margin-x': (ele: any) => -ele.outerWidth(),
      'text-margin-y': 2
    }
  },
  {
    selector: 'node:parent.bottom-right',
    style: {
      'text-halign': 'left',
      'text-valign': 'bottom',
      'text-margin-x': (ele: any) => ele.outerWidth(),
      'text-margin-y': 2
    }
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': '1.5px',
      'border-color': '#282828',
      'border-opacity': '0.5',
      'background-color': '#77828C',
      'text-outline-color': '#282828'
    }
  },
  // Status indicator nodes
  {
    selector: 'node[name*="statusGreen"]',
    style: {
      display: 'none',
      shape: 'ellipse',
      label: ' ',
      width: '4',
      height: '4',
      'background-color': '#F5F5F5',
      'border-width': '0.5',
      'border-color': '#00A500'
    }
  },
  {
    selector: 'node[name*="statusRed"]',
    style: {
      display: 'none',
      shape: 'ellipse',
      label: ' ',
      width: '4',
      height: '4',
      'background-color': '#FD1C03',
      'border-width': '0.5',
      'border-color': '#AD0000'
    }
  },
  {
    selector: 'node[topoViewerRole="dummyChild"]',
    style: {
      width: '14',
      height: '14'
    }
  },
  {
    selector: 'node[topoViewerRole="group"]',
    style: {
      shape: 'rectangle',
      'border-width': '0.5px',
      'border-color': '#DDDDDD',
      'background-color': '#d9d9d9',
      width: '80px',
      height: '80px',
      'background-opacity': '0.2',
      color: '#EBECF0',
      'text-outline-color': '#000000',
      'font-size': '8px',
      'z-index': '1'
    }
  },
  // Encoded SVG backgrounds for different node roles.
  {
    selector: 'node[topoViewerRole="router"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('pe', '#005aff'),
      'background-fit': 'cover',
      'background-clip': 'none'
    }
  },
  {
    selector: 'node[topoViewerRole="default"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('pe', '#005aff'),
      'background-fit': 'cover',
      'background-clip': 'none'
    }
  },
  {
    selector: 'node[topoViewerRole="pe"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('pe', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="p"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('pe', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="controller"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('controller', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="pon"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('pon', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="dcgw"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('dcgw', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="leaf"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('leaf', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="switch"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('switch', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="rgw"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('rgw', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="super-spine"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('super-spine', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="spine"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('spine', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="server"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('server', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="bridge"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('bridge', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="ue"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('ue', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="cloud"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('cloud', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'node[topoViewerRole="client"]',
    style: {
      width: '14',
      height: '14',
      'background-image': generateEncodedSVG('client', '#005aff'),
      'background-fit': 'cover'
    }
  },
  {
    selector: 'edge',
    style: {
      targetArrowShape: 'none',
      'font-size': '5px',
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
      opacity: '0.7',
      'line-color': '#969799',
      width: '1.5',
      label: ' ',
      'overlay-padding': '2px'
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
  { selector: 'node.unhighlighted', style: { opacity: '0.2' } },
  { selector: 'edge.unhighlighted', style: { opacity: '0.05' } },
  { selector: '.highlighted', style: { 'z-index': '3' } },
  {
    selector: 'node.highlighted',
    style: {
      'border-width': '7px',
      'border-color': '#282828',
      'border-opacity': '0.5',
      'background-color': '#282828',
      'text-outline-color': '#282828'
    }
  },
  { selector: 'edge.filtered', style: { opacity: '0.3' } },
  {
    selector: '.spf',
    style: {
      opacity: '1',
      'line-color': '#FF0000',
      'line-style': 'solid'
    }
  },
  // Edge handles plugin styles
  {
    selector: '.eh-handle',
    style: {
      'background-color': 'red',
      width: 2,
      height: 2,
      shape: 'ellipse',
      'overlay-opacity': 0,
      'border-width': 2,
      'border-opacity': 0
    }
  },
  {
    selector: '.eh-hover',
    style: {
      'background-color': 'red'
    }
  },
  {
    selector: '.eh-source',
    style: {
      'border-width': 2,
      'border-color': 'red'
    }
  },
  {
    selector: '.eh-target',
    style: {
      'border-width': 2,
      'border-color': 'red'
    }
  },
  {
    selector: '.eh-preview, .eh-ghost-edge',
    style: {
      'background-color': 'red',
      'line-color': 'red',
      'target-arrow-color': 'red',
      'source-arrow-color': 'red'
    }
  },
  {
    selector: '.eh-ghost-edge.eh-preview-active',
    style: {
      opacity: 0
    }
  }
];

/**
 * Returns a cloned Cytoscape style array adjusted for the given theme.
 * When `theme` is "light" group nodes appear darker with higher opacity.
 */
export function getCytoscapeStyles(theme: 'light' | 'dark') {
  const styles = cytoscapeStylesBase.map((def: any) => {
    const clone: any = { selector: def.selector, style: { ...(def.style || {}) } };
    if (def.selector === 'node[topoViewerRole="group"]') {
      if (theme === 'light') {
        clone.style['background-color'] = '#a6a6a6';
        clone.style['background-opacity'] = '0.4';
        clone.style['border-width'] = '0.5px';
        clone.style['border-color'] = '#aaaaaa';
      } else {
        clone.style['background-color'] = '#d9d9d9';
        clone.style['background-opacity'] = '0.2';
      }
    }
    return clone;
  });

  const vis = topoViewerState.linkEndpointVisibility;
  if (typeof vis === 'boolean' && !vis) {
    const edgeStyle = styles.find((s: any) => s.selector === 'edge');
    if (edgeStyle) {
      edgeStyle.style['text-opacity'] = 0;
      edgeStyle.style['text-background-opacity'] = 0;
    }
  }
  return styles;
}

/**
 * Loads and applies Cytoscape styles to the provided Cytoscape instance.
 *
 * This method removes existing inline styles and applies the predefined styles.
 *
 * @param cy - The Cytoscape instance to style.
 */
export default async function loadCytoStyle(
  cy: cytoscape.Core,
  theme?: 'light' | 'dark'
): Promise<void> {
  try {
    cy.nodes().removeStyle();
    cy.edges().removeStyle();

    const engine = topoViewerState.editorEngine;
    const forced = engine?.layoutAlgoManager?.geoTheme;
    const detect = () => {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    };
    const selectedTheme = theme || forced || (engine?.detectColorScheme?.() || detect());
    const styles = getCytoscapeStyles(selectedTheme === 'light' ? 'light' : 'dark');
    cy.style().fromJson(styles).update();
    log.info('Cytoscape styles applied successfully.');

    const layoutMgr = topoViewerState.editorEngine?.layoutAlgoManager;
    if (layoutMgr?.isGeoMapInitialized) {
      layoutMgr.applyGeoScale(true);
    }
  } catch (error) {
    log.error(`Error applying Cytoscape styles: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Extracts node types from the style definitions.
 */
export function extractNodeIcons(): string[] {
  const nodeTypes: string[] = [];
  const regex = /node\[topoViewerRole="([^"]+)"\]/;
  const skipList = ['dummyChild', 'group'];

  for (const styleDef of cytoscapeStylesBase) {
    if (typeof styleDef.selector === 'string') {
      const match = styleDef.selector.match(regex);
      if (match && match[1] && !skipList.includes(match[1])) {
        nodeTypes.push(match[1]);
      }
    }
  }

  return nodeTypes;
}

// Expose globally for external consumers
(globalThis as any).loadCytoStyle = loadCytoStyle;

