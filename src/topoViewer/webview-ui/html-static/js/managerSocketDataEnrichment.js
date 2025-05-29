//  ./src/topoViewer/webview-ui/html-static/js/managerSocketDataEnrichment.js
//
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

'use strict';

/**
 * Enriches Cytoscape edge elements with interface attributes (MAC, MTU, and type) 
 * from container interface data provided in labData.
 * 
 * This function processes backend lab data to extract interface information from 
 * each container inside a lab whose name matches `globalLabName`. It builds a mapping
 * from a composite key (`labName::nodeName::interfaceLabel`) to interface details.
 * 
 * Then it iterates over all Cytoscape edges and updates each edge's source or target 
 * data if it matches the composite key's node name and endpoint.
 * 
 * Fields added to Cytoscape edge:
 *  - sourceMac / targetMac
 *  - sourceMtu / targetMtu
 *  - sourceType / targetType
 *
 * @param {Object} labData - Raw lab data from the backend. Should follow the structure of
 *                           the "clab-tree-provider-data" feed from the extension backend.
 */
function socketDataEncrichmentLink(labData) {
  const linkMap = new Map();

  Object.values(labData).forEach(lab => {
    if (lab.name !== globalLabName || !Array.isArray(lab.containers)) return;

    lab.containers.forEach(container => {
      if (typeof container.label !== 'string' || !Array.isArray(container.interfaces)) return;

      const nodeName = container.label.split(lab.name)[1]?.replace(/^-/, '') || container.label;
      container.interfaces.forEach(iface => {
        const key = `${lab.name}::${nodeName}::${iface.label}`;
        linkMap.set(key, { mac: iface.mac, mtu: iface.mtu, type: iface.type });
      });
    });
  });

  linkMap.forEach((iface, key) => {
    const [, nodeName, endpoint] = key.split('::');
    cy.edges().forEach(edge => {
      const data = edge.data();
      if (data.source === nodeName && data.sourceEndpoint === endpoint) {
        edge.data({ sourceMac: iface.mac, sourceMtu: iface.mtu, sourceType: iface.type });
      }
      if (data.target === nodeName && data.targetEndpoint === endpoint) {
        edge.data({ targetMac: iface.mac, targetMtu: iface.mtu, targetType: iface.type });
      }
    });
  });
}

/**
 * Enriches Cytoscape node elements with container attributes (state, image, longname, and management IPs)
 * extracted from the lab data.
 * 
 * This function processes backend lab data and targets the lab whose name matches `globalLabName`.
 * It constructs a mapping between each container's longname and its corresponding metadata.
 * 
 * Then it iterates over all Cytoscape nodes and, if the node's `extraData.shortname` matches
 * a container `longname`, it updates the node's `extraData` with:
 *  - state: container's operational state (e.g. running, exited)
 *  - image: container image used (e.g. alpine, sros)
 *  - longname: container's long form name (e.g. clab-demo-r1)
 *  - mgmtIpv4Address: management IPv4 address
 *  - mgmtIpv6Address: management IPv6 address
 *
 * @param {Object} labData - Raw lab data from the backend. Expected to match
 *                           the "clab-tree-provider-data" format.
 */
function socketDataEncrichmentNode(labData) {
  const nodeMap = new Map();

  Object.values(labData).forEach(lab => {
    if (lab.name !== globalLabName || !Array.isArray(lab.containers)) return;

    lab.containers.forEach(container => {
      if (typeof container.label !== 'string') return;

      const nodeData = {
        labname: lab.name,
        state: container.state,
        image: container.image,
        longname: container.name,
        mgmtIpv4Address: container.v4Address,
        mgmtIpv6Address: container.v6Address,
      };
      nodeMap.set(container.name, nodeData);
    });
  });

  nodeMap.forEach((nodeData, longname) => {
    cy.nodes().forEach(node => {
      const shortname = node.data()?.extraData?.shortname;
      if (shortname === longname) {
        const updatedExtraData = {
          ...node.data('extraData'),
          state: nodeData.state,
          image: nodeData.image,
          longname,
          mgmtIpv4Address: nodeData.mgmtIpv4Address,
          mgmtIpv6Address: nodeData.mgmtIpv6Address,
        };
        node.data('extraData', updatedExtraData);
      }
    });
  });
}
