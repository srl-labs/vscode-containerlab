/**
 * TopologyHostCore - Host-side authoritative topology model.
 *
 * Runs in Node environments (VS Code extension host / dev server).
 * Owns YAML + annotations persistence, revisioning, and undo/redo history.
 */

import * as YAML from "yaml";

import type { ClabTopology, TopologyAnnotations } from "../types/topology";
import type { LabSettings } from "../types/labSettings";
import type {
  TopologyHost,
  TopologyHostCommand,
  TopologyHostResponseMessage,
  TopologySnapshot
} from "../types/messages";
import { TOPOLOGY_HOST_PROTOCOL_VERSION } from "../types/messages";
import type { DeploymentState } from "../types/topology";
import type { TopologyData } from "../types/graph";
import type { ContainerDataProvider, ParserLogger } from "../parsing/types";
import { TopologyParser } from "../parsing/TopologyParser";
import { applyInterfacePatternMigrations } from "../utilities";
import type { FileSystemAdapter, IOLogger } from "../io/types";
import { AnnotationsIO, TopologyIO, TransactionalFileSystemAdapter } from "../io";
import { createEmptyAnnotations } from "../annotations/types";

interface TopologyHostCoreOptions {
  fs: FileSystemAdapter;
  yamlFilePath: string;
  mode: "edit" | "view";
  deploymentState: DeploymentState;
  containerDataProvider?: ContainerDataProvider;
  setInternalUpdate?: (updating: boolean) => void;
  logger?: IOLogger;
  maxHistory?: number;
}

interface HistoryEntry {
  yamlContent: string;
  annotationsContent: string | null;
}

const DEFAULT_HISTORY_LIMIT = 50;

const noopLogger: IOLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

export class TopologyHostCore implements TopologyHost {
  private yamlFilePath: string;
  private mode: "edit" | "view";
  private deploymentState: DeploymentState;
  private containerDataProvider?: ContainerDataProvider;
  private setInternalUpdate?: (updating: boolean) => void;
  private logger: IOLogger;
  private parserLogger: ParserLogger;

  private baseFs: FileSystemAdapter;
  private transactionalFs: TransactionalFileSystemAdapter;
  private annotationsIO: AnnotationsIO;
  private topologyIO: TopologyIO;

  private revision = 1;
  private snapshot: TopologySnapshot | null = null;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private historyLimit: number;

  public currentClabTopology: ClabTopology | undefined;

  constructor(options: TopologyHostCoreOptions) {
    this.baseFs = options.fs;
    this.yamlFilePath = options.yamlFilePath;
    this.mode = options.mode;
    this.deploymentState = options.deploymentState;
    this.containerDataProvider = options.containerDataProvider;
    this.setInternalUpdate = options.setInternalUpdate;
    this.logger = options.logger ?? noopLogger;
    this.historyLimit = options.maxHistory ?? DEFAULT_HISTORY_LIMIT;

    this.parserLogger = {
      info: (msg) => this.logger.info(msg),
      warn: (msg) => this.logger.warn(msg),
      debug: (msg) => this.logger.debug(msg),
      error: (msg) => this.logger.error(msg)
    };

    this.transactionalFs = new TransactionalFileSystemAdapter(this.baseFs);
    this.annotationsIO = new AnnotationsIO({ fs: this.transactionalFs, logger: this.logger });
    this.topologyIO = new TopologyIO({
      fs: this.transactionalFs,
      annotationsIO: this.annotationsIO,
      setInternalUpdate: this.setInternalUpdate,
      logger: this.logger
    });
  }

  updateContext(
    context: Partial<
      Pick<TopologyHostCoreOptions, "mode" | "deploymentState" | "containerDataProvider">
    >
  ): void {
    if (context.mode) this.mode = context.mode;
    if (context.deploymentState) this.deploymentState = context.deploymentState;
    if (context.containerDataProvider !== undefined) {
      this.containerDataProvider = context.containerDataProvider;
    }
  }

  async getSnapshot(): Promise<TopologySnapshot> {
    if (this.snapshot) {
      return this.snapshot;
    }
    this.snapshot = await this.buildSnapshot();
    return this.snapshot;
  }

  async applyCommand(
    command: TopologyHostCommand,
    baseRevision: number
  ): Promise<TopologyHostResponseMessage> {
    const commandName = (command as { command?: string }).command ?? "unknown";
    if (baseRevision !== this.revision) {
      this.logger.warn(
        `[TopologyHost] Rejecting ${commandName}: stale baseRevision ${baseRevision} (current ${this.revision})`
      );
      const snapshot = await this.getSnapshot();
      return {
        type: "topology-host:reject",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId: "",
        revision: this.revision,
        snapshot,
        reason: "stale"
      };
    }

    if (command.command === "undo") {
      return this.handleUndoRedo("undo");
    }
    if (command.command === "redo") {
      return this.handleUndoRedo("redo");
    }

    const beforeState = await this.captureHistoryEntry();

    try {
      this.logger.debug(`[TopologyHost] Applying ${commandName} @ revision ${this.revision}`);
      this.setInternalUpdate?.(true);
      this.transactionalFs.beginTransaction();
      await this.ensureTopologyInitialized();
      await this.executeCommand(command);
      await this.transactionalFs.commitTransaction();
      this.annotationsIO.clearCache();
    } catch (err) {
      this.transactionalFs.rollbackTransaction();
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[TopologyHost] Command ${commandName} failed: ${message}`);
      return {
        type: "topology-host:error",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId: "",
        error: message
      };
    } finally {
      this.setInternalUpdate?.(false);
    }

    this.pushHistory(beforeState);
    this.future = [];
    this.revision += 1;
    this.snapshot = await this.buildSnapshot();

    return {
      type: "topology-host:ack",
      protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
      requestId: "",
      revision: this.revision,
      snapshot: this.snapshot
    };
  }

  async onExternalChange(): Promise<TopologySnapshot> {
    this.past = [];
    this.future = [];
    this.revision += 1;
    try {
      this.setInternalUpdate?.(true);
      await this.reloadFromDisk();
      this.snapshot = await this.buildSnapshot();
      return this.snapshot;
    } finally {
      this.setInternalUpdate?.(false);
    }
  }

  dispose(): void {
    this.past = [];
    this.future = [];
    this.snapshot = null;
    this.annotationsIO.clearCache();
  }

  // ---------------------------------------------------------------------------
  // Command execution
  // ---------------------------------------------------------------------------

  private async executeCommand(command: TopologyHostCommand): Promise<void> {
    switch (command.command) {
      case "addNode":
        await this.topologyIO.addNode(command.payload);
        return;
      case "editNode":
        await this.topologyIO.editNode(command.payload);
        return;
      case "deleteNode":
        await this.topologyIO.deleteNode(command.payload.id);
        return;
      case "addLink":
        await this.topologyIO.addLink(command.payload);
        return;
      case "editLink":
        await this.topologyIO.editLink(command.payload);
        return;
      case "deleteLink":
        await this.topologyIO.deleteLink(command.payload);
        return;
      case "savePositions":
        await this.topologyIO.savePositions(command.payload);
        return;
      case "setAnnotations":
        await this.annotationsIO.modifyAnnotations(this.yamlFilePath, (current) => {
          const merged: TopologyAnnotations = { ...current, ...command.payload };
          if (command.payload.viewerSettings) {
            merged.viewerSettings = {
              ...(current.viewerSettings ?? {}),
              ...command.payload.viewerSettings
            };
          }
          return merged;
        });
        return;
      case "setEdgeAnnotations":
        await this.annotationsIO.modifyAnnotations(this.yamlFilePath, (current) => ({
          ...current,
          edgeAnnotations: command.payload
        }));
        return;
      case "setViewerSettings":
        await this.annotationsIO.modifyAnnotations(this.yamlFilePath, (current) => ({
          ...current,
          viewerSettings: {
            ...(current.viewerSettings ?? {}),
            ...command.payload
          }
        }));
        return;
      case "setNodeGroupMembership":
        await this.applyNodeGroupMembership(command.payload.nodeId, command.payload.groupId);
        return;
      case "setNodeGroupMemberships":
        await this.applyNodeGroupMemberships(command.payload);
        return;
      case "setLabSettings":
        await this.applyLabSettings(command.payload);
        return;
      default:
        throw new Error(
          `Unknown command: ${(command as { command?: string }).command ?? "unknown"}`
        );
    }
  }

  private async applyLabSettings(settings: LabSettings): Promise<void> {
    await this.ensureTopologyInitialized();
    const doc = this.topologyIO.getDocument();
    if (!doc) {
      throw new Error("Topology document not initialized");
    }

    const rootMap = doc.contents as YAML.YAMLMap | undefined;
    if (!rootMap || !YAML.isMap(rootMap)) {
      throw new Error("YAML document root is not a map");
    }

    if (settings.name !== undefined) {
      setKey(rootMap, "name", doc.createNode(settings.name));
    }

    if (settings.prefix !== undefined) {
      if (settings.prefix === null) {
        deleteKey(rootMap, "prefix");
      } else {
        setKeyAfter(rootMap, "prefix", doc.createNode(settings.prefix), "name");
      }
    }

    if (settings.mgmt !== undefined) {
      if (settings.mgmt === null) {
        deleteKey(rootMap, "mgmt");
      } else {
        const mgmtMap = doc.createNode(settings.mgmt) as YAML.YAMLMap;
        const hasPrefixKey = rootMap.items.some(
          (pair) => YAML.isScalar(pair.key) && pair.key.value === "prefix"
        );
        const afterKey = hasPrefixKey ? "prefix" : "name";
        setKeyAfter(rootMap, "mgmt", mgmtMap, afterKey);
      }
    }

    await this.topologyIO.save();
  }

  private async applyNodeGroupMembership(nodeId: string, groupId: string | null): Promise<void> {
    await this.annotationsIO.modifyAnnotations(this.yamlFilePath, (current) => {
      const nodeAnnotations = current.nodeAnnotations ? [...current.nodeAnnotations] : [];
      const existingIndex = nodeAnnotations.findIndex((n) => n.id === nodeId);

      if (existingIndex >= 0) {
        const existing = nodeAnnotations[existingIndex];
        if (groupId) {
          nodeAnnotations[existingIndex] = { ...existing, groupId };
        } else {
          nodeAnnotations[existingIndex] = omitGroupFields(existing) as typeof existing;
        }
      } else if (groupId) {
        nodeAnnotations.push({ id: nodeId, groupId });
      }

      return { ...current, nodeAnnotations };
    });
  }

  private async applyNodeGroupMemberships(
    memberships: Array<{ nodeId: string; groupId: string | null }>
  ): Promise<void> {
    await this.annotationsIO.modifyAnnotations(this.yamlFilePath, (current) => {
      const membershipMap = new Map(
        memberships.filter((m) => m.groupId).map((m) => [m.nodeId, m.groupId!])
      );

      const existingAnnotations = current.nodeAnnotations ?? [];
      const existingMap = new Map(existingAnnotations.map((a) => [a.id, a]));
      const result: Array<{ id: string; groupId?: string }> = [];

      for (const [nodeId, groupId] of membershipMap) {
        const existing = existingMap.get(nodeId);
        if (existing) {
          const rest = omitGroupOnly(existing);
          result.push({ ...rest, groupId });
          existingMap.delete(nodeId);
        } else {
          result.push({ id: nodeId, groupId });
        }
      }

      for (const [nodeId, annotation] of existingMap) {
        if (!membershipMap.has(nodeId)) {
          const rest = omitGroupFields(annotation);
          if (Object.keys(rest).length > 1 || (Object.keys(rest).length === 1 && rest.id)) {
            result.push(rest);
          }
        }
      }

      return { ...current, nodeAnnotations: result };
    });
  }

  // ---------------------------------------------------------------------------
  // Undo/redo
  // ---------------------------------------------------------------------------

  private async handleUndoRedo(direction: "undo" | "redo"): Promise<TopologyHostResponseMessage> {
    const stack = direction === "undo" ? this.past : this.future;
    if (stack.length === 0) {
      const snapshot = await this.getSnapshot();
      return {
        type: "topology-host:ack",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId: "",
        revision: this.revision,
        snapshot
      };
    }

    const current = await this.captureHistoryEntry();
    const entry = stack.pop()!;

    if (direction === "undo") {
      this.future.push(current);
    } else {
      this.past.push(current);
    }

    try {
      this.setInternalUpdate?.(true);
      await this.restoreHistoryEntry(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        type: "topology-host:error",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId: "",
        error: message
      };
    } finally {
      this.setInternalUpdate?.(false);
    }

    this.revision += 1;
    this.snapshot = await this.buildSnapshot();
    return {
      type: "topology-host:ack",
      protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
      requestId: "",
      revision: this.revision,
      snapshot: this.snapshot
    };
  }

  // ---------------------------------------------------------------------------
  // Snapshot building
  // ---------------------------------------------------------------------------

  private async buildSnapshot(): Promise<TopologySnapshot> {
    const yamlContent = await this.baseFs.readFile(this.yamlFilePath);
    const yamlDoc = YAML.parseDocument(yamlContent);
    const parsed = yamlDoc.toJS() as ClabTopology;
    this.currentClabTopology = parsed;

    let annotations = await this.annotationsIO.loadAnnotations(this.yamlFilePath, true);
    const annotationsUpdated = await this.reconcileAnnotationsForRenamedNodes(parsed);
    if (annotationsUpdated) {
      annotations = await this.annotationsIO.loadAnnotations(this.yamlFilePath, true);
    }

    const parseResult = this.parseTopology(yamlContent, annotations);

    const migrationsApplied = await this.applyMigrations(
      annotations,
      parseResult.graphLabelMigrations,
      parseResult.pendingMigrations
    );
    if (migrationsApplied) {
      annotations = await this.annotationsIO.loadAnnotations(this.yamlFilePath, true);
    }

    const finalParseResult = migrationsApplied
      ? this.parseTopology(yamlContent, annotations)
      : parseResult;
    const topology = finalParseResult.topology;
    const labName = finalParseResult.labName;

    const normalizedAnnotations = normalizeAnnotations(annotations);
    const labSettings = extractLabSettings(yamlDoc);

    return {
      revision: this.revision,
      nodes: topology.nodes,
      edges: topology.edges,
      annotations: normalizedAnnotations,
      labName: labName ?? "",
      mode: this.mode,
      deploymentState: this.deploymentState,
      labSettings: Object.keys(labSettings).length > 0 ? labSettings : undefined,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0
    };
  }

  private parseTopology(
    yamlContent: string,
    annotations: TopologyAnnotations
  ): {
    topology: TopologyData;
    labName?: string;
    pendingMigrations: Array<{ nodeId: string; interfacePattern: string }>;
    graphLabelMigrations: Array<{
      nodeId: string;
      position?: { x: number; y: number };
      icon?: string;
      group?: string;
      level?: string;
      groupLabelPos?: string;
      geoCoordinates?: { lat: number; lng: number };
    }>;
  } {
    if (this.mode === "view") {
      return TopologyParser.parseToReactFlow(yamlContent, {
        annotations,
        containerDataProvider: this.containerDataProvider,
        logger: this.parserLogger
      });
    }
    return TopologyParser.parseForEditorRF(yamlContent, annotations);
  }

  private async applyMigrations(
    annotations: TopologyAnnotations,
    graphLabelMigrations: Array<{
      nodeId: string;
      position?: { x: number; y: number };
      icon?: string;
      group?: string;
      level?: string;
      groupLabelPos?: string;
      geoCoordinates?: { lat: number; lng: number };
    }>,
    pendingMigrations: Array<{ nodeId: string; interfacePattern: string }>
  ): Promise<boolean> {
    let modified = false;

    if (graphLabelMigrations.length > 0) {
      const updated = persistGraphLabelMigrations(annotations, graphLabelMigrations);
      await this.annotationsIO.saveAnnotations(this.yamlFilePath, updated);
      modified = true;
    }

    if (pendingMigrations.length > 0) {
      const result = applyInterfacePatternMigrations(annotations, pendingMigrations);
      if (result.modified) {
        await this.annotationsIO.saveAnnotations(this.yamlFilePath, result.annotations);
        modified = true;
      }
    }

    return modified;
  }

  private async reconcileAnnotationsForRenamedNodes(
    parsedTopo: ClabTopology | undefined
  ): Promise<boolean> {
    if (!this.yamlFilePath || !parsedTopo?.topology?.nodes) {
      return false;
    }

    const yamlNodeIds = new Set(Object.keys(parsedTopo.topology.nodes));
    try {
      const annotations = await this.annotationsIO.loadAnnotations(this.yamlFilePath, true);
      const nodeAnnotations = annotations.nodeAnnotations ?? [];
      const missingIds = [...yamlNodeIds].filter((id) => !nodeAnnotations.some((n) => n.id === id));
      const orphanAnnotations = nodeAnnotations.filter((n) => !yamlNodeIds.has(n.id));

      if (missingIds.length === 1 && orphanAnnotations.length > 0) {
        const newId = missingIds[0];
        const newPrefix = getIdPrefix(newId);
        const prefixMatches = orphanAnnotations.filter((n) => getIdPrefix(n.id) === newPrefix);
        const candidate = prefixMatches[0] || orphanAnnotations[0];
        if (candidate) {
          const oldId = candidate.id;
          candidate.id = newId;
          await this.annotationsIO.saveAnnotations(this.yamlFilePath, annotations);
          this.logger.info(`Migrated annotation id from ${oldId} to ${newId} after YAML rename`);
          return true;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to reconcile annotations on rename: ${err}`);
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // History + reload helpers
  // ---------------------------------------------------------------------------

  private pushHistory(entry: HistoryEntry): void {
    this.past.push(entry);
    if (this.past.length > this.historyLimit) {
      this.past.shift();
    }
  }

  private async captureHistoryEntry(): Promise<HistoryEntry> {
    const yamlContent = await this.baseFs.readFile(this.yamlFilePath);
    const annotationsPath = this.annotationsIO.getAnnotationsFilePath(this.yamlFilePath);
    let annotationsContent: string | null = null;
    try {
      const exists = await this.baseFs.exists(annotationsPath);
      if (exists) {
        annotationsContent = await this.baseFs.readFile(annotationsPath);
      }
    } catch {
      annotationsContent = null;
    }
    return { yamlContent, annotationsContent };
  }

  private async restoreHistoryEntry(entry: HistoryEntry): Promise<void> {
    this.transactionalFs.beginTransaction();
    await this.transactionalFs.writeFile(this.yamlFilePath, entry.yamlContent);

    const annotationsPath = this.annotationsIO.getAnnotationsFilePath(this.yamlFilePath);
    if (entry.annotationsContent === null) {
      await this.transactionalFs.unlink(annotationsPath);
    } else {
      await this.transactionalFs.writeFile(annotationsPath, entry.annotationsContent);
    }

    await this.transactionalFs.commitTransaction();
    await this.reloadFromDisk();
  }

  private async reloadFromDisk(): Promise<void> {
    this.annotationsIO.clearCache();
    await this.topologyIO.initializeFromFile(this.yamlFilePath);
  }

  private async ensureTopologyInitialized(): Promise<void> {
    if (!this.topologyIO.isInitialized()) {
      const result = await this.topologyIO.initializeFromFile(this.yamlFilePath);
      if (!result.success) {
        throw new Error(result.error || "Failed to initialize topology");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper utilities (shared with lab settings + migrations)
// ---------------------------------------------------------------------------

function getIdPrefix(id: string): string {
  const match = /^([a-zA-Z]+)/.exec(id);
  return match ? match[1] : id;
}

function normalizeAnnotations(
  annotations: TopologyAnnotations | null | undefined
): TopologyAnnotations {
  if (!annotations) return createEmptyAnnotations();
  return {
    freeTextAnnotations: annotations.freeTextAnnotations ?? [],
    freeShapeAnnotations: annotations.freeShapeAnnotations ?? [],
    groupStyleAnnotations: annotations.groupStyleAnnotations ?? [],
    nodeAnnotations: annotations.nodeAnnotations ?? [],
    networkNodeAnnotations: annotations.networkNodeAnnotations ?? [],
    edgeAnnotations: annotations.edgeAnnotations ?? [],
    aliasEndpointAnnotations: annotations.aliasEndpointAnnotations ?? [],
    viewerSettings: annotations.viewerSettings ?? {}
  };
}

function extractLabSettings(doc: YAML.Document.Parsed): LabSettings {
  const settings: LabSettings = {};
  const name = doc.get("name") as string | undefined;
  const prefix = doc.get("prefix") as string | undefined;
  const mgmt = doc.get("mgmt") as LabSettings["mgmt"] | undefined;

  if (name) settings.name = name;
  if (prefix !== undefined) settings.prefix = prefix;
  if (mgmt && typeof mgmt === "object") {
    settings.mgmt = mgmt;
  }

  return settings;
}

function persistGraphLabelMigrations(
  annotations: TopologyAnnotations,
  migrations: Array<{
    nodeId: string;
    position?: { x: number; y: number };
    icon?: string;
    group?: string;
    level?: string;
    groupLabelPos?: string;
    geoCoordinates?: { lat: number; lng: number };
  }>
): TopologyAnnotations {
  const localAnnotations = {
    freeTextAnnotations: annotations.freeTextAnnotations ?? [],
    groupStyleAnnotations: annotations.groupStyleAnnotations ?? [],
    nodeAnnotations: annotations.nodeAnnotations ?? []
  } as {
    nodeAnnotations: Array<{
      id: string;
      position?: { x: number; y: number };
      icon?: string;
      group?: string;
      level?: string;
      groupLabelPos?: string;
      geoCoordinates?: { lat: number; lng: number };
    }>;
  };

  const existingIds = new Set(localAnnotations.nodeAnnotations.map((na) => na.id));
  for (const migration of migrations) {
    if (existingIds.has(migration.nodeId)) continue;
    localAnnotations.nodeAnnotations.push({ ...migration, id: migration.nodeId });
  }

  return {
    ...annotations,
    nodeAnnotations: localAnnotations.nodeAnnotations
  };
}

type NodeAnnotationLike = { id: string; groupId?: string; group?: unknown };

function omitGroupFields<T extends NodeAnnotationLike>(
  obj: T
): Omit<T, "group" | "groupId"> & { id: string } {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key !== "group" && key !== "groupId") {
      result[key] = value;
    }
  }
  return result as Omit<T, "group" | "groupId"> & { id: string };
}

function omitGroupOnly<T extends NodeAnnotationLike>(obj: T): Omit<T, "group"> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key !== "group") {
      result[key] = value;
    }
  }
  return result as Omit<T, "group">;
}

function setKeyAfter(map: YAML.YAMLMap, key: string, value: YAML.Node, afterKey: string): void {
  const existingIndex = map.items.findIndex(
    (pair) => YAML.isScalar(pair.key) && pair.key.value === key
  );
  if (existingIndex >= 0) {
    map.items[existingIndex].value = value;
    return;
  }

  const afterIndex = map.items.findIndex(
    (pair) => YAML.isScalar(pair.key) && pair.key.value === afterKey
  );

  const newPair = new YAML.Pair(new YAML.Scalar(key), value);

  if (afterIndex >= 0) {
    map.items.splice(afterIndex + 1, 0, newPair);
  } else {
    map.items.push(newPair);
  }
}

function deleteKey(map: YAML.YAMLMap, key: string): void {
  const index = map.items.findIndex((pair) => YAML.isScalar(pair.key) && pair.key.value === key);
  if (index >= 0) {
    map.items.splice(index, 1);
  }
}

function setKey(map: YAML.YAMLMap, key: string, value: YAML.Node): void {
  const existingIndex = map.items.findIndex(
    (pair) => YAML.isScalar(pair.key) && pair.key.value === key
  );
  if (existingIndex >= 0) {
    map.items[existingIndex].value = value;
  } else {
    map.items.push(new YAML.Pair(new YAML.Scalar(key), value));
  }
}
