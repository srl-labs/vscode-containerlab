/**
 * MessageRouter - Handles webview message routing for ReactTopoViewer
 */

import * as fs from "fs";
import * as path from "path";

import type * as vscode from "vscode";

import { log, logWithLocation } from "../services/logger";
import { labLifecycleService } from "../services/LabLifecycleService";
import { nodeCommandService } from "../services/NodeCommandService";
import type { SplitViewManager } from "../services/SplitViewManager";
import { customNodeConfigManager } from "../services/CustomNodeConfigManager";
import type { CustomNodeConfig } from "../services/CustomNodeConfigManager";
import { iconService } from "../services/IconService";
import {
  MSG_CUSTOM_NODE_ERROR,
  MSG_CUSTOM_NODE_UPDATED,
  MSG_ICON_LIST_RESPONSE
} from "../../shared/messages/webview";

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

const INTERFACE_COMMANDS = new Set(["clab-interface-capture", "clab-link-impairment"]);

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
  loadTopologyData: () => Promise<unknown>;
  splitViewManager: SplitViewManager;
  setInternalUpdate: (updating: boolean) => void;
  onInternalFileWritten?: (filePath: string, content: string) => void;
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
   * Resolve and validate an fs request path.
   * Webviews are not a trust boundary; only allow access to the active lab YAML
   * and its adjacent annotations file.
   */
  private validateFsPath(
    filePath: string
  ): { ok: true; normalizedPath: string } | { ok: false; error: string } {
    const yamlFilePath = this.context.yamlFilePath;
    if (!yamlFilePath) {
      return { ok: false, error: "No YAML file path available" };
    }

    const normalizedRequested = path.resolve(filePath);
    const normalizedYaml = path.resolve(yamlFilePath);
    const normalizedAnnotations = path.resolve(`${yamlFilePath}.annotations.json`);

    if (normalizedRequested === normalizedYaml || normalizedRequested === normalizedAnnotations) {
      return { ok: true, normalizedPath: normalizedRequested };
    }

    return { ok: false, error: "File access denied" };
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
   * Handle file system messages from webview (fs:read, fs:write, fs:unlink, fs:exists)
   */
  private async handleFsMessage(
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<boolean> {
    const msgType = typeof message.type === "string" ? message.type : "";
    if (!msgType?.startsWith("fs:")) {
      return false;
    }

    const requestId = typeof message.requestId === "string" ? message.requestId : undefined;
    const filePath = typeof message.path === "string" ? message.path : undefined;

    if (!requestId) {
      log.warn("[MessageRouter] fs: message missing requestId");
      return true;
    }

    if (!filePath) {
      this.respondFs(panel, requestId, null, "Missing path parameter");
      return true;
    }

    const validation = this.validateFsPath(filePath);
    if (!validation.ok) {
      this.respondFs(panel, requestId, null, validation.error);
      return true;
    }

    try {
      const handlers: Record<string, () => Promise<void>> = {
        "fs:read": () => this.handleFsRead(validation.normalizedPath, requestId, panel),
        "fs:write": () =>
          this.handleFsWrite(
            validation.normalizedPath,
            typeof message.content === "string" ? message.content : undefined,
            requestId,
            panel
          ),
        "fs:unlink": () => this.handleFsUnlink(validation.normalizedPath, requestId, panel),
        "fs:exists": () => this.handleFsExists(validation.normalizedPath, requestId, panel)
      };

      const handler = handlers[msgType];
      if (!handler) {
        this.respondFs(panel, requestId, null, `Unknown fs message type: ${msgType}`);
        return true;
      }

      await handler();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.respondFs(panel, requestId, null, error);
    }

    return true;
  }

  private async handleFsRead(
    filePath: string,
    requestId: string,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      this.respondFs(panel, requestId, content);
    } catch (err) {
      this.respondFs(panel, requestId, null, err instanceof Error ? err.message : String(err));
    }
  }

  private async handleFsWrite(
    filePath: string,
    content: string | undefined,
    requestId: string,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    if (content === undefined) {
      this.respondFs(panel, requestId, null, "Missing content parameter");
      return;
    }
    this.context.setInternalUpdate(true);
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content, "utf-8");
      if (this.context.onInternalFileWritten) {
        this.context.onInternalFileWritten(filePath, content);
      }
      this.respondFs(panel, requestId, null);
    } catch (err) {
      this.respondFs(panel, requestId, null, err instanceof Error ? err.message : String(err));
    } finally {
      this.context.setInternalUpdate(false);
    }
  }

  private async handleFsUnlink(
    filePath: string,
    requestId: string,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    this.context.setInternalUpdate(true);
    try {
      await fs.promises.unlink(filePath);
      this.respondFs(panel, requestId, null);
    } catch (err) {
      // Don't throw if file doesn't exist
      const code = (err as { code?: string }).code;
      if (code === "ENOENT") {
        this.respondFs(panel, requestId, null);
      } else {
        this.respondFs(panel, requestId, null, err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.context.setInternalUpdate(false);
    }
  }

  private async handleFsExists(
    filePath: string,
    requestId: string,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    try {
      await fs.promises.access(filePath);
      this.respondFs(panel, requestId, true);
    } catch {
      this.respondFs(panel, requestId, false);
    }
  }

  private respondFs(
    panel: vscode.WebviewPanel,
    requestId: string,
    result: unknown,
    error?: string
  ): void {
    panel.webview.postMessage({
      type: "fs:response",
      requestId,
      result,
      error: error ?? null
    });
  }

  /**
   * Handle POST request messages
   */
  private async handlePostMessage(
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const requestId = message.requestId;
    const endpointName = message.endpointName;
    let result: unknown = null;
    let error: string | null = null;

    try {
      if (endpointName === "get-topology-data") {
        result = await this.context.loadTopologyData();
      } else {
        error = `Unknown endpoint: ${endpointName}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    panel.webview.postMessage({
      type: "POST_RESPONSE",
      requestId,
      result,
      error
    });
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
<<<<<<< HEAD
=======
    const data =
      typeof message.data === "object" ? (message.data as Record<string, unknown>) : undefined;
>>>>>>> b02b6e25 (Set link impairment)
    if (!nodeName || !interfaceName) {
      log.warn(`[MessageRouter] Invalid interface command payload: ${JSON.stringify(message)}`);
      return;
    }
    const res = await nodeCommandService.handleInterfaceEndpoint(
      command,
<<<<<<< HEAD
      { nodeName, interfaceName },
=======
      { nodeName, interfaceName, data },
>>>>>>> b02b6e25 (Set link impairment)
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

    // Handle file system messages (fs:read, fs:write, fs:unlink, fs:exists)
    if (await this.handleFsMessage(message, panel)) {
      return;
    }

    // Handle command messages (lifecycle, node/interface commands, split view, custom nodes)
    if (await this.handleCommandMessage(message, panel)) {
      return;
    }

    // Handle POST requests (production-specific)
    if (message.type === "POST" && message.requestId && message.endpointName) {
      await this.handlePostMessage(message, panel);
    }
  }
}
