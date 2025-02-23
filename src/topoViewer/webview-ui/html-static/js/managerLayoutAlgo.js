// Check globalVariables.js for initiation

/**
 * Initializes and applies the GeoMap layout using Leaflet and Cytoscape.
 */
function viewportDrawerLayoutGeoMap() {
    // Disable any active GeoMap layout before initializing a new one
    viewportDrawerDisableGeoMap();

    if (!globalIsGeoMapInitialized) {
        // Show the Leaflet container element
        var leafletContainer = document.getElementById('cy-leaflet');
        if (leafletContainer) {
            leafletContainer.style.display = 'block';
        }

        // Initialize the Cytoscape-Leaflet integration
        globalCytoscapeLeafletLeaf = cy.leaflet({
            container: leafletContainer
        });

        // Remove the default tile layer from the Leaflet map
        globalCytoscapeLeafletLeaf.map.removeLayer(globalCytoscapeLeafletLeaf.defaultTileLayer);

        // Assign the map reference to a global variable
        globalCytoscapeLeafletMap = globalCytoscapeLeafletLeaf.map;

        // Add a custom tile layer to the Leaflet map
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(globalCytoscapeLeafletMap);

        // Mark GeoMap as initialized
        globalIsGeoMapInitialized = true;
    }

    // Reapply the Cytoscape stylesheet
    loadCytoStyle(cy);

    // Apply GeoMap layout using a preset layout and custom positions based on geographical coordinates
    cy.layout({
        name: 'preset',
        fit: false,
        positions: function (node) {
            let data = node.data();

            // Log node details for debugging
            console.log("node.id", node.id());
            console.log("data.lat, data.lng", data.lat, data.lng);
            console.log("Number(data.lat), Number(data.lng)", Number(data.lat), Number(data.lng));

            // Convert latitude/longitude to container point
            const point = globalCytoscapeLeafletMap.latLngToContainerPoint([Number(data.lat), Number(data.lng)]);
            console.log("point: ", point.x, point.y);

            return { x: point.x, y: point.y };
        }
    }).run();

    // Adjust the Leaflet map to fit the nodes
    globalCytoscapeLeafletLeaf.fit();
    console.log("globalCytoscapeLeafletLeaf.fit()");

    // Show GeoMap-related buttons by removing the 'is-hidden' class
    var viewportDrawerGeoMapElements = document.getElementsByClassName("viewport-geo-map");
    for (var i = 0; i < viewportDrawerGeoMapElements.length; i++) {
        viewportDrawerGeoMapElements[i].classList.remove('is-hidden');
    }

    // Enable node editing specific to GeoMap layout
    viewportButtonsGeoMapEdit();

    console.log("GeoMap has been enabled.");
}

/**
 * Disables the GeoMap layout and reverts to the default Cytoscape layout.
 */
function viewportDrawerDisableGeoMap() {
    if (!globalIsGeoMapInitialized) {
        console.log("GeoMap is not initialized.");
        return;
    }

    // Hide the Leaflet container element
    var leafletContainer = document.getElementById('cy-leaflet');
    if (leafletContainer) {
        leafletContainer.style.display = 'none';
    }

    // Destroy the Cytoscape-Leaflet instance
    globalCytoscapeLeafletLeaf.destroy();

    // Revert to the default Cytoscape layout using the 'cola' layout
    const layout = cy.layout({
        name: "cola",
        nodeGap: 5,
        edgeLength: 100,
        animate: true,
        randomize: false,
        maxSimulationTime: 1500,
    });
    layout.run();

    // Remove the node used by the topoViewer if it exists
    topoViewerNode = cy.filter('node[name = "topoviewer"]');
    topoViewerNode.remove();

    // Initialize the expandCollapse plugin for potential collapse/expand actions
    var cyExpandCollapse = cy.expandCollapse({
        layoutBy: null, // Use existing layout
        undoable: false,
        fisheye: false,
        animationDuration: 10, // Duration of animation in milliseconds
        animate: true
    });

    // Example collapse/expand operation on the node with ID 'parent'
    setTimeout(function () {
        var parent = cy.$('#parent'); // Ensure '#parent' exists in the graph data
        cyExpandCollapse.collapse(parent);

        setTimeout(function () {
            cyExpandCollapse.expand(parent);
        }, 2000);
    }, 2000);

    // Hide GeoMap-related buttons by adding the 'is-hidden' class
    var viewportDrawerGeoMapElements = document.getElementsByClassName("viewport-geo-map");
    for (var i = 0; i < viewportDrawerGeoMapElements.length; i++) {
        if (!viewportDrawerGeoMapElements[i].classList.contains('is-hidden')) {
            viewportDrawerGeoMapElements[i].classList.add('is-hidden');
        }
    }

    // Optionally, disable node editing if it was enabled (code commented out)
    // disableGeoMapNodeEditing();

    // Mark GeoMap as no longer initialized
    globalIsGeoMapInitialized = false;

    // Reapply the Cytoscape stylesheet to update styles after layout change
    loadCytoStyle(cy);

    console.log("GeoMap has been disabled and reverted to default Cytoscape layout.");
}

/**
 * Toggles the GeoMap layout on or off.
 * Currently not used.
 */
function toggleGeoMap() {
    // Check if the Leaflet container is visible (GeoMap is enabled)
    var leafletContainer = document.getElementById('cy-leaflet');
    var isGeoMapEnabled = leafletContainer && leafletContainer.style.display !== 'none';

    if (isGeoMapEnabled) {
        // If enabled, disable GeoMap
        viewportDrawerDisableGeoMap();
    } else {
        // If disabled, enable GeoMap
        viewportDrawerLayoutGeoMap();
    }
}

/**
 * Applies a force-directed (Cola) layout to the Cytoscape graph using slider values for customization.
 */
function viewportDrawerLayoutForceDirected() {
    // Disable GeoMap in case it is active
    viewportDrawerDisableGeoMap();

    // Retrieve slider elements for edge length and node gap
    const edgeLengthSlider = document.getElementById("force-directed-slider-link-lenght");
    const nodeGapSlider = document.getElementById("force-directed-slider-node-gap");

    // Parse slider values to floats
    const edgeLengthValue = parseFloat(edgeLengthSlider.value);
    const nodeGapValue = parseFloat(nodeGapSlider.value);

    console.info("edgeLengthValue", edgeLengthValue);
    console.info("nodeGapValue", nodeGapValue);

    // Apply the 'cola' layout with custom node spacing and edge lengths based on slider values
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

    // Retrieve nodes for the optic layer (Layer-1) and calculate their bounding box
    const opticLayerNodes = cy.nodes('[parent="layer1"]');
    const opticBBox = opticLayerNodes.boundingBox();

    // Define vertical offsets for additional layers based on the optic layer's bounding box
    const layerOffsets = {
        layer2: opticBBox.y2 + 100, // L2 nodes below Optic layer
        layer3: opticBBox.y2 + 300, // IP/MPLS nodes below L2 layer
        layer4: opticBBox.y2 + 500 // VPN nodes below IP/MPLS layer
    };

    // Position nodes in layers 2, 3, and 4 while preserving x-coordinates from Layer-1
    ["layer2", "layer3", "layer4"].forEach((layer, index) => {
        const layerNodes = cy.nodes(`[parent="${layer}"]`);
        const offsetY = layerOffsets[layer];

        layerNodes.positions((node, i) => {
            return {
                x: opticLayerNodes[i % opticLayerNodes.length].position("x"),
                y: opticLayerNodes[i % opticLayerNodes.length].position("y") + offsetY
            };
        });
    });

    // Initialize expandCollapse functionality for nodes
    const cyExpandCollapse = cy.expandCollapse({
        layoutBy: null, // Use the current layout
        undoable: false,
        fisheye: false,
        animationDuration: 10,
        animate: true
    });

    // Demonstrate collapse and subsequent expansion of the node with ID 'parent'
    setTimeout(function () {
        var parent = cy.$('#parent'); // Ensure '#parent' is present in the data
        cyExpandCollapse.collapse(parent);

        setTimeout(function () {
            cyExpandCollapse.expand(parent);
        }, 2000);
    }, 2000);
}

/**
 * Applies a radial force-directed (Cola) layout with custom edge and node weights to the Cytoscape graph.
 */
function viewportDrawerLayoutForceDirectedRadial() {
    // Disable GeoMap in case it is active
    viewportDrawerDisableGeoMap();

    // Retrieve and parse slider value for edge length
    var edgeLengthSlider = document.getElementById("force-directed-radial-slider-link-lenght");
    const edgeLengthValue = parseFloat(edgeLengthSlider.value);
    console.info("edgeLengthValue", edgeLengthValue);

    // Retrieve and parse slider value for node gap
    var nodeGapSlider = document.getElementById("force-directed-radial-slider-node-gap");
    const nodeGapValue = parseFloat(nodeGapSlider.value);
    console.info("edgeLengthValue", nodeGapValue);

    // Map TopoViewerGroupLevel to node weights (lower levels yield higher weight)
    const nodeWeights = {};
    cy.nodes().forEach((node) => {
        const level = node.data('extraData')?.labels?.TopoViewerGroupLevel ?
            parseInt(node.data('extraData').labels.TopoViewerGroupLevel) :
            1; // Default level to 1 if missing
        nodeWeights[node.id()] = 1 / level; // Higher weight for lower levels
    });

    // Adjust edge styles to avoid overlaps by using bezier curves
    cy.edges().forEach((edge) => {
        edge.style({
            'curve-style': 'bezier', // Use curved edges
            'control-point-step-size': 20, // Distance for control points
        });
    });

    // Apply the 'cola' layout with weights and enhanced edge handling
    cy.layout({
        name: 'cola',
        fit: true, // Fit layout to viewport automatically
        nodeSpacing: nodeGapValue, // Gap between nodes
        edgeLength: (edge) => {
            const sourceWeight = nodeWeights[edge.source().id()] || 1;
            const targetWeight = nodeWeights[edge.target().id()] || 1;
            return (1 * edgeLengthValue) / (sourceWeight + targetWeight); // Compute edge length based on weights
        },
        edgeSymDiffLength: 10, // Ensure symmetrical edge separation to reduce overlaps
        nodeDimensionsIncludeLabels: true, // Consider node labels in layout dimensions
        animate: true,
        maxSimulationTime: 2000,
        avoidOverlap: true, // Prevent node overlaps
    }).run();

    // Initialize expandCollapse functionality with fisheye enabled for effect
    var cyExpandCollapse = cy.expandCollapse({
        layoutBy: null,
        undoable: false,
        fisheye: true,
        animationDuration: 10,
        animate: true
    });

    // Demonstrate collapse and expansion of the node with ID 'parent'
    setTimeout(function () {
        var parent = cy.$('#parent');
        cyExpandCollapse.collapse(parent);

        setTimeout(function () {
            cyExpandCollapse.expand(parent);
        }, 2000);
    }, 2000);
}

/**
 * Arranges nodes in a vertical layout by positioning parent and child nodes.
 */
function viewportDrawerLayoutVertical() {
    // Disable GeoMap in case it is active
    viewportDrawerDisableGeoMap();

    // Retrieve slider elements for vertical gaps
    const nodevGap = document.getElementById("vertical-layout-slider-node-v-gap");
    const groupvGap = document.getElementById("vertical-layout-slider-group-v-gap");

    // Parse slider values for gap sizes
    const nodevGapValue = parseFloat(nodevGap.value); // Gap between child nodes within a parent
    const groupvGapValue = parseFloat(groupvGap.value); // Gap between parent nodes

    const delay = 100; // Delay (in milliseconds) to ensure layout updates after rendering

    setTimeout(() => {
        // Step 1: Position child nodes evenly within their parent nodes
        cy.nodes().forEach(function (node) {
            if (node.isParent()) {
                const children = node.children(); // Retrieve children of the parent node
                const cellWidth = node.width() / children.length; // Calculate width allocated for each child

                // Position each child node horizontally within the parent
                children.forEach(function (child, index) {
                    const xPos = index * (cellWidth + nodevGapValue); // Calculate x-position for the child
                    const yPos = 0; // Keep child nodes on the same vertical level

                    child.position({
                        x: xPos,
                        y: yPos
                    });
                });
            }
        });

        // Step 2: Sort parent nodes by group level and ID for vertical stacking
        const sortedParents = cy.nodes()
            .filter(node => node.isParent()) // Only consider parent nodes
            .sort((a, b) => {
                // Primary sorting by group level
                const groupLevelA = parseInt(a.data('extraData')?.topoViewerGroupLevel || 0, 10);
                const groupLevelB = parseInt(b.data('extraData')?.topoViewerGroupLevel || 0, 10);

                if (groupLevelA !== groupLevelB) {
                    return groupLevelA - groupLevelB;
                }
                // Secondary sorting by node ID (alphabetically)
                return a.data('id').localeCompare(b.data('id'));
            });

        let yPos = 0; // Initial vertical position for parent nodes
        let maxWidth = 0; // Variable to store the maximum width among parent nodes
        const centerX = 0; // Horizontal center reference

        // Step 3: Determine the widest parent node
        cy.nodes().forEach(function (node) {
            if (node.isParent()) {
                const width = node.width();
                if (width > maxWidth) {
                    maxWidth = width;
                    console.info("ParentMaxWidth: ", maxWidth);
                }
            }
        });

        // Calculate a division factor for aligning parent nodes
        const divisionFactor = maxWidth / 2;
        console.info("Division Factor: ", divisionFactor);

        // Step 4: Position parent nodes vertically and align them relative to the widest parent
        sortedParents.forEach(function (parentNode) {
            const parentWidth = parentNode.width();

            // Calculate horizontal position relative to the center reference
            const xPos = centerX - parentWidth / divisionFactor;

            // Set the position of the parent node
            parentNode.position({
                x: xPos,
                y: yPos
            });

            console.info(`Parent Node '${parentNode.id()}' positioned at x: ${xPos}, y: ${yPos}`);

            // Increment vertical position for the next parent node
            yPos += groupvGapValue;
        });

        // Step 5: Adjust the viewport to fit the updated layout
        cy.fit();

    }, delay);

    // Step 6: Initialize expand/collapse functionality for parent nodes
    const cyExpandCollapse = cy.expandCollapse({
        layoutBy: null, // Use the current layout
        undoable: false, // Disable undo functionality
        fisheye: false, // Disable fisheye view during expand/collapse
        animationDuration: 10, // Animation duration in milliseconds
        animate: true
    });

    // Example: Collapse and then expand the node with ID 'parent'
    setTimeout(function () {
        const parent = cy.$('#parent'); // Ensure '#parent' exists
        cyExpandCollapse.collapse(parent);

        setTimeout(function () {
            cyExpandCollapse.expand(parent);
        }, 2000);
    }, 2000);
}

/**
 * Arranges nodes in a horizontal layout by positioning parent and child nodes.
 */
function viewportDrawerLayoutHorizontal() {
    // Disable GeoMap in case it is active
    viewportDrawerDisableGeoMap();

    // Retrieve slider elements for horizontal gaps
    const nodehGap = document.getElementById("horizontal-layout-slider-node-h-gap");
    const grouphGap = document.getElementById("horizontal-layout-slider-group-h-gap");

    // Parse slider values for gap sizes
    const nodehGapValue = parseFloat(nodehGap.value) * 10; // Gap between child nodes within a parent (scaled)
    const grouphGapValue = parseFloat(grouphGap.value); // Gap between parent nodes

    const delay = 100; // Delay (in milliseconds) to ensure layout updates after rendering

    setTimeout(() => {
        // Step 1: Position child nodes evenly within their parent nodes (vertical arrangement)
        cy.nodes().forEach(function (node) {
            if (node.isParent()) {
                const children = node.children(); // Retrieve children of the parent node
                const cellHeight = node.height() / children.length; // Calculate height allocated for each child

                // Position each child node vertically within the parent
                children.forEach(function (child, index) {
                    const xPos = 0; // Keep child nodes aligned horizontally
                    const yPos = index * (cellHeight + nodehGapValue); // Calculate y-position for the child

                    child.position({
                        x: xPos,
                        y: yPos
                    });
                });
            }
        });

        // Step 2: Sort parent nodes by group level and ID for horizontal stacking
        const sortedParents = cy.nodes()
            .filter(node => node.isParent()) // Only consider parent nodes
            .sort((a, b) => {
                // Primary sorting by group level
                const groupLevelA = parseInt(a.data('extraData')?.topoViewerGroupLevel || 0, 10);
                const groupLevelB = parseInt(b.data('extraData')?.topoViewerGroupLevel || 0, 10);

                if (groupLevelA !== groupLevelB) {
                    return groupLevelA - groupLevelB;
                }
                // Secondary sorting by node ID (alphabetically)
                return a.data('id').localeCompare(b.data('id'));
            });

        let xPos = 0; // Initial horizontal position for parent nodes
        let maxHeight = 0; // Variable to store the maximum height among parent nodes
        const centerY = 0; // Vertical center reference

        // Step 3: Determine the tallest parent node
        cy.nodes().forEach(function (node) {
            if (node.isParent()) {
                const height = node.height();
                if (height > maxHeight) {
                    maxHeight = height;
                    console.info("ParentMaxHeight: ", maxHeight);
                }
            }
        });

        // Calculate a division factor for aligning parent nodes
        const divisionFactor = maxHeight / 2;
        console.info("Division Factor: ", divisionFactor);

        // Step 4: Position parent nodes horizontally and align them relative to the tallest parent
        sortedParents.forEach(function (parentNode) {
            const parentHeight = parentNode.height();

            // Calculate vertical position relative to the center reference
            const yPos = centerY - parentHeight / divisionFactor;

            // Set the position of the parent node
            parentNode.position({
                x: xPos,
                y: yPos
            });

            console.info(`Parent Node '${parentNode.id()}' positioned at x: ${xPos}, y: ${yPos}`);

            // Increment horizontal position for the next parent node
            xPos += grouphGapValue;
        });

        // Step 5: Adjust the viewport to fit the updated layout
        cy.fit();

    }, delay);

    // Step 6: Initialize expand/collapse functionality for parent nodes
    const cyExpandCollapse = cy.expandCollapse({
        layoutBy: null, // Use the current layout
        undoable: false, // Disable undo functionality
        fisheye: false, // Disable fisheye view during expand/collapse
        animationDuration: 10, // Animation duration in milliseconds
        animate: true
    });

    // Example: Collapse and then expand the node with ID 'parent'
    setTimeout(function () {
        const parent = cy.$('#parent'); // Ensure '#parent' exists
        cyExpandCollapse.collapse(parent);

        setTimeout(function () {
            cyExpandCollapse.expand(parent);
        }, 2000);
    }, 2000);
}


/**
 * Applies a preset layout to the Cytoscape graph by reading each node's "position" data.
 * Each node's data should include a "position" object with "x" and "y" properties.
 */
async function viewportDrawerPreset() {
    // Disable GeoMap if it is active before applying the preset layout
    viewportDrawerDisableGeoMap();

    if (isVscodeDeployment) {
        jsonFileUrlDataCytoMarshall = window.jsonFileUrlDataCytoMarshall;
    } else {
        jsonFileUrlDataCytoMarshall = "dataCytoMarshall.json";
    }

    console.log(`fetchAndLoadData() called`);
    console.log(`jsonFileUrlDataCytoMarshall: ${jsonFileUrlDataCytoMarshall}`);

    // Optionally, append a timestamp to avoid caching:
    // const fetchUrl = jsonFileUrlDataCytoMarshall + '?t=' + new Date().getTime();
    const fetchUrl = jsonFileUrlDataCytoMarshall;

    // Fetch the JSON data.
    const response = await fetch(fetchUrl);
    if (!response.ok) {
        throw new Error("Network response was not ok: " + response.statusText);
    }
    const elements = await response.json();

    const updatedElements = elements;
    console.log("Updated Elements:", updatedElements);

    // Clear current Cytoscape elements.
    cy.json({ elements: [] });

    // Determine whether data is wrapped in an object with an "elements" property or is directly an array.
    const elementsToAdd = (updatedElements.elements && Array.isArray(updatedElements.elements))
        ? updatedElements.elements
        : updatedElements;

    // Add new elements.
    cy.add(elementsToAdd);

    cy.layout({
        name: 'preset'
    }).run();

    // Adjust the viewport to fit the updated layout
    cy.fit();
    console.log("Preset layout applied using node data positions.");
}
