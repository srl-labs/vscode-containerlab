import * as fs from "fs";
import * as path from "path";
import { createHash, randomBytes } from "crypto";

import * as vscode from "vscode";
import * as YAML from "yaml";

import { outputChannel } from "../../globals";
import type { ClabDetailedJSON, ClabLabTreeNode, LabRef } from "../../treeView/common";
import type { ClabInterfaceSnapshot } from "../../types/containerlab";

import type {
  AuthenticatedBackendSession,
  BackendCapability,
  BackendInitializationResult,
  BackendServerCapabilities,
  ContainerlabBackend,
  LabLifecycleRequest,
  RuntimeSnapshot
} from "../types";
import { apiTopologySourcePathMatches } from "../labIdentity";
import {
  ApiAuthenticationRequiredError,
  ApiRequestError,
  ClabApiTransport,
  apiUrlRequiresInsecureCredentialConfirmation,
  apiUrlRequiresUnverifiedTlsConfirmation,
  normalizedBaseUrl
} from "./apiTransport";
import { ApiSession } from "./apiSession";
import { ApiLabSourceRegistry } from "./apiLabSourceRegistry";
import {
  apiManagedTopologyPath,
  apiLifecycleMutationFlags,
  isHttpTopologySource,
  planApiTopologySource,
  planLocalTopologySync
} from "./apiLifecyclePlan";
import { advertisedBackendCapabilities, parseApiServerCapabilities } from "./apiCapabilities";
import { ApiContainerlabOperations } from "./apiOperations";
import {
  LAB_ARCHIVE_EXCLUDED_DIRECTORY_NAMES,
  createLabArchiveMultipartBody,
  hasBundledLabFiles,
  inspectLabArchive,
  type LabArchiveInventory
} from "./labArchive";

export interface ApiBackendConfig {
  url: string;
  username: string;
  allowInsecureHttp: boolean;
  unverifiedTlsConfirmed: boolean;
  verifyTls: boolean;
  caPath?: string;
  trustedCertificate?: string;
  pollIntervalMs: number;
}

export interface MaterializedApiTopology {
  annotationsPath: string;
  labName: string;
  localPath: string;
  remotePath: string;
}

export type ApiBackendConnectionState = "connected" | "offline" | "session_expired";
export type ApiTopologyDocumentKind = "yaml" | "annotations";

export type ApiBackendTransportPolicy = Pick<
  ApiBackendConfig,
  "verifyTls" | "caPath" | "pollIntervalMs"
>;

interface ApiContainerInfo {
  name?: string;
  container_id?: string;
  image?: string;
  kind?: string;
  state?: string;
  status?: string;
  ipv4_address?: string;
  ipv6_address?: string;
  lab_name?: string;
  nodeName?: string;
  labPath?: string;
  absLabPath?: string;
  group?: string;
  owner?: string;
}

interface ApiInterfaceInfo {
  name?: string;
  interfaces?: Array<{
    name?: string;
    type?: string;
    state?: string;
    alias?: string;
    mac?: string;
    mtu?: number;
    ifindex?: number;
  }>;
}

interface TopologyMetadata {
  labName?: string;
  yamlFileName?: string;
}

interface LifecycleStreamEvent {
  type?: string;
  line?: string;
  stream?: string;
  message?: string;
  error?: string;
}

const BASE_CAPABILITIES: BackendCapability[] = ["runtime-inspect", "api-auth"];
const EVENT_REFRESH_DEBOUNCE_MS = 150;

export function readApiBackendTransportPolicy(
  config: Pick<vscode.WorkspaceConfiguration, "get">
): ApiBackendTransportPolicy {
  return {
    verifyTls: config.get<boolean>("api.tls.verify", true),
    caPath: config.get<string>("api.tls.caPath", "") || undefined,
    pollIntervalMs: config.get<number>("pollInterval", 5000)
  };
}

export function apiContainerlabBackendId(url: string, username: string): string {
  const baseUrl = normalizedBaseUrl(url).toString().replace(/\/$/u, "");
  return `api:${baseUrl}#${encodeURIComponent(username.trim())}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAddress(value: string | undefined): { address?: string; prefixLength?: number } {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "N/A") return {};
  const [address, prefix] = trimmed.split("/");
  const prefixLength = Number(prefix);
  return {
    address,
    ...(Number.isFinite(prefixLength) ? { prefixLength } : {})
  };
}

function nodeNameFromContainer(containerName: string, labName: string): string {
  const prefix = `clab-${labName}-`;
  return containerName.startsWith(prefix) ? containerName.slice(prefix.length) : containerName;
}

function toDetailedContainer(
  labName: string,
  container: ApiContainerInfo,
  backendId: string
): ClabDetailedJSON {
  const name = container.name ?? "";
  const nodeName = container.nodeName ?? nodeNameFromContainer(name, labName);
  const topoFile = container.absLabPath ?? container.labPath ?? "";
  const ipv4 = parseAddress(container.ipv4_address);
  const ipv6 = parseAddress(container.ipv6_address);
  return {
    Names: name ? [name] : [],
    ID: container.container_id ?? "",
    ShortID: container.container_id ?? "",
    Image: container.image ?? "",
    State: container.state ?? "",
    Status: container.status ?? "",
    Labels: {
      "clab-node-kind": container.kind ?? "",
      // API paths are opaque server-side identifiers and must not be parsed as client paths.
      "clab-node-lab-dir": "",
      "clab-node-longname": name,
      "clab-node-name": nodeName,
      "clab-node-group": container.group ?? "",
      "clab-owner": container.owner ?? "",
      "clab-topo-file": topoFile,
      "clab-backend-id": backendId,
      containerlab: container.lab_name ?? labName
    },
    NetworkSettings: {
      IPv4addr: ipv4.address,
      IPv4pLen: ipv4.prefixLength,
      IPv6addr: ipv6.address,
      IPv6pLen: ipv6.prefixLength
    },
    Mounts: [],
    Ports: []
  };
}

function toInterfaceSnapshot(value: ApiInterfaceInfo): ClabInterfaceSnapshot {
  return {
    name: value.name ?? "",
    interfaces: (value.interfaces ?? []).map((iface) => ({
      name: iface.name ?? "",
      type: iface.type ?? "",
      state: iface.state ?? "",
      alias: iface.alias ?? "",
      mac: iface.mac ?? "",
      mtu: iface.mtu ?? 0,
      ifindex: iface.ifindex ?? 0
    }))
  };
}

function lifecycleEvent(value: unknown): LifecycleStreamEvent | undefined {
  if (!isRecord(value)) return undefined;
  return {
    type: typeof value.type === "string" ? value.type : undefined,
    line: typeof value.line === "string" ? value.line : undefined,
    stream: typeof value.stream === "string" ? value.stream : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    error: typeof value.error === "string" ? value.error : undefined
  };
}

function topologyLabName(topologyPath: string): string {
  const source = fs.readFileSync(topologyPath, "utf8");
  const parsed: unknown = YAML.parse(source);
  if (isRecord(parsed) && typeof parsed.name === "string" && parsed.name.trim().length > 0) {
    return parsed.name.trim();
  }
  return path.basename(topologyPath).replace(/\.clab\.(?:yml|yaml)$/iu, "");
}

function nodeLabName(node: ClabLabTreeNode): string {
  const refName = node.labRef?.labName?.trim();
  if (refName) return refName;
  const nodeName = node.name?.trim();
  if (nodeName) return nodeName;
  const source = node.labRef?.remotePath ? node.labRef.localPath : node.labPath.absolute;
  if (source && fs.existsSync(source)) return topologyLabName(source);
  throw new Error("Could not determine the lab name for the API request.");
}

function runtimeLabName(node: ClabLabTreeNode): string {
  const localSource = node.labRef?.localPath;
  if (localSource && fs.existsSync(localSource)) {
    try {
      return topologyLabName(localSource);
    } catch {
      // Fall through to the stable runtime/tree identity for temporarily invalid YAML.
    }
  }
  const nodeName = node.name?.trim();
  if (nodeName) return nodeName;
  const refName = node.labRef?.labName?.trim();
  if (refName) return refName;
  throw new Error("Could not determine the runtime lab name for the API request.");
}

function queryString(values: Record<string, string | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== false && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export class ApiContainerlabBackend implements ContainerlabBackend {
  readonly kind = "api" as const;
  readonly capabilities: ReadonlySet<BackendCapability>;
  readonly id: string;
  readonly operations: ApiContainerlabOperations;

  private readonly capabilitySet = new Set<BackendCapability>(BASE_CAPABILITIES);
  private readonly transport: ClabApiTransport;
  private readonly session: ApiSession;
  private readonly sourceRegistry: ApiLabSourceRegistry;
  private serverCapabilities: BackendServerCapabilities | undefined;
  private snapshot: RuntimeSnapshot = { labs: {} };
  private readonly interfacesByContainer = new Map<string, ClabInterfaceSnapshot[]>();
  private readonly interfaceVersions = new Map<string, number>();
  private readonly dataListeners = new Set<() => void>();
  private eventController: AbortController | undefined;
  private lifecycleController: AbortController | undefined;
  private pollingTimer: ReturnType<typeof setInterval> | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshInFlight = false;
  private pollingMode = false;
  private authenticated = false;
  private connectionState: ApiBackendConnectionState = "offline";
  private sessionExpiryNotificationShown = false;
  private unauthorizedHandling: Promise<void> | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly config: ApiBackendConfig
  ) {
    if (apiUrlRequiresInsecureCredentialConfirmation(config.url) && !config.allowInsecureHttp) {
      throw new Error(
        "Remote HTTP API URLs are disabled because credentials and JWTs would be sent in cleartext. Use HTTPS or explicitly confirm insecure HTTP during API sign-in."
      );
    }
    if (
      apiUrlRequiresUnverifiedTlsConfirmation(config.url, config.verifyTls) &&
      !config.unverifiedTlsConfirmed
    ) {
      throw new Error(
        "TLS certificate verification is disabled. Explicit confirmation is required before credentials or stored JWTs may be used."
      );
    }
    this.capabilities = this.capabilitySet;
    this.transport = new ClabApiTransport({
      baseUrl: config.url,
      verifyTls: config.verifyTls,
      caPath: config.caPath,
      ...(config.trustedCertificate !== undefined
        ? { trustedCertificate: config.trustedCertificate }
        : {}),
      onUnauthorized: () => this.handleUnauthorized()
    });
    const account = config.username.trim();
    this.id = apiContainerlabBackendId(this.transport.getBaseUrl(), account);
    this.session = new ApiSession(context, this.transport, config.username);
    this.sourceRegistry = new ApiLabSourceRegistry(context.workspaceState, this.id);
    this.operations = new ApiContainerlabOperations({
      transport: this.transport,
      session: this.session,
      refreshRuntime: async () => {
        await this.refreshRuntimeSnapshot();
      },
      onMutation: () => this.notifyDataChanged(),
      onRequestSuccess: () => this.setConnectionState("connected"),
      onRequestError: (error) => this.handleRequestConnectivityError(error)
    });
  }

  async initialize(): Promise<BackendInitializationResult> {
    try {
      this.authenticated = await this.session.validate();
      if (!this.authenticated) {
        this.setConnectionState("session_expired");
        return { authenticated: false, message: "Sign in to clab-api-server to load labs." };
      }
      const token = await this.session.requireToken();
      await this.loadServerCapabilities(token);
      await this.refreshRuntimeSnapshot();
      this.startEventStream();
      return {
        authenticated: true,
        session: this.session.getIdentity(),
        server: this.serverCapabilities
      };
    } catch (error) {
      this.handleRequestConnectivityError(error);
      return {
        authenticated: false,
        authenticationPrompted: this.sessionExpiryNotificationShown,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  dispose(): void {
    this.eventController?.abort();
    this.eventController = undefined;
    this.lifecycleController?.abort();
    this.lifecycleController = undefined;
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.pollingTimer = undefined;
    this.refreshTimer = undefined;
  }

  async signIn(username: string, password: string, sessionDuration?: string): Promise<void> {
    await this.session.signIn(username, password, sessionDuration);
    this.authenticated = await this.session.validate();
    if (!this.authenticated) {
      this.setConnectionState("session_expired");
      throw new ApiAuthenticationRequiredError("Login did not create a valid API session.");
    }
    this.sessionExpiryNotificationShown = false;
    const token = await this.session.requireToken();
    await this.loadServerCapabilities(token);
    await this.refreshRuntimeSnapshot();
    this.startEventStream();
  }

  async signOut(): Promise<void> {
    await this.session.signOut();
    this.authenticated = false;
    this.setConnectionState("offline");
    this.dispose();
    this.snapshot = { labs: {} };
    this.interfacesByContainer.clear();
    this.serverCapabilities = undefined;
    this.resetCapabilities();
    this.notifyDataChanged();
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.authenticated) {
      this.authenticated = await this.session.validate();
      if (this.authenticated && !this.serverCapabilities) {
        await this.loadServerCapabilities(await this.session.requireToken());
      }
    }
    return this.authenticated;
  }

  getAuthenticatedSession(): AuthenticatedBackendSession | undefined {
    return this.session.getIdentity();
  }

  getServerCapabilities(): BackendServerCapabilities | undefined {
    return this.serverCapabilities;
  }

  getConnectionInfo(): { url: string; username: string } {
    return {
      url: this.transport.getBaseUrl(),
      username: this.config.username.trim()
    };
  }

  getConnectionState(): ApiBackendConnectionState {
    return this.connectionState;
  }

  async deleteTopologyFile(labName: string, remotePath: string): Promise<void> {
    await this.operations.deleteTopologyFile(labName, remotePath);
    const localPath = await this.sourceRegistry.remove(labName);
    if (localPath) {
      await Promise.all([
        fs.promises.rm(localPath, { force: true }),
        fs.promises.rm(`${localPath}.annotations.json`, { force: true })
      ]);
    }
  }

  resolveLabNameForResource(resource: unknown): string | undefined {
    if (isRecord(resource)) {
      const labRef = resource.labRef;
      if (isRecord(labRef)) {
        const localPath = labRef.localPath;
        const remotePath = labRef.remotePath;
        const sourceLabNameValue = labRef.sourceLabName ?? labRef.labName;
        const sourcePathValue = labRef.sourcePath ?? remotePath;
        const sourceLabName =
          typeof sourceLabNameValue === "string" ? sourceLabNameValue.trim() : undefined;
        const managedRemotePath =
          typeof sourcePathValue === "string" ? apiManagedTopologyPath(sourcePathValue) : undefined;
        if (sourceLabName && managedRemotePath) {
          const runningLabName = this.findRuntimeLabNameForTopology(
            sourceLabName,
            managedRemotePath
          );
          if (runningLabName !== undefined) return runningLabName;
        }
        if (
          typeof localPath === "string" &&
          typeof remotePath === "string" &&
          fs.existsSync(localPath)
        ) {
          try {
            return topologyLabName(localPath);
          } catch {
            // Fall back to the stable API reference while the editor contains invalid YAML.
          }
        }
        if (typeof labRef.labName === "string" && labRef.labName.trim()) {
          return labRef.labName.trim();
        }
      }
      const explicitLabName = resource.labName;
      if (typeof explicitLabName === "string" && explicitLabName.trim()) {
        return explicitLabName.trim();
      }
    }

    const candidates = new Set<string>();
    if (isRecord(resource)) {
      for (const key of ["name", "parentName", "cID"] as const) {
        const value = resource[key];
        if (typeof value === "string" && value.trim()) candidates.add(value.trim());
      }
    }
    for (const [labName, containers] of Object.entries(this.snapshot.labs)) {
      if (
        containers.some(
          (container) =>
            candidates.has(container.ID) ||
            candidates.has(container.ShortID) ||
            container.Names.some((name) => candidates.has(name))
        )
      ) {
        return labName;
      }
    }
    return undefined;
  }

  private findRuntimeLabNameForTopology(
    sourceLabName: string,
    sourcePath: string
  ): string | undefined {
    for (const [runtimeName, containers] of Object.entries(this.snapshot.labs)) {
      if (
        containers.some((container) =>
          apiTopologySourcePathMatches(
            container.Labels["clab-topo-file"],
            sourceLabName,
            sourcePath
          )
        )
      ) {
        return runtimeName;
      }
    }
    return undefined;
  }

  private requireRuntimeLabName(node: ClabLabTreeNode): string {
    return this.resolveLabNameForResource(node) ?? runtimeLabName(node);
  }

  private materializedTopologyRoot(): string {
    const identity = createHash("sha256").update(this.id).digest("hex").slice(0, 16);
    return path.join(this.context.globalStorageUri.fsPath, "api-topologies", identity);
  }

  async materializeTopology(
    labName: string,
    remotePath?: string
  ): Promise<MaterializedApiTopology> {
    const managedRemotePath = apiManagedTopologyPath(remotePath);
    const resolvedRemotePath = remotePath?.trim() || `${labName}.clab.yml`;
    const safeLabName = labName.replace(/[^a-zA-Z0-9_.-]+/gu, "-") || "lab";
    const fileName = path.posix.basename(resolvedRemotePath.replaceAll("\\", "/"));
    const directory = path.join(this.materializedTopologyRoot(), safeLabName);
    const localPath = path.join(directory, fileName);
    const annotationsPath = `${localPath}.annotations.json`;
    const [yaml, annotations] = await Promise.all(
      managedRemotePath === undefined
        ? [
            this.operations.readTopologyYaml(labName),
            this.operations.readTopologyAnnotations(labName)
          ]
        : [
            this.operations.readTopologyFile(labName, managedRemotePath),
            this.operations.readTopologyFileIfExists(
              labName,
              `${managedRemotePath}.annotations.json`
            )
          ]
    );
    await fs.promises.mkdir(directory, { recursive: true });
    await Promise.all([
      fs.promises.writeFile(localPath, yaml, "utf8"),
      annotations === undefined
        ? fs.promises.rm(annotationsPath, { force: true })
        : fs.promises.writeFile(annotationsPath, annotations, "utf8")
    ]);
    await this.sourceRegistry.set(labName, localPath, managedRemotePath);
    return { annotationsPath, labName, localPath, remotePath: resolvedRemotePath };
  }

  async synchronizeMaterializedDocument(
    localDocumentPath: string,
    content: string | Buffer
  ): Promise<boolean> {
    const annotationsSuffix = ".annotations.json";
    const kind: ApiTopologyDocumentKind = localDocumentPath.endsWith(annotationsSuffix)
      ? "annotations"
      : "yaml";
    const localYamlPath =
      kind === "annotations"
        ? localDocumentPath.slice(0, -annotationsSuffix.length)
        : localDocumentPath;
    const resolvedYamlPath = path.resolve(localYamlPath);
    const materializedRoot = path.resolve(this.materializedTopologyRoot());
    if (!resolvedYamlPath.startsWith(`${materializedRoot}${path.sep}`)) return false;
    const mapping = this.sourceRegistry.resolve(resolvedYamlPath);
    if (mapping === undefined) return false;
    await this.writeMaterializedTopologyDocument(mapping.labName, resolvedYamlPath, kind, content);
    return true;
  }

  async writeMaterializedTopologyDocument(
    labName: string,
    localYamlPath: string,
    kind: ApiTopologyDocumentKind,
    content: string | Buffer,
    notify = false
  ): Promise<void> {
    const managedRemotePath = this.sourceRegistry.getRemotePath(localYamlPath, labName);
    if (managedRemotePath !== undefined) {
      const documentPath =
        kind === "yaml" ? managedRemotePath : `${managedRemotePath}.annotations.json`;
      await this.operations.writeTopologyFile(labName, documentPath, content, notify);
      return;
    }

    if (kind === "yaml") {
      await this.operations.writeTopologyYaml(labName, content, notify);
      return;
    }
    await this.operations.writeTopologyAnnotations(labName, content, notify);
  }

  resolveLabRef(labName: string, runtimePath?: string) {
    const mapping =
      this.sourceRegistry.getMapping(labName) ??
      (runtimePath === undefined ? undefined : this.sourceRegistry.resolveRuntimePath(runtimePath));
    const registeredRemotePath = mapping?.remotePath;
    return {
      backendId: this.id,
      labName,
      ...(mapping === undefined ? {} : { localPath: mapping.localPath }),
      ...(runtimePath !== undefined || registeredRemotePath !== undefined
        ? { remotePath: runtimePath ?? registeredRemotePath }
        : {}),
      ...(mapping?.remotePath === undefined
        ? {}
        : { sourceLabName: mapping.labName, sourcePath: mapping.remotePath })
    };
  }

  resolveLocalSourceRef(localPath: string, expectedLabName?: string): LabRef | undefined {
    const mapping = this.sourceRegistry.resolve(localPath, expectedLabName);
    if (mapping === undefined) return undefined;
    return {
      backendId: this.id,
      labName: mapping.labName,
      localPath: mapping.localPath,
      ...(mapping.remotePath === undefined
        ? {}
        : {
            remotePath: mapping.remotePath,
            sourceLabName: mapping.labName,
            sourcePath: mapping.remotePath
          })
    };
  }

  async rememberLabSource(labName: string, localPath: string): Promise<void> {
    await this.sourceRegistry.remember(labName, localPath);
  }

  ownsLocalSource(localPath: string, expectedLabName?: string): boolean {
    return this.sourceRegistry.matches(localPath, expectedLabName);
  }

  async refreshRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const token = await this.session.getToken();
    if (!token) {
      this.snapshot = { labs: {} };
      this.setConnectionState("session_expired");
      return this.snapshot;
    }
    try {
      const labs = await this.transport.requestJson<Record<string, ApiContainerInfo[]>>(
        "GET",
        "/api/v1/labs",
        { token }
      );
      const detailed: Record<string, ClabDetailedJSON[]> = {};
      const nextInterfaces = new Map<string, ClabInterfaceSnapshot[]>();

      await Promise.all(
        Object.entries(labs ?? {}).map(async ([labName, containers]) => {
          const converted = containers.map((container) =>
            toDetailedContainer(labName, container, this.id)
          );
          detailed[labName] = converted;
          try {
            const interfaces = await this.transport.requestJson<ApiInterfaceInfo[]>(
              "GET",
              `/api/v1/labs/${encodeURIComponent(labName)}/interfaces`,
              { token }
            );
            for (const item of interfaces ?? []) {
              const snapshot = [toInterfaceSnapshot(item)];
              if (item.name) nextInterfaces.set(item.name, snapshot);
              const container = converted.find((entry) => entry.Names[0] === item.name);
              if (container) nextInterfaces.set(container.ShortID, snapshot);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            outputChannel.debug(
              `[api backend] Interface inspection failed for ${labName}: ${message}`
            );
          }
        })
      );

      if (!this.authenticated) {
        throw new ApiAuthenticationRequiredError("The API session expired.");
      }
      this.updateInterfaceCache(nextInterfaces);
      this.snapshot = { labs: detailed };
      this.setConnectionState("connected");
      return this.snapshot;
    } catch (error) {
      this.handleRequestConnectivityError(error);
      throw error;
    }
  }

  getRuntimeSnapshot(): RuntimeSnapshot {
    return this.snapshot;
  }

  getInterfaceSnapshot(containerShortId: string, containerName: string): ClabInterfaceSnapshot[] {
    return (
      this.interfacesByContainer.get(containerShortId) ??
      this.interfacesByContainer.get(containerName) ??
      []
    );
  }

  getInterfaceVersion(containerShortId: string): number {
    return this.interfaceVersions.get(containerShortId) ?? 0;
  }

  isPollingMode(): boolean {
    return this.pollingMode;
  }

  resetPollingMode(): void {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = undefined;
    this.pollingMode = false;
    if (this.authenticated) this.startEventStream();
  }

  onRuntimeDataChanged(listener: () => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onContainerStateChanged(
    _listener: (containerShortId: string, newState: string) => void
  ): () => void {
    // API events are treated as invalidations and refreshed as a coherent snapshot.
    return () => {};
  }

  async runLabLifecycle(request: LabLifecycleRequest): Promise<void> {
    let controller: AbortController | undefined;
    try {
      if (!this.capabilitySet.has("lab-lifecycle")) {
        throw new Error(
          "This clab-api-server does not advertise streamed lab lifecycle support. Upgrade the server before running lifecycle actions."
        );
      }
      const token = await this.session.requireToken();
      const activeController = new AbortController();
      controller = activeController;
      this.lifecycleController?.abort();
      this.lifecycleController = activeController;
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Running ${request.action} through clab-api-server...`,
          cancellable: true
        },
        async (progress, cancellationToken) => {
          cancellationToken.onCancellationRequested(() => activeController.abort());
          progress.report({ message: " [View Logs](command:containerlab.viewLogs)" });
          await this.executeLifecycleRequest(
            request,
            token,
            activeController.signal,
            (line, stream) => {
              progress.report({ message: line });
              outputChannel.info(line);
              request.onOutputLine?.(line, stream);
            }
          );
        }
      );
      const sourcePlan = planApiTopologySource(request.node.labRef, request.node.labPath.absolute);
      if (
        sourcePlan.kind === "local" &&
        this.isLocalFile(sourcePlan.source) &&
        (request.action === "deploy" || request.action === "apply" || request.action === "redeploy")
      ) {
        await this.rememberLabSource(nodeLabName(request.node), sourcePlan.source);
      }
      await this.refreshRuntimeSnapshot();
      this.notifyDataChanged();
      await request.onSuccess?.();
      vscode.window.showInformationMessage(`${request.action} completed successfully.`);
    } catch (error) {
      await request.onFailure?.(error);
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`${request.action} failed: ${message}`);
    } finally {
      if (controller && this.lifecycleController === controller)
        this.lifecycleController = undefined;
    }
  }

  cancelActiveOperation(): boolean {
    if (!this.lifecycleController || this.lifecycleController.signal.aborted) return false;
    this.lifecycleController.abort();
    return true;
  }

  private async executeLifecycleRequest(
    request: LabLifecycleRequest,
    token: string,
    signal: AbortSignal,
    onLine: (line: string, stream: "stdout" | "stderr") => void
  ): Promise<void> {
    const sourcePlan = planApiTopologySource(request.node.labRef, request.node.labPath.absolute);
    const topologyScopeLabName = nodeLabName(request.node);
    if (request.action === "deploy") {
      if (sourcePlan.kind === "url") {
        await this.deploy("", sourcePlan.source, token, signal, onLine, request.cleanup);
        return;
      }
      if (sourcePlan.kind === "managed") {
        await this.streamLifecycleTarget(
          this.lifecycleTarget(
            "deploy",
            topologyScopeLabName,
            request.cleanup,
            sourcePlan.remotePath
          ),
          token,
          signal,
          onLine,
          "Deployment failed."
        );
        return;
      }
      if (sourcePlan.kind === "runtime") {
        await this.streamLifecycleTarget(
          this.lifecycleTarget("deploy", this.requireRuntimeLabName(request.node), request.cleanup),
          token,
          signal,
          onLine,
          "Deployment failed."
        );
        return;
      }
      if (sourcePlan.kind === "missing") {
        throw new Error("Deploy requires a topology source.");
      }
      await this.deploy(
        topologyScopeLabName,
        sourcePlan.source,
        token,
        signal,
        onLine,
        request.cleanup
      );
      return;
    }

    if (request.action === "apply" && sourcePlan.kind === "managed") {
      await this.streamLifecycleTarget(
        this.lifecycleTarget("apply", topologyScopeLabName, request.cleanup, sourcePlan.remotePath),
        token,
        signal,
        onLine,
        "Apply failed."
      );
      return;
    }

    if (
      (request.action === "apply" || request.action === "redeploy") &&
      sourcePlan.kind === "local" &&
      this.isLocalFile(sourcePlan.source)
    ) {
      const remoteTopology = await this.findRemoteTopology(topologyScopeLabName, token, signal);
      if (
        planLocalTopologySync(request.action, true, remoteTopology !== undefined) ===
        "archive-deploy"
      ) {
        await this.deploy(
          topologyScopeLabName,
          sourcePlan.source,
          token,
          signal,
          onLine,
          request.cleanup,
          remoteTopology,
          request.action
        );
        return;
      }
      await this.uploadTopologyYaml(
        topologyScopeLabName,
        sourcePlan.source,
        token,
        signal,
        remoteTopology?.yamlFileName
      );
      if (request.action === "apply") {
        await this.streamLifecycleTarget(
          this.lifecycleTarget(
            "apply",
            topologyScopeLabName,
            request.cleanup,
            remoteTopology?.yamlFileName
          ),
          token,
          signal,
          onLine,
          "Apply failed."
        );
        return;
      }
    }

    if (sourcePlan.kind === "url" || sourcePlan.kind === "missing") {
      throw new Error(`${request.action} requires a deployed API lab.`);
    }
    const target = this.lifecycleTarget(
      request.action,
      this.requireRuntimeLabName(request.node),
      request.cleanup
    );
    await this.streamLifecycleTarget(target, token, signal, onLine, "Lifecycle operation failed.");
  }

  private async deploy(
    labName: string,
    source: string,
    token: string,
    signal: AbortSignal,
    onLine: (line: string, stream: "stdout" | "stderr") => void,
    cleanup: boolean,
    knownRemoteTopology?: TopologyMetadata,
    requestedAction: LabLifecycleRequest["action"] = "deploy"
  ): Promise<void> {
    if (isHttpTopologySource(source)) {
      onLine(`Deploying ${source} through clab-api-server`, "stdout");
      await this.transport.requestJson<unknown>(
        "POST",
        `/api/v1/labs${queryString({ ...apiLifecycleMutationFlags("deploy", cleanup) })}`,
        {
          token,
          signal,
          body: JSON.stringify({ topologySourceUrl: source }),
          contentType: "application/json"
        }
      );
      return;
    }
    if (!this.isLocalFile(source)) {
      throw new Error("Deploy requires a local topology file or an HTTP(S) topology URL.");
    }

    const remoteTopology =
      knownRemoteTopology ?? (await this.findRemoteTopology(labName, token, signal));
    if (planLocalTopologySync("deploy", true, remoteTopology !== undefined) === "yaml-sync") {
      await this.uploadTopologyYaml(labName, source, token, signal, remoteTopology?.yamlFileName);
      const target = this.lifecycleTarget("deploy", labName, cleanup, remoteTopology?.yamlFileName);
      await this.streamLifecycleTarget(target, token, signal, onLine, "Deployment failed.");
      return;
    }

    const inventory = await inspectLabArchive(source);
    await this.confirmArchiveUpload(inventory);
    onLine(`Uploading ${inventory.root} as a lab archive`, "stdout");
    const boundary = `----vscode-containerlab-${randomBytes(12).toString("hex")}`;
    const body = await createLabArchiveMultipartBody(source, boundary, inventory);
    await this.transport.requestJson<unknown>(
      "POST",
      `/api/v1/labs/archive${queryString({
        labName,
        ...apiLifecycleMutationFlags(requestedAction, cleanup)
      })}`,
      {
        token,
        signal,
        body,
        contentType: `multipart/form-data; boundary=${boundary}`
      }
    );
    onLine(`Lab ${labName} deployed`, "stdout");
  }

  private lifecycleTarget(
    action: LabLifecycleRequest["action"],
    labName: string,
    cleanup: boolean,
    topologyPath?: string
  ): { method: string; path: string; hasBody: boolean } {
    const encodedLab = encodeURIComponent(labName);
    const query = queryString({
      stream: true,
      path: topologyPath,
      ...apiLifecycleMutationFlags(action, cleanup)
    });
    if (action === "destroy") {
      return { method: "DELETE", path: `/api/v1/labs/${encodedLab}${query}`, hasBody: false };
    }
    if (action === "redeploy") {
      return { method: "PUT", path: `/api/v1/labs/${encodedLab}${query}`, hasBody: true };
    }
    if (action === "deploy") {
      return {
        method: "POST",
        path: `/api/v1/labs/${encodedLab}/deploy${query}`,
        hasBody: true
      };
    }
    return {
      method: "POST",
      path: `/api/v1/labs/${encodedLab}/${action}${query}`,
      hasBody: true
    };
  }

  private async streamLifecycleTarget(
    target: { method: string; path: string; hasBody: boolean },
    token: string,
    signal: AbortSignal,
    onLine: (line: string, stream: "stdout" | "stderr") => void,
    defaultError: string
  ): Promise<void> {
    let streamError: string | undefined;
    await this.transport.streamNdjson(
      target.method,
      target.path,
      (value) => {
        const event = lifecycleEvent(value);
        if (!event) return;
        if (event.type === "log" && event.line) {
          onLine(event.line, event.stream === "stderr" ? "stderr" : "stdout");
        } else if (event.type === "error") {
          streamError = event.error ?? defaultError;
        } else if (event.type === "done" && event.message) {
          onLine(event.message, "stdout");
        }
      },
      {
        token,
        signal,
        ...(target.hasBody ? { body: "{}", contentType: "application/json" } : {})
      }
    );
    if (streamError) throw new Error(streamError);
  }

  private async findRemoteTopology(
    labName: string,
    token: string,
    signal: AbortSignal
  ): Promise<TopologyMetadata | undefined> {
    const topologies = await this.transport.requestJson<TopologyMetadata[]>(
      "GET",
      "/api/v1/labs/topology/files",
      { token, signal }
    );
    return (topologies ?? []).find((entry) => entry.labName === labName);
  }

  private async uploadTopologyYaml(
    labName: string,
    topologyPath: string,
    token: string,
    signal: AbortSignal,
    remotePath?: string
  ): Promise<void> {
    const inventory = await inspectLabArchive(topologyPath);
    if (hasBundledLabFiles(inventory)) {
      throw new Error(
        "This lab uses files next to its topology (for example startup configs, binds, or icons). " +
          "The current clab-api-server API can update only the YAML after initial import, so apply/redeploy was blocked to prevent server drift."
      );
    }
    await this.transport.requestVoid(
      "PUT",
      remotePath === undefined
        ? `/api/v1/labs/${encodeURIComponent(labName)}/topology/yaml`
        : `/api/v1/labs/${encodeURIComponent(labName)}/topology/file${queryString({
            path: remotePath
          })}`,
      {
        token,
        signal,
        body: await fs.promises.readFile(topologyPath),
        contentType: "text/plain; charset=utf-8"
      }
    );
  }

  private async confirmArchiveUpload(inventory: LabArchiveInventory): Promise<void> {
    const excluded = LAB_ARCHIVE_EXCLUDED_DIRECTORY_NAMES.join(", ");
    const preview = inventory.includedFiles.slice(0, 6).join("\n");
    const more = Math.max(0, inventory.includedFiles.length - 6);
    const sensitiveFiles = inventory.includedFiles.filter((file) =>
      /(?:^|\/)(?:\.env(?:\.|$)|.*(?:secret|credential|private|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$|\.pfx$|\.crt$))/iu.test(
        file.replace(/\\/gu, "/")
      )
    );
    const sensitiveWarning =
      sensitiveFiles.length > 0
        ? `\n\nSensitive-looking files included:\n${sensitiveFiles.join("\n")}`
        : "";
    const choice = await vscode.window.showWarningMessage(
      `Deploying through clab-api-server uploads the topology directory:\n${inventory.root}\n\n` +
        `${inventory.includedFiles.length} file(s) will be sent. Excluded directories: ${excluded}. Symlinks are skipped.\n\n` +
        `${preview}${more > 0 ? `\n…and ${more} more` : ""}${sensitiveWarning}`,
      { modal: true },
      "Upload and deploy"
    );
    if (choice !== "Upload and deploy") {
      const error = new Error("Lab archive upload cancelled.");
      error.name = "AbortError";
      throw error;
    }
  }

  private isLocalFile(source: string): boolean {
    try {
      return source.length > 0 && fs.statSync(source).isFile();
    } catch {
      return false;
    }
  }

  private updateInterfaceCache(next: Map<string, ClabInterfaceSnapshot[]>): void {
    for (const [key, snapshot] of next.entries()) {
      if (JSON.stringify(this.interfacesByContainer.get(key) ?? []) !== JSON.stringify(snapshot)) {
        this.interfaceVersions.set(key, (this.interfaceVersions.get(key) ?? 0) + 1);
      }
    }
    this.interfacesByContainer.clear();
    for (const [key, snapshot] of next.entries()) this.interfacesByContainer.set(key, snapshot);
  }

  private resetCapabilities(): void {
    this.capabilitySet.clear();
    for (const capability of BASE_CAPABILITIES) this.capabilitySet.add(capability);
  }

  private async loadServerCapabilities(token: string): Promise<void> {
    this.resetCapabilities();
    try {
      const response = await this.transport.requestJson<unknown>("GET", "/api/v1/capabilities", {
        token
      });
      this.serverCapabilities = parseApiServerCapabilities(response);
      for (const capability of advertisedBackendCapabilities(this.serverCapabilities)) {
        this.capabilitySet.add(capability);
      }
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
      // Older servers have no discovery contract. Keep only capabilities that
      // can be used safely without guessing endpoint semantics.
      this.serverCapabilities = {
        apiVersion: "v1",
        serverVersion: "unknown",
        runtime: "unknown",
        features: new Set(),
        legacy: true
      };
    }
  }

  private handleUnauthorized(): Promise<void> {
    this.unauthorizedHandling ??= (async () => {
      const wasAuthenticated = this.authenticated || this.session.getIdentity() !== undefined;
      this.authenticated = false;
      this.setConnectionState("session_expired");
      await this.session.signOut();
      this.stopRuntimeWorkers();
      this.snapshot = { labs: {} };
      this.interfacesByContainer.clear();
      this.serverCapabilities = undefined;
      this.resetCapabilities();
      this.notifyDataChanged();
      if (wasAuthenticated && !this.sessionExpiryNotificationShown) {
        this.sessionExpiryNotificationShown = true;
        void vscode.window
          .showWarningMessage("Your clab-api-server session expired.", "Sign in")
          .then((choice) => {
            if (choice === "Sign in") {
              void vscode.commands.executeCommand("containerlab.api.login");
            }
          });
      }
    })().finally(() => {
      this.unauthorizedHandling = undefined;
    });
    return this.unauthorizedHandling;
  }

  private stopRuntimeWorkers(): void {
    this.eventController?.abort();
    this.eventController = undefined;
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.pollingTimer = undefined;
    this.refreshTimer = undefined;
    this.pollingMode = false;
  }

  private startEventStream(): void {
    if (this.eventController || !this.authenticated) return;
    if (!this.serverCapabilities?.features.has("runtime-events-ndjson")) {
      this.startPolling();
      return;
    }
    const controller = new AbortController();
    this.eventController = controller;
    void this.session
      .requireToken()
      .then((token) =>
        this.transport.streamNdjson(
          "GET",
          "/api/v1/events?initialState=false&interfaceStats=false",
          () => this.scheduleSnapshotRefresh(),
          { token, signal: controller.signal }
        )
      )
      .then(() => {
        if (!controller.signal.aborted) {
          outputChannel.warn("[api backend] Event stream ended; using polling");
          this.startPolling();
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.warn(`[api backend] Event stream unavailable: ${message}; using polling`);
        this.startPolling();
      })
      .finally(() => {
        if (this.eventController === controller) this.eventController = undefined;
      });
  }

  private startPolling(): void {
    if (this.pollingTimer) return;
    this.pollingMode = true;
    this.scheduleSnapshotRefresh();
    this.pollingTimer = setInterval(
      () => this.scheduleSnapshotRefresh(),
      this.config.pollIntervalMs
    );
  }

  private scheduleSnapshotRefresh(): void {
    if (this.refreshTimer || this.refreshInFlight) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refreshInFlight = true;
      void this.refreshRuntimeSnapshot()
        .then(() => this.notifyDataChanged())
        .catch((error: unknown) => {
          this.handleRequestConnectivityError(error);
          const message = error instanceof Error ? error.message : String(error);
          outputChannel.warn(`[api backend] Snapshot refresh failed: ${message}`);
        })
        .finally(() => {
          this.refreshInFlight = false;
        });
    }, EVENT_REFRESH_DEBOUNCE_MS);
  }

  private notifyDataChanged(): void {
    for (const listener of this.dataListeners) listener();
  }

  private setConnectionState(state: ApiBackendConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.notifyDataChanged();
  }

  private handleRequestConnectivityError(error: unknown): void {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) {
        this.setConnectionState("session_expired");
        return;
      }
      if (error.status !== undefined && error.status > 0 && error.status < 500) return;
    }
    this.setConnectionState("offline");
  }
}

export { ApiAuthenticationRequiredError };
