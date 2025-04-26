// file: managerCytoscapeFetchAndLoad.ts
import cytoscape from 'cytoscape';
import { VscodeMessageSender } from './managerVscodeWebview';


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
      ? (window as any).jsonFileUrlDataCytoMarshall : "dataCytoMarshall.json";

    console.log(`fetchAndLoadData called. JSON URL: ${jsonFileUrlDataCytoMarshall}`);

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
    console.log("Updated Elements:", updatedElements);

    cy.json({ elements: [] });

    // Determine elements to add. Check if updatedElements is an array or has an elements property.
    const elementsToAdd = Array.isArray(updatedElements)
      ? updatedElements
      : ((updatedElements as { elements?: any[] }).elements ?? updatedElements);

    // Apply positions from graph-posX and graph-posY labels
    elementsToAdd.forEach((element: any) => {
      if (element.group === 'nodes' && element.data?.extraData?.labels) {
        const labels = element.data.extraData.labels;
        if (labels['graph-posX'] && labels['graph-posY']) {
          element.position = {
            x: parseFloat(labels['graph-posX']),
            y: parseFloat(labels['graph-posY'])
          };
        }
      }
    });

    cy.add(elementsToAdd);

    // Set all node to have a editor flag.
    cy.nodes().data('editor', 'true');


    // Run a layout - always use preset to respect specified positions
    const layout = cy.layout({
      name: 'preset',
      animate: true,
      randomize: false,
      maxSimulationTime: 10,
      positions: undefined, // Use the positions already set on elements
      fit: false // Don't auto-fit to viewport, keep the specified positions
    } as any);
    layout.run();

    // Remove specific nodes by name.
    cy.filter('node[name = "topoviewer"]').remove();
    cy.filter('node[name = "TopoViewer:1"]').remove();

    // Fit the viewport to show all nodes after layout is complete
    layout.promiseOn('layoutstop').then(() => {
      cy.fit(cy.nodes(), 120); // Add padding of 50px
      console.log('Viewport fitted to show all nodes');
    });

  } catch (error) {
    console.error("Error loading graph data from topology yaml:", error);
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
    console.warn("Missing latitude or longitude values. Using default averages.");
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
      console.log(`Assigned new lat for ID ${id}: ${data.lat}`);
    } else {
      const normalizedLat = parseFloat(data.lat);
      if (!isNaN(normalizedLat)) {
        data.lat = normalizedLat.toFixed(15);
      } else {
        const randomOffset = Math.random() * 0.9;
        data.lat = (useDefaultLat ? DEFAULT_AVERAGE_LAT : averageLat + randomOffset).toFixed(15);
        console.warn(`Invalid lat for ID ${id}. Assigned new lat: ${data.lat}`);
      }
    }

    // Process longitude.
    if (!data.lng || data.lng.trim() === "") {
      const randomOffset = Math.random() * 0.9;
      data.lng = (averageLng + randomOffset).toFixed(15);
      console.log(`Assigned new lng for ID ${id}: ${data.lng}`);
    } else {
      const normalizedLng = parseFloat(data.lng);
      if (!isNaN(normalizedLng)) {
        data.lng = normalizedLng.toFixed(15);
      } else {
        const randomOffset = Math.random() * 0.9;
        data.lng = (useDefaultLng ? DEFAULT_AVERAGE_LNG : averageLng + randomOffset).toFixed(15);
        console.warn(`Invalid lng for ID ${id}. Assigned new lng: ${data.lng}`);
      }
    }
  });

  console.log("Updated dataArray:", dataArray);
  return dataArray;

}
type EnvironmentKeys =
  | "working-directory"
  | "clab-name"
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
    const url = (window as { jsonFileUrlDataEnvironment?: string }).jsonFileUrlDataEnvironment;
    if (!url) throw new Error("JSON file URL is undefined.");

    console.log(`Fetching environment data from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);

    const environment = await response.json();
    if (typeof environment !== "object" || environment === null) throw new Error("Invalid JSON response.");

    // Filter requested keys
    const filteredData = keys.reduce((acc, key) => {
      if (key in environment) acc[key] = environment[key];
      return acc;
    }, {} as Partial<Record<EnvironmentKeys, string>>);

    console.log("Filtered environment data:", filteredData);
    return filteredData;
  } catch (error) {
    console.error("Error fetching environment data:", error instanceof Error ? error.message : error);
    throw error;
  }
}

