// Import all required libraries and make them available globally

// Import core dependencies
import cytoscape from 'cytoscape';
import $ from 'jquery';
import _ from 'lodash';
import L from 'leaflet';
import hljs from 'highlight.js';
import tippy from 'tippy.js';
import { createPopper } from '@popperjs/core';
import { log } from '../../common/logging/webviewLogger';

// Import Cytoscape extensions
import cytoscapeCola from 'cytoscape-cola';
import cytoscapePopper from 'cytoscape-popper';
import cytoscapeGridGuide from 'cytoscape-grid-guide';
import cytoscapeEdgehandles from 'cytoscape-edgehandles';
import cytoscapeExpandCollapse from 'cytoscape-expand-collapse';
import cytoscapeSvg from 'cytoscape-svg';
import cytoscapeLeaflet from 'cytoscape-leaf';
// Note: cytoscape-node-edge-html-label is not imported as it may have compatibility issues

// Import styles
import 'leaflet/dist/leaflet.css';
import 'highlight.js/styles/atom-one-dark.css';
import 'tippy.js/dist/tippy.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

// Make cytoscape available globally first (required by some extensions)
window.cytoscape = cytoscape;

// Register Cytoscape extensions with error handling
try {
  cytoscape.use(cytoscapeCola);
  log.info('cytoscapeCola registered');
} catch (e) {
  log.error(`Failed to register cytoscapeCola: ${e}`);
}

try {
  cytoscape.use(cytoscapePopper(createPopper));
  log.info('cytoscapePopper registered');
} catch (e) {
  log.error(`Failed to register cytoscapePopper: ${e}`);
}

try {
  cytoscape.use(cytoscapeGridGuide);
  log.info('cytoscapeGridGuide registered');
} catch (e) {
  log.error(`Failed to register cytoscapeGridGuide: ${e}`);
}

try {
  cytoscape.use(cytoscapeEdgehandles);
  log.info('cytoscapeEdgehandles registered');
} catch (e) {
  log.error(`Failed to register cytoscapeEdgehandles: ${e}`);
}

try {
  cytoscape.use(cytoscapeExpandCollapse);
  log.info('cytoscapeExpandCollapse registered');
} catch (e) {
  log.error(`Failed to register cytoscapeExpandCollapse: ${e}`);
}

try {
  cytoscape.use(cytoscapeSvg);
  log.info('cytoscapeSvg registered');
} catch (e) {
  log.error(`Failed to register cytoscapeSvg: ${e}`);
}

try {
  cytoscape.use(cytoscapeLeaflet);
  log.info('cytoscapeLeaflet registered');
} catch (e) {
  log.error(`Failed to register cytoscapeLeaflet: ${e}`);
}

// Make other libraries available globally for backward compatibility
window.$ = $;
window.jQuery = $;
window._ = _;
window.L = L;
window.hljs = hljs;
window.tippy = tippy;
window.Popper = { createPopper };
window.cytoscapePopper = cytoscapePopper;

// Log to verify libraries are loaded
log.info(
  `TopoViewer libraries loaded: ${JSON.stringify({
    cytoscape: typeof cytoscape,
    jquery: typeof $,
    lodash: typeof _,
    leaflet: typeof L,
  })}`
);

// Export for ES6 modules
export { cytoscape, $, _, L, hljs, tippy, createPopper };