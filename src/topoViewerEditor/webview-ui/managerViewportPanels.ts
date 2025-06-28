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
  private viewportButtons: ManagerViewportButtons;
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender;
  private isPanel01Cy = false;
  public nodeClicked: boolean = false;
  public edgeClicked: boolean = false;
  // Variables to store the current selection for dropdowns.
  private panelNodeEditorKind: string = "nokia_srlinux";
  private panelNodeEditorType: string = "";
  private panelNodeEditorUseDropdownForType: boolean = false;
  private panelNodeEditorTopoViewerRole: string = "pe";
  private nodeSchemaData: any = null;
  /**
   * Creates an instance of ManagerViewportPanels.
   * @param viewportButtons - The ManagerViewportButtons instance.
   * @param cy - The Cytoscape instance.
   */
  constructor(
    viewportButtons: ManagerViewportButtons,
    cy: cytoscape.Core,
    messageSender: VscodeMessageSender
  ) {
    this.viewportButtons = viewportButtons;
    this.cy = cy;
    this.messageSender = messageSender;
    this.toggleHidePanels("cy"); // Initialize the toggle for hiding panels.
  }

  /**
   * Toggle to hide UI panels.
   * If no node or edge was clicked, it hides overlay panels and viewport drawers.
   *
   * @param containerId - The ID of the Cytoscape container (e.g., "cy").
   */
  public toggleHidePanels(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn("Cytoscape container not found:", containerId);
      return;
    }

    container.addEventListener("click", async () => {
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

    // Set the node type in the editor.
    const extraData = node.data('extraData') || {};
    this.panelNodeEditorKind = extraData.kind || this.panelNodeEditorKind;
    this.panelNodeEditorType = extraData.type || '';
    this.panelNodeEditorUseDropdownForType = false;

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
    const url = (window as any).schemaUrl;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const jsonData = await response.json();

      this.nodeSchemaData = jsonData;

      // Get kind enums from the JSON schema.
      const { kindOptions } = this.panelNodeEditorGetKindEnums(jsonData);
      console.log('Kind Enum:', kindOptions);
      // Populate the kind dropdown.
      this.panelNodeEditorPopulateKindDropdown(kindOptions);

      const typeOptions = this.panelNodeEditorGetTypeEnumsByKindPattern(jsonData, `(${this.panelNodeEditorKind})`);
      this.panelNodeEditorSetupTypeField(typeOptions);

      // Then call the function:
      const nodeIcons = extractNodeIcons();
      console.log("Extracted node icons:", nodeIcons);

      this.panelNodeEditorPopulateTopoViewerRoleDropdown(nodeIcons);



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
          const suppressNotification = false;
          await this.viewportButtons.viewportButtonsSaveTopo(this.cy, suppressNotification);
        }, { once: true });
      }
    } catch (error: any) {
      console.error("Error fetching or processing JSON data:", error.message);
      throw error;
    }
  }


  /**
   * Displays the edge editor panel for the provided edge.
   * Removes any overlay panels, updates form fields with the edge’s current source/target endpoints,
   * and wires up the Close/Save buttons.
   *
   * @param edge - The Cytoscape edge to edit.
   * @returns A promise that resolves when the panel is fully configured and shown.
   */
  public async panelEdgeEditor(edge: cytoscape.EdgeSingular): Promise<void> {
    try {
      // 1) Hide other overlays
      const overlays = document.getElementsByClassName("panel-overlay");
      Array.from(overlays).forEach(el => (el as HTMLElement).style.display = "none");

      // 2) Grab the static parts and initial data
      const panelLinkEditor = document.getElementById("panel-link-editor");
      const panelLinkEditorIdLabel = document.getElementById("panel-link-editor-id");
      const panelLinkEditorIdLabelSrcInput = document.getElementById("panel-link-editor-source-endpoint") as HTMLInputElement | null;
      const panelLinkEditorIdLabelTgtInput = document.getElementById("panel-link-editor-target-endpoint") as HTMLInputElement | null;
      // const panelLinkEditorIdLabelCloseBtn = document.getElementById("panel-link-editor-close-button");
      const panelLinkEditorIdLabelSaveBtn = document.getElementById("panel-link-editor-save-button");

      // if (!panelLinkEditorIdLabel || !panelLinkEditor || !panelLinkEditorIdLabelSrcInput || !panelLinkEditorIdLabelTgtInput || !panelLinkEditorIdLabelCloseBtn || !panelLinkEditorIdLabelSaveBtn) {
      if (!panelLinkEditorIdLabel || !panelLinkEditor || !panelLinkEditorIdLabelSrcInput || !panelLinkEditorIdLabelTgtInput || !panelLinkEditorIdLabelSaveBtn) {

        console.error("panelEdgeEditor: missing required DOM elements");
        return;
      }
      const source = edge.data("source") as string;
      const target = edge.data("target") as string;
      const sourceEP = (edge.data("sourceEndpoint") as string) || "";
      const targetEP = (edge.data("targetEndpoint") as string) || "";

      // Populate inputs with current endpoint values
      panelLinkEditorIdLabelSrcInput.value = sourceEP;
      panelLinkEditorIdLabelTgtInput.value = targetEP;

      // Helper to sync the ID label from whatever is in the inputs right now
      const updateLabel = () => {
        const s = panelLinkEditorIdLabelSrcInput.value.trim();
        const t = panelLinkEditorIdLabelTgtInput.value.trim();
        panelLinkEditorIdLabel.innerHTML =
          `┌ ${source} :: ${s}<br>` +
          `└ ${target} :: ${t}`;
      };

      // Initial label fill
      updateLabel();

      // 3) Show the panel
      panelLinkEditor.style.display = "block";

      // 4) Re-wire Close button (one-shot)
      // const freshClose = panelLinkEditorIdLabelCloseBtn.cloneNode(true) as HTMLElement;
      // panelLinkEditorIdLabelCloseBtn.parentNode!.replaceChild(freshClose, panelLinkEditorIdLabelCloseBtn);
      // freshClose.addEventListener("click", () => panelLinkEditor.style.display = "none", { once: true });

      // 5) Wire real-time preview (optional but helpful)
      panelLinkEditorIdLabelSrcInput.addEventListener("input", updateLabel);
      panelLinkEditorIdLabelTgtInput.addEventListener("input", updateLabel);

      // 6) Wire up Save button
      if (panelLinkEditorIdLabelSaveBtn) {
        const freshSave = panelLinkEditorIdLabelSaveBtn.cloneNode(true) as HTMLElement;
        panelLinkEditorIdLabelSaveBtn.parentNode?.replaceChild(freshSave, panelLinkEditorIdLabelSaveBtn);

        freshSave.addEventListener(
          "click",
          async () => {
            try {
              // 6a) Update edge data from inputs
              const newSourceEP = panelLinkEditorIdLabelSrcInput.value.trim();
              const newTargetEP = panelLinkEditorIdLabelTgtInput.value.trim();
              edge.data({
                sourceEndpoint: newSourceEP,
                targetEndpoint: newTargetEP
              });

              // 6b) Persist changes (with notification)
              await this.viewportButtons.viewportButtonsSaveTopo(
                this.cy,
                /* suppressNotification */ false
              );

              // 6c) Refresh the ID label so it shows saved values
              if (panelLinkEditorIdLabel) {
                panelLinkEditorIdLabel.innerHTML =
                  `┌ ${source} :: ${sourceEP}<br>` +
                  `└ ${target} :: ${targetEP}`;
              }

              // 6d) Hide the panel
              panelLinkEditor.style.display = "none";
            } catch (saveErr) {
              console.error("panelEdgeEditor: error during save", saveErr);
              // TODO: show user-facing notification if needed
            }
          },
          { once: true }
        );
      }

    } catch (err) {
      console.error("panelEdgeEditor: unexpected error", err);
      // TODO: show user-facing notification if needed
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
    const typeDropdownTrigger = document.querySelector("#panel-node-type-dropdown .dropdown-trigger button span");
    const typeInput = document.getElementById("panel-node-editor-type-input") as HTMLInputElement;

    // Retrieve dropdown selections.
    const kindDropdownTrigger = document.querySelector("#panel-node-kind-dropdown .dropdown-trigger button span");
    const topoViewerRoleDropdownTrigger = document.querySelector("#panel-node-topoviewerrole-dropdown .dropdown-trigger button span");

    // Retrieve current node data.
    const currentData = targetNode.data();
    const oldName = currentData.name as string;              // remember old name
    const newName = nodeNameInput.value;                    // the new name

    // Build updated extraData, preserving other fields.
    const typeValue = this.panelNodeEditorUseDropdownForType
      ? (typeDropdownTrigger ? (typeDropdownTrigger as HTMLElement).textContent || '' : '')
      : (typeInput ? typeInput.value : '');

    const updatedExtraData = {
      ...currentData.extraData,
      name: nodeNameInput.value,
      image: nodeImageInput.value,
      kind: kindDropdownTrigger ? kindDropdownTrigger.textContent : 'nokia_srlinux',
    };

    if (this.panelNodeEditorUseDropdownForType || typeValue.trim() !== '') {
      updatedExtraData.type = typeValue;
    } else if ('type' in updatedExtraData) {
      delete updatedExtraData.type;
    }

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
        const typeOptions = this.panelNodeEditorGetTypeEnumsByKindPattern(this.nodeSchemaData, `(${option})`);
        // Reset the stored type when kind changes
        this.panelNodeEditorType = "";
        this.panelNodeEditorSetupTypeField(typeOptions);
      });

    dropdownContent.appendChild(optionElement);
    });
  }

  private panelNodeEditorSetupTypeField(options: string[]): void {
    const dropdown = document.getElementById("panel-node-type-dropdown");
    const input = document.getElementById("panel-node-editor-type-input") as HTMLInputElement;

    if (!dropdown || !input) {
      console.error("Type input elements not found in the DOM.");
      return;
    }

    if (options.length > 0) {
      dropdown.style.display = "";
      input.style.display = "none";
      this.panelNodeEditorUseDropdownForType = true;
      // Ensure type matches available options
      if (!options.includes(this.panelNodeEditorType)) {
        this.panelNodeEditorType = options[0];
      }
      this.panelNodeEditorPopulateTypeDropdown(options);
    } else {
      dropdown.style.display = "none";
      input.style.display = "";
      this.panelNodeEditorUseDropdownForType = false;
      input.value = this.panelNodeEditorType || "";
      input.oninput = () => {
        this.panelNodeEditorType = input.value;
      };
    }
  }

  private panelNodeEditorPopulateTypeDropdown(options: string[]): void {
    const dropdownTrigger = document.querySelector("#panel-node-type-dropdown .dropdown-trigger button span");
    const dropdownContent = document.getElementById("panel-node-type-dropdown-content");
    const dropdownButton = document.querySelector("#panel-node-type-dropdown .dropdown-trigger button");
    const dropdownContainer = dropdownButton ? dropdownButton.closest(".dropdown") : null;

    if (!dropdownTrigger || !dropdownContent || !dropdownButton || !dropdownContainer) {
      console.error("Dropdown elements not found in the DOM.");
      return;
    }

    if (!options.includes(this.panelNodeEditorType)) {
      this.panelNodeEditorType = options.length > 0 ? options[0] : "";
    }
    dropdownTrigger.textContent = this.panelNodeEditorType || "";
    dropdownContent.innerHTML = "";

    options.forEach(option => {
      const optionElement = document.createElement("a");
      optionElement.classList.add("dropdown-item", "label", "has-text-weight-normal", "is-small", "py-0");
      optionElement.textContent = option;
      optionElement.href = "#";

      optionElement.addEventListener("click", (event) => {
        event.preventDefault();
        this.panelNodeEditorType = option;
        dropdownTrigger.textContent = this.panelNodeEditorType;
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
    * Displays the TopoViewer panel
    * Removes any overlay panels, updates form fields with the edge’s current source/target endpoints,
    *
    * @returns A promise that resolves when the panel is fully configured and shown.
    */
  public async panelAbout(): Promise<void> {
    try {
      // 1) Hide other overlays
      const overlays = document.getElementsByClassName("panel-overlay");
      Array.from(overlays).forEach(el => (el as HTMLElement).style.display = "none");

      // 2) Grab the static parts and initial data
      const panelTopoviewerAbout = document.getElementById("panel-topoviewer-about");

      if (!panelTopoviewerAbout) {
        console.error("panelTopoviewerAbout: missing required DOM elements");
        return;
      }

      // 3) Show the panel
      panelTopoviewerAbout.style.display = "block";

    }
    catch (err) {
      console.error("panelEdgeEditor: unexpected error", err);
      // TODO: surface user-facing notification
    }
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
          if (condition.then && condition.then.properties && condition.then.properties.type) {
            const typeProp = condition.then.properties.type;
            if (typeProp.enum) {
              return typeProp.enum;
            }
            if (Array.isArray(typeProp.anyOf)) {
              for (const sub of typeProp.anyOf) {
                if (sub.enum) {
                  return sub.enum;
                }
              }
            }
          }
        }
      }
    }
    return [];
  }

  /**
   * Displays and populates the node's parent group editor panel.
   *
   * @param newParentId - The new parent ID in the format "group:level".
   *
   * panelNodeEditorGroupEditor is not implemented here, instead the panel for group editor is directly managed in viewportButtons class
   * due to the complexity of managing group and the need for a more comprehensive UI handling.
   *
   */


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
