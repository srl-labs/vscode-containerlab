"use strict";
// -----------------------------------------------------------
// Global State Variables
// -----------------------------------------------------------
var isPanel01Cy = false;
var nodeClicked = false;
var edgeClicked = false;
var cy;
var globalSelectedNode;
var globalSelectedEdge;
var globalLinkEndpointVisibility = true;
var globalNodeContainerStatusVisibility = false;
var globalShellUrl = "/js/cloudshell";
let deploymentType;
var globalLabName;
var multiLayerViewPortState = false;

// Cytoscape-Leaflet variables
var globalIsGeoMapInitialized = false;
var globalCytoscapeLeafletMap;
var globalCytoscapeLeafletLeaf;

// The determined whether preset layout is enabled automatically during initialization
var globalIsPresetLayout;

// Detect if running inside VS Code webview
var isVscodeDeployment = Boolean(window.isVscodeDeployment);
var vsCode;
if (isVscodeDeployment) {
  // VS Code webview API for communication with the extension
  vsCode = acquireVsCodeApi();
}

// JSON file URL for environment data
var jsonFileUrlDataCytoMarshall;

// Double-click tracking variables
var globalDblclickLastClick = { time: 0, id: null };
var globalDblClickThreshold = 300; // Threshold in milliseconds

// var globalAllowedhostname = 'nsp-clab1.nice.nokia.net'



// -----------------------------------------------------------
// Expose a Promise to load environment variables
// -----------------------------------------------------------
/**
 * envLoadPromise:
 * A globally accessible promise that completes after environment variables
 * have been fetched and assigned to globalLabName, globalAllowedhostname, etc.
 */
window.envLoadPromise = initEnv();



/**
 * initEnv()
 * Initializes environment variables by fetching deployment settings.
 * aarafat-tag: this need to be reworked, so that via initiEnv the environement will be only loaded once.
 */
async function initEnv() {
  try {
    let environments = await getEnvironments();
    if (!environments) {
      console.error("No environments data found. initEnv aborted.");
      return;
    }

    // Assign to global variables
    globalLabName = environments["clab-name"];
    deploymentType = environments["deployment-type"];
    globalIsPresetLayout = environments["topoviewer-layout-preset"] === "true";
    globalAllowedhostname = environments["clab-allowed-hostname"];

    // Optional: Log them once they're fetched:
    console.info("Lab-Name:", globalLabName);
    console.info("DeploymentType:", deploymentType);
    console.info("globalIsPresetLayout:", globalIsPresetLayout);
    console.info("globalAllowedhostname:", globalAllowedhostname);

  } catch (err) {
    console.error("Error during initEnv:", err);
    throw err; // Re-throw so the promise rejects if something fails
  }
}

// -----------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------

/**
 * Fetches environment configurations.
 */
async function getEnvironments() {
  try {
    let environments;
    if (isVscodeDeployment) {
      // Using a JSON file in the VS Code deployment scenario
      const response = await fetch(window.jsonFileUrlDataEnvironment);
      if (!response.ok) {
        throw new Error(`Network response not ok: ${response.status}`);
      }
      environments = await response.json();
    } else {
      // Using a dedicated GET endpoint in other scenarios
      environments = await sendRequestToEndpointGetV2("/get-environments");
    }

    if (environments && typeof environments === 'object' && Object.keys(environments).length > 0) {
      console.log("Fetched Environments:", environments);
      return environments;
    } else {
      console.log("Empty or invalid JSON response for environments");
      return null;
    }
  } catch (error) {
    console.error("Error fetching environments:", error);
    return null;
  }
}

/**
 * Helper function to send a GET request to an endpoint.
 */
async function sendRequestToEndpointGetV2(endpointName) {
  try {
    const response = await fetch(endpointName, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error in sendRequestToEndpointGetV2:", error);
    throw error;
  }
}

/**
 * Calls a Go backend function with provided parameters.
 */
async function callGoFunction(goFunctionName, arg01, arg02, arg03) {
  console.log(`callGoFunction Called with ${goFunctionName}`);
  console.log(`Parameter01: ${arg01}`);
  console.log(`Parameter02: ${arg02}`);

  const data = { param1: arg01, param2: arg02, param3: arg03 };
  try {
    const response = await fetch(goFunctionName, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error in callGoFunction:", error);
    throw error;
  }
}

/**
 * Posts a request to the Python backend to execute a command list.
 */
async function postPythonAction(event, commandList) {
  try {
    showLoadingSpinnerGlobal();
    const response = await sendRequestToEndpointPost("/python-action", commandList);
    if (response && typeof response === 'object' && Object.keys(response).length > 0) {
      console.log("Python action response:", response);
      return response;
    } else {
      console.log("Empty or invalid JSON response from Python action");
      return null;
    }
  } catch (error) {
    console.error("Error in postPythonAction:", error);
    return null;
  } finally {
    hideLoadingSpinnerGlobal();
  }
}

/**
 * Sends a POST request to the specified endpoint.
 */
async function sendRequestToEndpointPost(endpointName, argsList = []) {
  console.log(`sendRequestToEndpointPost Called with ${endpointName}`, argsList);

  const data = {};
  argsList.forEach((arg, index) => {
    data[`param${index + 1}`] = arg;
  });

  try {
    const response = await fetch(endpointName, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error in sendRequestToEndpointPost:", error);
    throw error;
  }
}

/**
 * Finds a Cytoscape element by its ID.
 */
function findCytoElementById(jsonArray, id) {
  return jsonArray.find(obj => obj.data.id === id) || null;
}

/**
 * Finds a Cytoscape element by its name.
 */
function findCytoElementByName(jsonArray, name) {
  return jsonArray.find(obj => obj.data.name === name) || null;
}

/**
 * Finds a Cytoscape element by its long name.
 */
function findCytoElementByLongname(jsonArray, longname) {
  return jsonArray.find(obj => obj.data?.extraData?.longname === longname) || null;
}

/**
 * Detects user's preferred color scheme and applies the theme.
 */
function detectColorScheme() {
  const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(darkMode ? 'dark' : 'light');
  return darkMode ? 'dark' : 'light';
}

/**
 * Applies a theme to the root element.
 */
function applyTheme(theme) {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.setAttribute('data-theme', theme);
    console.log("Applied Theme:", theme);
  } else {
    console.warn("'root' element not found, cannot apply theme:", theme);
  }
}

/**
 * Displays a global loading spinner.
 */
function showLoadingSpinnerGlobal() {
  const spinner = document.getElementById('loading-spinner-global');
  if (spinner) {
    spinner.style.display = 'block';
  } else {
    console.warn("'loading-spinner-global' element not found, cannot show spinner.");
  }
}

/**
 * Hides the global loading spinner.
 */
function hideLoadingSpinnerGlobal() {
  const spinner = document.getElementById('loading-spinner-global');
  if (spinner) {
    spinner.style.display = 'none';
  } else {
    console.warn("'loading-spinner-global' element not found, cannot hide spinner.");
  }
}



// // Initiate socket port as number, to be used in socket creation
var globalSocketAssignedPort = window.socketAssignedPort
var globalAllowedhostname = window.allowedHostname
console.log(`window.allowedHostname: ${window.allowedHostname}`)
console.log('allowedHostname', globalAllowedhostname)

// // aarafat-tag: vscode socket.io
const socketIoServerAddress = `${globalAllowedhostname}:${globalSocketAssignedPort}`
console.log(`socketIoServerAddress: ${socketIoServerAddress}`)
console.log('socketIoServerAddress:', socketIoServerAddress)


const socket = io(`http://${socketIoServerAddress}`);

// // -----------------------------------------------------------------------------------------------------------------------------------------------------------------
// // SOCKET BINDING CONTROL // aarafat-tag: this is the main function to bind the socket // entry point for managerOnChangeEvent.js, managerSocketDataEnrichment.js
// // -----------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * updateSocketBinding()
 *
 * Unbinds any previous listener for "clab-tree-provider-data" and, if the global toggle is enabled,
 * binds an inline listener that processes the lab data using the generic state monitor engine.
 */
function updateSocketBinding() {
  // Unbind previous "clab-tree-provider-data" listeners.
  socket.off('clab-tree-provider-data');

  if (globalToggleOnChangeCytoStyle) {
    socket.on('clab-tree-provider-data', (labData) => {
      console.log("Received clab-tree-provider-data - globalToggleOnChangeCytoStyl:", labData);
      // Use the global monitorConfigs defined below.
      stateMonitorEngine(labData, monitorConfigs);
      socketDataEncrichmentLink(labData);
      socketDataEncrichmentNode(labData)

    });
    console.log("Socket 'clab-tree-provider-data' event bound.");
  } else {
    console.log("Socket 'clab-tree-provider-data' event unbound.");
  }
}


// -----------------------------------------------------------------------------
//             type: 'clab-tree-provider-data-native-vscode-postMessage'
// -----------------------------------------------------------------------------
// Listen for messages sent from the extension.
// window.addEventListener('message', event => {
//   const message = event.data; // The JSON data sent by the extension.
//   if (message.type === 'clab-tree-provider-data-native-vscode-message-stream') {
//     const labData = message.data;
//     console.log("Received clab-tree-provider-data-native-vscode-message-stream via postMessage:", labData);

//     // if (globalToggleOnChangeCytoStyle) {
//     //   // console.log("Received clab-tree-provider-data-native-vscode-postMessage via postMessage:", labData);
//     //   // Process the lab data using your existing functions.
//     //   stateMonitorEngine(labData, monitorConfigs);
//     //   socketDataEncrichmentLink(labData);
//     //   socketDataEncrichmentNode(labData);
//     // } else {
//     //   console.log("Lab data received but toggle is off.");
//     // }
//   }
// });

/**
 * updateMessageStreamBinding()
 *
 * Updates the postMessage event listener for "clab-tree-provider-data" messages.
 * Uses a persistent event handler stored as a property on the function.
 */
function updateMessageStreamBinding() {
  // Create the event handler once and store it as a property if it doesn't exist.
  if (!updateMessageStreamBinding.handler) {
    updateMessageStreamBinding.handler = function(event) {
      try {
        const message = event.data;
        if (message && message.type === 'clab-tree-provider-data-native-vscode-message-stream') {
          const labData = message.data;
          console.log("[PostMessage] Received 'clab-tree-provider-data-native-vscode-message-stream':", labData);
          // Process the lab data only if the global toggle is enabled.
          if (globalToggleOnChangeCytoStyle) {
            stateMonitorEngine(labData, monitorConfigs);
            socketDataEncrichmentLink(labData);
            socketDataEncrichmentNode(labData);
          }
        }
      } catch (error) {
        console.error("Error processing postMessage event:", error);
      }
    };
  }

  // Always remove the previously bound listener to avoid duplicates.
  window.removeEventListener('message', updateMessageStreamBinding.handler);

  // If enabled, add the event listener.
  if (globalToggleOnChangeCytoStyle) {
    window.addEventListener('message', updateMessageStreamBinding.handler);
    console.log("[PostMessage] 'clab-tree-provider-data' event listener bound.");
  } else {
    console.log("[PostMessage] 'clab-tree-provider-data' event listener unbound.");
  }
}



// -----------------------------------------------------------------------------
// STYLE HELPER FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Updates the dynamic style for an edge and caches the update.
 *
 * @param {string} edgeId - The unique ID of the edge.
 * @param {string} styleProp - The style property to update (e.g. "text-background-color").
 * @param {string|number} value - The new value for the style property.
 */
function updateEdgeDynamicStyle(edgeId, styleProp, value) {
  const edge = cy.$(`#${edgeId}`);
  if (edge.length > 0) {
    edge.style(styleProp, value);
    const cacheKey = `edge:${edgeId}:${styleProp}`;
    window.dynamicCytoStyles.set(cacheKey, value);
  }
}

/**
 * Updates the dynamic style for a node and caches the update.
 *
 * @param {string} nodeId - The unique ID of the node.
 * @param {string} styleProp - The style property to update (e.g. "background-color").
 * @param {string|number} value - The new value for the style property.
 */
function updateNodeDynamicStyle(nodeId, styleProp, value) {
  const node = cy.$(`#${nodeId}`);
  if (node.length > 0) {
    node.style(styleProp, value);
    const cacheKey = `node:${nodeId}:${styleProp}`;
    window.dynamicCytoStyles.set(cacheKey, value);
  }
}

/**
 * Iterates over the dynamic style cache and re-applies the stored styles.
 */
function restoreDynamicStyles() {
  window.dynamicCytoStyles.forEach((value, key) => {
    const parts = key.split(":"); // e.g. ["edge", "Clab-Link0", "text-background-color"]
    if (parts.length !== 3) return;
    const [type, id, styleProp] = parts;
    if (type === "edge") {
      const edge = cy.$(`#${id}`);
      if (edge.length > 0) {
        edge.style(styleProp, value);
      }
    } else if (type === "node") {
      const node = cy.$(`#${id}`);
      if (node.length > 0) {
        node.style(styleProp, value);
      }
    }
  });
}


