// file: managerClabEditor.ts

// Import logger for webview
import { log } from './logger';

// Monaco Editor type declarations
/* eslint-disable no-unused-vars */
declare global {
  var monaco: any;
  interface WorkspaceRequire {
    config: (config: any) => void;
    (modules: string[], callback: Function): void;
  }
  var require: WorkspaceRequire;
  interface Window {
    monacoEditor?: any;
    schemaUrl?: string;
  }
  // Allow accessing monaco through globalThis for webview context
  namespace globalThis {
    var monaco: any;
    var require: WorkspaceRequire;
  }
}
/* eslint-enable no-unused-vars */

// Import js-yaml types
import * as jsyaml from 'js-yaml';

// Declare external functions and variables
/* eslint-disable no-unused-vars */
declare const bulmaToast: any;
declare const sendRequestToEndpointPost: (endpoint: string, data: any[]) => Promise<any>;
declare const sendRequestToEndpointGetV3: (endpoint: string) => Promise<string>;
declare const getEnvironments: () => Promise<Record<string, any>>;
declare const findCytoElementById: (topology: any, id: string) => any;
declare const cy: any;
declare var clabTopoYamlEditorData: string;
/* eslint-enable no-unused-vars */

// Interfaces for YAML topology structure
interface NodeLabels {
  'topoViewer-role': string;
  nodeId: string;
}

interface YamlNode {
  kind: string;
  image: string;
  group: string;
  labels: NodeLabels;
}

interface YamlTopology {
  name?: string;
  topology?: {
    nodes?: Record<string, YamlNode>;
    links?: YamlLink[];
  };
}

interface YamlLink {
  endpoints: string[];
}

// interface NodeEditorFormData {
//   nodeId: string;
//   nodeName: string;
//   kind: string;
//   image: string;
//   group: string;
//   topoViewerRole: string;
// }

interface CytoscapeExtraData {
  kind: string;
  image: string;
  longname: string;
  mgmtIpv4Addresss: string;
}

interface SchemaDefinition {
  definitions?: {
    'node-config'?: {
      properties?: {
        kind?: {
          enum?: string[];
        };
      };
      allOf?: Array<{
        if?: {
          properties?: {
            kind?: {
              pattern?: string;
            };
          };
        };
        then?: {
          properties?: {
            type?: {
              enum?: string[];
            };
          };
        };
      }>;
    };
  };
}

interface SchemaResponse {
  kindOptions: string[];
  schemaData: SchemaDefinition;
}

// Global variables with proper typing
let yamlTopoContent: string;

// Create a Promise to track when the Monaco Editor is ready
const monacoEditorReady: Promise<void> = new Promise((resolve) => {
  // For webview context, Monaco Editor needs to be loaded differently
  // Check if monaco is already available globally (loaded via script tag in HTML)
  if (typeof (globalThis as any).monaco !== 'undefined') {
    // Monaco is already loaded, initialize the editor directly
    window.monacoEditor = (globalThis as any).monaco.editor.create(
      document.getElementById('panel-clab-editor-text-area'),
      {
        value: '', // Initial content will be set later
        language: 'yaml', // Set the language mode
        theme: 'vs-dark', // Optional: Set editor theme
        automaticLayout: true // Adjust layout automatically
      }
    );
    resolve();
  } else {
    // Fallback: Configure Monaco Editor paths and load via AMD
    // This approach works when Monaco is loaded via script tags in HTML
    const script = document.createElement('script');
    script.src = './library/monaco-editor/min/vs/loader.js';
    script.onload = () => {
      // Configure Monaco paths after loader is available
      (globalThis as any).require.config({
        paths: {
          'vs': './library/monaco-editor/min/vs'
        }
      });

      (globalThis as any).require(['vs/editor/editor.main'], function() {
        // Initialize the Monaco Editor
        window.monacoEditor = (globalThis as any).monaco.editor.create(
          document.getElementById('panel-clab-editor-text-area'),
          {
            value: '', // Initial content will be set later
            language: 'yaml', // Set the language mode
            theme: 'vs-dark', // Optional: Set editor theme
            automaticLayout: true // Adjust layout automatically
          }
        );
        resolve(); // Resolve the Promise when the editor is ready
      });
    };
    script.onerror = () => {
      log.error('Failed to load Monaco Editor loader script');
      resolve(); // Resolve anyway to prevent hanging
    };
    document.head.appendChild(script);
  }
});

/**
 * Shows the containerlab editor panel with YAML content
 * @param event - Click event (optional)
 */
export function showPanelContainerlabEditor(): void {
  // Wait until the Monaco Editor is initialized
  monacoEditorReady;

  // Get the YAML content from backend
  getYamlTopoContent(yamlTopoContent);

  // Get all elements with the class "panel-overlay"
  const panelOverlays = document.getElementsByClassName("panel-overlay");
  // Loop through each element and set its display to 'none'
  for (let i = 0; i < panelOverlays.length; i++) {
    (panelOverlays[i] as HTMLElement).style.display = "none";
  }

  const editorPanel = document.getElementById("panel-clab-editor");
  if (editorPanel) {
    editorPanel.style.display = "block";
  }
}

/**
 * Closes the containerlab editor panel
 */
export function closePanelContainerlabEditor(): void {
  const editorPanel = document.getElementById("panel-clab-editor");
  if (editorPanel) {
    editorPanel.style.display = "none";
  }
}

/**
 * Function to load a file into the Monaco editor
 */
export function clabEditorLoadFile(): void {
  const fileInput = document.getElementById('panel-clab-editor-file-input') as HTMLInputElement;

  if (!fileInput) {
    log.error('File input element not found');
    return;
  }

  // Trigger the file input's file browser dialog
  fileInput.click();

  // Listen for when the user selects a file
  fileInput.onchange = function() {
    if (fileInput.files && fileInput.files.length === 0) {
      return; // No file selected
    }

    if (!fileInput.files) {
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(event: ProgressEvent<FileReader>) {
      if (event.target && event.target.result && window.monacoEditor) {
        // Set the content of the Monaco Editor
        window.monacoEditor.setValue(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };
}

/**
 * Adds or updates a node in the YAML topology
 * @param nodeId - Unique identifier for the node
 * @param nodeName - Display name for the node
 * @param kind - Node kind (default: 'nokia_srlinux')
 * @param image - Docker image (default: 'ghcr.io/nokia/srlinux:latest')
 * @param group - Node group (default: 'group-01')
 * @param topoViewerRole - Topology viewer role (default: 'dcgw')
 */
export async function clabEditorAddNode(
  nodeId: string,
  nodeName: string,
  kind: string = 'nokia_srlinux',
  image: string = 'ghcr.io/nokia/srlinux:latest',
  group: string = 'group-01',
  topoViewerRole: string = 'dcgw'
): Promise<void> {
  // Ensure the Monaco Editor is initialized
  await monacoEditorReady;

  // Validate required parameters
  if (!nodeId || !nodeName || !kind || !image || !group || !topoViewerRole) {
    log.error('All parameters (nodeId, nodeName, kind, image, group, topoViewerRole) must be provided');

    if (bulmaToast && bulmaToast.toast) {
      bulmaToast.toast({
        message: `All parameters (nodeId, nodeName, kind, image, group, topoViewerRole) must be provided.`,
        type: "is-warning",
        duration: 4000,
        position: "top-center",
        closeOnClick: true,
      });
    }
    return;
  }

  try {
    // Get the current YAML content from the Monaco Editor
    const editorContent: string = window.monacoEditor?.getValue() || '';
    log.debug('Processing YAML content for node addition');

    // Parse the YAML content into a JavaScript object
    const yamlData: YamlTopology = jsyaml.load(editorContent) as YamlTopology || {};

    // Ensure the 'topology' and 'topology.nodes' sections exist
    if (!yamlData.topology) {
      yamlData.topology = {};
      log.debug('Initialized empty topology section');
    }

    if (!yamlData.topology.nodes) {
      yamlData.topology.nodes = {};
      log.debug('Initialized empty topology.nodes section');
    } else if (typeof yamlData.topology.nodes !== 'object') {
      throw new Error("The 'topology.nodes' section is not an object.");
    }

    // Check for duplicate nodeId in the nodes section and links section
    let oldNodeName: string | null = null;
    for (const [existingNodeName, existingNode] of Object.entries(yamlData.topology.nodes)) {
      if (existingNode.labels?.nodeId === nodeId) {
        oldNodeName = existingNodeName;
        log.info(`Updating existing node ${nodeId}: ${existingNodeName} -> ${nodeName}`);
        delete yamlData.topology.nodes[existingNodeName];
        break;
      }
    }

    // Update links if oldNodeName exists
    if (oldNodeName && yamlData.topology.links && Array.isArray(yamlData.topology.links)) {
      yamlData.topology.links.forEach(link => {
        link.endpoints = link.endpoints.map(endpoint => {
          if (endpoint.startsWith(`${oldNodeName}:`)) {
            return endpoint.replace(`${oldNodeName}:`, `${nodeName}:`);
          }
          return endpoint;
        });
      });
      log.info(`Updated ${yamlData.topology.links?.length || 0} links for renamed node`);
    }

    // Define the new node structure
    const newNode: YamlNode = {
      kind: kind,
      image: image,
      group: group,
      labels: {
        "topoViewer-role": topoViewerRole,
        "nodeId": nodeId,
      }
    };

    // Add or update the node in the 'topology.nodes' section
    yamlData.topology.nodes[nodeName] = newNode;
    log.info(`Node '${nodeName}' successfully added/updated in topology`);

    // Serialize the updated JavaScript object back to YAML
    const updatedYaml: string = jsyaml.dump(yamlData);
    log.debug('YAML topology updated with new node data');

    // Update the Monaco Editor with the new YAML content
    if (window.monacoEditor) {
      window.monacoEditor.setValue(updatedYaml);
    }
    yamlTopoContent = updatedYaml; // Update the global or relevant state variable

    log.info('YAML topology updated successfully with the new/updated node');

    // Optionally, persist the changes to the backend
    await clabEditorSaveYamlTopo();
    log.info('Changes have been persisted to the backend');

    // Notify the user of the successful operation
    if (bulmaToast && bulmaToast.toast) {
      bulmaToast.toast({
        message: `Node "${nodeName}" has been successfully added/updated.`,
        type: "is-warning",
        duration: 3000,
        position: "top-center",
        closeOnClick: true,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Error while adding/updating node in YAML: ${error}`);

    if (bulmaToast && bulmaToast.toast) {
      bulmaToast.toast({
        message: `Failed to add/update node: ${errorMessage}`,
        type: "is-warning",
        duration: 5000,
        position: "top-center",
        closeOnClick: true,
      });
    }
  }
}

/**
 * Saves the current YAML topology content to the backend
 */
export async function clabEditorSaveYamlTopo(): Promise<void> {
  // Get the content of the Monaco Editor
  const editorContent: string = window.monacoEditor?.getValue() || '';
  clabTopoYamlEditorData = editorContent;
  log.debug('Saving YAML topology data to backend');

  // Dump clabTopoYamlEditorData to be persisted to clab-topo.yaml
  const endpointName = '/clab-topo-yaml-save';

  try {
    // Send the enhanced node data directly without wrapping it in an object
    await sendRequestToEndpointPost(endpointName, [clabTopoYamlEditorData]);
    log.info('YAML topology data saved successfully');
  } catch (error) {
    log.error(`Failed to save YAML topology: ${error}`);
  }
}

/**
 * Shows the node editor panel for a specific Cytoscape node
 * @param node - Cytoscape node object
 */
export async function showPanelNodeEditor(node: any): Promise<void> {
  // Remove all Overlayed Panels
  const panelOverlays = document.getElementsByClassName("panel-overlay");
  Array.from(panelOverlays).forEach(panel => {
    (panel as HTMLElement).style.display = "none";
  });

  log.info(`Opening node editor for: ${node.data('id')}`);

  // Set the node Name in the editor
  const nodeNameInput = document.getElementById("panel-node-editor-name") as HTMLInputElement;
  if (nodeNameInput) {
    nodeNameInput.value = node.data("id"); // defaulted by node id
  }

  // Set the node Id in the editor
  const nodeIdLabel = document.getElementById("panel-node-editor-id");
  if (nodeIdLabel) {
    nodeIdLabel.textContent = node.data("id");
  }

  // Set the node image in the editor
  const nodeImageLabel = document.getElementById("panel-node-editor-image") as HTMLInputElement;
  if (nodeImageLabel) {
    nodeImageLabel.value = 'ghcr.io/nokia/srlinux:latest';
  }

  // Set the node group in the editor
  const nodeGroupLabel = document.getElementById("panel-node-editor-group") as HTMLInputElement;
  if (nodeGroupLabel) {
    const parentNode = node.parent();
    // Get the parent node's label
    const parentLabel = parentNode.data('name');
    log.debug(`Parent node label: ${parentLabel}`);

    nodeGroupLabel.value = parentLabel;
  }

  // Display the node editor panel
  const nodeEditorPanel = document.getElementById("panel-node-editor");
  if (nodeEditorPanel) {
    nodeEditorPanel.style.display = "block";
  }

  // Fetch JSON schema from the backend
  const url = window.schemaUrl || "schema/clab.schema.json";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const jsonData: SchemaDefinition = await response.json();

    // Get kind enums from the JSON data
    const { kindOptions } = getKindEnums(jsonData);
    log.debug(`Loaded ${kindOptions.length} kind options`);

    // Populate the dropdown with fetched kindOptions
    populateKindDropdown(kindOptions);

    // Populate the dropdown with fetched topoViwerRoleOptions
    const topoViwerRoleOptions = ['bridge', 'controller', 'dcgw', 'router', 'leaf', 'pe', 'pon', 'rgw', 'server', 'super-spine', 'spine'];
    populateTopoViewerRoleDropdown(topoViwerRoleOptions);

    // List type enums based on kind pattern
    const typeOptions = getTypeEnumsByKindPattern(jsonData, '(srl|nokia_srlinux)'); // To be added to the UI
    log.debug(`Loaded ${typeOptions.length} type options for SRL pattern`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Error fetching JSON schema data: ${errorMessage}`);
    throw error;
  }
}

// Initialize event listener for the close button
const closeButton = document.getElementById("panel-node-editor-close-button");
if (closeButton) {
  closeButton.addEventListener("click", () => {
    const editorPanel = document.getElementById("panel-node-editor");
    if (editorPanel) {
      editorPanel.style.display = "none";
    }
  });
}

/**
 * Get kind enums from the JSON schema
 * @param jsonData - Schema definition object
 * @returns Object containing kind options and schema data
 */
function getKindEnums(jsonData: SchemaDefinition): SchemaResponse {
  let kindOptions: string[] = [];
  if (jsonData?.definitions?.['node-config']?.properties?.kind?.enum) {
    kindOptions = jsonData.definitions['node-config'].properties.kind.enum;
  } else {
    throw new Error("Invalid JSON structure or 'kind' enum not found");
  }
  return {
    kindOptions,
    schemaData: jsonData
  };
}

/**
 * Get type enums based on a kind pattern
 * @param jsonData - Schema definition object
 * @param pattern - Pattern to match against kind
 * @returns Array of type enum values
 */
function getTypeEnumsByKindPattern(jsonData: SchemaDefinition, pattern: string): string[] {
  const allOf = jsonData?.definitions?.['node-config']?.allOf;
  if (allOf) {
    for (const condition of allOf) {
      const kindPattern = condition.if?.properties?.kind?.pattern;
      const typeEnum = condition.then?.properties?.type?.enum;

      if (kindPattern === pattern && typeEnum) {
        return typeEnum;
      }
    }
  }
  return [];
}

// Variable to store the selected option for dropdown menu
let panelNodeEditorKind: string = "nokia_srlinux";

/**
 * Populate the kind dropdown with options
 * @param options - Array of kind option strings
 */
function populateKindDropdown(options: string[]): void {
  // Get the dropdown elements by their IDs
  const dropdownTrigger = document.querySelector("#panel-node-kind-dropdown .dropdown-trigger button span");
  const dropdownContent = document.getElementById("panel-node-kind-dropdown-content");
  const dropdownButton = document.querySelector("#panel-node-kind-dropdown .dropdown-trigger button");
  const dropdownContainer = dropdownButton?.closest(".dropdown") as HTMLElement;

  if (!dropdownTrigger || !dropdownContent || !dropdownButton || !dropdownContainer) {
    log.error('Dropdown elements not found in the DOM');
    return;
  }

  // Set the initial value on the dropdown button
  dropdownTrigger.textContent = panelNodeEditorKind;

  // Clear any existing content
  dropdownContent.innerHTML = "";

  options.forEach(option => {
    // Create a new anchor element for each option
    const optionElement = document.createElement("a");
    optionElement.classList.add("dropdown-item", "label", "has-text-weight-normal", "is-small", "py-0");
    optionElement.textContent = option;
    optionElement.href = "#"; // Optional, can be adjusted as needed

    // Set an event handler for the option
    optionElement.addEventListener("click", (event) => {
      event.preventDefault(); // Prevent default link behavior

      panelNodeEditorKind = option; // Store the selected option in the variable
      log.debug(`Kind selected: ${panelNodeEditorKind}`);

      dropdownTrigger.textContent = panelNodeEditorKind;

      // Collapse the dropdown menu
      dropdownContainer.classList.remove("is-active");
    });

    // Append the option element to the dropdown content
    dropdownContent.appendChild(optionElement);
  });
}

/**
 * Initialize dropdown listeners for kind dropdown
 */
export function initializeDropdownListeners(): void {
  const dropdownButton = document.querySelector("#panel-node-kind-dropdown .dropdown-trigger button");

  if (!dropdownButton) {
    log.error('Dropdown button not found in the DOM');
    return;
  }

  const dropdownContainer = dropdownButton.closest(".dropdown") as HTMLElement;

  if (!dropdownContainer) {
    log.error('Dropdown container not found in the DOM');
    return;
  }

  // Toggle dropdown menu on button click
  dropdownButton.addEventListener("click", (event) => {
    event.stopPropagation(); // Prevents the event from bubbling up
    dropdownContainer.classList.toggle("is-active");
  });

  // Collapse the dropdown if clicked outside
  document.addEventListener("click", (event) => {
    if (
      dropdownContainer.classList.contains("is-active") &&
      !dropdownContainer.contains(event.target as Node)
    ) {
      dropdownContainer.classList.remove("is-active");
    }
  });
}

// Variable to store the selected option for dropdown menu
let panelNodeEditorTopoViewerRole: string = "pe";

/**
 * Populate the topoViewerRole dropdown with options
 * @param options - Array of topoViewerRole option strings
 */
function populateTopoViewerRoleDropdown(options: string[]): void {
  // Get the dropdown elements by their IDs
  const dropdownTrigger = document.querySelector("#panel-node-topoviewerrole-dropdown .dropdown-trigger button span");
  const dropdownContent = document.getElementById("panel-node-topoviewerrole-dropdown-content");
  const dropdownButton = document.querySelector("#panel-node-topoviewerrole-dropdown .dropdown-trigger button");
  const dropdownContainer = dropdownButton?.closest(".dropdown") as HTMLElement;

  if (!dropdownTrigger || !dropdownContent || !dropdownButton || !dropdownContainer) {
    log.error('Dropdown elements not found in the DOM');
    return;
  }

  // Set the initial value on the dropdown button
  dropdownTrigger.textContent = panelNodeEditorTopoViewerRole;

  // Clear any existing content
  dropdownContent.innerHTML = "";

  options.forEach(option => {
    // Create a new anchor element for each option
    const optionElement = document.createElement("a");
    optionElement.classList.add("dropdown-item", "label", "has-text-weight-normal", "is-small", "py-0");
    optionElement.textContent = option;
    optionElement.href = "#"; // Optional, can be adjusted as needed

    // Set an event handler for the option
    optionElement.addEventListener("click", (event) => {
      event.preventDefault(); // Prevent default link behavior

      panelNodeEditorTopoViewerRole = option; // Store the selected option in the variable
      log.debug(`TopoViewer role selected: ${panelNodeEditorTopoViewerRole}`);

      dropdownTrigger.textContent = panelNodeEditorTopoViewerRole;

      // Collapse the dropdown menu
      dropdownContainer.classList.remove("is-active");
    });

    // Append the option element to the dropdown content
    dropdownContent.appendChild(optionElement);
  });
}

/**
 * Initialize dropdown listeners for topoViewerRole dropdown
 */
export function initializeDropdownTopoViewerRoleListeners(): void {
  const dropdownButton = document.querySelector("#panel-node-topoviewerrole-dropdown .dropdown-trigger button");

  if (!dropdownButton) {
    log.error('Dropdown button not found in the DOM');
    return;
  }

  const dropdownContainer = dropdownButton.closest(".dropdown") as HTMLElement;

  if (!dropdownContainer) {
    log.error('Dropdown container not found in the DOM');
    return;
  }

  // Toggle dropdown menu on button click
  dropdownButton.addEventListener("click", (event) => {
    event.stopPropagation(); // Prevents the event from bubbling up
    dropdownContainer.classList.toggle("is-active");
  });

  // Collapse the dropdown if clicked outside
  document.addEventListener("click", (event) => {
    if (
      dropdownContainer.classList.contains("is-active") &&
      !dropdownContainer.contains(event.target as Node)
    ) {
      dropdownContainer.classList.remove("is-active");
    }
  });
}

/**
 * Save node data from the editor to file and update topology
 */
export async function saveNodeToEditorToFile(): Promise<void> {
  const nodeIdElement = document.getElementById("panel-node-editor-id");
  const nodeNameElement = document.getElementById("panel-node-editor-name") as HTMLInputElement;
  const nodeImageElement = document.getElementById("panel-node-editor-image") as HTMLInputElement;
  const nodeGroupElement = document.getElementById("panel-node-editor-group") as HTMLInputElement;

  if (!nodeIdElement || !nodeNameElement || !nodeImageElement || !nodeGroupElement) {
    log.error('Required form elements not found');
    return;
  }

  const nodeId = nodeIdElement.textContent || '';
  const cyNode = cy.$id(nodeId); // Get cytoscape node object id

  // get value from panel-node-editor
  const nodeName = nodeNameElement.value;
  const kind = panelNodeEditorKind;
  const image = nodeImageElement.value;
  const group = nodeGroupElement.value;
  const topoViewerRole = panelNodeEditorTopoViewerRole;

  log.info(`Saving node: ${nodeName} (${kind}, ${image})`);

  // save node data to cytoscape node object
  const extraData: CytoscapeExtraData = {
    "kind": kind,
    "image": image,
    "longname": "",
    "mgmtIpv4Addresss": ""
  };

  cyNode.data('name', nodeName);
  cyNode.data('parent', group);
  cyNode.data('topoViewerRole', topoViewerRole);
  cyNode.data('extraData', extraData);

  log.debug(`Updated cytoscape node: ${cyNode.id()}`);

  // dump cytoscape node object to nodeData to be persisted to dataCytoMarshall.json
  const nodeData = cy.$id(nodeId).json(); // Get JSON data of the node with the specified ID
  const endpointName = '/clab-add-node-save-topo-cyto-json';

  try {
    // Send the enhanced node data directly without wrapping it in an object
    await sendRequestToEndpointPost(endpointName, [nodeData]);
    log.info('YAML topology data saved successfully');
  } catch (error) {
    log.error(`Failed to save node data: ${error}`);
  }

  // add node to clab editor textarea
  await clabEditorAddNode(nodeId, nodeName, kind, image, group, topoViewerRole);

  await clabEditorSaveYamlTopo();
}

/**
 * Get YAML topology content from backend and set it in Monaco editor
 * @param yamlContent - Initial YAML content (optional)
 */
export async function getYamlTopoContent(yamlContent?: string): Promise<void> {
  try {
    // Check if yamlTopoContent is already set
    log.debug('Loading initial YAML topology content');

    let content = yamlContent;
    if (!content) {
      // Load the content if yamlTopoContent is empty
      content = await sendRequestToEndpointGetV3("/clab-topo-yaml-get");
    }

    log.debug('Setting YAML topology content in Monaco editor');

    // Set the content of the Monaco Editor
    if (window.monacoEditor && content) {
      window.monacoEditor.setValue(content);
    }
  } catch (error) {
    log.error(`Error occurred: ${error}`);
    // Handle errors as needed
  }
}

/**
 * Copy YAML content from Monaco editor to clipboard
 */
export function clabEditorCopyYamlContent(): void {
  const editorContent = window.monacoEditor?.getValue() || ''; // Get the text from the editor

  // eslint-disable-next-line no-undef
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    // Modern API
    // eslint-disable-next-line no-undef
    navigator.clipboard.writeText(editorContent).then(() => {
      log.info('Text copied to clipboard');
    }).catch(err => {
      log.error(`Failed to copy text: ${err}`);
    });
  } else {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = editorContent;
    document.body.appendChild(textarea);
    textarea.select();

    document.execCommand('copy');
    document.body.removeChild(textarea);

    if (bulmaToast && bulmaToast.toast) {
      bulmaToast.toast({
        message: `Hey, YAML wurde in das clipboard kopiert. 😊👌`,
        type: "is-warning is-size-6 p-3",
        duration: 4000,
        position: "top-center",
        closeOnClick: true,
      });
    }
  }
}

/**
 * Save edge data to file and update topology
 * @param edgeId - Edge identifier
 * @param sourceCyNode - Source cytoscape node
 * @param sourceNodeEndpoint - Source node endpoint interface
 * @param targetCyNode - Target cytoscape node
 * @param targetNodeEndpoint - Target node endpoint interface
 */
export async function saveEdgeToEditorToFile(
  edgeId: string,
  sourceCyNode: any,
  sourceNodeEndpoint: string,
  targetCyNode: any,
  targetNodeEndpoint: string
): Promise<void> {
  const edgeData = cy.$id(edgeId).json(); // Get JSON data of the edge with the specified ID
  const endpointName = '/clab-add-node-save-topo-cyto-json';

  try {
    // Send the enhanced edge data directly without wrapping it in an object
    await sendRequestToEndpointPost(endpointName, [edgeData]);
    log.info('Edge data saved successfully');
  } catch (error) {
    log.error(`Failed to save edge data: ${error}`);
  }

  await clabEditorAddEdge(sourceCyNode, sourceNodeEndpoint, targetCyNode, targetNodeEndpoint);
  await clabEditorSaveYamlTopo();
}

/**
 * Add an edge to the YAML topology
 * @param sourceCyNode - Source cytoscape node
 * @param sourceNodeEndpoint - Source node endpoint interface
 * @param targetCyNode - Target cytoscape node
 * @param targetNodeEndpoint - Target node endpoint interface
 */
export async function clabEditorAddEdge(
  sourceCyNode: any,
  sourceNodeEndpoint: string,
  targetCyNode: any,
  targetNodeEndpoint: string
): Promise<void> {
  // Get the content of the Monaco Editor
  const editorContent = window.monacoEditor?.getValue() || '';

  let yamlData: YamlTopology;
  try {
    // Parse the YAML content into a JavaScript object
    yamlData = jsyaml.load(editorContent) as YamlTopology || {};
  } catch (e) {
    log.error(`Failed to parse YAML content: ${e}`);
    return;
  }

  const sourceNodeName = sourceCyNode.data("name");
  const targetNodeName = targetCyNode.data("name");

  // Edge definition with dynamic endpoints array
  const edgeDefinition: YamlLink = {
    endpoints: [
      `${sourceNodeName}:${sourceNodeEndpoint}`,
      `${targetNodeName}:${targetNodeEndpoint}`
    ]
  };

  // Ensure the topology structure exists
  if (!yamlData.topology) {
    yamlData.topology = {};
  }

  // Ensure the 'links' section exists and is an array
  if (!Array.isArray(yamlData.topology.links)) {
    yamlData.topology.links = [];
  }

  // Add the edge definition to the 'links' section
  yamlData.topology.links.push(edgeDefinition);

  // Serialize the updated topology back to YAML
  const updatedYaml = jsyaml.dump(yamlData);

  // Update the Monaco Editor with the new YAML content
  if (window.monacoEditor) {
    window.monacoEditor.setValue(updatedYaml);
  }
  yamlTopoContent = updatedYaml; // Update the global or relevant state variable
}

/**
 * Delete a node from both Cytoscape and YAML topology
 * @param node - Cytoscape node to delete
 */
export async function deleteNodeToEditorToFile(node: any): Promise<void> {
  try {
    const nodeId = node.id();
    // const nodeName = node.data('name');

    log.info(`Node '${nodeId}' has been removed from Cytoscape`);

    // dump cytoscape node object to nodeData to be persisted to dataCytoMarshall.json
    // const nodeData = cy.$id(nodeId).json(); // Get JSON data of the node with the specified ID
    const endpointName = '/clab-del-node-save-topo-cyto-json';

    log.debug(`Deleting node from editor files: ${nodeId}`);

    try {
      // Send the enhanced node data directly without wrapping it in an object
      await sendRequestToEndpointPost(endpointName, [nodeId]);
      log.info('YAML topology data saved successfully');
    } catch (error) {
      log.error(`Failed to save node data: ${error}`);
    }

    // Update the YAML content in the Monaco Editor
    await clabEditorDeleteNode(nodeId);

    // Remove the node from Cytoscape
    cy.remove(node);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Failed to delete node '${node.id()}': ${errorMessage}`);
  }
}

/**
 * Delete a node from the YAML topology
 * @param nodeId - Node identifier to delete
 */
export async function clabEditorDeleteNode(nodeId: string): Promise<void> {
  // Ensure the Monaco Editor is initialized
  await monacoEditorReady;

  try {
    // Get the current YAML content from the Monaco Editor
    const editorContent = window.monacoEditor?.getValue() || '';
    log.debug('Processing YAML content for node deletion');

    // Parse the YAML content into a JavaScript object
    const yamlData: YamlTopology = jsyaml.load(editorContent) as YamlTopology || {};

    // Check if 'topology.nodes' exists and is an object
    if (!yamlData.topology?.nodes || typeof yamlData.topology.nodes !== 'object') {
      throw new Error("The 'topology.nodes' section is missing or invalid.");
    }

    // Find the actual node key, considering possible custom comments
    const nodeKey = Object.keys(yamlData.topology.nodes).find(key => key.includes(nodeId));

    if (!nodeKey) {
      log.warn(`Node '${nodeId}' does not exist in the YAML topology`);

      if (bulmaToast && bulmaToast.toast) {
        bulmaToast.toast({
          message: `Node "${nodeId}" does not exist in the YAML topology.`,
          type: "is-warning",
          duration: 4000,
          position: "top-center",
          closeOnClick: true,
        });
      }
      return;
    }

    // Remove the node from 'topology.nodes'
    delete yamlData.topology.nodes[nodeKey];
    log.info(`Node '${nodeId}' (${nodeKey}) deleted from topology.nodes`);

    // Remove any links associated with the node
    if (yamlData.topology.links && Array.isArray(yamlData.topology.links)) {
      const initialLinkCount = yamlData.topology.links.length;

      yamlData.topology.links = yamlData.topology.links.filter(link => {
        return !link.endpoints.some(endpoint => endpoint.startsWith(`${nodeKey}:`));
      });

      const removedLinksCount = initialLinkCount - yamlData.topology.links.length;
      log.info(`Removed ${removedLinksCount} link(s) associated with node '${nodeKey}'`);
    } else {
      log.warn('The topology.links section is missing or not an array. No links were removed');
    }

    // Serialize the updated JavaScript object back to YAML
    const updatedYaml = jsyaml.dump(yamlData, {
      lineWidth: -1
    });
    log.debug('Updated YAML content after node deletion');

    // Update the Monaco Editor with the new YAML content
    if (window.monacoEditor) {
      window.monacoEditor.setValue(updatedYaml);
    }
    yamlTopoContent = updatedYaml; // Update the global or relevant state variable

    log.info('YAML topology updated successfully after deleting the node');

    // Optionally, persist the changes to the backend
    await clabEditorSaveYamlTopo();
    log.info('Changes have been persisted to the backend');

    // Notify the user of the successful operation
    if (bulmaToast && bulmaToast.toast) {
      bulmaToast.toast({
        message: `Yo bro, node ${nodeId} and all its links just got totally wiped out! 🗑️💥`,
        type: "is-warning",
        duration: 3000,
        position: "top-center",
        closeOnClick: true,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Error while deleting node from YAML: ${error}`);

    if (bulmaToast && bulmaToast.toast) {
      bulmaToast.toast({
        message: `Failed to delete node: ${errorMessage}`,
        type: "is-warning",
        duration: 5000,
        position: "top-center",
        closeOnClick: true,
      });
    }
  }
}

/**
 * Delete an edge from both Cytoscape and YAML topology
 * @param edge - Cytoscape edge to delete
 */
export async function deleteEdgeToEditorToFile(edge: any): Promise<void> {
  const sourceNode = edge.data("source");
  const targetNode = edge.data("target");

  try {
    log.info(`Deleting edge between '${sourceNode}' and '${targetNode}'`);
    // Remove the edge visually from Cytoscape
    cy.remove(edge);

    try {
      // Backend endpoint for edge deletion
      const endpointName = '/clab-del-edge-save-topo-cyto-json';

      // Send the enhanced edge id directly without wrapping it in an object
      await sendRequestToEndpointPost(endpointName, [edge.data("id")]);
      log.info('YAML topology data saved successfully');
    } catch (error) {
      log.error(`Failed to save node data: ${error}`);
    }

    // Update the YAML content in the Monaco Editor
    await clabEditorDeleteEdge(edge);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Failed to delete edge between '${sourceNode}' and '${targetNode}': ${errorMessage}`);
  }
}

/**
 * Delete an edge from the YAML topology
 * @param edge - Cytoscape edge to delete
 */
export async function clabEditorDeleteEdge(edge: any): Promise<void> {
  // Ensure the Monaco Editor is initialized
  await monacoEditorReady;

  const sourceNodeId = edge.data("source");
  const targetNodeId = edge.data("target");

  log.debug(`Deleting edge: ${sourceNodeId} -> ${targetNodeId}`);

  const environments = await getEnvironments();
  const cytoTopologyJson = environments["EnvCyTopoJsonBytesAddon"];

  const sourceNode = findCytoElementById(cytoTopologyJson, sourceNodeId);
  const targetNode = findCytoElementById(cytoTopologyJson, targetNodeId);

  log.debug(`Source: ${sourceNode?.data?.name}, Target: ${targetNode?.data?.name}`);

  const sourceNodeName = sourceNode.data.name;
  const targetNodeName = targetNode.data.name;

  log.debug(`Edge deletion: ${sourceNodeName} -> ${targetNodeName}`);

  try {
    // Get the current YAML content from the Monaco Editor
    const editorContent = window.monacoEditor?.getValue() || '';
    log.debug('Processing YAML content for edge deletion');

    // Parse the YAML content into a JavaScript object
    const yamlData: YamlTopology = jsyaml.load(editorContent) as YamlTopology || {};

    // Ensure the 'topology.links' section exists and is an array
    if (!yamlData.topology?.links || !Array.isArray(yamlData.topology.links)) {
      throw new Error("The 'topology.links' section is missing or invalid.");
    }

    // Remove the link matching sourceNodeName and targetNodeName
    const initialLinkCount = yamlData.topology.links.length;
    yamlData.topology.links = yamlData.topology.links.filter(link => {
      const endpoints = link.endpoints || [];
      return !(
        (endpoints[0].startsWith(`${sourceNodeName}:`) && endpoints[1].startsWith(`${targetNodeName}:`)) ||
        (endpoints[0].startsWith(`${targetNodeName}:`) && endpoints[1].startsWith(`${sourceNodeName}:`))
      );
    });

    const removedLinksCount = initialLinkCount - yamlData.topology.links.length;
    if (removedLinksCount > 0) {
      log.info(`Removed ${removedLinksCount} link(s) between '${sourceNodeName}' and '${targetNodeName}'`);
    } else {
      log.warn(`No link found between '${sourceNodeName}' and '${targetNodeName}'`);
    }

    // Serialize the updated JavaScript object back to YAML
    const updatedYaml = jsyaml.dump(yamlData, {
      lineWidth: -1
    });
    log.debug('Updated YAML content after edge deletion');

    // Update the Monaco Editor with the new YAML content
    if (window.monacoEditor) {
      window.monacoEditor.setValue(updatedYaml);
    }
    yamlTopoContent = updatedYaml;

    log.info('YAML topology updated successfully after deleting the edge');

    // Optionally, persist the changes to the backend
    await clabEditorSaveYamlTopo();
    log.info('Changes have been persisted to the backend');

    // Notify the user of the successful operation
    if (bulmaToast && bulmaToast.toast) {
      bulmaToast.toast({
        message: `Yo bro, the link between ${sourceNodeName} and ${targetNodeName} is history, all nuked and gone! 🙌🔥`,
        type: "is-warning",
        duration: 3000,
        position: "top-center",
        closeOnClick: true,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Error while deleting edge from YAML: ${error}`);

    if (bulmaToast && bulmaToast.toast) {
      bulmaToast.toast({
        message: `Failed to delete link: ${errorMessage}`,
        type: "is-warning",
        duration: 5000,
        position: "top-center",
        closeOnClick: true,
      });
    }
  }
}