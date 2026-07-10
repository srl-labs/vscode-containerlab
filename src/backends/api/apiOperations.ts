import type WebSocket from "ws";

import { ApiRequestError, type ClabApiTransport } from "./apiTransport";
import type { ApiSession } from "./apiSession";

export interface ApiTopologyEntry {
  labName: string;
  yamlFileName: string;
  annotationsFileName: string;
  hasAnnotations: boolean;
  deploymentState: string;
}

export interface ApiTopologyImportResult {
  success: boolean;
  labName: string;
  fileName: string;
  topology: ApiTopologyEntry;
}

export type ApiNodeLifecycleAction = "start" | "stop" | "restart" | "pause" | "unpause";
export type ApiTerminalProtocol = "ssh" | "shell" | "telnet";
export type ApiShareAction = "attach" | "detach" | "reattach";

export interface ApiSshAccessResponse {
  port: number;
  host: string;
  username: string;
  expiration: string;
  command: string;
}

export interface ApiTerminalSessionInfo {
  sessionId: string;
  username: string;
  labName: string;
  nodeName: string;
  protocol: ApiTerminalProtocol;
  state: string;
  createdAt: string;
  expiresAt: string;
  lastActivity: string;
  exitCode?: number | null;
  error?: string;
}

export interface ApiNodeLogsResponse {
  containerName: string;
  logs: string;
}

export interface ApiNodeBrowserPort {
  hostIp?: string;
  hostPort: number;
  containerPort: number;
  protocol?: string;
  description?: string;
}

export interface ApiNodeBrowserPortsResponse {
  nodeName: string;
  containerName: string;
  ports: ApiNodeBrowserPort[];
}

export interface ApiShareResponse {
  message: string;
  link?: string;
  output?: string;
}

export interface ApiFcliResponse {
  command: string;
  output: string;
}

export interface ApiDrawioResponse {
  fileName: string;
  content: string;
  layout: string;
  message?: string;
  output?: string;
}

export interface ApiRuntimeImageSummary {
  id: string;
  shortId?: string;
  repoTags: string[];
  repoDigests: string[];
  created?: number;
  createdAt?: string;
  size?: number | string;
  virtualSize?: number | string;
}

export interface ApiRuntimeImagesResponse {
  runtime: string;
  images: ApiRuntimeImageSummary[];
}

export interface ApiRuntimeImageActionResponse {
  success: boolean;
  image?: string;
  message?: string;
  output?: string;
}

export interface ApiCaptureTarget {
  containerName: string;
  interfaceName: string;
}

export interface ApiPacketflixCaptureResponse {
  captures: Array<{
    containerName: string;
    interfaceNames: string[];
    packetflixUri: string;
  }>;
}

export interface ApiNetemRequest {
  containerName: string;
  interface: string;
  delay?: string;
  jitter?: string;
  loss?: number;
  rate?: number;
  corruption?: number;
}

export interface ApiWorkspaceFileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size?: number;
  modifiedAt?: string;
  hasChildren?: boolean;
}

interface ApiOperationsOptions {
  onMutation: () => void;
  onRequestError: (error: unknown) => void;
  onRequestSuccess: () => void;
  refreshRuntime: () => Promise<void>;
  session: ApiSession;
  transport: ClabApiTransport;
}

function queryString(values: Record<string, string | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== false && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function labPath(labName: string, suffix = ""): string {
  return `/api/v1/labs/${encodeURIComponent(labName)}${suffix}`;
}

function nodePath(labName: string, nodeName: string, suffix: string): string {
  return `${labPath(labName)}/nodes/${encodeURIComponent(nodeName)}${suffix}`;
}

/** Typed clab-api-server feature client; it owns REST paths, not backend lifecycle state. */
export class ApiContainerlabOperations {
  constructor(private readonly options: ApiOperationsOptions) {}

  async listTopologies(): Promise<ApiTopologyEntry[]> {
    const entries = await this.get<ApiTopologyEntry[]>("/api/v1/labs/topology/files");
    return Array.isArray(entries) ? entries : [];
  }

  async readTopologyYaml(labName: string): Promise<string> {
    return await this.getText(`${labPath(labName)}/topology/yaml`);
  }

  async readTopologyFile(labName: string, remotePath: string): Promise<string> {
    return await this.getText(
      `${labPath(labName)}/topology/file${queryString({ path: remotePath })}`
    );
  }

  async readTopologyFileIfExists(labName: string, remotePath: string): Promise<string | undefined> {
    try {
      return await this.readTopologyFile(labName, remotePath);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return undefined;
      throw error;
    }
  }

  async writeTopologyYaml(labName: string, content: string | Buffer, notify = true): Promise<void> {
    await this.requestVoid(
      "PUT",
      `${labPath(labName)}/topology/yaml`,
      content,
      "text/plain; charset=utf-8"
    );
    if (notify) this.options.onMutation();
  }

  async writeTopologyFile(
    labName: string,
    remotePath: string,
    content: string | Buffer,
    notify = true
  ): Promise<void> {
    await this.requestVoid(
      "PUT",
      `${labPath(labName)}/topology/file${queryString({ path: remotePath })}`,
      content,
      "application/octet-stream"
    );
    if (notify) this.options.onMutation();
  }

  async readTopologyAnnotations(labName: string): Promise<string | undefined> {
    try {
      return await this.getText(`${labPath(labName)}/topology/annotations`);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return undefined;
      throw error;
    }
  }

  async writeTopologyAnnotations(
    labName: string,
    content: string | Buffer,
    notify = false
  ): Promise<void> {
    await this.requestVoid(
      "PUT",
      `${labPath(labName)}/topology/annotations`,
      content,
      "application/json; charset=utf-8"
    );
    if (notify) this.options.onMutation();
  }

  async deleteTopologyFile(labName: string, remotePath: string): Promise<void> {
    await this.requestVoid(
      "DELETE",
      `${labPath(labName)}/topology/file${queryString({ path: remotePath })}`
    );
    this.options.onMutation();
  }

  async importTopologyFromUrl(topologySourceUrl: string): Promise<ApiTopologyImportResult> {
    const result = await this.post<ApiTopologyImportResult>(
      "/api/v1/labs/topology/import-from-url",
      { topologySourceUrl }
    );
    this.options.onMutation();
    return result;
  }

  async saveLabConfig(
    labName: string,
    nodeFilter?: string
  ): Promise<{ message?: string; output?: string }> {
    return await this.post<{ message?: string; output?: string }>(
      `${labPath(labName)}/save${queryString({ nodeFilter })}`,
      {}
    );
  }

  async controlNodeLifecycle(
    labName: string,
    nodeName: string,
    action: ApiNodeLifecycleAction
  ): Promise<void> {
    await this.requestVoid(
      "POST",
      nodePath(labName, nodeName, `/${action}`),
      "{}",
      "application/json"
    );
    await this.options.refreshRuntime();
    this.options.onMutation();
  }

  async requestSshAccess(
    labName: string,
    nodeName: string,
    input: { sshUsername?: string; duration?: string } = {}
  ): Promise<ApiSshAccessResponse> {
    return await this.post<ApiSshAccessResponse>(nodePath(labName, nodeName, "/ssh"), input);
  }

  async createTerminalSession(
    labName: string,
    nodeName: string,
    input: {
      protocol: ApiTerminalProtocol;
      cols: number;
      rows: number;
      sshUsername?: string;
      telnetPort?: number;
    }
  ): Promise<ApiTerminalSessionInfo> {
    return await this.post<ApiTerminalSessionInfo>(
      nodePath(labName, nodeName, "/terminal-sessions"),
      input
    );
  }

  async deleteTerminalSession(sessionId: string): Promise<void> {
    await this.requestVoid("DELETE", `/api/v1/terminal-sessions/${encodeURIComponent(sessionId)}`);
  }

  async openTerminalSessionSocket(sessionId: string): Promise<WebSocket> {
    return await this.trackRequest(async () => {
      const token = await this.options.session.requireToken();
      return await this.options.transport.openWebSocket(
        `/api/v1/terminal-sessions/${encodeURIComponent(sessionId)}/stream`,
        token
      );
    });
  }

  async getNodeLogs(
    labName: string,
    nodeName: string,
    tail?: string
  ): Promise<ApiNodeLogsResponse> {
    return await this.get<ApiNodeLogsResponse>(
      `${nodePath(labName, nodeName, "/logs")}${queryString({ tail })}`
    );
  }

  async getNodeBrowserPorts(
    labName: string,
    nodeName: string
  ): Promise<ApiNodeBrowserPortsResponse> {
    return await this.get<ApiNodeBrowserPortsResponse>(
      nodePath(labName, nodeName, "/browser-ports")
    );
  }

  async runShareAction(
    tool: "sshx" | "gotty",
    labName: string,
    action: ApiShareAction,
    port?: number
  ): Promise<ApiShareResponse> {
    return await this.post<ApiShareResponse>(
      `${labPath(labName)}/${tool}/${action}${queryString({
        port: port === undefined ? undefined : String(port)
      })}`,
      {}
    );
  }

  async runFcliCommand(labName: string, command: string): Promise<ApiFcliResponse> {
    return await this.post<ApiFcliResponse>(`${labPath(labName)}/fcli`, { command });
  }

  async generateDrawioGraph(
    labName: string,
    layout: "horizontal" | "vertical" | "interactive",
    theme?: string
  ): Promise<ApiDrawioResponse> {
    return await this.post<ApiDrawioResponse>(`${labPath(labName)}/graph/drawio`, {
      layout,
      theme
    });
  }

  async listRuntimeImages(): Promise<ApiRuntimeImagesResponse> {
    return await this.get<ApiRuntimeImagesResponse>("/api/v1/images");
  }

  async pullRuntimeImage(image: string): Promise<ApiRuntimeImageActionResponse> {
    return await this.post<ApiRuntimeImageActionResponse>("/api/v1/images/pull", { image });
  }

  async removeRuntimeImage(
    reference: string,
    force = false
  ): Promise<ApiRuntimeImageActionResponse> {
    return await this.requestJson<ApiRuntimeImageActionResponse>(
      "DELETE",
      `/api/v1/images${queryString({ reference, force })}`
    );
  }

  async setEdgeSharkInstalled(installed: boolean): Promise<void> {
    await this.requestVoid(
      "POST",
      `/api/v1/tools/edgeshark/${installed ? "install" : "uninstall"}`,
      "{}",
      "application/json"
    );
  }

  async buildPacketflixCapture(
    labName: string,
    targets: ApiCaptureTarget[],
    remoteHostname?: string
  ): Promise<ApiPacketflixCaptureResponse> {
    return await this.post<ApiPacketflixCaptureResponse>(`${labPath(labName)}/capture/packetflix`, {
      targets,
      remoteHostname
    });
  }

  async closeAllWiresharkVncSessions(): Promise<{ message: string; closed: number }> {
    return await this.requestJson<{ message: string; closed: number }>(
      "DELETE",
      "/api/v1/capture/wireshark-vnc-sessions"
    );
  }

  async showNetem(containerName: string): Promise<Record<string, unknown[]>> {
    return await this.get<Record<string, unknown[]>>(
      `/api/v1/tools/netem/show${queryString({ containerName })}`
    );
  }

  async setNetem(request: ApiNetemRequest): Promise<void> {
    await this.requestVoid(
      "POST",
      "/api/v1/tools/netem/set",
      JSON.stringify(request),
      "application/json"
    );
  }

  async resetNetem(containerName: string, interfaceName: string): Promise<void> {
    await this.requestVoid(
      "POST",
      "/api/v1/tools/netem/reset",
      JSON.stringify({ containerName, interface: interfaceName }),
      "application/json"
    );
  }

  async listWorkspaceTree(pathValue = ""): Promise<ApiWorkspaceFileEntry[]> {
    const entries = await this.get<ApiWorkspaceFileEntry[]>(
      `/api/v1/labs/workspace/tree${queryString({ path: pathValue })}`
    );
    return Array.isArray(entries) ? entries : [];
  }

  async readWorkspaceFile(pathValue: string): Promise<string> {
    return await this.getText(`/api/v1/labs/workspace/file${queryString({ path: pathValue })}`);
  }

  async writeWorkspaceFile(pathValue: string, content: string | Buffer): Promise<void> {
    await this.requestVoid(
      "PUT",
      `/api/v1/labs/workspace/file${queryString({ path: pathValue })}`,
      content,
      "application/octet-stream"
    );
    this.options.onMutation();
  }

  async deleteWorkspacePath(pathValue: string, recursive = false): Promise<void> {
    await this.requestVoid(
      "DELETE",
      `/api/v1/labs/workspace/file${queryString({ path: pathValue, recursive })}`
    );
    this.options.onMutation();
  }

  async renameWorkspacePath(oldPath: string, newPath: string): Promise<void> {
    await this.post("/api/v1/labs/workspace/file/rename", { oldPath, newPath });
    this.options.onMutation();
  }

  async createWorkspaceDirectory(pathValue: string): Promise<void> {
    await this.post("/api/v1/labs/workspace/directory", { path: pathValue });
    this.options.onMutation();
  }

  private async trackRequest<T>(request: () => Promise<T>): Promise<T> {
    try {
      const result = await request();
      this.options.onRequestSuccess();
      return result;
    } catch (error) {
      this.options.onRequestError(error);
      throw error;
    }
  }

  private async get<T>(path: string): Promise<T> {
    return await this.requestJson<T>("GET", path);
  }

  private async getText(path: string): Promise<string> {
    return await this.trackRequest(async () => {
      const token = await this.options.session.requireToken();
      return await this.options.transport.requestText("GET", path, { token });
    });
  }

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return await this.requestJson<T>("POST", path, body);
  }

  private async requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
    return await this.trackRequest(async () => {
      const token = await this.options.session.requireToken();
      return await this.options.transport.requestJson<T>(method, path, {
        token,
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body), contentType: "application/json" })
      });
    });
  }

  private async requestVoid(
    method: string,
    path: string,
    body?: string | Buffer,
    contentType?: string
  ): Promise<void> {
    await this.trackRequest(async () => {
      const token = await this.options.session.requireToken();
      await this.options.transport.requestVoid(method, path, {
        token,
        ...(body === undefined ? {} : { body }),
        ...(contentType === undefined ? {} : { contentType })
      });
    });
  }
}
