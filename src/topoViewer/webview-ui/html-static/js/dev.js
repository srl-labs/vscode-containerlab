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




document.addEventListener("DOMContentLoaded", async function () {
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

  if (isVscodeDeployment) {
    // aarafat-tag: vs-code
    initUptime();
  }

  // Call the function during initialization
  initializeResizingLogic(cy);

  detectColorScheme()
  await changeTitle()
  initializeDropdownTopoViewerRoleListeners();
  initializeDropdownListeners();
  initViewportDrawerClabEditoCheckboxToggle()
  // initViewportDrawerGeoMapCheckboxToggle()

  // insertAndColorSvg("nokia-logo", "white")

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

  if (!isVscodeDeployment) {
    // deploymenType !vs-code
    // WebSocket for uptime
    const socketUptime = initializeWebSocket("/uptime", async (msgUptime) => {
      environments = await getEnvironments();
      globalLabName = environments["clab-name"]
      deploymentType = environments["deploymentType"]

      console.info("initializeWebSocket - getEnvironments", environments)
      console.info("initializeWebSocket - globalLabName", environments["clab-name"])

      const string01 = "containerlab: " + globalLabName;
      const string02 = " ::: Uptime: " + msgUptime.data;

      const ClabSubtitle = document.getElementById("ClabSubtitle");
      const messageBody = string01 + string02;

      ClabSubtitle.innerText = messageBody;
      console.info(ClabSubtitle.innerText);
    });
    // WebSocket for ContainerNodeStatus
    const socketContainerNodeStatusInitial = initializeWebSocket(
      "/containerNodeStatus",
      (msgContainerNodeStatus) => {
        try {
          const {
            Names,
            Status,
            State
          } = JSON.parse(msgContainerNodeStatus.data);
          setNodeContainerStatus(Names, Status);
          console.info(JSON.parse(msgContainerNodeStatus.data));

          const IPAddress = JSON.parse(msgContainerNodeStatus.data).Networks.Networks.clab.IPAddress;
          const GlobalIPv6Address = JSON.parse(msgContainerNodeStatus.data).Networks.Networks.clab.GlobalIPv6Address

          setNodeDataWithContainerAttribute(Names, Status, State, IPAddress, GlobalIPv6Address);

        } catch (error) {
          console.error("Error parsing JSON:", error);
        }
      },
    );
  }

  // deploymenType vs-code
  async function initUptime() {
    environments = await getEnvironments();
    globalLabName = environments["clab-name"]
    deploymentType = environments["deploymentType"]

    console.info("initializeWebSocket - getEnvironments", environments)
    console.info("initializeWebSocket - globalLabName", environments["clab-name"])

    const string01 = "topology: " + globalLabName;
    // const string02 = " ::: Uptime: " + "msgUptime.data";
    const string02 = "";


    const ClabSubtitle = document.getElementById("ClabSubtitle");
    const messageBody = string01 + string02;

    ClabSubtitle.innerText = messageBody;
    console.info(ClabSubtitle.innerText);
  }



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
    wheelSensitivity: 0.2,
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
    // Assuming the checkbox is always true in your test
    const isViewportDrawerClabEditorCheckboxChecked = true;

    if (isViewportDrawerClabEditorCheckboxChecked) {
      const draggedNode = event.target;

      // Check all parent nodes to see if the dragged node is inside one
      let assignedParent = null;
      cy.nodes(':parent').forEach((parent) => {
        if (isNodeInsideParent(draggedNode, parent)) {
          assignedParent = parent;
        }
      });

      // console.log(`assignedParent id: ${assignedParent.id()}, assignedParentChildren: ${assignedParent.children()}` )
      

      if (assignedParent) {
        // If dragged inside a parent, reassign the node to that parent
        draggedNode.move({
          parent: assignedParent.id()
        });
        console.info(`${draggedNode.id()} became a child of ${assignedParent.id()}`);

        // Get the dummy child node using your naming convention
        // const dummyChild = cy.getElementById(`${assignedParent.id()}:dummyChild`);

        // Get the dummy child node using topoViewerRole
        const dummyChild = assignedParent.children('[topoViewerRole = "dummyChild"]');

        console.log(`assignedParent id: ${assignedParent.id()}, assignedParentChildren: ${assignedParent.children()}, assignedParentDoummyChild: ${dummyChild.id()}` )

        // Only proceed if the dummy child exists
        if (dummyChild.length > 0) {
          // Get all children of the parent except the dummy child
          const realChildren = assignedParent.children().not(dummyChild);

          console.log("realChildren: ", realChildren);

          // If there is at least one non-dummy child, remove the dummy
          if (realChildren.length > 0) {
            dummyChild.remove();
            console.log("Dummy child removed");
          } else {
            console.log("No real children present, dummy child remains");
          }
        }
      }

      // Select all parent nodes where data.topoViewerRole equals "group"
      var parentNodes = cy.nodes('[topoViewerRole = "group"]');

      // Iterate over each matching parent node and remove it if it has no children
      parentNodes.forEach(function (parentNode) {
        if (parentNode.children().empty()) { // Checks if there are no child nodes
          parentNode.remove();
        }
      });

      // To release the node from the parent, alt + shift + click on the node.
    }

    // console.log(`AFTER assignedParent id: ${assignedParent.id()}, assignedParentChildren: ${assignedParent.children()}` )

  });


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


  // * Fetches data from the JSON file, processes it, and loads it into the Cytoscape instance.
  // * This integrated function appends a timestamp to bypass caching, fetches the JSON data,
  // * processes the data with `assignMissingLatLng()`, clears existing elements, adds the new ones,
  // * applies the "cola" layout, removes specific nodes, and sets up expand/collapse functionality.   

  fetchAndLoadData()

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


  var shiftKeyDown = false;
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

  var altKeyDown = false;
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

  var ctrlKeyDown = false;
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
  // editor mode true - Shift + click/tap to add a new node
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


  cy.on("click", "node", async function (event) {
    const node = event.target;
    nodeClicked = true;

    console.info("Node clicked:", node.id());
    console.info("isPanel01Cy:", isPanel01Cy);
    console.info("nodeClicked:", nodeClicked);
    console.info("edgeClicked:", edgeClicked);
    console.info("isEdgeHandlerActive:", isEdgeHandlerActive);

    // Fetch environments and log details
    const environments = await getEnvironments(event);
    console.info("Environments:", environments);

    cytoTopologyJson = environments["EnvCyTopoJsonBytes"]
    clabServerAddress = environments["clab-server-address"]

    // Ignore the click event if edge handler is active
    if (isEdgeHandlerActive) {
      return;
    }

    const originalEvent = event.originalEvent;
    const extraData = node.data("extraData");
    const isNodeInEditMode = node.data("editor") === "true";
    const checkboxChecked = setupCheckboxListener('#viewport-drawer-clab-editor-content-01 .checkbox-input');

    if (checkboxChecked) {
      // Handle node modification actions based on keyboard modifiers
      switch (true) {
        case originalEvent.ctrlKey && node.isChild():
          console.info(`Orphaning node: ${node.id()} from parent: ${node.parent().id()}`);
          node.move({ parent: null });
          break;

        case originalEvent.shiftKey:
          console.info("Starting edge creation from node:", extraData.longname);
          isEdgeHandlerActive = true;
          eh.start(node);
          showPanelNodeEditor(node);
          break;

        case originalEvent.altKey && isNodeInEditMode:
          console.info("Deleting node:", extraData.longname);
          deleteNodeToEditorToFile(node);
          break;
      }
    }

    // Handle actions for editor nodes
    if (isNodeInEditMode) {
      showPanelNodeEditor(node);
    } else {
      // Handle actions for non-editor nodes
      switch (true) {

        case originalEvent.ctrlKey: { // Ctrl + Click to connect to SSH
          console.info("Connecting to SSH for node:", extraData.longname);
          globalSelectedNode = extraData.longname;
          nodeActionConnectToSSH(event);
          break;
        }

        case originalEvent.shiftKey && node.parent().empty() && !node.isParent(): {  // Shift + Click to create a new parent
          console.info("Creating a new parent node");
          createNewParent({ nodeToReparent: node, createDummyChild: false });
          break;
        }

        // case originalEvent.shiftKey && node.isParent(): // Shift + Click to edit an existing parent
        case node.isParent(): // Shift + Click to edit an existing parent

          {
            console.info("Editing existing parent node");
            const currentParentId = node.id();  // Get the current parent ID
            const nodeEditorParentPanel = document.getElementById("panel-node-editor-parent");
            if (nodeEditorParentPanel) {
              nodeEditorParentPanel.style.display = "block";
              document.getElementById("panel-node-editor-parent-graph-group-id").textContent = currentParentId;
              document.getElementById("panel-node-editor-parent-graph-group").value = currentParentId.split(":")[0];
              document.getElementById("panel-node-editor-parent-graph-level").value = currentParentId.split(":")[1];
            }
          }
          break;

        case originalEvent.altKey && node.parent() && !node.isParent(): { // Alt + Click to orphaning a child node
          console.info("Orphaning child node");
          console.info("node data: ", node.data("topoViewerRole"));
          orphaningNode(node)
          if (node.data("topoViewerRole") == "dummyChild") {
            node.remove()
          }
          break;
        }

        case (node.data("topoViewerRole") == "textbox"): {
          break;
        }

        case (node.data("topoViewerRole") == "dummyChild"): {
          break;
        }

        case !originalEvent.altKey && !originalEvent.ctrlKey && !node.isParent(): {
          // Toggle panel-node display and update content
          const panelOverlays = document.getElementsByClassName("panel-overlay");
          Array.from(panelOverlays).forEach(panel => panel.style.display = "none");

          const panelNode = document.getElementById("panel-node");
          panelNode.style.display = (panelNode.style.display === "none") ? "block" : "none";

          document.getElementById("panel-node-name").textContent = extraData.longname;
          document.getElementById("panel-node-kind").textContent = extraData.kind;
          document.getElementById("panel-node-mgmtipv4").textContent = extraData.mgmtIpv4Addresss;
          document.getElementById("panel-node-mgmtipv6").textContent = extraData.mgmtIpv6Address;
          document.getElementById("panel-node-fqdn").textContent = extraData.fqdn;
          document.getElementById("panel-node-topoviewerrole").textContent = node.data("topoViewerRole");
          document.getElementById("panel-node-state").textContent = node.data("state");
          document.getElementById("panel-node-image").textContent = node.data("image");

          globalSelectedNode = extraData.longname;
          console.info("Global selected node:", globalSelectedNode);

          appendMessage(`isPanel01Cy: ${isPanel01Cy}`);
          appendMessage(`nodeClicked: ${nodeClicked}`);

          break;
        }
        default:
          break;
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
    console.log("clickedEdge:", clickedEdge)
    console.log("clickedEdge.data:", clickedEdge.data)
    console.log("clickedEdge.data.source:", clickedEdge.data("source"))
    console.log("clickedEdge.data.target:", clickedEdge.data("target"))


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


      // set selected edge-id to global variable
      globalSelectedEdge = clickedEdge.data("id")

      console.log(`"edgeClicked: " ${globalSelectedEdge}`);
      appendMessage(`"edgeClicked: " ${edgeClicked}`);

      console.log("clickedEdge.data.source 2nd:", clickedEdge.data("source"))
      console.log("clickedEdge.data.target 2nd:", clickedEdge.data("target"))

      document.getElementById("panel-link").style.display = "none";
      if (document.getElementById("panel-link").style.display === "none") {
        document.getElementById("panel-link").style.display = "block";
      } else {
        document.getElementById("panel-link").style.display = "none";
      }

      document.getElementById("panel-link-name").innerHTML = `┌ ${clickedEdge.data("source")} :: ${clickedEdge.data("sourceEndpoint")}<br>└ ${clickedEdge.data("target")} :: ${clickedEdge.data("targetEndpoint")}`
      document.getElementById("panel-link-endpoint-a-name").textContent = `${clickedEdge.data("source")} :: ${clickedEdge.data("sourceEndpoint")}`
      // document.getElementById("panel-link-endpoint-a-mac-address").textContent = "getting the MAC address"
      document.getElementById("panel-link-endpoint-b-name").textContent = `${clickedEdge.data("target")} :: ${clickedEdge.data("targetEndpoint")}`
      // document.getElementById("panel-link-endpoint-b-mac-address").textContent = "getting the MAC address"


      document.getElementById("endpoint-a-edgeshark").textContent = `Edgeshark :: ${clickedEdge.data("source")} :: ${clickedEdge.data("sourceEndpoint")}`
      document.getElementById("endpoint-b-edgeshark").textContent = `Edgeshark :: ${clickedEdge.data("target")} :: ${clickedEdge.data("targetEndpoint")}`




      //render sourceSubInterfaces

      let clabSourceSubInterfacesClabData
      if (isVscodeDeployment) {
        try {
          console.log("########################################################### source subInt")
          const response = await sendMessageToVscodeEndpointPost("clab-link-subinterfaces", {
            nodeName: clickedEdge.data("extraData").clabSourceLongName,
            interfaceName: clickedEdge.data("extraData").clabSourcePort
          });
          clabSourceSubInterfacesClabData = response.map(item => item.name); // Output: ["e1-1-1", "e1-1-2"]
          console.log("Source SubInterface list:", clabSourceSubInterfacesClabData);

          if (Array.isArray(clabSourceSubInterfacesClabData) && clabSourceSubInterfacesClabData.length > 0) {
            // Map sub-interfaces with prefix
            const sourceSubInterfaces = clabSourceSubInterfacesClabData
            // Render sub-interfaces
            renderSubInterfaces(sourceSubInterfaces, 'endpoint-a-top', 'endpoint-a-bottom', nodeName);
          } else if (Array.isArray(clabSourceSubInterfacesClabData)) {
            console.info("No sub-interfaces found. The input data array is empty.");
            renderSubInterfaces(null, 'endpoint-a-top', 'endpoint-a-bottom', nodeName);
          } else {
            console.info("No sub-interfaces found. The input data is null, undefined, or not an array.");
            renderSubInterfaces(null, 'endpoint-a-top', 'endpoint-a-bottom', nodeName);
          }



        } catch (error) {
          console.error("Failed to get SubInterface list:", error);
        }
      } else {
        let clabSourceSubInterfacesArgList = [
          clickedEdge.data("extraData").clabSourceLongName,
          clickedEdge.data("extraData").clabSourcePort
        ];
        clabSourceSubInterfacesClabData = await sendRequestToEndpointGetV3("/clab-link-subinterfaces", clabSourceSubInterfacesArgList);
        console.info("clabSourceSubInterfacesClabData: ", clabSourceSubInterfacesClabData);
        if (Array.isArray(clabSourceSubInterfacesClabData) && clabSourceSubInterfacesClabData.length > 0) {
          // Map sub-interfaces with prefix
          const sourceSubInterfaces = clabSourceSubInterfacesClabData.map(
            item => `${item.ifname}`
          );
          // Render sub-interfaces
          renderSubInterfaces(sourceSubInterfaces, 'endpoint-a-edgeshark', 'endpoint-a-clipboard', nodeName);
          renderSubInterfaces(sourceSubInterfaces, 'endpoint-a-clipboard', 'endpoint-a-bottom', nodeName);
        } else if (Array.isArray(clabSourceSubInterfacesClabData)) {
          console.info("No sub-interfaces found. The input data array is empty.");
          renderSubInterfaces(null, 'endpoint-a-edgeshark', 'endpoint-a-clipboard', nodeName);
          renderSubInterfaces(null, 'endpoint-a-clipboard', 'endpoint-a-bottom', nodeName);
        } else {
          console.info("No sub-interfaces found. The input data is null, undefined, or not an array.");
          renderSubInterfaces(null, 'endpoint-a-edgeshark', 'endpoint-a-clipboard', nodeName);
          renderSubInterfaces(null, 'endpoint-a-clipboard', 'endpoint-a-bottom', nodeName);
        }
      }



      //render targetSubInterfaces
      if (isVscodeDeployment) {
        try {
          console.log("########################################################### target subInt")
          const response = await sendMessageToVscodeEndpointPost("clab-link-subinterfaces", {
            nodeName: clickedEdge.data("extraData").clabTargetLongName,
            interfaceName: clickedEdge.data("extraData").clabTargetPort
          });
          clabTargetSubInterfacesClabData = response.map(item => item.name); // Output: ["e1-1-1", "e1-1-2"]
          console.log("###########################################")
          console.log("Target SubInterface list:", clabTargetSubInterfacesClabData);

          if (Array.isArray(clabTargetSubInterfacesClabData) && clabTargetSubInterfacesClabData.length > 0) {
            // Map sub-interfaces with prefix
            const TargetSubInterfaces = clabTargetSubInterfacesClabData
            // Render sub-interfaces
            renderSubInterfaces(TargetSubInterfaces, 'endpoint-b-top', 'endpoint-b-bottom', nodeName);
          } else if (Array.isArray(clabTargetSubInterfacesClabData)) {
            console.info("No sub-interfaces found. The input data array is empty.");
            renderSubInterfaces(null, 'endpoint-b-top', 'endpoint-b-bottom', nodeName);
          } else {
            console.info("No sub-interfaces found. The input data is null, undefined, or not an array.");
            renderSubInterfaces(null, 'endpoint-b-top', 'endpoint-b-bottom', nodeName);
          }

        } catch (error) {
          console.error("Failed to get SubInterface list:", error);
        }
      }
      else {
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
      }


      let actualLinkMacPair
      if (isVscodeDeployment) {

        // get Source MAC Address
        try {
          console.log("########################################################### Source MAC Address")
          // const response = await sendMessageToVscodeEndpointPost("clab-link-mac-address", {
          //     nodeName: clickedEdge.data("extraData").clabSourceLongName,
          //     interfaceName: clickedEdge.data("extraData").clabSourcePort
          // });
          // clabSourceMacAddress = response

          clabSourceMacAddress = clickedEdge.data("sourceMac") // aarafat-tag: get source MAC address from the edge data; suplied by the backend socket
          console.log("###########################################")
          console.log("Source MAC address:", clabSourceMacAddress);
          if (clabSourceMacAddress) {
            // render MAC address
            document.getElementById("panel-link-endpoint-a-mac-address").textContent = clabSourceMacAddress
          }
          console.log("clicked-edge-sourceMac", clickedEdge.data("sourceMac"))

          clabSourceMtu = clickedEdge.data("sourceMtu") // aarafat-tag: get source MTU from the edge data; suplied by the backend socket
          console.log("###########################################")
          console.log("Source MAC address:", clabSourceMtu);
          if (clabSourceMtu) {
            // render MAC address
            document.getElementById("panel-link-endpoint-a-mtu").textContent = clabSourceMtu
          }
          console.log("clicked-edge-sourceMtu", clickedEdge.data("sourceMtu"))

          clabSourceType = clickedEdge.data("sourceType") // aarafat-tag: get source MTU from the edge data; suplied by the backend socket
          console.log("###########################################")
          console.log("Source MAC address:", clabSourceType);
          if (clabSourceType) {
            // render MAC address
            document.getElementById("panel-link-endpoint-a-type").textContent = clabSourceType
          }
          console.log("clicked-edge-sourceType", clickedEdge.data("sourceType"))

        } catch (error) {
          console.error("Failed to get SubInterface list:", error);
        }

        // get Target MAC Address
        try {
          console.log("########################################################### Target MAC Address")
          // const response = await sendMessageToVscodeEndpointPost("clab-link-mac-address", {
          //     nodeName: clickedEdge.data("extraData").clabTargetLongName,
          //     interfaceName: clickedEdge.data("extraData").clabTargetPort
          // });
          // clabTargetMacAddress = response

          clabTargetMacAddress = clickedEdge.data("targetMac") // aarafat-tag: get target MAC address from the edge data; suplied by the backend socket
          console.log("###########################################")
          console.log("Target MAC address:", clabTargetMacAddress);
          if (clabTargetMacAddress) {
            // render MAC address
            document.getElementById("panel-link-endpoint-b-mac-address").textContent = clabTargetMacAddress
          }
          console.log("clicked-edge-targetMac", clickedEdge.data("targetMac"))

          clabTargetMtu = clickedEdge.data("targetMtu") // aarafat-tag: get target MTU from the edge data; suplied by the backend socket
          console.log("###########################################")
          console.log("Target MAC address:", clabTargetMtu);
          if (clabTargetMtu) {
            // render MAC address
            document.getElementById("panel-link-endpoint-b-mtu").textContent = clabTargetMtu
          }
          console.log("clicked-edge-targetMtu", clickedEdge.data("targetMtu"))

          clabTargetType = clickedEdge.data("targetType") // aarafat-tag: get target MTU from the edge data; suplied by the backend socket
          console.log("###########################################")
          console.log("Target MAC address:", clabTargetType);
          if (clabTargetType) {
            // render MAC address
            document.getElementById("panel-link-endpoint-b-type").textContent = clabTargetType
          }
          console.log("clicked-edge-targetType", clickedEdge.data("targetType"))

        } catch (error) {
          console.error("Failed to get SubInterface list:", error);
        }


      } else {
        // setting MAC address endpoint-a values by getting the data from clab via /clab-link-mac GET API
        clabLinkMacArgsList = [`${clickedEdge.data("extraData").clabSourceLongName}`, `${clickedEdge.data("extraData").clabTargetLongName}`]
        actualLinkMacPair = await sendRequestToEndpointGetV3("/clab-link-macaddress", clabLinkMacArgsList)


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
      }

      let clabSourceLinkImpairmentClabData
      if (isVscodeDeployment) {
        try {
          // Setting default impairment values for endpoint A
          let clabSourceLinkArgsList = {
            clabSourceLongName: clickedEdge.data("extraData").clabSourceLongName,
            clabSourcePort: clickedEdge.data("extraData").clabSourcePort
          };
          console.log("clabSourceLinkArgsList: ", clabSourceLinkArgsList)
          const response = await sendMessageToVscodeEndpointGet("handlerLinkImpairment", clabSourceLinkArgsList);
          console.log("############### Success from backend:", response);
          // clabSourceLinkImpairmentClabData = JSON.stringify(response)
          clabSourceLinkImpairmentClabData = (response)

        } catch (err) {
          console.error("############### Backend call failed:", err);
        }
      } else {
        // Setting default impairment values for endpoint A
        let clabSourceLinkArgsList = [
          clickedEdge.data("extraData").clabSourceLongName,
          clickedEdge.data("extraData").clabSourcePort
        ];
        clabSourceLinkImpairmentClabData = await sendRequestToEndpointGetV3("/clab-link-impairment", clabSourceLinkArgsList)
      }



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

      // set selected edge-id to global variable
      globalSelectedEdge = clickedEdge.data("id")

      console.log(`"edgeClicked: " ${globalSelectedEdge}`);
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
      // bulmaToast.toast({
      //     message: `Expanded parallel edges for ${groupId}`,
      //     type: "is-warning is-size-6 p-3",
      //     duration: 4000,
      //     position: "top-center",
      //     closeOnClick: true,
      // });

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
      // bulmaToast.toast({
      //     message: `Collapsed parallel edges for ${groupId}`,
      //     type: "is-warning is-size-6 p-3",
      //     duration: 4000,
      //     position: "top-center",
      //     closeOnClick: true,
      // });
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

      // Check if the globalNodeContainerStatusVisibility is true
      if (globalNodeContainerStatusVisibility) {
        // Check if the containerNodeName includes nodeId and containerNodeStatus includes 'healthy'
        if (
          containerNodeName.includes(nodeId) &&
          (containerNodeStatus.includes("Up") ||
            containerNodeStatus.includes("healthy"))
        ) {
          statusGreenNode.show();
          statusRedNode.hide();
          console.info(
            "globalNodeContainerStatusVisibility: " + globalNodeContainerStatusVisibility,
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

async function changeTitle() {
  environments = await getEnvironments();
  globalLabName = await environments["clab-name"]

  console.info("changeTitle() - globalLabName: ", globalLabName)
  document.title = `TopoViewer::${globalLabName}`;
}

async function nodeActionConnectToSSH(event) {
  console.info("nodeActionConnectToSSH: ", globalSelectedNode)
  var routerName = globalSelectedNode

  if (isVscodeDeployment) {
    try {
      const response = await sendMessageToVscodeEndpointPost("clab-node-connect-ssh", routerName);
      console.log("############### response from backend:", response);
    } catch (err) {
      console.error("############### Backend call failed:", err);
    }
  } else {
    try {
      environments = await getEnvironments(event);
      console.info("nodeActionConnectToSSH - environments: ", environments)
      cytoTopologyJson = environments["EnvCyTopoJsonBytes"]
      routerData = findCytoElementByLongname(cytoTopologyJson, routerName)
      console.info("nodeActionConnectToSSH: ", `${globalShellUrl}?RouterID=${routerData["data"]["extraData"]["mgmtIpv4Addresss"]}?RouterName=${routerName}`)
      window.open(`${globalShellUrl}?RouterID=${routerData["data"]["extraData"]["mgmtIpv4Addresss"]}?RouterName=${routerName}`);
    } catch (error) {
      console.error('Error executing restore configuration:', error);
    }
  }
}

async function nodeActionAttachShell(event) {
  console.info("nodeActionAttachShell: ", globalSelectedNode)
  var routerName = globalSelectedNode

  if (isVscodeDeployment) {
    try {
      const response = await sendMessageToVscodeEndpointPost("clab-node-attach-shell", routerName);
      console.log("############### response from backend:", response);
    } catch (err) {
      console.error("############### Backend call failed:", err);
    }
  } else {
    try {
      environments = await getEnvironments(event);
      console.info("nodeActionAttachShell - environments: ", environments)
      cytoTopologyJson = environments["EnvCyTopoJsonBytes"]
      routerData = findCytoElementByLongname(cytoTopologyJson, routerName)
      console.info("nodeActionAttachShell: ", `${globalShellUrl}?RouterID=${routerData["data"]["extraData"]["mgmtIpv4Addresss"]}?RouterName=${routerName}`)
      window.open(`${globalShellUrl}?RouterID=${routerData["data"]["extraData"]["mgmtIpv4Addresss"]}?RouterName=${routerName}`);
    } catch (error) {
      console.error('Error executing restore configuration:', error);
    }
  }
}

async function nodeActionViewLogs(event) {
  console.info("nodeActionViewLogs: ", globalSelectedNode)
  var routerName = globalSelectedNode

  if (isVscodeDeployment) {
    try {
      const response = await sendMessageToVscodeEndpointPost("clab-node-view-logs", routerName);
      console.log("############### response from backend:", response);
    } catch (err) {
      console.error("############### Backend call failed:", err);
    }
  } else {
    try {
      environments = await getEnvironments(event);
      console.info("nodeActionViewLogs - environments: ", environments)
      cytoTopologyJson = environments["EnvCyTopoJsonBytes"]
      routerData = findCytoElementByLongname(cytoTopologyJson, routerName)
      console.info("nodeActionViewLogs: ", `${globalShellUrl}?RouterID=${routerData["data"]["extraData"]["mgmtIpv4Addresss"]}?RouterName=${routerName}`)
      window.open(`${globalShellUrl}?RouterID=${routerData["data"]["extraData"]["mgmtIpv4Addresss"]}?RouterName=${routerName}`);
    } catch (error) {
      console.error('Error executing restore configuration:', error);
    }
  }
}

async function sshCliCommandCopy(event) {
  console.info("nodeActionConnectToSSH: ", globalSelectedNode)
  var routerName = globalSelectedNode
  try {
    environments = await getEnvironments(event);
    console.info("nodeActionConnectToSSH - environments: ", environments)

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

async function nodeActionRemoveFromParent(event) {

  console.log("globalSelectedNode: ", globalSelectedNode)
  // var node = cy.getElementById(globalSelectedNode);

  var node = cy.nodes().filter(ele => ele.data('extraData')?.longname === globalSelectedNode)[0];


  console.log("node: ", node)



  const currentParentId = node.parent().id();
  console.log("currentParentId: ", currentParentId)
  const formerParentNode = cy.getElementById(currentParentId);

  node.move({ parent: null }); // Orphan the child node

  if (formerParentNode.isChildless()) {
    console.info("Removing empty parent node");
    formerParentNode.remove(); // Remove the empty parent node
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
  console.info("linkWireshark - globalSelectedEdge: ", globalSelectedEdge);
  console.info("linkWireshark - option: ", option);
  console.info("linkWireshark - endpoint: ", endpoint);
  console.info("linkWireshark - referenceElementAfterId: ", referenceElementAfterId);

  // Helper function to extract the namespace ID from the response string
  const extractNamespaceId = (namespaceIdStr) => {
    const start = namespaceIdStr.indexOf("[") + 1;
    const end = namespaceIdStr.indexOf("]");
    return namespaceIdStr.slice(start, end);
  };

  // Helper function to copy text to the clipboard and show a toast message
  const copyToClipboard = async (text, successMessage = "Hey, now you can paste the link to your terminal console. 😎") => {
    const toastOptions = {
      message: successMessage,
      type: "is-warning is-size-6 p-3",
      duration: 4000,
      position: "top-center",
      closeOnClick: true,
    };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        bulmaToast.toast(toastOptions);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        bulmaToast.toast(toastOptions);
        document.body.removeChild(textArea);
      }
    } catch (error) {
      console.error("Error copying text to clipboard:", error);
    }
  };

  const edgeId = globalSelectedEdge;

  console.log("edgeId: ", edgeId);

  try {

    let environments
    let deploymentType
    let cytoTopologyJson
    let edgeData
    let clabUser
    let edgesharkHostUrl
    let clabServerAddress
    let clabSourceLongName
    let clabSourcePort
    let clabTargetLongName
    let clabTargetPort

    if (isVscodeDeployment) {

      // call backend to get hostname

      environments = await getEnvironments(event);
      console.info("linkWireshark - environments: ", environments);

      // edgesharkHostUrl = await sendMessageToVscodeEndpointPost("clab-host-get-hostname", routerName);
      // console.log("############### endpoint clab-host-get-hostname response from backend:", edgesharkHostUrl);

      edgesharkHostUrl = environments["clab-allowed-hostname01"] || environments["clab-allowed-hostname"]; // used for edgeshark
      console.log("############### endpoint clab-host-get-hostname response from backend:", edgesharkHostUrl);

      cytoTopologyJson = environments["EnvCyTopoJsonBytes"];
      edgeData = findCytoElementById(cytoTopologyJson, edgeId);
      console.log("edgeData: ", edgeData);

      clabSourceLongName = edgeData.data.extraData.clabSourceLongName; // used for edgeshark
      console.log("edgeData.data.extraData.clabSourceLongName: ", clabSourceLongName);

      clabSourcePort = edgeData.data.extraData.clabSourcePort; // used for edgeshark
      console.log("edgeData.data.extraData.clabSourcePort: ", clabSourcePort);

      clabTargetLongName = edgeData.data.extraData.clabTargetLongName; // used for edgeshark
      console.log("edgeData.data.extraData.clabTargetLongName: ", clabTargetLongName);

      clabTargetPort = edgeData.data.extraData.clabTargetPort; // used for edgeshark
      console.log("edgeData.data.extraData.clabTargetPort: ", clabTargetPort);


    } else {
      environments = await getEnvironments(event);
      console.info("linkWireshark - environments: ", environments);

      deploymentType = environments["deployment-type"];
      cytoTopologyJson = environments["EnvCyTopoJsonBytes"];
      edgeData = findCytoElementById(cytoTopologyJson, edgeId);

      console.info("linkWireshark- edgeData: ", edgeData);
      console.info("linkWireshark- edgeSource: ", edgeData.data.source);

      clabUser = edgeData.data.extraData.clabServerUsername;
      edgesharkHostUrl = environments["clab-allowed-hostname01"] || environments["clab-allowed-hostname"]; // used for edgeshark
      clabServerAddress = environments["clab-server-address"]; // used for edgeshark
      clabSourceLongName = edgeData.data.extraData.clabSourceLongName; // used for edgeshark
      clabSourcePort = edgeData.data.extraData.clabSourcePort; // used for edgeshark
      clabTargetLongName = edgeData.data.extraData.clabTargetLongName; // used for edgeshark
      clabTargetPort = edgeData.data.extraData.clabTargetPort; // used for edgeshark
    }

    let wiresharkHref, baseUrl, urlParams, netNsResponse, netNsId, wiresharkSshCommand;

    switch (option) {
      case "app":
        if (endpoint === "source") {
          wiresharkHref = `clab-capture://${clabUser}@${clabServerAddress}?${clabSourceLongName}?${clabSourcePort}`;
        } else if (endpoint === "target") {
          wiresharkHref = `clab-capture://${clabUser}@${clabServerAddress}?${clabTargetLongName}?${clabTargetPort}`;
        }
        console.info("linkWireshark- wiresharkHref: ", wiresharkHref);
        window.open(wiresharkHref);
        break;

      case "edgeSharkInterface": {
        baseUrl = `packetflix:ws://${edgesharkHostUrl}:5001/capture?`;
        if (endpoint === "source") {
          if (isVscodeDeployment) {
            try {
              const response = await sendMessageToVscodeEndpointPost("clab-link-capture", {
                nodeName: clabSourceLongName,
                interfaceName: clabSourcePort
              });
              console.info("External URL opened successfully:", response);
            } catch (error) {
              console.error("Failed to open external URL:", error);
            }
          } else {
            netNsResponse = await sendRequestToEndpointGetV3("/clab-node-network-namespace", [clabSourceLongName]);
            netNsId = extractNamespaceId(netNsResponse.namespace_id);
            console.info("linkWireshark - netNsSource: ", netNsId);

            urlParams = `container={"netns":${netNsId},"network-interfaces":["${clabSourcePort}"],"name":"${clabSourceLongName.toLowerCase()}","type":"docker","prefix":""}&nif=${clabSourcePort}`;
          }
        } else if (endpoint === "target") {
          if (isVscodeDeployment) {
            try {
              const response = await sendMessageToVscodeEndpointPost("link-capture", {
                nodeName: clabTargetLongName,
                interfaceName: clabTargetPort
              });
              console.info("External URL opened successfully:", response);
            } catch (error) {
              console.error("Failed to open external URL:", error);
            }
          } else {
            netNsResponse = await sendRequestToEndpointGetV3("/clab-node-network-namespace", [clabTargetLongName]);
            netNsId = extractNamespaceId(netNsResponse.namespace_id);
            console.info("linkWireshark - netNsTarget: ", netNsId);
            urlParams = `container={"netns":${netNsId},"network-interfaces":["${clabTargetPort}"],"name":"${clabTargetLongName.toLowerCase()}","type":"docker","prefix":""}&nif=${clabTargetPort}`;
          }
        }
        const edgeSharkHref = baseUrl + urlParams;
        console.info("linkWireshark - edgeSharkHref: ", edgeSharkHref);

        // window.open(edgeSharkHref);

        if (isVscodeDeployment) {
        } else {
          window.open(edgeSharkHref);
        }
        break;
      }

      case "edgeSharkSubInterface":
        if (referenceElementAfterId === "endpoint-a-top" || referenceElementAfterId === "endpoint-b-top") {
          baseUrl = `packetflix:ws://${edgesharkHostUrl}:5001/capture?`;
          if (isVscodeDeployment) {
            if (referenceElementAfterId === "endpoint-a-top") {
              console.info("linkWireshark - endpoint-b-subInterface");
              try {
                const response = await sendMessageToVscodeEndpointPost("clab-link-capture", {
                  nodeName: clabSourceLongName,
                  interfaceName: clabSourcePort
                });
                console.info("External URL opened successfully:", response);
              } catch (error) {
                console.error("Failed to open external URL:", error);
              }
            } else if (referenceElementAfterId === "endpoint-b-top") {
              console.info("linkWireshark - endpoint-b-subInterface");
              try {
                const response = await sendMessageToVscodeEndpointPost("link-capture", {
                  nodeName: clabTargetLongName,
                  interfaceName: clabTargetPort
                });
                console.info("External URL opened successfully:", response);
              } catch (error) {
                console.error("Failed to open external URL:", error);
              }

            }

          } else {
            if (referenceElementAfterId === "endpoint-a-edgeshark") {
              netNsResponse = await sendRequestToEndpointGetV3("/clab-node-network-namespace", [clabSourceLongName]);
              netNsId = extractNamespaceId(netNsResponse.namespace_id);
              urlParams = `container={"netns":${netNsId},"network-interfaces":["${endpoint}"],"name":"${clabSourceLongName.toLowerCase()}","type":"docker","prefix":""}&nif=${endpoint}`;
            } else {
              console.info("linkWireshark - endpoint-b-edgeshark");
              netNsResponse = await sendRequestToEndpointGetV3("/clab-node-network-namespace", [clabTargetLongName]);
              netNsId = extractNamespaceId(netNsResponse.namespace_id);
              urlParams = `container={"netns":${netNsId},"network-interfaces":["${endpoint}"],"name":"${clabSourceLongName.toLowerCase()}","type":"docker","prefix":""}&nif=${endpoint}`;
            }
            const edgeSharkHref = baseUrl + urlParams;
            console.info("linkWireshark - edgeSharkHref: ", edgeSharkHref);
            window.open(edgeSharkHref);
          }

        } else if (referenceElementAfterId === "endpoint-a-clipboard" || referenceElementAfterId === "endpoint-b-clipboard") {
          console.info(`linkWireshark - ${referenceElementAfterId}`);
          const targetLongName = referenceElementAfterId === "endpoint-a-clipboard" ? clabSourceLongName : clabTargetLongName;
          const targetPort = referenceElementAfterId === "endpoint-a-clipboard" ? clabSourcePort : clabTargetPort;

          // Both container and colocated use the same command in this case.
          wiresharkSshCommand = `ssh ${clabUser}@${environments["clab-allowed-hostname"]} "sudo -S /sbin/ip netns exec ${targetLongName} tcpdump -U -nni ${endpoint} -w -" | wireshark -k -i -`;
          await copyToClipboard(wiresharkSshCommand);
        }
        break;

      case "copy":
        if (endpoint === "source") {
          wiresharkSshCommand = `ssh ${clabUser}@${environments["clab-allowed-hostname"]} "sudo -S /sbin/ip netns exec ${clabSourceLongName} tcpdump -U -nni ${clabSourcePort} -w -" | wireshark -k -i -`;
        } else if (endpoint === "target") {
          wiresharkSshCommand = `ssh ${clabUser}@${environments["clab-allowed-hostname"]} "sudo -S /sbin/ip netns exec ${clabTargetLongName} tcpdump -U -nni ${clabTargetPort} -w -" | wireshark -k -i -`;
        }
        console.info("linkWireshark- wiresharkSshCommand: ", wiresharkSshCommand);
        await copyToClipboard(wiresharkSshCommand);
        break;

      default:
        console.warn("linkWireshark - Unknown option provided:", option);
        break;
    }
  } catch (error) {
    console.error("Error executing linkWireshark configuration:", error);
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


  console.log("###### createTextboxNode")




  // globalCytoscapeLeafletLeaf instance map to fit nodes
  globalCytoscapeLeafletLeaf.fit();
  console.log("globalCytoscapeLeafletLeaf.fit()")
}

function viewportButtonsAddNodeTextbox(cy) {

  // Filter existing nodes with TopoViewerRole === 'textbox'
  const textBoxNodes = cy.nodes().filter(node => node.data('topoViewerRole') === 'textbox');

  // Calculate the new count (length + 1)
  const newCount = textBoxNodes.length + 1;

  // Format the new id as "textbox-XX" with a two-digit counter (e.g., textbox-01, textbox-02, etc.)
  const newId = `textbox-${newCount.toString().padStart(2, '0')}`;

  createTextboxNode(cy, newId, { x: 120, y: 200 });
}


function viewportButtonsAddGroup() {
  console.log("###### viewportButtonsAddGroup")

  const newParentId = createNewParent({ createDummyChild: true });
  console.log("Parent node created:", newParentId);
  cy.fit();
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

      // aarafat-tag: old Enable tick box
      // viewportDrawerGeoMapResetStart = document.getElementById("viewport-drawer-geo-map-reset-start")
      // viewportDrawerGeoMapResetStart.style.display = "block"

      // console.info(document.getElementById("viewport-drawer-geo-map"))
      // console.info(document.getElementById("viewport-drawer-geo-map-reset-start"))

      viewportDrawerLayoutGeoMap()

    } else if (selectedOption === "Preset") {
      console.info("Preset algo selected");

      var layoutAlgoPanels = document.getElementsByClassName("layout-algo");
      // Loop through each element and set its display to 'none'
      for (var i = 0; i < layoutAlgoPanels.length; i++) {
        layoutAlgoPanels[i].style.display = "none";
      }
      viewportDrawerPreset()
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
  if (globalLinkEndpointVisibility) {
    cy.edges().forEach(function (edge) {
      edge.style("text-opacity", 0);
      edge.style("text-background-opacity", 0);
      globalLinkEndpointVisibility = false;
    });

  } else {
    cy.edges().forEach(function (edge) {
      edge.style("text-opacity", 1);
      edge.style("text-background-opacity", 0.7);
      globalLinkEndpointVisibility = true;
    });
  }
}

function viewportButtonContainerStatusVisibility() {
  if (globalNodeContainerStatusVisibility) {
    globalNodeContainerStatusVisibility = false;
    // console.info(
    //     "globalNodeContainerStatusVisibility: " + globalNodeContainerStatusVisibility,
    // );
    // appendMessage(
    //     "globalNodeContainerStatusVisibility: " + globalNodeContainerStatusVisibility,
    // );
    // bulmaToast.toast({
    //     message: `Alright, mission control, we're standing down. 🛑🔍 Container status probing aborted. Stay chill, folks. 😎👨‍💻`,
    //     type: "is-warning is-size-6 p-3",
    //     duration: 4000,
    //     position: "top-center",
    //     closeOnClick: true,
    // });
  } else {
    globalNodeContainerStatusVisibility = true;
    // console.info(
    //     "globalNodeContainerStatusVisibility: " + globalNodeContainerStatusVisibility,
    // );
    // appendMessage(
    //     "globalNodeContainerStatusVisibility: " + globalNodeContainerStatusVisibility,
    // );
    // bulmaToast.toast({
    //     message: `🕵️‍♂️ Bro, we're currently on a mission to probe that container status! Stay tuned for the results. 🔍🚀👨‍💻`,
    //     type: "is-warning is-size-6 p-3",
    //     duration: 4000,
    //     position: "top-center",
    //     closeOnClick: true,
    // });
  }
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

  // bulmaToast.toast({
  //     message: `Brace yourselves for a quick snapshot, folks! 📸 Capturing the viewport in 3... 2... 1... 🚀💥`,
  //     type: "is-warning is-size-6 p-3",
  //     duration: 2000,
  //     position: "top-center",
  //     closeOnClick: true,
  // });
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
  console.log("globalCytoscapeLeafletMap", globalCytoscapeLeafletMap)

  globalCytoscapeLeafletLeaf.cy.container().style.pointerEvents = 'none';
  globalCytoscapeLeafletLeaf.setZoomControlOpacity("");
  globalCytoscapeLeafletLeaf.map.dragging.enable();
}

function viewportButtonsGeoMapEdit() {
  console.log("viewportButtonsGeoMapEdit clicked..")
  console.log("globalCytoscapeLeafletMap", globalCytoscapeLeafletMap)

  globalCytoscapeLeafletLeaf.cy.container().style.pointerEvents = '';
  globalCytoscapeLeafletLeaf.setZoomControlOpacity(0.5);
  globalCytoscapeLeafletLeaf.map.dragging.disable();
}


async function viewportButtonsReloadTopo() {
  if (isVscodeDeployment) {
    try {
      const response = await sendMessageToVscodeEndpointPost("reload-viewport", "Empty Payload");
      console.log("############### response from backend:", response);
      sleep(1000)
      // Re-Init load data.
      fetchAndLoadData()

    } catch (err) {
      console.error("############### Backend call failed:", err);
    }
  }
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

// /**
//  * Dynamically inserts an inline SVG and modifies its color.
//  * @param {string} containerId - The ID of the container where the SVG will be added.
//  * @param {string} color - The color to apply to the SVG's `fill` attribute.
//  */
// function insertAndColorSvg(containerId, color) {
//     const container = document.getElementById(containerId);

//     if (!container) {
//         console.error(`Container with ID ${containerId} not found.`);
//         return;
//     }

//     // 	<svg width="110" height="25" viewBox="0 0 170 40" fill="none" xmlns="http://www.w3.org/2000/svg">
//     // 	<path d="M117.514 1.21646L117.514 38.7835H123.148L123.148 1.21646H117.514ZM57.3221 0.57473C46.3463 0.574681 37.8303 8.56332 37.8303 20C37.8303 31.9517 46.3463 39.4255 57.3221 39.4253C68.2979 39.4251 76.8314 31.9517 76.8139 20C76.798 9.16418 68.2979 0.574779 57.3221 0.57473ZM71.1901 20C71.1901 28.4666 64.9812 34.0774 57.3221 34.0774C49.663 34.0774 43.4541 28.4666 43.4541 20C43.4541 11.687 49.663 5.92265 57.3221 5.92265C64.9812 5.92265 71.1901 11.687 71.1901 20ZM0 3.39001e-06V38.7835H5.74992L5.74992 13.1531L35.6298 40V31.9591L0 3.39001e-06ZM81.0513 20L101.961 38.7836H110.345L89.4038 20L110.345 1.21644H101.961L81.0513 20ZM170 38.7835H163.802L159.27 30.4644H138.742L134.209 38.7835H128.011L135.517 24.9176H156.322L145.948 5.64789L149.006 0L149.006 3.76291e-05L149.006 0L170 38.7835Z" fill="#005AFF"/>
//     // </svg>

//     // // Define the SVG content
//     // const svgContent = `
// 	// 	<svg width="110" height="25" viewBox="0 0 170 40" fill="none" xmlns="http://www.w3.org/2000/svg">
// 	// 		<path d="M117.514 1.21646L117.514 38.7835H123.148L123.148 1.21646H117.514ZM57.3221 0.57473C46.3463 0.574681 37.8303 8.56332 37.8303 20C37.8303 31.9517 46.3463 39.4255 57.3221 39.4253C68.2979 39.4251 76.8314 31.9517 76.8139 20C76.798 9.16418 68.2979 0.574779 57.3221 0.57473ZM71.1901 20C71.1901 28.4666 64.9812 34.0774 57.3221 34.0774C49.663 34.0774 43.4541 28.4666 43.4541 20C43.4541 11.687 49.663 5.92265 57.3221 5.92265C64.9812 5.92265 71.1901 11.687 71.1901 20ZM0 3.39001e-06V38.7835H5.74992L5.74992 13.1531L35.6298 40V31.9591L0 3.39001e-06ZM81.0513 20L101.961 38.7836H110.345L89.4038 20L110.345 1.21644H101.961L81.0513 20ZM170 38.7835H163.802L159.27 30.4644H138.742L134.209 38.7835H128.011L135.517 24.9176H156.322L145.948 5.64789L149.006 0L149.006 3.76291e-05L149.006 0L170 38.7835Z" fill="#005AFF"/>
// 	// 	</svg>
// 	// `;
//     const svgContent = `
//         <?xml version="1.0" encoding="utf-8"?>
//             <svg viewBox="220.222 137.943 81.8 87.413" xmlns="http://www.w3.org/2000/svg">
//             <path id="containerlab_export_white_ink-liquid" data-name="containerlab export white ink-liquid" class="cls-3" d="M 253.422 189.556 C 253.022 189.756 252.122 190.256 251.422 190.756 C 250.222 191.656 248.722 191.956 246.822 191.456 C 245.522 191.156 245.422 191.456 246.322 193.556 C 252.022 205.956 269.422 206.456 275.522 194.356 C 276.922 191.656 276.722 191.156 274.822 191.656 C 273.222 192.056 272.122 191.856 270.522 190.656 C 268.422 189.056 265.622 189.056 264.122 190.656 C 262.622 192.256 259.522 192.156 257.722 190.456 C 256.722 189.456 254.622 189.056 253.422 189.556" style="stroke-width: 0px; fill: rgb(255, 255, 255); stroke: rgb(255, 255, 255);" transform="matrix(1, 0, 0, 1, 0, -2.842170943040401e-14)"/>
//             <path class="cls-5" d="M 297.122 153.156 L 289.322 148.756 L 271.922 138.656 C 270.222 137.656 268.322 137.756 266.622 138.656 C 265.022 139.656 264.022 141.356 264.022 143.256 L 264.322 159.656 L 264.322 164.256 C 264.322 164.256 264.322 166.256 264.322 166.256 C 264.322 166.956 264.822 167.656 265.522 167.856 C 274.022 170.056 280.222 177.956 280.222 186.456 C 280.222 194.956 271.622 205.656 261.022 205.656 C 250.422 205.656 241.822 197.056 241.822 186.456 C 241.822 175.856 247.222 170.656 255.222 168.156 L 256.822 167.756 C 257.622 167.656 258.222 166.956 258.222 166.156 L 258.222 163.356 C 258.222 163.356 258.222 161.156 258.222 161.156 L 258.222 143.156 C 258.222 141.256 257.222 139.556 255.622 138.656 C 254.022 137.756 252.022 137.756 250.422 138.656 L 242.822 143.056 L 225.122 153.256 C 222.122 155.056 220.222 158.256 220.222 161.756 L 220.222 197.656 C 220.222 201.156 222.122 204.456 225.122 206.156 L 256.222 224.056 C 257.722 224.956 259.422 225.356 261.122 225.356 C 262.822 225.356 264.522 224.956 266.022 224.056 L 297.122 206.156 C 300.122 204.356 302.022 201.156 302.022 197.656 L 302.022 161.756 C 302.022 158.256 300.122 154.956 297.122 153.256 L 297.122 153.156 Z M 298.822 197.656 C 298.822 199.956 297.522 202.156 295.522 203.356 L 264.422 221.256 C 262.422 222.456 259.822 222.456 257.822 221.256 L 226.722 203.356 C 224.722 202.156 223.422 199.956 223.422 197.656 L 223.422 161.756 C 223.422 159.456 224.722 157.256 226.722 156.056 L 239.722 148.556 L 251.922 141.456 C 252.822 140.956 253.622 141.256 253.922 141.456 C 254.222 141.656 254.922 142.156 254.922 143.156 L 254.922 164.756 C 254.922 164.756 254.422 164.856 254.422 164.956 C 245.022 167.856 238.622 176.556 238.622 186.456 C 238.622 196.356 248.722 208.956 261.122 208.956 C 273.522 208.956 283.622 198.856 283.622 186.456 C 283.622 174.056 277.122 168.056 267.722 165.056 L 267.722 159.656 C 267.722 159.656 267.422 143.256 267.422 143.256 C 267.422 142.256 268.122 141.756 268.422 141.556 C 268.722 141.356 269.522 141.056 270.422 141.556 L 287.822 151.656 L 295.622 156.056 C 297.622 157.256 298.922 159.456 298.922 161.756 L 298.922 197.656 L 298.822 197.656 Z" style="stroke-width: 0px; fill: rgb(255, 255, 255);" transform="matrix(1, 0, 0, 1, 0, -2.842170943040401e-14)"/>
//             <circle class="cls-1" cx="262.922" cy="186.156" r="1.7" style="stroke-miterlimit: 10; stroke-width: 0.8px; fill: rgb(255, 255, 255); stroke: rgb(255, 255, 255);" transform="matrix(1, 0, 0, 1, 0, -2.842170943040401e-14)"/>
//             <circle class="cls-1" cx="255.322" cy="182.256" r="2.4" style="stroke-miterlimit: 10; stroke-width: 0.8px; fill: rgb(255, 255, 255); stroke: rgb(255, 255, 255);" transform="matrix(1, 0, 0, 1, 0, -2.842170943040401e-14)"/>
//             <circle class="cls-1" cx="260.122" cy="173.956" r="3.4" style="stroke-miterlimit: 10; stroke-width: 0.8px; fill: rgb(255, 255, 255); stroke: rgb(255, 255, 255);" transform="matrix(1, 0, 0, 1, 0, -2.842170943040401e-14)"/>
//         </svg>
// 	`;


//     // Parse the SVG string into a DOM element
//     const parser = new DOMParser();
//     const svgElement = parser.parseFromString(svgContent, 'image/svg+xml').documentElement;

//     // Modify the fill color of the SVG
//     svgElement.querySelector('path').setAttribute('fill', color);

//     // Append the SVG to the container
//     container.innerHTML = '';
//     container.appendChild(svgElement);
// }


function insertAndColorSvg(containerId, color) {
  const container = document.getElementById(containerId);

  if (!container) {
    console.error(`Container with ID ${containerId} not found.`);
    return;
  }

  const svgContent = `
        <svg viewBox="220.222 137.943 81.8 87.413" xmlns="http://www.w3.org/2000/svg">
            <path class="cls-3" d="M 253.422 189.556 ..." fill="white"/>
            <path class="cls-5" d="M 297.122 153.156 ..." fill="white"/>
            <circle class="cls-1" cx="262.922" cy="186.156" r="1.7" fill="white"/>
        </svg>
    `;

  // Parse the SVG string into a DOM element
  const parser = new DOMParser();
  const svgElement = parser.parseFromString(svgContent, 'image/svg+xml').documentElement;

  // Modify the fill color of all <path> elements
  const paths = svgElement.querySelectorAll('path');
  if (paths.length > 0) {
    paths.forEach(path => path.setAttribute('fill', color));
  } else {
    console.error('No <path> elements found in the parsed SVG.');
  }

  // Append the SVG to the container
  container.innerHTML = '';
  container.appendChild(svgElement);
}


// // Call the function during initialization
// document.addEventListener('DOMContentLoaded', () => {
//     insertAndColorSvg('nokia-logo', 'white');
// });


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



/**
 * Loads and applies Cytoscape styles to nodes, edges, and parent nodes based on deployment context,
 * user preferences, and global state flags.
 *
 * This function performs the following operations:
 * 1. Removes any existing styles from all nodes and edges.
 * 2. Detects the user's preferred color scheme (light or dark) and logs the preference along with the current
 *    multi-layer viewport state.
 * 3. Depending on the deployment context:
 *    - If running in VS Code (`isVscodeDeployment` is true), it applies a predefined set of Cytoscape styles.
 *    - Otherwise, it fetches styles from a local JSON file and applies them. If the multi-layer viewport state is active,
 *      a custom SVG background is set for parent nodes.
 * 4. Adjusts edge label opacity if `globalLinkEndpointVisibility` is disabled.
 * 5. If a geographical map is initialized (`globalIsGeoMapInitialized` is true), applies style multipliers to nodes,
 *    edges, and parent nodes to adjust dimensions and font sizes.
 * 6. Restores dynamic styles (if enabled via `globalToggleOnChangeCytoStyle`) and updates socket bindings.
 *
 * @async
 * @function loadCytoStyle
 * @param {cytoscape.Core} cy - The Cytoscape instance to style.
 * @returns {Promise<void>} A promise that resolves once the styles have been applied.
 */
function loadCytoStyle(cy) {
  cy.nodes().removeStyle();
  cy.edges().removeStyle();

  // detect light or dark mode
  const colorScheme = detectColorScheme();
  console.info('The user prefers:', colorScheme);
  console.log("multiLayerViewPortState", multiLayerViewPortState);

  // VS-CODE start 
  let jsonFileUrl;

  // if (colorScheme === "dark") {
  //     jsonFileUrl = window.jsonFileUrlDataCytoStyleDark;
  // } else {
  //     jsonFileUrl = window.jsonFileUrlDataCytoStyleDark;
  // }

  const cytoscapeStylesForVscode = [
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
        // "overlay-padding": "0.3px",
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
        "width": "80px",
        "height": "80x",
        "background-opacity": "0.2",
        "color": "#EBECF0",
        "text-outline-color": "#000000",
        "font-size": "8px",
        "z-index": "1"
      }
    },
    {
      selector: "node:parent.top-center",
      style: {
        "text-halign": "center",
        "text-valign": "top",
        "text-margin-y": -2,
      }
    },
    {
      selector: "node:parent.top-left",
      style: {
        "text-halign": "right",
        "text-valign": "top",
        "text-margin-x": (ele) => {
          width = ele.outerWidth();
          return -width
        },
        "text-margin-y": -2,
      }
    }
    ,
    {
      selector: "node:parent.top-right",
      style: {
        "text-halign": "left",
        "text-valign": "top",
        "text-margin-x": (ele) => {
          width = ele.outerWidth();
          return width
        },
        "text-margin-y": -2,
      },
    },
    {
      selector: "node:parent.bottom-center",
      style: {
        "text-halign": "center",
        "text-valign": "bottom",
        "text-margin-y": 2,
      }
    },
    {
      selector: "node:parent.bottom-left",
      style: {
        "text-halign": "right",
        "text-valign": "bottom",
        "text-margin-x": (ele) => {
          width = ele.outerWidth();
          return -width
        },
        "text-margin-y": 2,
      }
    },
    {
      selector: "node:parent.bottom-right",
      style: {
        "text-halign": "left",
        "text-valign": "bottom",
        "text-margin-x": (ele) => {
          width = ele.outerWidth();
          return width
        },
        "text-margin-y": 2,
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
      "selector": "node[topoViewerRole=\"dummyChild\"]",
      "style": {
        "width": "14",
        "height": "14",
      }
    },

    {
      "selector": "node[topoViewerRole=\"router\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("pe", "#001135")}`,
        "background-fit": "cover",
        "background-clip": "none"
      }
    },
    {
      "selector": "node[topoViewerRole=\"default\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("pe", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"pe\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("pe", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"p\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("pe", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"controller\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("controller", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"pon\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("pon", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"dcgw\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("dcgw", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"leaf\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("leaf", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"switch\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("switch", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"rgw\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("rgw", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"super-spine\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("super-spine", "#005AFF")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"spine\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("spine", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"server\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("server", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"bridge\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("bridge", "#001135")}`,
        "background-fit": "cover"
      }
    },
    {
      "selector": "node[topoViewerRole=\"client\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${generateEncodedSVG("client", "#001135")}`,
        "background-fit": "cover"
      }
    },

    {
      "selector": "node[topoViewerRole=\"textbox\"]",
      "style": {
        'background-color': '#000', // the color won't be visible since opacity is 0
        'background-opacity': 0,
        "width": 40,
        "height": 40,
        "shape": "round-rectangle",
        "label": "",
        "text-outline-color": "#000000",
        "text-outline-width": "0.3px",
        "text-background-color": "#000000",
        "text-background-opacity": 1,
      },
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
        "width": "14",
        "height": "14",
        "background-image": `${window.imagesUrl}/clab-pon-dark-blue.png`,
        "background-fit": "cover",
        "border-width": "0.5px",
        "border-color": "#32CD32"
      }
    },
    {
      "selector": "node[topoViewerRole=\"dcgw\"][editor=\"true\"]",
      "style": {
        "width": "14",
        "height": "14",
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
        "width": "14",
        "height": "14",
        "background-image": `${window.imagesUrl}/clab-spine-dark-blue.png`,
        "background-fit": "cover",
        "border-width": "0.5px",
        "border-color": "#32CD32"
      }
    },
    {
      "selector": "node[topoViewerRole=\"spine\"][editor=\"true\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${window.imagesUrl}/clab-spine-light-blue.png`,
        "background-fit": "cover",
        "border-width": "0.5px",
        "border-color": "#32CD32"
      }
    },
    {
      "selector": "node[topoViewerRole=\"server\"][editor=\"true\"]",
      "style": {
        "width": "14",
        "height": "14",
        "background-image": `${window.imagesUrl}/clab-server-dark-blue.png`,
        "background-fit": "cover",
        "border-width": "0.5px",
        "border-color": "#32CD32"
      }
    },
    {
      "selector": "node[topoViewerRole=\"bridge\"][editor=\"true\"]",
      "style": {
        "width": "14",
        "height": "14",
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

        // 'source-text-background-color': '#CACBCC',
        // 'target-text-background-color': '#00CBCC',

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
    }
  ]

  if (isVscodeDeployment) {
    // Apply the styles defined in the constant
    cy.style().fromJson(cytoscapeStylesForVscode).update(); // cytoscapeStylesForVscode is defined in the cytoscapeStyle.js file
    console.log("Cytoscape styles applied successfully.");

  } else {
    // // Load and apply Cytoscape styles from cy-style.json using fetch
    if (colorScheme == "light") {
      fetch("css/cy-style-dark.json")
        .then((response) => response.json())
        .then((styles) => {
          cy.style().fromJson(styles).update();
          if (multiLayerViewPortState) {
            // Initialize Cytoscape (assuming cy is already created)
            parentNodeSvgBackground(cy, svgString);
          }
        })
        .catch((error) => {
          console.error(
            "Oops, we hit a snag! Couldnt load the cyto styles, bro.",
            error,
          );
          appendMessage(
            `Oops, we hit a snag! Couldnt load the cyto styles, bro.: ${error}`,
          );
        });

    } else if (colorScheme == "dark") {
      fetch("css/cy-style-dark.json")
        .then((response) => response.json())
        .then((styles) => {
          console.log("globalIsGeoMapInitialized", globalIsGeoMapInitialized);
          cy.style().fromJson(styles).update();
          if (multiLayerViewPortState) {
            // Initialize Cytoscape (assuming cy is already created)
            parentNodeSvgBackground(cy, svgString);
          }
        })
        .catch((error) => {
          console.error(
            "Oops, we hit a snag! Couldnt load the cyto styles, bro.",
            error,
          );
          appendMessage(
            `Oops, we hit a snag! Couldnt load the cyto styles, bro.: ${error}`,
          );
        });
    }
  }


  avoidEdgeLabelOverlap(cy);

  if (!globalLinkEndpointVisibility) { // doing this because default is true and text-opacity is 1 and text-background-opacity is 0.7
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
  if (globalIsGeoMapInitialized) {
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

  // Restore dynamic styles only if enabled.
  if (globalToggleOnChangeCytoStyle) {
    restoreDynamicStyles();
  }

  // Ensure the socket event binding reflects the current toggle.
  updateSocketBinding();
}

/**
 * Toggles the multi-layer viewport state and reloads the Cytoscape style.
 *
 * This function checks the current state of `multiLayerViewPortState`. If it is `false`, the state is set to `true`;
 * otherwise, it is set to `false`. After toggling, it logs the new state to the console and calls `loadCytoStyle(cy)`
 * to update the Cytoscape style accordingly.
 *
 * @function viewportButtonsMultiLayerViewPortToggle
 * @returns {void}
 */
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

/**
 * Updates node positions and sends the topology data to the backend.
 *
 * This asynchronous function iterates over each node in the provided Cytoscape instance (`cy`),
 * updating each node's "position" property with its current coordinates. If a node contains extra
 * label data under `node.data.extraData.labels`, it also updates the "graph-posX" and "graph-posY" labels
 * with the node's current x and y positions, respectively. The updated nodes are then sent to a backend
 * endpoint ("topo-viewport-save") via the `sendMessageToVscodeEndpointPost` function, but only if the
 * deployment is detected to be within VS Code.
 *
 * Note: If the global Cytoscape instance (`window.cy`) is not defined, the function logs an error and
 * returns without performing further operations.
 *
 * @async
 * @function viewportButtonsSaveTopo
 * @param {cytoscape.Core} cy - The Cytoscape instance containing the graph elements.
 * @returns {Promise<void>} A promise that resolves once the topology data has been processed and sent.
 */
async function viewportButtonsSaveTopo(cy) {
  if (isVscodeDeployment) {
    try {
      console.log("viewportButtonsSaveTopo triggered");
      // Ensure our Cytoscape instance is available
      if (!window.cy) {
        console.error('Cytoscape instance "cy" is not defined.');
        return;
      }
      // Process nodes: update each node's "position" property with the current position.
      const updatedNodes = cy.nodes().map(function (node) {
        const nodeJson = node.json();

        nodeJson.position = node.position(); // Update position property
        // Check if extraData and labels exist before modifying
        if (nodeJson.data?.extraData?.labels) {
          nodeJson.data.extraData.labels["graph-posX"] = nodeJson.position.x.toString();
          nodeJson.data.extraData.labels["graph-posY"] = nodeJson.position.y.toString();
        }

        nodeJson.parent = node.parent().id(); // Update parent property
        // Check if extraData and labels exist before modifying
        if (nodeJson.data?.extraData?.labels) {
          if (nodeJson.parent) {
            nodeJson.data.extraData.labels["graph-group"] = nodeJson.parent.split(":")[0]
            nodeJson.data.extraData.labels["graph-level"] = nodeJson.parent.split(":")[1];

            console.log("### nodeJson.parent", cy.getElementById(nodeJson.parent).classes())
            const validLabelClasses = [
              "top-center",
              "top-left",
              "top-right",
              "bottom-center",
              "bottom-left",
              "bottom-right"
            ];

            // Get the parent's classes as array.
            const parentClasses = cy.getElementById(nodeJson.parent).classes();

            // Filter the classes so that only valid entries remain.
            const validParentClasses = parentClasses.filter(cls => validLabelClasses.includes(cls));

            // Assign only the first valid class, or an empty string if none exists.
            // nodeJson.data.extraData.labels["graph-groupLabelPos"] = validParentClasses.length > 0 ? validParentClasses[0] : '';
            nodeJson.data.groupLabelPos = validParentClasses.length > 0 ? validParentClasses[0] : '';

          }
        }

        return nodeJson;
      });

      // Combine nodes into one array (edges could be added here if needed)
      const updatedElements = updatedNodes;

      // Convert the updated elements to a JSON string (pretty printed)
      const jsonString = JSON.stringify(updatedElements, null, 2);


      const response = await sendMessageToVscodeEndpointPost("topo-viewport-save", updatedElements);
      console.log("############### response from backend:", response);
    } catch (err) {
      console.error("############### Backend call failed:", err);
    }
  }
}


/**
 * toggleSocketEdgeUpdates()
 * Flips the globalToggleOnChangeCytoStyle variable and then calls updateSocketBinding()
 * so that the socket event handler is attached or detached accordingly.
 * This function can be bound to a button in your webview.
 */
function viewportButtonsLinkOperState() {
  console.log(`globalToggleOnChangeCytoStyle is now: ${globalToggleOnChangeCytoStyle}`);
  globalToggleOnChangeCytoStyle = !globalToggleOnChangeCytoStyle;
  // if (globalToggleOnChangeCytoStyle) {
  //     bulmaToast.toast({
  //         message: `🕵️‍♂️ Bro, we're currently on a mission to probe that link status! Stay tuned for the results. 🔍🚀👨‍💻`,
  //         type: "is-warning is-size-6 p-3",
  //         duration: 4000,
  //         position: "top-center",
  //         closeOnClick: true,
  //     });
  // } else {
  //     bulmaToast.toast({
  //         message: `Alright, mission control, we're standing down. 🛑🔍 link status probing aborted. Stay chill, folks. 😎👨‍💻`,
  //         type: "is-warning is-size-6 p-3",
  //         duration: 4000,
  //         position: "top-center",
  //         closeOnClick: true,
  //     });
  // }
  loadCytoStyle(cy);
  console.log(`globalToggleOnChangeCytoStyle is become: ${globalToggleOnChangeCytoStyle}`);
}


// Enhanced Function to Process the Data
function assignMissingLatLng(dataArray) {
  // Constants for default average latitude and longitude
  const DEFAULT_AVERAGE_LAT = 48.684826888402256;
  const DEFAULT_AVERAGE_LNG = 9.007895390625677;

  // Arrays to store existing lat and lng values
  const existingLats = [];
  const existingLngs = [];

  // First pass: Collect existing lat and lng values
  dataArray.forEach(item => {
    const { data } = item;

    // Collect and parse latitude
    if (data.lat && data.lat.trim() !== "") {
      const lat = parseFloat(data.lat);
      if (!isNaN(lat)) {
        existingLats.push(lat);
      }
    }

    // Collect and parse longitude
    if (data.lng && data.lng.trim() !== "") {
      const lng = parseFloat(data.lng);
      if (!isNaN(lng)) {
        existingLngs.push(lng);
      }
    }
  });

  // Determine average latitude
  let averageLat = 0;
  if (existingLats.length > 0) {
    averageLat = existingLats.reduce((a, b) => a + b, 0) / existingLats.length;
  }

  // Determine average longitude
  let averageLng = 0;
  if (existingLngs.length > 0) {
    averageLng = existingLngs.reduce((a, b) => a + b, 0) / existingLngs.length;
  }

  // Check if either average is missing and assign default values if necessary
  const useDefaultLat = existingLats.length === 0;
  const useDefaultLng = existingLngs.length === 0;

  if (useDefaultLat || useDefaultLng) {
    console.warn("Existing latitudes or longitudes are missing. Using default average values.");
    averageLat = useDefaultLat ? DEFAULT_AVERAGE_LAT : averageLat;
    averageLng = useDefaultLng ? DEFAULT_AVERAGE_LNG : averageLng;
  }

  // Second pass: Assign missing lat and lng
  dataArray.forEach(item => {
    const { data } = item;
    const id = data.id || 'Unknown ID';

    // Assign missing latitude
    if (!data.lat || data.lat.trim() === "") {
      const randomOffset = Math.random() * 0.9; // Random value between 0 and 0.9
      const newLat = averageLat + randomOffset;
      data.lat = newLat.toFixed(15); // Ensure precision and convert to string
      console.log(`Assigned new lat for ID ${id}: ${data.lat}`);
    } else {
      // Normalize existing latitude
      const normalizedLat = parseFloat(data.lat);
      if (!isNaN(normalizedLat)) {
        data.lat = normalizedLat.toFixed(15);
      } else {
        // Handle invalid latitude format
        const newLat = useDefaultLat ? DEFAULT_AVERAGE_LAT + Math.random() * 0.9 : averageLat + Math.random() * 0.9;
        data.lat = newLat.toFixed(15);
        console.warn(`Invalid lat for ID ${id}. Assigned new lat: ${data.lat}`);
      }
    }

    // Assign missing longitude
    if (!data.lng || data.lng.trim() === "") {
      const randomOffset = Math.random() * 0.9; // Random value between 0 and 0.9
      const newLng = averageLng + randomOffset;
      data.lng = newLng.toFixed(15); // Ensure precision and convert to string
      console.log(`Assigned new lng for ID ${id}: ${data.lng}`);
    } else {
      // Normalize existing longitude
      const normalizedLng = parseFloat(data.lng);
      if (!isNaN(normalizedLng)) {
        data.lng = normalizedLng.toFixed(15);
      } else {
        // Handle invalid longitude format
        const newLng = useDefaultLng ? DEFAULT_AVERAGE_LNG + Math.random() * 0.9 : averageLng + Math.random() * 0.9;
        data.lng = newLng.toFixed(15);
        console.warn(`Invalid lng for ID ${id}. Assigned new lng: ${data.lng}`);
      }
    }
  });

  console.log("########### dataArray updates ", dataArray)

  return dataArray;
}


/**
 * Fetches data from the JSON file, processes it, and loads it into the Cytoscape instance.
 * This integrated function appends a timestamp to bypass caching, fetches the JSON data,
 * processes the data with `assignMissingLatLng()`, clears existing elements, adds the new ones,
 * applies the "cola" layout, removes specific nodes, and sets up expand/collapse functionality.
 *
 * @returns {void}
 */
async function fetchAndLoadData() {
  try {
    if (isVscodeDeployment) {
      jsonFileUrlDataCytoMarshall = window.jsonFileUrlDataCytoMarshall;
    } else {
      jsonFileUrlDataCytoMarshall = "dataCytoMarshall.json";
    }

    console.log(`#####  fetchAndLoadData called`);
    console.log(`#####  fetchAndLoadData jsonFileUrlDataCytoMarshall: ${jsonFileUrlDataCytoMarshall}`);

    // Optionally, append a timestamp to avoid caching:
    // const fetchUrl = jsonFileUrlDataCytoMarshall + '?t=' + new Date().getTime();
    const fetchUrl = jsonFileUrlDataCytoMarshall;

    // Fetch the JSON data.
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error("Network response was not ok: " + response.statusText);
    }
    const elements = await response.json();

    // Process the data (assign missing lat/lng values).
    const updatedElements = assignMissingLatLng(elements);

    console.log("Updated Elements:", updatedElements);

    // Clear current Cytoscape elements.
    cy.json({ elements: [] });

    // Determine whether data is wrapped in an object with an "elements" property or is directly an array.
    const elementsToAdd = (updatedElements.elements && Array.isArray(updatedElements.elements))
      ? updatedElements.elements
      : updatedElements;

    // Add new elements.
    cy.add(elementsToAdd);

    if (globalIsPresetLayout) {
      // Run the preset layout.
      const layout = cy.layout({
        name: "preset",
        animate: true,
        randomize: false,
        maxSimulationTime: 500
      });
      layout.run();
    } else {
      // Run the layout.
      const layout = cy.layout({
        name: "cola",
        nodeGap: 5,
        edgeLength: 100,
        animate: true,
        randomize: false,
        maxSimulationTime: 1500
      });
      layout.run();
    }
    // Remove specific nodes by name if they exist.
    cy.filter('node[name = "topoviewer"]').remove();
    cy.filter('node[name = "TopoViewer:1"]').remove();

    // Setup expand/collapse functionality using the extension.
    const cyExpandCollapse = cy.expandCollapse({
      layoutBy: null,      // null uses the current layout
      undoable: false,
      fisheye: false,
      animationDuration: 10, // duration in milliseconds
      animate: true
    });

    // Example collapse/expand for a node with id 'parent'.
    setTimeout(() => {
      const parent = cy.$('#parent'); // Adjust based on your data
      if (parent.nonempty()) {
        cyExpandCollapse.collapse(parent);
        setTimeout(() => {
          cyExpandCollapse.expand(parent);
        }, 2000);
      }
    }, 2000);
  } catch (error) {
    console.error("Error loading graph data:", error);
  }
}



async function renderSubInterfaces(subInterfaces, referenceElementAfterId, referenceElementBeforeId, nodeName) {
  console.log("##### renderSubInterfaces is called")
  console.log("##### subInterfaces: ", subInterfaces)

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
    a.textContent = `└ sub-interface :: ${nodeName} :: ${subInterface}`;
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



// if (isVscodeDeployment) {

//     console.log(`image-URI is ${window.imagesUrl}`)
//     addSvgIcon("endpoint-a-edgeshark", `${window.imagesUrl}svg-wireshark.svg`, "Wireshark Icon", "before", "20px");
//     addSvgIcon("endpoint-b-edgeshark", `${window.imagesUrl}/svg-wireshark.svg`, "Wireshark Icon", "before", "20px");
//     addSvgIcon("endpoint-a-clipboard", `${window.imagesUrl}/svg-copy.svg`, "Clipboard Icon", "before", "20px");
//     addSvgIcon("endpoint-b-clipboard", `${window.imagesUrl}/svg-copy.svg`, "Clipboard Icon", "before", "20px");
//     addSvgIcon("panel-link-action-impairment-B->A", `${window.imagesUrl}/svg-impairment.svg`, "Impairment Icon", "before", "15px");
// } else {
//     addSvgIcon("endpoint-a-edgeshark", "images/svg-wireshark.svg", "Wireshark Icon", "before", "20px");
//     addSvgIcon("endpoint-b-edgeshark", "images/svg-wireshark.svg", "Wireshark Icon", "before", "20px");
//     addSvgIcon("endpoint-a-clipboard", "images/svg-copy.svg", "Clipboard Icon", "before", "20px");
//     addSvgIcon("endpoint-b-clipboard", "images/svg-copy.svg", "Clipboard Icon", "before", "20px");
//     addSvgIcon("panel-link-action-impairment-B->A", "images/svg-impairment.svg", "Impairment Icon", "before", "15px");
// }



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


// ASAD