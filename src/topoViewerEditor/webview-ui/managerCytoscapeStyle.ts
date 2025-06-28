// file: managerCytoscapeStyle.ts

import cytoscape from 'cytoscape';

/**
 * Cytoscape styles for VS Code deployment.
 */
const cytoscapeStylesBase = [
  {
    selector: "core",
    style: {
      "selection-box-color": "#AAD8FF",
      "selection-box-border-color": "#8BB0D0",
      "selection-box-opacity": "0.5"
    }
  },
  {
    selector: "node",
    style: {
      "shape": "rectangle",
      "width": "10",
      "height": "10",
      "content": "data(name)",
      "label": "data(name)",
      "font-size": "7px",
      "text-valign": "bottom",
      "text-halign": "center",
      "background-color": "#8F96AC",
      "min-zoomed-font-size": "7px",
      "color": "#F5F5F5",
      "text-outline-color": "#3C3E41",
      "text-outline-width": "0.3px",
      "text-background-color": "#000000",
      "text-background-opacity": 0.7,
      "text-background-shape": "roundrectangle",
      "text-background-padding": "1px",
      "z-index": "2"
    }
  },
  {
    selector: "node[?attr]",
    style: {
      "shape": "rectangle",
      "background-color": "#aaa",
      "text-outline-color": "#aaa",
      "width": "10px",
      "height": "10px",
      "font-size": "8px",
      "z-index": "2"
    }
  },
  {
    selector: "node[?query]",
    style: { "background-clip": "none", "background-fit": "contain" }
  },
  {
    selector: "node:parent",
    style: {
      "shape": "rectangle",
      "border-width": "0.5px",
      "border-color": "#DDDDDD",
      "background-color": "#d9d9d9",
      "width": "80px",
      "height": "80px",
      "background-opacity": "0.2",
      "color": "#EBECF0",
      "text-outline-color": "#000000",
      "font-size": "8px",
      "z-index": "1"
    }
  },
  // Alignment for parent nodes
  {
    selector: "node:parent.top-center",
    style: {
      "text-halign": "center",
      "text-valign": "top",
      "text-margin-y": -2
    }
  },
  {
    selector: "node:parent.top-left",
    style: {
      "text-halign": "right",
      "text-valign": "top",
      "text-margin-x": (ele: any) => -ele.outerWidth(),
      "text-margin-y": -2
    }
  },
  {
    selector: "node:parent.top-right",
    style: {
      "text-halign": "left",
      "text-valign": "top",
      "text-margin-x": (ele: any) => ele.outerWidth(),
      "text-margin-y": -2
    }
  },
  {
    selector: "node:parent.bottom-center",
    style: {
      "text-halign": "center",
      "text-valign": "bottom",
      "text-margin-y": 2
    }
  },
  {
    selector: "node:parent.bottom-left",
    style: {
      "text-halign": "right",
      "text-valign": "bottom",
      "text-margin-x": (ele: any) => -ele.outerWidth(),
      "text-margin-y": 2
    }
  },
  {
    selector: "node:parent.bottom-right",
    style: {
      "text-halign": "left",
      "text-valign": "bottom",
      "text-margin-x": (ele: any) => ele.outerWidth(),
      "text-margin-y": 2
    }
  },
  {
    selector: "node:selected",
    style: {
      "border-width": "1.5px",
      "border-color": "#282828",
      "border-opacity": "0.5",
      "background-color": "#77828C",
      "text-outline-color": "#282828"
    }
  },
  {
    selector: 'node[name*="statusGreen"]',
    style: {
      "display": "none",
      "shape": "ellipse",
      "label": " ",
      "width": "4",
      "height": "4",
      "background-color": "#F5F5F5",
      "border-width": "0.5",
      "border-color": "#00A500"
    }
  },
  {
    selector: 'node[name*="statusRed"]',
    style: {
      "display": "none",
      "shape": "ellipse",
      "label": " ",
      "width": "4",
      "height": "4",
      "background-color": "#FD1C03",
      "border-width": "0.5",
      "border-color": "#AD0000"
    }
  },
  {
    "selector": 'node[topoViewerRole="dummyChild"]',
    "style": {
      "width": "14",
      "height": "14",
    }
  },
  {
    "selector": 'node[topoViewerRole="group"]',
    "style": {
      "shape": "rectangle",
      "border-width": "0.5px",
      "border-color": "#DDDDDD",
      "background-color": "#d9d9d9",
      "width": "80px",
      "height": "80px",
      "background-opacity": "0.2",
      "color": "#EBECF0",
      "text-outline-color": "#000000",
      "font-size": "8px",
      "z-index": "1"
    }
  },
  // Encoded SVG backgrounds for different node roles.
  {
    selector: 'node[topoViewerRole="router"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("pe", "#005aff"),
      "background-fit": "cover",
      "background-clip": "none"
    }
  },
  {
    selector: 'node[topoViewerRole="default"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("pe", "#005aff"),
      "background-fit": "cover",
      "background-clip": "none"
    }
  },
  {
    selector: 'node[topoViewerRole="pe"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("pe", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="p"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("pe", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="controller"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("controller", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="pon"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("pon", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="dcgw"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("dcgw", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="leaf"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("leaf", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="switch"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("switch", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="rgw"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("rgw", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="super-spine"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("super-spine", "#005AFF"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="spine"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("spine", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="server"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("server", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="bridge"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("bridge", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="ue"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("ue", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="cloud"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("cloud", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: 'node[topoViewerRole="client"]',
    style: {
      "width": "14",
      "height": "14",
      "background-image": generateEncodedSVG("client", "#005aff"),
      "background-fit": "cover"
    }
  },
  {
    selector: "edge",
    style: {
      "targetArrowShape": "none",
      "font-size": "5px",
      "source-label": "data(sourceEndpoint)",
      "target-label": "data(targetEndpoint)",
      "source-text-offset": 20,
      "target-text-offset": 20,
      "arrow-scale": "0.5",
      "color": "#000000",
      "text-outline-width": "0.3px",
      "text-outline-color": "#FFFFFF",
      "text-background-color": "#CACBCC",
      "text-opacity": 1,
      "text-background-opacity": 1,
      "text-background-shape": "roundrectangle",
      "text-background-padding": "1px",
      "curve-style": "bezier",
      "control-point-step-size": 20,
      "opacity": "0.7",
      "line-color": "#969799",
      "width": "1.5",
      "label": " ",
      "overlay-padding": "2px"
    }
  },
  { selector: "node.unhighlighted", style: { "opacity": "0.2" } },
  { selector: "edge.unhighlighted", style: { "opacity": "0.05" } },
  { selector: ".highlighted", style: { "z-index": "3" } },
  {
    selector: "node.highlighted",
    style: {
      "border-width": "7px",
      "border-color": "#282828",
      "border-opacity": "0.5",
      "background-color": "#282828",
      "text-outline-color": "#282828"
    }
  },
  { selector: "edge.filtered", style: { "opacity": "0.3" } },
  {
    selector: ".spf",
    style: {
      "opacity": "1",
      "line-color": "#FF0000",
      "line-style": "solid"
    }
  },
  {
    selector: ".eh-handle",
    style: {
      "background-color": "red",
      "width": 2,
      "height": 2,
      "shape": "ellipse",
      "overlay-opacity": 0,
      "border-width": 2,
      "border-opacity": 0
    }
  },
  {
    selector: ".eh-hover",
    style: {
      "background-color": "red"
    }
  },
  {
    selector: ".eh-source",
    style: {
      "border-width": 2,
      "border-color": "red"
    }
  },
  {
    selector: ".eh-target",
    style: {
      "border-width": 2,
      "border-color": "red"
    }
  },
  {
    selector: ".eh-preview, .eh-ghost-edge",
    style: {
      "background-color": "red",
      "line-color": "red",
      "target-arrow-color": "red",
      "source-arrow-color": "red"
    }
  },
  {
    selector: ".eh-ghost-edge.eh-preview-active",
    style: {
      "opacity": 0
    }
  }
];

/**
 * Returns a cloned Cytoscape style array adjusted for the given theme.
 * When `theme` is "light" group nodes appear darker with higher opacity.
 */
export function getCytoscapeStyles(theme: 'light' | 'dark') {
  return cytoscapeStylesBase.map((def: any) => {
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
}

/**
 * Loads and applies Cytoscape styles to the provided Cytoscape instance.
 *
 * This method removes existing inline styles and applies the predefined VS Code styles.
 *
 * @param cy - The Cytoscape instance to style.
 */
export default async function loadCytoStyle(
  cy: cytoscape.Core,
  theme?: 'light' | 'dark'
): Promise<void> {
  try {
    // Remove any existing inline styles.
    cy.nodes().removeStyle();
    cy.edges().removeStyle();

    const engine = (window as any).topoViewerEditorEngine;
    const forced = engine?.layoutAlgoManager?.geoTheme;
    const selectedTheme = theme || forced || (engine?.detectColorScheme?.() || 'light');
    const styles = getCytoscapeStyles(selectedTheme === 'light' ? 'light' : 'dark');
    cy.style().fromJson(styles).update();
    console.info("Cytoscape styles applied successfully.");

    const layoutMgr = (window as any).topoViewerEditorEngine?.layoutAlgoManager;
    if (layoutMgr?.isGeoMapInitialized) {
      layoutMgr.applyGeoScale(true);
    }
  } catch (error) {
    console.error("Error applying Cytoscape styles:", error);
  }
}

/**
 * Extracts node types from an array of Cytoscape style definitions.
 *
 * This function looks for selectors matching the pattern:
 *   node[topoViewerRole="someType"]
 * and returns an array of node types (e.g., "router", "default", "pe", etc.).
 *
 * Node types with topoViewerRole set to "dummyChild" or "group" are excluded.
 *
 * @returns An array of extracted node types, excluding "dummyChild" and "group".
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



/**
 * Generates an encoded SVG string to be used as a background image in Cytoscape.
 *
 * @param nodeType - The type of the node (e.g., "pe", "dcgw", "leaf", etc.).
 * @param fillColor - The fill color to use in the SVG.
 * @returns The encoded SVG string.
 */
function generateEncodedSVG(nodeType: string, fillColor: string): string {
  let svgString = "";
  switch (nodeType) {
    case "pe":  // Provider Edge Router
      svgString = `
                <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <g>
                                <path d="M71.7,19.7V48h28" class="st1" />
                                <path d="M91.2,38.5l7.5,7.6c1.3,1.3,1.3,3.1,0,4.3L91.1,58" class="st1" />
                            </g>
                            <g>
                                <path d="M20,47.8h28.4v-28" class="st1" />
                                <path d="M38.8,28.3l7.6-7.5c1.3-1.3,3.1-1.3,4.3,0l7.7,7.6" class="st1" />
                            </g>
                            <g>
                                <path d="M48,100.3V72H20" class="st1" />
                                <path d="M28.5,81.5L21,73.9c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M100,71.9H71.6v28" class="st1" />
                                <path d="M81.2,91.4l-7.6,7.5c-1.3,1.3-3.1,1.3-4.3,0l-7.7-7.6" class="st1" />
                            </g>
                        </g>
                    </svg>`
      break;

    case "dcgw":  // Leaf Node
      svgString = `
                <svg
                    xmlns:xlink="http://www.w3.org/1999/xlink"
                    xmlns="http://www.w3.org/2000/svg"
                    xml:space="preserve"
                    style="enable-background:new 0 0 120 120;"
                    viewBox="0 0 120 120"
                    y="0px"
                    x="0px"
                    id="Layer_1"
                    version="1.1"
                    width="120px"
                    height="120px"
                    fill="none"
                >
                    <style type="text/css">
                        .st0 { fill: ${fillColor}; }
                        .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                    </style>
                    <rect height="120" width="120" class="st0" />
                    <g>
                        <g>
                            <path d="M93.8,39.8h-10.7c-1.8,0-3-1.3-3.1-3.1V25.9" class="st1" />
                            <path d="M99,21.2L83,37.3" class="st1" />
                        </g>
                        <g>
                            <path d="M19.9,33.9V23.2c0-1.8,1.3-3,3.1-3.1h10.8" class="st1" />
                            <path d="M38.9,39L22.8,22.9" class="st1" />
                        </g>
                        <g>
                            <path d="M24.9,80.9h10.7c1.8,0,3,1.3,3.1,3.1v10.8" class="st1" />
                            <path d="M19.9,99.8L36,83.8" class="st1" />
                        </g>
                        <g>
                            <path d="M100,86v10.7c0,1.8-1.3,3-3.1,3.1h-10.8" class="st1" />
                            <path d="M81.1,81L97.1,97" class="st1" />
                        </g>
                        <g>
                            <line x1="100.1" y1="50" x2="20.1" y2="50" class="st1" />
                            <line x1="100.1" y1="60" x2="20.1" y2="60" class="st1" />
                            <line x1="100.1" y1="70" x2="20.1" y2="70" class="st1" />
                        </g>
                    </g>
                </svg>
            `;
      break;

    case "leaf":  // Leaf Node
      svgString = `
                    <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <g>
                                <path d="M91.5,27.3l7.6,7.6c1.3,1.3,1.3,3.1,0,4.3l-7.6,7.7" class="st1" />
                                <path d="M28.5,46.9l-7.6-7.6c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M91.5,73.1l7.6,7.6c1.3,1.3,1.3,3.1,0,4.3l-7.6,7.7" class="st1" />
                                <path d="M28.5,92.7l-7.6-7.6c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M96.6,36.8H67.9l-16,45.9H23.2" class="st1" />
                                <path d="M96.6,82.7H67.9l-16-45.9H23.2" class="st1" />
                            </g>
                        </g>
                    </svg>

                `;
      break;

    case "switch":  // Leaf Node
      svgString = `
                    <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <g>
                                <path d="M91.5,27.3l7.6,7.6c1.3,1.3,1.3,3.1,0,4.3l-7.6,7.7" class="st1" />
                                <path d="M28.5,46.9l-7.6-7.6c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M91.5,73.1l7.6,7.6c1.3,1.3,1.3,3.1,0,4.3l-7.6,7.7" class="st1" />
                                <path d="M28.5,92.7l-7.6-7.6c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M96.6,36.8H67.9l-16,45.9H23.2" class="st1" />
                                <path d="M96.6,82.7H67.9l-16-45.9H23.2" class="st1" />
                            </g>
                        </g>
                    </svg>

                `;
      break;

    case "spine":  // Spine Node
      svgString = `
                    <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <g>
                                <path d="M98,30.1H68L52,89.9H22" class="st1" />
                                <path d="M28,100l-7-8.1c-1.3-1.3-1.3-3.1,0-4.3l7-7.6" class="st1" />
                                <path d="M92,20l7,8.1c1.3,1.3,1.3,3.1,0,4.3L92,40" class="st1" />
                            </g>
                            <g>
                                <path d="M98,89.9H64" class="st1" />
                                <path d="M92,80l7,7.6c1.3,1.3,1.3,3.1,0,4.3l-7,8.1" class="st1" />
                            </g>
                            <g>
                                <path d="M56,30.1H22" class="st1" />
                                <path d="M28,40l-7-7.6c-1.3-1.3-1.3-3.1,0-4.3l7-8.1" class="st1" />
                            </g>
                            <g>
                                <line x1="100" y1="60" x2="72" y2="60" class="st1" />
                                <line x1="20" y1="60" x2="48" y2="60" class="st1" />
                            </g>
                        </g>
                    </svg>
                `;
      break;

    case "super-spine":  // Super Spine Router
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill: ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <g>
                                <g>
                                    <path d="M98,30.1H68L52,89.9H22" class="st1" />
                                    <path d="M28,100l-7-8.1c-1.3-1.3-1.3-3.1,0-4.3l7-7.6" class="st1" />
                                    <path d="M92,20l7,8.1c1.3,1.3,1.3,3.1,0,4.3L92,40" class="st1" />
                                </g>
                                <g>
                                    <path d="M98,89.9H64" class="st1" />
                                    <path d="M92,80l7,7.6c1.3,1.3,1.3,3.1,0,4.3l-7,8.1" class="st1" />
                                </g>
                                <g>
                                    <path d="M56,30.1H22" class="st1" />
                                    <path d="M28,40l-7-7.6c-1.3-1.3-1.3-3.1,0-4.3l7-8.1" class="st1" />
                                </g>
                                <g>
                                    <line x1="100" y1="60" x2="72" y2="60" class="st1" />
                                    <line x1="20" y1="60" x2="48" y2="60" class="st1" />
                                </g>
                            </g>
                        </svg>
                    `;
      break;

    case "server":  // Server
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill: ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <g>
                                <path d="M84.9,95H35.1c-1.1,0-2-0.9-2-2V27c0-1.1,0.9-2,2-2h49.7c1.1,0,2,0.9,2,2V93C86.9,94.1,86,95,84.9,95z" class="st1" />
                                <line x1="35.1" y1="41.3" x2="78.7" y2="41.3" class="st1" />
                                <line x1="35.1" y1="78.7" x2="78.7" y2="78.7" class="st1" />
                                <line x1="35.1" y1="66.2" x2="78.7" y2="66.2" class="st1" />
                                <line x1="35.1" y1="53.8" x2="78.7" y2="53.8" class="st1" />
                            </g>
                        </svg>

                    `;
      break;

    case "pon":  // Pon
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill: ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                                .st2 { fill: #FFFFFF; stroke: #FFFFFF; stroke-width: 4; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <g>
                                <polyline points="20.9,20 97,60 20.9,100" class="st1" />
                                <line x1="20.9" y1="60" x2="73.8" y2="60" class="st1" />
                                <circle cx="95.1" cy="60" r="3" class="st2" />
                            </g>
                        </svg>


                    `;
      break;

    case "controller":  // controller
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill: ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <g>
                                <g>
                                    <path
                                        d="M82.8,60c0,12.6-10.2,22.8-22.8,22.8S37.2,72.6,37.2,60S47.4,37.2,60,37.2c6.3,0,12,2.6,16.2,6.7
                                        C80.2,48.1,82.8,53.8,82.8,60z"
                                        class="st1"
                                    />
                                    <g>
                                        <path d="M92.4,27.8l6.7,7.2c1.2,1.2,1.2,2.9,0,4.1l-6.7,7.7" class="st1" />
                                        <line x1="59.8" y1="37.2" x2="97.9" y2="37.2" class="st1" />
                                    </g>
                                </g>
                                <g>
                                    <path d="M27.6,92.2L20.9,85c-1.2-1.2-1.2-2.9,0-4.1l6.7-7.7" class="st1" />
                                    <line x1="60.2" y1="82.8" x2="22.1" y2="82.8" class="st1" />
                                </g>
                            </g>
                        </svg>

                    `;
      break;

    case "rgw":  // Resindential Gateway
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill:  ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                                .st2 { fill: #FFFFFF; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <path d="M60,74.9c0.8,0,1.5-0.7,1.5-1.5c0-0.8-0.7-1.5-1.5-1.5c-0.8,0-1.5,0.7-1.5,1.5C58.5,74.2,59.2,74.9,60,74.9z" class="st2" />
                            <path d="M46.8,54.6c7.5-7.5,20-7.5,27.5,0" class="st1" />
                            <path d="M53.7,63.9c3.8-3.8,10-3.8,13.8,0" class="st1" />
                            <g>
                                <path d="M17,55.6l37.7-36.5c3.1-3,8.1-3,11.2,0L103,55.7" class="st1" />
                                <path d="M29.9,63.8v31.2c0,4.4,3.6,8,8,8h17.9c2.4,0,4.3-1.9,4.3-4.3v-8.5" class="st1" />
                                <path d="M90.3,63.8v31.2c0,4.4-3.6,8-8,8h-8.5" class="st1" />
                            </g>
                        </svg>
                    `;
      break;

    case "ue":  // User Equipment
      svgString = `
                  <svg
                          xmlns:xlink="http://www.w3.org/1999/xlink"
                          xmlns="http://www.w3.org/2000/svg"
                          xml:space="preserve"
                          style="enable-background:new 0 0 120 120;"
                          viewBox="0 0 120 120"
                          y="0px"
                          x="0px"
                          id="Layer_1"
                          version="1.1"
                          width="120px"
                          height="120px"
                          fill="none"
                      >
                          <style type="text/css">
                              .st0 { fill: ${fillColor}; }
                              .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                          </style>
                          <rect height="120" width="120" class="st0" />
                          <g>
                              <path
                                  class="st1"
                                  d="M54,83.8h11.9 M36.2,28.3c0-3.6,2.4-6.9,6.4-7.8c0.4-0.1,0.9-0.1,1.3-0.1h32.1c0.4,0,0.9,0,1.3,0.1
                                    c3.9,0.9,6.4,4.2,6.4,7.8l0,63.6c0,0.4,0,0.9-0.1,1.3c-0.9,3.9-4.2,6.4-7.8,6.4l-31.9,0c-0.4,0-0.9,0-1.3-0.1
                                    c-3.9-0.9-6.4-4.2-6.4-7.8V28.3z"
                              />
                          </g>
                      </svg>
                    `;
      break;

    case "cloud":
      svgString = `
                    <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <path
                                class="st1"
                                d="M20,70.9c0.6,8,7.8,14.6,16.2,14.6h42.9c7.1,0,13.9-3.6,17.8-9.5c7.8-11.6,0-28.6-13.9-30.8
                                c-1.9-0.2-3.5-0.2-5.4,0l-2,0.2c-1.5,0.2-3-0.5-3.7-2c-3.2-5.8-9.8-9.6-17.3-8.7c-7.8,0.9-15.1,7.2-15.1,14.9v1.3
                                c0,2-1.7,3.6-3.7,3.6h-0.2C26.7,54.5,19.4,62,20,70.9z"
                            />
                        </g>
                    </svg>
                    `;
      break;

    case "client":
      svgString = `
                        <svg
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            xmlns="http://www.w3.org/2000/svg"
                            xml:space="preserve"
                            style="enable-background:new 0 0 120 120;"
                            viewBox="0 0 120 120"
                            y="0px"
                            x="0px"
                            id="Layer_1"
                            version="1.1"
                            width="120px"
                            height="120px"
                            fill="none"
                        >
                            <style type="text/css">
                                .st0 { fill: ${fillColor}; }
                                .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                            </style>
                            <rect height="120" width="120" class="st0" />
                            <g>
                                <path
                                    class="st1"
                                    d="M100,91.1H20H100z M89.1,32.5c0-0.5,0-1-0.2-1.4c-0.2-0.5-0.4-0.9-0.8-1.2
                                    c-0.3-0.3-0.8-0.6-1.2-0.8c-0.5-0.2-0.9-0.2-1.4-0.2H34.6c-0.5,0-1,0-1.4,0.2
                                    c-0.5,0.2-0.9,0.4-1.2,0.8c-0.3,0.3-0.6,0.8-0.8,1.2c-0.2,0.5-0.2,0.9-0.2,1.4V76h58.2V32.5z"
                                />
                            </g>
                        </svg>

                    `;
      break;

    default:
      console.warn(`Unknown nodeType: ${nodeType}, using default PE SVG.`);
      svgString = `
                <svg
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                        xmlns="http://www.w3.org/2000/svg"
                        xml:space="preserve"
                        style="enable-background:new 0 0 120 120;"
                        viewBox="0 0 120 120"
                        y="0px"
                        x="0px"
                        id="Layer_1"
                        version="1.1"
                        width="120px"
                        height="120px"
                        fill="none"
                    >
                        <style type="text/css">
                            .st0 { fill: ${fillColor}; }
                            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
                        </style>
                        <rect height="120" width="120" class="st0" />
                        <g>
                            <g>
                                <path d="M71.7,19.7V48h28" class="st1" />
                                <path d="M91.2,38.5l7.5,7.6c1.3,1.3,1.3,3.1,0,4.3L91.1,58" class="st1" />
                            </g>
                            <g>
                                <path d="M20,47.8h28.4v-28" class="st1" />
                                <path d="M38.8,28.3l7.6-7.5c1.3-1.3,3.1-1.3,4.3,0l7.7,7.6" class="st1" />
                            </g>
                            <g>
                                <path d="M48,100.3V72H20" class="st1" />
                                <path d="M28.5,81.5L21,73.9c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1" />
                            </g>
                            <g>
                                <path d="M100,71.9H71.6v28" class="st1" />
                                <path d="M81.2,91.4l-7.6,7.5c-1.3,1.3-3.1,1.3-4.3,0l-7.7-7.6" class="st1" />
                            </g>
                        </g>
                    </svg>`;
  }
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgString);
}