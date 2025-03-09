// file: managerViewportButtons.ts

import cytoscape from 'cytoscape';
import loadCytoStyle from './managerCytoscapeStyle';
import { VscodeMessageSender } from './managerVscodeWebview';

/**
 * ManagerViewportButtons encapsulates functionality related to viewport button actions,
 * such as saving the current topology (node positions and extra label data) and sending it
 * to the backend.
 */
export class ManagerViewportButtons {
  private messageSender: VscodeMessageSender;

  /**
   * Creates an instance of ManagerViewportButtons.
   */
  constructor() {
    // Instantiate the message sender.
    this.messageSender = new VscodeMessageSender();
  }

  /**
   * Updates node positions and sends the topology data to the backend.
   *
   * This method iterates over each node in the Cytoscape instance, updating the node's
   * "position" property with its current coordinates. If extra label data exists under
   * `node.data.extraData.labels`, it updates the "graph-posX" and "graph-posY" labels.
   * The updated nodes are then sent to the backend endpoint ("topo-editor-viewport-save")
   * via the provided message sender.
   *
   * @param cy - The Cytoscape instance containing the graph elements.
   * @returns A promise that resolves when the data has been processed and sent.
   */
  public async viewportButtonsSaveTopo(cy: cytoscape.Core): Promise<void> {
    const isVscodeDeployment = true; // adjust this flag as needed
    if (!isVscodeDeployment) return;

    try {
      console.log("viewportButtonsSaveTopo triggered");

      // Process each node: update positions and extra label data.
      const updatedNodes = cy.nodes().map((node: cytoscape.NodeSingular) => {
        // Cast node.json() to any so we can modify its properties.
        const nodeJson: any = node.json();

        // Update the node's position property.
        nodeJson.position = node.position();
        if (nodeJson.data?.extraData?.labels) {
          nodeJson.data.extraData.labels["graph-posX"] = nodeJson.position.x.toString();
          nodeJson.data.extraData.labels["graph-posY"] = nodeJson.position.y.toString();
        }

        // Update parent information.
        const parentCollection = node.parent();
        const parentId: string = parentCollection.nonempty() ? parentCollection[0].id() : "";
        nodeJson.parent = parentId;
        if (nodeJson.data?.extraData?.labels && parentId) {
          const parts = parentId.split(":");
          nodeJson.data.extraData.labels["graph-group"] = parts[0] || "";
          nodeJson.data.extraData.labels["graph-level"] = parts[1] || "";

          // Retrieve valid alignment classes.
          const validLabelClasses = [
            "top-center",
            "top-left",
            "top-right",
            "bottom-center",
            "bottom-left",
            "bottom-right",
          ];
          const parentElement = cy.getElementById(parentId);
          const classArray: string[] = parentElement.classes();
          const validParentClasses = classArray.filter((cls: string) =>
            validLabelClasses.includes(cls)
          );
          nodeJson.data.groupLabelPos =
            validParentClasses.length > 0 ? validParentClasses[0] : "";
        }
        return nodeJson;
      });

      // Process each edge: include edge data and optionally update endpoints or other properties.
      const updatedEdges = cy.edges().map((edge: cytoscape.EdgeSingular) => {
        // Cast edge.json() to any so we can modify its properties if needed.
        const edgeJson: any = edge.json();

        if (edgeJson.data) {
          const sourceId = edgeJson.data.source;
          const targetId = edgeJson.data.target;
          const sourcePort = edgeJson.data.sourcePort || "";
          const targetPort = edgeJson.data.targetPort || "";
          edgeJson.data.endpoints = [
            sourcePort ? `${sourceId}:${sourcePort}` : sourceId,
            targetPort ? `${targetId}:${targetPort}` : targetId,
          ];
        }
        
        return edgeJson;
      });

      loadCytoStyle(cy);
      
      // Combine nodes and edges into a single array.
      const updatedElements = [...updatedNodes, ...updatedEdges];
      console.log("Updated Topology Data:", JSON.stringify(updatedElements, null, 2));

      // Send the updated topology data to the backend.
      const response = await this.messageSender.sendMessageToVscodeEndpointPost(
        "topo-editor-viewport-save",
        updatedElements
      );
      console.log("Response from backend:", response);
    } catch (err) {
      console.error("Backend call failed:", err);
    }
  }

  // Future methods for additional viewport buttons can be added here.
}
