import * as vscode from "vscode";
import WebSocket from "ws";

import type { ApiContainerlabBackend } from "../backends/api/apiContainerlabBackend";
import type { ApiTerminalProtocol } from "../backends/api/apiOperations";
import type { ClabContainerTreeNode } from "../treeView/common";
import { DEFAULT_ATTACH_TELNET_PORT } from "../utils";

import { resolveApiNodeTarget } from "./backendGuards";

interface TerminalSocketPayload {
  data?: string;
  encoding?: string;
  error?: string;
  exitCode?: number | null;
  type?: string;
}

class ApiPseudoterminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();
  private socket: WebSocket | undefined;
  private sessionId: string | undefined;
  private dimensions: vscode.TerminalDimensions = { columns: 80, rows: 24 };
  private closed = false;

  readonly onDidWrite = this.writeEmitter.event;
  readonly onDidClose = this.closeEmitter.event;

  constructor(
    private readonly backend: ApiContainerlabBackend,
    private readonly labName: string,
    private readonly nodeName: string,
    private readonly protocol: ApiTerminalProtocol,
    private readonly telnetPort?: number
  ) {}

  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    if (initialDimensions) this.dimensions = initialDimensions;
    this.writeEmitter.fire(`Connecting to ${this.nodeName} through clab-api-server...\r\n`);
    void this.connect();
  }

  close(): void {
    void this.shutdown(true);
  }

  handleInput(data: string): void {
    this.send({ type: "input", data });
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this.dimensions = dimensions;
    this.send({
      type: "resize",
      cols: dimensions.columns,
      rows: dimensions.rows
    });
  }

  private async connect(): Promise<void> {
    try {
      const session = await this.backend.operations.createTerminalSession(
        this.labName,
        this.nodeName,
        {
          protocol: this.protocol,
          cols: this.dimensions.columns,
          rows: this.dimensions.rows,
          ...(this.protocol === "telnet" && this.telnetPort !== undefined
            ? { telnetPort: this.telnetPort }
            : {})
        }
      );
      if (this.closed) {
        await this.backend.operations.deleteTerminalSession(session.sessionId);
        return;
      }
      this.sessionId = session.sessionId;
      const socket = await this.backend.operations.openTerminalSessionSocket(session.sessionId);
      this.socket = socket;
      socket.on("message", (data) => this.handleSocketMessage(String(data)));
      socket.on("error", (error) => {
        this.writeEmitter.fire(`\r\n[terminal error] ${error.message}\r\n`);
      });
      socket.on("close", () => {
        this.socket = undefined;
        if (!this.closed) this.finish();
      });
    } catch (error) {
      this.writeEmitter.fire(
        `\r\n[terminal error] ${error instanceof Error ? error.message : String(error)}\r\n`
      );
      this.finish(1);
    }
  }

  private handleSocketMessage(raw: string): void {
    try {
      const payload = JSON.parse(raw) as TerminalSocketPayload;
      if (payload.type === "ready") {
        this.send({
          type: "resize",
          cols: this.dimensions.columns,
          rows: this.dimensions.rows
        });
        return;
      }
      if (payload.type === "output" && payload.data) {
        const output =
          payload.encoding === "base64"
            ? Buffer.from(payload.data, "base64").toString("utf8")
            : payload.data;
        this.writeEmitter.fire(output);
        return;
      }
      if (payload.type === "exit") {
        const suffix = payload.error ? ` ${payload.error}` : "";
        this.writeEmitter.fire(
          `\r\n[session ended${payload.exitCode != null ? `: ${payload.exitCode}` : ""}]${suffix}\r\n`
        );
        this.finish(payload.exitCode ?? 0);
      }
    } catch (error) {
      this.writeEmitter.fire(
        `\r\n[invalid terminal response] ${error instanceof Error ? error.message : String(error)}\r\n`
      );
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private finish(exitCode?: number): void {
    if (this.closed) return;
    this.closed = true;
    this.closeEmitter.fire(exitCode);
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
    void this.cleanupSession();
  }

  private async shutdown(requestClose: boolean): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (requestClose) this.send({ type: "close" });
    this.socket?.close();
    await this.cleanupSession();
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }

  private async cleanupSession(): Promise<void> {
    const sessionId = this.sessionId;
    this.sessionId = undefined;
    if (sessionId) await this.backend.operations.deleteTerminalSession(sessionId).catch(() => {});
  }
}

export function openApiTerminal(
  node: ClabContainerTreeNode | undefined,
  protocol: ApiTerminalProtocol
): boolean {
  const target = resolveApiNodeTarget(node);
  if (!target) return false;
  const telnetPort =
    protocol === "telnet"
      ? vscode.workspace
          .getConfiguration("containerlab")
          .get<number>("node.telnetPort", DEFAULT_ATTACH_TELNET_PORT)
      : undefined;
  const pty = new ApiPseudoterminal(
    target.backend,
    target.labName,
    target.nodeName,
    protocol,
    telnetPort
  );
  vscode.window
    .createTerminal({
      name: `${protocol === "shell" ? "Shell" : protocol.toUpperCase()} - ${target.nodeName}`,
      pty
    })
    .show();
  return true;
}
