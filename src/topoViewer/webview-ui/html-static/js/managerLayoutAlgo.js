// cytoscape-leaflet variables
var isGeoMapInitialized = false;
var cytoscapeLeafletMap;
var cytoscapeLeafletLeaf;




// Function to initialize Leaflet map and apply GeoMap layout
function viewportDrawerLayoutGeoMap() {
	// cytoscape-leaflet global variables
	// var isGeoMapInitialized = false;
	// var cytoscapeLeafletMap;
	// var cytoscapeLeafletLeaf;

    viewportDrawerDisableGeoMap()

    if (!isGeoMapInitialized) {
        // Show Leaflet container
        var leafletContainer = document.getElementById('cy-leaflet');
        if (leafletContainer) {
            leafletContainer.style.display = 'block';
        }

        // Initialize Cytoscape-Leaflet
        cytoscapeLeafletLeaf = cy.leaflet({
            container: leafletContainer
        });

        // Remove default tile layer
        cytoscapeLeafletLeaf.map.removeLayer(cytoscapeLeafletLeaf.defaultTileLayer);

        // Assign map reference
        cytoscapeLeafletMap = cytoscapeLeafletLeaf.map;

        // Add custom tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(cytoscapeLeafletMap);

        isGeoMapInitialized = true;
    }

	loadCytoStyle(cy); // Reapply the Cytoscape stylesheet
	  
    // Apply GeoMap layout
    cy.layout({
        name: 'preset',
        fit: false,
        positions: function (node) {
            let data = node.data();

            // Convert lat/lng to container point
			console.log("node.id", node.id())
			console.log("data.lat, data.lng", data.lat,  data.lng)
			console.log("Number(data.lat), Number(data.lng)", Number(data.lat), Number(data.lng))

            const point = cytoscapeLeafletMap.latLngToContainerPoint([Number(data.lat), Number(data.lng)]);
			console.log("point: ", point.x, point.y)

            return { x: point.x, y: point.y };

        }
    }).run();

	// cytoscapeLeafletLeaf instance map to fit nodes
	cytoscapeLeafletLeaf.fit();
	console.log("cytoscapeLeafletLeaf.fit()")

    // Show GeoMap buttons
    var viewportDrawerGeoMapElements = document.getElementsByClassName("viewport-geo-map");
    for (var i = 0; i < viewportDrawerGeoMapElements.length; i++) {
        viewportDrawerGeoMapElements[i].classList.remove('is-hidden');
    }

    // Enable node editing
    viewportButtonsGeoMapEdit();

    console.log("GeoMap has been enabled.");
}

// Function to disable GeoMap and revert to default layout
function viewportDrawerDisableGeoMap() {
	// cytoscape-leaflet global variables
	// var isGeoMapInitialized = false;
	// var cytoscapeLeafletMap;
	// var cytoscapeLeafletLeaf;
    if (!isGeoMapInitialized) {
        console.log("GeoMap is not initialized.");
        return;
    }

    // Hide Leaflet container
    var leafletContainer = document.getElementById('cy-leaflet');
    if (leafletContainer) {
        leafletContainer.style.display = 'none';
    }

	// destroy cytoscapeLeafletLeaf instance
	cytoscapeLeafletLeaf.destroy();

    // Revert to default Cytoscape layout
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

	var cyExpandCollapse = cy.expandCollapse({
		layoutBy: null, // null means use existing layout
		undoable: false,
		fisheye: false,
		animationDuration: 10, // when animate is true, the duration in milliseconds of the animation
		animate: true
	});

	// Example collapse/expand after some delay
	// Make sure the '#parent' node exists in your loaded elements
	setTimeout(function() {
		var parent = cy.$('#parent'); // Ensure that '#parent' is actually present in dataCytoMarshall.json
		cyExpandCollapse.collapse(parent);

		setTimeout(function() {
			cyExpandCollapse.expand(parent);
		}, 2000);
	}, 2000);

    // Hide GeoMap buttons
    var viewportDrawerGeoMapElements = document.getElementsByClassName("viewport-geo-map");
    for (var i = 0; i < viewportDrawerGeoMapElements.length; i++) {
        if (!viewportDrawerGeoMapElements[i].classList.contains('is-hidden')) {
            viewportDrawerGeoMapElements[i].classList.add('is-hidden');
        }
    }

    // Optionally, disable node editing if enabled
    // For example:
    // disableGeoMapNodeEditing();

    isGeoMapInitialized = false;

	loadCytoStyle(cy); // Reapply the Cytoscape stylesheet

    console.log("GeoMap has been disabled and reverted to default Cytoscape layout.");
}

// Function to toggle GeoMap on and off
// Currently not used 
function toggleGeoMap() {
    var leafletContainer = document.getElementById('cy-leaflet');
    var isGeoMapEnabled = leafletContainer && leafletContainer.style.display !== 'none';

    if (isGeoMapEnabled) {
        // Disable GeoMap
        viewportDrawerDisableGeoMap();
    } else {
        // Enable GeoMap
        viewportDrawerLayoutGeoMap();
    }
}
