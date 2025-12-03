// file: ContextMenuManager.ts
// Manages all context menus (right-click menus) for the topology viewer

import type cytoscape from "cytoscape";
import { loadExtension } from "../canvas/CytoscapeFactory";
import type { ViewportPanelsManager } from "../panels/ViewportPanelsManager";
import type { NodeEditorManager } from "../node-editor/NodeEditorManager";
import type { GroupManager } from "../groups/GroupManager";
import type { FreeTextManager } from "../annotations/FreeTextManager";
import type { FreeShapesManager } from "../annotations/FreeShapesManager";
import type { VscodeMessageSender } from "../../platform/messaging/VscodeMessaging";

// UI constants for context menus
export const UI_FILL_COLOR = "rgba(31, 31, 31, 0.75)";
export const UI_ACTIVE_FILL_COLOR = "rgba(66, 88, 255, 1)";
export const UI_ITEM_COLOR = "white";
export const UI_ITEM_TEXT_SHADOW = "rgba(61, 62, 64, 1)";
export const UI_OPEN_EVENT = "cxttap";

export interface ContextMenuDependencies {
  cy: cytoscape.Core;
  getViewportPanels: () => ViewportPanelsManager | undefined;
  getNodeEditor: () => NodeEditorManager | undefined;
  getGroupManager: () => GroupManager;
  getFreeTextManager: () => FreeTextManager | undefined;
  getFreeShapesManager: () => FreeShapesManager | undefined;
  getMessageSender: () => VscodeMessageSender;
  isLocked: () => boolean;
  getCurrentMode: () => "edit" | "view";
  showLockedMessage: () => void;
  // eslint-disable-next-line no-unused-vars
  startEdgeCreationFromNode: (node: cytoscape.NodeSingular) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  showNodePropertiesPanel: (node: cytoscape.Singular) => void;
  // eslint-disable-next-line no-unused-vars
  showLinkPropertiesPanel: (edge: cytoscape.Singular) => void;
  // eslint-disable-next-line no-unused-vars
  isNetworkNode: (nodeId: string) => boolean;
  // eslint-disable-next-line no-unused-vars
  setSuppressViewerCanvasClose: (value: boolean) => void;
}

export class ContextMenuManager {
  private cy: cytoscape.Core;
  private deps: ContextMenuDependencies;
  private nodeMenu: any;
  private edgeMenu: any;
  private groupMenu: any;
  private freeTextMenu: any;
  private freeShapesMenu: any;
  private activeGroupMenuTarget?: cytoscape.NodeSingular;

  constructor(deps: ContextMenuDependencies) {
    this.cy = deps.cy;
    this.deps = deps;
  }

  public async initialize(): Promise<void> {
    await loadExtension("cxtmenu");
    if (!this.freeTextMenu) {
      this.freeTextMenu = this.initializeFreeTextContextMenu();
    }
    if (!this.freeShapesMenu) {
      this.freeShapesMenu = this.initializeFreeShapesContextMenu();
    }
    if (!this.nodeMenu) {
      this.nodeMenu = this.initializeNodeContextMenu();
    }
    if (!this.groupMenu) {
      this.groupMenu = this.initializeGroupContextMenu();
    }
    if (!this.edgeMenu) {
      this.edgeMenu = this.initializeEdgeContextMenu();
    }
  }

  private initializeFreeTextContextMenu(): any {
    return this.cy.cxtmenu({
      selector: 'node[topoViewerRole = "freeText"]',
      commands: () => {
        if (this.deps.isLocked()) {
          return [];
        }
        return [
          {
            content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-pen-to-square" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Edit Text</span></div>`,
            select: (ele: cytoscape.Singular) => {
              if (!ele.isNode()) {
                return;
              }
              this.deps.getFreeTextManager()?.editFreeText(ele.id());
            }
          },
          {
            content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-trash-alt" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Remove Text</span></div>`,
            select: (ele: cytoscape.Singular) => {
              if (!ele.isNode()) {
                return;
              }
              this.deps.getFreeTextManager()?.removeFreeTextAnnotation(ele.id());
            }
          }
        ];
      },
      menuRadius: 60,
      fillColor: UI_FILL_COLOR,
      activeFillColor: UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 4,
      adaptativeNodeSpotlightRadius: false,
      minSpotlightRadius: 20,
      maxSpotlightRadius: 20,
      openMenuEvents: UI_OPEN_EVENT,
      itemColor: UI_ITEM_COLOR,
      itemTextShadowColor: UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10
    });
  }

  private initializeFreeShapesContextMenu(): any {
    return this.cy.cxtmenu({
      selector: 'node[topoViewerRole = "freeShape"]',
      commands: () => {
        if (this.deps.isLocked()) {
          return [];
        }
        return [
          {
            content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-edit" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Edit Shape</span></div>`,
            select: (ele: cytoscape.Singular) => {
              if (!ele.isNode()) {
                return;
              }
              this.deps.getFreeShapesManager()?.editFreeShape(ele.id());
            }
          },
          {
            content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-trash-alt" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Remove Shape</span></div>`,
            select: (ele: cytoscape.Singular) => {
              if (!ele.isNode()) {
                return;
              }
              this.deps.getFreeShapesManager()?.removeFreeShapeAnnotation(ele.id());
            }
          }
        ];
      },
      menuRadius: 60,
      fillColor: UI_FILL_COLOR,
      activeFillColor: UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 4,
      adaptativeNodeSpotlightRadius: false,
      minSpotlightRadius: 20,
      maxSpotlightRadius: 20,
      openMenuEvents: UI_OPEN_EVENT,
      itemColor: UI_ITEM_COLOR,
      itemTextShadowColor: UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10
    });
  }

  private initializeNodeContextMenu(): any {
    return this.cy.cxtmenu({
      selector:
        'node[topoViewerRole != "group"][topoViewerRole != "freeText"][topoViewerRole != "freeShape"]',
      commands: (ele: cytoscape.Singular) => this.buildNodeMenuCommands(ele),
      menuRadius: 110,
      fillColor: UI_FILL_COLOR,
      activeFillColor: UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 20,
      adaptativeNodeSpotlightRadius: true,
      minSpotlightRadius: 24,
      maxSpotlightRadius: 38,
      openMenuEvents: UI_OPEN_EVENT,
      itemColor: UI_ITEM_COLOR,
      itemTextShadowColor: UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10
    });
  }

  private buildNodeMenuCommands(ele: cytoscape.Singular): any[] {
    if (this.deps.getCurrentMode() === "view") {
      return this.buildViewerNodeCommands(ele);
    }
    if (this.deps.isLocked()) {
      return [];
    }

    const isNetwork = this.deps.isNetworkNode(ele.id());
    const commands = [
      this.createEditCommand(isNetwork),
      this.createDeleteCommand(),
      this.createAddLinkCommand()
    ];
    if (ele.isNode() && ele.parent().nonempty()) {
      commands.push(this.createReleaseFromGroupCommand());
    }
    return commands;
  }

  private createNodeMenuItem(
    icon: string,
    label: string,
    // eslint-disable-next-line no-unused-vars
    action: (node: cytoscape.NodeSingular) => void | Promise<void>
  ): any {
    return {
      content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="${icon}" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>${label}</span></div>`,
      select: (node: cytoscape.Singular) => {
        if (!node.isNode()) {
          return;
        }
        return action(node as cytoscape.NodeSingular);
      }
    };
  }

  private createEditCommand(isNetwork: boolean): any {
    const label = isNetwork ? "Edit Network" : "Edit Node";
    return this.createNodeMenuItem("fas fa-pen-to-square", label, (node) => {
      this.deps.getViewportPanels()?.setNodeClicked(true);
      if (isNetwork) {
        this.deps.getViewportPanels()?.panelNetworkEditor(node);
      } else {
        const nodeEditor = this.deps.getNodeEditor();
        if (nodeEditor) {
          nodeEditor.open(node);
        }
      }
    });
  }

  private createDeleteCommand(): any {
    return this.createNodeMenuItem("fas fa-trash-alt", "Delete Node", (node) => {
      const parent = node.parent();
      node.remove();
      if (parent.nonempty() && parent.children().length === 0) {
        parent.remove();
      }
    });
  }

  private createAddLinkCommand(): any {
    return this.createNodeMenuItem("fas fa-link", "Add Link", async (node) => {
      await this.deps.startEdgeCreationFromNode(node);
    });
  }

  private createReleaseFromGroupCommand(): any {
    return this.createNodeMenuItem("fas fa-users-slash", "Release from Group", (node) => {
      setTimeout(() => {
        this.deps.getGroupManager().orphaningNode(node);
      }, 50);
    });
  }

  private getNodeName(node: cytoscape.NodeSingular): string {
    return node.data("extraData")?.longname || node.data("name") || node.id();
  }

  private buildViewerNodeCommands(ele: cytoscape.Singular): any[] {
    if (this.deps.isNetworkNode(ele.id())) {
      return [];
    }
    const messageSender = this.deps.getMessageSender();
    const commands = [
      this.createNodeMenuItem("fas fa-terminal", "SSH", async (node) => {
        const nodeName = this.getNodeName(node);
        await messageSender.sendMessageToVscodeEndpointPost("clab-node-connect-ssh", nodeName);
      }),
      this.createNodeMenuItem("fas fa-cube", "Shell", async (node) => {
        const nodeName = this.getNodeName(node);
        await messageSender.sendMessageToVscodeEndpointPost("clab-node-attach-shell", nodeName);
      }),
      this.createNodeMenuItem("fas fa-file-alt", "Logs", async (node) => {
        const nodeName = this.getNodeName(node);
        await messageSender.sendMessageToVscodeEndpointPost("clab-node-view-logs", nodeName);
      }),
      this.createNodeMenuItem("fas fa-info-circle", "Properties", (node) => {
        setTimeout(() => this.deps.showNodePropertiesPanel(node as unknown as cytoscape.Singular), 50);
      })
    ];
    if (!this.deps.isLocked() && ele.isNode() && ele.parent().nonempty()) {
      commands.push(this.createReleaseFromGroupCommand());
    }
    return commands;
  }

  private initializeGroupContextMenu(): any {
    return this.cy.cxtmenu({
      selector: 'node:parent, node[topoViewerRole = "group"]',
      commands: (ele: cytoscape.Singular) => this.buildGroupContextMenuCommands(ele),
      menuRadius: 110,
      fillColor: UI_FILL_COLOR,
      activeFillColor: UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 0,
      adaptativeNodeSpotlightRadius: true,
      minSpotlightRadius: 0,
      maxSpotlightRadius: 0,
      openMenuEvents: UI_OPEN_EVENT,
      itemColor: UI_ITEM_COLOR,
      itemTextShadowColor: UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10
    });
  }

  private buildGroupContextMenuCommands(ele?: cytoscape.Singular): any[] {
    if (this.deps.isLocked()) {
      return [];
    }

    const target = this.resolveGroupMenuTarget(ele);
    if (!target) {
      return [];
    }

    return [
      {
        content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-pen-to-square" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Edit Group</span></div>`,
        select: (menuEle?: cytoscape.Singular) => {
          const node = this.resolveGroupMenuTarget(menuEle);
          if (!node) {
            return;
          }
          this.deps.getViewportPanels()?.setNodeClicked(true);
          if (node.data("topoViewerRole") === "group") {
            if (this.deps.getCurrentMode() === "view") {
              this.deps.setSuppressViewerCanvasClose(true);
            }
            this.deps.getGroupManager().showGroupEditor(node);
          }
        }
      },
      {
        content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-trash-alt" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Delete Group</span></div>`,
        select: (menuEle?: cytoscape.Singular) => {
          const node = this.resolveGroupMenuTarget(menuEle);
          if (!node) {
            return;
          }
          const role = node.data("topoViewerRole");
          if (role === "group" || node.isParent()) {
            this.deps.getGroupManager().directGroupRemoval(node.id());
          }
        }
      }
    ];
  }

  private resolveGroupMenuTarget(ele?: cytoscape.Singular): cytoscape.NodeSingular | undefined {
    if (ele && ele.isNode()) {
      const node = ele as cytoscape.NodeSingular;
      if (!node.removed() && (node.data("topoViewerRole") === "group" || node.isParent())) {
        this.activeGroupMenuTarget = node;
        return node;
      }
    }

    if (this.activeGroupMenuTarget && !this.activeGroupMenuTarget.removed()) {
      return this.activeGroupMenuTarget;
    }

    this.activeGroupMenuTarget = undefined;
    return undefined;
  }

  private initializeEdgeContextMenu(): any {
    return this.cy.cxtmenu({
      selector: "edge",
      commands: (ele: cytoscape.Singular) => {
        if (this.deps.getCurrentMode() === "view") {
          return this.buildViewerEdgeMenuCommands(ele);
        }
        if (this.deps.isLocked()) {
          return [];
        }
        return this.buildEditEdgeMenuCommands();
      },
      menuRadius: 80,
      fillColor: UI_FILL_COLOR,
      activeFillColor: UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 0,
      adaptativeNodeSpotlightRadius: true,
      minSpotlightRadius: 0,
      maxSpotlightRadius: 0,
      openMenuEvents: UI_OPEN_EVENT,
      itemColor: UI_ITEM_COLOR,
      itemTextShadowColor: UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10
    });
  }

  private buildEditEdgeMenuCommands(): any[] {
    const commands: any[] = [];
    commands.push({
      content: `<div style="display:flex;flex-direction:column;align-items:center;line-height:1;"><i class="fas fa-pen" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Edit Link</span></div>`,
      select: (edge: cytoscape.Singular) => {
        if (!edge.isEdge()) return;
        this.deps.getViewportPanels()?.setEdgeClicked(true);
        this.deps.getViewportPanels()?.panelEdgeEditor(edge);
      }
    });

    commands.push({
      content: `<div style="display:flex;flex-direction:column;align-items:center;line-height:1;"><i class="fas fa-trash-alt" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Delete Link</span></div>`,
      select: (edge: cytoscape.Singular) => {
        edge.remove();
      }
    });

    return commands;
  }

  private buildViewerEdgeMenuCommands(ele: cytoscape.Singular): any[] {
    const captureCommands = this.buildEdgeCaptureCommands(ele);
    const propertiesCommand = {
      content: `<div style="display:flex;flex-direction:column;align-items:center;line-height:1;"><i class="fas fa-info-circle" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Properties</span></div>`,
      select: (edge: cytoscape.Singular) => {
        if (!edge.isEdge()) {
          return;
        }
        setTimeout(() => this.deps.showLinkPropertiesPanel(edge), 50);
      }
    };

    if (captureCommands.length === 2) {
      return [captureCommands[0], propertiesCommand, captureCommands[1]];
    }
    return [...captureCommands, propertiesCommand];
  }

  private buildEdgeCaptureCommands(ele: cytoscape.Singular): any[] {
    if (!ele.isEdge()) return [];

    const { srcNode, srcIf, dstNode, dstIf } = this.computeEdgeCaptureEndpoints(ele);
    const items: any[] = [];
    const imagesUrl = this.getImagesUrl();

    if (srcNode && srcIf) {
      items.push({
        content: this.buildCaptureMenuContent(imagesUrl, srcNode, srcIf),
        select: this.captureInterface.bind(this, srcNode, srcIf)
      });
    }
    if (dstNode && dstIf) {
      items.push({
        content: this.buildCaptureMenuContent(imagesUrl, dstNode, dstIf),
        select: this.captureInterface.bind(this, dstNode, dstIf)
      });
    }

    return items;
  }

  private getImagesUrl(): string {
    return (window as any).imagesUrl || "";
  }

  private buildCaptureMenuContent(imagesUrl: string, name: string, endpoint: string): string {
    return `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <img src="${imagesUrl}/wireshark_bold.svg" style="width:1.4em; height:1.4em; filter: brightness(0) invert(1);" />
                          <div style="height:0.3em;"></div>
                          <span style="font-size:0.9em;">${name} - ${endpoint}</span>
                        </div>`;
  }

  private computeEdgeCaptureEndpoints(ele: cytoscape.Singular): {
    srcNode: string;
    srcIf: string;
    dstNode: string;
    dstIf: string;
  } {
    const data = ele.data();
    const extra = data.extraData || {};
    const srcNode: string = extra.clabSourceLongName || data.source || "";
    const dstNode: string = extra.clabTargetLongName || data.target || "";
    const srcIf: string = data.sourceEndpoint || "";
    const dstIf: string = data.targetEndpoint || "";
    return { srcNode, srcIf, dstNode, dstIf };
  }

  private async captureInterface(nodeName: string, interfaceName: string): Promise<void> {
    await this.deps
      .getMessageSender()
      .sendMessageToVscodeEndpointPost("clab-interface-capture", {
        nodeName,
        interfaceName
      });
  }
}
