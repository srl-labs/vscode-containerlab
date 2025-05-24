//// ENRICHER FUNCTION

//  +------------------------------------------------------------------+
//  |  Socket.io/vscode message  Feed: "clab-tree-provider-data"       |
//  |  (Extension Backend sends lab data via socket.io/vscode message) |
//  +------------------------------------------------------------------+
//                                  |
//                                  v
//                      +-----------------------+
//                      |     Lab Data          |
//                      | (clabTreeProviderData)|
//                      +-----------------------+
//                          |                |
//                          v                v
// +-------------------------------+   +-------------------------------+
// |  socketDataEncrichmentLink()  |   | socketDataEncrichmentNode()   |
// | (Enriches Cytoscape Edges)    |   |  (Enriches Cytoscape Nodes)   |
// +-------------------------------+   +-------------------------------+
//                   |                                  |
//                   | Updates edge data (MAC, MTU,     | Updates node data (state, image, longname)
//                   | type for source/target)          |
//                   v                                  v
//        +-----------------------+         +-----------------------+
//        |   Cytoscape Edges     |         |    Cytoscape Nodes    |
//        +-----------------------+         +-----------------------+



/**
 * Enriches Cytoscape edge data with link-specific attributes from lab data.
 *
 * The function iterates over the raw lab data to extract link details such as
 * MAC address, MTU, and type for each interface of containers whose lab name matches
 * the globally defined `globalLabName`. It builds a mapping keyed by a composite of
 * lab name, node name, and endpoint. For each matching key, it then updates Cytoscape
 * edges (both source and target) with the extracted link attributes.
 *
 * @param {Object} labData - Raw lab data object from the backend.
 *                           **Note:** This data is expected to be the clabTreeProviderData feed
 *                           from the extension backend via socket.io.
 *
 * @example
 * // Given labData with lab name matching globalLabName,
 * // the function will update edges with the corresponding link attributes.
 * socketDataEncrichmentLink(labData);
 */
function socketDataEncrichmentLink(labData) {
    const linkDataEncrichmentMap = {};
    for (const labPath in labData) {
        try {
            const lab = labData[labPath];
            console.log("socketDataEncrichmentLink - labName: ", lab.name);

            if (lab.name === globalLabName) {
                console.log("socketDataEncrichmentLink - globalLabName: ", globalLabName);


                if (!lab || !Array.isArray(lab.containers)) continue;
                lab.containers.forEach(container => {
                    if (typeof container.label !== "string") return;
                    // Remove lab-specific prefix; adjust the regex as needed.
                    //   const nodeName = container.label.replace(/^clab-.*?-/, '');

                    console.log("socketDataEncrichmentLink - container: ", container);
                    const nodeClabName = container.label

                    const getRouterName = (fullString, keyword) =>
                        fullString.split(keyword)[1].replace(/^-/, '');

                    nodeName = getRouterName(nodeClabName, lab.name); // Outputs: router1
                    console.log("socketDataEncrichmentLink - nodeName: ", nodeName);

                    if (!Array.isArray(container.interfaces)) return;
                    container.interfaces.forEach(iface => {
                        // if (!iface || typeof iface.mac !== "string") return; // aarafat-tag: get MAC address
                        // if (!iface || typeof iface.mtu !== "number") return; // aarafat-tag: get mtu 
                        // if (!iface || typeof iface.type !== "string") return; // aarafat-tag: get type

                        const mac = iface.mac
                        const mtu = iface.mtu
                        const type = iface.type

                        const linkDataUpdate = { mac, mtu, type };
                        // console.log("socketDataEncrichmentLink - link-data-update: ", linkDataUpdate);

                        const endpoint = iface.label;
                        // console.log("socketDataEncrichmentLink - endpoint: ", endpoint);

                        const key = `${lab.name}::${nodeName}::${endpoint}`;
                        linkDataEncrichmentMap[key] = linkDataUpdate;
                    });
                });
            }
        } catch (err) {
            console.error(`socketDataEncrichmentLink - Error processing labPath "${labPath}" in link data enrichment:`, err);
        }
    }
    console.log("socketDataEncrichmentLink - link-data-update for: ", linkDataEncrichmentMap);
    console.log("socketDataEncrichmentLink - globalLabName: ", globalLabName);

    // aarafat-tag: update cytoscape edge data

    // Loop over each interface key
    Object.keys(linkDataEncrichmentMap).forEach(key => {
        // Split the key into [labName, nodeName, endPointName]
        const parts = key.split("::");
        if (parts.length !== 3) return; // skip keys not matching the expected format
        const [labName, nodeName, endPointName] = parts;
        const iface = linkDataEncrichmentMap[key];

        // Iterate over each Cytoscape edge
        cy.edges().forEach(edge => {
            const data = edge.data();

            // console.log("nodeName - endPointName", nodeName, endPointName);
            // console.log("socketDataEncrichmentLink - edge data: ", data.source, data.target, data.sourceEndpoint, data.targetEndpoint);

            // If the edge's source matches the node and endpoint from the key, update its sourceMac
            if (data.source === nodeName && data.sourceEndpoint === endPointName) {
                edge.data('sourceMac', iface.mac);
                edge.data('sourceMtu', iface.mtu);
                edge.data('sourceType', iface.type);
            }

            // Likewise, if the target matches, update its targetMac
            if (data.target === nodeName && data.targetEndpoint === endPointName) {
                edge.data('targetMac', iface.mac);
                edge.data('targetMtu', iface.mtu);
                edge.data('targetType', iface.type);
            }
            // console.log("socketDataEncrichmentLink - edge data: ", edge.data());
        });
    });
}



/**
 * Enriches Cytoscape node data with node-specific attributes from lab data.
 *
 * This function processes the lab data to extract node attributes such as
 * the operational state and image information from containers whose lab name
 * matches the globally defined `globalLabName`. It builds a mapping keyed by
 * a composite of lab name and node name, and then iterates over Cytoscape nodes
 * to update any node whose id matches the node name in the mapping.
 *
 * @param {Object} labData - Raw lab data object from the backend.
 *                           **Note:** This data is expected to be the clabTreeProviderData feed
 *                           from the extension backend via socket.io.
 *
 * @example
 * // Given labData with lab name matching globalLabName,
 * // the function will update nodes with the corresponding state and image data.
 * socketDataEncrichmentNode(labData);
 */
function socketDataEncrichmentNode(labData) {
    const nodeDataEncrichmentMap = {};

    for (const labPath in labData) {
        console.log("socketDataEncrichmentNode - labData: ", labData);
        try {
            const lab = labData[labPath];
            console.log("socketDataEncrichmentNode - labName: ", lab.name);

            if (lab.name === globalLabName) {
                console.log("socketDataEncrichmentNode - globalLabName: ", globalLabName);

                // Ensure containers are present
                if (!lab || !Array.isArray(lab.containers)) continue;

                lab.containers.forEach(container => {
                    if (typeof container.label !== "string") return;

                    const nodeClabName = container.label;

                    // Extract node name from container label using lab name as keyword
                    const getRouterName = (fullString, keyword) => {
                        const parts = fullString.split(keyword);
                        if (parts.length > 1) {
                            return parts[1].replace(/^-/, '');
                        } else {
                            // keyword not found; return original or empty string
                            return fullString;
                        }
                    };

                    nodeName = getRouterName(nodeClabName, lab.name);

                    const state = container.state;
                    const image = container.image;
                    const longname = container.name;
                    const mgmtIpv4Address = container.v4Address;
                    const mgmtIpv6Address = container.v6Address;

                    const key = longname;  // Use longname as unique identifier
                    const nodeDataUpdate = { state, image, longname, mgmtIpv4Address, mgmtIpv6Address };

                    nodeDataEncrichmentMap[key] = nodeDataUpdate;
                });
            }
        } catch (err) {
            console.error(`socketDataEncrichmentNode - Error processing labPath "${labPath}" in node data enrichment:`, err);
        }
    }

    // console.log("socketDataEncrichmentNode - node-data-update for: ", nodeDataEncrichmentMap);
    // console.log("socketDataEncrichmentNode - globalLabName: ", globalLabName);

    // Iterate over the node enrichment map and apply updates to Cytoscape nodes
    Object.keys(nodeDataEncrichmentMap).forEach(key => {
        nodeName = key; // aarafat-tag: key of nodeDataEncrichmentMap a streamed data
        nodeData = nodeDataEncrichmentMap[key];

        cy.nodes().forEach(node => {
            const data = node.data();

            // Extract longname suffix from Cytoscape node and enrichment data
            const lastPartLongnameDataMarshall = (data?.extraData?.longname || "").split("-").pop();
            const lastPartLongnameStreamedData = (nodeName || "").split("-").pop();

            let updatedLongname;

            // Determine which longname to assign based on suffix match
            if (nodeName == lastPartLongnameStreamedData) {
                updatedLongname = lastPartLongnameStreamedData;
            } else {
                updatedLongname = nodeName;
            }

            // Check if the suffixes match to apply updates
            if (lastPartLongnameDataMarshall === lastPartLongnameStreamedData) {
                node.data('state', nodeData.state);
                node.data('image', nodeData.image);

                // Update the node's extraData.longname field
                if (node && node.data("extraData")) {
                    const updatedExtraData = {
                        ...node.data("extraData"),
                        longname: updatedLongname,
                        mgmtIpv4Address: nodeData.mgmtIpv4Address,
                        mgmtIpv6Address: nodeData.mgmtIpv6Address,
                    };
                    node.data("extraData", updatedExtraData);

                    console.log("Updated longname:", node.data("extraData").longname);
                } else {
                    console.warn(`Node ${nodeId} missing or doesn't have extraData.`);
                }

                console.log("socketDataEncrichmentNode - cy node data after update from streamed data: ", node.data());
            }
        });
    });
}