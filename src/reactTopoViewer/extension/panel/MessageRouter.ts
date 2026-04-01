/**
 * MessageRouter - Handles webview message routing for ReactTopoViewer
 */

import * as path from "path";

import * as vscode from "vscode";

import { formatErrorMessage, formatUnknownForLog, log, logWithLocation } from "../services/logger";
import { labLifecycleService } from "../services/LabLifecycleService";
import { nodeCommandService } from "../services/NodeCommandService";
import type { SplitViewManager } from "../services/SplitViewManager";
import { customNodeConfigManager } from "../services/CustomNodeConfigManager";
import type { CustomNodeConfig } from "../services/CustomNodeConfigManager";
import { iconService } from "../services/IconService";
import {
  MSG_CANCEL_LAB_LIFECYCLE,
  MSG_CUSTOM_NODE_ERROR,
  MSG_CUSTOM_NODE_UPDATED,
  MSG_ICON_LIST_RESPONSE,
  MSG_LAB_LIFECYCLE_STATUS,
  MSG_SVG_EXPORT_RESULT,
  MSG_TOGGLE_SPLIT_VIEW,
  isCustomNodeCommand,
  isExportCommand,
  isIconCommand,
  isInterfaceCommand,
  isLifecycleCommand,
  isNodeCommand,
  handleTopologyHostProtocolMessage,
  type CustomNodeCommand,
  type ExportCommand,
  type IconCommand,
  type InterfaceCommand,
  type LifecycleCommand,
  type NodeCommand,
  type TopologyHost,
  type TopologyHostResponseMessage,
  type TopologySnapshot
} from "@srl-labs/clab-ui/session";
import { nodeFsAdapter } from "../shared/io";
import { cancelActiveCommand } from "../../../commands/command";

type WebviewMessage = Record<string, unknown> & {
  type?: unknown;
  command?: unknown;
  requestId?: unknown;
  endpointName?: unknown;
};

interface GrafanaBundleExportPayload {
  requestId: string;
  baseName: string;
  svgContent: string;
  dashboardJson: string;
  panelYaml: string;
}

const SNAPSHOT_ERROR_MODAL_COOLDOWN_MS = 5000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
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
      logWithLocation(level, logMsg, fileLine);
      return true;
    }

    if (command === "topoViewerLog") {
      const level = typeof message.level === "string" ? message.level : "info";
      const logMessage = typeof message.message === "string" ? message.message : "";
      const loggers: Record<string, (value: string) => void> = {
        error: (value: string) => {
          log.error(value);
        },
        warn: (value: string) => {
          log.warn(value);
        },
        debug: (value: string) => {
          log.debug(value);
        },
        info: (value: string) => {
          log.info(value);
        }
      };
      const logger = loggers[level] ?? loggers.info;
      logger(logMessage);
      return true;
    }

    return false;
  }

  /**
   * Handle TopologyHost protocol messages (snapshot + commands)
   */
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
    return handleTopologyHostProtocolMessage({
      host: this.context.topologyHost,
      message,
      onSnapshot: (snapshot: TopologySnapshot) => {
        this.context.onHostSnapshot?.(snapshot);
      },
      onSnapshotLoadError: (errorMessage: string) => {
        this.showSnapshotLoadErrorModal(errorMessage);
      },
      postMessage: (response: TopologyHostResponseMessage) => {
        panel.webview.postMessage(response);
      }
    });
  }

  private async handleLifecycleCommand(command: LifecycleCommand): Promise<void> {
    const yamlFilePath = this.context.yamlFilePath;
    if (!yamlFilePath) {
      log.warn(`[MessageRouter] Cannot run ${command}: no YAML path available`);
      return;
    }
    const res = await labLifecycleService.handleLabLifecycleEndpoint(command, yamlFilePath);
    if (res.error != null && res.error.length > 0) {
      log.error(`[MessageRouter] ${res.error}`);
    } else if (res.result != null) {
      log.info(`[MessageRouter] ${formatUnknownForLog(res.result)}`);
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
      log.error(`[MessageRouter] Failed to toggle split view: ${formatErrorMessage(err)}`);
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

    if (res.error != null && res.error.length > 0) {
      log.error(`[MessageRouter] ${res.error}`);
      // Send error back to webview so user can see the failure
      panel.webview.postMessage({
        type: MSG_CUSTOM_NODE_ERROR,
        error: res.error
      });
      return;
    }

    const payload = isRecord(res.result) ? res.result : null;
    const customNodes = Array.isArray(payload?.customNodes) ? payload.customNodes : undefined;
    const defaultNode = typeof payload?.defaultNode === "string" ? payload.defaultNode : "";
    if (customNodes !== undefined) {
      panel.webview.postMessage({
        type: MSG_CUSTOM_NODE_UPDATED,
        customNodes,
        defaultNode
      });
    }
  }

  private async executeCustomNodeCommand(
    command: CustomNodeCommand,
    message: WebviewMessage
  ): Promise<{ result?: unknown; error?: string | null } | undefined> {
    switch (command) {
      case "save-custom-node": {
        const data = this.parseCustomNodeSavePayload(message);
        if (!data) return undefined;
        return customNodeConfigManager.saveCustomNode(data);
      }
      case "delete-custom-node": {
        const name = this.getCustomNodeName(message);
        return customNodeConfigManager.deleteCustomNode(name);
      }
      case "set-default-custom-node": {
        const name = this.getCustomNodeName(message);
        return customNodeConfigManager.setDefaultCustomNode(name);
      }
      default:
        return undefined;
    }
  }

  private parseCustomNodeSavePayload(message: WebviewMessage): CustomNodeConfig | null {
    const payload = message;
    const name = typeof payload.name === "string" ? payload.name : "";
    const kind = typeof payload.kind === "string" ? payload.kind : "";
    if (!name || !kind) {
      log.error(`[MessageRouter] Invalid custom node payload: ${JSON.stringify(message)}`);
      return null;
    }
    const config: CustomNodeConfig = { name, kind };
    for (const [key, value] of Object.entries(payload)) {
      if (key === "name" || key === "kind") continue;
      config[key] = value;
    }
    return config;
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

  private sanitizeExportBaseName(baseName: string): string {
    const trimmed = baseName.trim();
    if (!trimmed) return "topology";
    const withoutSvg = trimmed.replace(/\.svg$/i, "");
    const invalidChars = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
    const sanitized = withoutSvg
      .split("")
      .map((char) => (char.charCodeAt(0) < 32 || invalidChars.has(char) ? "-" : char))
      .join("")
      .trim();
    return sanitized || "topology";
  }

  private postSvgExportResult(
    panel: vscode.WebviewPanel,
    payload: {
      requestId: string;
      success: boolean;
      error?: string;
      files?: string[];
    }
  ): void {
    panel.webview.postMessage({
      type: MSG_SVG_EXPORT_RESULT,
      requestId: payload.requestId,
      success: payload.success,
      ...(payload.error != null && payload.error.length > 0 ? { error: payload.error } : {}),
      ...(Array.isArray(payload.files) && payload.files.length > 0 ? { files: payload.files } : {})
    });
  }

  private parseGrafanaBundlePayload(message: WebviewMessage): GrafanaBundleExportPayload | null {
    const requestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
    const baseName = typeof message.baseName === "string" ? message.baseName : "topology";
    const svgContent = typeof message.svgContent === "string" ? message.svgContent : "";
    const dashboardJson = typeof message.dashboardJson === "string" ? message.dashboardJson : "";
    const panelYaml = typeof message.panelYaml === "string" ? message.panelYaml : "";

    if (!requestId || !svgContent || !dashboardJson || !panelYaml) {
      return null;
    }

    return {
      requestId,
      baseName: this.sanitizeExportBaseName(baseName),
      svgContent,
      dashboardJson,
      panelYaml
    };
  }

  private async handleGrafanaBundleExport(
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const payload = this.parseGrafanaBundlePayload(message);
    const requestId =
      payload?.requestId ?? (typeof message.requestId === "string" ? message.requestId : "");
    if (!payload) {
      this.postSvgExportResult(panel, {
        requestId,
        success: false,
        error: "Invalid SVG Grafana export payload"
      });
      return;
    }

    const yamlDir = this.context.yamlFilePath ? path.dirname(this.context.yamlFilePath) : undefined;
    const defaultFile = `${payload.baseName}.svg`;
    const defaultUri =
      yamlDir != null && yamlDir.length > 0
        ? vscode.Uri.file(path.join(yamlDir, defaultFile))
        : undefined;

    try {
      const selectedUri = await vscode.window.showSaveDialog({
        title: "Export Grafana SVG Bundle",
        saveLabel: "Export",
        defaultUri,
        filters: { SVG: ["svg"] }
      });

      if (!selectedUri) {
        this.postSvgExportResult(panel, {
          requestId: payload.requestId,
          success: false,
          error: "Export cancelled"
        });
        return;
      }

      const selectedPath = selectedUri.fsPath;
      const basePath = selectedPath.toLowerCase().endsWith(".svg")
        ? selectedPath.slice(0, -4)
        : selectedPath;

      const svgPath = `${basePath}.svg`;
      const dashboardPath = `${basePath}.grafana.json`;
      const panelPath = `${basePath}.flow_panel.yaml`;

      await nodeFsAdapter.writeFile(svgPath, payload.svgContent);
      await nodeFsAdapter.writeFile(dashboardPath, payload.dashboardJson);
      await nodeFsAdapter.writeFile(panelPath, payload.panelYaml);

      this.postSvgExportResult(panel, {
        requestId: payload.requestId,
        success: true,
        files: [svgPath, dashboardPath, panelPath]
      });
      log.info(
        `[MessageRouter] Exported Grafana SVG bundle: ${svgPath}, ${dashboardPath}, ${panelPath}`
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.postSvgExportResult(panel, {
        requestId: payload.requestId,
        success: false,
        error
      });
      log.error(`[MessageRouter] Failed to export Grafana SVG bundle: ${error}`);
    }
  }

  private async handleExportCommand(
    _command: ExportCommand,
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    await this.handleGrafanaBundleExport(message, panel);
  }

  private async handleNodeCommand(command: NodeCommand, message: WebviewMessage): Promise<void> {
    const yamlFilePath = this.getYamlFilePath(command);
    if (yamlFilePath == null || yamlFilePath.length === 0) return;
    const nodeName = typeof message.nodeName === "string" ? message.nodeName : "";
    if (!nodeName) {
      log.warn(`[MessageRouter] Invalid node command payload: ${JSON.stringify(message)}`);
      return;
    }
    const res = await nodeCommandService.handleNodeEndpoint(command, nodeName, yamlFilePath);
    if (res.error != null && res.error.length > 0) log.error(`[MessageRouter] ${res.error}`);
    else if (res.result != null) log.info(`[MessageRouter] ${formatUnknownForLog(res.result)}`);
  }

  private async handleInterfaceCommand(
    command: InterfaceCommand,
    message: WebviewMessage
  ): Promise<void> {
    const yamlFilePath = this.getYamlFilePath(command);
    if (yamlFilePath == null || yamlFilePath.length === 0) return;
    const nodeName = typeof message.nodeName === "string" ? message.nodeName : "";
    const interfaceName = typeof message.interfaceName === "string" ? message.interfaceName : "";
    const data = isRecord(message.data) ? message.data : undefined;
    if (!nodeName || !interfaceName) {
      log.warn(`[MessageRouter] Invalid interface command payload: ${JSON.stringify(message)}`);
      return;
    }
    const res = await nodeCommandService.handleInterfaceEndpoint(
      command,
      { nodeName, interfaceName, data },
      yamlFilePath
    );
    if (res.error != null && res.error.length > 0) log.error(`[MessageRouter] ${res.error}`);
    else if (res.result != null) log.info(`[MessageRouter] ${formatUnknownForLog(res.result)}`);
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
    const usedIcons = asStringArray(message.usedIcons);
    await iconService.reconcileWorkspaceIcons(yamlFilePath, usedIcons);
  }

  private async handleIconCommand(
    command: IconCommand,
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    try {
      const handlers: Record<IconCommand, () => Promise<void>> = {
        "icon-list": () => this.handleIconList(panel),
        "icon-upload": () => this.handleIconUpload(panel),
        "icon-delete": () => this.handleIconDelete(message, panel),
        "icon-reconcile": () => this.handleIconReconcile(message)
      };
      await handlers[command]();
    } catch (err) {
      log.error(`[MessageRouter] Icon command error: ${formatErrorMessage(err)}`);
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

    if (isExportCommand(command)) {
      await this.handleExportCommand(command, message, panel);
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
    if (!isRecord(vars)) {
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
    // Handle log commands locally (production-specific logging)
    if (this.handleLogCommand(message)) {
      return;
    }

    // Handle command messages (lifecycle, node/interface commands, split view, custom nodes)
    if (await this.handleCommandMessage(message, panel)) {
      return;
    }

    // Handle TopologyHost protocol messages
    await this.handleTopologyHostMessage(message, panel);
  }
}
