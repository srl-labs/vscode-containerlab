/**
 * MessageRouter - Handles webview message routing for ReactTopoViewer
 */

import * as path from "path";

import * as vscode from "vscode";

import { log, logWithLocation } from "../services/logger";
import { labLifecycleService } from "../services/LabLifecycleService";
import { nodeFsAdapter } from "../../shared/io";
import { nodeCommandService } from "../services/NodeCommandService";
import type { SplitViewManager } from "../services/SplitViewManager";
import { customNodeConfigManager } from "../services/CustomNodeConfigManager";
import type { CustomNodeConfig } from "../services/CustomNodeConfigManager";
import { iconService } from "../services/IconService";
import type { TopologyHost } from "../../shared/types/topologyHost";
import type { TopologySnapshot, TopologyHostCommand } from "../../shared/types/messages";
import { TOPOLOGY_HOST_PROTOCOL_VERSION } from "../../shared/types/messages";
import {
  MSG_CUSTOM_NODE_ERROR,
  MSG_CUSTOM_NODE_UPDATED,
  MSG_ICON_LIST_RESPONSE,
  MSG_LAB_LIFECYCLE_STATUS
} from "../../shared/messages/webview";
import type {
  CustomNodeCommand,
  IconCommand,
  InterfaceCommand,
  LifecycleCommand,
  NodeCommand
} from "../../shared/messages/extension";
import {
  isCustomNodeCommand,
  isIconCommand,
  isInterfaceCommand,
  isLifecycleCommand,
  MSG_CANCEL_LAB_LIFECYCLE,
  isNodeCommand,
  MSG_TOGGLE_SPLIT_VIEW
} from "../../shared/messages/extension";
import { cancelActiveCommand } from "../../../commands/command";

type WebviewMessage = Record<string, unknown> & {
  type?: string;
  command?: string;
  requestId?: string;
  endpointName?: string;
};

const TOPOLOGY_HOST_GET_SNAPSHOT = "topology-host:get-snapshot";
const TOPOLOGY_HOST_COMMAND = "topology-host:command";
const TOPOLOGY_HOST_SNAPSHOT = "topology-host:snapshot";
const TOPOLOGY_HOST_ACK = "topology-host:ack";
const TOPOLOGY_HOST_REJECT = "topology-host:reject";
const TOPOLOGY_HOST_ERROR = "topology-host:error";
const SNAPSHOT_ERROR_MODAL_COOLDOWN_MS = 5000;
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
  private lastSnapshotErrorModalAt = 0;
  private lastSnapshotErrorModalKey = "";

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
  private postTopologyHostError(
    panel: vscode.WebviewPanel,
    requestId: string,
    error: string
  ): void {
    panel.webview.postMessage({
      type: TOPOLOGY_HOST_ERROR,
      protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
      requestId,
      error
    });
  }

  private getTopologyHostProtocolVersion(message: WebviewMessage): number | undefined {
    return typeof (message as { protocolVersion?: unknown }).protocolVersion === "number"
      ? (message as { protocolVersion?: number }).protocolVersion
      : undefined;
  }

  private parseTopologyHostCommand(
    message: WebviewMessage
  ): { command: TopologyHostCommand; baseRevision: number } | null {
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
      return null;
    }
    return { command: commandPayload as TopologyHostCommand, baseRevision };
  }

  private async sendTopologySnapshot(
    host: TopologyHost,
    panel: vscode.WebviewPanel,
    requestId: string
  ): Promise<void> {
    try {
      const snapshot = await host.getSnapshot();
      this.context.onHostSnapshot?.(snapshot);
      panel.webview.postMessage({
        type: TOPOLOGY_HOST_SNAPSHOT,
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId,
        snapshot,
        reason: "init"
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.showSnapshotLoadErrorModal(errorMessage);
      this.postTopologyHostError(
        panel,
        requestId,
        errorMessage
      );
    }
  }

  private showSnapshotLoadErrorModal(errorMessage: string): void {
    const yamlPath = this.context.yamlFilePath || "unknown topology file";
    const modalMessage = `Failed to read topology files for:\n${yamlPath}\n\n${errorMessage}`;
    const modalKey = `${yamlPath}:${errorMessage}`;
    const now = Date.now();
    if (
      this.lastSnapshotErrorModalKey === modalKey &&
      now - this.lastSnapshotErrorModalAt < SNAPSHOT_ERROR_MODAL_COOLDOWN_MS
    ) {
      return;
    }
    this.lastSnapshotErrorModalKey = modalKey;
    this.lastSnapshotErrorModalAt = now;
    void vscode.window.showErrorMessage(modalMessage, { modal: true });
  }

  private async handleTopologyHostMessage(
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<boolean> {
    const msgType = typeof message.type === "string" ? message.type : "";
    if (msgType !== TOPOLOGY_HOST_GET_SNAPSHOT && msgType !== TOPOLOGY_HOST_COMMAND) {
      return false;
    }

    const requestId = typeof message.requestId === "string" ? message.requestId : "";
    const protocolVersion = this.getTopologyHostProtocolVersion(message);

    if (protocolVersion !== TOPOLOGY_HOST_PROTOCOL_VERSION) {
      this.postTopologyHostError(
        panel,
        requestId,
        `Unsupported topology host protocol version: ${protocolVersion ?? "unknown"}`
      );
      return true;
    }

    const host = this.context.topologyHost;
    if (!host) {
      this.postTopologyHostError(panel, requestId, "Topology host unavailable");
      return true;
    }

    if (msgType === TOPOLOGY_HOST_GET_SNAPSHOT) {
      await this.sendTopologySnapshot(host, panel, requestId);
      return true;
    }

    const commandData = this.parseTopologyHostCommand(message);
    if (!commandData) {
      this.postTopologyHostError(panel, requestId, "Invalid topology host command payload");
      return true;
    }

    const response = await host.applyCommand(commandData.command, commandData.baseRevision);
    const responseWithId = { ...response, requestId: requestId || response.requestId };
    if (responseWithId.type === TOPOLOGY_HOST_ACK || responseWithId.type === TOPOLOGY_HOST_REJECT) {
      const snapshot = (responseWithId as { snapshot?: TopologySnapshot }).snapshot;
      if (snapshot) {
        this.context.onHostSnapshot?.(snapshot);
      }
    }
    panel.webview.postMessage(responseWithId);
    return true;
  }

  private async handleLifecycleCommand(command: LifecycleCommand): Promise<void> {
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

  private handleCancelLabLifecycle(panel: vscode.WebviewPanel): void {
    const cancelled = cancelActiveCommand();
    if (!cancelled) {
      log.warn("[MessageRouter] No active lifecycle command to cancel");
      panel.webview.postMessage({
        type: MSG_LAB_LIFECYCLE_STATUS,
        data: {
          status: "error",
          errorMessage: "No active lifecycle command to cancel."
        }
      });
      return;
    }
    log.info("[MessageRouter] Lifecycle command cancellation requested");
    panel.webview.postMessage({
      type: MSG_LAB_LIFECYCLE_STATUS,
      data: {
        status: "error",
        errorMessage: "Lifecycle command cancelled by user."
      }
    });
  }

  private async handleCustomNodeCommand(
    command: CustomNodeCommand,
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const res = await this.executeCustomNodeCommand(command, message);
    if (!res) return;

    if (res.error) {
      log.error(`[MessageRouter] ${res.error}`);
      // Send error back to webview so user can see the failure
      panel.webview.postMessage({
        type: MSG_CUSTOM_NODE_ERROR,
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
        type: MSG_CUSTOM_NODE_UPDATED,
        customNodes: payload.customNodes,
        defaultNode: payload.defaultNode ?? ""
      });
    }
  }

  private async executeCustomNodeCommand(
    command: CustomNodeCommand,
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

  private getYamlFilePath(command: string): string | null {
    const yamlFilePath = this.context.yamlFilePath;
    if (!yamlFilePath) {
      log.warn(`[MessageRouter] Cannot run ${command}: no YAML path available`);
      return null;
    }
    return yamlFilePath;
  }

  private getCustomNodeName(message: WebviewMessage): string {
    return typeof message.name === "string" ? message.name : "";
  }

  private async handleNodeCommand(command: NodeCommand, message: WebviewMessage): Promise<void> {
    const yamlFilePath = this.getYamlFilePath(command);
    if (!yamlFilePath) return;
    const nodeName = typeof message.nodeName === "string" ? message.nodeName : "";
    if (!nodeName) {
      log.warn(`[MessageRouter] Invalid node command payload: ${JSON.stringify(message)}`);
      return;
    }
    const res = await nodeCommandService.handleNodeEndpoint(command, nodeName, yamlFilePath);
    if (res.error) log.error(`[MessageRouter] ${res.error}`);
    else if (res.result) log.info(`[MessageRouter] ${res.result}`);
  }

  private async handleInterfaceCommand(
    command: InterfaceCommand,
    message: WebviewMessage
  ): Promise<void> {
    const yamlFilePath = this.getYamlFilePath(command);
    if (!yamlFilePath) return;
    const nodeName = typeof message.nodeName === "string" ? message.nodeName : "";
    const interfaceName = typeof message.interfaceName === "string" ? message.interfaceName : "";
    const data =
      typeof message.data === "object" ? (message.data as Record<string, unknown>) : undefined;
    if (!nodeName || !interfaceName) {
      log.warn(`[MessageRouter] Invalid interface command payload: ${JSON.stringify(message)}`);
      return;
    }
    const res = await nodeCommandService.handleInterfaceEndpoint(
      command,
      { nodeName, interfaceName, data },
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
    command: IconCommand,
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
      type: MSG_ICON_LIST_RESPONSE,
      icons
    });
  }

  private async handleCommandMessage(
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<boolean> {
    const command = typeof message.command === "string" ? message.command : "";
    if (!command) return false;

    if (isLifecycleCommand(command)) {
      await this.handleLifecycleCommand(command);
      return true;
    }

    if (command === MSG_CANCEL_LAB_LIFECYCLE) {
      this.handleCancelLabLifecycle(panel);
      return true;
    }

    if (isNodeCommand(command)) {
      await this.handleNodeCommand(command, message);
      return true;
    }

    if (isInterfaceCommand(command)) {
      await this.handleInterfaceCommand(command, message);
      return true;
    }

    if (command === MSG_TOGGLE_SPLIT_VIEW) {
      await this.handleSplitViewToggle(panel);
      return true;
    }

    if (isCustomNodeCommand(command)) {
      await this.handleCustomNodeCommand(command, message, panel);
      return true;
    }

    if (isIconCommand(command)) {
      await this.handleIconCommand(command, message, panel);
      return true;
    }

    if (command === "dump-css-vars") {
      await this.handleDumpCssVars(message);
      return true;
    }

    return false;
  }

  private async handleDumpCssVars(message: WebviewMessage): Promise<void> {
    const vars = message.vars;
    if (!vars || typeof vars !== "object") {
      log.warn("[MessageRouter] dump-css-vars: no vars payload");
      return;
    }
    const yamlFilePath = this.context.yamlFilePath;
    if (!yamlFilePath) {
      log.warn("[MessageRouter] dump-css-vars: yamlFilePath is unavailable");
      return;
    }
    const outPath = path.join(path.dirname(yamlFilePath), "vscode-css-vars.json");
    await nodeFsAdapter.writeFile(outPath, JSON.stringify(vars, null, 2));
    log.info(`[MessageRouter] Wrote CSS vars to ${outPath}`);
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
