import cytoscape from "cytoscape";
import { ManagerSaveTopo } from "../../core/SaveManager";
import { createFilterableDropdown } from "../../ui/FilterableDropdown";
import { extractNodeIcons } from "../canvas/BaseStyles";
import { createNodeIconOptionElement } from "../../ui/IconDropdownRenderer";
import { log } from "../../platform/logging/logger";
import {
  DEFAULT_INTERFACE_PATTERN,
  generateInterfaceName,
  getInterfaceIndex,
  parseInterfacePattern
} from "../../ui/InterfacePatternUtils";

/* eslint-disable no-unused-vars */
type BooleanSetter = (flag: boolean) => void;
/* eslint-enable no-unused-vars */

export class NodeEditorManager {
  private saveManager: ManagerSaveTopo;
  private cy: cytoscape.Core;
  private setNodeClicked: BooleanSetter;

  private panelNodeEditorKind: string = "nokia_srlinux";
  private panelNodeEditorType: string = "";
  private panelNodeEditorUseDropdownForType: boolean = false;
  private panelNodeEditorTopoViewerRole: string = "pe";
  private nodeSchemaData: any = null;
  private panelNodeEditorNode: cytoscape.NodeSingular | null = null;

  constructor(
    saveManager: ManagerSaveTopo,
    cy: cytoscape.Core,
    setNodeClicked: BooleanSetter
  ) {
    this.saveManager = saveManager;
    this.cy = cy;
    this.setNodeClicked = setNodeClicked;
  }

  public async panelNodeEditor(node: cytoscape.NodeSingular): Promise<void> {
    this.setNodeClicked(true);
    this.panelNodeEditorNode = node;
    this.populateNodeEditorBasics(node);
    const panel = this.showNodeEditorPanel();

    await this.refreshDockerImages();

    const url = window.schemaUrl;
    if (!url) throw new Error("Schema URL is undefined.");
    try {
      const jsonData = await this.fetchNodeSchema(url);
      this.nodeSchemaData = jsonData;
      this.populateKindAndType(jsonData);
      this.populateIconDropdown(extractNodeIcons());
      this.registerNodeEditorButtons(panel, node);
      this.setupDropdownCloseHandler();
    } catch (error: any) {
      log.error(`Error fetching or processing JSON data: ${error.message}`);
      throw error;
    }
  }

  private populateNodeEditorBasics(node: cytoscape.NodeSingular): void {
    log.debug(`panelNodeEditor - node ID: ${node.data("id")}`);
    const idLabel = document.getElementById("panel-node-editor-id");
    if (idLabel) idLabel.textContent = node.data("id");
    const nameInput = document.getElementById("node-name") as HTMLInputElement;
    if (nameInput) nameInput.value = node.data("name");
    const extra = node.data("extraData") || {};
    this.panelNodeEditorKind = extra.kind || this.panelNodeEditorKind;
    this.panelNodeEditorType = extra.type || "";
    this.panelNodeEditorUseDropdownForType = false;
    this.panelNodeEditorTopoViewerRole = node.data("topoViewerRole") || "pe";
  }

  private showNodeEditorPanel(): HTMLElement | null {
    const panel = document.getElementById("panel-node-editor");
    if (panel) panel.style.display = "block";
    return panel;
  }

  private async fetchNodeSchema(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  }

  private populateKindAndType(jsonData: any): void {
    const { kindOptions } = this.panelNodeEditorGetKindEnums(jsonData);
    this.panelNodeEditorPopulateKindDropdown(kindOptions);
    const typeOptions = this.panelNodeEditorGetTypeEnumsByKindPattern(
      jsonData,
      `(${this.panelNodeEditorKind})`
    );
    this.panelNodeEditorSetupTypeField(typeOptions);
  }

  private populateIconDropdown(nodeIcons: string[]): void {
    const iconContainer = document.getElementById("panel-node-topoviewerrole-dropdown-container");
    if (!iconContainer) {
      log.error("Icon dropdown container not found in DOM!");
      return;
    }
    this.panelNodeEditorPopulateTopoViewerRoleDropdown(nodeIcons);
  }

  private registerNodeEditorButtons(panel: HTMLElement | null, node: cytoscape.NodeSingular): void {
    const closeBtn = document.getElementById("panel-node-editor-cancel");
    if (closeBtn && panel) {
      closeBtn.addEventListener("click", () => {
        panel.style.display = "none";
      });
    }

    const saveBtn = document.getElementById("panel-node-editor-save");
    if (saveBtn) {
      const newSave = saveBtn.cloneNode(true) as HTMLElement;
      saveBtn.parentNode?.replaceChild(newSave, saveBtn);
      newSave.addEventListener("click", async () => {
        await this.updateNodeFromEditor(node);
        await this.saveManager.saveTopo(this.cy, false);
      });
    }
  }

  private async refreshDockerImages(): Promise<void> {
    try {
      const messageSender = this.saveManager.getMessageSender();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Docker image refresh timeout")), 2000);
      });

      const response: any = await Promise.race([
        messageSender.sendMessageToVscodeEndpointPost("refresh-docker-images", {}),
        timeoutPromise
      ]);

      if (response && response.dockerImages) {
        (window as any).dockerImages = response.dockerImages;
        log.debug(`Docker images refreshed, found ${response.dockerImages.length} images`);
      }
    } catch (error: any) {
      log.debug(`Failed to refresh docker images (continuing): ${error.message}`);
    }
  }

  public async updateNodeFromEditor(node: cytoscape.NodeSingular): Promise<void> {
    const targetNode = this.ensureSingleNode(node);
    const nodeNameInput = document.getElementById("node-name") as HTMLInputElement;
    const nodeImageInput = document.getElementById(
      "node-image-dropdown-container-filter-input"
    ) as HTMLInputElement;
    const typeDropdownInput = document.getElementById(
      "panel-node-type-dropdown-container-filter-input"
    ) as HTMLInputElement;
    const typeInput = document.getElementById("node-type") as HTMLInputElement;
    const kindDropdownInput = document.getElementById(
      "panel-node-kind-dropdown-container-filter-input"
    ) as HTMLInputElement;
    const topoViewerRoleDropdownInput = document.getElementById(
      "panel-node-topoviewerrole-dropdown-container-filter-input"
    ) as HTMLInputElement;

    const currentData = targetNode.data();
    const oldName = currentData.name as string;
    const newName = nodeNameInput.value;

    const typeValue = this.getNodeTypeValue(typeDropdownInput, typeInput);
    const updatedExtraData = this.buildNodeExtraData(
      currentData.extraData,
      nodeNameInput.value,
      nodeImageInput.value,
      kindDropdownInput?.value,
      typeValue
    );

    const updatedData = {
      ...currentData,
      name: nodeNameInput.value,
      topoViewerRole: topoViewerRoleDropdownInput ? topoViewerRoleDropdownInput.value : "pe",
      extraData: updatedExtraData
    };

    targetNode.data(updatedData);
    log.debug(`Cytoscape node updated with new data: ${JSON.stringify(updatedData)}`);

    if (oldName !== newName) {
      this.updateEdgesForRenamedNode(targetNode, oldName, newName);
    }

    this.hideNodeEditor();
  }

  private getNodeTypeValue(
    typeDropdownInput: HTMLInputElement | null,
    typeInput: HTMLInputElement | null
  ): string {
    if (this.panelNodeEditorUseDropdownForType) {
      return typeDropdownInput ? typeDropdownInput.value || "" : "";
    }
    return typeInput ? typeInput.value : "";
  }

  private buildNodeExtraData(
    currentExtra: any,
    name: string,
    image: string,
    kindValue: string | undefined,
    typeValue: string
  ): any {
    const updatedExtraData = {
      ...currentExtra,
      name,
      image,
      kind: kindValue || "nokia_srlinux"
    };
    if (this.panelNodeEditorUseDropdownForType || typeValue.trim() !== "") {
      updatedExtraData.type = typeValue;
    } else if ("type" in updatedExtraData) {
      delete updatedExtraData.type;
    }
    return updatedExtraData;
  }

  private updateEdgesForRenamedNode(
    targetNode: cytoscape.NodeSingular,
    oldName: string,
    newName: string
  ): void {
    const edges = targetNode.connectedEdges();
    edges.forEach((edge) => {
      const edgeData = edge.data();
      const updatedEdgeData: any = { ...edgeData };
      let modified = false;
      if (edgeData.sourceName === oldName) {
        updatedEdgeData.sourceName = newName;
        modified = true;
      }
      if (edgeData.targetName === oldName) {
        updatedEdgeData.targetName = newName;
        modified = true;
      }
      if (modified) {
        edge.data(updatedEdgeData);
        log.debug(
          `Edge ${edge.id()} updated to reflect node rename: ${JSON.stringify(updatedEdgeData)}`
        );
      }
    });
  }

  private hideNodeEditor(): void {
    const panelNodeEditor = document.getElementById("panel-node-editor");
    if (panelNodeEditor) {
      panelNodeEditor.style.display = "none";
    }
  }

  public updateNodeEndpointsForKindChange(
    node: cytoscape.NodeSingular,
    oldKind: string,
    newKind: string
  ): void {
    const ifaceMap = window.ifacePatternMapping || {};
    const extraData = node.data("extraData") as { interfacePattern?: unknown } | undefined;
    const overridePattern =
      typeof extraData?.interfacePattern === "string" ? extraData.interfacePattern.trim() : "";
    const oldPattern = overridePattern || ifaceMap[oldKind] || DEFAULT_INTERFACE_PATTERN;
    const newPattern = overridePattern || ifaceMap[newKind] || DEFAULT_INTERFACE_PATTERN;
    const oldParsed = parseInterfacePattern(oldPattern);
    const newParsed = parseInterfacePattern(newPattern);
    const nodeId = node.id();

    const edges = this.cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);
    edges.forEach((edge) => {
      ["sourceEndpoint", "targetEndpoint"].forEach((key) => {
        const endpoint = edge.data(key);
        const isNodeEndpoint =
          (edge.data("source") === nodeId && key === "sourceEndpoint") ||
          (edge.data("target") === nodeId && key === "targetEndpoint");
        if (!endpoint || !isNodeEndpoint) return;
        const index = getInterfaceIndex(oldParsed, endpoint);
        if (index !== null) {
          const newEndpoint = generateInterfaceName(newParsed, index);
          edge.data(key, newEndpoint);
        }
      });
    });
  }

  private panelNodeEditorGetKindEnums(jsonData: any): { kindOptions: string[]; schemaData: any } {
    let kindOptions: string[] = [];
    if (jsonData && jsonData.definitions && jsonData.definitions["node-config"]) {
      kindOptions = jsonData.definitions["node-config"].properties.kind.enum || [];
    } else {
      throw new Error("Invalid JSON structure or 'kind' enum not found");
    }
    return { kindOptions, schemaData: jsonData };
  }

  private panelNodeEditorPopulateKindDropdown(options: string[]): void {
    const sortedOptions = this.sortKindsWithNokiaTop(options);
    createFilterableDropdown(
      "panel-node-kind-dropdown-container",
      sortedOptions,
      this.panelNodeEditorKind,
      (selectedValue: string) => {
        const previousKind = this.panelNodeEditorKind;
        this.panelNodeEditorKind = selectedValue;
        log.debug(`${this.panelNodeEditorKind} selected`);

        const typeOptions = this.panelNodeEditorGetTypeEnumsByKindPattern(
          this.nodeSchemaData,
          `(${selectedValue})`
        );
        this.panelNodeEditorType = "";
        this.panelNodeEditorSetupTypeField(typeOptions);

        if (this.panelNodeEditorNode && window.updateLinkEndpointsOnKindChange) {
          this.updateNodeEndpointsForKindChange(
            this.panelNodeEditorNode,
            previousKind,
            selectedValue
          );
        }

        const imageMap = window.imageMapping || {};
        const imageInput = document.getElementById("panel-node-editor-image") as HTMLInputElement;
        if (imageInput) {
          if (Object.prototype.hasOwnProperty.call(imageMap, selectedValue)) {
            const mappedImage = imageMap[selectedValue] as string;
            imageInput.value = mappedImage;
            imageInput.dispatchEvent(new Event("input"));
          } else {
            imageInput.value = "";
            imageInput.dispatchEvent(new Event("input"));
          }
        }
      },
      "Search for kind..."
    );
  }

  private sortKindsWithNokiaTop(options: string[]): string[] {
    const nokiaKinds = options
      .filter((k) => k.startsWith("nokia_"))
      .sort((a, b) => a.localeCompare(b));
    const otherKinds = options
      .filter((k) => !k.startsWith("nokia_"))
      .sort((a, b) => a.localeCompare(b));
    return [...nokiaKinds, ...otherKinds];
  }

  private panelNodeEditorSetupTypeField(options: string[]): void {
    const dropdownContainer = document.getElementById("panel-node-type-dropdown-container");
    const input = document.getElementById("node-type") as HTMLInputElement;

    if (!dropdownContainer || !input) {
      log.error("Type input elements not found in the DOM.");
      return;
    }

    if (options.length > 0) {
      dropdownContainer.style.display = "";
      input.style.display = "none";
      this.panelNodeEditorUseDropdownForType = true;
      if (!options.includes(this.panelNodeEditorType)) {
        this.panelNodeEditorType = options[0];
      }
      this.panelNodeEditorPopulateTypeDropdown(options);
    } else {
      dropdownContainer.style.display = "none";
      input.style.display = "";
      this.panelNodeEditorUseDropdownForType = false;
      input.value = this.panelNodeEditorType || "";
      input.oninput = () => {
        this.panelNodeEditorType = input.value;
      };
    }
  }

  private panelNodeEditorPopulateTypeDropdown(options: string[]): void {
    if (!options.includes(this.panelNodeEditorType)) {
      this.panelNodeEditorType = options.length > 0 ? options[0] : "";
    }

    createFilterableDropdown(
      "panel-node-type-dropdown-container",
      options,
      this.panelNodeEditorType,
      (selectedValue: string) => {
        this.panelNodeEditorType = selectedValue;
        log.debug(`Type ${this.panelNodeEditorType} selected`);
      },
      "Search for type..."
    );
  }

  private panelNodeEditorPopulateTopoViewerRoleDropdown(options: string[]): void {
    createFilterableDropdown(
      "panel-node-topoviewerrole-dropdown-container",
      options,
      this.panelNodeEditorTopoViewerRole,
      (selectedValue: string) => {
        this.panelNodeEditorTopoViewerRole = selectedValue;
        log.debug(`${this.panelNodeEditorTopoViewerRole} selected`);
      },
      "Search for role...",
      false,
      {
        menuClassName: "max-h-96",
        dropdownWidth: 320,
        renderOption: createNodeIconOptionElement
      }
    );
  }

  private panelNodeEditorGetTypeEnumsByKindPattern(jsonData: any, pattern: string): string[] {
    const nodeConfig = jsonData?.definitions?.["node-config"];
    if (!nodeConfig?.allOf) return [];

    for (const condition of nodeConfig.allOf) {
      if (!this.matchesKindPattern(condition, pattern)) continue;
      const typeProp = condition.then?.properties?.type;
      const enums = this.extractEnumFromTypeProp(typeProp);
      if (enums.length) return enums;
    }
    return [];
  }

  private matchesKindPattern(condition: any, pattern: string): boolean {
    return condition?.if?.properties?.kind?.pattern === pattern;
  }

  private extractEnumFromTypeProp(typeProp: any): string[] {
    if (!typeProp) return [];
    if (typeProp.enum) return typeProp.enum;
    if (Array.isArray(typeProp.anyOf)) {
      for (const sub of typeProp.anyOf) {
        if (sub.enum) return sub.enum;
      }
    }
    return [];
  }

  private setupDropdownCloseHandler(): void {
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const dropdowns = [
        "panel-node-kind-dropdown",
        "panel-node-topoviewerrole-dropdown",
        "panel-node-type-dropdown"
      ];

      dropdowns.forEach((dropdownId) => {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown && !dropdown.contains(target)) {
          dropdown.classList.remove("is-active");
          const content = dropdown.querySelector(".dropdown-menu");
          if (content) {
            content.classList.add("hidden");
          }
        }
      });
    });
  }

  private ensureSingleNode(node: cytoscape.NodeSingular): cytoscape.NodeSingular {
    return (node as any).length && (node as any).length > 1 ? (node as any)[0] : node;
  }
}
