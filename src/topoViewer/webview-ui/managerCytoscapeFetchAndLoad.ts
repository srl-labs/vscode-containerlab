// file: managerCytoscapeFetchAndLoad.ts
import cytoscape from 'cytoscape';
import { VscodeMessageSender } from './managerVscodeWebview';
import { log } from '../logging/logger';


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


/**
 * Fetches data from a JSON file, processes it using assignMissingLatLng(),
 * and loads it into the provided Cytoscape instance.
 *
 * @param cy - The Cytoscape instance to update.
 */
export async function fetchAndLoadData(cy: cytoscape.Core, messageSender: VscodeMessageSender): Promise<void> {

  // // Create an instance of VscodeMessageSender
  // let messageSender: VscodeMessageSender | undefined;
  // try {
  //   messageSender = new VscodeMessageSender();
  // } catch (error) {
  //   console.error("VS Code API not available. Running in a non-VS Code environment.", error);
  // }


  try {

    const isVscodeDeployment = true;
    // Determine JSON file URL. In VS Code deployment, assume a global variable is provided.
      const jsonFileUrlDataCytoMarshall: string = isVscodeDeployment
        ? window.jsonFileUrlDataCytoMarshall ?? 'dataCytoMarshall.json'
        : 'dataCytoMarshall.json';

    log.debug(`fetchAndLoadData called. JSON URL: ${jsonFileUrlDataCytoMarshall}`);

    // Append a timestamp to bypass caching.
    // const fetchUrl = jsonFileUrlDataCytoMarshall + '?t=' + new Date().getTime();

    const fetchUrl = jsonFileUrlDataCytoMarshall;

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error("Network response was not ok: " + response.statusText);
    }
    const elements = await response.json();

    // Process the data.
    const updatedElements = assignMissingLatLng(elements);
    log.debug(`Updated Elements: ${JSON.stringify(updatedElements)}`);

    cy.json({ elements: [] });

    // Determine elements to add. Check if updatedElements is an array or has an elements property.
    const elementsToAdd = Array.isArray(updatedElements)
      ? updatedElements
      : ((updatedElements as { elements?: any[] }).elements ?? updatedElements);

    cy.add(elementsToAdd);

    // Determine if any node already has saved positions
    const nodes = elementsToAdd.filter((element: any) => element.group === 'nodes');
    const hasPosLabels = nodes.some((element: any) => {
      return element.position && element.position.x !== undefined && element.position.y !== undefined;
    });

    // Set all node to have a editor flag.
    cy.nodes().data('editor', 'true');

    // Choose layout based on presence of saved positions
    let layout: cytoscape.Layouts;
    if (!hasPosLabels && (window as any).topoViewerMode === 'viewer') {
      // Use force-directed radial layout when no position labels exist in view mode
      // Extract node weights based on group levels for radial layout
      const nodeWeights: Record<string, number> = {};
      cy.nodes().forEach((node) => {
        const level = parseInt(node.data('extraData')?.labels?.TopoViewerGroupLevel || '1', 10);
        nodeWeights[node.id()] = 1 / level;
      });

      // Apply bezier curve style to edges for better radial visualization
      cy.edges().forEach((edge) => {
        edge.style({ 'curve-style': 'bezier', 'control-point-step-size': 20 });
      });

      layout = cy.layout({
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
        maxSimulationTime: 2000,
        avoidOverlap: true,
        randomize: true  // Let cola handle the randomization
      } as any);
    } else {
      // Respect saved positions using the preset layout
      layout = cy.layout({
        name: 'preset',
        // Avoid animating to saved positions to prevent unnecessary re-renders
        animate: false,
        randomize: false,
        maxSimulationTime: 10,
        positions: undefined, // Use the positions already set on elements
        fit: false // Don't auto-fit to viewport, keep the specified positions
      } as any);
    }
    layout.run();

    // Remove specific nodes by name.
    cy.filter('node[name = "topoviewer"]').remove();
    cy.filter('node[name = "TopoViewer:1"]').remove();

    // Simple layout completion handler
    layout.promiseOn('layoutstop').then(() => {
      log.info('Layout completed');

      // Load free text annotations after layout is complete (for both edit and view modes)
      const freeTextManager = (window as any).topologyWebviewController?.freeTextManager;
      if (freeTextManager) {
        freeTextManager.loadAnnotations().then(() => {
          log.info('Free text annotations loaded');
        }).catch((error: any) => {
          log.error(`Failed to load free text annotations: ${error}`);
        });
      }
    });

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
  dataArray.forEach(item => {
    const { data } = item;
    const id = data.id || 'Unknown ID';

    // Process latitude.
    if (!data.lat || data.lat.trim() === "") {
      const randomOffset = Math.random() * 0.9;
      data.lat = (averageLat + randomOffset).toFixed(15);
      log.debug(`Assigned new lat for ID ${id}: ${data.lat}`);
    } else {
      const normalizedLat = parseFloat(data.lat);
      if (!isNaN(normalizedLat)) {
        data.lat = normalizedLat.toFixed(15);
      } else {
        const randomOffset = Math.random() * 0.9;
        data.lat = (useDefaultLat ? DEFAULT_AVERAGE_LAT : averageLat + randomOffset).toFixed(15);
        log.warn(`Invalid lat for ID ${id}. Assigned new lat: ${data.lat}`);
      }
    }

    // Process longitude.
    if (!data.lng || data.lng.trim() === "") {
      const randomOffset = Math.random() * 0.9;
      data.lng = (averageLng + randomOffset).toFixed(15);
      log.debug(`Assigned new lng for ID ${id}: ${data.lng}`);
    } else {
      const normalizedLng = parseFloat(data.lng);
      if (!isNaN(normalizedLng)) {
        data.lng = normalizedLng.toFixed(15);
      } else {
        const randomOffset = Math.random() * 0.9;
        data.lng = (useDefaultLng ? DEFAULT_AVERAGE_LNG : averageLng + randomOffset).toFixed(15);
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

