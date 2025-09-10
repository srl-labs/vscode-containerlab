// file: managerCytoscapeFetchAndLoad.ts
import cytoscape from 'cytoscape';
import { VscodeMessageSender } from './managerVscodeWebview';
import { log } from '../logging/logger';
import { perfMark, perfMeasure } from '../utilities/performanceMonitor';


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

function chooseInitialLayout(cy: cytoscape.Core, overlap: boolean): cytoscape.Layouts {
  if (overlap) {
    const nodeCount = cy.nodes().length;
    const cols = Math.ceil(Math.sqrt(nodeCount));
    const spacing = 120;
    let index = 0;

    cy.nodes().forEach((node) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      node.position({ x: col * spacing + 100, y: row * spacing + 100 });
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

function scheduleImprovedLayout(cy: cytoscape.Core): void {
  const scheduleLayout = (callback: () => void) => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(callback, { timeout: 500 });
    } else {
      setTimeout(callback, 200);
    }
  };

  scheduleLayout(() => {
    const nodeWeights: Record<string, number> = {};
    cy.nodes().forEach((node) => {
      const level = parseInt(node.data('extraData')?.labels?.TopoViewerGroupLevel || '1', 10);
      nodeWeights[node.id()] = 1 / level;
    });

    cy.edges().forEach((edge) => {
      edge.style({ 'curve-style': 'bezier', 'control-point-step-size': 20 });
    });

    const improvedLayout = cy.layout({
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


/**
 * Fetches data from a JSON file, processes it using assignMissingLatLng(),
 * and loads it into the provided Cytoscape instance.
 *
 * @param cy - The Cytoscape instance to update.
 */
export async function fetchAndLoadData(cy: cytoscape.Core, messageSender: VscodeMessageSender): Promise<void> {
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

    cy.json({ elements: [] });

    const elementsToAdd = Array.isArray(updatedElements)
      ? updatedElements
      : ((updatedElements as { elements?: any[] }).elements ?? updatedElements);

    cy.add(elementsToAdd);

    cy.filter('node[name = "topoviewer"]').remove();
    cy.filter('node[name = "TopoViewer:1"]').remove();

    const overlap = allNodesOverlap(cy);

    cy.nodes().data('editor', 'true');

    perfMark('layout_start');
    const layout = chooseInitialLayout(cy, overlap);
    layout.run();
    perfMeasure('layout_initial', 'layout_start');

    fitViewportAfterLayout(cy);
    loadFreeTextAnnotations();

    if (overlap) {
      scheduleImprovedLayout(cy);
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
  const DEFAULT_AVERAGE_LAT = 48.684826888402256;
  const DEFAULT_AVERAGE_LNG = 9.007895390625677;
  const existingLats: number[] = [];
  const existingLngs: number[] = [];

  // First pass: collect existing latitudes and longitudes.
  dataArray.forEach(item => {
    const { data } = item;
    if (data.lat && data.lat.trim() !== "") {
      const lat = parseFloat(data.lat);
      if (!isNaN(lat)) {
        existingLats.push(lat);
      }
    }
    if (data.lng && data.lng.trim() !== "") {
      const lng = parseFloat(data.lng);
      if (!isNaN(lng)) {
        existingLngs.push(lng);
      }
    }
  });

  // Compute averages if possible, otherwise use defaults.
  let averageLat = existingLats.length > 0
    ? existingLats.reduce((a, b) => a + b, 0) / existingLats.length
    : DEFAULT_AVERAGE_LAT;
  let averageLng = existingLngs.length > 0
    ? existingLngs.reduce((a, b) => a + b, 0) / existingLngs.length
    : DEFAULT_AVERAGE_LNG;

  const useDefaultLat = existingLats.length === 0;
  const useDefaultLng = existingLngs.length === 0;
  if (useDefaultLat || useDefaultLng) {
    log.warn('Missing latitude or longitude values. Using default averages.');
    averageLat = useDefaultLat ? DEFAULT_AVERAGE_LAT : averageLat;
    averageLng = useDefaultLng ? DEFAULT_AVERAGE_LNG : averageLng;
  }

  // Second pass: assign missing values or normalize existing values.
  let offsetCounter = 0;
  dataArray.forEach(item => {
    const { data } = item;
    const id = data.id || 'Unknown ID';

    // Process latitude.
    if (!data.lat || data.lat.trim() === "") {
      const deterministicOffset = (offsetCounter++ % 9) * 0.1;
      data.lat = (averageLat + deterministicOffset).toFixed(15);
      log.debug(`Assigned new lat for ID ${id}: ${data.lat}`);
    } else {
      const normalizedLat = parseFloat(data.lat);
      if (!isNaN(normalizedLat)) {
        data.lat = normalizedLat.toFixed(15);
      } else {
        const deterministicOffset = (offsetCounter++ % 9) * 0.1;
        data.lat = (useDefaultLat ? DEFAULT_AVERAGE_LAT : averageLat + deterministicOffset).toFixed(15);
        log.warn(`Invalid lat for ID ${id}. Assigned new lat: ${data.lat}`);
      }
    }

    // Process longitude.
    if (!data.lng || data.lng.trim() === "") {
      const deterministicOffset = (offsetCounter++ % 9) * 0.1;
      data.lng = (averageLng + deterministicOffset).toFixed(15);
      log.debug(`Assigned new lng for ID ${id}: ${data.lng}`);
    } else {
      const normalizedLng = parseFloat(data.lng);
      if (!isNaN(normalizedLng)) {
        data.lng = normalizedLng.toFixed(15);
      } else {
        const deterministicOffset = (offsetCounter++ % 9) * 0.1;
        data.lng = (useDefaultLng ? DEFAULT_AVERAGE_LNG : averageLng + deterministicOffset).toFixed(15);
        log.warn(`Invalid lng for ID ${id}. Assigned new lng: ${data.lng}`);
      }
    }
  });

  log.debug(`Updated dataArray: ${JSON.stringify(dataArray)}`);
  return dataArray;

}
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
