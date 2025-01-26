// nodeId is always the same as static
// nodeName can be changed

// Declare global variables at the top
var yamlTopoContent;

// Create a Promise to track when the Monaco Editor is ready
let monacoEditorReady = new Promise((resolve) => {
	// Configure Monaco Editor paths
	require.config({
		paths: {
			'vs': ' https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs'
		}
	});

	require(['vs/editor/editor.main'], function() {
		// Initialize the Monaco Editor
		window.monacoEditor = monaco.editor.create(document.getElementById('panel-clab-editor-text-area'), {
			value: '', // Initial content will be set later
			language: 'yaml', // Set the language mode
			theme: 'vs-dark', // Optional: Set editor theme
			automaticLayout: true // Adjust layout automatically
		});
		resolve(); // Resolve the Promise when the editor is ready
	});
});





function showPanelContainerlabEditor(event) {
	// Wait until the Monaco Editor is initialized
	monacoEditorReady;

	// Get the YAML content from backend
	getYamlTopoContent(yamlTopoContent);

	// Get all elements with the class "panel-overlay"
	var panelOverlays = document.getElementsByClassName("panel-overlay");
	// Loop through each element and set its display to 'none'
	for (var i = 0; i < panelOverlays.length; i++) {
		panelOverlays[i].style.display = "none";
	}
	document.getElementById("panel-clab-editor").style.display = "block";
}

// Close button event listener
function closePanelContainerlabEditor() {
	const editorPanel = document.getElementById("panel-clab-editor");
	editorPanel.style.display = "none";
}

// Function to load a file into the editor
function clabEditorLoadFile() {
	const fileInput = document.getElementById('panel-clab-editor-file-input');

	// Trigger the file input's file browser dialog
	fileInput.click();

	// Listen for when the user selects a file
	fileInput.onchange = function() {
		if (fileInput.files.length === 0) {
			return; // No file selected
		}

		const file = fileInput.files[0];
		const reader = new FileReader();

		reader.onload = function(event) {
			// Set the content of the Monaco Editor
			window.monacoEditor.setValue(event.target.result);
		};

		reader.readAsText(file);
	};
}

async function clabEditorAddNode(nodeId, nodeName, kind = 'nokia_srlinux', image = 'ghcr.io/nokia/srlinux:latest', group = 'group-01', topoViewerRole = 'dcgw') {
	// Ensure the Monaco Editor is initialized
	await monacoEditorReady;

	// Validate required parameters
	if (!nodeId || !nodeName || !kind || !image || !group || !topoViewerRole) {
		console.error("All parameters (nodeId, nodeName, kind, image, group, topoViewerRole) must be provided.");
		bulmaToast.toast({
			message: `All parameters (nodeId, nodeName, kind, image, group, topoViewerRole) must be provided.`,
			type: "is-warning",
			duration: 4000,
			position: "top-center",
			closeOnClick: true,
		});
		return;
	}

	try {
		// Get the current YAML content from the Monaco Editor
		let editorContent = window.monacoEditor.getValue();
		console.log("editorContent - clabEditorAddNode: ", editorContent); // Debug: log editorContent

		// Parse the YAML content into a JavaScript object
		let yamlData = jsyaml.load(editorContent) || {};

		// Ensure the 'topology' and 'topology.nodes' sections exist
		if (!yamlData.topology) {
			yamlData.topology = {};
			console.log("'topology' section not found. Initialized as an empty object.");
		}

		if (!yamlData.topology.nodes) {
			yamlData.topology.nodes = {};
			console.log("'topology.nodes' section not found. Initialized as an empty object.");
		} else if (typeof yamlData.topology.nodes !== 'object') {
			throw new Error("The 'topology.nodes' section is not an object.");
		}

		// Check for duplicate nodeId in the nodes section and links section
		let oldNodeName = null;
		for (const [existingNodeName, existingNode] of Object.entries(yamlData.topology.nodes)) {
			if (existingNode.labels.nodeId === nodeId) {
				oldNodeName = existingNodeName;
				console.log(`NodeId "${nodeId}" already exists under nodeName "${existingNodeName}". Updating its name to "${nodeName}".`);
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
			console.log(`Updated links to replace "${oldNodeName}" with "${nodeName}".`);
		}

		// Define the new node structure
		const newNode = {
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
		console.log(`Node "${nodeName}" added/updated in YAML data.`);

		// Serialize the updated JavaScript object back to YAML
		const updatedYaml = jsyaml.dump(yamlData);
		console.log("Updated YAML content:", updatedYaml); // Debug: log updated YAML

		// Update the Monaco Editor with the new YAML content
		window.monacoEditor.setValue(updatedYaml);
		yamlTopoContent = updatedYaml; // Update the global or relevant state variable

		console.log("YAML topology updated successfully with the new/updated node.");

		// Optionally, persist the changes to the backend
		await clabEditorSaveYamlTopo();
		console.log("Changes have been persisted to the backend.");

		// Notify the user of the successful operation
		bulmaToast.toast({
			message: `Node "${nodeName}" has been successfully added/updated.`,
			type: "is-warning",
			duration: 3000,
			position: "top-center",
			closeOnClick: true,
		});
	} catch (error) {
		console.error("Error while adding/updating node in YAML:", error);
		bulmaToast.toast({
			message: `Failed to add/update node: ${error.message}`,
			type: "is-warning",
			duration: 5000,
			position: "top-center",
			closeOnClick: true,
		});
	}
}

async function clabEditorSaveYamlTopo() {
	// Get the content of the Monaco Editor
	const editorContent = window.monacoEditor.getValue();
	clabTopoYamlEditorData = editorContent;
	console.log("clabTopoYamlEditorData - yamlTopoContent: ", clabTopoYamlEditorData)

	// Dump clabTopoYamlEditorData to be persisted to clab-topo.yaml
	const endpointName = '/clab-topo-yaml-save';

	try {
		// Send the enhanced node data directly without wrapping it in an object
		const response = await sendRequestToEndpointPost(endpointName, [clabTopoYamlEditorData]);
		console.log('Node data saved successfully', response);
	} catch (error) {
		console.error('Failed to save yaml topo:', error);
	}
}

async function showPanelNodeEditor(node) {
	// Remove all Overlayed Panels
	const panelOverlays = document.getElementsByClassName("panel-overlay");
	Array.from(panelOverlays).forEach(panel => {
		panel.style.display = "none";
	});

	console.log("showPanelNodeEditor - node ID:", node.data("id"));

	// Set the node Name in the editor
	const nodeNameInput = document.getElementById("panel-node-editor-name");
	if (nodeNameInput) {
		nodeNameInput.value = node.data("id"); // defaulted by node id
	}

	// Set the node Id in the editor
	const nodeIdLabel = document.getElementById("panel-node-editor-id");
	if (nodeIdLabel) {
		nodeIdLabel.textContent = node.data("id");
	}

	// Set the node image in the editor
	const nodeImageLabel = document.getElementById("panel-node-editor-image");
	if (nodeImageLabel) {
		nodeImageLabel.value = 'ghcr.io/nokia/srlinux:latest';
	}

	// Set the node group in the editor
	const nodeGroupLabel = document.getElementById("panel-node-editor-group");
	if (nodeGroupLabel) {
		const parentNode = node.parent();
		// Get the parent node's label
		const parentLabel = parentNode.data('name'); 
		console.log('Parent Node Label:', parentLabel);

		nodeGroupLabel.value = parentLabel;
	}

	// Display the node editor panel
	const nodeEditorPanel = document.getElementById("panel-node-editor");
	if (nodeEditorPanel) {
		nodeEditorPanel.style.display = "block";
	}

	// Fetch JSON schema from the backend
	const url = "js/clabJsonSchema-v0.59.0.json";
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP error! Status: ${response.status}`);
		}
		const jsonData = await response.json();

		// Get kind enums from the JSON data
		const {
			kindOptions
		} = getKindEnums(jsonData);
		console.log('Kind Enum:', kindOptions);

		// Populate the dropdown with fetched kindOptions
		populateKindDropdown(kindOptions);

		// Populate the dropdown with fetched topoViwerRoleOptions
		var topoViwerRoleOptions = ['bridge', 'controller', 'dcgw', 'router', 'leaf', 'pe', 'pon', 'rgw', 'server', 'super-spine', 'spine'];
		populateTopoViewerRoleDropdown(topoViwerRoleOptions);

		// List type enums based on kind pattern
		const typeOptions = getTypeEnumsByKindPattern(jsonData, '(srl|nokia_srlinux)'); // To be added to the UI
		console.log('Type Enum for (srl|nokia_srlinux):', typeOptions);

	} catch (error) {
		console.error("Error fetching or processing JSON data:", error.message);
		throw error;
	}
}

// Initialize event listener for the close button
document.getElementById("panel-node-editor-close-button").addEventListener("click", () => {
	document.getElementById("panel-node-editor").style.display = "none";
});

// Function to get kind enums from the JSON schema
function getKindEnums(jsonData) {
	let kindOptions = [];
	if (jsonData && jsonData.definitions && jsonData.definitions['node-config']) {
		kindOptions = jsonData.definitions['node-config'].properties.kind.enum || [];
	} else {
		throw new Error("Invalid JSON structure or 'kind' enum not found");
	}
	return {
		kindOptions,
		schemaData: jsonData
	};
}

// Function to get type enums based on a kind pattern
function getTypeEnumsByKindPattern(jsonData, pattern) {
	if (jsonData && jsonData.definitions && jsonData.definitions['node-config'] && jsonData.definitions['node-config'].allOf) {
		for (const condition of jsonData.definitions['node-config'].allOf) {
			if (condition.if && condition.if.properties && condition.if.properties.kind && condition.if.properties.kind.pattern === pattern) {
				if (condition.then && condition.then.properties && condition.then.properties.type && condition.then.properties.type.enum) {
					return condition.then.properties.type.enum;
				}
			}
		}
	}
	return [];
}

let panelNodeEditorKind = "nokia_srlinux"; // Variable to store the selected option for dropdown menu
// Function to populate the kind dropdown
function populateKindDropdown(options) {
	// Get the dropdown elements by their IDs
	const dropdownTrigger = document.querySelector("#panel-node-kind-dropdown .dropdown-trigger button span");
	const dropdownContent = document.getElementById("panel-node-kind-dropdown-content");
	const dropdownButton = document.querySelector("#panel-node-kind-dropdown .dropdown-trigger button");
	const dropdownContainer = dropdownButton.closest(".dropdown");

	if (!dropdownTrigger || !dropdownContent || !dropdownButton || !dropdownContainer) {
		console.error("Dropdown elements not found in the DOM.");
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
			console.log(`${panelNodeEditorKind} selected`); // Log the selected option

			dropdownTrigger.textContent = panelNodeEditorKind;

			// Collapse the dropdown menu
			dropdownContainer.classList.remove("is-active");
		});

		// Append the option element to the dropdown content
		dropdownContent.appendChild(optionElement);
	});
}

function initializeDropdownListeners() {
	const dropdownButton = document.querySelector("#panel-node-kind-dropdown .dropdown-trigger button");

	if (!dropdownButton) {
		console.error("Dropdown button not found in the DOM.");
		return;
	}

	const dropdownContainer = dropdownButton.closest(".dropdown");

	if (!dropdownContainer) {
		console.error("Dropdown container not found in the DOM.");
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
			!dropdownContainer.contains(event.target)
		) {
			dropdownContainer.classList.remove("is-active");
		}
	});
}

let panelNodeEditorTopoViewerRole = "pe"; // Variable to store the selected option for dropdown menu
// Function to populate the topoViewerRole dropdown
function populateTopoViewerRoleDropdown(options) {
	// Get the dropdown elements by their IDs
	const dropdownTrigger = document.querySelector("#panel-node-topoviewerrole-dropdown .dropdown-trigger button span");
	const dropdownContent = document.getElementById("panel-node-topoviewerrole-dropdown-content");
	const dropdownButton = document.querySelector("#panel-node-topoviewerrole-dropdown .dropdown-trigger button");
	const dropdownContainer = dropdownButton.closest(".dropdown");

	if (!dropdownTrigger || !dropdownContent || !dropdownButton || !dropdownContainer) {
		console.error("Dropdown elements not found in the DOM.");
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
			console.log(`${panelNodeEditorTopoViewerRole} selected`); // Log the selected option

			dropdownTrigger.textContent = panelNodeEditorTopoViewerRole;

			// Collapse the dropdown menu
			dropdownContainer.classList.remove("is-active");
		});

		// Append the option element to the dropdown content
		dropdownContent.appendChild(optionElement);
	});
}

function initializeDropdownTopoViewerRoleListeners() {
	const dropdownButton = document.querySelector("#panel-node-topoviewerrole-dropdown .dropdown-trigger button");

	if (!dropdownButton) {
		console.error("Dropdown button not found in the DOM.");
		return;
	}

	const dropdownContainer = dropdownButton.closest(".dropdown");

	if (!dropdownContainer) {
		console.error("Dropdown container not found in the DOM.");
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
			!dropdownContainer.contains(event.target)
		) {
			dropdownContainer.classList.remove("is-active");
		}
	});
}

// Function to save node data from the editor
// Adjusted saveNodeToEditorToFile function
// update node data in the editor, save cyto json to file dataCytoMarshall.json and save to clab topo.yaml
async function saveNodeToEditorToFile() {
	const nodeId = document.getElementById("panel-node-editor-id").textContent
	var cyNode = cy.$id(nodeId); // Get cytoscpe node object id

	// get value from panel-node-editor
	nodeName = document.getElementById("panel-node-editor-name").value
	kind = panelNodeEditorKind
	image = document.getElementById("panel-node-editor-image").value
	group = document.getElementById("panel-node-editor-group").value
	topoViewerRole = panelNodeEditorTopoViewerRole

	console.log("panelEditorNodeName", nodeName)
	console.log("panelEditorkind", kind)
	console.log("panelEditorImage", image)
	console.log("panelEditorGroup", group)
	console.log("panelEditorTopoViewerRole", topoViewerRole)

	// save node data to cytoscape node object
	var extraData = {
		"kind": kind,
		"image": image,
		"longname": "",
		"mgmtIpv4Addresss": ""
	};

	cyNode.data(('name'), nodeName)
	cyNode.data(('parent'), group)
	cyNode.data(('topoViewerRole'), topoViewerRole)
	cyNode.data(('extraData'), extraData)

	console.log('cyto node object data: ', cyNode);

	// dump cytoscape node object to nodeData to be persisted to dataCytoMarshall.json
	var nodeData = cy.$id(nodeId).json(); // Get JSON data of the node with the specified ID
	const endpointName = '/clab-add-node-save-topo-cyto-json';

	try {
		// Send the enhanced node data directly without wrapping it in an object
		const response = await sendRequestToEndpointPost(endpointName, [nodeData]);
		console.log('Node data saved successfully', response);
	} catch (error) {
		console.error('Failed to save node data:', error);
	}

	// add node to clab editor textarea
	await clabEditorAddNode(nodeId, nodeName, kind, image, group, topoViewerRole)

	await clabEditorSaveYamlTopo()
}

async function getYamlTopoContent(yamlTopoContent) {
	// Wait until the Monaco Editor is initialized
	// await monacoEditorReady;

	try {
		// Check if yamlTopoContent is already set
		console.log('YAML Topo Initial Content:', yamlTopoContent);

		if (!yamlTopoContent) {
			// Load the content if yamlTopoContent is empty
			yamlTopoContent = await sendRequestToEndpointGetV3("/clab-topo-yaml-get");
		}

		console.log('YAML Topo Content:', yamlTopoContent);

		// Set the content of the Monaco Editor
		window.monacoEditor.setValue(yamlTopoContent);
	} catch (error) {
		console.error("Error occurred:", error);
		// Handle errors as needed
	}
}

function clabEditorCopyYamlContent() {
	const editorContent = window.monacoEditor.getValue(); // Get the text from the editor
	if (navigator.clipboard && navigator.clipboard.writeText) {
		// Modern API
		navigator.clipboard.writeText(editorContent).then(() => {
			alert('Text copied to clipboard!');
		}).catch(err => {
			console.error('Failed to copy text: ', err);
		});
	} else {
		// Fallback for older browsers
		const textarea = document.createElement('textarea');
		textarea.value = editorContent;
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand('copy');
		document.body.removeChild(textarea);

		bulmaToast.toast({
			message: `Hey, YAML wurde in das clipboard kopiert. 😊👌`,
			type: "is-warning is-size-6 p-3",
			duration: 4000,
			position: "top-center",
			closeOnClick: true,
		});
	}
}

async function saveEdgeToEditorToFile(edgeId, sourceCyNode, sourceNodeEndpoint, targetCyNode, targetNodeEndpoint) {
	const edgeData = cy.$id(edgeId).json(); // Get JSON data of the edge with the specified ID
	const endpointName = '/clab-add-node-save-topo-cyto-json';

	try {
		// Send the enhanced edge data directly without wrapping it in an object
		const response = await sendRequestToEndpointPost(endpointName, [edgeData]);
		console.log('Edge data saved successfully', response);
	} catch (error) {
		console.error('Failed to save edge data:', error);
	}

	await clabEditorAddEdge(sourceCyNode, sourceNodeEndpoint, targetCyNode, targetNodeEndpoint)

	await clabEditorSaveYamlTopo()
}

async function clabEditorAddEdge(sourceCyNode, sourceNodeEndpoint, targetCyNode, targetNodeEndpoint) {
	// Get the content of the Monaco Editor
	let editorContent = window.monacoEditor.getValue();
	let topology;

	try {
		// Parse the YAML content into a JavaScript object
		yamlData = jsyaml.load(editorContent) || {};

	} catch (e) {
		console.error("Failed to parse YAML content:", e);
		return;
	}

	const sourceNodeName = sourceCyNode.data("name");
	const targetNodeName = targetCyNode.data("name");

	// Edge definition with dynamic endpoints array
	const edgeDefinition = {
		endpoints: [
			`${sourceNodeName}:${sourceNodeEndpoint}`,
			`${targetNodeName}:${targetNodeEndpoint}`
		]
	};

	// Ensure the 'links' section exists and is an array
	if (!Array.isArray(yamlData.topology.links)) {
		yamlData.topology.links = [];
	}

	// Add the edge definition to the 'links' section
	yamlData.topology.links.push(edgeDefinition);

	// Serialize the updated topology back to YAML
	const updatedYaml = jsyaml.dump(yamlData);

	// Update the Monaco Editor with the new YAML content
	window.monacoEditor.setValue(updatedYaml);
	yamlTopoContent = updatedYaml; // Update the global or relevant state variable
}

async function deleteNodeToEditorToFile(node) {
	try {
		const nodeId = node.id();
		const nodeName = node.data('name');

		console.log(`Node "${nodeId}" has been removed from Cytoscape.`);

		// dump cytoscape node object to nodeData to be persisted to dataCytoMarshall.json
		var nodeData = cy.$id(nodeId).json(); // Get JSON data of the node with the specified ID
		const endpointName = '/clab-del-node-save-topo-cyto-json';

		console.log("nodeId - deleteNodeToEditorToFile: ", nodeId);

		try {
			// Send the enhanced node data directly without wrapping it in an object
			const response = await sendRequestToEndpointPost(endpointName, [nodeId]);
			console.log('Node data saved successfully', response);
		} catch (error) {
			console.error('Failed to save node data:', error);
		}

		// Update the YAML content in the Monaco Editor
		await clabEditorDeleteNode(nodeId)

		// Remove the node from Cytoscape
		cy.remove(node);

	} catch (error) {
		console.error(`Failed to delete node "${node.id()}":`, error);
		alert(`Failed to delete node "${node.id()}": ${error.message}`);
	}
}

async function clabEditorDeleteNode(nodeId) {
	// Ensure the Monaco Editor is initialized
	await monacoEditorReady;

	try {
		// Get the current YAML content from the Monaco Editor
		let editorContent = window.monacoEditor.getValue();
		console.log("editorContent - clabEditorDeleteNode:", editorContent); // Debug: log editorContent

		// Parse the YAML content into a JavaScript object
		let yamlData = jsyaml.load(editorContent) || {};

		// Check if 'topology.nodes' exists and is an object
		if (!yamlData.topology || !yamlData.topology.nodes || typeof yamlData.topology.nodes !== 'object') {
			throw new Error("The 'topology.nodes' section is missing or invalid.");
		}

		// Find the actual node key, considering possible custom comments
		const nodeKey = Object.keys(yamlData.topology.nodes).find(key => key.includes(nodeId));

		if (!nodeKey) {
			console.warn(`Node "${nodeId}" does not exist in the YAML topology.`);
			bulmaToast.toast({
				message: `Node "${nodeId}" does not exist in the YAML topology.`,
				type: "is-warning",
				duration: 4000,
				position: "top-center",
				closeOnClick: true,
			});
			return;
		}

		// Remove the node from 'topology.nodes'
		delete yamlData.topology.nodes[nodeKey];
		console.log(`Node "${nodeId}" (key: "${nodeKey}") has been deleted from 'topology.nodes'.`);

		// Remove any links associated with the node
		if (yamlData.topology.links && Array.isArray(yamlData.topology.links)) {
			const initialLinkCount = yamlData.topology.links.length;

			yamlData.topology.links = yamlData.topology.links.filter(link => {
				return !link.endpoints.some(endpoint => endpoint.startsWith(`${nodeKey}:`));
			});

			const removedLinksCount = initialLinkCount - yamlData.topology.links.length;
			console.log(`Removed ${removedLinksCount} link(s) associated with node "${nodeKey}".`);
		} else {
			console.warn("The 'topology.links' section is missing or not an array. No links were removed.");
		}

		// Serialize the updated JavaScript object back to YAML
		const updatedYaml = jsyaml.dump(yamlData, {
			lineWidth: -1
		});
		console.log("Updated YAML content after node deletion:", updatedYaml); // Debug: log updated YAML

		// Update the Monaco Editor with the new YAML content
		window.monacoEditor.setValue(updatedYaml);
		yamlTopoContent = updatedYaml; // Update the global or relevant state variable

		console.log("YAML topology updated successfully after deleting the node.");

		// Optionally, persist the changes to the backend
		await clabEditorSaveYamlTopo();
		console.log("Changes have been persisted to the backend.");

		// Notify the user of the successful operation
		bulmaToast.toast({
			message: `Yo bro, node ${nodeId} and all its links just got totally wiped out! 🗑️💥`,
			type: "is-warning",
			duration: 3000,
			position: "top-center",
			closeOnClick: true,
		});
	} catch (error) {
		console.error("Error while deleting node from YAML:", error);
		bulmaToast.toast({
			message: `Failed to delete node: ${error.message}`,
			type: "is-warning",
			duration: 5000,
			position: "top-center",
			closeOnClick: true,
		});
	}
}

async function deleteEdgeToEditorToFile(edge) {
	sourceNode = edge.data("source")
	targetNode = edge.data("target")

	try {
		console.log(`Deleting edge between "${sourceNode}" and "${targetNode}" from Cytoscape and YAML.`);
		// Remove the edge visually from Cytoscape
		cy.remove(edge);

		try {
			// Backend endpoint for edge deletion
			const endpointName = '/clab-del-edge-save-topo-cyto-json';

			// Send the enhanced edge id directly without wrapping it in an object
			const response = await sendRequestToEndpointPost(endpointName, [edge.data("id")]);
			console.log('Node data saved successfully', response);
		} catch (error) {
			console.error('Failed to save node data:', error);
		}

		// // Update the YAML content in the Monaco Editor
		await clabEditorDeleteEdge(edge);

	} catch (error) {
		console.error(`Failed to delete edge between "${sourceNode}" and "${targetNode}":`, error);
		alert(`Failed to delete edge between "${sourceNode}" and "${targetNode}": ${error.message}`);
	}
}

async function clabEditorDeleteEdge(edge) {
	// Ensure the Monaco Editor is initialized
	await monacoEditorReady;

	sourceNodeId = edge.data("source")
	targetNodeId = edge.data("target")

	console.log("sourceNodeId - clabEditorDeleteEdge: ", sourceNodeId)
	console.log("targetNodeId - clabEditorDeleteEdge: ", targetNodeId)

	environments = await getEnvironments();
	cytoTopologyJson = environments["EnvCyTopoJsonBytesAddon"]

	sourceNode = findCytoElementById(cytoTopologyJson, sourceNodeId)
	targetNode = findCytoElementById(cytoTopologyJson, targetNodeId)

	console.log("sourceNode - clabEditorDeleteEdge: ", sourceNode)
	console.log("targetNode - clabEditorDeleteEdge: ", targetNode)

	sourceNodeName = sourceNode.data.name
	targetNodeName = targetNode.data.name


	console.log("sourceNodeName - clabEditorDeleteEdge: ", sourceNodeName)
	console.log("targetNodeName - clabEditorDeleteEdge: ", targetNodeName)


	try {
		// Get the current YAML content from the Monaco Editor
		let editorContent = window.monacoEditor.getValue();
		console.log("editorContent - clabEditorDeleteEdge:", editorContent);

		// Parse the YAML content into a JavaScript object
		let yamlData = jsyaml.load(editorContent) || {};

		// Ensure the 'topology.links' section exists and is an array
		if (!yamlData.topology || !yamlData.topology.links || !Array.isArray(yamlData.topology.links)) {
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
			console.log(`Removed ${removedLinksCount} link(s) between "${sourceNodeName}" and "${targetNodeName}".`);
		} else {
			console.warn(`No link found between "${sourceNodeName}" and "${targetNodeName}".`);
		}

		// Serialize the updated JavaScript object back to YAML
		const updatedYaml = jsyaml.dump(yamlData, {
			lineWidth: -1
		});
		console.log("Updated YAML content after edge deletion:", updatedYaml);

		// Update the Monaco Editor with the new YAML content
		window.monacoEditor.setValue(updatedYaml);
		yamlTopoContent = updatedYaml;

		console.log("YAML topology updated successfully after deleting the edge.");

		// Optionally, persist the changes to the backend
		await clabEditorSaveYamlTopo();
		console.log("Changes have been persisted to the backend.");

		// Notify the user of the successful operation
		bulmaToast.toast({
			message: `Yo bro, the link between ${sourceNodeName} and ${targetNodeName} is history, all nuked and gone! 🙌🔥`,
			type: "is-warning",
			duration: 3000,
			position: "top-center",
			closeOnClick: true,
		});
	} catch (error) {
		console.error("Error while deleting edge from YAML:", error);
		bulmaToast.toast({
			message: `Failed to delete link: ${error.message}`,
			type: "is-warning",
			duration: 5000,
			position: "top-center",
			closeOnClick: true,
		});
	}
}