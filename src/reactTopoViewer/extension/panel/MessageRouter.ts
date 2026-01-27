/**
 * MessageRouter - Handles webview message routing for ReactTopoViewer
 */

import type * as vscode from "vscode";

import { log, logWithLocation } from "../services/logger";
import { labLifecycleService } from "../services/LabLifecycleService";
import { nodeCommandService } from "../services/NodeCommandService";
import type { SplitViewManager } from "../services/SplitViewManager";
import { customNodeConfigManager } from "../services/CustomNodeConfigManager";
import type { CustomNodeConfig } from "../services/CustomNodeConfigManager";
import { iconService } from "../services/IconService";
import type { TopologyHost } from "../../shared/types/topologyHost";
import type { TopologySnapshot, TopologyHostCommand } from "../../shared/types/messages";
import { TOPOLOGY_HOST_PROTOCOL_VERSION } from "../../shared/types/messages";

type WebviewMessage = Record<string, unknown> & {
  type?: string;
  command?: string;
  requestId?: string;
  endpointName?: string;
};

const LIFECYCLE_COMMANDS = new Set([
  "deployLab",
  "destroyLab",
  "redeployLab",
  "deployLabCleanup",
  "destroyLabCleanup",
  "redeployLabCleanup"
]);

const NODE_COMMANDS = new Set([
  "clab-node-connect-ssh",
  "clab-node-attach-shell",
  "clab-node-view-logs"
]);

const INTERFACE_COMMANDS = new Set(["clab-interface-capture"]);

const CUSTOM_NODE_COMMANDS = new Set([
  "save-custom-node",
  "delete-custom-node",
  "set-default-custom-node"
]);

const ICON_COMMANDS = new Set(["icon-list", "icon-upload", "icon-delete", "icon-reconcile"]);

/**
 * Context required by the message router
 */
export interface MessageRouterContext {
  yamlFilePath: string;
  isViewMode: boolean;
  splitViewManager: SplitViewManager;
  topologyHost?: TopologyHost;
  setInternalUpdate: (updating: boolean) => void;
  onHostSnapshot?: (snapshot: TopologySnapshot) => void;
}

/**
 * Handles routing and processing of webview messages
 */
export class MessageRouter {
  private context: MessageRouterContext;

  constructor(context: MessageRouterContext) {
    this.context = context;
  }

  /**
   * Update the router context
   */
  updateContext(context: Partial<MessageRouterContext>): void {
    Object.assign(this.context, context);
  }

  /**
   * Handle log command messages
   */
  private handleLogCommand(message: WebviewMessage): boolean {
    const command = typeof message.command === "string" ? message.command : "";
    if (command === "reactTopoViewerLog") {
      const level = typeof message.level === "string" ? message.level : "info";
      const logMsg = typeof message.message === "string" ? message.message : "";
      const fileLine = typeof message.fileLine === "string" ? message.fileLine : undefined;
      logWithLocation(level || "info", logMsg || "", fileLine);
      return true;
    }

    if (command === "topoViewerLog") {
      const level = typeof message.level === "string" ? message.level : "info";
      const logMessage = typeof message.message === "string" ? message.message : "";
      const logger =
        (
          { error: log.error, warn: log.warn, debug: log.debug } as Record<
            string,
            (m: string) => void
          >
        )[level] ?? log.info;
      logger(logMessage);
      return true;
    }

    return false;
  }

  /**
   * Handle TopologyHost protocol messages (snapshot + commands)
   */
  private async handleTopologyHostMessage(
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<boolean> {
    const msgType = typeof message.type === "string" ? message.type : "";
    if (msgType !== "topology-host:get-snapshot" && msgType !== "topology-host:command") {
      return false;
    }

    const host = this.context.topologyHost;
    const requestId = typeof message.requestId === "string" ? message.requestId : "";
    const protocolVersion =
      typeof (message as { protocolVersion?: unknown }).protocolVersion === "number"
        ? (message as { protocolVersion?: number }).protocolVersion
        : undefined;

    if (protocolVersion !== TOPOLOGY_HOST_PROTOCOL_VERSION) {
      panel.webview.postMessage({
        type: "topology-host:error",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId,
        error: `Unsupported topology host protocol version: ${protocolVersion ?? "unknown"}`
      });
      return true;
    }

    if (!host) {
      panel.webview.postMessage({
        type: "topology-host:error",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId,
        error: "Topology host unavailable"
      });
      return true;
    }

    if (msgType === "topology-host:get-snapshot") {
      try {
        const snapshot = await host.getSnapshot();
        this.context.onHostSnapshot?.(snapshot);
        panel.webview.postMessage({
          type: "topology-host:snapshot",
          protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
          requestId,
          snapshot,
          reason: "init"
        });
      } catch (err) {
        panel.webview.postMessage({
          type: "topology-host:error",
          protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
          requestId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
      return true;
    }

    const baseRevisionRaw = (message as { baseRevision?: unknown }).baseRevision;
    const commandPayload = (message as { command?: unknown }).command;
    const baseRevision =
      typeof baseRevisionRaw === "number" && Number.isFinite(baseRevisionRaw)
        ? baseRevisionRaw
        : NaN;
    if (
      !commandPayload ||
      typeof (commandPayload as { command?: unknown }).command !== "string" ||
      !Number.isFinite(baseRevision)
    ) {
      panel.webview.postMessage({
        type: "topology-host:error",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId,
        error: "Invalid topology host command payload"
      });
      return true;
    }

    const response = await host.applyCommand(commandPayload as TopologyHostCommand, baseRevision);
    const responseWithId = { ...response, requestId: requestId || response.requestId };
    if (
      responseWithId.type === "topology-host:ack" ||
      responseWithId.type === "topology-host:reject"
    ) {
      const snapshot = (responseWithId as { snapshot?: TopologySnapshot }).snapshot;
      if (snapshot) {
        this.context.onHostSnapshot?.(snapshot);
      }
    }
    panel.webview.postMessage(responseWithId);
    return true;
  }

  private async handleLifecycleCommand(command: string): Promise<void> {
    const yamlFilePath = this.context.yamlFilePath;
    if (!yamlFilePath) {
      log.warn(`[MessageRouter] Cannot run ${command}: no YAML path available`);
      return;
    }
    const res = await labLifecycleService.handleLabLifecycleEndpoint(command, yamlFilePath);
    if (res.error) {
      log.error(`[MessageRouter] ${res.error}`);
    } else if (res.result) {
      log.info(`[MessageRouter] ${String(res.result)}`);
    }
  }

  private async handleSplitViewToggle(panel: vscode.WebviewPanel): Promise<void> {
    const yamlFilePath = this.context.yamlFilePath;
    if (!yamlFilePath) {
      log.warn("[MessageRouter] Cannot toggle split view: no YAML path available");
      return;
    }
    try {
      const isOpen = await this.context.splitViewManager.toggleSplitView(yamlFilePath, panel);
      log.info(`[MessageRouter] Split view toggled: ${isOpen ? "opened" : "closed"}`);
    } catch (err) {
      log.error(`[MessageRouter] Failed to toggle split view: ${err}`);
    }
  }

  private async handleCustomNodeCommand(
    command: string,
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const res = await this.executeCustomNodeCommand(command, message);
    if (!res) return;

    if (res.error) {
      log.error(`[MessageRouter] ${res.error}`);
      // Send error back to webview so user can see the failure
      panel.webview.postMessage({
        type: "custom-node-error",
        error: res.error
      });
      return;
    }

    const payload = res.result as
      | { customNodes?: unknown[]; defaultNode?: string }
      | null
      | undefined;
    if (payload?.customNodes) {
      panel.webview.postMessage({
        type: "custom-nodes-updated",
        customNodes: payload.customNodes,
        defaultNode: payload.defaultNode ?? ""
      });
    }
  }

  private async executeCustomNodeCommand(
    command: string,
    message: WebviewMessage
  ): Promise<{ result?: unknown; error?: string | null } | undefined> {
    let res: { result?: unknown; error?: string | null } | undefined;
    if (command === "save-custom-node") {
      const data = this.parseCustomNodeSavePayload(message);
      if (data) {
        res = await customNodeConfigManager.saveCustomNode(data);
      }
    } else if (command === "delete-custom-node") {
      const name = this.getCustomNodeName(message);
      res = await customNodeConfigManager.deleteCustomNode(name);
    } else if (command === "set-default-custom-node") {
      const name = this.getCustomNodeName(message);
      res = await customNodeConfigManager.setDefaultCustomNode(name);
    }
    return res;
  }

  private parseCustomNodeSavePayload(message: WebviewMessage): CustomNodeConfig | null {
    const payload = message as Record<string, unknown>;
    const name = typeof payload.name === "string" ? payload.name : "";
    const kind = typeof payload.kind === "string" ? payload.kind : "";
    if (!name || !kind) {
      log.error(`[MessageRouter] Invalid custom node payload: ${JSON.stringify(message)}`);
      return null;
    }
    return { ...(payload as CustomNodeConfig), name, kind };
  }

  private getCustomNodeName(message: WebviewMessage): string {
    return typeof message.name === "string" ? message.name : "";
  }

  private async handleNodeCommand(command: string, message: WebviewMessage): Promise<void> {
    const yamlFilePath = this.context.yamlFilePath;
    if (!yamlFilePath) {
      log.warn(`[MessageRouter] Cannot run ${command}: no YAML path available`);
      return;
    }
    const nodeName = typeof message.nodeName === "string" ? message.nodeName : "";
    if (!nodeName) {
      log.warn(`[MessageRouter] Invalid node command payload: ${JSON.stringify(message)}`);
      return;
    }
    const res = await nodeCommandService.handleNodeEndpoint(command, nodeName, yamlFilePath);
    if (res.error) log.error(`[MessageRouter] ${res.error}`);
    else if (res.result) log.info(`[MessageRouter] ${res.result}`);
  }

  private async handleInterfaceCommand(command: string, message: WebviewMessage): Promise<void> {
    const yamlFilePath = this.context.yamlFilePath;
    if (!yamlFilePath) {
      log.warn(`[MessageRouter] Cannot run ${command}: no YAML path available`);
      return;
    }
    const nodeName = typeof message.nodeName === "string" ? message.nodeName : "";
    const interfaceName = typeof message.interfaceName === "string" ? message.interfaceName : "";
    if (!nodeName || !interfaceName) {
      log.warn(`[MessageRouter] Invalid interface command payload: ${JSON.stringify(message)}`);
      return;
    }
    const res = await nodeCommandService.handleInterfaceEndpoint(
      command,
      { nodeName, interfaceName },
      yamlFilePath
    );
    if (res.error) log.error(`[MessageRouter] ${res.error}`);
    else if (res.result) log.info(`[MessageRouter] ${res.result}`);
  }

  private async handleIconList(panel: vscode.WebviewPanel): Promise<void> {
    const yamlFilePath = this.context.yamlFilePath;
    if (!yamlFilePath) {
      this.sendIconResponse(panel, []);
      return;
    }
    const icons = await iconService.loadAllIcons(yamlFilePath);
    this.sendIconResponse(panel, icons);
  }

  private async handleIconUpload(panel: vscode.WebviewPanel): Promise<void> {
    const result = await iconService.uploadIcon();
    const yamlFilePath = this.context.yamlFilePath;
    if (result.success && yamlFilePath) {
      const icons = await iconService.loadAllIcons(yamlFilePath);
      this.sendIconResponse(panel, icons);
    }
  }

  private async handleIconDelete(
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const iconName = typeof message.iconName === "string" ? message.iconName : "";
    if (!iconName) {
      log.warn("[MessageRouter] icon-delete: missing iconName");
      return;
    }
    const result = await iconService.deleteGlobalIcon(iconName);
    const yamlFilePath = this.context.yamlFilePath;
    if (result.success && yamlFilePath) {
      const icons = await iconService.loadAllIcons(yamlFilePath);
      this.sendIconResponse(panel, icons);
    }
  }

  private async handleIconReconcile(message: WebviewMessage): Promise<void> {
    const yamlFilePath = this.context.yamlFilePath;
    if (!yamlFilePath) return;
    const usedIcons = Array.isArray(message.usedIcons) ? (message.usedIcons as string[]) : [];
    await iconService.reconcileWorkspaceIcons(yamlFilePath, usedIcons);
  }

  private async handleIconCommand(
    command: string,
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    try {
      const handlers: Record<string, () => Promise<void>> = {
        "icon-list": () => this.handleIconList(panel),
        "icon-upload": () => this.handleIconUpload(panel),
        "icon-delete": () => this.handleIconDelete(message, panel),
        "icon-reconcile": () => this.handleIconReconcile(message)
      };
      const handler = handlers[command];
      if (handler) await handler();
    } catch (err) {
      log.error(`[MessageRouter] Icon command error: ${err}`);
    }
  }

  private sendIconResponse(panel: vscode.WebviewPanel, icons: unknown[]): void {
    panel.webview.postMessage({
      type: "icon-list-response",
      icons
    });
  }

  private async handleCommandMessage(
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<boolean> {
    const command = typeof message.command === "string" ? message.command : "";
    if (!command) return false;

    if (LIFECYCLE_COMMANDS.has(command)) {
      await this.handleLifecycleCommand(command);
      return true;
    }

    if (NODE_COMMANDS.has(command)) {
      await this.handleNodeCommand(command, message);
      return true;
    }

    if (INTERFACE_COMMANDS.has(command)) {
      await this.handleInterfaceCommand(command, message);
      return true;
    }

    if (command === "topo-toggle-split-view") {
      await this.handleSplitViewToggle(panel);
      return true;
    }

    if (CUSTOM_NODE_COMMANDS.has(command)) {
      await this.handleCustomNodeCommand(command, message, panel);
      return true;
    }

    if (ICON_COMMANDS.has(command)) {
      await this.handleIconCommand(command, message, panel);
      return true;
    }

    return false;
  }

  /**
   * Handle messages from the webview
   */
  async handleMessage(message: WebviewMessage, panel: vscode.WebviewPanel): Promise<void> {
    if (!message || typeof message !== "object") {
      return;
    }

    // Handle log commands locally (production-specific logging)
    if (this.handleLogCommand(message)) {
      return;
    }

    // Handle command messages (lifecycle, node/interface commands, split view, custom nodes)
    if (await this.handleCommandMessage(message, panel)) {
      return;
    }

    // Handle TopologyHost protocol messages
    if (await this.handleTopologyHostMessage(message, panel)) {
      return;
    }
  }
}
