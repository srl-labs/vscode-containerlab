// file: managerCytoscapeFetchAndLoad.ts
import cytoscape from 'cytoscape';
import { VscodeMessageSender } from './managerVscodeWebview';
import { log } from '../logging/logger';
import { perfMark, perfMeasure } from '../utilities/performanceMonitor';
import { assignMissingLatLngToElements } from '../utilities/geoUtils';
import { applyCustomIconColors } from './managerCytoscapeBaseStyles';

interface FetchOptions {
  incremental?: boolean;
}


/**
 * Interface representing an item in the input data array.
 */
export interface DataItem {
  data: {
    id?: string;
    lat?: string;
    lng?: string;
    [key: string]: any;
  };
}

const INITIAL_POSITION_START = { x: 105, y: 105 };
const INITIAL_POSITION_SPACING = { x: 98, y: 98 };
// Selector to exclude free text and free shape nodes from layouts
const SELECTOR_NOT_FREETEXT = '[topoViewerRole="freeText"], [topoViewerRole="freeShape"]' as const;


function allNodesOverlap(cy: cytoscape.Core): boolean {
  const nodes = cy.nodes();
  if (nodes.length <= 1) {
    return false;
  }
  const firstPos = nodes.first().position();
  return nodes.every((node) => {
    const n = node as cytoscape.NodeSingular;
    const pos = n.position();
    return (
      Number.isFinite(pos.x) &&
      Number.isFinite(pos.y) &&
      pos.x === firstPos.x &&
      pos.y === firstPos.y
    );
  });
}

function getInitialPosition(index: number, cols: number): { x: number; y: number } {
  const row = Math.floor(index / cols);
  const col = index % cols;
  return {
    x: INITIAL_POSITION_START.x + col * INITIAL_POSITION_SPACING.x,
    y: INITIAL_POSITION_START.y + row * INITIAL_POSITION_SPACING.y
  };
}

function chooseInitialLayout(cy: cytoscape.Core, overlap: boolean): cytoscape.Layouts {
  if (overlap) {
    const nodeCount = cy.nodes().length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
    let index = 0;

    cy.nodes().forEach((node) => {
      const pos = getInitialPosition(index, cols);
      node.position(pos);
      index++;
    });

    return cy.layout({
      name: 'preset',
      animate: false,
      fit: false
    } as any);
  }

  return cy.layout({
    name: 'preset',
    animate: false,
    fit: false
  } as any);
}

function fitViewportAfterLayout(cy: cytoscape.Core): void {
  if (cy.elements().length === 0) {
    return;
  }
  if (typeof requestAnimationFrame !== 'undefined') {
    // eslint-disable-next-line no-undef
    requestAnimationFrame(() => {
      cy.fit(cy.elements(), 50);
      log.debug('Viewport fitted after initial render frame');
    });
  } else {
    cy.fit(cy.elements(), 50);
    log.debug('Viewport fitted immediately (no RAF available)');
  }
}

function loadFreeTextAnnotations(): void {
  const freeTextManager = (window as any).topologyWebviewController?.freeTextManager;
  if (freeTextManager) {
    freeTextManager.loadAnnotations().catch((error: any) => {
      log.error(`Failed to load free text annotations: ${error}`);
    });
  }
}

function loadFreeShapeAnnotations(): void {
  const freeShapesManager = (window as any).topologyWebviewController?.freeShapesManager;
  if (freeShapesManager) {
    freeShapesManager.loadAnnotations().catch((error: any) => {
      log.error(`Failed to load free shape annotations: ${error}`);
    });
  }
}

function loadElementsIntoCytoscape(cy: cytoscape.Core, elementsToAdd: any[], incremental: boolean): void {
  if (incremental) {
    applyElementsIncrementally(cy, elementsToAdd);
    return;
  }
  cy.json({ elements: [] });

  // Separate parents and children
  const parents = elementsToAdd.filter((el: any) => el.group === 'nodes' && el.data?.topoViewerRole === 'group');
  const children = elementsToAdd.filter((el: any) => el.group === 'nodes' && el.data?.parent);
  const others = elementsToAdd.filter((el: any) => !parents.includes(el) && !children.includes(el));

  // Add parents first, then children, then others
  cy.add(parents);
  cy.add(children);
  cy.add(others);
}

function scheduleImprovedLayout(cy: cytoscape.Core): void {
  const scheduleLayout = (callback: () => void) => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(callback, { timeout: 500 });
    } else {
      setTimeout(callback, 200);
    }
  };

  scheduleLayout(() => {
    // Exclude free text nodes from layout - they have their own positions
    const layoutNodes = cy.nodes().not(SELECTOR_NOT_FREETEXT);

    const nodeWeights: Record<string, number> = {};
    layoutNodes.forEach((node) => {
      const level = parseInt(node.data('extraData')?.labels?.TopoViewerGroupLevel || '1', 10);
      nodeWeights[node.id()] = 1 / level;
    });

    cy.edges().forEach((edge) => {
      edge.style({ 'curve-style': 'bezier', 'control-point-step-size': 20 });
    });

    // Run layout only on non-freetext nodes
    const improvedLayout = layoutNodes.layout({
      name: 'cola',
      fit: true,
      nodeSpacing: 5,
      edgeLength: (edge: cytoscape.EdgeSingular) => {
        const s = nodeWeights[edge.source().id()] || 1;
        const t = nodeWeights[edge.target().id()] || 1;
        return 100 / (s + t);
      },
      edgeSymDiffLength: 10,
      nodeDimensionsIncludeLabels: true,
      animate: true,
      animationDuration: 500,
      maxSimulationTime: 1000,
      avoidOverlap: true,
      randomize: false
    } as any);
    improvedLayout.run();
  });
}

function normalizeClasses(classes: any): string | undefined {
  if (!classes) {
    return undefined;
  }
  if (typeof classes === 'string') {
    return classes;
  }
  if (Array.isArray(classes)) {
    return classes.filter((item) => typeof item === 'string' && item).join(' ');
  }
  return undefined;
}

function applyElementsIncrementally(cy: cytoscape.Core, elements: any[]): void {
  const seenIds = new Set<string>();
  cy.batch(() => {
    elements.forEach((el) => {
      const id = el?.data?.id;
      if (!id) {
        return;
      }
      seenIds.add(id);
      const existing = cy.getElementById(id);
      if (existing && existing.length > 0) {
        if (el.data) {
          existing.data(el.data);
        }
        if (el.position) {
          existing.position(el.position);
        }
        const normalizedClasses = normalizeClasses(el.classes);
        if (normalizedClasses !== undefined) {
          existing.classes(normalizedClasses);
        }
        if (el.style) {
          existing.style(el.style);
        }
      } else {
        cy.add(el);
      }
    });

    const toRemove = cy.elements().filter((ele) => !seenIds.has(ele.id()));
    if (toRemove.length > 0) {
      toRemove.remove();
    }
  });
}


/**
 * Fetches data from a JSON file, processes it using assignMissingLatLng(),
 * and loads it into the provided Cytoscape instance.
 *
 * @param cy - The Cytoscape instance to update.
 */
export async function fetchAndLoadData(
  cy: cytoscape.Core,
  messageSender: VscodeMessageSender,
  options: FetchOptions = {}
): Promise<void> {
  try {
    (window as any).writeTopoDebugLog?.(
      `fetchAndLoadData called (incremental=${options.incremental === true})`
    );
  } catch {
    // ignore logging issues
  }
  perfMark('fetchAndLoadData_start');

  try {
    const isVscodeDeployment = true;
    const jsonFileUrlDataCytoMarshall: string = isVscodeDeployment
      ? window.jsonFileUrlDataCytoMarshall ?? 'dataCytoMarshall.json'
      : 'dataCytoMarshall.json';

    log.debug(`fetchAndLoadData called. JSON URL: ${jsonFileUrlDataCytoMarshall}`);

    const fetchUrl = jsonFileUrlDataCytoMarshall;

    perfMark('fetch_json_start');
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error('Network response was not ok: ' + response.statusText);
    }
    const elements = await response.json();
    perfMeasure('fetch_json', 'fetch_json_start');

    perfMark('process_elements_start');
    const updatedElements = assignMissingLatLng(elements);
    perfMeasure('process_elements', 'process_elements_start');
    log.debug(`Updated Elements: ${JSON.stringify(updatedElements)}`);

    const elementsToAdd = Array.isArray(updatedElements)
      ? updatedElements
      : ((updatedElements as { elements?: any[] }).elements ?? updatedElements);

    loadElementsIntoCytoscape(cy, elementsToAdd, options.incremental === true);
    applyCustomIconColors(cy);

    cy.filter('node[name = "topoviewer"]').remove();
    cy.filter('node[name = "TopoViewer:1"]').remove();

    const overlap = allNodesOverlap(cy);

    cy.nodes().data('editor', 'true');

    if (!options.incremental) {
      perfMark('layout_start');
      const layout = chooseInitialLayout(cy, overlap);
      layout.run();
      perfMeasure('layout_initial', 'layout_start');

      fitViewportAfterLayout(cy);
      loadFreeTextAnnotations();
      loadFreeShapeAnnotations();

      if (overlap) {
        scheduleImprovedLayout(cy);
      }
    }

    perfMeasure('fetchAndLoadData_total', 'fetchAndLoadData_start');
  } catch (error) {
    log.error(`Error loading graph data from topology yaml: ${error instanceof Error ? error.message : String(error)}`);
    if (messageSender) {
      messageSender.sendMessageToVscodeEndpointPost('topo-editor-show-vscode-message', {
        type: 'warning',
        message: `Error loading graph data from topology yaml: ${error}`
      });
    }
  }
}


/**
 * Enhanced function to process the data by assigning missing latitude and longitude values.
 *
 * @param dataArray - The array of data items to process.
 * @returns The updated data array.
 */
export function assignMissingLatLng(dataArray: DataItem[]): DataItem[] {
  const updated = assignMissingLatLngToElements(dataArray);
  log.debug(`Updated dataArray: ${JSON.stringify(updated)}`);
  return updated as DataItem[];
}

// Moved lat/lng helpers to utilities/geoUtils
type EnvironmentKeys =
  | "working-directory"
  | "clab-name"
  | "clab-prefix"
  | "clab-server-address"
  | "clab-allowed-hostname"
  | "clab-allowed-hostname01"
  | "clab-server-port"
  | "deployment-type"
  | "topoviewer-version"
  | "topoviewer-layout-preset";

/**
 * Fetches and returns selective environment attributes based on the provided keys.
 * Implements lazy loading by only retrieving the requested properties.
 *
 * @param {EnvironmentKeys[]} keys - An array of environment attribute keys to fetch.
 * @returns {Promise<Partial<Record<EnvironmentKeys, string>>>} A promise resolving to the requested key-value pairs.
 * @throws {Error} Throws an error if the fetch request fails, the URL is missing, or the JSON response is invalid.
 */
export async function fetchAndLoadDataEnvironment(keys: EnvironmentKeys[]): Promise<Partial<Record<EnvironmentKeys, string>>> {
  try {
    const url = window.jsonFileUrlDataEnvironment;
    if (!url) throw new Error("JSON file URL is undefined.");

    log.debug(`Fetching environment data from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);

    const environment = await response.json();
    if (typeof environment !== "object" || environment === null) throw new Error("Invalid JSON response.");

    // Filter requested keys
    const filteredData = keys.reduce((acc, key) => {
      if (key in environment) acc[key] = environment[key];
      return acc;
    }, {} as Partial<Record<EnvironmentKeys, string>>);

    log.debug(`Filtered environment data: ${JSON.stringify(filteredData)}`);
    return filteredData;
  } catch (error) {
    log.error(`Error fetching environment data: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
