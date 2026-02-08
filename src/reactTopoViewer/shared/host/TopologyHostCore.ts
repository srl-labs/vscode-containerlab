/**
 * TopologyHostCore - Host-side authoritative topology model.
 *
 * Runs in Node environments (VS Code extension host / dev server).
 * Owns YAML + annotations persistence, revisioning, and undo/redo history.
 */

import * as YAML from "yaml";

import type { ClabTopology, DeploymentState, TopologyAnnotations } from "../types/topology";
import type { LabSettings } from "../types/labSettings";
import type {
  TopologyHostCommand,
  TopologyHostResponseMessage,
  TopologySnapshot
} from "../types/messages";
import { TOPOLOGY_HOST_PROTOCOL_VERSION } from "../types/messages";
import type { TopologyHost } from "../types/topologyHost";
import type { TopologyData } from "../types/graph";
import type { ContainerDataProvider, ParserLogger } from "../parsing/types";
import { TopologyParser } from "../parsing/TopologyParser";
import { applyInterfacePatternMigrations } from "../utilities";
import type { FileSystemAdapter, IOLogger } from "../io/types";
import { AnnotationsIO, TopologyIO, TransactionalFileSystemAdapter } from "../io";
import type { NodeSaveData } from "../io";
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
const TOPOLOGY_HOST_ACK = "topology-host:ack";
const RENAME_HISTORY_MERGE_WINDOW_MS = 800;

/** Migration entry for graph label data (position, icon, group info) */
interface GraphLabelMigration {
  nodeId: string;
  position?: { x: number; y: number };
  icon?: string;
  group?: string;
  level?: string;
  groupLabelPos?: string;
  geoCoordinates?: { lat: number; lng: number };
}

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
  private historyMergeUntil: number | null = null;

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
    const modeChanged = context.mode !== undefined && context.mode !== this.mode;
    const deploymentChanged =
      context.deploymentState !== undefined && context.deploymentState !== this.deploymentState;
    const containerChanged =
      context.containerDataProvider !== undefined &&
      context.containerDataProvider !== this.containerDataProvider;

    if (context.mode) this.mode = context.mode;
    if (context.deploymentState) this.deploymentState = context.deploymentState;
    if (context.containerDataProvider !== undefined) {
      this.containerDataProvider = context.containerDataProvider;
    }

    if (modeChanged || deploymentChanged || containerChanged) {
      this.snapshot = null;
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
      this.historyMergeUntil = null;
      return this.handleUndoRedo("undo");
    }
    if (command.command === "redo") {
      this.historyMergeUntil = null;
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
      this.historyMergeUntil = null;
      return {
        type: "topology-host:error",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        requestId: "",
        error: message
      };
    } finally {
      this.setInternalUpdate?.(false);
    }

    const now = Date.now();
    const mergeHistory = this.historyMergeUntil !== null && now <= this.historyMergeUntil;
    const skipHistory = shouldSkipHistory(command);

    if (!mergeHistory && !skipHistory) {
      this.pushHistory(beforeState);
    }

    if (isRenameEditCommand(command as TopologyHostCommand)) {
      this.historyMergeUntil = now + RENAME_HISTORY_MERGE_WINDOW_MS;
    } else if (this.historyMergeUntil !== null && now > this.historyMergeUntil) {
      this.historyMergeUntil = null;
    }
    this.future = [];
    this.revision += 1;
    this.snapshot = await this.buildSnapshot();

    return {
      type: TOPOLOGY_HOST_ACK,
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

  private readonly commandHandlers: Record<
    TopologyHostCommand["command"],
    (command: TopologyHostCommand) => Promise<void>
  > = {
    addNode: (cmd) => this.handleNodeCommand(cmd as Parameters<typeof this.handleNodeCommand>[0]),
    editNode: (cmd) => this.handleNodeCommand(cmd as Parameters<typeof this.handleNodeCommand>[0]),
    deleteNode: (cmd) => this.handleNodeCommand(cmd as Parameters<typeof this.handleNodeCommand>[0]),
    addLink: (cmd) => this.handleLinkCommand(cmd as Parameters<typeof this.handleLinkCommand>[0]),
    editLink: (cmd) => this.handleLinkCommand(cmd as Parameters<typeof this.handleLinkCommand>[0]),
    deleteLink: (cmd) => this.handleLinkCommand(cmd as Parameters<typeof this.handleLinkCommand>[0]),
    setYamlContent: (cmd) =>
      this.handleSourceContentCommand(cmd as Extract<TopologyHostCommand, { command: "setYamlContent" }>),
    setAnnotationsContent: (cmd) =>
      this.handleSourceContentCommand(
        cmd as Extract<TopologyHostCommand, { command: "setAnnotationsContent" }>
      ),
    savePositions: (cmd) => this.handleSaveCommand(cmd as Parameters<typeof this.handleSaveCommand>[0]),
    savePositionsAndAnnotations: (cmd) => this.handleSaveCommand(cmd as Parameters<typeof this.handleSaveCommand>[0]),
    setAnnotations: (cmd) => this.handleAnnotationSettingsCommand(cmd as Parameters<typeof this.handleAnnotationSettingsCommand>[0]),
    setAnnotationsWithMemberships: (cmd) =>
      this.handleAnnotationSettingsCommand(
        cmd as Parameters<typeof this.handleAnnotationSettingsCommand>[0]
      ),
    batch: (cmd) => this.handleBatchCommand(cmd as Extract<TopologyHostCommand, { command: "batch" }>),
    setEdgeAnnotations: (cmd) => this.handleAnnotationSettingsCommand(cmd as Parameters<typeof this.handleAnnotationSettingsCommand>[0]),
    setViewerSettings: (cmd) => this.handleAnnotationSettingsCommand(cmd as Parameters<typeof this.handleAnnotationSettingsCommand>[0]),
    setNodeGroupMembership: (cmd) => this.handleNodeGroupMemberships(cmd as Parameters<typeof this.handleNodeGroupMemberships>[0]),
    setNodeGroupMemberships: (cmd) => this.handleNodeGroupMemberships(cmd as Parameters<typeof this.handleNodeGroupMemberships>[0]),
    setLabSettings: (cmd) => this.applyLabSettings((cmd as Extract<TopologyHostCommand, { command: "setLabSettings" }>).payload),
    // undo/redo are handled specially before executeCommand is called; these should never be reached
    undo: () => Promise.reject(new Error("undo handled before executeCommand")),
    redo: () => Promise.reject(new Error("redo handled before executeCommand"))
  };

  private async executeCommand(command: TopologyHostCommand): Promise<void> {
    const handler = this.commandHandlers[command.command];
    if (!handler) {
      throw new Error(`Unknown command: ${command.command}`);
    }
    await handler(command);
  }

  private async handleNodeCommand(
    command: Extract<TopologyHostCommand, { command: "addNode" | "editNode" | "deleteNode" }>
  ): Promise<void> {
    switch (command.command) {
      case "addNode":
        await this.topologyIO.addNode(command.payload);
        break;
      case "editNode":
        await this.topologyIO.editNode(command.payload);
        break;
      case "deleteNode":
        await this.topologyIO.deleteNode(command.payload.id);
        break;
    }
  }

  private async handleLinkCommand(
    command: Extract<TopologyHostCommand, { command: "addLink" | "editLink" | "deleteLink" }>
  ): Promise<void> {
    switch (command.command) {
      case "addLink":
        await this.topologyIO.addLink(command.payload);
        break;
      case "editLink":
        await this.topologyIO.editLink(command.payload);
        break;
      case "deleteLink":
        await this.topologyIO.deleteLink(command.payload);
        break;
    }
  }

  private async handleSaveCommand(
    command: Extract<TopologyHostCommand, { command: "savePositions" | "savePositionsAndAnnotations" }>
  ): Promise<void> {
    if (command.command === "savePositions") {
      await this.topologyIO.savePositions(command.payload);
    } else {
      await this.topologyIO.savePositions(command.payload.positions);
      if (command.payload.annotations) {
        await this.mergeAnnotations(command.payload.annotations);
      }
    }
  }

  private async handleSourceContentCommand(
    command: Extract<TopologyHostCommand, { command: "setYamlContent" | "setAnnotationsContent" }>
  ): Promise<void> {
    if (command.command === "setYamlContent") {
      const content = command.payload?.content ?? "";
      const doc = YAML.parseDocument(content);
      if (doc.errors.length > 0) {
        const details = doc.errors.map((e) => e.message).join("\n");
        throw new Error(details || "Invalid YAML");
      }
      await this.transactionalFs.writeFile(this.yamlFilePath, content);
      await this.reloadFromDisk();
      return;
    }

    const raw = command.payload?.content ?? "";
    const content = raw.trim().length === 0 ? "{}\n" : raw;
    try {
      JSON.parse(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid annotations JSON: ${msg}`);
    }
    const annotationsPath = this.annotationsIO.getAnnotationsFilePath(this.yamlFilePath);
    await this.transactionalFs.writeFile(annotationsPath, content);
    await this.reloadFromDisk();
  }

  private async handleBatchCommand(
    command: Extract<TopologyHostCommand, { command: "batch" }>
  ): Promise<void> {
    const commands = command.payload.commands ?? [];
    this.topologyIO.beginBatch();
    try {
      for (const entry of commands) {
        if (entry.command === "batch") {
          throw new Error("Nested batch commands are not supported");
        }
        if (entry.command === "undo" || entry.command === "redo") {
          throw new Error("undo/redo not allowed inside batch");
        }
        await this.executeCommand(entry);
      }
    } finally {
      await this.topologyIO.endBatch();
    }
  }

  private async handleAnnotationSettingsCommand(
    command: Extract<
      TopologyHostCommand,
      {
        command:
          | "setAnnotations"
          | "setAnnotationsWithMemberships"
          | "setEdgeAnnotations"
          | "setViewerSettings";
      }
    >
  ): Promise<void> {
    switch (command.command) {
      case "setAnnotations":
        await this.mergeAnnotations(command.payload);
        break;
      case "setAnnotationsWithMemberships": {
        const { annotations, memberships } = command.payload;
        await this.annotationsIO.modifyAnnotations(this.yamlFilePath, (current) => {
          const merged = mergeAnnotationsPayload(current, annotations);
          return applyNodeGroupMembershipsToAnnotations(merged, memberships);
        });
        break;
      }
      case "setEdgeAnnotations":
        await this.annotationsIO.modifyAnnotations(this.yamlFilePath, (current) => ({
          ...current,
          edgeAnnotations: command.payload
        }));
        break;
      case "setViewerSettings":
        await this.annotationsIO.modifyAnnotations(this.yamlFilePath, (current) => ({
          ...current,
          viewerSettings: {
            ...(current.viewerSettings ?? {}),
            ...command.payload
          }
        }));
        break;
    }
  }

  private async mergeAnnotations(annotations: Partial<TopologyAnnotations>): Promise<void> {
    await this.annotationsIO.modifyAnnotations(this.yamlFilePath, (current) => {
      return mergeAnnotationsPayload(current, annotations);
    });
  }

  private async handleNodeGroupMemberships(
    command: Extract<TopologyHostCommand, { command: "setNodeGroupMembership" | "setNodeGroupMemberships" }>
  ): Promise<void> {
    if (command.command === "setNodeGroupMembership") {
      await this.applyNodeGroupMembership(command.payload.nodeId, command.payload.groupId);
    } else {
      await this.applyNodeGroupMemberships(command.payload);
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
    await this.annotationsIO.modifyAnnotations(this.yamlFilePath, (current) =>
      applyNodeGroupMembershipsToAnnotations(current, memberships)
    );
  }

  // ---------------------------------------------------------------------------
  // Undo/redo
  // ---------------------------------------------------------------------------

  private async handleUndoRedo(direction: "undo" | "redo"): Promise<TopologyHostResponseMessage> {
    const stack = direction === "undo" ? this.past : this.future;
    if (stack.length === 0) {
      const snapshot = await this.getSnapshot();
      return {
        type: TOPOLOGY_HOST_ACK,
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
      type: TOPOLOGY_HOST_ACK,
      protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
      requestId: "",
      revision: this.revision,
      snapshot: this.snapshot
    };
  }

  // ---------------------------------------------------------------------------
  // Snapshot building
  // ---------------------------------------------------------------------------

  private async readAnnotationsContent(): Promise<string | null> {
    const annotationsPath = this.annotationsIO.getAnnotationsFilePath(this.yamlFilePath);
    try {
      const exists = await this.baseFs.exists(annotationsPath);
      if (exists) {
        return await this.baseFs.readFile(annotationsPath);
      }
    } catch {
      // fall through
    }
    return null;
  }

  private async buildSnapshot(): Promise<TopologySnapshot> {
    const yamlContent = await this.baseFs.readFile(this.yamlFilePath);
    const yamlDoc = YAML.parseDocument(yamlContent);
    const parsed = yamlDoc.toJS() as ClabTopology;
    this.currentClabTopology = parsed;

    const annotationsContent = await this.readAnnotationsContent();

    let annotations = await this.annotationsIO.loadAnnotations(this.yamlFilePath, true);
    const annotationsUpdated = await this.reconcileAnnotationsForRenamedNodes(parsed);
    if (annotationsUpdated) {
      annotations = await this.annotationsIO.loadAnnotations(this.yamlFilePath, true);
    }

    const parseResult = this.parseTopology(yamlContent, annotations, parsed);

    const migrationsApplied = await this.applyMigrations(
      annotations,
      parseResult.graphLabelMigrations,
      parseResult.pendingMigrations
    );
    if (migrationsApplied) {
      annotations = await this.annotationsIO.loadAnnotations(this.yamlFilePath, true);
    }

    const finalParseResult = migrationsApplied
      ? this.parseTopology(yamlContent, annotations, parsed)
      : parseResult;
    const topology = finalParseResult.topology;
    const labName = finalParseResult.labName;

    const normalizedAnnotations = normalizeAnnotations(annotations);
    const labSettings = extractLabSettings(yamlDoc);

    const yamlFileName = this.baseFs.basename(this.yamlFilePath);
    const annotationsFileName = this.baseFs.basename(this.annotationsIO.getAnnotationsFilePath(this.yamlFilePath));

    return {
      revision: this.revision,
      nodes: topology.nodes,
      edges: topology.edges,
      annotations: normalizedAnnotations,
      yamlFileName,
      annotationsFileName,
      yamlContent,
      annotationsContent:
        annotationsContent ?? JSON.stringify(createEmptyAnnotations(), null, 2),
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
    annotations: TopologyAnnotations,
    parsed?: ClabTopology
  ): {
    topology: TopologyData;
    labName?: string;
    pendingMigrations: Array<{ nodeId: string; interfacePattern: string }>;
    graphLabelMigrations: GraphLabelMigration[];
  } {
    if (this.mode === "view") {
      return parsed
        ? TopologyParser.parseToReactFlowFromParsed(parsed, {
            annotations,
            containerDataProvider: this.containerDataProvider,
            logger: this.parserLogger
          })
        : TopologyParser.parseToReactFlow(yamlContent, {
            annotations,
            containerDataProvider: this.containerDataProvider,
            logger: this.parserLogger
          });
    }
    return parsed
      ? TopologyParser.parseForEditorRFParsed(parsed, annotations)
      : TopologyParser.parseForEditorRF(yamlContent, annotations);
  }

  private async applyMigrations(
    annotations: TopologyAnnotations,
    graphLabelMigrations: GraphLabelMigration[],
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
    const annotationsContent = await this.readAnnotationsContent();
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

function isRenameEditCommand(command: TopologyHostCommand): boolean {
  if (command.command !== "editNode") return false;
  const payload = command.payload as NodeSaveData & { oldName?: string };
  const oldName = typeof payload.oldName === "string" ? payload.oldName.trim() : "";
  const nextName = typeof payload.name === "string" ? payload.name.trim() : "";
  return Boolean(oldName && nextName && oldName !== nextName);
}

function shouldSkipHistory(command: TopologyHostCommand): boolean {
  if (
    command.command === "savePositions" ||
    command.command === "savePositionsAndAnnotations" ||
    command.command === "setYamlContent" ||
    command.command === "setAnnotationsContent"
  ) {
    return (command as unknown as { skipHistory?: boolean }).skipHistory === true;
  }
  return false;
}

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
  const mgmtRaw = doc.get("mgmt") as YAML.YAMLMap | Record<string, unknown> | undefined;
  const mgmt =
    mgmtRaw && typeof (mgmtRaw as { toJSON?: () => unknown }).toJSON === "function"
      ? ((mgmtRaw as YAML.YAMLMap).toJSON() as Record<string, unknown>)
      : (mgmtRaw as Record<string, unknown> | undefined);

  if (name) settings.name = name;
  if (prefix !== undefined) settings.prefix = prefix;
  if (mgmt && typeof mgmt === "object") {
    settings.mgmt = mgmt;
  }

  return settings;
}

function persistGraphLabelMigrations(
  annotations: TopologyAnnotations,
  migrations: GraphLabelMigration[]
): TopologyAnnotations {
  const nodeAnnotations: Array<Omit<GraphLabelMigration, "nodeId"> & { id: string }> = [
    ...(annotations.nodeAnnotations ?? [])
  ];

  const existingIds = new Set(nodeAnnotations.map((na) => na.id));
  for (const migration of migrations) {
    if (existingIds.has(migration.nodeId)) continue;
    const { nodeId, ...rest } = migration;
    nodeAnnotations.push({ ...rest, id: nodeId });
  }

  return { ...annotations, nodeAnnotations };
}

type NodeAnnotationLike = { id: string; groupId?: string; group?: unknown };

function omitKeys<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const keysToOmit = new Set<string>(keys as string[]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!keysToOmit.has(key)) {
      result[key] = value;
    }
  }
  return result as Omit<T, K>;
}

function omitGroupFields<T extends NodeAnnotationLike>(
  obj: T
): Omit<T, "group" | "groupId"> & { id: string } {
  return omitKeys(obj, ["group", "groupId"]) as Omit<T, "group" | "groupId"> & { id: string };
}

function omitGroupOnly<T extends NodeAnnotationLike>(obj: T): Omit<T, "group"> {
  return omitKeys(obj, ["group"]) as Omit<T, "group">;
}

function mergeAnnotationsPayload(
  current: TopologyAnnotations,
  annotations: Partial<TopologyAnnotations>
): TopologyAnnotations {
  const merged: TopologyAnnotations = { ...current, ...annotations };
  if (annotations.viewerSettings) {
    merged.viewerSettings = {
      ...(current.viewerSettings ?? {}),
      ...annotations.viewerSettings
    };
  }
  return merged;
}

function applyNodeGroupMembershipsToAnnotations(
  annotations: TopologyAnnotations,
  memberships: Array<{ nodeId: string; groupId: string | null }>
): TopologyAnnotations {
  const membershipMap = new Map(
    memberships.filter((m) => m.groupId).map((m) => [m.nodeId, m.groupId!])
  );

  const existingAnnotations = annotations.nodeAnnotations ?? [];
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

  return { ...annotations, nodeAnnotations: result };
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
