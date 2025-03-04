import cytoscape from 'cytoscape';


/**
 * Loads and applies Cytoscape styles to the provided Cytoscape instance.
 *
 * This method removes existing inline styles, detects the user's color scheme,
 * and applies a predefined set of Cytoscape styles. If not in VS Code deployment,
 * it attempts to load styles from an external JSON file.
 *
 * @param cy - The Cytoscape instance to style.
 */
export default function loadCytoStyle(cy: cytoscape.Core): void {
  try {
    // Remove any existing inline styles.
    cy.nodes().removeStyle();
    cy.edges().removeStyle();

    // Detect the user's preferred color scheme.
    const colorScheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? "dark"
      : "light";
    console.info("The user prefers:", colorScheme);

    // For this example, assume we're in VS Code deployment.
    const isVscodeDeployment = true;
    // For demonstration, assume multi-layer viewport is inactive.
    const multiLayerViewPortState = false;

    // Define a set of Cytoscape styles.
    const cytoscapeStylesForVscode = [
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
          "background-image": generateEncodedSVG("pe", "#005aff"),
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
          "background-fit": "cover"
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
      { selector: "edge.filtered", style: { "opacity": "0" } },
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

    if (isVscodeDeployment) {
      // Apply the predefined VS Code styles.
      cy.style().fromJson(cytoscapeStylesForVscode).update();
      console.info("Cytoscape styles applied successfully.");
    } else {
      // Otherwise, load styles from an external JSON file.
      const styleFile = colorScheme === "light" ? "css/cy-style-light.json" : "css/cy-style-dark.json";
      fetch(styleFile)
        .then((response) => response.json())
        .then((styles) => {
          cy.style().fromJson(styles).update();
          if (multiLayerViewPortState) {
            // Optionally, modify styles for multi-layer viewport.
          }
        })
        .catch((error) => {
          console.error("Failed to load Cytoscape styles from JSON:", error);
        });
    }
  } catch (error) {
    console.error("Error applying Cytoscape styles:", error);
  }
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
                    </svg>`;
      break;
    case "dcgw":  // Data Center Gateway
      svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120px" height="120px" fill="none">
          <style type="text/css">
            .st0 { fill: ${fillColor}; }
            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
          </style>
          <rect width="120" height="120" class="st0"/>
          <g>
            <path d="M93.8,39.8h-10.7c-1.8,0-3-1.3-3.1-3.1V25.9" class="st1"/>
            <path d="M99,21.2L83,37.3" class="st1"/>
          </g>
        </svg>`;
      break;
    case "leaf":  // Leaf Node
      svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120px" height="120px" fill="none">
          <style type="text/css">
            .st0 { fill: ${fillColor}; }
            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
          </style>
          <rect width="120" height="120" class="st0"/>
          <g>
            <path d="M91.5,27.3l7.6,7.6c1.3,1.3,1.3,3.1,0,4.3l-7.6,7.7" class="st1"/>
            <path d="M28.5,46.9l-7.6-7.6c-1.3-1.3-1.3-3.1,0-4.3l7.6-7.7" class="st1"/>
          </g>
        </svg>`;
      break;
    // ... (Add additional cases for "switch", "spine", "super-spine", "server", "pon", "controller", "rgw", "ue", "cloud", "client" as needed)
    default:
      console.warn(`Unknown nodeType: ${nodeType}, using default PE SVG.`);
      svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120px" height="120px" fill="none">
          <style type="text/css">
            .st0 { fill: ${fillColor}; }
            .st1 { fill: none; stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-miterlimit: 10; }
          </style>
          <rect width="120" height="120" class="st0"/>
          <g>
            <path d="M71.7,19.7V48h28" class="st1"/>
            <path d="M91.2,38.5l7.5,7.6c1.3,1.3,1.3,3.1,0,4.3L91.1,58" class="st1"/>
          </g>
        </svg>`;
  }
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgString);
}