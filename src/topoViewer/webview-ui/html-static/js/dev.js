// Initialize a state variable to track the element's presence
var isPanel01Cy = false;
var nodeClicked = false;
var edgeClicked = false;

var cy

var globalSelectedNode
var globalSelectedEdge

var linkEndpointVisibility = true;
var nodeContainerStatusVisibility = false;

var globalShellUrl = "/js/cloudshell"

var labName
var deploymentType

var multiLayerViewPortState = false;

// cytoscape-leaflet variables
var isGeoMapInitialized = false;
var cytoscapeLeafletMap;
var cytoscapeLeafletLeaf;



document.addEventListener("DOMContentLoaded", async function () {

	// hortizontal layout
	// function initializeResizingLogic() {
	// 	// Get elements with checks
	// 	const divider = document.getElementById('divider');
	// 	const dataDisplay = document.getElementById('data-display');
	// 	const rootDiv = document.getElementById('root-div');
	// 	const togglePanelButton = document.getElementById('toggle-panel');

	// 	// Check for required elements
	// 	if (!divider || !dataDisplay || !rootDiv || !togglePanelButton) {
	// 	  console.warn('One or more required elements for resizing logic are missing. Initialization aborted.');
	// 	  return;
	// 	}

	// 	let isDragging = false;
	// 	let resizeTimeout;

	// 	// Debounce function
	// 	function debounce(func, delay) {
	// 	  clearTimeout(resizeTimeout);
	// 	  resizeTimeout = setTimeout(func, delay);
	// 	}

	// 	// Function to animate cy.fit()
	// 	function animateFit() {
	// 	  if (typeof cy.animate === 'function') {
	// 		cy.animate({
	// 		  fit: {
	// 			padding: 10, // Add padding around the graph
	// 		  },
	// 		  duration: 500, // Animation duration in milliseconds
	// 		});
	// 	  } else {
	// 		console.warn('Cytoscape instance does not support animate. Skipping animation.');
	// 	  }
	// 	}

	// 	// Handle dragging
	// 	divider.addEventListener('mousedown', () => {
	// 	  isDragging = true;
	// 	  document.body.style.cursor = 'ns-resize';
	// 	});

	// 	document.addEventListener('mousemove', (e) => {
	// 	  if (!isDragging) return;

	// 	  const screenHeight = window.innerHeight;
	// 	  const offsetY = e.clientY;
	// 	  const minHeight = 5; // Minimum height for data display
	// 	  const maxHeight = screenHeight * 0.95; // Maximum height for data display

	// 	  const dataDisplayHeight = screenHeight - offsetY;
	// 	  if (dataDisplayHeight >= minHeight && dataDisplayHeight <= maxHeight) {
	// 		const rootDivHeight = screenHeight - dataDisplayHeight;

	// 		// Update heights
	// 		dataDisplay.style.height = `${(dataDisplayHeight / screenHeight) * 100}%`;
	// 		rootDiv.style.height = `${(rootDivHeight / screenHeight) * 100}%`;

	// 		// Add or remove transparency
	// 		if ((dataDisplayHeight / screenHeight) * 100 > 60) {
	// 		  dataDisplay.classList.add('transparent');
	// 		} else {
	// 		  dataDisplay.classList.remove('transparent');
	// 		}
	// 	  }

	// 	  // Debounce the animation
	// 	  debounce(() => {
	// 		console.info('Fitting Cytoscape to new size with animation');
	// 		animateFit();
	// 	  }, 500); // Delay of 500ms
	// 	});

	// 	document.addEventListener('mouseup', () => {
	// 	  isDragging = false;
	// 	  document.body.style.cursor = 'default';
	// 	});

	// 	// Toggle panel visibility
	// 	togglePanelButton.addEventListener('click', () => {
	// 	  const isHidden = parseFloat(dataDisplay.style.height) <= 5;
	// 	  if (isHidden) {
	// 		// Restore to default
	// 		dataDisplay.style.height = '30%';
	// 		rootDiv.style.height = '70%';
	// 		togglePanelButton.textContent = 'Hide';
	// 		dataDisplay.classList.remove('transparent');
	// 	  } else {
	// 		// Collapse to 5%
	// 		dataDisplay.style.height = '5%';
	// 		rootDiv.style.height = '95%';
	// 		togglePanelButton.textContent = 'Show';
	// 		dataDisplay.classList.add('transparent');
	// 	  }

	// 	  // Animate fit after toggling
	// 	  debounce(() => {
	// 		console.info('Fitting Cytoscape to new size with animation');
	// 		animateFit();
	// 	  }, 500); // Delay of 500ms
	// 	});
	//   }

	// vertical layout
	function initializeResizingLogic() {
		// Get elements with checks
		const divider = document.getElementById('divider');
		const dataDisplay = document.getElementById('data-display');
		const rootDiv = document.getElementById('root-div');
		const togglePanelButtonExpand = document.getElementById('toggle-panel-data-display-expand');
		const togglePanelButtonCollapse = document.getElementById('toggle-panel-data-display-collapse');

		// Check for required elements
		if (!divider || !dataDisplay || !rootDiv || !togglePanelButtonExpand) {
			console.warn('One or more required elements for resizing logic are missing. Initialization aborted.');
			return;
		}

		let isDragging = false;
		let resizeTimeout;

		// Debounce function
		function debounce(func, delay) {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(func, delay);
		}

		// Function to animate cy.fit()
		function animateFit() {
			if (typeof cy.animate === 'function') {
				cy.animate({
					fit: {
						padding: 10, // Add padding around the graph
					},
					duration: 500, // Animation duration in milliseconds
				});
			} else {
				console.warn('Cytoscape instance does not support animate. Skipping animation.');
			}
		}

		// Handle dragging
		divider.addEventListener('mousedown', () => {
			isDragging = true;
			document.body.style.cursor = 'ew-resize';
		});

		document.addEventListener('mousemove', (e) => {
			if (!isDragging) return;

			const screenWidth = window.innerWidth;
			const offsetX = e.clientX; // divider’s X from the LEFT
			const minWidth = 5; // Minimum width in pixels for data-display
			const maxWidth = screenWidth * 1; // Maximum width in pixels for data-display

			// dataDisplayWidth is from divider to right edge:
			const dataDisplayWidth = screenWidth - offsetX;

			if (dataDisplayWidth >= minWidth && dataDisplayWidth <= maxWidth) {
				// The rest (from left edge to divider) is rootDivWidth
				const rootDivWidth = offsetX;

				// Convert to percentage
				const rootDivPercent = (rootDivWidth / screenWidth) * 100;
				const dataDisplayPercent = (dataDisplayWidth / screenWidth) * 100;

				// Position the divider at the same left as rootDiv’s right edge
				divider.style.left = rootDivPercent + '%';

				// rootDiv occupies the left portion
				rootDiv.style.width = rootDivPercent + '%';

				// dataDisplay starts where rootDiv ends
				dataDisplay.style.left = rootDivPercent + '%';
				dataDisplay.style.width = dataDisplayPercent + '%';


				// Add or remove transparency
				if ((dataDisplayWidth / rootDivWidth) * 100 > 60) {
					dataDisplay.classList.add('transparent');

				} else {
					dataDisplay.classList.remove('transparent');
					// Debounce the animation
					debounce(() => {
						console.info('Fitting Cytoscape to new size with animation');
						animateFit();
					}, 500); // Delay of 500ms
				}
			}


		});

		document.addEventListener('mouseup', () => {
			isDragging = false;
			document.body.style.cursor = 'default';
		});

		// Toggle panel visibility
		togglePanelButtonExpand.addEventListener('click', () => {
			// rootDiv gets ~7%; dataDisplay gets ~93%
			// rootDiv.style.width         = '27%';
			divider.style.left = '7%';
			dataDisplay.style.left = '7%';
			dataDisplay.style.width = '93%';
			dataDisplay.classList.add('transparent');
		});

		// Toggle panel visibility
		togglePanelButtonCollapse.addEventListener('click', () => {
			// rootDiv gets ~98.5%; dataDisplay ~1.5%
			rootDiv.style.width = '98.5%';
			divider.style.left = '98.5%';
			dataDisplay.style.left = '98.5%';
			dataDisplay.style.width = '1.5%';
			dataDisplay.classList.remove('transparent');


			console.info('togglePanelButtonExpand - dataDisplay.style.width: ', dataDisplay.style.width);
			console.info('togglePanelButtonExpand - rootDiv.style.width: ', rootDiv.style.width);
			console.info('togglePanelButtonExpand - divider.style.left: ', divider.style.left);

			// Animate fit after toggling
			debounce(() => {
				console.info('Fitting Cytoscape to new size with animation');
				animateFit();
			}, 500); // Delay of 500ms

		});
	}


 	// aarafat-tag: vs-code
	initUptime();
	runMyBackendCall() 

	// Call the function during initialization
	initializeResizingLogic(cy);




	detectColorScheme()
	await changeTitle()

	initializeDropdownTopoViewerRoleListeners();
	initializeDropdownListeners();
	initViewportDrawerClabEditoCheckboxToggle()
	initViewportDrawerGeoMapCheckboxToggle()

	insertAndColorSvg("nokia-logo", "white")

	// Reusable function to initialize a WebSocket connection
	function initializeWebSocket(url, onMessageCallback) {
		const protocol = location.protocol === "https:" ? "wss://" : "ws://";
		const socket = new WebSocket(protocol + location.host + url);

		socket.onopen = () => {
			console.info(`Successfully connected WebSocket to ${url}`);
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(`Hi From the WebSocketClient-${url}`);
			}
		};

		socket.onclose = (event) => {
			console.info(`Socket to ${url} closed: `, event);
			socket.send("Client Closed!");
		};

		socket.onerror = (error) => {
			console.info(`Socket to ${url} error: `, error);
		};

		socket.onmessage = onMessageCallback;

		return socket;
	}

	// aarafat-tag: vs-code
	// WebSocket for uptime
	// const socketUptime = initializeWebSocket("/uptime", async (msgUptime) => {
	// 	environments = await getEnvironments();
	// 	labName = environments["clab-name"]
	// 	deploymentType = environments["deploymentType"]

	// 	console.info("initializeWebSocket - getEnvironments", environments)
	// 	console.info("initializeWebSocket - labName", environments["clab-name"])

	// 	const string01 = "Containerlab Topology: " + labName;
	// 	const string02 = " ::: Uptime: " + msgUptime.data;

	// 	const ClabSubtitle = document.getElementById("ClabSubtitle");
	// 	const messageBody = string01 + string02;

	// 	ClabSubtitle.innerText = messageBody;
	// 	console.info(ClabSubtitle.innerText);
	// });

	async function initUptime() {
		environments = await getEnvironments();
		labName = environments["clab-name"]
		deploymentType = environments["deploymentType"]

		console.info("initializeWebSocket - getEnvironments", environments)
		console.info("initializeWebSocket - labName", environments["clab-name"])

		const string01 = "Containerlab Topology: " + labName;
		const string02 = " ::: Uptime: " + "msgUptime.data";

		const ClabSubtitle = document.getElementById("ClabSubtitle");
		const messageBody = string01 + string02;

		ClabSubtitle.innerText = messageBody;
		console.info(ClabSubtitle.innerText);
	}

	// aarafat-tag: vs-code
	// // WebSocket for ContainerNodeStatus
	// const socketContainerNodeStatusInitial = initializeWebSocket(
	// 	"/containerNodeStatus",
	// 	(msgContainerNodeStatus) => {
	// 		try {
	// 			const {
	// 				Names,
	// 				Status,
	// 				State
	// 			} = JSON.parse(msgContainerNodeStatus.data);
	// 			setNodeContainerStatus(Names, Status);
	// 			console.info(JSON.parse(msgContainerNodeStatus.data));

	// 			const IPAddress = JSON.parse(msgContainerNodeStatus.data).Networks.Networks.clab.IPAddress;
	// 			const GlobalIPv6Address = JSON.parse(msgContainerNodeStatus.data).Networks.Networks.clab.GlobalIPv6Address


	// 			setNodeDataWithContainerAttribute(Names, Status, State, IPAddress, GlobalIPv6Address);

	// 		} catch (error) {
	// 			console.error("Error parsing JSON:", error);
	// 		}
	// 	},
	// );

	// helper functions for cytoscapePopper
	function popperFactory(ref, content, opts) {
		const popperOptions = {
			middleware: [
				FloatingUIDOM.flip(),
				FloatingUIDOM.shift({
					limiter: FloatingUIDOM.limitShift()
				})
			],
			...opts,
		};

		function update() {
			FloatingUIDOM.computePosition(ref, content, popperOptions).then(({
				x,
				y
			}) => {
				Object.assign(content.style, {
					left: `${x}px`,
					top: `${y}px`,
				});
			});
		}
		update();
		return {
			update
		};
	}

	// init cytoscapePopper
	cytoscape.use(cytoscapePopper(popperFactory));


	// Instantiate Cytoscape.js
	cy = cytoscape({
		container: document.getElementById("cy"),
		elements: [],
		style: [{
			selector: "node",
			style: {
				"background-color": "#3498db",
				label: "data(label)",
			},
		},],
		boxSelectionEnabled: true,
		selectionType: 'additive' // Allow additive selection

	});


	// Listen for selection events
	cy.on('select', 'node', (event) => {
		const selectedNodes = cy.$('node:selected');
		// Dynamically style selected nodes
		selectedNodes.style({
			'border-width': 2,
			'border-color': '#ff0000'
		});
		console.info('Selected nodes:', selectedNodes.map(n => n.id()));
	});

	// Optionally, reset the style when nodes are unselected
	cy.on('unselect', 'node', (event) => {
		// Clear inline styles for all nodes
		loadCytoStyle(cy);
		console.info('Remaining selected nodes:', cy.$('node:selected').map(n => n.id()));
	});

	// Optionally, reset the style when edges are unselected
	cy.on('unselect', 'edge', (event) => {
		// Clear inline styles for all nodes
		loadCytoStyle(cy);
		console.info('Remaining selected nodes:', cy.$('node:selected').map(n => n.id()));
	});

	// Programmatic selection of nodes
	setTimeout(() => {
		cy.$('#node1, #node2').select(); // Select node1 and node2 after 2 seconds
		console.info('Programmatic selection: node1 and node2');
	}, 2000);

	// Helper function to check if a node is inside a parent
	function isNodeInsideParent(node, parent) {
		const parentBox = parent.boundingBox();
		const nodePos = node.position();
		return (
			nodePos.x >= parentBox.x1 &&
			nodePos.x <= parentBox.x2 &&
			nodePos.y >= parentBox.y1 &&
			nodePos.y <= parentBox.y2
		);
	}

	// Drag-and-Drop logic
	cy.on('dragfree', 'node', (event) => {
		const isViewportDrawerClabEditorCheckboxChecked = setupCheckboxListener('#viewport-drawer-clab-editor-content-01 .checkbox-input');
		if (isViewportDrawerClabEditorCheckboxChecked) {
			const draggedNode = event.target;

			// Check all parent nodes to see if the dragged node is inside
			const parents = cy.nodes(':parent');
			let assignedParent = null;

			parents.forEach((parent) => {
				if (isNodeInsideParent(draggedNode, parent)) {
					assignedParent = parent;
				}
			});

			if (assignedParent) {
				// If dragged inside a parent, move the node to the parent
				draggedNode.move({
					parent: assignedParent.id()
				});
				console.info(`${draggedNode.id()} became a child of ${assignedParent.id()}`);
				showPanelNodeEditor(draggedNode)
			}
			// to release the node from the parent, alt + shift + click on the node.
		}

	})

	// Initialize edgehandles with configuration
	const eh = cy.edgehandles({
		// Enable preview of edge before finalizing
		preview: false,
		hoverDelay: 50, // time spent hovering over a target node before it is considered selected
		snap: false, // when enabled, the edge can be drawn by just moving close to a target node (can be confusing on compound graphs)
		snapThreshold: 10, // the target node must be less than or equal to this many pixels away from the cursor/finger
		snapFrequency: 150, // the number of times per second (Hz) that snap checks done (lower is less expensive)
		noEdgeEventsInDraw: false, // set events:no to edges during draws, prevents mouseouts on compounds
		disableBrowserGestures: false, // during an edge drawing gesture, disable browser gestures such as two-finger trackpad swipe and pinch-to-zoom
		canConnect: function (sourceNode, targetNode) {
			// whether an edge can be created between source and target
			return !sourceNode.same(targetNode) && !sourceNode.isParent() && !targetNode.isParent();
		},
		edgeParams: function (sourceNode, targetNode) {
			// for edges between the specified source and target
			// return element object to be passed to cy.add() for edge
			return {};
		},
	});

	// Enable edgehandles functionality
	eh.enable();

	let isEdgeHandlerActive = false; // Flag to track if edge handler is active

	cy.on('ehcomplete', async (event, sourceNode, targetNode, addedEdge) => {
		console.info(`Edge created from ${sourceNode.id()} to ${targetNode.id()}`);
		console.info("Added edge:", addedEdge);

		// Reset the edge handler flag after a short delay
		setTimeout(() => {
			isEdgeHandlerActive = false;
		}, 100); // Adjust delay as needed

		// Get the ID of the added edge
		const edgeId = addedEdge.id(); // Extracts the edge ID

		// Helper function to get the next available endpoint with pattern detection
		function getNextEndpoint(nodeId) {
			// Get all edges connected to the node, both as source and target
			const edges = cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);
			const e1Pattern = /^e1-(\d+)$/;
			const ethPattern = /^eth(\d+)$/;
			let usedNumbers = new Set();
			let selectedPattern = null; // Determine the pattern based on existing endpoints

			edges.forEach(edge => {
				// Check both sourceEndpoint and targetEndpoint for the connected node
				['sourceEndpoint', 'targetEndpoint'].forEach(key => {
					const endpoint = edge.data(key);
					// Skip if the endpoint is not associated with the current node
					const isNodeEndpoint = (edge.data('source') === nodeId && key === 'sourceEndpoint') ||
						(edge.data('target') === nodeId && key === 'targetEndpoint');
					if (!endpoint || !isNodeEndpoint) return;

					let match = endpoint.match(e1Pattern);
					if (match) {
						// Endpoint matches e1- pattern
						const endpointNum = parseInt(match[1], 10);
						usedNumbers.add(endpointNum);
						if (!selectedPattern) selectedPattern = e1Pattern;
					} else {
						match = endpoint.match(ethPattern);
						if (match) {
							// Endpoint matches eth pattern
							const endpointNum = parseInt(match[1], 10);
							usedNumbers.add(endpointNum);
							if (!selectedPattern) selectedPattern = ethPattern;
						}
					}
				});
			});

			// If no pattern was detected, default to e1Pattern
			if (!selectedPattern) {
				selectedPattern = e1Pattern;
			}

			// Find the smallest unused number
			let endpointNum = 1;
			while (usedNumbers.has(endpointNum)) {
				endpointNum++;
			}

			// Return the new endpoint formatted according to the pattern
			return selectedPattern === e1Pattern ?
				`e1-${endpointNum}` :
				`eth${endpointNum}`;
		}

		// Calculate next available source and target endpoints
		const sourceEndpoint = getNextEndpoint(sourceNode.id(), true);
		const targetEndpoint = getNextEndpoint(targetNode.id(), false);

		// Add calculated endpoints to the edge data
		addedEdge.data('sourceEndpoint', sourceEndpoint);
		addedEdge.data('targetEndpoint', targetEndpoint);

		// Add editor flag to the edge data
		addedEdge.data('editor', 'true');

		await showPanelContainerlabEditor(event)

		// Save the edge element to file in the server CY and Yaml
		await saveEdgeToEditorToFile(edgeId, sourceNode, sourceEndpoint, targetNode, targetEndpoint);
	});

	loadCytoStyle(cy);


	// Enable grid guide extension
	cy.gridGuide({
		// On/Off Modules
		snapToGridOnRelease: true,
		snapToGridDuringDrag: false,
		snapToAlignmentLocationOnRelease: true,
		snapToAlignmentLocationDuringDrag: false,
		distributionGuidelines: false,
		geometricGuideline: false,
		initPosAlignment: false,
		centerToEdgeAlignment: false,
		resize: false,
		parentPadding: false,
		drawGrid: false,

		// General
		gridSpacing: 10,
		snapToGridCenter: true,

		// Draw Grid
		zoomDash: true,
		panGrid: true,
		gridStackOrder: -1,
		gridColor: '#dedede',
		lineWidth: 1.0,

		// Guidelines
		guidelinesStackOrder: 4,
		guidelinesTolerance: 2.00,
		guidelinesStyle: {
			strokeStyle: "#8b7d6b",
			geometricGuidelineRange: 400,
			range: 100,
			minDistRange: 10,
			distGuidelineOffset: 10,
			horizontalDistColor: "#ff0000",
			verticalDistColor: "#00ff00",
			initPosAlignmentColor: "#0000ff",
			lineDash: [0, 0],
			horizontalDistLine: [0, 0],
			verticalDistLine: [0, 0],
			initPosAlignmentLine: [0, 0],
		},

		// Parent Padding
		parentSpacing: -1
	});

	// Fetch and load element data from a JSON file , jsonFileUrl absolut path of dataCytoMarshall.json
	// Main Version EDITOR 
	fetch(window.jsonFileUrlDataCytoMarshall)

		.then((response) => response.json())
		.then((elements) => {

			// aarafat-tag: skip 1st
			// Process the data to assign missing lat and lng
			// const updatedElements = assignMissingLatLng(elements);

			const updatedElements = (elements);


			// Now, you can use updatedElements as needed
			// For example, logging them to the console
			console.log("Updated Elements:", updatedElements);

			// Add the elements to the Cytoscape instance
			cy.add(updatedElements);
			// run layout
			const layout = cy.layout({
				name: "cola",
				nodeGap: 5,
				edgeLength: 100,
				animate: true,
				randomize: false,
				maxSimulationTime: 1500,
			});
			layout.run();

			// remove node topoviewer
			topoViewerNode = cy.filter('node[name = "topoviewer"]');
			topoViewerNode.remove();

			// remove node TopoViewerParentNode
			topoViewerParentNode = cy.filter('node[name = "TopoViewer:1"]');
			topoViewerParentNode.remove();

			var cyExpandCollapse = cy.expandCollapse({
				layoutBy: null, // null means use existing layout
				undoable: false,
				fisheye: false,
				animationDuration: 10, // when animate is true, the duration in milliseconds of the animation
				animate: true
			});

			// Example collapse/expand after some delay
			// Make sure the '#parent' node exists in your loaded elements
			setTimeout(function () {
				var parent = cy.$('#parent'); // Ensure that '#parent' is actually present in dataCytoMarshall.json
				cyExpandCollapse.collapse(parent);

				setTimeout(function () {
					cyExpandCollapse.expand(parent);
				}, 2000);
			}, 2000);

		})
		.catch((error) => {
			console.error("Error loading graph data:", error);
		});



	// Instantiate hover text element
	const hoverText = document.createElement("box");
	hoverText.classList.add(
		"hover-text",
		"is-hidden",
		"box",
		"has-text-weight-normal",
		"is-warning",
		"is-smallest",
	);
	hoverText.textContent = "Launch CloudShell.";
	document.body.appendChild(hoverText);


	let shiftKeyDown = false;
	// Detect when Shift is pressed or released
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Shift') {
			shiftKeyDown = true;
		}
	});

	document.addEventListener('keyup', (event) => {
		if (event.key === 'Shift') {
			shiftKeyDown = false;
		}
	});

	let altKeyDown = false;
	// Detect when Alt is pressed or released
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Alt') {
			altKeyDown = true;
		}
	});

	document.addEventListener('keyup', (event) => {
		if (event.key === 'Alt') {
			altKeyDown = false;
		}
	});

	let ctrlKeyDown = false;
	// Detect when Control is pressed or released
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Control') {
			ctrlKeyDown = true;
		}
	});

	document.addEventListener('keyup', (event) => {
		if (event.key === 'Control') {
			ctrlKeyDown = false;
		}
	});

	// Toggle the Panel(s) when clicking on the cy container
	document.getElementById("cy").addEventListener("click", async function (event) {

		console.info("cy container clicked init");
		console.info("isPanel01Cy: ", isPanel01Cy);
		console.info("nodeClicked: ", nodeClicked);
		console.info("edgeClicked: ", edgeClicked);

		// This code will be executed when you click anywhere in the Cytoscape container
		// You can add logic specific to the container here

		if (!nodeClicked && !edgeClicked) {
			console.info("!nodeClicked  -- !edgeClicked");
			if (!isPanel01Cy) {
				console.info("!isPanel01Cy: ");
				// Remove all Overlayed Panel
				// Get all elements with the class "panel-overlay"
				var panelOverlays = document.getElementsByClassName("panel-overlay");

				console.info("panelOverlays: ", panelOverlays);

				// Loop through each element and set its display to 'none'
				for (var i = 0; i < panelOverlays.length; i++) {
					console.info
					panelOverlays[i].style.display = "none";
				}

				var viewportDrawer = document.getElementsByClassName("viewport-drawer");
				// Loop through each element and set its display to 'none'
				for (var i = 0; i < viewportDrawer.length; i++) {
					viewportDrawer[i].style.display = "none";
				}

				// display none each ViewPortDrawer Element, the ViewPortDrawer is created during DOM loading and styled as display node initially
				var ViewPortDrawerElements =
					document.getElementsByClassName("ViewPortDrawer");
				var ViewPortDrawerArray = Array.from(ViewPortDrawerElements);
				ViewPortDrawerArray.forEach(function (element) {
					element.style.display = "none";
				});

			} else {
				removeElementById("Panel-01");
				appendMessage(`"try to remove panel01-Cy"`);
			}
		}
		nodeClicked = false;
		edgeClicked = false;
	});

	// Listen for tap or click on the Cytoscape canvas
	cy.on('click', async (event) => {
		// Usage: Initialize the listener and get a live checker function
		const isViewportDrawerClabEditorCheckboxChecked = setupCheckboxListener('#viewport-drawer-clab-editor-content-01 .checkbox-input');
		if (event.target === cy && shiftKeyDown && isViewportDrawerClabEditorCheckboxChecked) { // Ensures Shift + click/tap and the isViewportDrawerClabEditorCheckboxChecked 
			const pos = event.position;
			const newNodeId = 'nodeId-' + (cy.nodes().length + 1);
			// Add the new node to the graph
			cy.add({
				group: 'nodes',
				data: {
					"id": newNodeId,
					"editor": "true",
					"weight": "30",
					"name": newNodeId,
					"parent": "",
					"topoViewerRole": "pe",
					"sourceEndpoint": "",
					"targetEndpoint": "",
					"containerDockerExtraAttribute": {
						"state": "",
						"status": "",
					},
					"extraData": {
						"kind": "container",
						"longname": "",
						"image": "",
						"mgmtIpv4Addresss": "",
					},
				},
				position: {
					x: pos.x,
					y: pos.y
				}
			});

			var cyNode = cy.$id(newNodeId); // Get cytoscpe node object id

			await showPanelContainerlabEditor(event)
			// sleep (1000)
			await showPanelNodeEditor(cyNode)
			// sleep (100)
			await saveNodeToEditorToFile()
		} else {
			loadCytoStyle(cy)
		}
	});

	// Click event listener for nodes
	cy.on("click", "node", async function (event) {


		console.info("node clicked init");
		console.info("isPanel01Cy: ", isPanel01Cy);
		console.info("nodeClicked: ", nodeClicked);
		console.info("edgeClicked: ", edgeClicked);

		nodeClicked = true;

		console.info("node clicked after");
		console.info("isPanel01Cy: ", isPanel01Cy);
		console.info("nodeClicked: ", nodeClicked);
		console.info("edgeClicked: ", edgeClicked);

		console.info("isEdgeHandlerActive after node click: ", isEdgeHandlerActive);

		environments = await getEnvironments(event);
		console.info("sshWebBased - environments: ", environments)

		cytoTopologyJson = environments["EnvCyTopoJsonBytes"]
		clabServerAddress = environments["clab-server-address"]

		// Ignore the click event if edge handler is active
		if (isEdgeHandlerActive) {
			return;
		}
		const node = event.target;



		console.info("editor Node: ", node.data("editor"));

		if (!node.isParent()) {
			// Usage: Initialize the listener and get a live checker function
			const isViewportDrawerClabEditorCheckboxChecked = setupCheckboxListener('#viewport-drawer-clab-editor-content-01 .checkbox-input');

			// Check if Shift + Alt is pressed and the node is a child
			if (event.originalEvent.ctrlKey && node.isChild() && isViewportDrawerClabEditorCheckboxChecked) {
				console.info(`Orphaning node: ${node.id()} from parent: ${node.parent().id()}`);

				// Make the node orphan
				node.move({
					parent: null
				});
				console.info(`${node.id()} is now an orphan`);
			}

			if (event.originalEvent.shiftKey && isViewportDrawerClabEditorCheckboxChecked) { // Start edge creation on Shift and the isViewportDrawerClabEditorCheckboxChecked 
				console.info("Shift + Click");
				console.info("edgeHandler Node: ", node.data("extraData").longname);

				// Set the edge handler flag
				isEdgeHandlerActive = true;
				// Start the edge handler from the clicked node
				eh.start(node);

				console.info("Node is an editor node");
				showPanelNodeEditor(node) // after this cy.on('ehcomplete') is called, the 'ehcomplete' event will be triggered
			}
			if (event.originalEvent.altKey && isViewportDrawerClabEditorCheckboxChecked && (node.data("editor") === "true")) { // node deletion on Alt and the isViewportDrawerClabEditorCheckboxChecked 
				console.info("Alt + Click is enabled");
				console.info("deleted Node: ", node.data("extraData").longname);
				deleteNodeToEditorToFile(node)
			}
			if ((node.data("editor") === "true")) {
				showPanelNodeEditor(node)
			} else {
				// Remove all Overlayed Panel
				const panelOverlays = document.getElementsByClassName("panel-overlay");
				for (let i = 0; i < panelOverlays.length; i++) {
					panelOverlays[i].style.display = "none";
				}
				console.info(node);
				// arafat-tag: vs-code
				// console.info(node.data("containerDockerExtraAttribute").status); aarafat-tag: vs-code
				console.info(node.data("extraData"));
				if (document.getElementById("panel-node").style.display === "none") {
					document.getElementById("panel-node").style.display = "block";
				} else {
					document.getElementById("panel-node").style.display = "none";
				}

				document.getElementById("panel-node-name").textContent = node.data("extraData").longname;
				// arafat-tag: vs-code
				// document.getElementById("panel-node-status").textContent = node.data("containerDockerExtraAttribute").status;
				document.getElementById("panel-node-kind").textContent = node.data("extraData").kind;
				document.getElementById("panel-node-image").textContent = node.data("extraData").image;
				document.getElementById("panel-node-mgmtipv4").textContent = node.data("extraData").mgmtIpv4Addresss;
				document.getElementById("panel-node-mgmtipv6").textContent = node.data("extraData").mgmtIpv6Address;
				document.getElementById("panel-node-fqdn").textContent = node.data("extraData").fqdn;
				document.getElementById("panel-node-group").textContent = node.data("extraData").group;
				document.getElementById("panel-node-topoviewerrole").textContent = node.data("topoViewerRole");

				// Set selected node-long-name to global variable
				globalSelectedNode = node.data("extraData").longname;
				console.info("internal: ", globalSelectedNode);

				appendMessage(`"isPanel01Cy-cy: " ${isPanel01Cy}`);
				appendMessage(`"nodeClicked: " ${nodeClicked}`);


				///
				if (document.getElementById("data-display-panel-node").style.display === "none") {
					document.getElementById("data-display-panel-node").style.display = "block";
				} else {
					document.getElementById("data-display-panel-node").style.display = "none";
				}

				document.getElementById("data-display-panel-node-name").textContent = node.data("extraData").longname;
				// arafat-tag: vs-code
				// document.getElementById("data-display-panel-node-status").textContent = node.data("containerDockerExtraAttribute").status;
				document.getElementById("data-display-panel-node-kind").textContent = node.data("extraData").kind;
				document.getElementById("data-display-panel-node-image").textContent = node.data("extraData").image;
				document.getElementById("data-display-panel-node-mgmtipv4").textContent = node.data("extraData").mgmtIpv4Addresss;
				document.getElementById("data-display-panel-node-mgmtipv6").textContent = node.data("extraData").mgmtIpv6Address;
				document.getElementById("data-display-panel-node-fqdn").textContent = node.data("extraData").fqdn;
				document.getElementById("data-display-panel-node-group").textContent = node.data("extraData").group;
				document.getElementById("data-display-panel-node-topoviewerrole").textContent = node.data("topoViewerRole");

				// Set selected node-long-name to global variable
				globalSelectedNode = node.data("extraData").longname;
				console.info("internal: ", globalSelectedNode);

				appendMessage(`"isPanel01Cy-cy: " ${isPanel01Cy}`);
				appendMessage(`"nodeClicked: " ${nodeClicked}`);
				///
			}
		}
	});

	// Click event listener for edges
	cy.on("click", "edge", async function (event) {

		console.info("edge clicked init");
		console.info("isPanel01Cy: ", isPanel01Cy);
		console.info("nodeClicked: ", nodeClicked);
		console.info("edgeClicked: ", edgeClicked);

		// Remove all Overlayed Panel
		// Get all elements with the class "panel-overlay"
		var panelOverlays = document.getElementsByClassName("panel-overlay");
		// Loop through each element and set its display to 'none'
		for (var i = 0; i < panelOverlays.length; i++) {
			panelOverlays[i].style.display = "none";
		}

		// This code will be executed when you click on a node
		// You can add logic specific to nodes here
		const clickedEdge = event.target;
		edgeClicked = true;


		console.info("edge clicked after");
		console.info("isPanel01Cy: ", isPanel01Cy);
		console.info("nodeClicked: ", nodeClicked);
		console.info("edgeClicked: ", edgeClicked);

		const defaultEdgeColor = "#969799";

		console.info(defaultEdgeColor);

		// Change the color of the clicked edge (for example, to blue)
		if (clickedEdge.data("editor") === "true") {
			clickedEdge.style("line-color", "#32CD32");
		} else {
			clickedEdge.style("line-color", "#0043BF");
		}

		// Revert the color of other edges that were not clicked (e.g., back to their default color)
		cy.edges().forEach(function (edge) {
			if (edge !== clickedEdge) {
				edge.style("line-color", defaultEdgeColor);
			}
		});

		// Assign middle labels
		assignMiddleLabels(clickedEdge);



		// Usage: Initialize the listener and get a live checker function
		const isViewportDrawerClabEditorCheckboxChecked = setupCheckboxListener('#viewport-drawer-clab-editor-content-01 .checkbox-input');

		if (event.originalEvent.altKey && isViewportDrawerClabEditorCheckboxChecked && clickedEdge.data("editor") === "true") {
			console.info("Alt + Click is enabled");
			console.info("deleted Edge: ", clickedEdge.data("source"), clickedEdge.data("target"));

			deleteEdgeToEditorToFile(clickedEdge)

		}
		if (event.originalEvent.altKey && isViewportDrawerClabEditorCheckboxChecked && clickedEdge.data("editor") !== "true") {
			console.info("Alt + Click is enabled");
			bulmaToast.toast({
				message: `Hey there, that link’s locked down read-only, so no deleting it. 😎👊`,
				type: "is-warning is-size-6 p-3",
				duration: 4000,
				position: "top-center",
				closeOnClick: true,
			});


		}
		if (clickedEdge.data("editor") !== "true") {

			document.getElementById("panel-link").style.display = "none";
			if (document.getElementById("panel-link").style.display === "none") {
				document.getElementById("panel-link").style.display = "block";
			} else {
				document.getElementById("panel-link").style.display = "none";
			}

			document.getElementById("panel-link-name").textContent = `${clickedEdge.data("source")} --- ${clickedEdge.data("target")}`
			document.getElementById("panel-link-endpoint-a-name").textContent = `${clickedEdge.data("source")} :: ${clickedEdge.data("sourceEndpoint")}`
			document.getElementById("panel-link-endpoint-a-mac-address").textContent = "getting the MAC address"
			document.getElementById("panel-link-endpoint-b-name").textContent = `${clickedEdge.data("target")} :: ${clickedEdge.data("targetEndpoint")}`
			document.getElementById("panel-link-endpoint-b-mac-address").textContent = "getting the MAC address"


			// setting clabSourceLinkArgsList
			clabLinkMacArgsList = [`${clickedEdge.data("extraData").clabSourceLongName}`, `${clickedEdge.data("extraData").clabTargetLongName}`]

			// setting MAC address endpoint-a values by getting the data from clab via /clab-link-mac GET API
			const actualLinkMacPair = await sendRequestToEndpointGetV3("/clab-link-macaddress", clabLinkMacArgsList)

			console.info("actualLinkMacPair: ", actualLinkMacPair)

			// // setting MAC address endpoint-a values by getting the data from clab via /clab/link/${source_container}/${target_container}/mac GET API
			// const actualLinkMacPair = await sendRequestToEndpointGetV2(`/clab/link/${source_container}/${target_container}/mac-address`, clabLinkMacArgsList=[])

			sourceClabNode = `${clickedEdge.data("extraData").clabSourceLongName}`
			targetClabNode = `${clickedEdge.data("extraData").clabTargetLongName}`
			sourceIfName = `${clickedEdge.data("sourceEndpoint")}`
			targetIfName = `${clickedEdge.data("targetEndpoint")}`

			const getMacAddressesResult = getMacAddresses(actualLinkMacPair["data"], sourceClabNode, targetClabNode, sourceIfName, targetIfName);
			if (typeof getMacAddressesResult === "object") { // Ensure result is an object
				console.info("Source If MAC:", getMacAddressesResult.sourceIfMac); // Access sourceIfMac
				console.info("Target If MAC:", getMacAddressesResult.targetIfMac); // Access targetIfMac

				document.getElementById("panel-link-endpoint-a-mac-address").textContent = getMacAddressesResult.sourceIfMac
				document.getElementById("panel-link-endpoint-b-mac-address").textContent = getMacAddressesResult.targetIfMac

			} else {
				console.info(getMacAddressesResult); // Handle error message

				document.getElementById("panel-link-endpoint-a-mac-address").textContent = "Oops, no MAC address here!"
				document.getElementById("panel-link-endpoint-b-mac-address").textContent = "Oops, no MAC address here!"
			}


			function getMacAddresses(data, sourceClabNode, targetClabNode, sourceIfName, targetIfName) {
				const result = data.find(item =>
					item.sourceClabNode === sourceClabNode &&
					item.targetClabNode === targetClabNode &&
					item.sourceIfName === sourceIfName &&
					item.targetIfName === targetIfName
				);

				if (result) {
					return {
						sourceIfMac: result.sourceIfMac,
						targetIfMac: result.targetIfMac
					};
				} else {
					return "No matching data found.";
				}
			}

			// Setting default impairment values for endpoint A
			let clabSourceLinkArgsList = [
				clickedEdge.data("extraData").clabSourceLongName,
				clickedEdge.data("extraData").clabSourcePort
			];

			let clabSourceLinkImpairmentClabData = await sendRequestToEndpointGetV3("/clab-link-impairment", clabSourceLinkArgsList);

			if (clabSourceLinkImpairmentClabData && typeof clabSourceLinkImpairmentClabData === "object" && Object.keys(clabSourceLinkImpairmentClabData).length > 0) {
				hideLoadingSpinnerGlobal();
				console.info("Valid non-empty JSON response received for endpoint A:", clabSourceLinkImpairmentClabData);

				const sourceDelay = clabSourceLinkImpairmentClabData["data"]["delay"];
				const sourceJitter = clabSourceLinkImpairmentClabData["data"]["jitter"];
				const sourceRate = clabSourceLinkImpairmentClabData["data"]["rate"];
				const sourcePacketLoss = clabSourceLinkImpairmentClabData["data"]["packet_loss"];
				const sourceCorruption = clabSourceLinkImpairmentClabData["data"]["corruption"];

				document.getElementById("panel-link-endpoint-a-delay").value = sourceDelay === "N/A" ? "0" : sourceDelay.replace(/ms$/, "");
				document.getElementById("panel-link-endpoint-a-jitter").value = sourceJitter === "N/A" ? "0" : sourceJitter.replace(/ms$/, "");
				document.getElementById("panel-link-endpoint-a-rate").value = sourceRate === "N/A" ? "0" : sourceRate;
				document.getElementById("panel-link-endpoint-a-loss").value = sourcePacketLoss === "N/A" ? "0" : sourcePacketLoss.replace(/%$/, "");
				document.getElementById("panel-link-endpoint-a-corruption").value = sourceCorruption === "N/A" ? "0" : sourceCorruption.replace(/%$/, "");
			} else {
				console.info("Empty or invalid JSON response received for endpoint A");
			}

			// sleep(1000)
			// Setting default impairment values for endpoint B
			let clabTargetLinkArgsList = [
				clickedEdge.data("extraData").clabTargetLongName,
				clickedEdge.data("extraData").clabTargetPort
			];
			let clabTargetLinkImpairmentClabData = await sendRequestToEndpointGetV3("/clab-link-impairment", clabTargetLinkArgsList);

			if (clabTargetLinkImpairmentClabData && typeof clabTargetLinkImpairmentClabData === "object" && Object.keys(clabTargetLinkImpairmentClabData).length > 0) {
				hideLoadingSpinnerGlobal();
				console.info("Valid non-empty JSON response received for endpoint B:", clabTargetLinkImpairmentClabData);

				const targetDelay = clabTargetLinkImpairmentClabData["data"]["delay"];
				const targetJitter = clabTargetLinkImpairmentClabData["data"]["jitter"];
				const targetRate = clabTargetLinkImpairmentClabData["data"]["rate"];
				const targetPacketLoss = clabTargetLinkImpairmentClabData["data"]["packet_loss"];
				const targetCorruption = clabTargetLinkImpairmentClabData["data"]["corruption"];

				document.getElementById("panel-link-endpoint-b-delay").value = targetDelay === "N/A" ? "0" : targetDelay.replace(/ms$/, "");
				document.getElementById("panel-link-endpoint-b-jitter").value = targetJitter === "N/A" ? "0" : targetJitter.replace(/ms$/, "");
				document.getElementById("panel-link-endpoint-b-rate").value = targetRate === "N/A" ? "0" : targetRate;
				document.getElementById("panel-link-endpoint-b-loss").value = targetPacketLoss === "N/A" ? "0" : targetPacketLoss.replace(/%$/, "");
				document.getElementById("panel-link-endpoint-b-corruption").value = targetCorruption === "N/A" ? "0" : targetCorruption.replace(/%$/, "");
			} else {
				console.info("Empty or invalid JSON response received for endpoint B");
			}

			//render sourceSubInterfaces
			let clabSourceSubInterfacesArgList = [
				clickedEdge.data("extraData").clabSourceLongName,
				clickedEdge.data("extraData").clabSourcePort
			];
			let clabSourceSubInterfacesClabData = await sendRequestToEndpointGetV3("/clab-link-subinterfaces", clabSourceSubInterfacesArgList);
			console.info("clabSourceSubInterfacesClabData: ", clabSourceSubInterfacesClabData);

			if (Array.isArray(clabSourceSubInterfacesClabData) && clabSourceSubInterfacesClabData.length > 0) {
				// Map sub-interfaces with prefix
				const sourceSubInterfaces = clabSourceSubInterfacesClabData.map(
					item => `${item.ifname}`
				);

				// Render sub-interfaces
				renderSubInterfaces(sourceSubInterfaces, 'endpoint-a-edgeshark', 'endpoint-a-clipboard');
				renderSubInterfaces(sourceSubInterfaces, 'endpoint-a-clipboard', 'endpoint-a-bottom');

			} else if (Array.isArray(clabSourceSubInterfacesClabData)) {
				console.info("No sub-interfaces found. The input data array is empty.");
				renderSubInterfaces(null, 'endpoint-a-edgeshark', 'endpoint-a-clipboard');
				renderSubInterfaces(null, 'endpoint-a-clipboard', 'endpoint-a-bottom');
			} else {
				console.info("No sub-interfaces found. The input data is null, undefined, or not an array.");
				renderSubInterfaces(null, 'endpoint-a-edgeshark', 'endpoint-a-clipboard');
				renderSubInterfaces(null, 'endpoint-a-clipboard', 'endpoint-a-bottom');
			}


			//render targetSubInterfaces
			let clabTargetSubInterfacesArgList = [
				clickedEdge.data("extraData").clabTargetLongName,
				clickedEdge.data("extraData").clabTargetPort
			];
			let clabTargetSubInterfacesClabData = await sendRequestToEndpointGetV3("/clab-link-subinterfaces", clabTargetSubInterfacesArgList);
			console.info("clabTargetSubInterfacesClabData: ", clabTargetSubInterfacesClabData);

			if (Array.isArray(clabTargetSubInterfacesClabData) && clabTargetSubInterfacesClabData.length > 0) {
				// Map sub-interfaces with prefix
				const TargetSubInterfaces = clabTargetSubInterfacesClabData.map(
					item => `${item.ifname}`
				);

				// Render sub-interfaces
				renderSubInterfaces(TargetSubInterfaces, 'endpoint-b-edgeshark', 'endpoint-b-clipboard');
				renderSubInterfaces(TargetSubInterfaces, 'endpoint-b-clipboard', 'endpoint-b-bottom');

			} else if (Array.isArray(clabTargetSubInterfacesClabData)) {
				console.info("No sub-interfaces found. The input data array is empty.");
				renderSubInterfaces(null, 'endpoint-b-edgeshark', 'endpoint-b-clipboard');
				renderSubInterfaces(null, 'endpoint-b-clipboard', 'endpoint-b-bottom');
			} else {
				console.info("No sub-interfaces found. The input data is null, undefined, or not an array.");
				renderSubInterfaces(null, 'endpoint-b-edgeshark', 'endpoint-b-clipboard');
				renderSubInterfaces(null, 'endpoint-b-clipboard', 'endpoint-b-bottom');
			}


			// set selected edge-id to global variable
			globalSelectedEdge = clickedEdge.data("id")

			appendMessage(`"edgeClicked: " ${edgeClicked}`);
		}

	});


	function generateNodesEvent(event) {
		// Your event handling logic here
		// Add a click event listener to the 'Generate' button
		// Get the number of node from the input field
		// Your event handling logic here
		// Add a click event listener to the 'Generate' button
		// Get the number of node from the input field
		console.info("generateNodesButton clicked");
		const numNodes = document.getElementById("generateNodesInput").value;
		console.info(numNodes);
		// Check if the number of node is empty
		if (numNodes === null) {
			// if node number empty do nothing
			return;
		}
		const numNodesToGenerate = parseInt(numNodes, 10);
		// Check if the number of node is positive
		if (isNaN(numNodesToGenerate) || numNodesToGenerate <= 0) {
			// Invalid input
			// Invalid input
			appendMessage(
				"Error:" + "Bro, you gotta enter a valid positive number, come on!",
			);
			return;
		}
		// Generate nodes with random positions
		for (let i = 0; i < numNodesToGenerate; i++) {
			const nodeName = `node-${i + 1}`;
			const newNode = {
				group: "nodes",
				data: {
					id: nodeName,
					name: nodeName,
				},
				position: {
					x: Math.random() * 400,
					y: Math.random() * 400,
				},
			};
			//cy.add(newNode);
			try {
				cy.add(newNode);
				// throw new Error('This is an example exception');
			} catch (error) {
				// Log the exception to the console
				console.error("An exception occurred:", error);
				// Log the exception to notification message to the textarea
				appendMessage("An exception occurred:" + error);
			}
		}
		// Generate random edges between nodes
		for (let i = 0; i < numNodesToGenerate; i++) {
			const sourceNode = `node-${i + 1}`;
			const targetNode = `node-${Math.floor(Math.random() * numNodesToGenerate) + 1}`;
			if (sourceNode !== targetNode) {
				const newEdge = {
					group: "edges",
					data: {
						id: "from-" + sourceNode + "-to-" + targetNode,
						name: "from-" + sourceNode + "-to-" + targetNode,
						source: sourceNode,
						target: targetNode,
					},
				};
				try {
					cy.add(newEdge);
					// throw new Error('This is an example exception');
				} catch (error) {
					// Log the exception to the console
					console.error("An exception occurred:", error);
					// Log the exception to notification message to the textarea
					appendMessage("An exception occurred::" + error);
				}
			}
		}
		// run layout
		const layout = cy.layout({
			name: "cola",
			nodeGap: 5,
			edgeLengthVal: 45,
			animate: true,
			randomize: false,
			maxSimulationTime: 1500,
		});
		layout.run();
		//// Append a notification message to the textarea
		console.info(
			"Info: " +
			`Boom! Just generated ${numNodesToGenerate} nodes with some random edges. That's how we roll!`,
		);
		appendMessage(
			"Info: " +
			`Boom! Just generated ${numNodesToGenerate} nodes with some random edges. That's how we roll!`,
		);
	}


	function assignMiddleLabels(edge) {
		console.info("assignMiddleLabels");

		if (!edge || !edge.isEdge()) {
			console.error("Input is not a valid edge.");
			return;
		}

		const source = edge.source().id();
		const target = edge.target().id();

		// Find all edges connecting the same source and target nodes
		const connectedEdges = edge.cy().edges().filter((e) => {
			const eSource = e.source().id();
			const eTarget = e.target().id();
			return (
				(eSource === source && eTarget === target) ||
				(eSource === target && eTarget === source)
			);
		});

		console.info("connectedEdges: ", connectedEdges);

		// If only one edge exists, no label is needed
		if (connectedEdges.length === 1) {
			connectedEdges.forEach((e) => e.removeData("edgeGroup"));
			return;
		}

		// Check if the label already exists
		const groupId = `${source}-${target}`;
		if (document.getElementById(`label-${groupId}`)) {
			console.info(`Label for group ${groupId} already exists.`);
			return;
		}

		// Create a single label for all parallel edges
		const labelDiv = document.createElement("div");
		labelDiv.classList.add("popper-div");
		labelDiv.id = `label-${groupId}`; // Unique ID for the label
		labelDiv.innerHTML = `<a href="javascript:void(0);">+</a>`;

		document.body.appendChild(labelDiv);

		// Use Popper to position the label in the middle of one edge
		const popper = edge.popper({
			content: () => labelDiv,
		});

		function updatePosition() {
			popper.update();
		}

		function updateFontSize() {
			const zoomLevel = edge.cy().zoom();
			const fontSize = 7 * zoomLevel;
			const borderSize = 1 * zoomLevel;
			const strokeWidth = 0.2 * zoomLevel;

			labelDiv.style.fontSize = `${fontSize}px`;
			labelDiv.style.borderRadius = `${borderSize}px`;
			labelDiv.style.webkitTextStroke = `${strokeWidth}px white`;
		}

		// Initial updates
		updateFontSize();
		updatePosition();

		// Attach event listeners for updates
		edge.cy().on("pan zoom resize", () => {
			updatePosition();
			updateFontSize();
		});

		// Attach event listener for element movement
		edge.cy().on("position", "node, edge", () => {
			updatePosition();
			updateFontSize();
		});

		// Handle label click
		labelDiv.addEventListener("click", () => {
			toggleParallelEdges(edge, groupId, connectedEdges);
		});

		// Remove the label on graph click
		edge.cy().once("click", () => {
			labelDiv.remove();
		});
	}

	function toggleParallelEdges(edge, groupId, connectedEdges) {
		const source = edge.data("source");
		const target = edge.data("target");

		// Find all edges connecting the same source and target nodes
		const parallelEdges = edge.cy().edges().filter((e) => {
			const eSource = e.source().id();
			const eTarget = e.target().id();
			return (
				(eSource === source && eTarget === target) ||
				(eSource === target && eTarget === source)
			);
		});

		const allHidden = parallelEdges.filter((e) => e.id() !== edge.id() && e.hidden()).length > 0;

		if (allHidden) {
			// Expand parallel edges
			parallelEdges.show();

			// Remove the popper label
			const label = document.getElementById(`label-${groupId}`);
			if (label) {
				label.remove();
			}

			console.info(`Expanded parallel edges for ${groupId}`);
			bulmaToast.toast({
				message: `Expanded parallel edges for ${groupId}`,
				type: "is-warning is-size-6 p-3",
				duration: 4000,
				position: "top-center",
				closeOnClick: true,
			});

		} else {
			// Collapse parallel edges except the clicked one
			connectedEdges.forEach((parallelEdge) => {
				if (parallelEdge.id() !== edge.id()) {
					parallelEdge.hide();
				}
			});

			// Update the popper label to show the collapsed state
			const label = document.getElementById(`label-${groupId}`);
			if (label) {
				label.innerHTML = `<a href="javascript:void(0);">${connectedEdges.length}</a>`;
				label.style.display = "block";
			}

			console.info(`Collapsed parallel edges for ${groupId}`);
			bulmaToast.toast({
				message: `Collapsed parallel edges for ${groupId}`,
				type: "is-warning is-size-6 p-3",
				duration: 4000,
				position: "top-center",
				closeOnClick: true,
			});
		}
	}




	function spawnNodeEvent(event) {
		// Add a click event listener to the 'Submit' button in the hidden form
		// Get the node name from the input field
		const nodeName = document.getElementById("nodeName").value;
		console.info(nodeName);
		// Check if a node name is empty
		if (nodeName == "") {
			// append message in textArea
			appendMessage("Error: Enter node name.");
			return;
		}
		// Check if a node with the same name already exists
		if (cy.$(`node[id = "${nodeName}"]`).length > 0) {
			// append message in textArea
			appendMessage("Error: Node with this name already exists.");
			return;
		}
		// Create a new node element
		const newNode = {
			group: "nodes",
			data: {
				id: nodeName,
				name: nodeName,
				label: nodeName,
			},
		};
		// Add the new node to Cytoscape.js
		cy.add(newNode);
		// Randomize the positions and center the graph
		const layout = cy.layout({
			name: "cola",
			nodeGap: 5,
			edgeLengthVal: 45,
			animate: true,
			randomize: false,
			maxSimulationTime: 1500,
		});
		layout.run();
		// Append a notification message to the textarea
		console.info("Info: " + `Nice! Node "${nodeName}" added successfully.`);
		appendMessage("Info: " + `Nice! Node "${nodeName}" added successfully.`);
	}

	function zoomToFitDrawer() {
		const initialZoom = cy.zoom();
		appendMessage(`Bro, initial zoom level is "${initialZoom}".`);
		// Fit all nodes possible with padding
		cy.fit();
		const currentZoom = cy.zoom();
		appendMessage(`And now the zoom level is "${currentZoom}".`);
	}

	function pathFinderDijkstraEvent(event) {
		// Usage example:
		// highlightShortestPath('node-a', 'node-b'); // Replace with your source and target node IDs
		// Function to get the default node style from cy-style.json
		// weight: (edge) => 1, // You can adjust the weight function if needed
		// weight: (edge) => edge.data('distance')

		console.info("im triggered");

		// Remove existing highlight from all edges
		cy.edges().forEach((edge) => {
			edge.removeClass("spf");
		});

		// Get the node sourceNodeId from pathFinderSourceNodeInput and targetNodeId from pathFinderTargetNodeInput
		const sourceNodeId = document.getElementById(
			"pathFinderSourceNodeInput",
		).value;
		const targetNodeId = document.getElementById(
			"pathFinderTargetNodeInput",
		).value;

		// Assuming you have 'cy' as your Cytoscape instance
		const sourceNode = cy.$(`node[id="${sourceNodeId}"]`);
		const targetNode = cy.$(`node[id="${targetNodeId}"]`);

		console.info(
			"Info: " +
			"Let's find the path from-" +
			sourceNodeId +
			"-to-" +
			targetNodeId +
			"!",
		);
		appendMessage(
			"Info: " +
			"Let's find the path from-" +
			sourceNodeId +
			"-to-" +
			targetNodeId +
			"!",
		);

		// Check if both nodes exist
		if (sourceNode.length === 0 || targetNode.length === 0) {
			console.error(
				`Bro, couldn't find the source or target node you specified. Double-check the node names.`,
			);
			appendMessage(
				`Bro, couldn't find the source or target node you specified. Double-check the node names.`,
			);
			return;
		}

		// Get the Dijkstra result with the shortest path
		const dijkstraResult = cy.elements().dijkstra({
			root: sourceNode,
			weight: (edge) => 1,
			// Use the custom weight attribute
			// weight: edge => edge.data('customWeight'),
		});
		// Get the shortest path from Dijkstra result
		const shortestPathEdges = dijkstraResult.pathTo(targetNode);
		console.info(shortestPathEdges);

		// Check if there is a valid path (shortestPathEdges is not empty)
		if (shortestPathEdges.length > 1) {
			//// Apply a style to highlight the shortest path edges
			// shortestPathEdges.style({
			//	'line-color': 'red',
			//	'line-style': 'solid',

			// Highlight the shortest path
			shortestPathEdges.forEach((edge) => {
				edge.addClass("spf");
			});

			// Zoom out on the node
			cy.fit();

			// Zoom in on the node
			cy.animate({
				zoom: {
					level: 5,
					position: {
						x: sourceNode.position("x"),
						y: sourceNode.position("y"),
					},
					renderedPosition: {
						x: sourceNode.renderedPosition("x"),
						y: sourceNode.renderedPosition("y"),
					},
				},
				duration: 1500,
			});
			console.info(
				"Info: " +
				"Yo, check it out! Shorthest Path from-" +
				sourceNodeId +
				"-to-" +
				targetNodeId +
				" has been found.",
			);
			appendMessage(
				"Info: " +
				"Yo, check it out! Shorthest Path from-" +
				sourceNodeId +
				"-to-" +
				targetNodeId +
				" has been found, below is the path trace..",
			);
			console.info(shortestPathEdges);

			shortestPathEdges.forEach((edge) => {
				console.info("Edge ID:", edge.id());
				console.info("Source Node ID:", edge.source().id());
				console.info("Target Node ID:", edge.target().id());

				edgeId = edge.id();
				sourceNodeId = edge.source().id();
				targetNodeId = edge.target().id();
				// You can access other properties of the edge, e.g., source, target, data, etc.

				appendMessage("Info: " + "Edge ID: " + edgeId);
				appendMessage("Info: " + "Source Node ID: " + sourceNodeId);
				appendMessage("Info: " + "Target Node ID: " + targetNodeId);
			});
		} else {
			console.error(
				`Bro, there is no path from "${sourceNodeId}" to "${targetNodeId}".`,
			);
			appendMessage(
				`Bro, there is no path from "${sourceNodeId}" to "${targetNodeId}".`,
			);
			return;
		}
	}

	function setNodeContainerStatus(containerNodeName, containerNodeStatus) {
		cy.nodes().forEach(function (node) {
			var nodeId = node.data("id");

			// Find the corresponding status nodes based on node ID
			var statusGreenNode = cy.$(`node[name="${nodeId}-statusGreen"]`);
			var statusOrangeNode = cy.$(`node[name="${nodeId}-statusOrange"]`);
			var statusRedNode = cy.$(`node[name="${nodeId}-statusRed"]`);

			if (statusGreenNode.length === 0 || statusRedNode.length === 0) {
				// If status nodes are not found, skip this node
				return;
			}

			// Update positions of status nodes relative to the node
			var nodePosition = node.position();
			var offset = {
				x: -4,
				y: -10
			};
			var statusGreenNodePosition = {
				x: nodePosition.x + offset.x,
				y: nodePosition.y + offset.y,
			};
			var statusRedNodePosition = {
				x: nodePosition.x + offset.x,
				y: nodePosition.y + offset.y,
			};

			// Check if the nodeContainerStatusVisibility is true
			if (nodeContainerStatusVisibility) {
				// Check if the containerNodeName includes nodeId and containerNodeStatus includes 'healthy'
				if (
					containerNodeName.includes(nodeId) &&
					(containerNodeStatus.includes("Up") ||
						containerNodeStatus.includes("healthy"))
				) {
					statusGreenNode.show();
					statusRedNode.hide();
					console.info(
						"nodeContainerStatusVisibility: " + nodeContainerStatusVisibility,
					);
				} else if (
					containerNodeName.includes(nodeId) &&
					containerNodeStatus.includes("(health: starting)")
				) {
					statusGreenNode.hide();
					statusOrangeNode.show();
				} else if (
					containerNodeName.includes(nodeId) &&
					containerNodeStatus.includes("Exited")
				) {
					statusGreenNode.hide();
					statusRedNode.show();
				}
			} else {
				statusGreenNode.hide();
				statusRedNode.hide();
			}

			statusGreenNode.position(statusGreenNodePosition);
			statusRedNode.position(statusRedNodePosition);
		});
	}

	function setNodeDataWithContainerAttribute(containerNodeName, status, state, IPAddress, GlobalIPv6Address) {
		cy.nodes().forEach(function (node) {
			var nodeId = node.data("id");
			if (containerNodeName.includes(nodeId)) {
				var containerDockerExtraAttributeData = {
					state: state,
					status: status,
				};

				node.data(
					"containerDockerExtraAttribute",
					containerDockerExtraAttributeData,
				);
				node.data("extraData").mgmtIpv4Addresss = IPAddress;
				node.data("extraData").mgmtIpv6Address = GlobalIPv6Address;

			}
		});
	}

	// 
	// End of JS Functions Event Handling section
	// End of JS Functions Event Handling section
	// 

	// 
	// Start of JS Generic Functions
	// Start of JS Generic Functions
	// 


	// Function to get the default node style from cy-style.json
	async function getDefaultNodeStyle(node) {
		try {
			// Fetch the cy-style.json file
			const response = await fetch("cy-style.json");
			// Check if the response is successful (status code 200)
			if (!response.ok) {
				throw new Error(
					`Failed to fetch cy-style.json (${response.status} ${response.statusText})`,
				);
			}
			// Parse the JSON response
			const styleData = await response.json();
			// Extract the default node style from the loaded JSON
			// Adjust this based on your JSON structure
			const defaultNodeStyle = styleData[0].style;
			return defaultNodeStyle;
		} catch (error) {
			console.error("Error loading cy-style.json:", error);
			appendMessage(`Error loading cy-style.json: ${error}`);
			// Return a default style in case of an error
			return {
				"background-color": "blue",
				"border-color": "gray",
				"border-width": "1px",
			};
		}
	}

	///logMessagesPanel Function to add a click event listener to the copy button
	const copyButton = document.getElementById("copyToClipboardButton");
	copyButton.className = "button is-smallest-element";
	copyButton.addEventListener("click", copyToClipboard);

	/// logMessagesPanel Function to copy textarea content to clipboard
	function copyToClipboard() {
		const textarea = document.getElementById("notificationTextarea");
		textarea.select();
		document.execCommand("copy");
	}

	function createModal(modalId, modalContent) {
		// Create the modal
		const htmlContent = `
                                                        <div id="${modalId}" class="modal">
                                                            <div id="${modalId}-modalBackgroundId" class="modal-background"></div>
                                                                ${modalContent}
                                                        </div>
                                                        `;

		const modalDiv = document.createElement("div");
		modalDiv.innerHTML = htmlContent;
		modalDiv.id = "modalDivExportViewport";

		document.body.appendChild(modalDiv);
		const modalBackground = document.getElementById(
			`${modalId}-modalBackgroundId`,
		);

		modalBackground.addEventListener("click", function () {
			const modal = modalBackground.parentNode;
			modal.classList.remove("is-active");
		});
	}

	function showModalCaptureViewport(modalId) {
		const modalContentSaveViewport = ` 	
                                                                <div class="modal-content" style="max-width:300px;">
                                                                    <div class="box px-1 pb-1">
                                                                        <div class="column is-flex is-justify-content-center ">
                                                                                <i class="icon fas fa-camera  is-large"></i>
                                                                        </div>
                                                                        <div class="column">
                                                                            <div class="content py-0 px-5">
                                                                                <p class="has-text-centered is-size-6 has-text-weight-bold py-0 mb-2">Select file type</p>
                                                                                <p class="has-text-centered is-size-7 has-text-weight-normal">Choose one or multiple types you want to export</p>
                                                                            </div>
                                                                        </div>
                                                                        <div class="column px-5">
                                                                            <div class="control is-flex is-flex-direction-column">
                                                                                <div class="column py-2">
                                                                                    <label class="checkbox is-size-7">
                                                                                    <input type="checkbox"  name="checkboxSaveViewPort" value="option01">
                                                                                    PNG
                                                                                    </label>
                                                                                </div>
                                                                                <div class="column py-2">
                                                                                    <label class="checkbox is-size-7">
                                                                                    <input type="checkbox" name="checkboxSaveViewPort" value="option02">
                                                                                    Draw.IO
                                                                                    </label>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div class="column p-0 pb-3 is-flex is-flex-direction-column is-flex-grow-3" >
                                                                            <div class="column" style="background-color: white">
                                                                                <button id="performActionButton" class="button button-modal is-small is-link is-fullwidth">Continue</button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                `;

		// Instantiate modal
		createModal("modalSaveViewport", modalContentSaveViewport);

		// create event listener
		const performActionButton = document.getElementById("performActionButton");
		performActionButton.addEventListener("click", function () {
			const checkboxName = "checkboxSaveViewPort";
			const checkboxes = document.querySelectorAll(
				`input[type="checkbox"][name="${checkboxName}"]`,
			);
			const selectedOptions = [];

			checkboxes.forEach(function (checkbox) {
				if (checkbox.checked) {
					selectedOptions.push(checkbox.value);
				}
			});

			if (selectedOptions.length === 0) {
				bulmaToast.toast({
					message: `Hey there, please pick at least one option.😊👌`,
					type: "is-warning is-size-6 p-3",
					duration: 4000,
					position: "top-center",
					closeOnClick: true,
				});
			} else {
				// Perform your action based on the selected options
				// Perform your action based on the selected options
				if (selectedOptions.join(", ") == "option01") {
					captureAndSaveViewportAsPng(cy);
					modal.classList.remove("is-active");
				} else if (selectedOptions.join(", ") == "option02") {
					captureAndSaveViewportAsDrawIo(cy);
					modal.classList.remove("is-active");
				} else if (selectedOptions.join(", ") == "option01, option02") {
					captureAndSaveViewportAsPng(cy);
					sleep(5000);
					captureAndSaveViewportAsDrawIo(cy);
					modal.classList.remove("is-active");
				}
			}
		});

		// show modal
		modal = document.getElementById(modalId);
		modal.classList.add("is-active");
	}

	// 
	// End of JS Generic Functions section
	// End of JS Generic Functions section
	// 
});

// aarafat-tag:
//// REFACTOR START
//// to-do:
////  - re-create about-panel
////  - re-create log-messages
////  - re-create viewport

async function initEnv() {
	environments = await getEnvironments();
	labName = await environments["clab-name"]
	deploymentType = await environments["deployment-type"]

	console.info("Lab-Name: ", labName)
	console.info("DeploymentType: ", deploymentType)
	return environments, labName
}

async function changeTitle() {
	environments = await getEnvironments();
	labName = await environments["clab-name"]

	console.info("changeTitle() - labName: ", labName)
	document.title = `TopoViewer::${labName}`;
}

async function sshWebBased(event) {
	console.info("sshWebBased: ", globalSelectedNode)
	var routerName = globalSelectedNode
	try {
		environments = await getEnvironments(event);
		console.info("sshWebBased - environments: ", environments)
		cytoTopologyJson = environments["EnvCyTopoJsonBytes"]
		routerData = findCytoElementByLongname(cytoTopologyJson, routerName)

		console.info("sshWebBased: ", `${globalShellUrl}?RouterID=${routerData["data"]["extraData"]["mgmtIpv4Addresss"]}?RouterName=${routerName}`)

		window.open(`${globalShellUrl}?RouterID=${routerData["data"]["extraData"]["mgmtIpv4Addresss"]}?RouterName=${routerName}`);

	} catch (error) {
		console.error('Error executing restore configuration:', error);
	}
}

async function sshCliCommandCopy(event) {
	console.info("sshWebBased: ", globalSelectedNode)
	var routerName = globalSelectedNode
	try {
		environments = await getEnvironments(event);
		console.info("sshWebBased - environments: ", environments)

		cytoTopologyJson = environments["EnvCyTopoJsonBytes"]
		clabServerAddress = environments["clab-server-address"]
		routerData = findCytoElementByLongname(cytoTopologyJson, routerName)
		clabUser = routerData["data"]["extraData"]["clabServerUsername"]

		sshCopyString = `ssh -t ${clabUser}@${clabServerAddress} "ssh admin@${routerName}"`

		// Check if the clipboard API is available
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(sshCopyString).then(function () {
				bulmaToast.toast({
					message: `Hey there, text cpied to clipboard. 😎`,
					type: "is-warning is-size-6 p-3",
					duration: 4000,
					position: "top-center",
					closeOnClick: true,
				});
			}).catch(function (error) {
				console.error('Could not copy text: ', error);
			});
		} else {
			// Fallback method for older browsers
			let textArea = document.createElement('textarea');
			textArea.value = sshCopyString;
			document.body.appendChild(textArea);
			textArea.focus();
			textArea.select();
			try {
				document.execCommand('copy');
				bulmaToast.toast({
					message: `Hey there, text cpied to clipboard. 😎`,
					type: "is-warning is-size-6 p-3",
					duration: 4000,
					position: "top-center",
					closeOnClick: true,
				});
			} catch (err) {
				console.error('Fallback: Oops, unable to copy', err);
			}
			document.body.removeChild(textArea);
		}

	} catch (error) {
		console.error('Error executing restore configuration:', error);
	}
}


async function linkImpairmentClab(event, impairDirection) {
	console.info("linkImpairmentClab - globalSelectedEdge: ", globalSelectedEdge);
	var edgeId = globalSelectedEdge;

	try {
		const environments = await getEnvironments(event);
		console.info("linkImpairment - environments: ", environments);

		const deploymentType = environments["deployment-type"];
		const cytoTopologyJson = environments["EnvCyTopoJsonBytes"];
		const edgeData = findCytoElementById(cytoTopologyJson, edgeId);

		console.info("linkImpairment - edgeData: ", edgeData);

		const clabUser = edgeData["data"]["extraData"]["clabServerUsername"];
		const clabServerAddress = environments["clab-server-address"];
		const clabSourceLongName = edgeData["data"]["extraData"]["clabSourceLongName"];
		const clabSourcePort = edgeData["data"]["extraData"]["clabSourcePort"];
		const clabTargetLongName = edgeData["data"]["extraData"]["clabTargetLongName"];
		const clabTargetPort = edgeData["data"]["extraData"]["clabTargetPort"];

		const getValues = (endpoint) => ({
			delay: parseInt(document.getElementById(`panel-link-endpoint-${endpoint}-delay`).value, 10),
			jitter: parseInt(document.getElementById(`panel-link-endpoint-${endpoint}-jitter`).value, 10),
			rate: parseInt(document.getElementById(`panel-link-endpoint-${endpoint}-rate`).value, 10),
			loss: parseInt(document.getElementById(`panel-link-endpoint-${endpoint}-loss`).value, 10),
			corruption: parseInt(document.getElementById(`panel-link-endpoint-${endpoint}-corruption`).value, 10),

		});

		if (impairDirection === "a-to-b" || impairDirection === "bidirectional") {
			const {
				delay,
				jitter,
				rate,
				loss,
				corruption
			} = getValues("a");
			const command = deploymentType === "container" ?
				`/usr/bin/containerlab tools netem set -n ${clabSourceLongName} -i ${clabSourcePort} --delay ${delay}ms --jitter ${jitter}ms --rate ${rate} --loss ${loss} --corruption ${corruption}` :
				`/usr/bin/containerlab tools netem set -n ${clabSourceLongName} -i ${clabSourcePort} --delay ${delay}ms --jitter ${jitter}ms --rate ${rate} --loss ${loss} --corruption ${corruption}`;

			console.info(`linkImpairment - deployment ${deploymentType}, command: ${command}`);
			await sendRequestToEndpointPost("/clab-link-impairment", [command]);
		}

		if (impairDirection === "b-to-a" || impairDirection === "bidirectional") {
			const {
				delay,
				jitter,
				rate,
				loss,
				corruption
			} = getValues("b");
			const command = deploymentType === "container" ?
				`/usr/bin/containerlab tools netem set -n ${clabTargetLongName} -i ${clabTargetPort} --delay ${delay}ms --jitter ${jitter}ms --rate ${rate} --loss ${loss} --corruption ${corruption}` :
				`/usr/bin/containerlab tools netem set -n ${clabTargetLongName} -i ${clabTargetPort} --delay ${delay}ms --jitter ${jitter}ms --rate ${rate} --loss ${loss} --corruption ${corruption}`;

			console.info(`linkImpairment - deployment ${deploymentType}, command: ${command}`);
			await sendRequestToEndpointPost("/clab-link-impairment", [command]);
		}
	} catch (error) {
		console.error("Error executing linkImpairment configuration:", error);
	}
}


async function linkWireshark(event, option, endpoint, referenceElementAfterId) {
	console.info("linkWireshark - globalSelectedEdge: ", globalSelectedEdge)
	console.info("linkWireshark - option: ", option)
	console.info("linkWireshark - endpoint: ", endpoint)
	console.info("linkWireshark - referenceElementAfterId: ", referenceElementAfterId)


	var edgeId = globalSelectedEdge
	try {
		environments = await getEnvironments(event);
		console.info("linkWireshark - environments: ", environments)

		var deploymentType = environments["deployment-type"]

		cytoTopologyJson = environments["EnvCyTopoJsonBytes"]
		edgeData = findCytoElementById(cytoTopologyJson, edgeId)

		console.info("linkWireshark- edgeData: ", edgeData)
		console.info("linkWireshark- edgeSource: ", edgeData["data"]["source"])

		clabUser = edgeData["data"]["extraData"]["clabServerUsername"]

		clabAllowedHostname = environments["clab-allowed-hostname"]

		clabAllowedHostname01 = environments["clab-allowed-hostname01"]
		if (clabAllowedHostname01 == "") {
			clabAllowedHostname01 = clabAllowedHostname
		}

		clabServerAddress = environments["clab-server-address"]

		clabSourceLongName = edgeData["data"]["extraData"]["clabSourceLongName"]
		clabSourcePort = edgeData["data"]["extraData"]["clabSourcePort"]

		clabTargetLongName = edgeData["data"]["extraData"]["clabTargetLongName"]
		clabTargetPort = edgeData["data"]["extraData"]["clabTargetPort"]

		if (option == "app") {
			if (endpoint == "source") {
				wiresharkHref = `clab-capture://${clabUser}@${clabServerAddress}?${clabSourceLongName}?${clabSourcePort}`
				console.info("linkWireshark- wiresharkHref: ", wiresharkHref)

			} else if (endpoint == "target") {
				wiresharkHref = `clab-capture://${clabUser}@${clabServerAddress}?${clabTargetLongName}?${clabTargetPort}`
				console.info("linkWireshark- wiresharkHref: ", wiresharkHref)
			}
			window.open(wiresharkHref);

		} else if (option == "edgeSharkInterface") {
			if (endpoint == "source") {
				baseUrl = `packetflix:ws://${clabAllowedHostname01}:5001/capture?`;

				netNsResponse = await sendRequestToEndpointGetV3("/clab-node-network-namespace", argsList = [clabSourceLongName])
				console.info("linkWireshark - netNsSource: ", netNsResponse.namespace_id.slice(netNsResponse.namespace_id.indexOf("[") + 1, netNsResponse.namespace_id.indexOf("]")))
				netNsIdSource = netNsResponse.namespace_id.slice(netNsResponse.namespace_id.indexOf("[") + 1, netNsResponse.namespace_id.indexOf("]"))

				urlParams = `container={"netns":${netNsIdSource},"network-interfaces":["${clabSourcePort}"],"name":"${clabSourceLongName.toLocaleLowerCase()}","type":"docker","prefix":""}&nif=${clabSourcePort}`;
				edgeSharkHref = baseUrl + urlParams;
				console.info("linkWireshark - edgeSharkHref: ", edgeSharkHref)
				window.open(edgeSharkHref);

			} else if (endpoint == "target") {
				baseUrl = `packetflix:ws://${clabAllowedHostname01}:5001/capture?`;

				netNsResponse = await sendRequestToEndpointGetV3("/clab-node-network-namespace", argsList = [clabTargetLongName])
				console.info("linkWireshark - netNsSource: ", netNsResponse.namespace_id.slice(netNsResponse.namespace_id.indexOf("[") + 1, netNsResponse.namespace_id.indexOf("]")))
				netNsIdTarget = netNsResponse.namespace_id.slice(netNsResponse.namespace_id.indexOf("[") + 1, netNsResponse.namespace_id.indexOf("]"))

				urlParams = `container={"netns":${netNsIdTarget},"network-interfaces":["${clabTargetPort}"],"name":"${clabTargetLongName.toLocaleLowerCase()}","type":"docker","prefix":""}&nif=${clabTargetPort}`;
				edgeSharkHref = baseUrl + urlParams;
				console.info("linkWireshark - edgeSharkHref: ", edgeSharkHref)
				window.open(edgeSharkHref);
			}

		} else if (option == "edgeSharkSubInterface") {
			if (referenceElementAfterId == "endpoint-a-edgeshark") {
				baseUrl = `packetflix:ws://${clabAllowedHostname01}:5001/capture?`;

				netNsResponse = await sendRequestToEndpointGetV3("/clab-node-network-namespace", argsList = [clabSourceLongName])
				console.info("linkWireshark - netNsSource: ", netNsResponse.namespace_id.slice(netNsResponse.namespace_id.indexOf("[") + 1, netNsResponse.namespace_id.indexOf("]")))
				netNsIdSource = netNsResponse.namespace_id.slice(netNsResponse.namespace_id.indexOf("[") + 1, netNsResponse.namespace_id.indexOf("]"))

				urlParams = `container={"netns":${netNsIdSource},"network-interfaces":["${endpoint}"],"name":"${clabSourceLongName.toLocaleLowerCase()}","type":"docker","prefix":""}&nif=${endpoint}`;
				edgeSharkHref = baseUrl + urlParams;
				console.info("linkWireshark - edgeSharkHref: ", edgeSharkHref)
				window.open(edgeSharkHref);
			}
			if (referenceElementAfterId == "endpoint-b-edgeshark") {
				console.info("linkWireshark - endpoint-b-edgeshark")
				baseUrl = `packetflix:ws://${clabAllowedHostname01}:5001/capture?`;

				netNsResponse = await sendRequestToEndpointGetV3("/clab-node-network-namespace", argsList = [clabTargetLongName])
				console.info("linkWireshark - netNsSource: ", netNsResponse.namespace_id.slice(netNsResponse.namespace_id.indexOf("[") + 1, netNsResponse.namespace_id.indexOf("]")))
				netNsIdTarget = netNsResponse.namespace_id.slice(netNsResponse.namespace_id.indexOf("[") + 1, netNsResponse.namespace_id.indexOf("]"))

				urlParams = `container={"netns":${netNsIdTarget},"network-interfaces":["${endpoint}"],"name":"${clabSourceLongName.toLocaleLowerCase()}","type":"docker","prefix":""}&nif=${endpoint}`;
				edgeSharkHref = baseUrl + urlParams;
				console.info("linkWireshark - edgeSharkHref: ", edgeSharkHref)
				window.open(edgeSharkHref);
			}
			if (referenceElementAfterId == "endpoint-a-clipboard") {
				console.info("linkWireshark - endpoint-a-clipboard")
				if (deploymentType == "container") {
					wiresharkSshCommand = `ssh ${clabUser}@${clabAllowedHostname} "sudo -S /sbin/ip netns exec ${clabSourceLongName} tcpdump -U -nni ${endpoint} -w -" | wireshark -k -i -`
				} else if (deploymentType == "colocated") {
					wiresharkSshCommand = `ssh ${clabUser}@${clabAllowedHostname} "sudo -S /sbin/ip netns exec ${clabSourceLongName} tcpdump -U -nni ${endpoint} -w -" | wireshark -k -i -`
				}
				// Check if the clipboard API is available
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(wiresharkSshCommand).then(function () {
						bulmaToast.toast({
							message: `Hey, now you can paste the link to your terminal console. 😎`,
							type: "is-warning is-size-6 p-3",
							duration: 4000,
							position: "top-center",
							closeOnClick: true,
						});
					}).catch(function (error) {
						console.error('Could not copy text: ', error);
					});
				} else {
					// Fallback method for older browsers
					let textArea = document.createElement('textarea');
					textArea.value = wiresharkSshCommand;
					document.body.appendChild(textArea);
					textArea.focus();
					textArea.select();
					try {
						document.execCommand('copy');
						// alert('Text copied to clipboard');
						bulmaToast.toast({
							message: `Hey, now you can paste the link to your terminal console. 😎`,
							type: "is-warning is-size-6 p-3",
							duration: 4000,
							position: "top-center",
							closeOnClick: true,
						});
					} catch (err) {
						console.error('Fallback: Oops, unable to copy', err);
					}
					document.body.removeChild(textArea);
				}
			}
			if (referenceElementAfterId == "endpoint-b-clipboard") {
				console.info("linkWireshark - endpoint-b-clipboard")
				if (deploymentType == "container") {
					wiresharkSshCommand = `ssh ${clabUser}@${clabAllowedHostname} "sudo -S /sbin/ip netns exec ${clabTargetLongName} tcpdump -U -nni ${endpoint} -w -" | wireshark -k -i -`
				} else if (deploymentType == "colocated") {
					wiresharkSshCommand = `ssh ${clabUser}@${clabAllowedHostname} "sudo -S /sbin/ip netns exec ${clabTargetLongName} tcpdump -U -nni ${endpoint} -w -" | wireshark -k -i -`
				}
				// Check if the clipboard API is available
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(wiresharkSshCommand).then(function () {
						bulmaToast.toast({
							message: `Hey, now you can paste the link to your terminal console. 😎`,
							type: "is-warning is-size-6 p-3",
							duration: 4000,
							position: "top-center",
							closeOnClick: true,
						});
					}).catch(function (error) {
						console.error('Could not copy text: ', error);
					});
				} else {
					// Fallback method for older browsers
					let textArea = document.createElement('textarea');
					textArea.value = wiresharkSshCommand;
					document.body.appendChild(textArea);
					textArea.focus();
					textArea.select();
					try {
						document.execCommand('copy');
						// alert('Text copied to clipboard');
						bulmaToast.toast({
							message: `Hey, now you can paste the link to your terminal console. 😎`,
							type: "is-warning is-size-6 p-3",
							duration: 4000,
							position: "top-center",
							closeOnClick: true,
						});
					} catch (err) {
						console.error('Fallback: Oops, unable to copy', err);
					}
					document.body.removeChild(textArea);
				}
			}


		} else if (option == "copy") {
			if (endpoint == "source") {
				if (deploymentType == "container") {
					wiresharkSshCommand = `ssh ${clabUser}@${clabAllowedHostname} "sudo -S /sbin/ip netns exec ${clabSourceLongName} tcpdump -U -nni ${clabSourcePort} -w -" | wireshark -k -i -`
				} else if (deploymentType == "colocated") {
					wiresharkSshCommand = `ssh ${clabUser}@${clabAllowedHostname} "sudo -S /sbin/ip netns exec ${clabSourceLongName} tcpdump -U -nni ${clabSourcePort} -w -" | wireshark -k -i -`
				}
			} else if (endpoint == "target") {
				if (deploymentType == "container") {
					wiresharkSshCommand = `ssh ${clabUser}@${clabAllowedHostname} "sudo -S /sbin/ip netns exec ${clabTargetLongName} tcpdump -U -nni ${clabTargetPort} -w -" | wireshark -k -i -`
				} else if (deploymentType == "colocated") {
					wiresharkSshCommand = `ssh ${clabUser}@${clabAllowedHostname} "sudo -S /sbin/ip netns exec ${clabTargetLongName} tcpdump -U -nni ${clabTargetPort} -w -" | wireshark -k -i -`
				}
			}

			console.info("linkWireshark- wiresharkSShCommand: ", wiresharkSshCommand)

			// Check if the clipboard API is available
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(wiresharkSshCommand).then(function () {
					bulmaToast.toast({
						message: `Hey, now you can paste the link to your terminal console. 😎`,
						type: "is-warning is-size-6 p-3",
						duration: 4000,
						position: "top-center",
						closeOnClick: true,
					});
				}).catch(function (error) {
					console.error('Could not copy text: ', error);
				});
			} else {
				// Fallback method for older browsers
				let textArea = document.createElement('textarea');
				textArea.value = wiresharkSshCommand;
				document.body.appendChild(textArea);
				textArea.focus();
				textArea.select();
				try {
					document.execCommand('copy');
					// alert('Text copied to clipboard');
					bulmaToast.toast({
						message: `Hey, now you can paste the link to your terminal console. 😎`,
						type: "is-warning is-size-6 p-3",
						duration: 4000,
						position: "top-center",
						closeOnClick: true,
					});
				} catch (err) {
					console.error('Fallback: Oops, unable to copy', err);
				}
				document.body.removeChild(textArea);
			}

		}

	} catch (error) {
		console.error('Error executing linkImpairment configuration:', error);
	}
}

async function showPanelLogMessages(event) {
	document.getElementById("panel-log-messages").style.display = "block";
}

///logMessagesPanel Function to add a click event listener to the close button
document.getElementById("panel-log-messages-close-button").addEventListener("click", () => {
	document.getElementById("panel-log-messages").style.display = "none";
});



async function showPanelTopoViewerClient(event) {
	// Remove all Overlayed Panel
	// Get all elements with the class "panel-overlay"
	var panelOverlays = document.getElementsByClassName("panel-overlay");
	// Loop through each element and set its display to 'none'
	for (var i = 0; i < panelOverlays.length; i++) {
		panelOverlays[i].style.display = "none";
	}

	environments = await getEnvironments(event);
	console.info("linkImpairment - environments: ", environments)

	clabServerAddress = environments["clab-server-address"]
	clabServerPort = environments["clab-server-port"]

	hrefWindows = `http://${clabServerAddress}:${clabServerPort}/clab-client/clab-client-windows/ClabCapture.app.zip`
	hrefMac = `http://${clabServerAddress}:${clabServerPort}/clab-client/clab-client-mac/ClabCapture.app.zip`

	document.getElementById("panel-topoviewer-helper").style.display = "block";

	const htmlContent = `
            <h6>Wireshark Capture</h6>
            <p>
                TopoViewer offers a remote capture feature for intercepting Containerlab node endpoints with the help from EdgeShark. 
                For the best experience, it's recommended to have both TopoViewer and its EdgeShark's helper app (packetflix) installed on client-side. 
            </p>
            <p>
                please refer to this link https://containerlab.dev/manual/wireshark/#edgeshark-integration for more information on how to install the helper app.
                With the TopoViewer helper app, you can effortlessly automate the launch of Wireshark's GUI. 
            </p>
            <p>
                Alternatively, if you don't have the helper app, you can simply copy and paste an SSH command to initiate Wireshark manually. 
                This setup provides flexibility in how you utilize this feature. <br>
            </p>
    `;
	document.getElementById("panel-topoviewer-helper-content").innerHTML = htmlContent;
}

async function showPanelAbout(event) {
	// Remove all Overlayed Panel
	// Get all elements with the class "panel-overlay"
	var panelOverlays = document.getElementsByClassName("panel-overlay");
	// Loop through each element and set its display to 'none'
	for (var i = 0; i < panelOverlays.length; i++) {
		panelOverlays[i].style.display = "none";
	}

	environments = await getEnvironments(event);
	console.info("linkImpairment - environments: ", environments)

	topoViewerVersion = environments["topoviewer-version"]


	console.log("environments:", environments)
	console.log("topoViewerVersion:", topoViewerVersion)

	document.getElementById("panel-topoviewer-about").style.display = "block";

	const htmlContent = `
        <div class="content is-small pb-2">
            <h6>Version: ${topoViewerVersion}</h6>
            
            <p>
            Designed and developed by <strong><a href="https://www.linkedin.com/in/asadarafat/">Asad Arafat</a></strong> <br>
            </p>
            <p>
            Special Thanks:
                <ul>
                    <li><strong><a href="https://www.linkedin.com/in/siva19susi/">Siva Sivakumar</a></strong> - For pioneering the integration of Bulma CSS, significantly enhancing TopoViewer design and usability.</li>
                    <li><strong><a href="https://www.linkedin.com/in/gatot-susilo-b073166//">Gatot Susilo</a></strong> - For seamlessly incorporating TopoViewer into the Komodo2 tool, bridging functionality with innovation.</li>
                    <li><strong><a href="https://www.linkedin.com/in/gusman-dharma-putra-1b955117/">Gusman Dharma Putra</a></strong> - For his invaluable contribution in integrating TopoViewer into Komodo2, enriching its capabilities.</li>
                    <li><strong><a href="https://www.linkedin.com/in/sven-wisotzky-44788333/">Sven Wisotzky</a></strong> - For offering insightful feedback that led to significant full stack optimizations.</li>
                </ul>
            </p>


        </div>
    `;
	document.getElementById("panel-topoviewer-about-content").innerHTML = htmlContent;
}

// async function sidebarButtonFitScreen(event) {

// 	// --sidebar-button-background-color-default: rgba(54,58, 69, 1);
// 	// --sidebar-button-background-color-active:  rgba(76, 82, 97, 1);

// 	var sidebarButtonFitScreen = document.getElementById("sidebar-button-fit-screen")
// 	const sidebarButtonColorDefault = getComputedStyle(sidebarButtonFitScreen).getPropertyValue('--sidebar-button-background-color-default');
// 	const sidebarButtonColorActive = getComputedStyle(sidebarButtonFitScreen).getPropertyValue('--sidebar-button-background-color-active');

// 	drawer = document.getElementById("drawer")
// 	if (drawer.style.display === 'block') {
// 		drawer.style.display = 'none';
// 		var sidebarButtonFitScreen = document.getElementById("sidebar-button-fit-screen")
// 		sidebarButtonFitScreen.style.background = sidebarButtonColorDefault.trim();
// 		sidebarButtonFitScreen.style.border = sidebarButtonColorActive.trim();
// 	} else {
// 		drawer.style.display = 'block';
// 		var sidebarButtons = document.getElementsByClassName("is-sidebar");
// 		// Loop through each element and set its display to 'none'
// 		for (var i = 0; i < sidebarButtons.length; i++) {
// 			sidebarButtons[i].style.background = sidebarButtonColorDefault.trim();
// 			sidebarButtons[i].style.border = sidebarButtonColorDefault.trim();
// 		}
// 		sidebarButtonFitScreen.style.background = sidebarButtonColorActive.trim();
// 	}

// }

async function getActualNodesEndpoints(event) {
	try {
		bulmaToast.toast({
			message: `Getting Actual Nodes Endpoint Labels... Hold on..! 🚀💻`,
			type: "is-warning is-size-6 p-3",
			duration: 4000,
			position: "top-center",
			closeOnClick: true,
		});
		appendMessage(
			`Getting Actual Nodes Endpoint Labels... Hold on..! 🚀💻`,
		);

		showLoadingSpinnerGlobal()
		const CyTopoJson = await sendRequestToEndpointGetV2("/actual-nodes-endpoints", argsList = [])
		location.reload(true);

		// Handle the response data
		if (CyTopoJson && typeof CyTopoJson === 'object' && Object.keys(CyTopoJson).length > 0) {
			hideLoadingSpinnerGlobal();
			console.info("Valid non-empty JSON response received:", CyTopoJson);

			hideLoadingSpinnerGlobal();

			return CyTopoJson

		} else {

			hideLoadingSpinnerGlobal();

			console.info("Empty or invalid JSON response received");
		}
	} catch (error) {
		hideLoadingSpinnerGlobal();
		console.error("Error occurred:", error);
		// Handle errors as needed
	}
}

function viewportButtonsZoomToFit() {
	const initialZoom = cy.zoom();
	appendMessage(`Bro, initial zoom level is "${initialZoom}".`);
	console.info(`Bro, initial zoom level is "${initialZoom}".`);
	// Fit all nodes possible with padding
	// Fit all nodes possible with padding
	cy.fit();
	const currentZoom = cy.zoom();
	appendMessage(`And now the zoom level is "${currentZoom}".`);
	console.info(`And now the zoom level is "${currentZoom}".`);

	// cytoscapeLeafletLeaf instance map to fit nodes
	cytoscapeLeafletLeaf.fit();
	console.log("cytoscapeLeafletLeaf.fit()")

}

function viewportButtonsLayoutAlgo() {
	var viewportDrawer = document.getElementsByClassName("viewport-drawer");
	// Loop through each element and set its display to 'none'
	for (var i = 0; i < viewportDrawer.length; i++) {
		viewportDrawer[i].style.display = "none";
	}

	viewportDrawerLayout = document.getElementById("viewport-drawer-layout")
	viewportDrawerLayout.style.display = "block"
}


function viewportNodeFindEvent(event) {
	// Get a reference to your Cytoscape instance (assuming it's named 'cy')
	// const cy = window.cy; // Replace 'window.cy' with your actual Cytoscape instance
	// Find the node with the specified name
	const nodeName = document.getElementById("viewport-drawer-topology-overview-content-edit").value;
	const node = cy.$(`node[name = "${nodeName}"]`);
	// Check if the node exists
	if (node.length > 0) {
		console.info("Info: " + 'Sweet! Node "' + nodeName + '" is in the house.');
		appendMessage("Info: " + 'Sweet! Node "' + nodeName + '" is in the house.');
		// Apply a highlight style to the node
		node.style({
			"border-color": "red",
			"border-width": "2px",
			"background-color": "yellow",
		});
		// Zoom out on the node
		cy.fit();
		// Zoom in on the node
		cy.animate({
			zoom: {
				level: 5,
				position: {
					x: node.position("x"),
					y: node.position("y"),
				},
				renderedPosition: {
					x: node.renderedPosition("x"),
					y: node.renderedPosition("y"),
				},
			},
			duration: 1500,
		});
	} else {
		console.error(
			`Bro, I couldn't find a node named "${nodeName}". Try another one.`,
		);
		appendMessage(
			`Bro, I couldn't find a node named "${nodeName}". Try another one.`,
		);
	}
}

async function layoutAlgoChange(event) {

	try {
		console.info("layoutAlgoChange clicked");

		var selectElement = document.getElementById("select-layout-algo");
		var selectedOption = selectElement.value;

		if (selectedOption === "Force Directed") {
			console.info("Force Directed algo selected");

			var layoutAlgoPanels = document.getElementsByClassName("layout-algo");
			// Loop through each element and set its display to 'none'
			for (var i = 0; i < layoutAlgoPanels.length; i++) {
				layoutAlgoPanels[i].style.display = "none";
			}

			viewportDrawerForceDirected = document.getElementById("viewport-drawer-force-directed")
			viewportDrawerForceDirected.style.display = "block"

			viewportDrawerForceDirectedResetStart = document.getElementById("viewport-drawer-force-directed-reset-start")
			viewportDrawerForceDirectedResetStart.style.display = "block"

			console.info(document.getElementById("viewport-drawer-force-directed"))
			console.info(document.getElementById("viewport-drawer-force-directed-reset-start"))

		} else if (selectedOption === "Force Directed Radial") {
			console.info("Force Directed Radial algo selected");

			var layoutAlgoPanels = document.getElementsByClassName("layout-algo");
			// Loop through each element and set its display to 'none'
			for (var i = 0; i < layoutAlgoPanels.length; i++) {
				layoutAlgoPanels[i].style.display = "none";
			}

			viewportDrawerForceDirected = document.getElementById("viewport-drawer-force-directed-radial")
			viewportDrawerForceDirected.style.display = "block"

			viewportDrawerForceDirectedResetStart = document.getElementById("viewport-drawer-force-directed-radial-reset-start")
			viewportDrawerForceDirectedResetStart.style.display = "block"

			console.info(document.getElementById("viewport-drawer-force-directed-radial"))
			console.info(document.getElementById("viewport-drawer-force-directed-radial-reset-start"))

		} else if (selectedOption === "Vertical") {
			console.info("Vertical algo selected");

			var layoutAlgoPanels = document.getElementsByClassName("layout-algo");
			// Loop through each element and set its display to 'none'
			for (var i = 0; i < layoutAlgoPanels.length; i++) {
				layoutAlgoPanels[i].style.display = "none";
			}

			viewportDrawerForceDirected = document.getElementById("viewport-drawer-dc-vertical")
			viewportDrawerForceDirected.style.display = "block"

			viewportDrawerForceDirectedResetStart = document.getElementById("viewport-drawer-dc-vertical-reset-start")
			viewportDrawerForceDirectedResetStart.style.display = "block"

			console.info(document.getElementById("viewport-drawer-dc-vertical"))
			console.info(document.getElementById("viewport-drawer-dc-vertical-reset-start"))

		} else if (selectedOption === "Horizontal") {
			console.info("Horizontal algo selected");

			var layoutAlgoPanels = document.getElementsByClassName("layout-algo");
			// Loop through each element and set its display to 'none'
			for (var i = 0; i < layoutAlgoPanels.length; i++) {
				layoutAlgoPanels[i].style.display = "none";
			}

			viewportDrawerForceDirected = document.getElementById("viewport-drawer-dc-horizontal")
			viewportDrawerForceDirected.style.display = "block"

			viewportDrawerForceDirectedResetStart = document.getElementById("viewport-drawer-dc-horizontal-reset-start")
			viewportDrawerForceDirectedResetStart.style.display = "block"

			console.info(document.getElementById("viewport-drawer-dc-horizontal"))
			console.info(document.getElementById("viewport-drawer-dc-horizontal-reset-start"))

		} else if (selectedOption === "Geo Positioning") {
			console.info("GeoMap algo selected");

			var layoutAlgoPanels = document.getElementsByClassName("layout-algo");
			// Loop through each element and set its display to 'none'
			for (var i = 0; i < layoutAlgoPanels.length; i++) {
				layoutAlgoPanels[i].style.display = "none";
			}

			viewportDrawerGeoMap = document.getElementById("viewport-drawer-geo-map")
			viewportDrawerGeoMap.style.display = "block"

			viewportDrawerGeoMapContent01 = document.getElementById("viewport-drawer-geo-map-content-01")
			viewportDrawerGeoMapContent01.style.display = "block"

			viewportDrawerGeoMapResetStart = document.getElementById("viewport-drawer-geo-map-reset-start")
			viewportDrawerGeoMapResetStart.style.display = "block"

			console.info(document.getElementById("viewport-drawer-geo-map"))
			console.info(document.getElementById("viewport-drawer-geo-map-reset-start"))
		}

	} catch (error) {
		console.error("Error occurred:", error);
		// Handle errors as needed
	}
}


function viewportButtonsTopologyOverview() {
	var viewportDrawer = document.getElementsByClassName("viewport-drawer");
	// Loop through each element and set its display to 'none'
	for (var i = 0; i < viewportDrawer.length; i++) {
		viewportDrawer[i].style.display = "none";
	}

	console.info("viewportButtonsTopologyOverview clicked")
	viewportDrawerLayout = document.getElementById("viewport-drawer-topology-overview")
	viewportDrawerLayout.style.display = "block"

	viewportDrawerLayoutContent = document.getElementById("viewport-drawer-topology-overview-content")
	viewportDrawerLayoutContent.style.display = "block"
}

function viewportButtonsTopologyCapture() {
	var viewportDrawer = document.getElementsByClassName("viewport-drawer");
	// Loop through each element and set its display to 'none'
	for (var i = 0; i < viewportDrawer.length; i++) {
		viewportDrawer[i].style.display = "none";
	}

	console.info("viewportButtonsTopologyCapture clicked")

	viewportDrawerCapture = document.getElementById("viewport-drawer-capture-sceenshoot")
	viewportDrawerCapture.style.display = "block"

	viewportDrawerCaptureContent = document.getElementById("viewport-drawer-capture-sceenshoot-content")
	viewportDrawerCaptureContent.style.display = "block"

	viewportDrawerCaptureButton = document.getElementById("viewport-drawer-capture-sceenshoot-button")
	viewportDrawerCaptureButton.style.display = "block"
}

function viewportButtonsLabelEndpoint() {
	if (linkEndpointVisibility) {
		cy.edges().forEach(function (edge) {
			edge.style("text-opacity", 0);
			edge.style("text-background-opacity", 0);
			linkEndpointVisibility = false;
		});

	} else {
		cy.edges().forEach(function (edge) {
			edge.style("text-opacity", 1);
			edge.style("text-background-opacity", 0.7);
			linkEndpointVisibility = true;
		});
	}
}

function viewportButtonContainerStatusVisibility() {
	if (nodeContainerStatusVisibility) {
		nodeContainerStatusVisibility = false;
		console.info(
			"nodeContainerStatusVisibility: " + nodeContainerStatusVisibility,
		);
		appendMessage(
			"nodeContainerStatusVisibility: " + nodeContainerStatusVisibility,
		);
		bulmaToast.toast({
			message: `Alright, mission control, we're standing down. 🛑🔍 Container status probing aborted. Stay chill, folks. 😎👨‍💻`,
			type: "is-warning is-size-6 p-3",
			duration: 4000,
			position: "top-center",
			closeOnClick: true,
		});
	} else {
		nodeContainerStatusVisibility = true;
		console.info(
			"nodeContainerStatusVisibility: " + nodeContainerStatusVisibility,
		);
		appendMessage(
			"nodeContainerStatusVisibility: " + nodeContainerStatusVisibility,
		);
		bulmaToast.toast({
			message: `🕵️‍♂️ Bro, we're currently on a mission to probe that container status! Stay tuned for the results. 🔍🚀👨‍💻`,
			type: "is-warning is-size-6 p-3",
			duration: 4000,
			position: "top-center",
			closeOnClick: true,
		});
	}
}



function viewportDrawerLayoutForceDirected() {
	const edgeLengthSlider = document.getElementById("force-directed-slider-link-lenght");
	const nodeGapSlider = document.getElementById("force-directed-slider-node-gap");

	const edgeLengthValue = parseFloat(edgeLengthSlider.value);
	const nodeGapValue = parseFloat(nodeGapSlider.value);

	console.info("edgeLengthValue", edgeLengthValue);
	console.info("nodeGapValue", nodeGapValue);

	// Calculate the layout for the optic layer (Layer-1)
	cy.layout({
		name: "cola",
		nodeSpacing: function (node) {
			return nodeGapValue;
		},
		edgeLength: function (edge) {
			return edgeLengthValue * 100 / edge.data("weight");
		},
		animate: true,
		randomize: false,
		maxSimulationTime: 1500
	}).run();

	// Get the bounding box of Layer-1 optic nodes
	const opticLayerNodes = cy.nodes('[parent="layer1"]');
	const opticBBox = opticLayerNodes.boundingBox();

	// Set layer offsets
	const layerOffsets = {
		layer2: opticBBox.y2 + 100, // L2 nodes below Optic layer
		layer3: opticBBox.y2 + 300, // IP/MPLS nodes below L2 layer
		layer4: opticBBox.y2 + 500 // VPN nodes below IP/MPLS layer
	};

	// Position the nodes for each layer while preserving x-coordinates
	["layer2", "layer3", "layer4"].forEach((layer, index) => {
		const layerNodes = cy.nodes(`[parent="${layer}"]`);
		const offsetY = layerOffsets[layer];

		layerNodes.positions((node, i) => {
			return {
				x: opticLayerNodes[i % opticLayerNodes.length].position("x"), // Align x with Layer-1
				y: opticLayerNodes[i % opticLayerNodes.length].position("y") + offsetY
			};
		});
	});

	// Optionally, apply animations for expanding and collapsing nodes
	const cyExpandCollapse = cy.expandCollapse({
		layoutBy: null, // Use existing layout
		undoable: false,
		fisheye: false,
		animationDuration: 10, // Duration of animation
		animate: true
	});
	// Example collapse/expand after some delay
	// Make sure the '#parent' node exists in your loaded elements
	setTimeout(function () {
		var parent = cy.$('#parent'); // Ensure that '#parent' is actually present in dataCytoMarshall.json
		cyExpandCollapse.collapse(parent);

		setTimeout(function () {
			cyExpandCollapse.expand(parent);
		}, 2000);
	}, 2000);
}

function viewportDrawerLayoutForceDirectedRadial() {

	edgeLengthSlider = document.getElementById("force-directed-radial-slider-link-lenght");
	const edgeLengthValue = parseFloat(edgeLengthSlider.value);
	console.info("edgeLengthValue", edgeLengthValue);

	nodeGapSlider = document.getElementById("force-directed-radial-slider-node-gap");
	const nodeGapValue = parseFloat(nodeGapSlider.value);
	console.info("edgeLengthValue", nodeGapValue);

	// Map TopoViewerGroupLevel to weights (lower levels = higher weight)	
	const nodeWeights = {};
	cy.nodes().forEach((node) => {
		const level = node.data('extraData')?.labels?.TopoViewerGroupLevel ?
			parseInt(node.data('extraData').labels.TopoViewerGroupLevel) :
			1; // Default level to 1 if missing
		nodeWeights[node.id()] = 1 / level; // Higher weight for lower levels
	});

	// Adjust edge styles to avoid overlaps
	cy.edges().forEach((edge) => {
		edge.style({
			'curve-style': 'bezier', // Use curved edges
			'control-point-step-size': 20, // Distance for control points
		});
	});

	// Apply Cola layout with weights and better edge handling
	cy.layout({
		name: 'cola',
		fit: true, // Automatically fit the layout to the viewport
		nodeSpacing: nodeGapValue, // Gap between nodes
		edgeLength: (edge) => {
			const sourceWeight = nodeWeights[edge.source().id()] || 1;
			const targetWeight = nodeWeights[edge.target().id()] || 1;
			return (1 * edgeLengthValue) / (sourceWeight + targetWeight); // Shorter edges for higher-weight nodes
		},
		edgeSymDiffLength: 10, // Symmetrical edge separation to reduce overlaps
		nodeDimensionsIncludeLabels: true, // Adjust layout considering node labels
		animate: true,
		maxSimulationTime: 2000,
		avoidOverlap: true, // Prevents node overlaps
	}).run();

	var cyExpandCollapse = cy.expandCollapse({
		layoutBy: null,
		undoable: false,
		fisheye: true,
		animationDuration: 10, // when animate is true, the duration in milliseconds of the animation
		animate: true
	});

	// Example collapse/expand after some time:
	setTimeout(function () {
		var parent = cy.$('#parent');
		cyExpandCollapse.collapse(parent);

		setTimeout(function () {
			cyExpandCollapse.expand(parent);
		}, 2000);
	}, 2000);
}

function viewportDrawerLayoutVertical() {
	// Retrieve the sliders for node and group vertical gaps
	const nodevGap = document.getElementById("vertical-layout-slider-node-v-gap");
	const groupvGap = document.getElementById("vertical-layout-slider-group-v-gap");

	// Parse the slider values for horizontal and vertical gaps
	const nodevGapValue = parseFloat(nodevGap.value); // Gap between child nodes within a parent
	const groupvGapValue = parseFloat(groupvGap.value); // Gap between parent nodes

	const delay = 100; // Delay to ensure layout updates after rendering

	setTimeout(() => {
		// Step 1: Position child nodes within their respective parents
		cy.nodes().forEach(function (node) {
			if (node.isParent()) {
				const children = node.children(); // Get the children of the current parent node
				const cellWidth = node.width() / children.length; // Calculate the width for each child node

				// Position child nodes evenly spaced within the parent node
				children.forEach(function (child, index) {
					const xPos = index * (cellWidth + nodevGapValue); // Horizontal position for the child
					const yPos = 0; // Keep child nodes on the same vertical level

					child.position({
						x: xPos,
						y: yPos
					});
				});
			}
		});

		// Step 2: Sort parent nodes by their group level and ID for vertical stacking
		const sortedParents = cy.nodes()
			.filter(node => node.isParent()) // Only process parent nodes
			.sort((a, b) => {
				// Extract group levels for primary sorting
				const groupLevelA = parseInt(a.data('extraData')?.topoViewerGroupLevel || 0, 10);
				const groupLevelB = parseInt(b.data('extraData')?.topoViewerGroupLevel || 0, 10);

				if (groupLevelA !== groupLevelB) {
					return groupLevelA - groupLevelB; // Sort by group level in ascending order
				}
				// Secondary sorting by node ID (alphabetical order)
				return a.data('id').localeCompare(b.data('id'));
			});

		let yPos = 0; // Starting vertical position for parent nodes
		let maxWidth = 0; // Initialize variable to store the maximum parent width
		const centerX = 0; // Define the horizontal center reference

		// Step 3: Find the widest parent node
		cy.nodes().forEach(function (node) {
			if (node.isParent()) {
				const width = node.width();
				if (width > maxWidth) {
					maxWidth = width; // Update maxWidth with the widest parent node's width
					console.info("ParentMaxWidth: ", maxWidth);
				}
			}
		});

		// Calculate division factor for aligning parent nodes
		const divisionFactor = maxWidth / 2;
		console.info("Division Factor: ", divisionFactor);

		// Step 4: Position parent nodes vertically and align them relative to the widest parent node
		sortedParents.forEach(function (parentNode) {
			const parentWidth = parentNode.width();

			// Calculate horizontal position relative to the widest parent
			const xPos = centerX - parentWidth / divisionFactor;

			// Position the parent node
			parentNode.position({
				x: xPos,
				y: yPos
			});

			console.info(`Parent Node '${parentNode.id()}' positioned at x: ${xPos}, y: ${yPos}`);

			// Increment vertical position for the next parent
			yPos += groupvGapValue;
		});

		// Step 5: Adjust the viewport to fit the updated layout
		cy.fit();

	}, delay);

	// Step 6: Expand/collapse functionality for parent nodes (optional)
	const cyExpandCollapse = cy.expandCollapse({
		layoutBy: null, // Use the existing layout
		undoable: false, // Disable undo functionality
		fisheye: false, // Disable fisheye view for expanded/collapsed nodes
		animationDuration: 10, // Duration of animations in milliseconds
		animate: true // Enable animation for expand/collapse
	});

	// Example: Demonstrate expand/collapse behavior with a specific parent node
	setTimeout(function () {
		const parent = cy.$('#parent'); // Replace '#parent' with the actual parent node ID if needed
		cyExpandCollapse.collapse(parent); // Collapse the parent node

		setTimeout(function () {
			cyExpandCollapse.expand(parent); // Re-expand the parent node after a delay
		}, 2000); // Wait 2 seconds before expanding
	}, 2000);
}


function viewportDrawerLayoutHorizontal() {
	// Retrieve the sliders for node and group horizontal gaps
	const nodehGap = document.getElementById("horizontal-layout-slider-node-h-gap");
	const grouphGap = document.getElementById("horizontal-layout-slider-group-h-gap");

	// Parse the slider values for horizontal and vertical gaps
	const nodehGapValue = parseFloat(nodehGap.value) * 10; // Gap between child nodes within a parent
	const grouphGapValue = parseFloat(grouphGap.value); // Gap between parent nodes

	const delay = 100; // Delay to ensure layout updates after rendering

	setTimeout(() => {
		// Step 1: Position child nodes within their respective parents
		cy.nodes().forEach(function (node) {
			if (node.isParent()) {
				const children = node.children(); // Get the children of the current parent node
				const cellHeight = node.height() / children.length; // Calculate the height for each child node

				// Position child nodes evenly spaced within the parent node
				children.forEach(function (child, index) {
					const xPos = 0; // Keep child nodes on the same horizontal level
					const yPos = index * (cellHeight + nodehGapValue); // Vertical position for the child

					child.position({
						x: xPos,
						y: yPos
					});
				});
			}
		});

		// Step 2: Sort parent nodes by their group level and ID for horizontal stacking
		const sortedParents = cy.nodes()
			.filter(node => node.isParent()) // Only process parent nodes
			.sort((a, b) => {
				// Extract group levels for primary sorting
				const groupLevelA = parseInt(a.data('extraData')?.topoViewerGroupLevel || 0, 10);
				const groupLevelB = parseInt(b.data('extraData')?.topoViewerGroupLevel || 0, 10);

				if (groupLevelA !== groupLevelB) {
					return groupLevelA - groupLevelB; // Sort by group level in ascending order
				}
				// Secondary sorting by node ID (alphabetical order)
				return a.data('id').localeCompare(b.data('id'));
			});

		let xPos = 0; // Starting horizontal position for parent nodes
		let maxHeight = 0; // Initialize variable to store the maximum parent height
		const centerY = 0; // Define the vertical center reference

		// Step 3: Find the tallest parent node
		cy.nodes().forEach(function (node) {
			if (node.isParent()) {
				const height = node.height();
				if (height > maxHeight) {
					maxHeight = height; // Update maxHeight with the tallest parent node's height
					console.info("ParentMaxHeight: ", maxHeight);
				}
			}
		});

		// Calculate division factor for aligning parent nodes
		const divisionFactor = maxHeight / 2;
		console.info("Division Factor: ", divisionFactor);

		// Step 4: Position parent nodes horizontally and align them relative to the tallest parent node
		sortedParents.forEach(function (parentNode) {
			const parentHeight = parentNode.height();

			// Calculate vertical position relative to the tallest parent
			const yPos = centerY - parentHeight / divisionFactor;

			// Position the parent node
			parentNode.position({
				x: xPos,
				y: yPos
			});

			console.info(`Parent Node '${parentNode.id()}' positioned at x: ${xPos}, y: ${yPos}`);

			// Increment horizontal position for the next parent
			xPos += grouphGapValue;
		});

		// Step 5: Adjust the viewport to fit the updated layout
		cy.fit();

	}, delay);

	// Step 6: Expand/collapse functionality for parent nodes (optional)
	const cyExpandCollapse = cy.expandCollapse({
		layoutBy: null, // Use the existing layout
		undoable: false, // Disable undo functionality
		fisheye: false, // Disable fisheye view for expanded/collapsed nodes
		animationDuration: 10, // Duration of animations in milliseconds
		animate: true // Enable animation for expand/collapse
	});

	// Example: Demonstrate expand/collapse behavior with a specific parent node
	setTimeout(function () {
		const parent = cy.$('#parent'); // Replace '#parent' with the actual parent node ID if needed
		cyExpandCollapse.collapse(parent); // Collapse the parent node

		setTimeout(function () {
			cyExpandCollapse.expand(parent); // Re-expand the parent node after a delay
		}, 2000); // Wait 2 seconds before expanding
	}, 2000);
}

function viewportDrawerCaptureFunc() {
	console.info("viewportDrawerCaptureButton() - clicked")

	// Get all checkbox inputs within the specific div
	const checkboxes = document.querySelectorAll('#viewport-drawer-capture-sceenshoot-content .checkbox-input');

	// Initialize an array to store the values of checked checkboxes
	const selectedOptions = [];

	// Iterate through the NodeList of checkboxes
	checkboxes.forEach((checkbox) => {
		// If the checkbox is checked, push its value to the array
		if (checkbox.checked) {
			selectedOptions.push(checkbox.value);
		}
	});

	console.info("viewportDrawerCaptureButton() - ", selectedOptions)

	if (selectedOptions.length === 0) {
		bulmaToast.toast({
			message: `Hey there, please pick at least one option.😊👌`,
			type: "is-warning is-size-6 p-3",
			duration: 4000,
			position: "top-center",
			closeOnClick: true,
		});
	} else {
		// Perform your action based on the selected options
		if (selectedOptions.join(", ") == "option01") {
			captureAndSaveViewportAsPng(cy);
			modal.classList.remove("is-active");
		} else if (selectedOptions.join(", ") == "option02") {
			captureAndSaveViewportAsDrawIo(cy);
			modal.classList.remove("is-active");
		} else if (selectedOptions.join(", ") == "option01, option02") {
			captureAndSaveViewportAsPng(cy);
			sleep(5000);
			captureAndSaveViewportAsDrawIo(cy);
			modal.classList.remove("is-active");
		}
	}

}

async function captureAndSaveViewportAsDrawIo(cy) {
	// Define base64-encoded SVGs for each role
	const svgBase64ByRole = {
		dcgw: 'data:image/svg+xml,PHN2ZyB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWw6c3BhY2U9InByZXNlcnZlIiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAxMjAgMTIwOyIgdmlld0JveD0iMCAwIDEyMCAxMjAiIHk9IjBweCIgeD0iMHB4IiBpZD0iTGF5ZXJfMSIgdmVyc2lvbj0iMS4xIj4mI3hhOzxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+LnN0MCB7IGZpbGw6IHJnYigxLCA5MCwgMjU1KTsgfSAuc3QxIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0MiB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgfSAuc3QzIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDQgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IH0gLnN0NSB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NiB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQuMjMzMzsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NyB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDggeyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3Q5IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyB9IC5zdDEwIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgfSAuc3QxMSB7IGZpbGw6IHJnYigzOCwgMzgsIDM4KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNC4yMzMzOyB9IC5zdDEyIHsgZmlsbC1ydWxlOiBldmVub2RkOyBjbGlwLXJ1bGU6IGV2ZW5vZGQ7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QxMyB7IGZpbGwtcnVsZTogZXZlbm9kZDsgY2xpcC1ydWxlOiBldmVub2RkOyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IH0gLnN0MTQgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0LjIzMzM7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLWxpbmVqb2luOiByb3VuZDsgfSAuc3QxNSB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgfSAuc3QxNiB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QxNyB7IGZpbGw6IHJnYigzOCwgMzgsIDM4KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDE4IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IH0gPC9zdHlsZT4mI3hhOzxyZWN0IGhlaWdodD0iMTIwIiB3aWR0aD0iMTIwIiBjbGFzcz0ic3QwIi8+JiN4YTs8Zz4mI3hhOwk8Zz4mI3hhOwkJPHBhdGggZD0iTTk4LDMwLjFINjhMNTIsODkuOUgyMiIgY2xhc3M9InN0MSIvPiYjeGE7CQk8cGF0aCBkPSJNMjgsMTAwbC03LTguMWMtMS4zLTEuMy0xLjMtMy4xLDAtNC4zbDctNy42IiBjbGFzcz0ic3QxIi8+JiN4YTsJCTxwYXRoIGQ9Ik05MiwyMGw3LDguMWMxLjMsMS4zLDEuMywzLjEsMCw0LjNMOTIsNDAiIGNsYXNzPSJzdDEiLz4mI3hhOwk8L2c+JiN4YTsJPHBhdGggZD0iTTk4LDg5LjlINjQiIGNsYXNzPSJzdDEiLz4mI3hhOwk8cGF0aCBkPSJNOTIsODBsNyw3LjZjMS4zLDEuMywxLjMsMy4xLDAsNC4zbC03LDguMSIgY2xhc3M9InN0MSIvPiYjeGE7CTxwYXRoIGQ9Ik01NiwzMC4xSDIyIE0yOCw0MGwtNy03LjZjLTEuMy0xLjMtMS4zLTMuMSwwLTQuM2w3LTguMSIgY2xhc3M9InN0MSIvPiYjeGE7CTxsaW5lIHkyPSI0OCIgeDI9Ijc2IiB5MT0iNDgiIHgxPSIxMDAiIGNsYXNzPSJzdDEiLz4mI3hhOwk8bGluZSB5Mj0iNjAiIHgyPSI3MiIgeTE9IjYwIiB4MT0iMTAwIiBjbGFzcz0ic3QxIi8+JiN4YTsJPGxpbmUgeTI9IjcyIiB4Mj0iNjgiIHkxPSI3MiIgeDE9IjEwMCIgY2xhc3M9InN0MSIvPiYjeGE7CTxsaW5lIHkyPSI3MiIgeDI9IjQ0IiB5MT0iNzIiIHgxPSIyMCIgY2xhc3M9InN0MSIvPiYjeGE7CTxsaW5lIHkyPSI2MCIgeDI9IjQ4IiB5MT0iNjAiIHgxPSIyMCIgY2xhc3M9InN0MSIvPiYjeGE7CTxsaW5lIHkyPSI0OCIgeDI9IjUyIiB5MT0iNDgiIHgxPSIyMCIgY2xhc3M9InN0MSIvPiYjeGE7PC9nPiYjeGE7PC9zdmc+',
		router: 'data:image/svg+xml,PHN2ZyB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWw6c3BhY2U9InByZXNlcnZlIiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAxMjAgMTIwOyIgdmlld0JveD0iMCAwIDEyMCAxMjAiIHk9IjBweCIgeD0iMHB4IiBpZD0iTGF5ZXJfMSIgdmVyc2lvbj0iMS4xIj4mI3hhOzxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+LnN0MCB7IGZpbGw6IHJnYigxLCA5MCwgMjU1KTsgfSAuc3QxIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0MiB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgfSAuc3QzIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDQgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IH0gLnN0NSB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NiB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQuMjMzMzsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NyB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDggeyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3Q5IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyB9IC5zdDEwIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgfSAuc3QxMSB7IGZpbGw6IHJnYigzOCwgMzgsIDM4KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNC4yMzMzOyB9IC5zdDEyIHsgZmlsbC1ydWxlOiBldmVub2RkOyBjbGlwLXJ1bGU6IGV2ZW5vZGQ7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QxMyB7IGZpbGwtcnVsZTogZXZlbm9kZDsgY2xpcC1ydWxlOiBldmVub2RkOyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IH0gLnN0MTQgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0LjIzMzM7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLWxpbmVqb2luOiByb3VuZDsgfSAuc3QxNSB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgfSAuc3QxNiB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QxNyB7IGZpbGw6IHJnYigzOCwgMzgsIDM4KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDE4IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IH0gPC9zdHlsZT4mI3hhOzxyZWN0IGhlaWdodD0iMTIwIiB3aWR0aD0iMTIwIiBjbGFzcz0ic3QwIiB4PSIwIi8+JiN4YTs8Zz4mI3hhOwk8Zz4mI3hhOwkJPHBhdGggZD0iTTQ5LjcsNzBMMjAuMSw5OS44IiBjbGFzcz0ic3QxIi8+JiN4YTsJPC9nPiYjeGE7CTxnPiYjeGE7CQk8cGF0aCBkPSJNOTcuNyw5Ny40TDY4LDY3LjkiIGNsYXNzPSJzdDEiLz4mI3hhOwk8L2c+JiN4YTsJPGc+JiN4YTsJCTxwYXRoIGQ9Ik03MC40LDQ5LjdMOTkuOSwyMCIgY2xhc3M9InN0MSIvPiYjeGE7CTwvZz4mI3hhOwk8cGF0aCBkPSJNMjIuMywyMi4zTDUyLDUxLjkiIGNsYXNzPSJzdDEiLz4mI3hhOwk8cGF0aCBkPSJNMjAuMSwzMy45bDAtMTAuN2MwLTEuOCwxLjMtMywzLjEtMy4xbDEwLjgsMCIgY2xhc3M9InN0MSIvPiYjeGE7CTxwYXRoIGQ9Ik0zOC40LDY4bDEwLjcsMGMxLjgsMCwzLDEuMywzLjEsMy4xbDAsMTAuOCIgY2xhc3M9InN0MSIvPiYjeGE7CTxwYXRoIGQ9Ik05OS44LDg2LjJsMCwxMC43YzAsMS44LTEuMywzLTMuMSwzLjFsLTEwLjgsMCIgY2xhc3M9InN0MSIvPiYjeGE7CTxwYXRoIGQ9Ik04MS44LDUxLjlsLTEwLjcsMGMtMS44LDAtMy0xLjMtMy4xLTMuMUw2OCwzOCIgY2xhc3M9InN0MSIvPiYjeGE7PC9nPiYjeGE7PC9zdmc+',
		pe: 'data:image/svg+xml,PHN2ZyB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWw6c3BhY2U9InByZXNlcnZlIiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAxMjAgMTIwO2VkaXRhYmxlQ3NzUnVsZXM9Lio7IiB2aWV3Qm94PSIwIDAgMTIwIDEyMCIgeT0iMHB4IiB4PSIwcHgiIGlkPSJMYXllcl8xIiB2ZXJzaW9uPSIxLjEiPiYjeGE7PHN0eWxlIHR5cGU9InRleHQvY3NzIj4uc3QwIHsgZmlsbDogcmdiKDEsIDkwLCAyNTUpOyB9IC5zdDEgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QyIHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyB9IC5zdDMgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NCB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLWxpbmVqb2luOiByb3VuZDsgfSAuc3Q1IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3Q2IHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNC4yMzMzOyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3Q3IHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0OCB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDkgeyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IH0gLnN0MTAgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyB9IC5zdDExIHsgZmlsbDogcmdiKDM4LCAzOCwgMzgpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0LjIzMzM7IH0gLnN0MTIgeyBmaWxsLXJ1bGU6IGV2ZW5vZGQ7IGNsaXAtcnVsZTogZXZlbm9kZDsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDEzIHsgZmlsbC1ydWxlOiBldmVub2RkOyBjbGlwLXJ1bGU6IGV2ZW5vZGQ7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgfSAuc3QxNCB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQuMjMzMzsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyB9IC5zdDE1IHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyB9IC5zdDE2IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDE3IHsgZmlsbDogcmdiKDM4LCAzOCwgMzgpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0MTggeyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLWxpbmVqb2luOiByb3VuZDsgfSA8L3N0eWxlPiYjeGE7PHJlY3QgaGVpZ2h0PSIxMjAiIHdpZHRoPSIxMjAiIGNsYXNzPSJzdDAiLz4mI3hhOzxnPiYjeGE7CTxnPiYjeGE7CQk8cGF0aCBkPSJNNzEuNywxOS43VjQ4aDI4IiBjbGFzcz0ic3QxIi8+JiN4YTsJCTxwYXRoIGQ9Ik05MS4yLDM4LjVsNy41LDcuNmMxLjMsMS4zLDEuMywzLjEsMCw0LjNMOTEuMSw1OCIgY2xhc3M9InN0MSIvPiYjeGE7CTwvZz4mI3hhOwk8Zz4mI3hhOwkJPHBhdGggZD0iTTIwLDQ3LjhoMjguNHYtMjgiIGNsYXNzPSJzdDEiLz4mI3hhOwkJPHBhdGggZD0iTTM4LjgsMjguM2w3LjYtNy41YzEuMy0xLjMsMy4xLTEuMyw0LjMsMGw3LjcsNy42IiBjbGFzcz0ic3QxIi8+JiN4YTsJPC9nPiYjeGE7CTxnPiYjeGE7CQk8cGF0aCBkPSJNNDgsMTAwLjNWNzJIMjAiIGNsYXNzPSJzdDEiLz4mI3hhOwkJPHBhdGggZD0iTTI4LjUsODEuNUwyMSw3My45Yy0xLjMtMS4zLTEuMy0zLjEsMC00LjNsNy42LTcuNyIgY2xhc3M9InN0MSIvPiYjeGE7CTwvZz4mI3hhOwk8Zz4mI3hhOwkJPHBhdGggZD0iTTEwMCw3MS45SDcxLjZ2MjgiIGNsYXNzPSJzdDEiLz4mI3hhOwkJPHBhdGggZD0iTTgxLjIsOTEuNGwtNy42LDcuNWMtMS4zLDEuMy0zLjEsMS4zLTQuMywwbC03LjctNy42IiBjbGFzcz0ic3QxIi8+JiN4YTsJPC9nPiYjeGE7PC9nPiYjeGE7PC9zdmc+',
		controller: 'data:image/svg+xml,PHN2ZyB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBvdmVyZmxvdz0iaGlkZGVuIiB4bWw6c3BhY2U9InByZXNlcnZlIiBoZWlnaHQ9IjU4IiB3aWR0aD0iNTkiIHZpZXdCb3g9IjAgMCA1OSA1OCI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTQxNyAtMTg0KSI+PGc+PGc+PGc+PGc+PHBhdGggZmlsbC1vcGFjaXR5PSIxIiBmaWxsLXJ1bGU9Im5vbnplcm8iIGZpbGw9IiMwMDVBRkYiIGQ9Ik00MTggMTg1IDQ3NSAxODUgNDc1IDI0MiA0MTggMjQyWiIvPjxwYXRoIGZpbGwtb3BhY2l0eT0iMSIgZmlsbC1ydWxlPSJub256ZXJvIiBmaWxsPSIjMDA1QUZGIiBzdHJva2Utb3BhY2l0eT0iMSIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS13aWR0aD0iMS45IiBzdHJva2U9IiNGRkZGRkYiIGQ9Ik00NTYgMjAwLjEwNUM0NTEuMDYgMTk2LjU5IDQ0NC4zNjIgMTk1Ljk3MyA0MzguNzEgMTk5LjA2IDQzMy41MzMgMjAxLjg2MyA0MzAuNDQ1IDIwNy4wNCA0MzAuMTYgMjEyLjU1Ii8+PHBhdGggZmlsbC1vcGFjaXR5PSIxIiBmaWxsLXJ1bGU9Im5vbnplcm8iIGZpbGw9IiMwMDVBRkYiIHN0cm9rZS1vcGFjaXR5PSIxIiBzdHJva2UtbWl0ZXJsaW1pdD0iMTAiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLXdpZHRoPSIxLjkiIHN0cm9rZT0iI0ZGRkZGRiIgZD0iTTQzNyAyMjYuODQ4QzQ0MS45NCAyMzAuMzE1IDQ0OC41OSAyMzAuOTggNDU0LjI5IDIyNy44OTMgNDU5LjQ2NyAyMjUuMDkgNDYyLjU1NSAyMTkuODY1IDQ2Mi44NCAyMTQuNDAyIi8+PHBhdGggZmlsbC1vcGFjaXR5PSIxIiBmaWxsLXJ1bGU9Im5vbnplcm8iIGZpbGw9IiMwMDVBRkYiIHN0cm9rZS1vcGFjaXR5PSIxIiBzdHJva2UtbWl0ZXJsaW1pdD0iMTAiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLXdpZHRoPSIxLjkiIHN0cm9rZT0iI0ZGRkZGRiIgZD0iTTQ1MC45NjUgMjAyLjU3NSA0NTUuMzM1IDIwMC44MThDNDU2LjA5NSAyMDAuNTMzIDQ1Ni40MjcgMTk5LjgyIDQ1Ni4xOSAxOTkuMDEyTDQ1NC44NiAxOTQuMzEiLz48cGF0aCBmaWxsLW9wYWNpdHk9IjEiIGZpbGwtcnVsZT0ibm9uemVybyIgZmlsbD0iIzAwNUFGRiIgc3Ryb2tlLW9wYWNpdHk9IjEiIHN0cm9rZS1taXRlcmxpbWl0PSIxMCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuOSIgc3Ryb2tlPSIjRkZGRkZGIiBkPSJNNDQxLjk4NyAyMjQuNDI1IDQzNy42MTcgMjI2LjE4MkM0MzYuODU4IDIyNi40NjcgNDM2LjUyNSAyMjcuMTggNDM2Ljc2MyAyMjcuOTg4TDQzOC4wOTIgMjMyLjY5Ii8+PHBhdGggZmlsbC1vcGFjaXR5PSIxIiBmaWxsLXJ1bGU9Im5vbnplcm8iIGZpbGw9IiMwMDVBRkYiIHN0cm9rZS1vcGFjaXR5PSIxIiBzdHJva2UtbWl0ZXJsaW1pdD0iMTAiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLXdpZHRoPSIxLjkiIHN0cm9rZT0iI0ZGRkZGRiIgZD0iTTQzNC4zODggMjIwLjQzNUM0MzQuMzg4IDIyMS45MyA0MzMuMTc1IDIyMy4xNDMgNDMxLjY4IDIyMy4xNDMgNDMwLjE4NSAyMjMuMTQzIDQyOC45NzMgMjIxLjkzIDQyOC45NzMgMjIwLjQzNSA0MjguOTczIDIxOC45NCA0MzAuMTg1IDIxNy43MjcgNDMxLjY4IDIxNy43MjcgNDMzLjE3NSAyMTcuNzI3IDQzNC4zODggMjE4Ljk0IDQzNC4zODggMjIwLjQzNVoiLz48cGF0aCBmaWxsLW9wYWNpdHk9IjEiIGZpbGwtcnVsZT0ibm9uemVybyIgZmlsbD0iIzAwNUFGRiIgc3Ryb2tlLW9wYWNpdHk9IjEiIHN0cm9rZS1taXRlcmxpbWl0PSIxMCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuOSIgc3Ryb2tlPSIjRkZGRkZGIiBkPSJNNDY0LjAyNyAyMDYuNDIzQzQ2NC4wMjcgMjA3LjkxOCA0NjIuODE1IDIwOS4xMyA0NjEuMzIgMjA5LjEzIDQ1OS44MjUgMjA5LjEzIDQ1OC42MTMgMjA3LjkxOCA0NTguNjEzIDIwNi40MjMgNDU4LjYxMyAyMDQuOTI3IDQ1OS44MjUgMjAzLjcxNSA0NjEuMzIgMjAzLjcxNSA0NjIuODE1IDIwMy43MTUgNDY0LjAyNyAyMDQuOTI3IDQ2NC4wMjcgMjA2LjQyM1oiLz48L2c+PC9nPjwvZz48L2c+PC9nPjwvc3ZnPg==',
		pon: 'data:image/svg+xml,PHN2ZyB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBvdmVyZmxvdz0iaGlkZGVuIiB4bWw6c3BhY2U9InByZXNlcnZlIiBoZWlnaHQ9IjQ4MCIgd2lkdGg9IjQ4MiIgdmlld0JveD0iMCAwIDQ4MiA0ODAiPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yMTQgLTQpIj48Zz48Zz48Zz48Zz48cGF0aCBmaWxsLW9wYWNpdHk9IjEiIGZpbGwtcnVsZT0ibm9uemVybyIgZmlsbD0iIzAwNUFGRiIgZD0iTTIxNSA0IDY5NSA0IDY5NSA0ODQgMjE1IDQ4NFoiLz48cGF0aCBmaWxsLW9wYWNpdHk9IjEiIGZpbGwtcnVsZT0ibm9uemVybyIgZmlsbD0iIzAwNUFGRiIgc3Ryb2tlLW9wYWNpdHk9IjEiIHN0cm9rZS1taXRlcmxpbWl0PSIxMCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2Utd2lkdGg9IjE2IiBzdHJva2U9IiNGRkZGRkYiIGQ9Ik0yOTguNiA4NCA2MDMgMjQ0IDI5OC42IDQwNCIvPjxwYXRoIGZpbGwtcnVsZT0ibm9uemVybyIgZmlsbD0ibm9uZSIgc3Ryb2tlLW9wYWNpdHk9IjEiIHN0cm9rZS1taXRlcmxpbWl0PSIxMCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2Utd2lkdGg9IjE2IiBzdHJva2U9IiNGRkZGRkYiIGQ9Ik0yOTguNiAyNDQgNTEwLjIgMjQ0Ii8+PHBhdGggZmlsbC1vcGFjaXR5PSIxIiBmaWxsLXJ1bGU9Im5vbnplcm8iIGZpbGw9IiMwMDVBRkYiIHN0cm9rZS1vcGFjaXR5PSIxIiBzdHJva2UtbWl0ZXJsaW1pdD0iMTAiIHN0cm9rZS1saW5lam9pbj0ibWl0ZXIiIHN0cm9rZS1saW5lY2FwPSJidXR0IiBzdHJva2Utd2lkdGg9IjE2IiBzdHJva2U9IiNGRkZGRkYiIGQ9Ik02MDcuNCAyNDRDNjA3LjQgMjUwLjYyNyA2MDIuMDI3IDI1NiA1OTUuNCAyNTYgNTg4Ljc3MyAyNTYgNTgzLjQgMjUwLjYyNyA1ODMuNCAyNDQgNTgzLjQgMjM3LjM3MyA1ODguNzczIDIzMiA1OTUuNCAyMzIgNjAyLjAyNyAyMzIgNjA3LjQgMjM3LjM3MyA2MDcuNCAyNDRaIi8+PC9nPjwvZz48L2c+PC9nPjwvZz48L3N2Zz4=',
		leaf: 'data:image/svg+xml,PHN2ZyB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWw6c3BhY2U9InByZXNlcnZlIiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAxMjAgMTIwOyIgdmlld0JveD0iMCAwIDEyMCAxMjAiIHk9IjBweCIgeD0iMHB4IiBpZD0iTGF5ZXJfMSIgdmVyc2lvbj0iMS4xIj4mI3hhOzxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+LnN0MCB7IGZpbGw6IHJnYigwLCA5MCwgMjU1KTsgfSAuc3QxIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0MiB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgfSAuc3QzIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDQgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IH0gLnN0NSB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NiB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQuMjMzMzsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NyB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDggeyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3Q5IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyB9IC5zdDEwIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgfSAuc3QxMSB7IGZpbGw6IHJnYigzOCwgMzgsIDM4KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNC4yMzMzOyB9IC5zdDEyIHsgZmlsbC1ydWxlOiBldmVub2RkOyBjbGlwLXJ1bGU6IGV2ZW5vZGQ7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QxMyB7IGZpbGwtcnVsZTogZXZlbm9kZDsgY2xpcC1ydWxlOiBldmVub2RkOyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IH0gLnN0MTQgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0LjIzMzM7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLWxpbmVqb2luOiByb3VuZDsgfSAuc3QxNSB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgfSAuc3QxNiB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QxNyB7IGZpbGw6IHJnYigzOCwgMzgsIDM4KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDE4IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IH0gPC9zdHlsZT4mI3hhOzxyZWN0IGhlaWdodD0iMTIwIiB3aWR0aD0iMTIwIiBjbGFzcz0ic3QwIi8+JiN4YTs8Zz4mI3hhOwk8cGF0aCBkPSJNOTEuNSwyNy4zbDcuNiw3LjZjMS4zLDEuMywxLjMsMy4xLDAsNC4zbC03LjYsNy43IiBjbGFzcz0ic3QxIi8+JiN4YTsJPHBhdGggZD0iTTI4LjUsNDYuOWwtNy42LTcuNmMtMS4zLTEuMy0xLjMtMy4xLDAtNC4zbDcuNi03LjciIGNsYXNzPSJzdDEiLz4mI3hhOwk8cGF0aCBkPSJNOTEuNSw3My4xbDcuNiw3LjZjMS4zLDEuMywxLjMsMy4xLDAsNC4zbC03LjYsNy43IiBjbGFzcz0ic3QxIi8+JiN4YTsJPHBhdGggZD0iTTI4LjUsOTIuN2wtNy42LTcuNmMtMS4zLTEuMy0xLjMtMy4xLDAtNC4zbDcuNi03LjciIGNsYXNzPSJzdDEiLz4mI3hhOwk8Zz4mI3hhOwkJPHBhdGggZD0iTTk2LjYsMzYuOEg2Ny45bC0xNiw0NS45SDIzLjIiIGNsYXNzPSJzdDEiLz4mI3hhOwkJPHBhdGggZD0iTTk2LjYsODIuN0g2Ny45bC0xNi00NS45SDIzLjIiIGNsYXNzPSJzdDEiLz4mI3hhOwk8L2c+JiN4YTs8L2c+JiN4YTs8L3N2Zz4=',
		spine: 'data:image/svg+xml,PHN2ZyB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWw6c3BhY2U9InByZXNlcnZlIiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAxMjAgMTIwOyIgdmlld0JveD0iMCAwIDEyMCAxMjAiIHk9IjBweCIgeD0iMHB4IiBpZD0iTGF5ZXJfMSIgdmVyc2lvbj0iMS4xIj4mI3hhOzxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+LnN0MCB7IGZpbGw6IHJnYigwLCA5MCwgMjU1KTsgfSAuc3QxIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0MiB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgfSAuc3QzIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDQgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IH0gLnN0NSB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NiB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQuMjMzMzsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NyB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDggeyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3Q5IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyB9IC5zdDEwIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgfSAuc3QxMSB7IGZpbGw6IHJnYigzOCwgMzgsIDM4KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNC4yMzMzOyB9IC5zdDEyIHsgZmlsbC1ydWxlOiBldmVub2RkOyBjbGlwLXJ1bGU6IGV2ZW5vZGQ7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QxMyB7IGZpbGwtcnVsZTogZXZlbm9kZDsgY2xpcC1ydWxlOiBldmVub2RkOyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IH0gLnN0MTQgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0LjIzMzM7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLWxpbmVqb2luOiByb3VuZDsgfSAuc3QxNSB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgfSAuc3QxNiB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QxNyB7IGZpbGw6IHJnYigzOCwgMzgsIDM4KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDE4IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IH0gLnN0MTkgeyBmaWxsOiByZ2IoMCwgMTcsIDUzKTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gPC9zdHlsZT4mI3hhOzxyZWN0IGhlaWdodD0iMTIwIiB3aWR0aD0iMTIwIiBjbGFzcz0ic3QwIiB5PSIwIi8+JiN4YTs8cmVjdCBoZWlnaHQ9IjEyMCIgd2lkdGg9IjEyMCIgY2xhc3M9InN0MCIvPiYjeGE7PGc+JiN4YTsJPGc+JiN4YTsJCTxwYXRoIGQ9Ik05OCwzMC4xSDY4TDUyLDg5LjlIMjIiIGNsYXNzPSJzdDEiLz4mI3hhOwkJPHBhdGggZD0iTTI4LDEwMGwtNy04LjFjLTEuMy0xLjMtMS4zLTMuMSwwLTQuM2w3LTcuNiIgY2xhc3M9InN0MSIvPiYjeGE7CQk8cGF0aCBkPSJNOTIsMjBsNyw4LjFjMS4zLDEuMywxLjMsMy4xLDAsNC4zTDkyLDQwIiBjbGFzcz0ic3QxIi8+JiN4YTsJPC9nPiYjeGE7CTxwYXRoIGQ9Ik05OCw4OS45SDY0IiBjbGFzcz0ic3QxIi8+JiN4YTsJPHBhdGggZD0iTTkyLDgwbDcsNy42YzEuMywxLjMsMS4zLDMuMSwwLDQuM2wtNyw4LjEiIGNsYXNzPSJzdDEiLz4mI3hhOwk8cGF0aCBkPSJNNTYsMzAuMUgyMiBNMjgsNDBsLTctNy42Yy0xLjMtMS4zLTEuMy0zLjEsMC00LjNsNy04LjEiIGNsYXNzPSJzdDEiLz4mI3hhOwk8bGluZSB5Mj0iNjAiIHgyPSI3MiIgeTE9IjYwIiB4MT0iMTAwIiBjbGFzcz0ic3QxIi8+JiN4YTsJPGxpbmUgeTI9IjYwIiB4Mj0iNDgiIHkxPSI2MCIgeDE9IjIwIiBjbGFzcz0ic3QxIi8+JiN4YTs8L2c+JiN4YTs8L3N2Zz4=',
		'super-spine': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cGF0aCBkPSJNMTAsMTAgTDkwLDkwIiBzdHlsZT0iZmlsbDojZmYwMGYwOyIgLz48L3N2Zz4=',
	};

	const canvasElement = document.querySelector('#cy canvas[data-id="layer2-node"]');
	const drawIoWidth = canvasElement.width / 10;
	const drawIoHeight = canvasElement.height / 10;

	const mxGraphHeader = `<mxGraphModel dx="${drawIoWidth / 2}" dy="${drawIoHeight / 2}" grid="1" gridSize="1" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${drawIoWidth}" pageHeight="${drawIoHeight}" math="0" shadow="0">
        <root>
            <mxCell id="0" />
            <mxCell id="1" parent="0" />`;

	const mxGraphFooter = `</root>
    </mxGraphModel>`;

	const mxCells = [];

	function createMxCellForNode(node, imageURL) {
		if (node.isParent()) {
			console.info("createMxCellForNode - node.isParent()", node.isParent());
			// Use a tiny transparent SVG as a placeholder for the image
			return `
                <mxCell id="${node.id()}" value="${node.data("id")}" style="shape=image;imageAspect=0;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;image=${imageURL};imageBackground=#8F96AC;imageBorder=#F2F2F2;strokeWidth=0.5;perimeterSpacing=10;opacity=30;fontSize=4;spacingTop=-7;" parent="1" vertex="1">
                    <mxGeometry x="${node.position("x") - node.width() / 2}" y="${node.position("y") - node.height() / 2}" width="${node.width()}" height="${node.height()}" as="geometry" />
                </mxCell>`;
		} else if (!node.data("id").includes("statusGreen") && !node.data("id").includes("statusRed")) {
			return `
                <mxCell id="${node.id()}" value="${node.data("id")}" style="shape=image;imageAspect=0;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;image=${imageURL};fontSize=4;spacingTop=-7;" vertex="1" parent="1">
                    <mxGeometry x="${node.position("x") - node.width() / 2}" y="${node.position("y") - node.height() / 2}" width="${node.width()}" height="${node.height()}" as="geometry" />
                </mxCell>`;
		}
	}

	cy.nodes().forEach(function (node) {
		const svgBase64 = svgBase64ByRole[node.data("topoViewerRole")] || (node.isParent() ? 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=' : null);

		if (svgBase64) {
			// Add parent nodes at the start of the array for bottom-layer rendering
			if (node.isParent()) {
				mxCells.unshift(createMxCellForNode(node, svgBase64));
			} else {
				// Add non-parent nodes at the end of the array
				mxCells.push(createMxCellForNode(node, svgBase64));
			}
		}
	});


	cy.edges().forEach(function (edge) {
		mxCells.push(`
            <mxCell id="${edge.data("id")}" value="" style="endArrow=none;html=1;rounded=0;exitX=1;exitY=0.5;exitDx=0;exitDy=0;strokeWidth=1;strokeColor=#969799;opacity=60;" parent="1" source="${edge.data("source")}" target="${edge.data("target")}" edge="1">
                <mxGeometry width="50" height="50" relative="1" as="geometry" />
            </mxCell>
            <mxCell id="${edge.data("id")}-LabelSource" value="${edge.data("sourceEndpoint")}" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=3;" parent="${edge.data("id")}" vertex="1" connectable="0">
                <mxGeometry x="-0.5" y="1" relative="0.5" as="geometry">
                    <mxPoint x="1" y="1" as="sourcePoint" />
                </mxGeometry>
            </mxCell>
            <mxCell id="${edge.data("id")}-labelTarget" value="${edge.data("targetEndpoint")}" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=3" parent="${edge.data("id")}" vertex="1" connectable="0">
                <mxGeometry x="0.5" y="1" relative="0.5" as="geometry">
                    <mxPoint x="1" y="1" as="targetPoint" />
                </mxGeometry>
            </mxCell>`);
	});

	// Combine all parts and create XML
	const mxGraphXML = mxGraphHeader + mxCells.join("") + mxGraphFooter;

	// Create a Blob from the XML
	const blob = new Blob([mxGraphXML], {
		type: "application/xml"
	});

	// Create a URL for the Blob
	const url = window.URL.createObjectURL(blob);

	// Create a download link and trigger a click event
	const a = document.createElement("a");
	a.style.display = "none";
	a.href = url;
	a.download = "filename.drawio";
	document.body.appendChild(a);

	bulmaToast.toast({
		message: `Brace yourselves for a quick snapshot, folks! 📸 Capturing the viewport in 3... 2... 1... 🚀💥`,
		type: "is-warning is-size-6 p-3",
		duration: 2000,
		position: "top-center",
		closeOnClick: true,
	});
	await sleep(2000);

	// Simulate a click to trigger the download
	a.click();

	// Clean up by revoking the URL and removing the download link
	window.URL.revokeObjectURL(url);
	document.body.removeChild(a);
}

function viewportButtonsClabEditor() {
	var viewportDrawer = document.getElementsByClassName("viewport-drawer");
	// Loop through each element and set its display to 'none'
	for (var i = 0; i < viewportDrawer.length; i++) {
		viewportDrawer[i].style.display = "none";
	}

	console.info("viewportButtonsClabEditor clicked")

	viewportDrawerClabEditor = document.getElementById("viewport-drawer-clab-editor")
	viewportDrawerClabEditor.style.display = "block"

	console.log("viewportDrawerClabEditor", viewportDrawerClabEditor)

	viewportDrawerClabEditorContent01 = document.getElementById("viewport-drawer-clab-editor-content-01")
	viewportDrawerClabEditorContent01.style.display = "block"

	console.log("viewportDrawerClabEditorContent01", viewportDrawerClabEditorContent01)

	viewportDrawerClabEditorContent02 = document.getElementById("viewport-drawer-clab-editor-content-02")
	viewportDrawerClabEditorContent02.style.display = "block"

	console.log("viewportDrawerClabEditorContent02", viewportDrawerClabEditorContent02)


}

function viewportButtonsGeoMapPan() {
	console.log("viewportButtonsGeoMapEdit clicked..")
	console.log("cytoscapeLeafletMap", cytoscapeLeafletMap)

	cytoscapeLeafletLeaf.cy.container().style.pointerEvents = 'none';
	cytoscapeLeafletLeaf.setZoomControlOpacity("");
	cytoscapeLeafletLeaf.map.dragging.enable();
}

function viewportButtonsGeoMapEdit() {
	console.log("viewportButtonsGeoMapEdit clicked..")
	console.log("cytoscapeLeafletMap", cytoscapeLeafletMap)

	cytoscapeLeafletLeaf.cy.container().style.pointerEvents = '';
	cytoscapeLeafletLeaf.setZoomControlOpacity(0.5);
	cytoscapeLeafletLeaf.map.dragging.disable();
}



// Define a function to get the checkbox state and attach the event listener
function setupCheckboxListener(checkboxSelector) {
	// Select the checkbox input element
	const checkbox = document.querySelector(checkboxSelector);

	if (!checkbox) {
		console.error(`Checkbox not found for selector: ${checkboxSelector}`);
		return null; // Return null if the checkbox is not found
	}

	const isChecked = checkbox.checked; // Returns true if checked, false otherwise
	console.info(`${checkboxSelector}:`);
	console.info(isChecked);

	return isChecked;
}

// Define a function to show the Clab Editor panel and maintain mutual exclusivity with the GeoMap panel
function initViewportDrawerClabEditoCheckboxToggle() {
	const checkboxClabEditor = document.querySelector('#viewport-drawer-clab-editor-content-01 .checkbox-input');
	const checkboxGeoMap = document.querySelector('#viewport-drawer-geo-map-content-01 .checkbox-input');

	checkboxClabEditor.addEventListener('change', function () {
		if (checkboxClabEditor.checked) {
			checkboxGeoMap.checked = false;
			showPanelContainerlabEditor();
			viewportDrawerDisableGeoMap();
		} else {
			closePanelContainerlabEditor();
		}
	});
}

// Define a function to show the GeoMap panel and maintain mutual exclusivity with the Clab Editor panel
function initViewportDrawerGeoMapCheckboxToggle() {
	const checkboxClabEditor = document.querySelector('#viewport-drawer-clab-editor-content-01 .checkbox-input');
	const checkboxGeoMap = document.querySelector('#viewport-drawer-geo-map-content-01 .checkbox-input');

	checkboxGeoMap.addEventListener('change', function () {
		if (checkboxGeoMap.checked) {
			checkboxClabEditor.checked = false;
			viewportDrawerLayoutGeoMap();
			closePanelContainerlabEditor();
		} else {
			viewportDrawerDisableGeoMap();
		}
	});
}

/**
 * Dynamically inserts an inline SVG and modifies its color.
 * @param {string} containerId - The ID of the container where the SVG will be added.
 * @param {string} color - The color to apply to the SVG's `fill` attribute.
 */
function insertAndColorSvg(containerId, color) {
	const container = document.getElementById(containerId);

	if (!container) {
		console.error(`Container with ID ${containerId} not found.`);
		return;
	}

	// Define the SVG content
	const svgContent = `
		<svg width="110" height="25" viewBox="0 0 170 40" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path d="M117.514 1.21646L117.514 38.7835H123.148L123.148 1.21646H117.514ZM57.3221 0.57473C46.3463 0.574681 37.8303 8.56332 37.8303 20C37.8303 31.9517 46.3463 39.4255 57.3221 39.4253C68.2979 39.4251 76.8314 31.9517 76.8139 20C76.798 9.16418 68.2979 0.574779 57.3221 0.57473ZM71.1901 20C71.1901 28.4666 64.9812 34.0774 57.3221 34.0774C49.663 34.0774 43.4541 28.4666 43.4541 20C43.4541 11.687 49.663 5.92265 57.3221 5.92265C64.9812 5.92265 71.1901 11.687 71.1901 20ZM0 3.39001e-06V38.7835H5.74992L5.74992 13.1531L35.6298 40V31.9591L0 3.39001e-06ZM81.0513 20L101.961 38.7836H110.345L89.4038 20L110.345 1.21644H101.961L81.0513 20ZM170 38.7835H163.802L159.27 30.4644H138.742L134.209 38.7835H128.011L135.517 24.9176H156.322L145.948 5.64789L149.006 0L149.006 3.76291e-05L149.006 0L170 38.7835Z" fill="#005AFF"/>
		</svg>
	`;

	// Parse the SVG string into a DOM element
	const parser = new DOMParser();
	const svgElement = parser.parseFromString(svgContent, 'image/svg+xml').documentElement;

	// Modify the fill color of the SVG
	svgElement.querySelector('path').setAttribute('fill', color);

	// Append the SVG to the container
	container.innerHTML = '';
	container.appendChild(svgElement);
}

// Call the function during initialization
document.addEventListener('DOMContentLoaded', () => {
	insertAndColorSvg('nokia-logo', 'white');
});


function avoidEdgeLabelOverlap(cy) {

	console.info("avoidEdgeLabelOverlap called");
	// Helper function to calculate edge length
	function calculateEdgeLength(edge) {
		const sourcePos = edge.source().position();
		const targetPos = edge.target().position();
		const dx = targetPos.x - sourcePos.x;
		const dy = targetPos.y - sourcePos.y;
		return Math.sqrt(dx * dx + dy * dy); // Euclidean distance
	}

	// Group edges by their source and target nodes
	const edgesGroupedBySource = {};
	const edgesGroupedByTarget = {};

	cy.edges().forEach(edge => {
		// Group edges by source node
		const source = edge.data('source');
		if (!edgesGroupedBySource[source]) edgesGroupedBySource[source] = [];
		edgesGroupedBySource[source].push(edge);

		// Group edges by target node
		const target = edge.data('target');
		if (!edgesGroupedByTarget[target]) edgesGroupedByTarget[target] = [];
		edgesGroupedByTarget[target].push(edge);
	});

	// Adjust source-text-offset for source nodes with more than one edge
	for (const source in edgesGroupedBySource) {
		const edges = edgesGroupedBySource[source];
		if (edges.length > 1) { // Apply adjustment only if more than one edge
			edges.forEach((edge, index) => {
				const baseOffset = parseFloat(edge.style('source-text-offset')) || 20; // Use default if undefined
				const edgeLength = calculateEdgeLength(edge); // Calculate edge length
				const maxOffset = edgeLength; // Ensure the offset doesn't exceed half the edge length
				const calculatedOffset = Math.min((baseOffset / 2) + (index * 5), maxOffset); // Cap the offset
				edge.style('source-text-offset', calculatedOffset); // Apply the capped offset
			});
		}
	}

	// Adjust target-text-offset for target nodes with more than one edge
	for (const target in edgesGroupedByTarget) {
		const edges = edgesGroupedByTarget[target];
		if (edges.length > 1) { // Apply adjustment only if more than one edge
			edges.forEach((edge, index) => {
				const baseOffset = parseFloat(edge.style('target-text-offset')) || 20; // Use default if undefined
				const edgeLength = calculateEdgeLength(edge); // Calculate edge length
				const maxOffset = edgeLength; // Ensure the offset doesn't exceed half the edge length
				const calculatedOffset = Math.min((baseOffset / 2) + (index * 5), maxOffset); // Cap the offset
				edge.style('target-text-offset', calculatedOffset); // Apply the capped offset
			});
		}
	}
}




function loadCytoStyle(cy) {
	cy.nodes().removeStyle();
	cy.edges().removeStyle();

	// detect light or dark mode
	const colorScheme = detectColorScheme();
	console.info('The user prefers:', colorScheme);
	console.log("multiLayerViewPortState", multiLayerViewPortState);

	// // Load and apply Cytoscape styles from cy-style.json using fetch
	// if (colorScheme == "light") {

	// 	// fetch("css/cy-style-dark.json")
	// 	fetch(window.jsonFileUrlDataCytoStyleDark)



	// 		.then((response) => response.json())
	// 		.then((styles) => {
	// 			cy.style().fromJson(styles).update();
	// 			if (multiLayerViewPortState) {
	// 				// Initialize Cytoscape (assuming cy is already created)
	// 				parentNodeSvgBackground(cy, svgString);
	// 			}
	// 		})
	// 		.catch((error) => {
	// 			console.error(
	// 				"Oops, we hit a snag! Couldnt load the cyto styles, bro.",
	// 				error,
	// 			);
	// 			appendMessage(
	// 				`Oops, we hit a snag! Couldnt load the cyto styles, bro.: ${error}`,
	// 			);
	// 		});

	// } else if (colorScheme == "dark") {
	// 	// fetch("css/cy-style-dark.json")
	// 	fetch(window.jsonFileUrlDataCytoStyleDark)

	// 		.then((response) => response.json())
	// 		.then((styles) => {

	// 			console.log("isGeoMapInitialized", isGeoMapInitialized);
	// 			cy.style().fromJson(styles).update();
	// 			if (multiLayerViewPortState) {
	// 				// Initialize Cytoscape (assuming cy is already created)
	// 				parentNodeSvgBackground(cy, svgString);
	// 			}
	// 		})
	// 		.catch((error) => {
	// 			console.error(
	// 				"Oops, we hit a snag! Couldnt load the cyto styles, bro.",
	// 				error,
	// 			);
	// 			appendMessage(
	// 				`Oops, we hit a snag! Couldnt load the cyto styles, bro.: ${error}`,
	// 			);
	// 		});
	// }
	// Determine the JSON file URL based on color scheme


	// VS-CODE start 
	let jsonFileUrl;
	if (colorScheme === "dark") {
		jsonFileUrl = window.jsonFileUrlDataCytoStyleDark;
	} else {
		jsonFileUrl = window.jsonFileUrlDataCytoStyleDark;
	}

	const cytoscapeStyles = [
		{
			"selector": "core",
			"style": {
				"selection-box-color": "#AAD8FF",
				"selection-box-border-color": "#8BB0D0",
				"selection-box-opacity": "0.5"
			}
		},
		{
			"selector": "node",
			"style": {
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
				"overlay-padding": "0.3px",
				"z-index": "2"
			}
		},
		{
			"selector": "node[?attr]",
			"style": {
				"shape": "rectangle",
				"background-color": "#aaa",
				"text-outline-color": "#aaa",
				"width": "10px",
				"height": "10x",
				"font-size": "8px",
				"z-index": "2"
			}
		},
		{
			"selector": "node[?query]",
			"style": { "background-clip": "none", "background-fit": "contain" }
		},
		{
			"selector": "node:parent",
			"style": {
				"shape": "rectangle",
				"border-width": "0.5px",
				"border-color": "#DDDDDD",
				"background-color": "#d9d9d9",
				"background-opacity": "0.2",
				"color": "#EBECF0",
				"text-outline-color": "#000000",
				"width": "3px",
				"height": "3x",
				"font-size": "8px",
				"z-index": "1"
			}
		},
		{
			"selector": "node:selected",
			"style": {
				"border-width": "1.5px",
				"border-color": "#282828",
				"border-opacity": "0.5",
				"background-color": "#77828C",
				"text-outline-color": "#282828"
			}
		},
		{
			"selector": "node[name*=\"statusGreen\"]",
			"style": {
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
			"selector": "node[name*=\"statusRed\"]",
			"style": {
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
			"selector": "node[topoViewerRole=\"router\"]",
			"style": {
				"width": "14",
				"height": "14",
				"background-image": `${window.imagesUrl}/clab-pe-light-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"pe\"]",
			"style": {
				"width": "14",
				"height": "14",
				"background-image": `${window.imagesUrl}/clab-pe-light-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"p\"]",
			"style": {
				"width": "14",
				"height": "14",
				"background-image": `${window.imagesUrl}/clab-pe-dark-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"controller\"]",
			"style": {
				"width": "14",
				"height": "14",
				"background-image": `${window.imagesUrl}/clab-controller-light-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"pon\"]",
			"style": {
				"width": "12",
				"height": "12",
				"background-image": `${window.imagesUrl}/clab-pon-dark-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"dcgw\"]",
			"style": {
				"width": "12",
				"height": "12",
				"background-image": `${window.imagesUrl}/clab-dcgw-light-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"leaf\"]",
			"style": {
				"background-image": `${window.imagesUrl}/clab-leaf-light-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"leaf-svg\"]",
			"style": {
				"background-image": "data:image/svg+xml;base64,PHN2ZyB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWw6c3BhY2U9InByZXNlcnZlIiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAxMjAgMTIwOyIgdmlld0JveD0iMCAwIDEyMCAxMjAiIHk9IjBweCIgeD0iMHB4IiBpZD0iTGF5ZXJfMSIgdmVyc2lvbj0iMS4xIj4mI3hhOzxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+LnN0MCB7IGZpbGw6IHJnYigwLCA5MCwgMjU1KTsgfSAuc3QxIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0MiB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgfSAuc3QzIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDQgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IH0gLnN0NSB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NiB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQuMjMzMzsgc3Ryb2tlLWxpbmVjYXA6IHJvdW5kOyBzdHJva2UtbGluZWpvaW46IHJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDogMTA7IH0gLnN0NyB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDggeyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3Q5IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyB9IC5zdDEwIHsgZmlsbDogbm9uZTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgfSAuc3QxMSB7IGZpbGw6IHJnYigzOCwgMzgsIDM4KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNC4yMzMzOyB9IC5zdDEyIHsgZmlsbC1ydWxlOiBldmVub2RkOyBjbGlwLXJ1bGU6IGV2ZW5vZGQ7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QxMyB7IGZpbGwtcnVsZTogZXZlbm9kZDsgY2xpcC1ydWxlOiBldmVub2RkOyBmaWxsOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IH0gLnN0MTQgeyBmaWxsOiBub25lOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0LjIzMzM7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgc3Ryb2tlLWxpbmVqb2luOiByb3VuZDsgfSAuc3QxNSB7IGZpbGw6IG5vbmU7IHN0cm9rZTogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2Utd2lkdGg6IDQ7IHN0cm9rZS1saW5lY2FwOiByb3VuZDsgfSAuc3QxNiB7IGZpbGw6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsgfSAuc3QxNyB7IGZpbGw6IHJnYigzOCwgMzgsIDM4KTsgc3Ryb2tlOiByZ2IoMjU1LCAyNTUsIDI1NSk7IHN0cm9rZS13aWR0aDogNDsgc3Ryb2tlLW1pdGVybGltaXQ6IDEwOyB9IC5zdDE4IHsgZmlsbDogcmdiKDI1NSwgMjU1LCAyNTUpOyBzdHJva2U6IHJnYigyNTUsIDI1NSwgMjU1KTsgc3Ryb2tlLXdpZHRoOiA0OyBzdHJva2UtbGluZWNhcDogcm91bmQ7IHN0cm9rZS1saW5lam9pbjogcm91bmQ7IH0gPC9zdHlsZT4mI3hhOzxyZWN0IGhlaWdodD0iMTIwIiB3aWR0aD0iMTIwIiBjbGFzcz0ic3QwIi8+JiN4YTs8Zz4mI3hhOwk8cGF0aCBkPSJNOTEuNSwyNy4zbDcuNiw3LjZjMS4zLDEuMywxLjMsMy4xLDAsNC4zbC03LjYsNy43IiBjbGFzcz0ic3QxIi8+JiN4YTsJPHBhdGggZD0iTTI4LjUsNDYuOWwtNy42LTcuNmMtMS4zLTEuMy0xLjMtMy4xLDAtNC4zbDcuNi03LjciIGNsYXNzPSJzdDEiLz4mI3hhOwk8cGF0aCBkPSJNOTEuNSw3My4xbDcuNiw3LjZjMS4zLDEuMywxLjMsMy4xLDAsNC4zbC03LjYsNy43IiBjbGFzcz0ic3QxIi8+JiN4YTsJPHBhdGggZD0iTTI4LjUsOTIuN2wtNy42LTcuNmMtMS4zLTEuMy0xLjMtMy4xLDAtNC4zbDcuNi03LjciIGNsYXNzPSJzdDEiLz4mI3hhOwk8Zz4mI3hhOwkJPHBhdGggZD0iTTk2LjYsMzYuOEg2Ny45bC0xNiw0NS45SDIzLjIiIGNsYXNzPSJzdDEiLz4mI3hhOwkJPHBhdGggZD0iTTk2LjYsODIuN0g2Ny45bC0xNi00NS45SDIzLjIiIGNsYXNzPSJzdDEiLz4mI3hhOwk8L2c+JiN4YTs8L2c+JiN4YTs8L3N2Zz4=",
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"rgw\"]",
			"style": {
				"background-image": `${window.imagesUrl}/clab-rgw-light-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"super-spine\"]",
			"style": {
				"width": "12",
				"height": "12",
				"background-image": `${window.imagesUrl}/clab-spine-dark-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"spine\"]",
			"style": {
				"width": "12",
				"height": "12",
				"background-image": `${window.imagesUrl}/clab-spine-light-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"server\"]",
			"style": {
				"width": "12",
				"height": "12",
				"background-image": `${window.imagesUrl}/clab-server-dark-blue.png`,
				"background-fit": "cover"
			}
		},
		{
			"selector": "node[topoViewerRole=\"bridge\"]",
			"style": {
				"width": "8",
				"height": "8",
				"background-image": `${window.imagesUrl}/clab-bridge-light-grey.png`,
				"background-fit": "cover"
			}
		},

		{
			"selector": "node[topoViewerRole=\"router\"][editor=\"true\"]",
			"style": {
				"width": "14",
				"height": "14",
				"background-image": `${window.imagesUrl}/clab-pe-dark-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"pe\"][editor=\"true\"]",
			"style": {
				"width": "14",
				"height": "14",
				"background-image": `${window.imagesUrl}/clab-pe-dark-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"p\"][editor=\"true\"]",
			"style": {
				"width": "14",
				"height": "14",
				"background-image": `${window.imagesUrl}/clab-pe-dark-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"controller\"][editor=\"true\"]",
			"style": {
				"width": "14",
				"height": "14",
				"background-image": `${window.imagesUrl}/clab-controller-light-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"pon\"][editor=\"true\"]",
			"style": {
				"width": "12",
				"height": "12",
				"background-image": `${window.imagesUrl}/clab-pon-dark-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"dcgw\"][editor=\"true\"]",
			"style": {
				"width": "12",
				"height": "12",
				"background-image": `${window.imagesUrl}/clab-dcgw-dark-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"leaf\"][editor=\"true\"]",
			"style": {
				"background-image": `${window.imagesUrl}/clab-leaf-light-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"rgw\"][editor=\"true\"]",
			"style": {
				"background-image": `${window.imagesUrl}/clab-rgw-light-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"super-spine\"][editor=\"true\"]",
			"style": {
				"width": "12",
				"height": "12",
				"background-image": `${window.imagesUrl}/clab-spine-dark-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"spine\"][editor=\"true\"]",
			"style": {
				"width": "12",
				"height": "12",
				"background-image": `${window.imagesUrl}/clab-spine-light-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"server\"][editor=\"true\"]",
			"style": {
				"width": "12",
				"height": "12",
				"background-image": `${window.imagesUrl}/clab-server-dark-blue.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},
		{
			"selector": "node[topoViewerRole=\"bridge\"][editor=\"true\"]",
			"style": {
				"width": "8",
				"height": "8",
				"background-image": `${window.imagesUrl}/clab-bridge-light-grey.png`,
				"background-fit": "cover",
				"border-width": "0.5px",
				"border-color": "#32CD32"
			}
		},

		{
			"selector": "edge",
			"style": {
				"targetArrowShape": "none",
				"font-size": "5px",
				"source-label": "data(sourceEndpoint)",
				"target-label": "data(targetEndpoint)",
				"source-text-offset": 20,
				"target-text-offset": 20,
				"arrow-scale": "0.5",
				"source-text-color": "#000000",
				"target-text-color": "#000000",
				"text-outline-width": "0.3px",
				"text-outline-color": "#FFFFFF",
				"text-background-color": "#CACBCC",
				"text-opacity": 1,
				"text-background-opacity": 0.7,
				"text-background-shape": "roundrectangle",
				"text-background-padding": "1px",
				"curve-style": "bezier",
				"control-point-step-size": 20,
				"opacity": "1",
				"line-color": "#969799",
				"width": "1.5",
				"label": " ",
				"overlay-padding": "2px"
			}
		},
		{ "selector": "node.unhighlighted", "style": { "opacity": "0.2" } },
		{ "selector": "edge.unhighlighted", "style": { "opacity": "0.05" } },
		{ "selector": ".highlighted", "style": { "z-index": "3" } },
		{
			"selector": "node.highlighted",
			"style": {
				"border-width": "7px",
				"border-color": "#282828",
				"border-opacity": "0.5",
				"background-color": "#282828",
				"text-outline-color": "#282828"
			}
		},

		{ "selector": "edge.filtered", "style": { "opacity": "0" } },

		{
			"selector": ".spf", "style":
			{
				"opacity": "1",
				"line-color": "#FF0000",
				"line-style": "solid"
			}
		},

		{
			"selector": ".eh-handle",
			"style": {
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
			"selector": ".eh-hover",
			"style": {
				"background-color": "red"
			}
		},

		{
			"selector": ".eh-source",
			"style": {
				"border-width": 2,
				"border-color": "red"
			}
		},

		{
			"selector": ".eh-target",
			"style": {
				"border-width": 2,
				"border-color": "red"
			}
		},

		{
			"selector": ".eh-preview, .eh-ghost-edge",
			"style": {
				"background-color": "red",
				"line-color": "red",
				"target-arrow-color": "red",
				"source-arrow-color": "red"
			}
		},
		{
			"selector": ".eh-ghost-edge.eh-preview-active",
			"style": {
				"opacity": 0
			}
		},



		{ "selector": "edge[group=\"coexp\"]", "style": { "line-color": "#d0b7d5" } },
		{ "selector": "edge[group=\"coloc\"]", "style": { "line-color": "#a0b3dc" } },
		{ "selector": "edge[group=\"gi\"]", "style": { "line-color": "#90e190" } },
		{ "selector": "edge[group=\"path\"]", "style": { "line-color": "#9bd8de" } },
		{ "selector": "edge[group=\"pi\"]", "style": { "line-color": "#eaa2a2" } },
		{ "selector": "edge[group=\"predict\"]", "style": { "line-color": "#f6c384" } },
		{ "selector": "edge[group=\"spd\"]", "style": { "line-color": "#dad4a2" } },
		{ "selector": "edge[group=\"spd_attr\"]", "style": { "line-color": "#D0D0D0" } },
		{ "selector": "edge[group=\"reg\"]", "style": { "line-color": "#D0D0D0" } },
		{ "selector": "edge[group=\"reg_attr\"]", "style": { "line-color": "#D0D0D0" } },
		{ "selector": "edge[group=\"user\"]", "style": { "line-color": "#f0ec86" } }
	]

	// Apply the styles defined in the constant
	cy.style().fromJson(cytoscapeStyles).update();

	console.log("Cytoscape styles applied successfully.");
	// VS-CODE end 

	avoidEdgeLabelOverlap(cy);

	if (!linkEndpointVisibility) { // doing this because default is true and text-opacity is 1 and text-background-opacity is 0.7
		cy.edges().forEach(function (edge) {
			edge.style("text-opacity", 0);
			edge.style("text-background-opacity", 0);
		});
	}


	// Your SVG string
	const svgString = `
	<svg width="480px" height="240px" viewBox="0 0 48 24" fill="none" xmlns="http://www.w3.org/2000/svg">
	<path d="M0 24 L12 0 L48 0 L36 24 Z" 
		stroke="rgba(200, 200, 200, 0.7)" 
		stroke-width="1" 
		fill="rgba(40, 40, 40, 0.6)"
		vector-effect="non-scaling-stroke"/>
	</svg>`;

	/**
	 * Function to dynamically set an SVG as the background-image for Cytoscape.js parent nodes
	 * @param {object} cy - Cytoscape.js instance
	 * @param {string} svgString - SVG string to be used as the background
	 */
	function parentNodeSvgBackground(cy, svgString) {
		// Helper function to convert SVG to Base64
		function svgToBase64(svg) {
			return `data:image/svg+xml;base64,${btoa(svg)}`;
		}

		// Convert the SVG to Base64
		const base64SVG = svgToBase64(svgString);

		// Update Cytoscape style dynamically for parent nodes
		cy.style()
			.selector('node:parent')
			.style({
				'shape': 'rectangle',
				'background-image': base64SVG,
				'background-color': 'rgba(100, 100, 100, 1)',
				'background-opacity': 0,
				'background-image-containment': 'inside',
				'border-width': '0px',
				'background-fit': 'cover',
				'background-clip': 'none',
				'bounds-expansion': '10px, 100px, 10px, 100px',
				'padding': '30px',
			})
			.update();
		console.log("parentNodeSvgBackground called");
		console.log("parentNodeSvgBackground called - base64SVG", base64SVG)
	}

	// if GeoMap is initialized, then apply the multipliers to style
	if (isGeoMapInitialized) {
		// Define a JSON object for styles and multipliers
		const nodeStyleMultipliers = {
			'width': 4,
			'height': 4,
			'font-size': 4,
			'min-zoomed-font-size': 4,
			'overlay-padding': 4,
			'text-background-padding': 4,
			// Add more styles here if needed
		};

		// Apply the multipliers to the nodes
		cy.nodes().forEach(node => {

			const newStyles = {}; // Prepare a new style object dynamically
			Object.keys(nodeStyleMultipliers).forEach(styleProp => { // Iterate over the style parameters in the JSON object
				let currentValue = node.style(styleProp); // Get the current style value
				let newValue = parseFloat(currentValue) * nodeStyleMultipliers[styleProp]; // Extract the numeric part and apply the multiplier
				newStyles[styleProp] = `${newValue}px`; // Update the style with the new value and add the 'px' unit back
			});
			node.style(newStyles); // Apply the updated styles to the node
		});

		// Define a JSON object for styles and multipliers
		const edgeStyleMultipliers = {
			'width': 4,
			'font-size': 4,
			'overlay-padding': 4,
			'text-background-padding': 4,
			// Add more styles here if needed
		};

		// Apply the multipliers to the edges
		cy.edges().forEach(edge => {
			const newStyles = {}; // Prepare a new style object dynamically
			Object.keys(edgeStyleMultipliers).forEach(styleProp => { // Iterate over the style parameters in the JSON object
				let currentValue = edge.style(styleProp); // Get the current style value
				let newValue = parseFloat(currentValue) * edgeStyleMultipliers[styleProp]; // Extract the numeric part and apply the multiplier
				newStyles[styleProp] = `${newValue}px`; // Update the style with the new value and add the 'px' unit back
			});
			edge.style(newStyles); // Apply the updated styles to the edge
		});

		parents = cy.nodes(':parent');
		const parentNodeStyleMultipliers = { // Define a JSON object for styles and multipliers
			"border-width": 4,
			// Add more styles here if needed
		};

		// Apply the multipliers to the parent nodes
		parents.forEach(parent => {
			const newStyles = {}; // Prepare a new style object dynamically
			Object.keys(parentNodeStyleMultipliers).forEach(styleProp => { // Iterate over the style parameters in the JSON object
				let currentValue = parent.style(styleProp); // Get the current style value
				let newValue = parseFloat(currentValue) * parentNodeStyleMultipliers[styleProp]; // Extract the numeric part and apply the multiplier
				newStyles[styleProp] = `${newValue}px`; // Update the style with the new value and add the 'px' unit back
			});
			parent.style(newStyles); // Apply the updated styles to the parent
		});
		console.log("parentNode list - parents", parents)

		parents.forEach(parent => {
			parent.style('background-color', "rgba(40, 40, 40, 0.5)");
			parent.style('border-color', "rgba(76, 82, 97, 1)");
		});
	}
}

function viewportButtonsMultiLayerViewPortToggle() {
	if (multiLayerViewPortState == false) {
		multiLayerViewPortState = true; // toggle
		console.log("multiLayerViewPortState toggle to true", multiLayerViewPortState);

		loadCytoStyle(cy)
	} else {
		multiLayerViewPortState = false; // toggle
		console.log("multiLayerViewPortState toggle to false", multiLayerViewPortState);

		loadCytoStyle(cy)
	}
}

// Function to process the data
function assignMissingLatLng(dataArray) {
	// Arrays to store existing lat and lng values
	const existingLats = [];
	const existingLngs = [];

	// First pass: Collect existing lat and lng values
	dataArray.forEach(item => {
		const data = item.data;
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

	// Compute the average (mean) of existing lat and lng
	const averageLat = existingLats.length > 0 ? existingLats.reduce((a, b) => a + b, 0) / existingLats.length : 0;
	const averageLng = existingLngs.length > 0 ? existingLngs.reduce((a, b) => a + b, 0) / existingLngs.length : 0;

	// Second pass: Assign missing lat and lng
	dataArray.forEach(item => {
		const data = item.data;

		// Check and assign missing latitude
		if (!data.lat || data.lat.trim() === "") {
			// Assign normalized lat + random value between 0 and 0.1
			const newLat = averageLat + Math.random() * 0.9;
			data.lat = newLat.toFixed(15).toString(); // Convert back to string with precision
			console.log(`Assigned new lat for ID ${data.id}: ${data.lat}`);
		} else {
			// Optionally, normalize existing lat
			const normalizedLat = parseFloat(data.lat);
			data.lat = normalizedLat.toFixed(15).toString();
		}

		// Check and assign missing longitude
		if (!data.lng || data.lng.trim() === "") {
			// Assign normalized lng + random value between 0 and 0.1
			const newLng = averageLng + Math.random() * 0.9;
			data.lng = newLng.toFixed(15).toString(); // Convert back to string with precision
			console.log(`Assigned new lng for ID ${data.id}: ${data.lng}`);
		} else {
			// Optionally, normalize existing lng
			const normalizedLng = parseFloat(data.lng);
			data.lng = normalizedLng.toFixed(15).toString();
		}
	});

	return dataArray;
}


// aarafat-tag:
//// REFACTOR END

// logMessagesPanel manager
///logMessagesPanel Function to append message function
function appendMessage(message) {
	// const textarea = document.getElementById('notificationTextarea');
	const textarea = document.getElementById("notificationTextarea");

	// Get the current date and time
	const timestamp = new Date().toLocaleString();

	textarea.value += `[${timestamp}] ${message}\n`;
	textarea.scrollTop = textarea.scrollHeight;
}

function nodeFindDrawer(cy) {
	// Get a reference to your Cytoscape instance (assuming it's named 'cy')
	// const cy = window.cy; // Replace 'window.cy' with your actual Cytoscape instance
	// Find the node with the specified name
	const nodeName = document.getElementById(
		"panelBlock-viewportButtons-buttonfindNode-divPanelBlock-columnContainerlabelFindNodeNodeName-panelContentlabelFindNodeNodeName-columnsPanelContentlabelFindNodeNodeName-labelColumnlabelFindNodeNodeName-inputColumnlabelFindNodeNodeName-labellabelFindNodeNodeName",
	).value;

	const node = cy.$(`node[name = "${nodeName}"]`);
	// Check if the node exists
	if (node.length > 0) {
		// console
		console.info("Info: " + 'Sweet! Node "' + nodeName + '" is in the house.');
		appendMessage("Info: " + 'Sweet! Node "' + nodeName + '" is in the house.');
		// Apply a highlight style to the node
		node.style({
			"border-color": "red",
			"border-width": "2px",
			"background-color": "yellow",
		});
		// Zoom out on the node
		cy.fit();
		// Zoom in on the node
		cy.animate({
			zoom: {
				level: 5,
				position: {
					x: node.position("x"),
					y: node.position("y"),
				},
				renderedPosition: {
					x: node.renderedPosition("x"),
					y: node.renderedPosition("y"),
				},
			},
			duration: 1500,
		});
	} else {
		console.error(
			`Bro, I couldn't find a node named "${nodeName}". Try another one.`,
		);
		appendMessage(
			`Bro, I couldn't find a node named "${nodeName}". Try another one.`,
		);
	}
}

function pathFinderDijkstraDrawer(cy) {
	// Usage example:
	// highlightShortestPath('node-a', 'node-b'); // Replace with your source and target node IDs
	// Function to get the default node style from cy-style.json
	// weight: (edge) => 1, // You can adjust the weight function if needed
	// weight: (edge) => edge.data('distance')
	console.info("im triggered");

	// Remove existing highlight from all edges
	cy.edges().forEach((edge) => {
		edge.removeClass("spf");
	});

	// Get the node sourceNodeId from pathFinderSourceNodeInput and targetNodeId from pathFinderTargetNodeInput
	const sourceNodeId = document.getElementById(
		"panelBlock-viewportButtons-buttonfindRoute-divPanelBlock-columnContainerlabelFindRouteSource-panelContentlabelFindRouteSource-columnsPanelContentlabelFindRouteSource-labelColumnlabelFindRouteSource-inputColumnlabelFindRouteSource-labellabelFindRouteSource",
	).value;
	const targetNodeId = document.getElementById(
		"panelBlock-viewportButtons-buttonfindRoute-divPanelBlock-columnContainerlabelFindRouteTarget-panelContentlabelFindRouteTarget-columnsPanelContentlabelFindRouteTarget-labelColumnlabelFindRouteTarget-inputColumnlabelFindRouteTarget-labellabelFindRouteTarget",
	).value;

	// Assuming you have 'cy' as your Cytoscape instance
	const sourceNode = cy.$(`node[id="${sourceNodeId}"]`);
	const targetNode = cy.$(`node[id="${targetNodeId}"]`);

	console.info(
		"Info: " +
		"Let's find the path from-" +
		sourceNodeId +
		"-to-" +
		targetNodeId +
		"!",
	);
	appendMessage(
		"Info: " +
		"Let's find the path from-" +
		sourceNodeId +
		"-to-" +
		targetNodeId +
		"!",
	);

	// Check if both nodes exist
	// Check if both nodes exist
	if (sourceNode.length === 0 || targetNode.length === 0) {
		console.error(
			`Bro, couldn't find the source or target node you specified. Double-check the node names.`,
		);
		appendMessage(
			`Bro, couldn't find the source or target node you specified. Double-check the node names.`,
		);
		return;
	}

	// Get the Dijkstra result with the shortest path
	const dijkstraResult = cy.elements().dijkstra({
		root: sourceNode,
		weight: (edge) => 1,
		// Use the custom weight attribute
		// weight: edge => edge.data('customWeight'),
	});
	// Get the shortest path from Dijkstra result
	const shortestPathEdges = dijkstraResult.pathTo(targetNode);
	console.info(shortestPathEdges);

	// Check if there is a valid path (shortestPathEdges is not empty)
	if (shortestPathEdges.length > 1) {
		// Highlight the shortest path
		shortestPathEdges.forEach((edge) => {
			edge.addClass("spf");
		});
		// Zoom out on the node
		cy.fit();

		// Zoom in on the node
		cy.animate({
			zoom: {
				level: 5,
				position: {
					x: sourceNode.position("x"),
					y: sourceNode.position("y"),
				},
				renderedPosition: {
					x: sourceNode.renderedPosition("x"),
					y: sourceNode.renderedPosition("y"),
				},
			},
			duration: 1500,
		});
		// throw log
		console.info(
			"Info: " +
			"Yo, check it out! Shorthest Path from-" +
			sourceNodeId +
			"-to-" +
			targetNodeId +
			" has been found.",
		);
		appendMessage(
			"Info: " +
			"Yo, check it out! Shorthest Path from-" +
			sourceNodeId +
			"-to-" +
			targetNodeId +
			" has been found, below is the path trace..",
		);
		console.info(shortestPathEdges);

		shortestPathEdges.forEach((edge) => {
			console.info("Edge ID:", edge.id());
			console.info("Source Node ID:", edge.source().id());
			console.info("Target Node ID:", edge.target().id());

			edgeId = edge.id();
			sourceNodeId = edge.source().id();
			targetNodeId = edge.target().id();

			// You can access other properties of the edge, e.g., source, target, data, etc.
			appendMessage("Info: " + "Edge ID: " + edgeId);
			appendMessage("Info: " + "Source Node ID: " + sourceNodeId);
			appendMessage("Info: " + "Target Node ID: " + targetNodeId);
		});
	} else {
		console.error(
			`Bro, there is no path from "${sourceNodeId}" to "${targetNodeId}".`,
		);
		appendMessage(
			`Bro, there is no path from "${sourceNodeId}" to "${targetNodeId}".`,
		);
		return;
	}
}

// sleep funtion
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}



async function renderSubInterfaces(subInterfaces, referenceElementAfterId, referenceElementBeforeId, edgeSharkClipboardToggle) {
	const containerSelectorId = 'panel-link-action-dropdown-menu-dropdown-content';

	const onClickHandler = (event, subInterface) => {
		console.info(`Clicked on: ${subInterface}`);
		linkWireshark(event, "edgeSharkSubInterface", subInterface, referenceElementAfterId);
	};

	// Validate container
	const containerElement = document.getElementById(containerSelectorId);
	if (!containerElement) {
		console.error(`Container element with ID "${containerSelectorId}" not found.`);
		return;
	}

	// Validate reference elements
	const referenceElementAfter = document.getElementById(referenceElementAfterId);
	const referenceElementBefore = document.getElementById(referenceElementBeforeId);
	if (!referenceElementAfter || !referenceElementBefore) {
		console.error(`Reference elements not found: afterId="${referenceElementAfterId}", beforeId="${referenceElementBeforeId}".`);
		return;
	}

	// Remove all elements between referenceElementAfter and referenceElementBefore
	let currentNode = referenceElementAfter.nextSibling;
	while (currentNode && currentNode !== referenceElementBefore) {
		const nextNode = currentNode.nextSibling;
		currentNode.remove(); // Remove the current node
		currentNode = nextNode;
	}

	// Handle case when subInterfaces is null
	if (!subInterfaces) {
		console.info("Sub-interfaces is null. Cleared existing items and performed no further actions.");
		// Optionally, you could display a placeholder message or take other actions:
		// const placeholder = document.createElement("div");
		// placeholder.textContent = "No sub-interfaces available.";
		// placeholder.style.textAlign = "center";
		// insertAfter(placeholder, referenceElementAfter);
		return;
	}

	// Add new sub-interface items
	subInterfaces.forEach(subInterface => {
		const a = document.createElement("a");
		a.className = "dropdown-item label has-text-weight-normal is-small py-0";
		a.style.display = "flex";
		a.style.justifyContent = "flex-end";
		a.textContent = `└ Sub-Interface ${subInterface}`;
		a.onclick = (event) => onClickHandler(event, subInterface);

		insertAfter(a, referenceElementAfter);
	});
}




// Helper function to insert an element after a reference element
function insertAfter(newNode, referenceNode) {
	referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function addSvgIcon(targetHtmlId, svgIcon, altName, position, size) {
	// Find the target node
	const targetNode = document.getElementById(targetHtmlId);
	if (!targetNode) {
		console.error(`Target node with ID "${targetHtmlId}" not found.`);
		return;
	}

	// Ensure the target node uses flexbox for alignment
	targetNode.style.display = "flex";
	targetNode.style.alignItems = "center";

	// Create the <img> element for the SVG icon
	const imgIcon = document.createElement("img");
	imgIcon.src = svgIcon;
	imgIcon.alt = altName; // Accessible description
	imgIcon.style.width = size;
	imgIcon.style.height = size;
	imgIcon.style.marginLeft = position === "after" ? "4px" : "0"; // Add spacing between the label and the icon if "after"
	imgIcon.style.marginRight = position === "before" ? "4px" : "0"; // Add spacing if "before"

	// Add CSS class for gradient animation
	imgIcon.classList.add("gradient-animation");

	// Insert the image based on the position
	if (position === "after") {
		// Append the image after the label
		targetNode.append(imgIcon);
	} else if (position === "before") {
		// Insert the image before the label
		targetNode.prepend(imgIcon);
	} else {
		console.error(
			`Invalid position "${position}" specified. Use "after" or "before".`
		);
		return;
	}

	// Add dynamic style for gradient animation
	const style = document.createElement("style");
	style.textContent = `
        @keyframes gradientColorChange {
            0% { filter: invert(100%); } /* White */
            20% { filter: invert(85%); } /* Light Grey */
            40% { filter: invert(60%); } /* Dark Grey */
            60% { filter: invert(40%); } /* Very Dark Grey */
            80% { filter: invert(60%); } /* Back to Dark Grey */
            100% { filter: invert(100%); } /* Back to White */
        }
        .gradient-animation {
            animation: gradientColorChange 3600s infinite;
        }
    `;
	document.head.appendChild(style);
}

addSvgIcon("endpoint-a-edgeshark", `${window.imagesUrl}svg-wireshark.svg`, "Wireshark Icon", "before", "20px");
addSvgIcon("endpoint-b-edgeshark", `${window.imagesUrl}/svg-wireshark.svg`, "Wireshark Icon", "before", "20px");

addSvgIcon("endpoint-a-clipboard", `${window.imagesUrl}/svg-copy.svg`, "Clipboard Icon", "before", "20px");
addSvgIcon("endpoint-b-clipboard", `${window.imagesUrl}/svg-copy.svg`, "Clipboard Icon", "before", "20px");

addSvgIcon("panel-link-action-impairment-B->A", `${window.imagesUrl}/svg-impairment.svg`, "Impairment Icon", "before", "15px");


/// VS-CODE BackEnd messaging handler

require.config({
	paths: {
		'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs'
	}
});

// Example: Load Monaco Editor on DOMContentLoaded or similar
document.addEventListener('DOMContentLoaded', function () {
	require(['vs/editor/editor.main'], function () {
		// Monaco is now loaded
		// You can set up your editor or do any post-load logic here
		console.log("Monaco Editor is initialized.");

		// You might set up your editor here, for example:
		// window.monacoEditor = monaco.editor.create(document.getElementById('editorContainer'), ...);
	});
});

// Acquire the VS Code API handle
const vsCode = acquireVsCodeApi();

// Keep track of pending requests in a Map (requestId -> {resolve, reject})
const pendingRequests = new Map();
let requestCounter = 0;

/**
 * backendGet(functionName, payload)
 *
 * Sends a message to the VS Code extension requesting
 * that the specified backend function be invoked with `payload`.
 * Returns a Promise that resolves with the result from the extension.
 */
function backendGet(functionName, payload) {
	return new Promise((resolve, reject) => {
		// Create a unique requestId
		const requestId = `req_${Date.now()}_${++requestCounter}`;

		// Store resolve/reject so we can resolve the Promise when the backend responds
		pendingRequests.set(requestId, { resolve, reject });

		// Send a message to the extension
		vsCode.postMessage({
			type: 'backendGet',
			requestId: requestId,
			functionName: functionName,
			payload: payload
		});
	});
}

window.addEventListener('message', (event) => {
	const msg = event.data; // The data sent from the extension

	if (msg && msg.type === 'backendGetResponse') {
		const { requestId, result, error } = msg;
		// Look up the pending request
		const pending = pendingRequests.get(requestId);
		if (!pending) {
			console.warn("Got response for unknown requestId:", requestId);
			return;
		}

		// Clean up
		pendingRequests.delete(requestId);

		// If the extension signaled an error, reject, else resolve
		if (error) {
			pending.reject(new Error(error));
		} else {
			pending.resolve(result);
		}
	}
});

// using backendGt
async function runMyBackendCall() {
	try {
		const response = await backendGet("backendFuncBB", { foo: "bar" });
		console.log("############### Success from backend:", response);
	} catch (err) {
		console.error("############### Backend call failed:", err);
	}
}
