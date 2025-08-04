// managerSocketDataEnrichment.ts

// Declarations for globals provided elsewhere in the webview environment
// These will be replaced with proper imports and types as the migration continues.
declare const cy: any;
declare const globalLabName: string;
declare const globalPrefixName: string;

/**
 * Enriches Cytoscape edge elements with interface attributes (MAC, MTU, type)
 * from container interface data provided in labData.
 *
 * @param labData - Raw lab data from the backend.
 */
export function socketDataEncrichmentLink(labData: Record<string, any>): void {
  const linkMap = new Map<string, { mac: string; mtu: number; type: string }>();

  console.log("debug labData:", labData);
  console.log("debug labData.name", (labData as any).name);
  console.log("debug globalLabName", globalLabName);

  // Build interface key mapping for the current lab
  Object.values(labData).forEach((lab: any) => {
    if (lab.name !== globalLabName || !Array.isArray(lab.containers)) return;

    lab.containers.forEach((container: any) => {
      if (typeof container.label !== "string" || !Array.isArray(container.interfaces)) return;

      const nodeName =
        container.label.split(lab.name)[1]?.replace(/^-/, "") || container.label;

      container.interfaces.forEach((iface: any) => {
        const key = `${lab.name}::${nodeName}::${iface.label}`;
        linkMap.set(key, { mac: iface.mac, mtu: iface.mtu, type: iface.type });
      });

      console.log(
        `Enriched link data for node: ${nodeName} with interfaces:`,
        container.interfaces
      );
      console.log("Enriched link map data:", linkMap);
    });
  });

  // Compute prefix safely
  let assignedPrefixLabName: string | null;

  switch (true) {
    case typeof globalPrefixName === "string" && globalPrefixName.trim() === "undefined":
      assignedPrefixLabName = `clab-${globalLabName}-`;
      break;

    case typeof globalPrefixName === "string" && globalPrefixName.trim() !== "":
      assignedPrefixLabName = `${globalPrefixName.trim()}-${globalLabName}-`;
      break;

    default:
      assignedPrefixLabName = null;
      break;
  }

  // Enrich edges
  linkMap.forEach((iface, key) => {
    const [, nodeName, endpoint] = key.split("::");
    cy.edges().forEach((edge: any) => {
      const data = edge.data();

      // Safely build clabSourceLongName and clabTargetLongName
      const clabSourceLongName = assignedPrefixLabName
        ? `${assignedPrefixLabName}${data.source}`
        : data.source;

      const clabTargetLongName = assignedPrefixLabName
        ? `${assignedPrefixLabName}${data.target}`
        : data.target;

      const updatedExtraData = {
        ...edge.data("extraData"),
        clabSourceLongName,
        clabTargetLongName,
      };
      edge.data("extraData", updatedExtraData);

      // Enrich with interface details if matched
      if (data.source === nodeName && data.sourceEndpoint === endpoint) {
        edge.data({ sourceMac: iface.mac, sourceMtu: iface.mtu, sourceType: iface.type });
      }
      if (data.target === nodeName && data.targetEndpoint === endpoint) {
        edge.data({ targetMac: iface.mac, targetMtu: iface.mtu, targetType: iface.type });
      }

      console.log("Edge data after enrichment:", edge.data());
    });
  });
}

/**
 * Enriches Cytoscape node elements with container attributes (state, image, longname, management IPs).
 *
 * @param labData - Raw lab data from the backend.
 */
export function socketDataEncrichmentNode(labData: Record<string, any>): void {
  const nodeMap = new Map<string, any>();

  // Build node mapping from container longname -> metadata
  Object.values(labData).forEach((lab: any) => {
    if (lab.name !== globalLabName || !Array.isArray(lab.containers)) return;

    lab.containers.forEach((container: any) => {
      if (typeof container.label !== "string") return;

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

  // Enrich each Cytoscape node that matches by shortname === longname
  nodeMap.forEach((nodeData, longname) => {
    cy.nodes().forEach((node: any) => {
      const shortname = node.data()?.extraData?.shortname;
      if (shortname === longname) {
        const updatedExtraData = {
          ...node.data("extraData"),
          state: nodeData.state,
          image: nodeData.image,
          longname,
          mgmtIpv4Address: nodeData.mgmtIpv4Address,
          mgmtIpv6Address: nodeData.mgmtIpv6Address,
        };
        node.data("extraData", updatedExtraData);
      }
    });
  });
}

