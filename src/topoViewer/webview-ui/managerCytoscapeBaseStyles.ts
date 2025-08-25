// file: managerCytoscapeBaseStyles.ts

import cytoscape from 'cytoscape';
import { log } from '../logging/logger';
import { generateEncodedSVG, NodeType } from './managerSvgGenerator';
import topoViewerState from '../state';

/**
 * Cytoscape styles shared between view and edit webviews.
 * Additional styles specific to the editor (edge handles, status nodes, etc.)
 * are included as they are harmless for the read-only view.
 */
const cytoscapeStylesBase: any[] = [
  {
    selector: 'core',
    style: {
      'selection-box-color': '#AAD8FF',
      'selection-box-border-color': '#8BB0D0',
      'selection-box-opacity': '0.5'
    }
  },
  {
    selector: 'node.empty-group',
    style: {
      'background-image': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSIjODg4IiAvPjwvc3ZnPg==',
      'background-width': '25px',
      'background-height': '25px',
      'background-position-x': '50%',
      'background-position-y': '50%',
      'background-repeat': 'no-repeat'
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
    selector: 'node[?attr]',
    style: {
      shape: 'rectangle',
      'background-color': '#aaa',
      'text-outline-color': '#aaa',
      width: '10px',
      height: '10px',
      'font-size': '0.67em',
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
      'font-size': '0.67em',
      'z-index': '1'
    }
  },
  {
    selector: 'node[topoViewerRole="group"]',
    style: {}
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
  },
  {
    selector: 'edge:selected',
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
      'font-size': '0.67em',
      'z-index': '1'
    }
  },
  // Encoded SVG backgrounds for different node roles are added programmatically below.
  {
    selector: 'edge',
    style: {
      targetArrowShape: 'none',
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
  {
    selector: '.spf',
    style: {
      opacity: '1',
      'line-color': '#FF0000',
      'line-style': 'solid'
    }
  },
  // Stub link styles for special endpoints
  {
    selector: 'edge.stub-link',
    style: {
      'target-arrow-shape': 'circle',
      'source-arrow-shape': 'circle',
      'target-arrow-color': '#969799',
      'arrow-scale': 0.5,
      'line-style': 'dashed',
      'line-dash-pattern': [6, 3]
    }
  },
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
  // Cloud node styles for network endpoints
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
      content: 'data(name)',
      label: 'data(name)'
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

// Encoded SVG backgrounds for different node roles.
const commonRoleStyle: cytoscape.Css.Node = {
  width: '14',
  height: '14',
  'background-fit': 'cover'
};

const roleSvgMap: Record<string, NodeType> = {
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

const roleStyleOverrides: Record<string, cytoscape.Css.Node> = {
  router: { 'background-clip': 'none' },
  default: { 'background-clip': 'none' }
};

const roleStyles: any[] = Object.entries(roleSvgMap).map(([role, svgId]) => ({
  selector: `node[topoViewerRole="${role}"]`,
  style: {
    ...commonRoleStyle,
    'background-image': generateEncodedSVG(svgId, '#005aff'),
    ...(roleStyleOverrides[role] || {})
  }
}));

// Free text annotation styles
const freeTextStyles = [
  {
    selector: 'node[topoViewerRole="freeText"]',
    style: {
      shape: 'rectangle',
      'background-color': 'transparent',
      'background-opacity': 0,
      'border-width': 0,
      content: 'data(name)',
      'text-wrap': 'wrap',
      'text-max-width': '200px',
      // Default font properties - will be overridden by custom styles
      'font-size': '1.17em',
      'color': '#FFFFFF',
      'text-outline-color': '#000000',
      'text-outline-width': 1,
      'text-background-color': '#000000',
      'text-background-opacity': 0.7,
      'text-background-padding': 3,
      'text-background-shape': 'roundrectangle',
      'text-halign': 'center',
      'text-valign': 'center',
      'z-index': 10,
      width: 'label',
      height: 'label',
      'padding': 2,
      'events': 'yes',
      'text-events': 'yes'
    }
  },
  {
    selector: 'node[topoViewerRole="freeText"]:selected',
    style: {
      'border-width': '1px',
      'border-color': '#007ACC',
      'border-style': 'dashed',
      'background-color': 'rgba(0, 122, 204, 0.1)',
      'background-opacity': 0.1,
      width: 'label',
      height: 'label',
      'padding': 2
    }
  },
  {
    selector: 'node[topoViewerRole="freeText"]:grabbed',
    style: {
      'cursor': 'move'
    }
  }
];

const insertIndex = cytoscapeStylesBase.findIndex((s: any) => s.selector === 'edge');
cytoscapeStylesBase.splice(insertIndex, 0, ...roleStyles, ...freeTextStyles);

/**
 * Returns a cloned Cytoscape style array adjusted for the given theme.
 * When `theme` is "light" group nodes appear darker with higher opacity.
 */
export function getCytoscapeStyles(theme: 'light' | 'dark') {
  const rootStyle = window.getComputedStyle(document.documentElement);
  const selectionColor = rootStyle.getPropertyValue('--vscode-focusBorder').trim();
  const selectionBoxColor = rootStyle.getPropertyValue('--vscode-list-focusBackground').trim();
  const selectionBoxBorderColor = rootStyle.getPropertyValue('--vscode-focusBorder').trim();

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

    // Theme-aware selection styling
    if (def.selector === 'node:selected') {
      clone.style['border-color'] = selectionColor;
      clone.style['overlay-color'] = selectionColor;
      clone.style['border-width'] = '3px';
      clone.style['border-opacity'] = '1';
      clone.style['border-style'] = 'solid';
      clone.style['overlay-opacity'] = '0.3';
      clone.style['overlay-padding'] = '3px';
    }

    if (def.selector === 'edge:selected') {
      clone.style['line-color'] = selectionColor;
      clone.style['target-arrow-color'] = selectionColor;
      clone.style['source-arrow-color'] = selectionColor;
      clone.style['overlay-color'] = selectionColor;
      clone.style['overlay-opacity'] = '0.2';
      clone.style['overlay-padding'] = '6px';
      clone.style['width'] = '4px';
      clone.style['opacity'] = '1';
      clone.style['z-index'] = '10';
    }

    // Theme-aware selection box (for multi-select)
    if (def.selector === 'core') {
      clone.style['selection-box-color'] = selectionBoxColor;
      clone.style['selection-box-border-color'] = selectionBoxBorderColor;
      clone.style['selection-box-opacity'] = '0.5';
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
  const nodeTypesSet = new Set<string>();
  const regex = /node\[topoViewerRole="([^"]+)"\]/;
  const skipList = ['group', 'freeText'];

  for (const styleDef of cytoscapeStylesBase) {
    if (typeof styleDef.selector === 'string') {
      const match = styleDef.selector.match(regex);
      if (match && match[1] && !skipList.includes(match[1])) {
        nodeTypesSet.add(match[1]);
      }
    }
  }

  return Array.from(nodeTypesSet).sort();
}

// Expose globally for external consumers
(globalThis as any).loadCytoStyle = loadCytoStyle;

