// file: managerCustomNode.ts

import { log } from "../../logging/logger";
import type { VscodeMessageSender } from "../core/VscodeMessaging";
import type { NodeProperties } from "./TabContentManager";

// Element IDs
const ID_NODE_CUSTOM_NAME = "node-custom-name" as const;
const ID_NODE_CUSTOM_NAME_GROUP = "node-custom-name-group" as const;
const ID_NODE_NAME_GROUP = "node-name-group" as const;
const ID_NODE_CUSTOM_DEFAULT = "node-custom-default" as const;
const ID_NODE_INTERFACE_PATTERN = "node-interface-pattern" as const;
const ID_PANEL_NODE_EDITOR_HEADING = "panel-node-editor-heading" as const;
const ID_PANEL_NODE_TOPOROLE_FILTER_INPUT =
  "panel-node-topoviewerrole-dropdown-container-filter-input" as const;

// Special node IDs
const ID_TEMP_CUSTOM_NODE = "temp-custom-node" as const;
const ID_EDIT_CUSTOM_NODE = "edit-custom-node" as const;

/**
 * Interface for form utilities needed from the parent manager
 */
/* eslint-disable no-unused-vars */
export interface CustomNodeFormUtilities {
  getInputValue: (id: string) => string;
  setInputValue: (id: string, value: string | number) => void;
  getCheckboxValue: (id: string) => boolean;
  setCheckboxValue: (id: string, value: boolean) => void;
}

export interface CustomNodeContext {
  getCurrentNode: () => any;
  getCurrentIconColor: () => string | null;
  getCurrentIconCornerRadius: () => number;
  getMessageSender: () => VscodeMessageSender;
  closeEditor: () => void;
}
/* eslint-enable no-unused-vars */

/**
 * CustomNodeManager handles custom node template creation and editing:
 * - Building custom node payloads
 * - Saving custom node templates
 * - Handling custom node save flow
 * - Setting up custom node fields in the UI
 */
export class CustomNodeManager {
  private formUtils: CustomNodeFormUtilities;
  private context: CustomNodeContext;

  constructor(formUtils: CustomNodeFormUtilities, context: CustomNodeContext) {
    this.formUtils = formUtils;
    this.context = context;
  }

  /**
   * Check if the current node is a custom template node (temp or edit)
   */
  public isCustomTemplateNode(): boolean {
    const nodeId = this.context.getCurrentNode()?.id();
    return nodeId === ID_TEMP_CUSTOM_NODE || nodeId === ID_EDIT_CUSTOM_NODE;
  }

  /**
   * Setup custom node fields in the UI
   */
  public setupCustomNodeFields(nodeId: string): void {
    this.formUtils.setInputValue(ID_NODE_CUSTOM_NAME, "");
    this.formUtils.setCheckboxValue(ID_NODE_CUSTOM_DEFAULT, false);
    this.formUtils.setInputValue(ID_NODE_INTERFACE_PATTERN, "");

    const customNameGroup = document.getElementById(ID_NODE_CUSTOM_NAME_GROUP);
    const nodeNameGroup = document.getElementById(ID_NODE_NAME_GROUP);
    const isTempNode = nodeId === ID_TEMP_CUSTOM_NODE;
    const isEditNode = nodeId === ID_EDIT_CUSTOM_NODE;

    if (customNameGroup) {
      customNameGroup.style.display = isTempNode || isEditNode ? "block" : "none";
    }
    if (nodeNameGroup) {
      nodeNameGroup.style.display = isTempNode || isEditNode ? "none" : "block";
    }

    const heading = document.getElementById(ID_PANEL_NODE_EDITOR_HEADING);
    if (heading) {
      const titleSpan = heading.querySelector(".panel-title");
      if (titleSpan) {
        if (isTempNode) {
          titleSpan.textContent = "Create Custom Node Template";
        } else if (isEditNode) {
          titleSpan.textContent = "Edit Custom Node Template";
        } else {
          titleSpan.textContent = "Node Editor";
        }
      }
    }
  }

  /**
   * Build the payload for saving a custom node template
   */
  private buildCustomNodePayload(params: {
    name: string;
    nodeProps: NodeProperties;
    setDefault: boolean;
    iconValue: string;
    baseName: string;
    interfacePattern: string;
    iconColor: string | null;
    iconCornerRadius: number;
    oldName?: string;
  }): any {
    const {
      name,
      nodeProps,
      setDefault,
      iconValue,
      baseName,
      interfacePattern,
      iconColor,
      iconCornerRadius,
      oldName
    } = params;
    const payload: any = {
      name,
      kind: nodeProps.kind || "",
      type: nodeProps.type,
      image: nodeProps.image,
      icon: iconValue,
      baseName,
      setDefault,
      ...(oldName && { oldName })
    };
    if (iconCornerRadius > 0) {
      payload.iconCornerRadius = iconCornerRadius;
    }
    if (iconColor) {
      payload.iconColor = iconColor;
    }
    if (interfacePattern) {
      payload.interfacePattern = interfacePattern;
    }
    Object.keys(nodeProps).forEach((key) => {
      if (!["name", "kind", "type", "image"].includes(key)) {
        payload[key] = nodeProps[key as keyof NodeProperties];
      }
    });
    return payload;
  }

  /**
   * Save a custom node template
   */
  public async saveCustomNodeTemplate(
    name: string,
    nodeProps: NodeProperties,
    setDefault: boolean,
    oldName?: string
  ): Promise<void> {
    try {
      const iconValue =
        (document.getElementById(ID_PANEL_NODE_TOPOROLE_FILTER_INPUT) as HTMLInputElement | null)
          ?.value || "pe";

      const baseName = this.formUtils.getInputValue("node-base-name") || "";
      const interfacePattern = this.formUtils.getInputValue(ID_NODE_INTERFACE_PATTERN).trim();

      const iconColor = this.context.getCurrentIconColor();
      const iconCornerRadius = this.context.getCurrentIconCornerRadius();

      const payload = this.buildCustomNodePayload({
        name,
        nodeProps,
        setDefault,
        iconValue,
        baseName,
        interfacePattern,
        iconColor,
        iconCornerRadius,
        oldName
      });

      const resp = await this.context.getMessageSender().sendMessageToVscodeEndpointPost(
        "topo-editor-save-custom-node",
        payload
      );
      if (resp?.customNodes) {
        (window as any).customNodes = resp.customNodes;
      }
      if (resp?.defaultNode !== undefined) {
        (window as any).defaultNode = resp.defaultNode;
      }
    } catch (err) {
      log.error(
        `Failed to save custom node template: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Handle custom node save flow
   * @returns true if the save was handled (caller should not continue with regular save)
   */
  public async handleCustomNode(nodeProps: NodeProperties): Promise<boolean> {
    const customName = this.formUtils.getInputValue(ID_NODE_CUSTOM_NAME);
    const setDefault = this.formUtils.getCheckboxValue(ID_NODE_CUSTOM_DEFAULT);
    if (!customName) return false;

    const currentNode = this.context.getCurrentNode();
    const currentNodeData = currentNode?.data();
    const editingNodeName = currentNodeData?.extraData?.editingCustomNodeName;
    const isTempNode = currentNode?.id() === ID_TEMP_CUSTOM_NODE;
    const isEditNode = currentNode?.id() === ID_EDIT_CUSTOM_NODE;

    if (isTempNode || isEditNode) {
      await this.saveCustomNodeTemplate(customName, nodeProps, setDefault, editingNodeName);
      this.context.closeEditor();
      return true;
    }
    await this.saveCustomNodeTemplate(customName, nodeProps, setDefault);
    return false;
  }
}
