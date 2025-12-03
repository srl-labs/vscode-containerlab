// file: TopologyShell.ts

import type cytoscape from "cytoscape";
import { createConfiguredCytoscape } from "../features/canvas/CytoscapeFactory";

// Import Tailwind CSS and Font Awesome
import "../assets/styles/tailwind.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
// Import Leaflet CSS for map tiles
import "leaflet/dist/leaflet.css";
import "tippy.js/dist/tippy.css";
import "highlight.js/styles/github-dark.css";
// Import uPlot for graphs
import "uplot/dist/uPlot.min.css";
import loadCytoStyle from "../features/canvas/BaseStyles";
import { VscodeMessageSender } from "../platform/messaging/VscodeMessaging";
import { fetchAndLoadData, fetchAndLoadDataEnvironment } from "../features/canvas/FetchAndLoad";
import { SaveManager } from "../core/SaveManager";
import { AddNodeManager } from "../features/nodes/AddNodeManager";
import { ViewportPanelsManager } from "../features/panels/ViewportPanelsManager";
import { UnifiedFloatingPanelManager } from "../features/panels/UnifiedFloatingPanelManager";
import { FreeTextManager } from "../features/annotations/FreeTextManager";
import { FreeShapesManager } from "../features/annotations/FreeShapesManager";
import { NodeEditorManager } from "../features/node-editor/NodeEditorManager";
import { GroupStyleManager } from "../features/groups/GroupStyleManager";
import { CopyPasteManager } from "../features/nodes/CopyPasteManager";
import { LabSettingsManager } from "../features/panels/LabSettingsManager";
import { viewportButtonsCaptureViewportAsSvg } from "../ui/UiHandlers";
import type { GroupManager } from "../features/groups/GroupManager";
import type { LayoutManager } from "../features/canvas/LayoutManager";
import type { ZoomToFitManager } from "../features/canvas/ZoomToFitManager";
import type { LinkLabelManager } from "../features/canvas/LinkLabelManager";
import { ShortcutDisplayManager } from "../ui/ShortcutDisplayManager";
import {
  layoutAlgoManager as layoutAlgoManagerSingleton,
  getGroupManager,
  zoomToFitManager as zoomToFitManagerSingleton,
  labelEndpointManager as labelEndpointManagerSingleton,
  dummyLinksManager as dummyLinksManagerSingleton
} from "../core/managerRegistry";
import { log } from "../platform/logging/logger";
import { perfMark, perfMeasure } from "../../shared/utilities/PerformanceMonitor";
import { registerCyEventHandlers } from "../features/canvas/EventHandlers";
import { PerformanceMonitor } from "../../shared/utilities/PerformanceMonitor";
import { debounce } from "../../shared/utilities/AsyncUtils";
import { GridGuideManager } from "../features/canvas/GridGuideManager";
import topoViewerState from "./state";

// Extracted managers
import { ContextMenuManager } from "../features/context-menus/ContextMenuManager";
import { LinkPanelManager } from "../features/panels/LinkPanelManager";
import { KeyboardManager } from "../features/keyboard/KeyboardManager";
import { BulkLinkManager } from "../features/links/BulkLinkManager";
import { EdgeCreationManager } from "../features/links/EdgeCreationManager";
import { ModeManager, type ModeSwitchPayload } from "../core/ModeManager";

if (typeof window !== "undefined") {
  (window as any).topoViewerState = topoViewerState;
}

/**
 * TopologyWebviewController is responsible for initializing the Cytoscape instance,
 * managing edge creation, node editing and viewport panels/buttons.
 * Entry point for the topology editor webview; methods are called from vscodeHtmlTemplate.ts.
 */
export default class TopologyWebviewController {
  public cy!: cytoscape.Core;
  private isViewportDrawerClabEditorChecked: boolean = true;

  public messageSender!: VscodeMessageSender;
  public saveManager!: SaveManager;
  public addNodeManager!: AddNodeManager;
  public viewportPanels?: ViewportPanelsManager;
  public unifiedFloatingPanel: UnifiedFloatingPanelManager | null = null;
  public nodeEditor?: NodeEditorManager;
  public groupManager!: GroupManager;
  public groupStyleManager!: GroupStyleManager;
  public layoutAlgoManager!: LayoutManager;
  public zoomToFitManager!: ZoomToFitManager;
  public labelEndpointManager!: LinkLabelManager;
  public dummyLinksManager!: import("../features/canvas/DummyLinksManager").DummyLinksManager;
  public freeTextManager?: FreeTextManager;
  public freeShapesManager?: FreeShapesManager;
  public copyPasteManager!: CopyPasteManager;
  public captureViewportManager!: { viewportButtonsCaptureViewportAsSvg: () => void };
  public labSettingsManager?: LabSettingsManager;
  public gridManager!: GridGuideManager;

  // Extracted managers
  private contextMenuManager!: ContextMenuManager;
  private linkPanelManager!: LinkPanelManager;
  private keyboardManager!: KeyboardManager;
  private bulkLinkManager!: BulkLinkManager;
  private edgeCreationManager!: EdgeCreationManager;
  private modeManager!: ModeManager;

  private labLocked = true;
  private currentMode: "edit" | "view" = "edit";
  private suppressViewerCanvasClose = false;
  private editModeEventsRegistered = false;
  private viewModeEventsRegistered = false;
  private editAutoSaveConfigured = false;
  private viewAutoSaveConfigured = false;
  private autoSaveSuspendCount = 0;
  private commonTapstartHandlerRegistered = false;
  private freeTextContextGuardRegistered = false;
  private initialGraphLoaded = false;

  public async initAsync(mode: "edit" | "view"): Promise<void> {
    await this.loadInitialGraph(mode);
    this.scheduleInitialFit();
    this.gridManager.enableSnapping(true);
    this.fetchEnvironmentMetadata();
    this.initializeLockState();
    await this.configureModeHandlers(mode);
    await this.loadGroupStylesSafe();
  }

  private async loadInitialGraph(mode: "edit" | "view"): Promise<void> {
    perfMark("cytoscape_style_start");
    await loadCytoStyle(this.cy);
    perfMeasure("cytoscape_style", "cytoscape_style_start");
    perfMark("fetch_data_start");
    await fetchAndLoadData(this.cy, this.messageSender);
    if (mode === "edit") {
      this.clearEdgeLinkStates();
      log.debug("initAsync: cleared link state classes for edit mode");
    }
    perfMeasure("fetch_data", "fetch_data_start");
    perfMeasure("topoViewer_init_total", "topoViewer_init_start");
    this.initialGraphLoaded = true;
    this.messageSender.sendMessageToVscodeEndpointPost("performance-metrics", {
      metrics: PerformanceMonitor.getMeasures()
    });
  }

  private clearEdgeLinkStates(): void {
    this.cy.edges().forEach((edge) => {
      edge.removeClass("link-up");
      edge.removeClass("link-down");
    });
  }

  private scheduleInitialFit(): void {
    if (this.cy.elements().length === 0) {
      return;
    }

    if (typeof requestAnimationFrame === "undefined") {
      this.cy.fit(this.cy.elements(), 50);
      log.debug("Viewport fitted immediately (no RAF available)");
      return;
    }
    // eslint-disable-next-line no-undef
    requestAnimationFrame(() => {
      this.cy.animate({
        fit: { eles: this.cy.elements(), padding: 50 },
        duration: 150,
        easing: "ease-out"
      });
    });
  }

  private fetchEnvironmentMetadata(): void {
    void (async () => {
      try {
        const result = await fetchAndLoadDataEnvironment(["clab-name", "clab-prefix"]);
        const labName = result["clab-name"] || "Unknown";
        this.updateSubtitle(labName);
        topoViewerState.labName = labName;
        if (typeof result["clab-prefix"] === "string") {
          topoViewerState.prefixName = result["clab-prefix"] as string;
        }
      } catch (error) {
        log.error(
          `Error loading environment data: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })();
  }

  private initializeLockState(): void {
    this.labLocked = this.getInitialLockState();
    this.applyLockState(this.labLocked);
  }

  private async configureModeHandlers(mode: "edit" | "view"): Promise<void> {
    await this.registerEvents(mode);
    if (mode === "edit") {
      this.setupAutoSave();
      setTimeout(() => this.edgeCreationManager.initialize(), 50);
    } else {
      this.setupAutoSaveViewMode();
    }
    setTimeout(() => this.contextMenuManager.initialize(), 100);
  }

  private async loadGroupStylesSafe(): Promise<void> {
    try {
      await this.withAutoSaveSuspended(() => this.groupStyleManager.loadGroupStyles());
    } catch (error) {
      log.error(`Failed to load group style annotations: ${error}`);
    }
  }

  private setupAutoSave(): void {
    if (this.editAutoSaveConfigured) {
      return;
    }
    this.editAutoSaveConfigured = true;
    const autoSave = this.createDebouncedAutoSave();
    this.cy.on("add remove data", (event) => this.handleNodeEvent(event, autoSave));
    this.cy.on("position", (event) => this.handleNodePositionEvent(event, autoSave));
    this.cy.on("dragfree", "node", (event) => this.handleNodeEvent(event, autoSave));
  }

  private setupAutoSaveViewMode(): void {
    if (this.viewAutoSaveConfigured) {
      return;
    }
    this.viewAutoSaveConfigured = true;
    const autoSaveViewMode = this.createDebouncedViewAutoSave();
    this.cy.on("position", (event) => this.handleNodePositionEvent(event, autoSaveViewMode));
    this.cy.on("dragfree", "node", (event) => this.handleNodeEvent(event, autoSaveViewMode));
  }

  private createDebouncedAutoSave(): () => void {
    return debounce(async () => {
      if (!this.canAutoSaveNow()) {
        return;
      }
      await this.saveTopoSilently();
    }, 500);
  }

  private createDebouncedViewAutoSave(): () => void {
    return debounce(async () => {
      if (this.isAutoSaveSuspended()) {
        return;
      }
      await this.saveTopoSilently();
    }, 500);
  }

  private async saveTopoSilently(): Promise<void> {
    const suppressNotification = true;
    await this.saveManager.saveTopo(this.cy, suppressNotification);
  }

  private canAutoSaveNow(): boolean {
    if (this.isAutoSaveSuspended()) {
      return false;
    }
    if (this.edgeCreationManager.isActive()) {
      return false;
    }
    return true;
  }

  private handleNodePositionEvent(event: cytoscape.EventObject, callback: () => void): void {
    if (this.shouldSkipAutoSaveForTarget(event.target)) {
      return;
    }
    if (!event.target.grabbed()) {
      callback();
    }
  }

  private handleNodeEvent(event: cytoscape.EventObject, callback: () => void): void {
    if (this.shouldSkipAutoSaveForTarget(event.target)) {
      return;
    }
    callback();
  }

  private shouldSkipAutoSaveForTarget(target: cytoscape.Singular | undefined): boolean {
    if (!target) {
      return true;
    }
    // Allow edges to trigger auto-save (for link deletion)
    if (target.isEdge()) {
      return false;
    }
    if (!target.isNode()) {
      return true;
    }
    return target.data("topoViewerRole") === "freeText";
  }

  private suspendAutoSave(): void {
    this.autoSaveSuspendCount += 1;
  }

  private resumeAutoSave(): void {
    if (this.autoSaveSuspendCount > 0) {
      this.autoSaveSuspendCount -= 1;
    }
  }

  private isAutoSaveSuspended(): boolean {
    return this.autoSaveSuspendCount > 0;
  }

  private async withAutoSaveSuspended<T>(operation: () => Promise<T>): Promise<T> {
    this.suspendAutoSave();
    try {
      return await operation();
    } finally {
      this.resumeAutoSave();
    }
  }

  private registerCustomZoom(): void {
    this.cy.userZoomingEnabled(false);
    const container = this.cy.container();
    container?.addEventListener("wheel", this.handleCustomWheel, { passive: false });
  }

  private handleCustomWheel = (event: WheelEvent): void => {
    event.preventDefault();
    let step = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      step *= 100;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      step *= window.innerHeight;
    }
    const isTrackpad =
      event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(event.deltaY) < 50;
    const sensitivity = isTrackpad ? 0.002 : 0.0002;
    const factor = Math.pow(10, -step * sensitivity);
    const newZoom = this.cy.zoom() * factor;
    this.cy.zoom({
      level: newZoom,
      renderedPosition: { x: event.offsetX, y: event.offsetY }
    });
  };

  constructor(containerId: string, mode: "edit" | "view" = "edit") {
    perfMark("topoViewer_init_start");
    this.currentMode = mode;
    (topoViewerState as any).currentMode = mode;
    const container = this.getContainer(containerId);
    this.messageSender = new VscodeMessageSender();
    const theme = this.detectColorScheme();
    this.initializeCytoscape(container, theme);
    this.initializeManagers(mode);

    window.addEventListener("topology-lock-change", (e: any) => {
      this.applyLockState(!!e.detail);
    });
  }

  private getContainer(containerId: string): HTMLElement {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error("Cytoscape container element not found");
    }
    return container;
  }

  private initializeCytoscape(container: HTMLElement, theme: string): void {
    perfMark("cytoscape_create_start");
    this.cy = createConfiguredCytoscape(container);
    perfMeasure("cytoscape_create", "cytoscape_create_start");
    this.cy.viewport({
      zoom: 1,
      pan: { x: container.clientWidth / 2, y: container.clientHeight / 2 }
    });
    const cyContainer = document.getElementById("cy") as HTMLDivElement | null;
    if (cyContainer) {
      cyContainer.tabIndex = 0;
      cyContainer.addEventListener("mousedown", () => {
        cyContainer.focus();
      });
    }
    this.registerCustomZoom();
    this.cy.on("tap", (event) => {
      log.debug(`Cytoscape event: ${event.type}`);
    });
    this.gridManager = new GridGuideManager(this.cy);
    this.gridManager.initialize(theme as "light" | "dark");
    (window as any).updateTopoGridTheme = (newTheme: "light" | "dark") => {
      this.gridManager.updateTheme(newTheme);
    };
  }

  private initializeManagers(mode: "edit" | "view"): void {
    this.setupManagers(mode);
    this.setupExtractedManagers();
    this.registerDoubleClickHandlers();
    this.exposeWindowFunctions();
    this.registerMessageListener();
    document.getElementById("cy")?.focus();
  }

  private setupManagers(mode: "edit" | "view"): void {
    // eslint-disable-next-line sonarjs/constructor-for-side-effects
    new ShortcutDisplayManager();
    this.saveManager = new SaveManager(this.messageSender);
    this.addNodeManager = new AddNodeManager();
    this.labSettingsManager = new LabSettingsManager(this.messageSender);
    this.labSettingsManager.init();
    this.freeTextManager = new FreeTextManager(this.cy, this.messageSender);
    this.freeShapesManager = new FreeShapesManager(this.cy, this.messageSender);
    this.groupStyleManager = new GroupStyleManager(
      this.cy,
      this.messageSender,
      this.freeTextManager
    );
    this.freeTextManager.setGroupStyleManager(this.groupStyleManager);
    this.copyPasteManager = new CopyPasteManager(
      this.cy,
      this.messageSender,
      this.groupStyleManager,
      this.freeTextManager
    );
    this.copyPasteManager.setFreeShapesManager(this.freeShapesManager);
    if (mode === "edit") {
      this.viewportPanels = new ViewportPanelsManager(this.saveManager, this.cy);
      (window as any).viewportPanels = this.viewportPanels;
      this.nodeEditor = new NodeEditorManager(this.cy, this.saveManager);
    }
    this.unifiedFloatingPanel = new UnifiedFloatingPanelManager(
      this.cy,
      this.messageSender,
      this.addNodeManager,
      this.nodeEditor
    );
    this.groupManager = getGroupManager(this.cy, this.groupStyleManager, mode);
    this.groupManager.initializeWheelSelection();
    this.groupManager.initializeGroupManagement();
    this.layoutAlgoManager = layoutAlgoManagerSingleton;
    this.zoomToFitManager = zoomToFitManagerSingleton;
    this.labelEndpointManager = labelEndpointManagerSingleton;
    this.labelEndpointManager.initialize(this.cy);
    this.dummyLinksManager = dummyLinksManagerSingleton;
    this.dummyLinksManager.initialize(this.cy);
    this.isViewportDrawerClabEditorChecked = mode === "edit";
    this.captureViewportManager = {
      viewportButtonsCaptureViewportAsSvg: () => {
        viewportButtonsCaptureViewportAsSvg();
      }
    };
  }

  private setupExtractedManagers(): void {
    this.setupEdgeCreationManager();
    this.setupLinkPanelManager();
    this.setupContextMenuManager();
    this.setupKeyboardManager();
    this.setupBulkLinkManager();
    this.setupModeManager();
  }

  private setupEdgeCreationManager(): void {
    this.edgeCreationManager = new EdgeCreationManager({ cy: this.cy });
  }

  private setupLinkPanelManager(): void {
    this.linkPanelManager = new LinkPanelManager({
      cy: this.cy,
      getCurrentMode: () => this.currentMode
    });
  }

  private setupContextMenuManager(): void {
    this.contextMenuManager = new ContextMenuManager({
      cy: this.cy,
      getViewportPanels: () => this.viewportPanels,
      getNodeEditor: () => this.nodeEditor,
      getGroupManager: () => this.groupManager,
      getFreeTextManager: () => this.freeTextManager,
      getFreeShapesManager: () => this.freeShapesManager,
      getMessageSender: () => this.messageSender,
      isLocked: () => this.labLocked,
      getCurrentMode: () => this.currentMode,
      showLockedMessage: () => this.showLockedMessage(),
      startEdgeCreationFromNode: (node) => this.edgeCreationManager.startFromNode(node),
      showNodePropertiesPanel: (node) => this.showNodePropertiesPanel(node),
      showLinkPropertiesPanel: (edge) => this.linkPanelManager.showLinkPropertiesPanel(edge),
      isNetworkNode: (nodeId) => this.edgeCreationManager.isNetworkNode(nodeId),
      setSuppressViewerCanvasClose: (value) => {
        this.suppressViewerCanvasClose = value;
      }
    });
  }

  private setupKeyboardManager(): void {
    this.keyboardManager = new KeyboardManager({
      cy: this.cy,
      getGroupManager: () => this.groupManager,
      getCopyPasteManager: () => this.copyPasteManager,
      getFreeTextManager: () => this.freeTextManager,
      getFreeShapesManager: () => this.freeShapesManager,
      getSaveManager: () => this.saveManager,
      isLocked: () => this.labLocked,
      isEditorMode: () => this.isViewportDrawerClabEditorChecked,
      getCurrentMode: () => this.currentMode,
      showLockedMessage: () => this.showLockedMessage()
    });
  }

  private setupBulkLinkManager(): void {
    this.bulkLinkManager = new BulkLinkManager({
      cy: this.cy,
      getSaveManager: () => this.saveManager,
      getNextEndpoint: (nodeId) => this.edgeCreationManager.getNextEndpoint(nodeId),
      isNetworkNode: (nodeId) => this.edgeCreationManager.isNetworkNode(nodeId)
    });
  }

  private setupModeManager(): void {
    this.modeManager = new ModeManager({
      getCurrentMode: () => this.currentMode,
      setCurrentMode: (mode) => {
        this.currentMode = mode;
      },
      setIsViewportDrawerClabEditorChecked: (checked) => {
        this.isViewportDrawerClabEditorChecked = checked;
      },
      applyLockState: (locked) => this.applyLockState(locked),
      setLabLocked: (locked) => {
        this.labLocked = locked;
      },
      getLabLocked: () => this.labLocked,
      fetchAndLoadData: async () => {
        await fetchAndLoadData(this.cy, this.messageSender);
      },
      isInitialGraphLoaded: () => this.initialGraphLoaded,
      setInitialGraphLoaded: (loaded) => {
        this.initialGraphLoaded = loaded;
      },
      ensureModeResources: (mode) => this.ensureModeResources(mode),
      clearEdgeLinkStates: () => this.clearEdgeLinkStates(),
      initializeContextMenu: () => this.contextMenuManager.initialize()
    });
  }

  private registerDoubleClickHandlers(): void {
    this.cy.on("dblclick", 'node[topoViewerRole != "freeText"]', (event) => {
      if (this.labLocked) {
        this.showLockedMessage();
        return;
      }
      const node = event.target;
      if (node.data("topoViewerRole") === "group") {
        this.groupManager.showGroupEditor(node);
      } else if (node.data("topoViewerRole") === "cloud") {
        this.viewportPanels?.panelNetworkEditor(node);
      } else if (this.nodeEditor) {
        this.nodeEditor.open(node);
      }
    });
    this.cy.on("dblclick", "edge", (event) => {
      if (this.labLocked) {
        this.showLockedMessage();
        return;
      }
      const edge = event.target;
      this.viewportPanels?.panelEdgeEditor(edge);
    });
  }

  private exposeWindowFunctions(): void {
    window.viewportButtonsLayoutAlgo = this.layoutAlgoManager.viewportButtonsLayoutAlgo.bind(
      this.layoutAlgoManager
    );
    window.layoutAlgoChange = this.layoutAlgoManager.layoutAlgoChange.bind(this.layoutAlgoManager);
    window.viewportDrawerLayoutGeoMap = this.layoutAlgoManager.viewportDrawerLayoutGeoMap.bind(
      this.layoutAlgoManager
    );
    window.viewportDrawerDisableGeoMap = this.layoutAlgoManager.viewportDrawerDisableGeoMap.bind(
      this.layoutAlgoManager
    );
    window.viewportDrawerLayoutForceDirected =
      this.layoutAlgoManager.viewportDrawerLayoutForceDirected.bind(this.layoutAlgoManager);
    window.viewportDrawerLayoutForceDirectedRadial =
      this.layoutAlgoManager.viewportDrawerLayoutForceDirectedRadial.bind(this.layoutAlgoManager);
    window.viewportDrawerLayoutVertical = this.layoutAlgoManager.viewportDrawerLayoutVertical.bind(
      this.layoutAlgoManager
    );
    window.viewportDrawerLayoutHorizontal =
      this.layoutAlgoManager.viewportDrawerLayoutHorizontal.bind(this.layoutAlgoManager);
    window.viewportDrawerPreset = this.layoutAlgoManager.viewportDrawerPreset.bind(
      this.layoutAlgoManager
    );
    window.viewportButtonsGeoMapPan = this.layoutAlgoManager.viewportButtonsGeoMapPan.bind(
      this.layoutAlgoManager
    );
    window.viewportButtonsGeoMapEdit = this.layoutAlgoManager.viewportButtonsGeoMapEdit.bind(
      this.layoutAlgoManager
    );
    window.viewportButtonsTopologyOverview = this.viewportButtonsTopologyOverview.bind(this);
    window.viewportButtonsZoomToFit = () => this.zoomToFitManager.viewportButtonsZoomToFit(this.cy);
    window.viewportButtonsCaptureViewportAsSvg = () =>
      this.captureViewportManager.viewportButtonsCaptureViewportAsSvg();
    (window as any).viewportDrawerGridLineWidthChange = (value: string | number) => {
      const n = typeof value === "number" ? value : parseFloat(String(value));
      if (!Number.isNaN(n)) {
        this.gridManager?.setLineWidth(n);
      }
    };
    (window as any).viewportDrawerGridLineWidthReset = () => {
      const def = 0.5;
      const el = document.getElementById(
        "viewport-drawer-grid-line-width"
      ) as HTMLInputElement | null;
      if (el) el.value = String(def);
      this.gridManager?.setLineWidth(def);
    };
  }

  private registerMessageListener(): void {
    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const msg = event.data as any;
      if (!msg?.type) {
        return;
      }
      this.dispatchIncomingMessage(msg);
    });
  }

  private dispatchIncomingMessage(msg: any): void {
    const runHandler = (type: string, fn: () => void | Promise<void>): void => {
      Promise.resolve(fn()).catch((error) => {
        log.error(
          `Error handling message "${type}": ${error instanceof Error ? error.message : String(error)}`
        );
      });
    };

    switch (msg.type) {
      case "yaml-saved":
        runHandler(msg.type, async () => {
          await fetchAndLoadData(this.cy, this.messageSender, { incremental: true });
        });
        return;
      case "updateTopology":
        runHandler(msg.type, () => this.updateTopology(msg.data));
        return;
      case "copiedElements":
        runHandler(msg.type, () => this.handleCopiedElements(msg.data));
        return;
      case "topo-mode-changed":
        runHandler(msg.type, () =>
          this.modeManager.handleModeSwitchMessage(msg.data as ModeSwitchPayload)
        );
        return;
      case "docker-images-updated":
        runHandler(msg.type, () =>
          this.handleDockerImagesUpdatedMessage(msg.dockerImages as string[])
        );
        return;
      default:
        return;
    }
  }

  private handleDockerImagesUpdatedMessage(images?: string[]): void {
    const nextImages = Array.isArray(images) ? images : [];
    this.assignWindowValue("dockerImages", nextImages, []);
    this.nodeEditor?.handleDockerImagesUpdated(nextImages);
  }

  private assignWindowValue<T>(key: string, value: T | undefined, fallback?: T): void {
    if (value !== undefined) {
      (window as any)[key] = value;
      return;
    }
    if (fallback !== undefined && (window as any)[key] === undefined) {
      (window as any)[key] = fallback;
    }
  }

  private updateTopology(data: any): void {
    try {
      const elements = data as any[];
      if (Array.isArray(elements)) {
        let requiresStyleReload = false;
        elements.forEach((el) => {
          const id = el?.data?.id;
          if (!id) {
            return;
          }

          const existing = this.cy.getElementById(id);
          if (existing && existing.length > 0) {
            existing.data(el.data);
            if (typeof el.classes === "string") {
              existing.classes(el.classes);
            }
            if (this.currentMode === "edit" && existing.isEdge()) {
              existing.removeClass("link-up");
              existing.removeClass("link-down");
            }
            if (existing.isEdge()) {
              this.linkPanelManager.refreshLinkPanelIfSelected(existing);
            }
          } else {
            this.cy.add(el);
            requiresStyleReload = true;
          }
        });

        if (requiresStyleReload) {
          loadCytoStyle(this.cy);
        }
      }
    } catch (error) {
      log.error(`Error processing updateTopology message: ${error}`);
    }
  }

  private handleCopiedElements(data: any): void {
    const addedElements = this.copyPasteManager.performPaste(data);
    if (addedElements && addedElements.length > 0) {
      this.saveManager.saveTopo(this.cy, true);
    }
  }

  private async ensureModeResources(mode: "edit" | "view"): Promise<void> {
    await this.registerEvents(mode);
    if (mode === "edit") {
      if (!this.viewportPanels) {
        this.viewportPanels = new ViewportPanelsManager(this.saveManager, this.cy);
        (window as any).viewportPanels = this.viewportPanels;
      }
      if (!this.nodeEditor) {
        this.nodeEditor = new NodeEditorManager(this.cy, this.saveManager);
      }
      this.setupAutoSave();
    } else {
      this.setupAutoSaveViewMode();
    }
    this.unifiedFloatingPanel?.setNodeEditor(this.nodeEditor ?? null);
    this.edgeCreationManager.toggle(mode === "edit");
    await this.contextMenuManager.initialize();
  }

  private applyLockState(locked: boolean): void {
    this.labLocked = locked;
    if (locked) {
      this.cy.nodes().lock();
    } else {
      this.cy.nodes().unlock();
    }
    void this.contextMenuManager.initialize();
  }

  private getInitialLockState(): boolean {
    const configured = (window as any).lockLabByDefault;
    return typeof configured === "boolean" ? configured : true;
  }

  private showLockedMessage(): void {
    (window as any).showLabLockedMessage?.();
  }

  private async registerEvents(mode: "edit" | "view"): Promise<void> {
    if (!this.commonTapstartHandlerRegistered) {
      this.cy.on("tapstart", "node", (e) => {
        if (this.labLocked && this.currentMode === "edit") {
          this.showLockedMessage();
          e.preventDefault();
        }
      });
      this.commonTapstartHandlerRegistered = true;
    }

    if (!this.freeTextContextGuardRegistered) {
      this.cy.on("cxttapstart", 'node[topoViewerRole = "freeText"]', (e) => {
        if (!this.labLocked) {
          return;
        }
        this.showLockedMessage();
        e.preventDefault();
        e.stopPropagation();
      });
      this.freeTextContextGuardRegistered = true;
    }

    if (mode === "edit") {
      if (!this.editModeEventsRegistered) {
        await this.registerEditModeEvents();
        this.editModeEventsRegistered = true;
      }
    } else if (!this.viewModeEventsRegistered) {
      this.registerViewModeEvents();
      this.viewModeEventsRegistered = true;
    }
  }

  private handleCanvasClick(event: cytoscape.EventObject): void {
    if (this.currentMode !== "edit") {
      return;
    }
    if (this.labLocked) {
      return;
    }
    const mouseEvent = event.originalEvent as MouseEvent;
    if (mouseEvent.shiftKey && this.isViewportDrawerClabEditorChecked) {
      log.debug("Canvas clicked with Shift key - adding node.");
      const defaultName = (window as any).defaultNode;
      let template: any | undefined;
      if (defaultName) {
        const customNodes = (window as any).customNodes || [];
        template = customNodes.find((n: any) => n.name === defaultName);
      }
      this.addNodeManager.viewportButtonsAddContainerlabNode(this.cy, event, template);
    }
  }

  private handleEditModeEdgeClick(event: cytoscape.EventObject): void {
    if (this.currentMode !== "edit") {
      return;
    }
    if (this.labLocked) {
      this.showLockedMessage();
      return;
    }
    const edge = event.target;
    const originalEvent = event.originalEvent as MouseEvent;
    if (originalEvent.altKey && this.isViewportDrawerClabEditorChecked) {
      log.debug(`Alt+click on edge: deleting edge ${edge.id()}`);
      edge.remove();
    }
  }

  private async registerEditModeEvents(): Promise<void> {
    registerCyEventHandlers({
      cy: this.cy,
      onCanvasClick: (event) => this.handleCanvasClick(event),
      onNodeClick: async (event) => {
        this.viewportPanels!.nodeClicked = true;
        await this.handleEditModeNodeClick(event);
      },
      onEdgeClick: (event) => {
        this.viewportPanels!.edgeClicked = true;
        this.handleEditModeEdgeClick(event);
      }
    });

    const blockContextMenu = (e: cytoscape.EventObject) => {
      if (this.labLocked) {
        this.showLockedMessage();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    this.cy.on("cxttapstart", "*", blockContextMenu);
    this.cy.on("cxttap", "*", blockContextMenu);

    this.edgeCreationManager.registerLifecycleEvents();
    this.keyboardManager.registerEditModeKeyboardEvents();
    this.cy.on("ehcomplete", (_event, sourceNode, targetNode, addedEdge) =>
      this.edgeCreationManager.handleEdgeCreation(sourceNode, targetNode, addedEdge)
    );
  }

  private registerViewModeEvents(): void {
    const cy = this.cy;
    let radialMenuOpen = false;

    cy.on("cxtmenu:open", () => {
      if (this.currentMode !== "view") {
        return;
      }
      radialMenuOpen = true;
    });

    cy.on("cxtmenu:close", () => {
      if (this.currentMode !== "view") {
        return;
      }
      setTimeout(() => {
        radialMenuOpen = false;
      }, 200);
    });

    registerCyEventHandlers({
      cy,
      onCanvasClick: () => {
        if (this.currentMode !== "view") {
          return;
        }
        if (this.suppressViewerCanvasClose) {
          this.suppressViewerCanvasClose = false;
          return;
        }
        if (radialMenuOpen) {
          return;
        }
      }
    });

    this.keyboardManager.registerViewModeKeyboardEvents();
  }

  private async handleEditModeNodeClick(event: cytoscape.EventObject): Promise<void> {
    if (this.currentMode !== "edit") {
      return;
    }
    if (this.labLocked) {
      this.showLockedMessage();
      return;
    }
    const node = event.target;
    log.debug(`Node clicked: ${node.id()}`);
    const originalEvent = event.originalEvent as MouseEvent;
    const extraData = node.data("extraData");
    const isNodeInEditMode = this.currentMode === "edit";

    if (originalEvent.ctrlKey && node.isChild()) {
      log.debug(`Orphaning node: ${node.id()} from parent: ${node.parent().id()}`);
      node.move({ parent: null });
      return;
    }

    if (originalEvent.shiftKey && node.data("topoViewerRole") !== "freeText") {
      log.debug(
        `Shift+click on node: starting edge creation from node: ${extraData?.longname || node.id()}`
      );
      await this.edgeCreationManager.startFromNode(node);
      return;
    }

    if (
      originalEvent.altKey &&
      (isNodeInEditMode ||
        node.data("topoViewerRole") === "group" ||
        node.data("topoViewerRole") === "freeText")
    ) {
      this.handleAltNodeClick(node, extraData);
      return;
    }

    if (node.data("topoViewerRole") === "textbox") {
      return;
    }
  }

  private handleAltNodeClick(node: cytoscape.Singular, extraData: any): void {
    if (node.data("topoViewerRole") === "group") {
      log.debug(`Alt+click on group: deleting group ${node.id()}`);
      this.groupManager?.directGroupRemoval(node.id());
    } else if (node.data("topoViewerRole") === "freeText") {
      log.debug(`Alt+click on freeText: deleting text ${node.id()}`);
      this.freeTextManager?.removeFreeTextAnnotation(node.id());
    } else {
      log.debug(`Alt+click on node: deleting node ${extraData?.longname || node.id()}`);
      node.remove();
    }
  }

  private showNodePropertiesPanel(node: cytoscape.Singular): void {
    const nodeId = node.id();
    const panelManager = (window as any).panelManager;
    if (panelManager) {
      const panelInstance = panelManager.getOrCreatePanelInstance("panel-node", nodeId);
      if (panelInstance) {
        const extraData = node.data("extraData") || {};
        const nodeName = extraData.longname || node.data("name") || nodeId;
        const titleElement = panelInstance.element.querySelector(".panel-title");
        if (titleElement) {
          titleElement.textContent = `Node: ${nodeName}`;
        }

        this.populateNodePanel(node, panelInstance.element);
        panelInstance.show();
        topoViewerState.selectedNode = nodeName;
        topoViewerState.nodeClicked = true;
        return;
      }
    }

    const panelNode = document.getElementById("panel-node");
    if (!panelNode) {
      return;
    }
    panelNode.style.display = "block";
    this.populateNodePanel(node);
    topoViewerState.selectedNode = node.data("extraData")?.longname || node.id();
    topoViewerState.nodeClicked = true;
  }

  private populateNodePanel(node: cytoscape.Singular, panelElement?: HTMLElement): void {
    const extraData = node.data("extraData") || {};
    const entries: Array<[string, string | undefined]> = [
      ["panel-node-name", extraData.longname || node.data("name") || node.id()],
      ["panel-node-kind", extraData.kind],
      ["panel-node-mgmtipv4", extraData.mgmtIpv4Address],
      ["panel-node-mgmtipv6", extraData.mgmtIpv6Address],
      ["panel-node-fqdn", extraData.fqdn],
      ["panel-node-topoviewerrole", node.data("topoViewerRole")],
      ["panel-node-state", extraData.state],
      ["panel-node-image", extraData.image]
    ];

    const context = panelElement || document;
    entries.forEach(([id, value]) => {
      const el =
        (context.querySelector(`#${id}`) as HTMLElement | null) || document.getElementById(id);
      if (el) el.textContent = value || "";
    });
  }

  public detectColorScheme(): "light" | "dark" {
    const bodyClassList = document.body?.classList;
    const darkMode =
      bodyClassList?.contains("vscode-dark") || bodyClassList?.contains("vscode-high-contrast");
    const theme: "light" | "dark" = darkMode ? "dark" : "light";
    this.applyTheme(theme);
    return theme;
  }

  private applyTheme(theme: "light" | "dark"): void {
    const rootElement = document.getElementById("root");
    if (rootElement) {
      rootElement.setAttribute("data-theme", theme);
      log.debug(`Applied Theme: ${theme}`);
    } else {
      log.warn(`'root' element not found; cannot apply theme: ${theme}`);
    }
  }

  public updateSubtitle(newText: string): void {
    const subtitleElement = document.getElementById("ClabSubtitle");
    if (subtitleElement) {
      subtitleElement.textContent = `Topology Editor ::: ${newText}`;
    } else {
      log.warn("Subtitle element not found");
    }
  }

  public viewportButtonsTopologyOverview(): void {
    try {
      const overviewDrawer = document.getElementById("viewport-drawer-topology-overview");
      if (!overviewDrawer) {
        log.warn("Topology overview drawer not found");
        return;
      }

      if (overviewDrawer.style.display === "block") {
        overviewDrawer.style.display = "none";
      } else {
        const viewportDrawer = document.getElementsByClassName("viewport-drawer");
        for (let i = 0; i < viewportDrawer.length; i++) {
          (viewportDrawer[i] as HTMLElement).style.display = "none";
        }
        overviewDrawer.style.display = "block";
      }
    } catch (error) {
      log.error(`Error in topology overview button: ${error}`);
    }
  }

  public showBulkLinkPanel(): void {
    this.bulkLinkManager.showBulkLinkPanel();
  }

  public async bulkCreateLinks(sourceFilterText: string, targetFilterText: string): Promise<void> {
    await this.bulkLinkManager.bulkCreateLinks(sourceFilterText, targetFilterText);
  }

  public dispose(): void {
    this.messageSender.dispose();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const mode = (window as any).topoViewerMode === "viewer" ? "view" : "edit";
  const controller = new TopologyWebviewController("cy", mode);
  void controller.initAsync(mode);
  topoViewerState.editorEngine = controller;
  topoViewerState.cy = controller.cy;
  window.topologyWebviewController = controller;

  const gm = controller.groupManager;
  window.orphaningNode = gm.orphaningNode.bind(gm);
  window.createNewParent = gm.createNewParent.bind(gm);
  window.panelNodeEditorParentToggleDropdown = gm.panelNodeEditorParentToggleDropdown.bind(gm);
  window.nodeParentPropertiesUpdate = gm.nodeParentPropertiesUpdate.bind(gm);
  window.nodeParentPropertiesUpdateClose = gm.nodeParentPropertiesUpdateClose.bind(gm);
  window.nodeParentRemoval = gm.nodeParentRemoval.bind(gm);
  window.viewportButtonsAddGroup = gm.viewportButtonsAddGroup.bind(gm);
  window.showPanelGroupEditor = gm.showGroupEditor.bind(gm);

  window.addEventListener("unload", () => {
    controller.dispose();
  });

  setTimeout(() => {
    if (controller.cy.elements().length > 0) {
      controller.cy.fit(controller.cy.elements(), 50);
      log.debug("Final viewport adjustment completed");
    }
  }, 100);
});
