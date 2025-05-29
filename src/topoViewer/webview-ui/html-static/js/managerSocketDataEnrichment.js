'use strict';

/**
 * Enrich Cytoscape edge data with link specific attributes from lab data.
 * @param {Object} labData Raw lab data from the backend.
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
 * Enrich Cytoscape node data with node attributes from lab data.
 * @param {Object} labData Raw lab data from the backend.
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
