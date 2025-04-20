// file: managerViewportPanels.ts

import cytoscape from 'cytoscape';
import { ManagerViewportButtons } from './managerViewportButtons';
import { extractNodeIcons } from './managerCytoscapeStyle';
import { VscodeMessageSender } from './managerVscodeWebview';


/**
 * ManagerViewportPanels handles the UI panels associated with the Cytoscape viewport.
 * It manages the node editor panel and toggles panels based on user interactions.
 */
export class ManagerViewportPanels {
  private isPanel01Cy: boolean = false;
  private nodeClicked: boolean = false;
  private edgeClicked: boolean = false;
  private globalSelectedNode: string = "";
  // Variables to store the current selection for dropdowns.
  private panelNodeEditorKind: string = "nokia_srlinux";
  private panelNodeEditorTopoViewerRole: string = "pe";

  /**
   * Creates an instance of ManagerViewportPanels.
   * @param viewportButtons - The ManagerViewportButtons instance.
   * @param cy - The Cytoscape instance.
   */
  constructor(
    private viewportButtons: ManagerViewportButtons,
    private cy: cytoscape.Core,
    private messageSender: VscodeMessageSender
  ) { }

  /**
   * Registers a click event on the Cytoscape container to toggle UI panels.
   * If no node or edge was clicked, it hides overlay panels and viewport drawers.
   *
   * @param containerId - The ID of the Cytoscape container (e.g., "cy").
   */
  public registerTogglePanels(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn("Cytoscape container not found:", containerId);
      return;
    }

    container.addEventListener("click", async (event: MouseEvent) => {
      console.info("cy container clicked init");
      console.info("isPanel01Cy:", this.isPanel01Cy);
      console.info("nodeClicked:", this.nodeClicked);
      console.info("edgeClicked:", this.edgeClicked);

      // Execute toggle logic only when no node or edge was clicked.
      if (!this.nodeClicked && !this.edgeClicked) {
        console.info("!nodeClicked  -- !edgeClicked");
        if (!this.isPanel01Cy) {
          console.info("!isPanel01Cy:");
          // Remove all overlay panels.
          const panelOverlays = document.getElementsByClassName("panel-overlay");
          console.info("panelOverlays:", panelOverlays);
          for (let i = 0; i < panelOverlays.length; i++) {
            (panelOverlays[i] as HTMLElement).style.display = "none";
          }

          // Hide viewport drawers.
          const viewportDrawers = document.getElementsByClassName("viewport-drawer");
          for (let i = 0; i < viewportDrawers.length; i++) {
            (viewportDrawers[i] as HTMLElement).style.display = "none";
          }

          // Hide any elements with the class "ViewPortDrawer".
          const viewPortDrawerElements = document.getElementsByClassName("ViewPortDrawer");
          Array.from(viewPortDrawerElements).forEach((element) => {
            (element as HTMLElement).style.display = "none";
          });
        } else {
          this.removeElementById("Panel-01");
          this.appendMessage("try to remove panel01-Cy");
        }
      }
      // Reset the click flags.
      this.nodeClicked = false;
      this.edgeClicked = false;
    });
  }

  /**
   * Displays the node editor panel for the provided node.
   * Removes any overlay panels, updates editor fields with the node's data,
   * and fetches additional configuration from a JSON schema.
   *
   * @param node - The Cytoscape node for which to show the editor.
   * @returns A promise that resolves when the panel is configured.
   */
  public async panelNodeEditor(node: cytoscape.NodeSingular): Promise<void> {
    // Remove all overlay panels.
    const panelOverlays = document.getElementsByClassName("panel-overlay");
    Array.from(panelOverlays).forEach((panel) => {
      (panel as HTMLElement).style.display = "none";
    });

    console.log("panelNodeEditor - node ID:", node.data("id"));

    // Set the node ID in the editor.
    const panelNodeEditorIdLabel = document.getElementById("panel-node-editor-id");
    if (panelNodeEditorIdLabel) {
      panelNodeEditorIdLabel.textContent = node.data("id");
    }

    // Set the node name in the editor.
    const panelNodeEditorNameInput = document.getElementById("panel-node-editor-name") as HTMLInputElement;
    if (panelNodeEditorNameInput) {
      panelNodeEditorNameInput.value = node.data("name");
    }

    // Set the node image in the editor.
    const panelNodeEditorImageLabel = document.getElementById("panel-node-editor-image") as HTMLInputElement;
    if (panelNodeEditorImageLabel) {
      panelNodeEditorImageLabel.value = 'ghcr.io/nokia/srlinux:latest';
    }

    // Set the node group in the editor.
    const panelNodeEditorGroupLabel = document.getElementById("panel-node-editor-group") as HTMLInputElement;
    if (panelNodeEditorGroupLabel) {
      const parentNode = node.parent();
      const parentLabel = parentNode.data('name');
      console.log('Parent Node Label:', parentLabel);
      panelNodeEditorGroupLabel.value = parentLabel;
    }

    // Display the node editor panel.
    const panelNodeEditor = document.getElementById("panel-node-editor");
    if (panelNodeEditor) {
      panelNodeEditor.style.display = "block";
    }

    // Fetch JSON schema.
    const url = `${(window as any).jsUrl}/clabJsonSchema-v0.59.0.json`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const jsonData = await response.json();

      // Get kind enums from the JSON schema.
      const { kindOptions } = this.panelNodeEditorGetKindEnums(jsonData);
      console.log('Kind Enum:', kindOptions);
      // Populate the kind dropdown.
      this.panelNodeEditorPopulateKindDropdown(kindOptions);

      // Populate the topoViewerRole dropdown.
      const topoViewerRoleOptions = [
        "bridge", "controller", "dcgw", "router", "leaf", "pe", "pon", "rgw", "server", "super-spine", "spine"
      ];

      // Then call the function:
      const nodeIcons = extractNodeIcons();
      console.log("Extracted node icons:", nodeIcons);

      this.panelNodeEditorPopulateTopoViewerRoleDropdown(nodeIcons);

      // List type enums based on a kind pattern.
      const typeOptions = this.panelNodeEditorGetTypeEnumsByKindPattern(jsonData, '(srl|nokia_srlinux)');
      console.log('Type Enum for (srl|nokia_srlinux):', typeOptions);

      // Register the close button event.
      const panelNodeEditorCloseButton = document.getElementById("panel-node-editor-close-button");
      if (panelNodeEditorCloseButton && panelNodeEditor) {
        panelNodeEditorCloseButton.addEventListener("click", () => {
          panelNodeEditor.style.display = "none";
        });
      }

      // Register the save button event.
      const panelNodeEditorSaveButton = document.getElementById("panel-node-editor-save-button");
      if (panelNodeEditorSaveButton) {
        const newSaveButton = panelNodeEditorSaveButton.cloneNode(true) as HTMLElement;
        panelNodeEditorSaveButton.parentNode?.replaceChild(newSaveButton, panelNodeEditorSaveButton);
        newSaveButton.addEventListener("click", async () => {
          await this.updateNodeFromEditor(node);
          // Now trigger the viewportButtonsSaveTopo method.
          await this.viewportButtons.viewportButtonsSaveTopo(this.cy, this.messageSender);
        }, { once: true });
      }
    } catch (error: any) {
      console.error("Error fetching or processing JSON data:", error.message);
      throw error;
    }
  }

  /**
   * Updates the provided Cytoscape node with data from the editor panel.
   * This method retrieves updated values from the editor and applies them to the node.
   *
   * @param node - The Cytoscape node to update.
   * @returns A promise that resolves when the node data has been updated.
   */
  public async updateNodeFromEditor(node: cytoscape.NodeSingular): Promise<void> {
    // Ensure we target a single node even if a collection is passed.
    const targetNode: cytoscape.NodeSingular = (node as any).length && (node as any).length > 1 ? (node as any)[0] : node;

    // Get the input values.
    const nodeNameInput = document.getElementById("panel-node-editor-name") as HTMLInputElement;
    const nodeImageInput = document.getElementById("panel-node-editor-image") as HTMLInputElement;

    // Retrieve dropdown selections.
    const kindDropdownTrigger = document.querySelector("#panel-node-kind-dropdown .dropdown-trigger button span");
    const topoViewerRoleDropdownTrigger = document.querySelector("#panel-node-topoviewerrole-dropdown .dropdown-trigger button span");

    // Retrieve current node data.
    const currentData = targetNode.data();
    const oldName = currentData.name as string;              // remember old name
    const newName = nodeNameInput.value;                    // the new name

    // Build updated extraData, preserving other fields.
    const updatedExtraData = {
      ...currentData.extraData,
      name: nodeNameInput.value,
      image: nodeImageInput.value,
      kind: kindDropdownTrigger ? kindDropdownTrigger.textContent : 'nokia_srlinux',
    };

    // Build the updated data object.
    const updatedData = {
      ...currentData,
      name: nodeNameInput.value,
      topoViewerRole: topoViewerRoleDropdownTrigger ? topoViewerRoleDropdownTrigger.textContent : 'pe',
      extraData: updatedExtraData,
    };

    // Update the Cytoscape node data.
    targetNode.data(updatedData);
    console.log("Cytoscape node updated with new data_::", updatedData);

    // If the node’s name actually changed, update connected edges.
    if (oldName !== newName) {
      const edges = targetNode.connectedEdges();
      edges.forEach(edge => {
        const edgeData = edge.data();
        let modified = false;
        const updatedEdgeData: any = { ...edgeData };

        // Update sourceName if it pointed to our old name
        if (edgeData.sourceName === oldName) {
          updatedEdgeData.sourceName = newName;
          modified = true;
        }
        // Update targetName if it pointed to our old name
        if (edgeData.targetName === oldName) {
          updatedEdgeData.targetName = newName;
          modified = true;
        }
        if (modified) {
          edge.data(updatedEdgeData);
          console.log(`Edge ${edge.id()} updated to reflect node rename:`, updatedEdgeData);
        }
      });
    }

    // Optionally, hide the node editor panel.
    const panelNodeEditor = document.getElementById("panel-node-editor");
    if (panelNodeEditor) {
      panelNodeEditor.style.display = "none";
    }
  }

  // --- Private helper methods ---

  /**
   * Extracts the kind enumeration options from the JSON schema.
   *
   * @param jsonData - The JSON schema data.
   * @returns An object containing the kindOptions array and the original schema data.
   * @throws Will throw an error if the JSON structure is invalid or 'kind' enum is not found.
   */
  private panelNodeEditorGetKindEnums(jsonData: any): { kindOptions: string[]; schemaData: any } {
    let kindOptions: string[] = [];
    if (jsonData && jsonData.definitions && jsonData.definitions['node-config']) {
      kindOptions = jsonData.definitions['node-config'].properties.kind.enum || [];
    } else {
      throw new Error("Invalid JSON structure or 'kind' enum not found");
    }
    return { kindOptions, schemaData: jsonData };
  }

  /**
   * Populates the kind dropdown with the provided options.
   *
   * @param options - An array of kind option strings.
   */
  private panelNodeEditorPopulateKindDropdown(options: string[]): void {
    const dropdownTrigger = document.querySelector("#panel-node-kind-dropdown .dropdown-trigger button span");
    const dropdownContent = document.getElementById("panel-node-kind-dropdown-content");
    const dropdownButton = document.querySelector("#panel-node-kind-dropdown .dropdown-trigger button");
    const dropdownContainer = dropdownButton ? dropdownButton.closest(".dropdown") : null;

    if (!dropdownTrigger || !dropdownContent || !dropdownButton || !dropdownContainer) {
      console.error("Dropdown elements not found in the DOM.");
      return;
    }

    // Set the initial value on the dropdown button.
    dropdownTrigger.textContent = this.panelNodeEditorKind;
    // Clear any existing content.
    dropdownContent.innerHTML = "";

    options.forEach(option => {
      const optionElement = document.createElement("a");
      optionElement.classList.add("dropdown-item", "label", "has-text-weight-normal", "is-small", "py-0");
      optionElement.textContent = option;
      optionElement.href = "#";

      optionElement.addEventListener("click", (event) => {
        event.preventDefault();
        this.panelNodeEditorKind = option;
        console.log(`${this.panelNodeEditorKind} selected`);
        dropdownTrigger.textContent = this.panelNodeEditorKind;
        dropdownContainer.classList.remove("is-active");
      });

      dropdownContent.appendChild(optionElement);
    });
  }

  /**
   * Populates the topoViewerRole dropdown with the provided options.
   *
   * @param options - An array of topoViewerRole option strings.
   */
  private panelNodeEditorPopulateTopoViewerRoleDropdown(options: string[]): void {
    const dropdownTrigger = document.querySelector("#panel-node-topoviewerrole-dropdown .dropdown-trigger button span");
    const dropdownContent = document.getElementById("panel-node-topoviewerrole-dropdown-content");
    const dropdownButton = document.querySelector("#panel-node-topoviewerrole-dropdown .dropdown-trigger button");
    const dropdownContainer = dropdownButton ? dropdownButton.closest(".dropdown") : null;

    if (!dropdownTrigger || !dropdownContent || !dropdownButton || !dropdownContainer) {
      console.error("Dropdown elements not found in the DOM.");
      return;
    }

    // Set the initial value on the dropdown button.
    dropdownTrigger.textContent = this.panelNodeEditorTopoViewerRole;
    // Clear any existing content.
    dropdownContent.innerHTML = "";

    options.forEach(option => {
      const optionElement = document.createElement("a");
      optionElement.classList.add("dropdown-item", "label", "has-text-weight-normal", "is-small", "py-0");
      optionElement.textContent = option;
      optionElement.href = "#";

      optionElement.addEventListener("click", (event) => {
        event.preventDefault();
        this.panelNodeEditorTopoViewerRole = option;
        console.log(`${this.panelNodeEditorTopoViewerRole} selected`);
        dropdownTrigger.textContent = this.panelNodeEditorTopoViewerRole;
        dropdownContainer.classList.remove("is-active");
      });

      dropdownContent.appendChild(optionElement);
    });
  }

  /**
   * Extracts type enumeration options from the JSON schema based on a kind pattern.
   *
   * @param jsonData - The JSON schema data.
   * @param pattern - A regex pattern (as a string) to match the kind property.
   * @returns An array of type enum strings.
   */
  private panelNodeEditorGetTypeEnumsByKindPattern(jsonData: any, pattern: string): string[] {
    if (
      jsonData &&
      jsonData.definitions &&
      jsonData.definitions['node-config'] &&
      jsonData.definitions['node-config'].allOf
    ) {
      for (const condition of jsonData.definitions['node-config'].allOf) {
        if (
          condition.if &&
          condition.if.properties &&
          condition.if.properties.kind &&
          condition.if.properties.kind.pattern === pattern
        ) {
          if (
            condition.then &&
            condition.then.properties &&
            condition.then.properties.type &&
            condition.then.properties.type.enum
          ) {
            return condition.then.properties.type.enum;
          }
        }
      }
    }
    return [];
  }

  /**
   * Removes a DOM element by its ID.
   *
   * @param id - The ID of the element to remove.
   */
  private removeElementById(id: string): void {
    const el = document.getElementById(id);
    if (el) {
      el.remove();
    }
  }

  /**
   * Appends or logs a message.
   *
   * @param message - The message to display.
   */
  private appendMessage(message: string): void {
    console.log(message);
    // Optionally, integrate with a VS Code message sender here if needed.
  }

  /**
   * Sets the flag indicating whether a node was clicked.
   *
   * @param flag - True if a node was clicked; otherwise, false.
   */
  public setNodeClicked(flag: boolean): void {
    this.nodeClicked = flag;
  }

  /**
   * Sets the flag indicating whether an edge was clicked.
   *
   * @param flag - True if an edge was clicked; otherwise, false.
   */
  public setEdgeClicked(flag: boolean): void {
    this.edgeClicked = flag;
  }

  /**
   * Sets the flag for panel 01 state in the Cytoscape container.
   *
   * @param flag - True to enable panel 01; otherwise, false.
   */
  public setPanel01Cy(flag: boolean): void {
    this.isPanel01Cy = flag;
  }
}
