// file: managerViewportButtons.ts

import cytoscape from 'cytoscape';
import loadCytoStyle from './managerCytoscapeStyle';
import { fetchAndLoadData } from './managerCytoscapeFetchAndLoad';
import { VscodeMessageSender } from './managerVscodeWebview';

import { NodeData } from './topoViewerEditorEngine';

// import { ManagerViewportPanels } from './managerViewportPanels';

// Declare global functions/variables if they are not imported from other modules.
declare const globalCytoscapeLeafletLeaf: { fit: () => void };
export let globalLinkEndpointVisibility = true;


/**
 * ManagerViewportButtons encapsulates functionality related to viewport button actions,
 * such as saving the current topology (node positions and extra label data) and sending it
 * to the backend.
 */
export class ManagerViewportButtons {
  // private viewportPanels: ManagerViewportPanels;
  private messageSender: VscodeMessageSender;

  /**
   * Creates an instance of ManagerViewportButtons.
   */
  constructor(
    messageSender: VscodeMessageSender,
    // viewportPanels: ManagerViewportPanels
  ) {
    this.messageSender = messageSender;
    // this.viewportPanels = viewportPanels;

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
  public async viewportButtonsSaveTopo(
    cy: cytoscape.Core,
    suppressNotification = false
  ): Promise<void> {
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
          "topo-editor-viewport-save-suppress-notification", // aarafat-tag: enforce to use suppress-notification
          updatedElements
        );
        console.log("Response from backend:", response);
      } else {

        const endpoint = suppressNotification
          ? "topo-editor-viewport-save-suppress-notification"
          : "topo-editor-viewport-save";

        console.log("Suppressing notification for save action.");
        // Send the updated topology data to the backend.
        const response = await this.messageSender.sendMessageToVscodeEndpointPost(
          endpoint,
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
   * This method sends a reload command to the VS Code extension backend, waits briefly
   * to allow the backend to process the request, and then re-fetches and re-loads
   * the topology data into the provided Cytoscape instance.
   *
   * @async
   * @param cy - The Cytoscape core instance whose viewport will be reloaded.
   * @param delayMs - Optional delay in milliseconds before reloading the data.
   * @returns A promise that resolves once the reload sequence has been initiated.
   */
  public async viewportButtonsReloadTopo(cy: cytoscape.Core, delayMs = 1000): Promise<void> {
    try {
      const response = await this.messageSender.sendMessageToVscodeEndpointPost("topo-editor-reload-viewport", "Empty Payload");
      console.log("############### response from backend:", response);
      await this.sleep(delayMs);
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

    // Get the current viewport bounds
    const extent = cy.extent();

    // Use event position if available and within viewport
    let position = event.position;

    if (!position ||
      position.x < extent.x1 || position.x > extent.x2 ||
      position.y < extent.y1 || position.y > extent.y2) {
      // Calculate a position within the current viewport
      const viewportCenterX = (extent.x1 + extent.x2) / 2;
      const viewportCenterY = (extent.y1 + extent.y2) / 2;
      const viewportWidth = extent.x2 - extent.x1;
      const viewportHeight = extent.y2 - extent.y1;

      // Add some randomness but keep within 60% of the viewport size from center
      const maxOffsetX = viewportWidth * 0.3;
      const maxOffsetY = viewportHeight * 0.3;

      position = {
        x: viewportCenterX + (Math.random() - 0.5) * maxOffsetX,
        y: viewportCenterY + (Math.random() - 0.5) * maxOffsetY
      };
    }

    cy.add({ group: 'nodes', data: newNodeData, position });

    // Note: Removed cy.fit() to keep the current view
  }

  // sleep funtion
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Toggles the visibility of the node editor panel.
   *
   * This method checks if the node editor panel is currently visible and toggles its display state.
   * If the panel is visible, it hides it; if hidden, it shows the panel.
   *
   */
  public viewportButtonsPanelGroupManager = {
    panelGroupTogle: (newParentId: string): void => {
      const panel = document.getElementById("panel-node-editor-parent");
      if (!panel) {
        console.warn("Parent editor panel not found");
        return;
      }

      panel.style.display = "block";

      const [group, level] = newParentId.split(":");
      const groupIdLabel = document.getElementById("panel-node-editor-parent-graph-group-id");
      const groupInput = document.getElementById("panel-node-editor-parent-graph") as HTMLInputElement | null;
      const levelInput = document.getElementById("panel-node-editor-parent-graph-level") as HTMLInputElement | null;

      if (groupIdLabel) groupIdLabel.textContent = newParentId;
      if (groupInput) groupInput.value = group;
      if (levelInput) levelInput.value = level;
    },
    orphaningNode: (cy: cytoscape.Core, node: cytoscape.NodeSingular): void => {
      const parentCollection = node.parent();
      const currentParentId = parentCollection.nonempty() ? parentCollection[0].id() : "";
      const formerParentNode = cy.getElementById(currentParentId);
      node.move({ parent: null });
      if (formerParentNode.isChildless()) {
        console.info("Removing empty parent node");
        formerParentNode.remove();
      }
    },

    createNewParent: (cy: cytoscape.Core, options: { nodeToReparent?: cytoscape.NodeSingular | null; createDummyChild?: boolean } = {}): string => {
      const { nodeToReparent = null, createDummyChild = false } = options;

      let counter = 1;
      let newParentId = `groupName${(cy.nodes().length + counter)}:1`;
      while (cy.getElementById(newParentId).length > 0) {
        counter++;
        newParentId = `groupName${(cy.nodes().length + counter)}:1`;
      }

      const ext = cy.extent();
      const offsetMin = 10;
      const offsetMax = 50;
      const randomOffset = Math.random() * (offsetMax - offsetMin) + offsetMin;
      const topCenterX = (ext.x1 + ext.x2 + randomOffset) / 2;
      const topCenterY = ext.y1 + 2 * randomOffset;

      const parentNodeData: cytoscape.ElementDefinition = {
        group: 'nodes',
        data: {
          id: newParentId,
          name: newParentId.split(":")[0],
          weight: "1000",
          topoViewerRole: "group",
          extraData: {
            clabServerUsername: "asad",
            weight: "2",
            name: "",
            topoViewerGroup: newParentId.split(":")[0],
            topoViewerGroupLevel: newParentId.split(":")[1]
          }
        },
        position: { x: topCenterX, y: topCenterY },
        selectable: true,
        grabbable: true
      };

      const nodesToAdd: cytoscape.ElementDefinition[] = [parentNodeData];

      if (createDummyChild) {
        nodesToAdd.push({
          group: 'nodes',
          data: {
            id: `${newParentId}:dummyChild`,
            parent: newParentId,
            topoViewerRole: "dummyChild"
          },
          position: { x: topCenterX, y: topCenterY },
          selectable: false,
          grabbable: false,
          classes: 'dummy'
        });
      }

      cy.add(nodesToAdd);

      if (nodeToReparent) {
        nodeToReparent.move({ parent: newParentId });
        nodeToReparent.data('parent', newParentId);
      }

      const panel = document.getElementById("panel-node-editor-parent");
      if (panel) {
        panel.style.display = "block";
        const [group, level] = newParentId.split(":");
        (document.getElementById("panel-node-editor-parent-graph-group-id") as HTMLElement).textContent = newParentId;
        (document.getElementById("panel-node-editor-parent-graph-group") as HTMLInputElement).value = group;
        (document.getElementById("panel-node-editor-parent-graph-level") as HTMLInputElement).value = level;
      }

      return newParentId;
    },

    panelNodeEditorParentToggleDropdown: (): void => {
      const dropdown = document.getElementById('panel-node-editor-parent-label-dropdown');
      // if (!dropdown || dropdown.dataset.listenersAttached) return;
      if (!dropdown) return;

      const items = document.querySelectorAll('#panel-node-editor-parent-label-dropdown-menu .dropdown-item');
      items.forEach(item => {
        item.addEventListener('click', function (this: HTMLElement, event) {
          event.preventDefault();

          const selectedText = this.textContent || "";
          const targetTextEl = document.getElementById('panel-node-editor-parent-label-dropdown-button-text');
          if (targetTextEl) targetTextEl.textContent = selectedText;

          dropdown.classList.remove('is-active');
        });
      });

      dropdown.dataset.listenersAttached = 'true';
      dropdown.classList.toggle('is-active');
    },


    nodeParentPropertiesUpdate: async (cy: cytoscape.Core): Promise<void> => {
      try {
        const parentIdEl = document.getElementById("panel-node-editor-parent-graph-group-id");
        const groupInputEl = document.getElementById("panel-node-editor-parent-graph-group") as HTMLInputElement;
        const levelInputEl = document.getElementById("panel-node-editor-parent-graph-level") as HTMLInputElement;
        const labelPositionEl = document.getElementById("panel-node-editor-parent-label-dropdown-button-text");

        if (!parentIdEl || !groupInputEl || !levelInputEl || !labelPositionEl) {
          throw new Error("Missing UI elements.");
        }

        const parentNodeId = parentIdEl.textContent?.trim();
        if (!parentNodeId) throw new Error("Empty parent ID.");

        const oldParentNode = cy.getElementById(parentNodeId);
        if (oldParentNode.empty()) throw new Error(`No parent node with ID "${parentNodeId}"`);

        const graphGroup = groupInputEl.value.trim();
        const graphLevel = levelInputEl.value.trim();
        const newParentId = `${graphGroup}:${graphLevel}`;
        const groupLabelPosition = labelPositionEl.textContent?.trim().toLowerCase();

        const validLabelClasses = [
          "top-center",
          "top-left",
          "top-right",
          "bottom-center",
          "bottom-left",
          "bottom-right"
        ];

        const updateLabelPositionClass = (node: cytoscape.NodeSingular, pos: string) => {
          validLabelClasses.forEach(cls => node.removeClass(cls));
          if (validLabelClasses.includes(pos)) node.addClass(pos);
        };

        if (parentNodeId === newParentId) {
          if (groupLabelPosition && groupLabelPosition !== "select position") {
            updateLabelPositionClass(oldParentNode, groupLabelPosition);
          }
          return;
        }

        if (!cy.getElementById(newParentId).empty()) {
          throw new Error(`Parent ID "${newParentId}" already exists.`);
        }

        cy.add({
          group: 'nodes',
          data: {
            id: newParentId,
            name: graphGroup,
            topoViewerRole: "group",
            extraData: {
              clabServerUsername: "asad",
              weight: "2",
              name: "",
              topoViewerGroup: graphGroup,
              topoViewerGroupLevel: graphLevel
            }
          }
        });

        const newParentNode = cy.getElementById(newParentId);
        oldParentNode.children().forEach(child => {
          child.data('parent', newParentId);
          child.move({ parent: newParentId });
        });

        oldParentNode.remove();
        parentIdEl.textContent = newParentId;
        if (groupLabelPosition && groupLabelPosition !== "select position") {
          updateLabelPositionClass(newParentNode, groupLabelPosition);
        }
      } catch (error) {
        console.error("nodeParentPropertiesUpdate error:", error);
      }
    },

    nodeParentPropertiesUpdateClose: (): boolean => {
      try {
        const panel = document.getElementById("panel-node-editor-parent");
        if (panel) {
          panel.style.display = "none";
          return true;
        }
        return false;
      } catch (e) {
        console.error("Error closing panel:", e);
        return false;
      }
    },

    nodeParentRemoval: (cy: cytoscape.Core): boolean => {
      try {
        const parentIdEl = document.getElementById("panel-node-editor-parent-graph-group-id");
        const parentNodeId = parentIdEl?.textContent?.trim();

        console.log("Removing parent node with ID:", parentNodeId);

        if (!parentNodeId) throw new Error("Empty parent ID");

        const parentNode = cy.getElementById(parentNodeId);
        if (parentNode.empty()) throw new Error(`Parent node "${parentNodeId}" not found.`);

        const dummyChild = parentNode.children('[topoViewerRole = "dummyChild"]');
        const children = parentNode.children();

        children.forEach((child: cytoscape.NodeSingular) => {
          child.move({ parent: null });
        });
        parentNode.remove();
        dummyChild.remove();

        const panel = document.getElementById("panel-node-editor-parent");
        if (panel) panel.style.display = "none";

        return true;
      } catch (err) {
        console.error("Error in nodeParentRemoval:", err);
        return false;
      }
    }
  };

  // Future methods for additional viewport buttons can be added here.
}
