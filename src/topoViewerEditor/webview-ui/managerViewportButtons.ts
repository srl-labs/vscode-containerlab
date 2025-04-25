// file: managerViewportButtons.ts

import cytoscape from 'cytoscape';
import loadCytoStyle from './managerCytoscapeStyle';
import { fetchAndLoadData, fetchAndLoadDataEnvironment } from './managerCytoscapeFetchAndLoad';
import { VscodeMessageSender } from './managerVscodeWebview';

import { NodeData, EdgeData } from './topoViewerEditorEngine';

// Declare global functions/variables if they are not imported from other modules.
declare const globalCytoscapeLeafletLeaf: { fit: () => void };
export let globalLinkEndpointVisibility = true;


/**
 * ManagerViewportButtons encapsulates functionality related to viewport button actions,
 * such as saving the current topology (node positions and extra label data) and sending it
 * to the backend.
 */
export class ManagerViewportButtons {
  // private messageSender: VscodeMessageSender;

  /**
   * Creates an instance of ManagerViewportButtons.
   */
  constructor(
    private messageSender: VscodeMessageSender
  ) { }

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
  public async viewportButtonsSaveTopo(cy: cytoscape.Core, messageSender: VscodeMessageSender, suppressNotification: boolean): Promise<void> {
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

      if (!suppressNotification) {
        console.log("Not Suppressing notification for save action.");
        // Send the updated topology data to the backend.
        const response = await this.messageSender.sendMessageToVscodeEndpointPost(
          "topo-editor-viewport-save",
          updatedElements
        );
        console.log("Response from backend:", response);
      } else { 
        console.log("Suppressing notification for save action.");
        // Send the updated topology data to the backend.
        const response = await this.messageSender.sendMessageToVscodeEndpointPost(
          "topo-editor-viewport-save-suppress-notification",
          updatedElements
        );
        console.log("Response from backend:", response);
       }


    } catch (err) {
      console.error("Backend call failed:", err);
    }
  }


  /**
   * Adjusts the Cytoscape viewport to fit all nodes and logs the zoom levels.
   * Additionally, fits nodes on the global Cytoscape Leaflet instance.
   *
   * @param cy - The Cytoscape instance containing the graph elements.
   */
  public viewportButtonsZoomToFit(cy: cytoscape.Core): void {
    // Capture the initial zoom level.
    const initialZoom = cy.zoom();
    console.info(`Initial zoom level is "${initialZoom}".`);

    // Fit all nodes with default padding.
    cy.fit();
    const currentZoom = cy.zoom();
    console.info(`And now the zoom level is "${currentZoom}".`);

    // If a global Cytoscape Leaflet instance is available, fit its view as well.
    globalCytoscapeLeafletLeaf.fit();
    console.log("globalCytoscapeLeafletLeaf.fit()");
  }

  /**
   * Toggles the visibility of endpoint labels on all edges.
   *
   * When the labels are visible, they are hidden; when hidden, they are shown.
   * This method updates both the "text-opacity" and "text-background-opacity" styles.
   *
   * @param cy - The Cytoscape instance containing the graph elements.
   */
  public viewportButtonsLabelEndpoint(cy: cytoscape.Core): void {
    if (globalLinkEndpointVisibility) {
      // Hide the text labels.
      cy.edges().forEach((edge) => {
        edge.style("text-opacity", 0);
        edge.style("text-background-opacity", 0);
      });
      globalLinkEndpointVisibility = false;
    } else {
      // Show the text labels.
      cy.edges().forEach((edge) => {
        edge.style("text-opacity", 1);
        edge.style("text-background-opacity", 0.7);
      });
      globalLinkEndpointVisibility = true;
    }
  }

  /**
   * Reloads the topology viewport in Cytoscape by requesting fresh data from the backend.
   *
   * This method sends a reload command to the VS Code extension backend, waits briefly
   * to allow the backend to process the request, and then re-fetches and re-loads
   * the topology data into the provided Cytoscape instance.
   *
   * @async
   * @param cy - The Cytoscape core instance whose viewport will be reloaded.
   * @returns A promise that resolves once the reload sequence has been initiated.
   */
  public async viewportButtonsReloadTopo(cy: cytoscape.Core): Promise<void> {
    try {
      const response = await this.messageSender.sendMessageToVscodeEndpointPost("topo-editor-reload-viewport", "Empty Payload");
      console.log("############### response from backend:", response);
      this.sleep(1000)
      // Re-Init load data.
      fetchAndLoadData(cy, this.messageSender);

    } catch (err) {
      console.error("############### Backend call failed:", err);
    }
  }

  /**
   * Adds a new Containerlab node to the Cytoscape canvas.
   * <p>
   * Generates a unique node ID based on the current number of nodes, sets up
   * default NodeData fields, and adds the node at the event’s position (if provided)
   * or at a random position within [100, 200] for both x and y.
   * After adding, fits the viewport to include all nodes.
   * </p>
   *
   * @param cy - The Cytoscape core instance where the node will be added.
   * @param event - The Cytoscape event object that triggered this action.
   *                Its `position` (if present) is used for the new node’s placement.
   * @returns void
   */
  public viewportButtonsAddContainerlabNode(cy: cytoscape.Core, event: cytoscape.EventObject): void {
    const newNodeId = `nodeId-${cy.nodes().length + 1}`;

    const newNodeData: NodeData = {
      id: newNodeId,
      editor: "true",
      weight: "30",
      // name: newNodeId.split(":")[1]
      name: newNodeId,
      parent: "",
      topoViewerRole: "pe",
      sourceEndpoint: "",
      targetEndpoint: "",
      containerDockerExtraAttribute: { state: "", status: "" },
      extraData: { kind: "nokia_srlinux", longname: "", image: "", mgmtIpv4Addresss: "" },
    };

    const position = event.position || {
      x: Math.random() * 100 + 100,
      y: Math.random() * 100 + 100,
    }; // [0,1)*100 tobe [0,100) +100 tobe [100,200)

    cy.add({ group: 'nodes', data: newNodeData, position });

    // Fit all nodes with default padding.
    cy.fit();
  }


  // sleep funtion
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  // Future methods for additional viewport buttons can be added here.
}
