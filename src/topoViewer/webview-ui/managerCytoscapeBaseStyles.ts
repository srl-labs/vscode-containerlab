// file: managerCytoscapeBaseStyles.ts

import cytoscape from 'cytoscape';
import { log } from '../logging/logger';
import { labelEndpointManager as labelEndpointManagerSingleton } from '../core/managerRegistry';
import { generateEncodedSVG, NodeType } from './managerSvgGenerator';
import topoViewerState from '../state';

// Common style literals reused several times
const DATA_NAME = 'data(name)';
const SELECTOR_GROUP = 'node[topoViewerRole="group"]';
const STYLE_BACKGROUND_IMAGE = 'background-image' as const;
const STYLE_BACKGROUND_FIT = 'background-fit' as const;
const STYLE_BACKGROUND_POS_X = 'background-position-x' as const;
const STYLE_BACKGROUND_POS_Y = 'background-position-y' as const;
const STYLE_BACKGROUND_REPEAT = 'background-repeat' as const;
const BACKGROUND_CENTER = '50%' as const;
const BACKGROUND_NO_REPEAT = 'no-repeat' as const;
const BACKGROUND_FIT_COVER = 'cover' as const;
const BACKGROUND_FIT_CONTAIN = 'contain' as const;

const GROUP_NODE_STYLE = {
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
};

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
  // Hidden class for base YAML bridge nodes when aliases exist
  {
    selector: 'node.aliased-base-bridge',
    style: {
      display: 'none'
    }
  },
  {
    selector: 'node.empty-group',
    style: {
      [STYLE_BACKGROUND_IMAGE]:
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSIjODg4IiAvPjwvc3ZnPg==',
      'background-width': '25px',
      'background-height': '25px',
      [STYLE_BACKGROUND_POS_X]: BACKGROUND_CENTER,
      [STYLE_BACKGROUND_POS_Y]: BACKGROUND_CENTER,
      [STYLE_BACKGROUND_REPEAT]: BACKGROUND_NO_REPEAT
    }
  },
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
    style: { 'background-clip': 'none', [STYLE_BACKGROUND_FIT]: BACKGROUND_FIT_CONTAIN }
  },
    { selector: 'node:parent', style: GROUP_NODE_STYLE },
  { selector: SELECTOR_GROUP, style: {} },
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
      'text-halign': 'left',
      'text-valign': 'top',
      'text-margin-x': -4,
      'text-margin-y': -2
    }
  },
  {
    selector: 'node:parent.top-right',
    style: {
      'text-halign': 'right',
      'text-valign': 'top',
      'text-margin-x': 4,
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
      'text-halign': 'left',
      'text-valign': 'bottom',
      'text-margin-x': -4,
      'text-margin-y': 2
    }
  },
  {
    selector: 'node:parent.bottom-right',
    style: {
      'text-halign': 'right',
      'text-valign': 'bottom',
      'text-margin-x': 4,
      'text-margin-y': 2
    }
  },
  {
    selector: 'node:selected',
  },
  {
    selector: 'edge:selected',
  },
  {
    selector: '.link-label-highlight-node',
    style: {
      'border-width': '2px',
      'border-style': 'solid',
      'border-color': '#40A6FF',
      'border-opacity': '1',
      'overlay-color': '#40A6FF',
      'overlay-opacity': '0.25',
      'overlay-padding': '6px',
      'z-index': '9'
    }
  },
  {
    selector: '.link-label-highlight-edge',
    style: {
      'line-color': '#40A6FF',
      'target-arrow-color': '#40A6FF',
      'source-arrow-color': '#40A6FF',
      'width': '3px',
      'opacity': '1',
      'overlay-color': '#40A6FF',
      'overlay-opacity': '0.15',
      'overlay-padding': '4px',
      'z-index': '9'
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
    { selector: SELECTOR_GROUP, style: GROUP_NODE_STYLE },
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
      content: DATA_NAME,
      label: DATA_NAME
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
  [STYLE_BACKGROUND_FIT]: BACKGROUND_FIT_COVER,
  [STYLE_BACKGROUND_POS_X]: BACKGROUND_CENTER,
  [STYLE_BACKGROUND_POS_Y]: BACKGROUND_CENTER,
  [STYLE_BACKGROUND_REPEAT]: BACKGROUND_NO_REPEAT
};

const COMMON_ROLE_STYLE_KEYS: (keyof cytoscape.Css.Node)[] = [
  'width',
  'height',
  STYLE_BACKGROUND_FIT,
  STYLE_BACKGROUND_POS_X,
  STYLE_BACKGROUND_POS_Y,
  STYLE_BACKGROUND_REPEAT
];

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

const roleStyleOverrides: Record<string, cytoscape.Css.Node> = {
  router: { 'background-clip': 'none' },
  default: { 'background-clip': 'none' }
};

function getCustomIconForRole(role?: string | null): string | null {
  const normalizedRole = typeof role === 'string' ? role : '';
  const customIcon = getCustomIconMap()[normalizedRole];
  if (typeof customIcon === 'string' && customIcon.length > 0) {
    return customIcon;
  }
  return null;
}

function applyCommonRoleStyle(node: cytoscape.NodeSingular, role?: string): void {
  COMMON_ROLE_STYLE_KEYS.forEach(key => {
    const value = commonRoleStyle[key];
    if (typeof value === 'string' || typeof value === 'number') {
      node.style(key as any, value as any);
    }
  });
  const override = role ? roleStyleOverrides[role] : undefined;
  if (override) {
    Object.entries(override).forEach(([key, value]) => {
      node.style(key as any, value as any);
    });
  }
}

function applyCustomIconLayout(node: cytoscape.NodeSingular): void {
  node.style(STYLE_BACKGROUND_FIT as any, BACKGROUND_FIT_CONTAIN);
  node.style(STYLE_BACKGROUND_POS_X as any, BACKGROUND_CENTER);
  node.style(STYLE_BACKGROUND_POS_Y as any, BACKGROUND_CENTER);
  node.style(STYLE_BACKGROUND_REPEAT as any, BACKGROUND_NO_REPEAT);
}

function resetCustomIconLayout(node: cytoscape.NodeSingular): void {
  node.removeStyle(STYLE_BACKGROUND_FIT as any);
  node.removeStyle(STYLE_BACKGROUND_POS_X as any);
  node.removeStyle(STYLE_BACKGROUND_POS_Y as any);
  node.removeStyle(STYLE_BACKGROUND_REPEAT as any);
}

function applyCustomIconBackground(node: cytoscape.NodeSingular): void {
  node.style('background-color', 'rgba(0, 0, 0, 0)');
  node.style('background-opacity', 0);
}

function resetCustomIconBackground(node: cytoscape.NodeSingular): void {
  node.removeStyle('background-color');
  node.removeStyle('background-opacity');
}

function getCustomIconMap(): Record<string, string> {
  const customIcons = (window as any)?.customIcons;
  if (customIcons && typeof customIcons === 'object') {
    return customIcons as Record<string, string>;
  }
  return {};
}

export function getIconDataUriForRole(role: string, fillColor: string = '#005aff'): string | null {
  const customIcon = getCustomIconForRole(role);
  if (customIcon) {
    return customIcon;
  }
  const nodeType = ROLE_SVG_MAP[role] ?? ROLE_SVG_MAP.default;
  if (!nodeType) {
    return null;
  }
  return generateEncodedSVG(nodeType, fillColor);
}

interface IconStyleOptions {
  cornerRadius?: number | null;
}

export function applyIconColorToNode(
  node: cytoscape.NodeSingular,
  color?: string | null,
  options?: IconStyleOptions,
  preserveDefaultBackground: boolean = false
): void {
  const role = (node.data('topoViewerRole') as string) || 'pe';
  const customIcon = getCustomIconForRole(role);
  if (customIcon) {
    node.removeData('iconColor');
    applyCommonRoleStyle(node, role);
    applyCustomIconLayout(node);
    applyCustomIconBackground(node);
    node.style(STYLE_BACKGROUND_IMAGE, customIcon);
    if (options && Object.prototype.hasOwnProperty.call(options, 'cornerRadius')) {
      applyCornerRadiusStyle(node, options.cornerRadius);
    }
    return;
  }
  resetCustomIconLayout(node);
  resetCustomIconBackground(node);
  const nodeType = ROLE_SVG_MAP[role] ?? ROLE_SVG_MAP.default;
  if (!nodeType) return;

  const normalizedColor = normalizeIconColorValue(color);
  if (normalizedColor) {
    node.style(STYLE_BACKGROUND_IMAGE, generateEncodedSVG(nodeType, normalizedColor));
    node.data('iconColor', normalizedColor);
  } else {
    node.removeData('iconColor');
    if (!preserveDefaultBackground) {
      node.removeStyle(STYLE_BACKGROUND_IMAGE);
    }
  }

  if (options && Object.prototype.hasOwnProperty.call(options, 'cornerRadius')) {
    applyCornerRadiusStyle(node, options.cornerRadius);
  }
}

export function applyCustomIconColors(cy: cytoscape.Core): void {
  cy
    .nodes('node[topoViewerRole != "group"][topoViewerRole != "freeText"]')
    .forEach(node => {
      const color = node.data('iconColor');
      const radius = node.data('iconCornerRadius');
      const hasColor = typeof color === 'string' && color.trim();
      const hasRadius = typeof radius === 'number' && Number.isFinite(radius) && radius > 0;
      const hasCustomIcon = !!getCustomIconForRole(node.data('topoViewerRole'));
      if (hasColor || hasRadius || hasCustomIcon) {
        const options: IconStyleOptions | undefined = hasRadius ? { cornerRadius: radius } : undefined;
        applyIconColorToNode(node, hasColor ? color : undefined, options, !hasColor);
      }
    });
}

function normalizeIconColorValue(color?: string | null): string | null {
  if (typeof color !== 'string') return null;
  const trimmed = color.trim();
  return trimmed ? trimmed : null;
}

function applyCornerRadiusStyle(node: cytoscape.NodeSingular, radiusValue?: number | null): void {
  const radius =
    typeof radiusValue === 'number' && Number.isFinite(radiusValue) ? Math.max(0, radiusValue) : null;
  if (radius !== null && radius > 0) {
    node.style('shape', 'round-rectangle');
    node.style('corner-radius', `${radius}px`);
    node.style('background-clip', 'node');
    node.data('iconCornerRadius', radius);
  } else {
    node.removeStyle('corner-radius');
    node.removeStyle('shape');
    node.removeStyle('background-clip');
    node.removeData('iconCornerRadius');
  }
}

const roleStyles: any[] = Object.entries(ROLE_SVG_MAP).map(([role, svgId]) => ({
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
      content: DATA_NAME,
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
      'padding': 0,
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
      'padding': 0
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
    if (def.selector === SELECTOR_GROUP) {
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

    if (def.selector === '.link-label-highlight-node') {
      clone.style['border-color'] = selectionColor;
      clone.style['overlay-color'] = selectionColor;
    }

    if (def.selector === '.link-label-highlight-edge') {
      clone.style['line-color'] = selectionColor;
      clone.style['target-arrow-color'] = selectionColor;
      clone.style['source-arrow-color'] = selectionColor;
      clone.style['overlay-color'] = selectionColor;
    }

    // Theme-aware selection box (for multi-select)
    if (def.selector === 'core') {
      clone.style['selection-box-color'] = selectionBoxColor;
      clone.style['selection-box-border-color'] = selectionBoxBorderColor;
      clone.style['selection-box-opacity'] = '0.5';
    }

    return clone;
  });

  const edgeStyle = styles.find((s: any) => s.selector === 'edge');
  if (edgeStyle) {
    const mode = topoViewerState.linkLabelMode;
    if (mode === 'show-all') {
      edgeStyle.style['text-opacity'] = 1;
      edgeStyle.style['text-background-opacity'] = 0.7;
    } else {
      edgeStyle.style['text-opacity'] = 0;
      edgeStyle.style['text-background-opacity'] = 0;
    }
  }
  return styles;
}

function prefersDarkTheme(): boolean {
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function resolveThemeOverride(theme?: 'light' | 'dark'): 'light' | 'dark' {
  const engine = topoViewerState.editorEngine;
  const forced = engine?.layoutAlgoManager?.geoTheme;
  if (theme) {
    return theme;
  }
  if (forced) {
    return forced;
  }
  const detected = engine?.detectColorScheme?.();
  if (detected === 'dark' || detected === 'light') {
    return detected;
  }
  return prefersDarkTheme() ? 'dark' : 'light';
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
  theme?: 'light' | 'dark',
  options?: { preserveExisting?: boolean }
): Promise<void> {
  try {
    const preserveExisting = options?.preserveExisting === true;
    if (!preserveExisting) {
      cy.nodes().removeStyle();
      cy.edges().removeStyle();
    }

    const selectedTheme = resolveThemeOverride(theme);
    const styles = getCytoscapeStyles(selectedTheme === 'light' ? 'light' : 'dark');
    cy.style().fromJson(styles).update();
    applyCustomIconColors(cy);
    (window as any).updateTopoGridTheme?.(selectedTheme === 'light' ? 'light' : 'dark');
    labelEndpointManagerSingleton.refreshAfterStyle();
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
      if (match && match[1] && typeof match[1] === 'string' && !skipList.includes(match[1])) {
        // Only add if it's truly a string and not an object
        if (match[1] !== '[object Object]') {
          nodeTypesSet.add(match[1]);
        }
      }
    }
  }

  // Filter out any non-string values that might have snuck in
  const baseIcons = Array.from(nodeTypesSet)
    .filter(item => typeof item === 'string' && item !== '[object Object]')
    .sort();
  const customIcons = Object.keys(getCustomIconMap());
  const merged = new Set<string>([...baseIcons, ...customIcons]);
  return Array.from(merged).sort();
}

// Expose globally for external consumers
(globalThis as any).loadCytoStyle = loadCytoStyle;
