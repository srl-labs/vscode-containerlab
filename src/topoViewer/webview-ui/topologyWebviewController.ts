// file: topologyWebviewController.ts

import type cytoscape from 'cytoscape';
import { createConfiguredCytoscape, loadExtension } from '../cytoscapeInstanceFactory';

// Import Tailwind CSS and Font Awesome
import './tailwind.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
// Import Leaflet CSS for map tiles
import 'leaflet/dist/leaflet.css';
import 'tippy.js/dist/tippy.css';
import loadCytoStyle from './managerCytoscapeBaseStyles';
import { VscodeMessageSender } from './managerVscodeWebview';
import { fetchAndLoadData, fetchAndLoadDataEnvironment } from './managerCytoscapeFetchAndLoad';
import { ManagerSaveTopo } from './managerSaveTopo';
import { ManagerUndo } from './managerUndo';
import { ManagerAddContainerlabNode } from './managerAddContainerlabNode';
import { ManagerViewportPanels } from './managerViewportPanels';
import { ManagerUnifiedFloatingPanel } from './managerUnifiedFloatingPanel';
import { ManagerFreeText } from './managerFreeText';
import { ManagerNodeEditor } from './managerNodeEditor';
import { ManagerGroupStyle } from './managerGroupStyle';
import { CopyPasteManager } from './managerCopyPaste';
import { ManagerLabSettings } from './managerLabSettings';
import { viewportButtonsCaptureViewportAsSvg } from './uiHandlers';
import type { ManagerGroupManagement } from './managerGroupManagement';
import type { ManagerLayoutAlgo } from './managerLayoutAlgo';
import type { ManagerZoomToFit } from './managerZoomToFit';
import type { ManagerLabelEndpoint } from './managerLabelEndpoint';
import type { ManagerReloadTopo } from './managerReloadTopo';
import { ManagerShortcutDisplay } from './managerShortcutDisplay';
import { layoutAlgoManager as layoutAlgoManagerSingleton, getGroupManager, zoomToFitManager as zoomToFitManagerSingleton, labelEndpointManager as labelEndpointManagerSingleton, getReloadTopoManager } from '../core/managerRegistry';
import { log } from '../logging/logger';
import { perfMark, perfMeasure } from '../utilities/performanceMonitor';
import { registerCyEventHandlers } from './cyEventHandlers';
import { PerformanceMonitor } from '../utilities/performanceMonitor';
import { debounce } from '../utilities/asyncUtils';
import { buildGridGuideOptions } from '../utilities/gridGuide';
import topoViewerState from '../state';
import type { EdgeData } from '../types/topoViewerGraph';
import { FilterUtils } from '../../helpers/filterUtils';
import { isSpecialNodeOrBridge, isSpecialEndpoint } from '../utilities/specialNodes';

// Grid guide options now come from shared builder in utilities/gridGuide




/**
 * TopologyWebviewController is responsible for initializing the Cytoscape instance,
 * managing edge creation, node editing and viewport panels/buttons.
 * Entry point for the topology editor webview; methods are called from vscodeHtmlTemplate.ts.
 */
class TopologyWebviewController {
  public cy!: cytoscape.Core;
  private eh: any;
  private isEdgeHandlerActive: boolean = false;
  private isViewportDrawerClabEditorChecked: boolean = true; // Editor mode flag

  // Reused UI literals to avoid duplicate strings
  public static readonly UI_FILL_COLOR = 'rgba(31, 31, 31, 0.75)';
  public static readonly UI_ACTIVE_FILL_COLOR = 'rgba(66, 88, 255, 1)';
  public static readonly UI_ITEM_COLOR = 'white';
  public static readonly UI_ITEM_TEXT_SHADOW = 'rgba(61, 62, 64, 1)';
  public static readonly UI_OPEN_EVENT = 'cxttap';

  public messageSender!: VscodeMessageSender;
  public saveManager!: ManagerSaveTopo;
  public undoManager!: ManagerUndo;
  public addNodeManager!: ManagerAddContainerlabNode;
  public viewportPanels?: ManagerViewportPanels;
  public unifiedFloatingPanel: ManagerUnifiedFloatingPanel | null = null;
  public nodeEditor?: ManagerNodeEditor;
  public groupManager!: ManagerGroupManagement;
  public groupStyleManager!: ManagerGroupStyle;
  /** Layout manager instance accessible by other components */
  public layoutAlgoManager!: ManagerLayoutAlgo;
  public zoomToFitManager!: ManagerZoomToFit;
  public labelEndpointManager!: ManagerLabelEndpoint;
  public reloadTopoManager!: ManagerReloadTopo;
  public freeTextManager?: ManagerFreeText;
  public copyPasteManager!: CopyPasteManager;
  public captureViewportManager!: { viewportButtonsCaptureViewportAsSvg: () => void };
  public labSettingsManager?: ManagerLabSettings;
  private static readonly CLASS_PANEL_OVERLAY = 'panel-overlay' as const;
  private static readonly CLASS_VIEWPORT_DRAWER = 'viewport-drawer' as const;
  private static readonly STYLE_LINE_COLOR = 'line-color' as const;
  private static readonly KIND_BRIDGE = 'bridge' as const;
  private static readonly KIND_OVS_BRIDGE = 'ovs-bridge' as const;
  private interfaceCounters: Record<string, number> = {};
  // eslint-disable-next-line no-unused-vars
  private keyHandlers: Record<string, (event: KeyboardEvent) => void> = {
    delete: (event) => {
      event.preventDefault();
      this.handleDeleteKeyPress();
    },
    backspace: (event) => {
      event.preventDefault();
      this.handleDeleteKeyPress();
    },
    g: () => {
      this.groupManager.viewportButtonsAddGroup();
    },
    'ctrl+a': (event) => {
      event.preventDefault();
      this.handleSelectAll();
    },
    'ctrl+c': (event) => {
      event.preventDefault();
      this.copyPasteManager.handleCopy();
    },
    'ctrl+v': (event) => {
      if (!this.isViewportDrawerClabEditorChecked) {
        return;
      }
      event.preventDefault();
      this.copyPasteManager.handlePaste();
    },
    'ctrl+x': (event) => {
      if (!this.isViewportDrawerClabEditorChecked) {
        return;
      }
      event.preventDefault();
      this.handleCutKeyPress();
    },
    'ctrl+d': (event) => {
      if (!this.isViewportDrawerClabEditorChecked) {
        return;
      }
      event.preventDefault();
      this.copyPasteManager.handleDuplicate();
    }
  };
  public async initAsync(mode: 'edit' | 'view'): Promise<void> {
    perfMark('cytoscape_style_start');
    await loadCytoStyle(this.cy);
    perfMeasure('cytoscape_style', 'cytoscape_style_start');
    perfMark('fetch_data_start');
    await fetchAndLoadData(this.cy, this.messageSender).then(() => {
      perfMeasure('fetch_data', 'fetch_data_start');
      perfMeasure('topoViewer_init_total', 'topoViewer_init_start');

      this.messageSender.sendMessageToVscodeEndpointPost('performance-metrics', {
        metrics: PerformanceMonitor.getMeasures()
      });

      if (this.cy.elements().length > 0 && typeof requestAnimationFrame !== 'undefined') {
        // eslint-disable-next-line no-undef
        requestAnimationFrame(() => {
          this.cy.animate({
            fit: { eles: this.cy.elements(), padding: 50 },
            duration: 150,
            easing: 'ease-out'
          });
        });
      }
    });

    void (async () => {
      try {
        const result = await fetchAndLoadDataEnvironment(["clab-name", "clab-prefix"]);
        const labName = result["clab-name"] || "Unknown";
        this.updateSubtitle(labName);
        topoViewerState.labName = labName;
        if (typeof result["clab-prefix"] === 'string') {
          topoViewerState.prefixName = result["clab-prefix"] as string;
        }
      } catch (error) {
        log.error(`Error loading environment data: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();

    this.registerEvents(mode);
    if (mode === 'edit') {
      setTimeout(() => this.initializeEdgehandles(), 50);
    }
    setTimeout(() => this.initializeContextMenu(mode), 100);

    setTimeout(() => {
      this.groupStyleManager?.loadGroupStyles().catch((error) => {
        log.error(`Failed to load group style annotations: ${error}`);
      });
    }, 500);
  }



  // Add automatic save on change
  private setupAutoSave(): void {
    // Debounced save function
    const autoSave = debounce(async () => {
      if (this.isEdgeHandlerActive) {
        return;
      }
      const suppressNotification = true;
      await this.saveManager.saveTopo(this.cy, suppressNotification);
    }, 500); // Wait 500ms after last change before saving

    // Listen for topology changes - but skip free text nodes as they handle their own saves
    this.cy.on('add remove data', (event) => {
      const target = event.target;
      // Skip autosave for free text nodes - they save themselves
      if (target.isNode() && target.data('topoViewerRole') === 'freeText') {
        return;
      }
      autoSave();
    });

    this.cy.on('position', (event) => {
      const target = event.target;
      // Only process node position changes, not edges
      if (!target.isNode()) {
        return;
      }
      // Skip position events for free text nodes - they handle their own saves
      if (target.data('topoViewerRole') === 'freeText') {
        return;
      }
      // Avoid autosave while a node is actively being dragged
      if (!target.grabbed()) {
        autoSave();
      }
    });

    this.cy.on('dragfree', 'node', (event) => {
      const node = event.target;
      // Skip dragfree for free text nodes - they handle their own saves
      if (node.data('topoViewerRole') === 'freeText') {
        return;
      }
      autoSave();
    });
  }

  // Add automatic save for view mode (only saves annotations.json)
  private setupAutoSaveViewMode(): void {
    // Debounced save function for view mode
    const autoSaveViewMode = debounce(async () => {
      const suppressNotification = true;
      await this.saveManager.saveTopo(this.cy, suppressNotification);
    }, 500); // Wait 500ms after last change before saving

    // Listen for position changes only - view mode doesn't add/remove nodes
    this.cy.on('position', (event) => {
      const target = event.target;
      // Only process node position changes, not edges
      if (!target.isNode()) {
        return;
      }
      // Skip position events for free text nodes - they handle their own saves
      if (target.data('topoViewerRole') === 'freeText') {
        return;
      }
      // Avoid autosave while a node is actively being dragged
      if (!target.grabbed()) {
        autoSaveViewMode();
      }
    });

    this.cy.on('dragfree', 'node', (event) => {
      const node = event.target;
      // Skip dragfree for free text nodes - they handle their own saves
      if (node.data('topoViewerRole') === 'freeText') {
        return;
      }
      autoSaveViewMode();
    });
  }

  private registerCustomZoom(): void {
    this.cy.userZoomingEnabled(false);
    const container = this.cy.container();
    container?.addEventListener('wheel', this.handleCustomWheel, { passive: false });
  }

  private handleCustomWheel = (event: WheelEvent): void => {
    event.preventDefault();
    let step = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      step *= 100;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      step *= window.innerHeight;
    }
    const isTrackpad = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(event.deltaY) < 50;
    const sensitivity = isTrackpad ? 0.002 : 0.0002;
    const factor = Math.pow(10, -step * sensitivity);
    const newZoom = this.cy.zoom() * factor;
    this.cy.zoom({
      level: newZoom,
      renderedPosition: { x: event.offsetX, y: event.offsetY },
    });
  };

  /**
   * Creates an instance of TopologyWebviewController.
   * @param containerId - The ID of the container element for Cytoscape.
   * @throws Will throw an error if the container element is not found.
   */
  constructor(containerId: string, mode: 'edit' | 'view' = 'edit') {
    perfMark('topoViewer_init_start');
    const container = this.getContainer(containerId);
    this.messageSender = new VscodeMessageSender();
    const theme = this.detectColorScheme();
    this.initializeCytoscape(container, theme);
    this.initializeManagers(mode);
  }

  private getContainer(containerId: string): HTMLElement {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error("Cytoscape container element not found");
    }
    return container;
  }

  private initializeCytoscape(container: HTMLElement, theme: string): void {
    perfMark('cytoscape_create_start');
    this.cy = createConfiguredCytoscape(container);
    perfMeasure('cytoscape_create', 'cytoscape_create_start');
    this.cy.viewport({
      zoom: 1,
      pan: { x: container.clientWidth / 2, y: container.clientHeight / 2 },
    });
    const cyContainer = document.getElementById('cy') as HTMLDivElement | null;
    if (cyContainer) {
      cyContainer.tabIndex = 0;
      cyContainer.addEventListener('mousedown', () => {
        cyContainer.focus();
      });
    }
    this.registerCustomZoom();
    this.cy.on('tap', (event) => {
      log.debug(`Cytoscape event: ${event.type}`);
    });
    const gridColor = theme === 'dark' ? '#666666' : '#cccccc';
    (this.cy as any).gridGuide(buildGridGuideOptions(theme as any, { gridSpacing: 14, gridColor }));
  }

  private initializeManagers(mode: 'edit' | 'view'): void {
    this.setupManagers(mode);
    this.registerDoubleClickHandlers();
    this.exposeWindowFunctions();
    this.registerMessageListener();
    document.getElementById('cy')?.focus();
  }

  private setupManagers(mode: 'edit' | 'view'): void {
    // eslint-disable-next-line sonarjs/constructor-for-side-effects
    new ManagerShortcutDisplay();
    this.saveManager = new ManagerSaveTopo(this.messageSender);
    this.undoManager = new ManagerUndo(this.messageSender);
    this.addNodeManager = new ManagerAddContainerlabNode();
    this.labSettingsManager = new ManagerLabSettings(this.messageSender);
    this.labSettingsManager.init();
    this.freeTextManager = new ManagerFreeText(this.cy, this.messageSender);
    this.groupStyleManager = new ManagerGroupStyle(this.cy, this.messageSender, this.freeTextManager);
    this.freeTextManager.setGroupStyleManager(this.groupStyleManager);
    this.copyPasteManager = new CopyPasteManager(this.cy, this.messageSender, this.groupStyleManager, this.freeTextManager);
    if (mode === 'edit') {
      this.viewportPanels = new ManagerViewportPanels(this.saveManager, this.cy);
      (window as any).viewportPanels = this.viewportPanels;
      this.nodeEditor = new ManagerNodeEditor(this.cy, this.saveManager);
    }
    this.unifiedFloatingPanel = new ManagerUnifiedFloatingPanel(this.cy, this.messageSender, this.addNodeManager, this.nodeEditor);
    this.groupManager = getGroupManager(this.cy, this.groupStyleManager, mode);
    this.groupManager.initializeWheelSelection();
    this.groupManager.initializeGroupManagement();
    this.layoutAlgoManager = layoutAlgoManagerSingleton;
    this.zoomToFitManager = zoomToFitManagerSingleton;
    this.labelEndpointManager = labelEndpointManagerSingleton;
    this.reloadTopoManager = getReloadTopoManager(this.messageSender);
    this.isViewportDrawerClabEditorChecked = mode === 'edit';
    if (mode === 'edit') {
      this.setupAutoSave();
    } else {
      this.setupAutoSaveViewMode();
    }
    this.captureViewportManager = {
      viewportButtonsCaptureViewportAsSvg: () => {
        viewportButtonsCaptureViewportAsSvg();
      },
    };
  }

  private registerDoubleClickHandlers(): void {
    this.cy.on('dblclick', 'node[topoViewerRole != "freeText"]', (event) => {
      const node = event.target;
      if (node.data('topoViewerRole') === 'group') {
        this.groupManager.showGroupEditor(node);
      } else if (node.data('topoViewerRole') === 'cloud') {
        this.viewportPanels?.panelNetworkEditor(node);
      } else if (this.nodeEditor) {
        void this.nodeEditor.open(node);
      } else {
        this.viewportPanels?.panelNodeEditor(node);
      }
    });
    this.cy.on('dblclick', 'edge', (event) => {
      const edge = event.target;
      this.viewportPanels?.panelEdgeEditor(edge);
    });
  }

  private exposeWindowFunctions(): void {
    window.viewportButtonsLayoutAlgo = this.layoutAlgoManager.viewportButtonsLayoutAlgo.bind(this.layoutAlgoManager);
    window.layoutAlgoChange = this.layoutAlgoManager.layoutAlgoChange.bind(this.layoutAlgoManager);
    window.viewportDrawerLayoutGeoMap = this.layoutAlgoManager.viewportDrawerLayoutGeoMap.bind(this.layoutAlgoManager);
    window.viewportDrawerDisableGeoMap = this.layoutAlgoManager.viewportDrawerDisableGeoMap.bind(this.layoutAlgoManager);
    window.viewportDrawerLayoutForceDirected = this.layoutAlgoManager.viewportDrawerLayoutForceDirected.bind(this.layoutAlgoManager);
    window.viewportDrawerLayoutForceDirectedRadial = this.layoutAlgoManager.viewportDrawerLayoutForceDirectedRadial.bind(this.layoutAlgoManager);
    window.viewportDrawerLayoutVertical = this.layoutAlgoManager.viewportDrawerLayoutVertical.bind(this.layoutAlgoManager);
    window.viewportDrawerLayoutHorizontal = this.layoutAlgoManager.viewportDrawerLayoutHorizontal.bind(this.layoutAlgoManager);
    window.viewportDrawerPreset = this.layoutAlgoManager.viewportDrawerPreset.bind(this.layoutAlgoManager);
    window.viewportButtonsGeoMapPan = this.layoutAlgoManager.viewportButtonsGeoMapPan.bind(this.layoutAlgoManager);
    window.viewportButtonsGeoMapEdit = this.layoutAlgoManager.viewportButtonsGeoMapEdit.bind(this.layoutAlgoManager);
    window.viewportButtonsTopologyOverview = this.viewportButtonsTopologyOverview.bind(this);
    window.viewportButtonsZoomToFit = () => this.zoomToFitManager.viewportButtonsZoomToFit(this.cy);
    window.viewportButtonsLabelEndpoint = () => this.labelEndpointManager.viewportButtonsLabelEndpoint(this.cy);
    window.viewportButtonsCaptureViewportAsSvg = () => this.captureViewportManager.viewportButtonsCaptureViewportAsSvg();
    window.viewportButtonsReloadTopo = () => this.reloadTopoManager.viewportButtonsReloadTopo(this.cy);
    window.viewportButtonsUndo = () => this.undoManager.viewportButtonsUndo();
  }

  private registerMessageListener(): void {
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const msg = event.data as any;
      if (!msg?.type) {
        return;
      }
      // eslint-disable-next-line no-unused-vars
      const handlers: Record<string, (data: any) => void> = {
        'yaml-saved': () => fetchAndLoadData(this.cy, this.messageSender),
        'updateTopology': (data) => this.updateTopology(data),
        'copiedElements': (data) => this.handleCopiedElements(data)
      };
      const handler = handlers[msg.type];
      if (handler) {
        handler(msg.data);
      }
    });
  }

  private updateTopology(data: any): void {
    try {
      const elements = data as any[];
      if (Array.isArray(elements)) {
        elements.forEach((el) => {
          const id = el?.data?.id;
          if (!id) {
            return;
          }
          const existing = this.cy.getElementById(id);
          if (existing && existing.length > 0) {
            existing.data(el.data);
            if (typeof el.classes === 'string') {
              existing.classes(el.classes);
            }
          } else {
            this.cy.add(el);
          }
        });
        loadCytoStyle(this.cy);
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

  /**
   * Initializes the edgehandles extension with defined options.
   * Enables the edgehandles instance for creating edges.
   * @private
   */
  private async initializeEdgehandles(): Promise<void> {
    // Load edgehandles extension lazily
    await loadExtension('edgehandles');
    const edgehandlesOptions = {
      hoverDelay: 50,
      snap: false,
      snapThreshold: 10,
      snapFrequency: 150,
      noEdgeEventsInDraw: false,
      disableBrowserGestures: false,
      handleNodes: 'node[topoViewerRole != "freeText"]',
      canConnect: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular): boolean => {
        const sourceRole = sourceNode.data('topoViewerRole');
        const targetRole = targetNode.data('topoViewerRole');
        return (
          sourceRole !== 'freeText' &&
          targetRole !== 'freeText' &&
          !sourceNode.same(targetNode) &&
          !sourceNode.isParent() &&
          !targetNode.isParent() &&
          targetRole !== 'group'
        );
      },
      edgeParams: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular): EdgeData => {
        const ifaceMap = window.ifacePatternMapping || {};
        const srcKind = sourceNode.data('extraData')?.kind || 'default';
        const dstKind = targetNode.data('extraData')?.kind || 'default';
        const srcPattern: string = ifaceMap[srcKind] || 'eth{n}';
        const dstPattern: string = ifaceMap[dstKind] || 'eth{n}';

        const srcCount = (this.interfaceCounters[sourceNode.id()] ?? 0) + 1;
        this.interfaceCounters[sourceNode.id()] = srcCount;
        const dstCount = (this.interfaceCounters[targetNode.id()] ?? 0) + 1;
        this.interfaceCounters[targetNode.id()] = dstCount;

        return {
          id: `${sourceNode.id()}-${targetNode.id()}`,
          source: sourceNode.id(),
          target: targetNode.id(),
          sourceEndpoint: srcPattern.replace('{n}', srcCount.toString()),
          targetEndpoint: dstPattern.replace('{n}', dstCount.toString()),
        };
      },
    };

    this.eh = (this.cy as any).edgehandles(edgehandlesOptions);
    this.eh.enable();
    this.isEdgeHandlerActive = false;
  }


  /**
   * Initializes the circular context menus.
   */
  private async initializeContextMenu(mode: 'edit' | 'view' = 'edit'): Promise<void> {
    await loadExtension('cxtmenu');
    this.initializeFreeTextContextMenu();
    if (mode === 'edit') {
      this.initializeNodeContextMenu();
      this.initializeGroupContextMenu();
      this.initializeEdgeContextMenu();
    } else {
      this.initializeViewerMenus();
    }
  }

  private initializeFreeTextContextMenu(): void {
    this.cy.cxtmenu({
      selector: 'node[topoViewerRole = "freeText"]',
      commands: [
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-pen-to-square" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Edit Text</span></div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isNode()) {
              return;
            }
            this.freeTextManager?.editFreeText(ele.id());
          },
        },
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-trash-alt" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Remove Text</span></div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isNode()) {
              return;
            }
            this.freeTextManager?.removeFreeTextAnnotation(ele.id());
          },
        },
      ],
      menuRadius: 60,
      fillColor: TopologyWebviewController.UI_FILL_COLOR,
      activeFillColor: TopologyWebviewController.UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 4,
      adaptativeNodeSpotlightRadius: false,
      minSpotlightRadius: 20,
      maxSpotlightRadius: 20,
      openMenuEvents: TopologyWebviewController.UI_OPEN_EVENT,
      itemColor: TopologyWebviewController.UI_ITEM_COLOR,
      itemTextShadowColor: TopologyWebviewController.UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10,
    });
  }

  private initializeNodeContextMenu(): void {
    this.cy.cxtmenu({
      selector: 'node[topoViewerRole != "group"][topoViewerRole != "freeText"]',
      commands: (ele: cytoscape.Singular) => this.buildNodeMenuCommands(ele),
      menuRadius: 110,
      fillColor: TopologyWebviewController.UI_FILL_COLOR,
      activeFillColor: TopologyWebviewController.UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 20,
      adaptativeNodeSpotlightRadius: true,
      minSpotlightRadius: 24,
      maxSpotlightRadius: 38,
      openMenuEvents: TopologyWebviewController.UI_OPEN_EVENT,
      itemColor: TopologyWebviewController.UI_ITEM_COLOR,
      itemTextShadowColor: TopologyWebviewController.UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10,
    });
  }

  private buildNodeMenuCommands(ele: cytoscape.Singular): any[] {
    const isNetwork = this.isNetworkNode(ele.id());
    const commands = [
      this.createEditCommand(isNetwork),
      this.createDeleteCommand(),
      this.createAddLinkCommand()
    ];
    if (ele.isNode() && ele.parent().nonempty()) {
      commands.push(this.createReleaseFromGroupCommand());
    }
    return commands;
  }

  private createNodeMenuItem(
    icon: string,
    label: string,
    // eslint-disable-next-line no-unused-vars
    action: (node: cytoscape.NodeSingular) => void | Promise<void>
  ): any {
    return {
      content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="${icon}" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>${label}</span></div>`,
      select: (node: cytoscape.Singular) => {
        if (!node.isNode()) {
          return;
        }
        return action(node as cytoscape.NodeSingular);
      }
    };
  }

  private createEditCommand(isNetwork: boolean): any {
    const label = isNetwork ? 'Edit Network' : 'Edit Node';
    return this.createNodeMenuItem('fas fa-pen-to-square', label, (node) => {
      this.viewportPanels?.setNodeClicked(true);
      if (isNetwork) {
        this.viewportPanels?.panelNetworkEditor(node);
      } else if (this.nodeEditor) {
        void this.nodeEditor.open(node);
      }
    });
  }

  private createDeleteCommand(): any {
    return this.createNodeMenuItem('fas fa-trash-alt', 'Delete Node', (node) => {
      const parent = node.parent();
      node.remove();
      if (parent.nonempty() && parent.children().length === 0) {
        parent.remove();
      }
    });
  }

  private createAddLinkCommand(): any {
    return this.createNodeMenuItem('fas fa-link', 'Add Link', (node) => {
      this.isEdgeHandlerActive = true;
      this.eh.start(node);
    });
  }

  private createReleaseFromGroupCommand(): any {
    return this.createNodeMenuItem('fas fa-users-slash', 'Release from Group', (node) => {
      setTimeout(() => {
        this.groupManager.orphaningNode(node);
      }, 50);
    });
  }

  private getNodeName(node: cytoscape.NodeSingular): string {
    return node.data('extraData')?.longname || node.data('name') || node.id();
  }

  private initializeGroupContextMenu(): void {
    this.cy.cxtmenu({
      selector: 'node:parent, node[topoViewerRole = "group"]',
      commands: [
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-pen-to-square" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Edit Group</span></div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isNode()) {
              return;
            }
            this.viewportPanels?.setNodeClicked(true);
            if (ele.data("topoViewerRole") == "group") {
              this.groupManager.showGroupEditor(ele.id());
            }
          },
        },
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-trash-alt" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Delete Group</span></div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isNode()) {
              return;
            }
            let groupId: string;
            if (ele.data("topoViewerRole") == "group" || ele.isParent()) {
              groupId = ele.id();
            } else {
              return;
            }
            this.groupManager.directGroupRemoval(groupId);
          },
        },
      ],
      menuRadius: 110,
      fillColor: TopologyWebviewController.UI_FILL_COLOR,
      activeFillColor: TopologyWebviewController.UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 0,
      adaptativeNodeSpotlightRadius: true,
      minSpotlightRadius: 0,
      maxSpotlightRadius: 0,
      openMenuEvents: TopologyWebviewController.UI_OPEN_EVENT,
      itemColor: TopologyWebviewController.UI_ITEM_COLOR,
      itemTextShadowColor: TopologyWebviewController.UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10,
    });
  }

  private initializeEdgeContextMenu(): void {
    this.cy.cxtmenu({
      selector: 'edge',
      commands: () => this.buildEditEdgeMenuCommands(),
      menuRadius: 80,
      fillColor: TopologyWebviewController.UI_FILL_COLOR,
      activeFillColor: TopologyWebviewController.UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 0,
      adaptativeNodeSpotlightRadius: true,
      minSpotlightRadius: 0,
      maxSpotlightRadius: 0,
      openMenuEvents: TopologyWebviewController.UI_OPEN_EVENT,
      itemColor: TopologyWebviewController.UI_ITEM_COLOR,
      itemTextShadowColor: TopologyWebviewController.UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10,
    });
  }

  private buildEditEdgeMenuCommands(): any[] {
    const commands: any[] = [];
    // Edit link
    commands.push({
      content: `<div style="display:flex;flex-direction:column;align-items:center;line-height:1;"><i class="fas fa-pen" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Edit Link</span></div>`,
      select: (edge: cytoscape.Singular) => {
        if (!edge.isEdge()) return;
        this.viewportPanels?.setEdgeClicked(true);
        this.viewportPanels?.panelEdgeEditor(edge);
      },
    });

    // Delete link
    commands.push({
      content: `<div style="display:flex;flex-direction:column;align-items:center;line-height:1;"><i class="fas fa-trash-alt" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Delete Link</span></div>`,
      select: (edge: cytoscape.Singular) => {
        edge.remove();
      },
    });

    return commands;
  }

  private initializeViewerMenus(): void {
    this.cy.cxtmenu({
      selector: 'node[topoViewerRole != "group"][topoViewerRole != "freeText"]',
      commands: (ele: cytoscape.Singular) => this.buildViewerNodeCommands(ele),
      menuRadius: 110,
      fillColor: TopologyWebviewController.UI_FILL_COLOR,
      activeFillColor: TopologyWebviewController.UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 20,
      adaptativeNodeSpotlightRadius: true,
      minSpotlightRadius: 24,
      maxSpotlightRadius: 38,
      openMenuEvents: TopologyWebviewController.UI_OPEN_EVENT,
      itemColor: TopologyWebviewController.UI_ITEM_COLOR,
      itemTextShadowColor: TopologyWebviewController.UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10,
    });

    this.cy.cxtmenu({
      selector: 'edge',
      commands: (ele: cytoscape.Singular) => this.buildViewerEdgeMenuCommands(ele),
      menuRadius: 110,
      fillColor: TopologyWebviewController.UI_FILL_COLOR,
      activeFillColor: TopologyWebviewController.UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 0,
      adaptativeNodeSpotlightRadius: true,
      minSpotlightRadius: 0,
      maxSpotlightRadius: 0,
      openMenuEvents: TopologyWebviewController.UI_OPEN_EVENT,
      itemColor: TopologyWebviewController.UI_ITEM_COLOR,
      itemTextShadowColor: TopologyWebviewController.UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10,
    });

    this.cy.cxtmenu({
      selector: 'node:parent, node[topoViewerRole = "group"]',
      commands: [
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-pen-to-square" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Edit Group</span></div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isNode()) {
              return;
            }
            setTimeout(() => {
              let groupId: string;
              if (ele.data("topoViewerRole") == "group" || ele.isParent()) {
                groupId = ele.id();
              } else {
                return;
              }
              this.groupManager.showGroupEditor(groupId);
            }, 50);
          },
        },
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><i class="fas fa-trash-alt" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Delete Group</span></div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isNode()) {
              return;
            }
            setTimeout(() => {
              let groupId: string;
              if (ele.data("topoViewerRole") == "group" || ele.isParent()) {
                groupId = ele.id();
              } else {
                return;
              }
              this.groupManager.directGroupRemoval(groupId);
            }, 50);
          },
        },
      ],
      menuRadius: 80,
      fillColor: TopologyWebviewController.UI_FILL_COLOR,
      activeFillColor: TopologyWebviewController.UI_ACTIVE_FILL_COLOR,
      activePadding: 5,
      indicatorSize: 0,
      separatorWidth: 3,
      spotlightPadding: 0,
      adaptativeNodeSpotlightRadius: true,
      minSpotlightRadius: 0,
      maxSpotlightRadius: 0,
      openMenuEvents: TopologyWebviewController.UI_OPEN_EVENT,
      itemColor: TopologyWebviewController.UI_ITEM_COLOR,
      itemTextShadowColor: TopologyWebviewController.UI_ITEM_TEXT_SHADOW,
      zIndex: 9999,
      atMouse: false,
      outsideMenuCancel: 10,
    });
  }

  private buildViewerNodeCommands(ele: cytoscape.Singular): any[] {
    if (this.isNetworkNode(ele.id())) {
      return [];
    }
    const commands = [
      this.createNodeMenuItem('fas fa-terminal', 'SSH', async (node) => {
        const nodeName = this.getNodeName(node);
        await this.messageSender.sendMessageToVscodeEndpointPost('clab-node-connect-ssh', nodeName);
      }),
      this.createNodeMenuItem('fas fa-cube', 'Shell', async (node) => {
        const nodeName = this.getNodeName(node);
        await this.messageSender.sendMessageToVscodeEndpointPost('clab-node-attach-shell', nodeName);
      }),
      this.createNodeMenuItem('fas fa-file-alt', 'Logs', async (node) => {
        const nodeName = this.getNodeName(node);
        await this.messageSender.sendMessageToVscodeEndpointPost('clab-node-view-logs', nodeName);
      }),
      this.createNodeMenuItem('fas fa-info-circle', 'Properties', (node) => {
        setTimeout(() => this.showNodePropertiesPanel(node as unknown as cytoscape.Singular), 50);
      })
    ];
    if (ele.isNode() && ele.parent().nonempty()) {
      commands.push(
        this.createNodeMenuItem('fas fa-users-slash', 'Release from Group', (node) => {
          setTimeout(() => {
            this.groupManager.orphaningNode(node);
          }, 50);
        })
      );
    }
    return commands;
  }

  private buildViewerEdgeMenuCommands(ele: cytoscape.Singular): any[] {
    const commands = [
      ...this.buildEdgeCaptureCommands(ele),
      {
        content: `<div style="display:flex;flex-direction:column;align-items:center;line-height:1;"><i class="fas fa-info-circle" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Properties</span></div>`,
        select: (edge: cytoscape.Singular) => {
          if (!edge.isEdge()) {
            return;
          }
          setTimeout(() => this.showLinkPropertiesPanel(edge), 50);
        },
      },
    ];
    if (ele.data('editor') === 'true') {
      commands.push({
        content: `<div style="display:flex;flex-direction:column;align-items:center;line-height:1;"><i class="fas fa-trash-alt" style="font-size:1.5em;"></i><div style="height:0.5em;"></div><span>Delete Link</span></div>`,
        select: (edge: cytoscape.Singular) => {
          edge.remove();
        },
      });
    }
    return commands;
  }

  private buildEdgeCaptureCommands(ele: cytoscape.Singular): any[] {
    if (!ele.isEdge()) return [];

    const { srcNode, srcIf, dstNode, dstIf } = this.computeEdgeCaptureEndpoints(ele);
    const items: any[] = [];
    const imagesUrl = this.getImagesUrl();

    if (srcNode && srcIf) {
      items.push({
        content: this.buildCaptureMenuContent(imagesUrl, srcNode, srcIf),
        select: this.captureInterface.bind(this, srcNode, srcIf),
      });
    }
    if (dstNode && dstIf) {
      items.push({
        content: this.buildCaptureMenuContent(imagesUrl, dstNode, dstIf),
        select: this.captureInterface.bind(this, dstNode, dstIf),
      });
    }

    return items;
  }

  private getImagesUrl(): string {
    return (window as any).imagesUrl || '';
  }

  private buildCaptureMenuContent(imagesUrl: string, name: string, endpoint: string): string {
    return `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <img src="${imagesUrl}/wireshark_bold.svg" style="width:1.4em; height:1.4em; filter: brightness(0) invert(1);" />
                          <div style="height:0.3em;"></div>
                          <span style="font-size:0.9em;">${name} - ${endpoint}</span>
                        </div>`;
  }

  private computeEdgeCaptureEndpoints(ele: cytoscape.Singular): { srcNode: string; srcIf: string; dstNode: string; dstIf: string } {
    const data = ele.data();
    const extra = data.extraData || {};
    const srcNode: string = extra.clabSourceLongName || data.source || '';
    const dstNode: string = extra.clabTargetLongName || data.target || '';
    const srcIf: string = data.sourceEndpoint || '';
    const dstIf: string = data.targetEndpoint || '';
    return { srcNode, srcIf, dstNode, dstIf };
  }

  private async captureInterface(nodeName: string, interfaceName: string): Promise<void> {
    await this.messageSender.sendMessageToVscodeEndpointPost('clab-interface-capture', {
      nodeName,
      interfaceName,
    });
  }



  /**
   * Registers event handlers for Cytoscape elements such as canvas, nodes, and edges.
   * @private
   */
  private async registerEvents(mode: 'edit' | 'view'): Promise<void> {
    if (mode === 'edit') {
      await this.registerEditModeEvents();
    } else {
      this.registerViewModeEvents();
    }
  }

  private handleCanvasClick(event: cytoscape.EventObject): void {
    const mouseEvent = event.originalEvent as MouseEvent;
    if (mouseEvent.shiftKey && this.isViewportDrawerClabEditorChecked) {
      log.debug('Canvas clicked with Shift key - adding node.');
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
    const edge = event.target;
    const originalEvent = event.originalEvent as MouseEvent;
    if (originalEvent.altKey && this.isViewportDrawerClabEditorChecked) {
      log.debug(`Alt+click on edge: deleting edge ${edge.id()}`);
      edge.remove();
    }
  }

  private registerEdgehandlesLifecycleEvents(): void {
    this.cy.on('ehstart', () => {
      this.isEdgeHandlerActive = true;
    });
    this.cy.on('ehstop ehcancel', () => {
      this.isEdgeHandlerActive = false;
    });
  }

  private async registerEditModeEvents(): Promise<void> {
    registerCyEventHandlers({
      cy: this.cy,
      onCanvasClick: (event) => this.handleCanvasClick(event),
      onNodeClick: async (event) => {
        this.viewportPanels!.nodeClicked = true; // prevent panels from closing
        await this.handleEditModeNodeClick(event);
      },
      onEdgeClick: (event) => {
        this.viewportPanels!.edgeClicked = true; // prevent panels from closing
        this.handleEditModeEdgeClick(event);
      }
    });

    this.registerEdgehandlesLifecycleEvents();
    document.addEventListener('keydown', (event) => this.handleKeyDown(event));
    this.cy.on('ehcomplete', (_event, sourceNode, targetNode, addedEdge) =>
      this.handleEdgeCreation(sourceNode, targetNode, addedEdge)
    );
  }

  private registerViewModeEvents(): void {
    const cy = this.cy;
    let radialMenuOpen = false;

    cy.on('cxtmenu:open', () => {
      radialMenuOpen = true;
    });

    cy.on('cxtmenu:close', () => {
      setTimeout(() => {
        radialMenuOpen = false;
      }, 200);
    });

    registerCyEventHandlers({
      cy,
      onCanvasClick: () => {
        if (radialMenuOpen) {
          return;
        }
        this.closePanelsAndResetState();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (!this.shouldHandleKeyboardEvent(event)) {
        return;
      }
      if (event.ctrlKey && event.key === 'a') {
        event.preventDefault();
        this.handleSelectAll();
      }
    });
  }

  private closePanelsAndResetState(): void {
    const panelOverlays = document.getElementsByClassName(TopologyWebviewController.CLASS_PANEL_OVERLAY);
    for (let i = 0; i < panelOverlays.length; i++) {
      (panelOverlays[i] as HTMLElement).style.display = 'none';
    }
    const viewportDrawer = document.getElementsByClassName(TopologyWebviewController.CLASS_VIEWPORT_DRAWER);
    for (let i = 0; i < viewportDrawer.length; i++) {
      (viewportDrawer[i] as HTMLElement).style.display = 'none';
    }
    topoViewerState.nodeClicked = false;
    topoViewerState.edgeClicked = false;
    this.cy.edges().removeStyle(TopologyWebviewController.STYLE_LINE_COLOR);
    topoViewerState.selectedEdge = null;
  }


  private async handleEditModeNodeClick(event: cytoscape.EventObject): Promise<void> {
    const node = event.target;
    log.debug(`Node clicked: ${node.id()}`);
    const originalEvent = event.originalEvent as MouseEvent;
    const extraData = node.data('extraData');
    const isNodeInEditMode = node.data('editor') === 'true';

    if (originalEvent.ctrlKey && node.isChild()) {
      log.debug(`Orphaning node: ${node.id()} from parent: ${node.parent().id()}`);
      node.move({ parent: null });
      return;
    }

    if (originalEvent.shiftKey && node.data('topoViewerRole') !== 'freeText') {
      log.debug(`Shift+click on node: starting edge creation from node: ${extraData?.longname || node.id()}`);
      this.isEdgeHandlerActive = true;
      this.eh.start(node);
      return;
    }

    if (
      originalEvent.altKey &&
      (isNodeInEditMode || node.data('topoViewerRole') === 'group' || node.data('topoViewerRole') === 'freeText')
    ) {
      this.handleAltNodeClick(node, extraData);
      return;
    }

    if (node.data('topoViewerRole') === 'textbox') {
      return;
    }
  }

  private handleAltNodeClick(node: cytoscape.Singular, extraData: any): void {
    if (node.data('topoViewerRole') === 'group') {
      log.debug(`Alt+click on group: deleting group ${node.id()}`);
      this.groupManager?.directGroupRemoval(node.id());
    } else if (node.data('topoViewerRole') === 'freeText') {
      log.debug(`Alt+click on freeText: deleting text ${node.id()}`);
      this.freeTextManager?.removeFreeTextAnnotation(node.id());
    } else {
      log.debug(`Alt+click on node: deleting node ${extraData?.longname || node.id()}`);
      node.remove();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.shouldHandleKeyboardEvent(event)) {
      return;
    }
    const key = event.key.toLowerCase();
    const combo = `${event.ctrlKey ? 'ctrl+' : ''}${key}`;
    const handler = this.keyHandlers[combo] || this.keyHandlers[key];
    if (handler) {
      handler(event);
    }
  }

  private showNodePropertiesPanel(node: cytoscape.Singular): void {
    const panelOverlays = document.getElementsByClassName(TopologyWebviewController.CLASS_PANEL_OVERLAY);
    Array.from(panelOverlays).forEach(panel => (panel as HTMLElement).style.display = 'none');
    const panelNode = document.getElementById('panel-node');
    if (!panelNode) {
      return;
    }
    panelNode.style.display = 'block';
    const extraData = node.data('extraData') || {};
    const entries: Array<[string, string | undefined]> = [
      ['panel-node-name', extraData.longname || node.data('name') || node.id()],
      ['panel-node-kind', extraData.kind],
      ['panel-node-mgmtipv4', extraData.mgmtIpv4Address],
      ['panel-node-mgmtipv6', extraData.mgmtIpv6Address],
      ['panel-node-fqdn', extraData.fqdn],
      ['panel-node-topoviewerrole', node.data('topoViewerRole')],
      ['panel-node-state', extraData.state],
      ['panel-node-image', extraData.image]
    ];
    entries.forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value || '';
    });
    topoViewerState.selectedNode = extraData.longname || node.id();
    topoViewerState.nodeClicked = true;
  }

  private showLinkPropertiesPanel(ele: cytoscape.Singular): void {
    this.hideAllPanels();
    this.highlightLink(ele);
    const panelLink = document.getElementById('panel-link');
    if (!panelLink) {
      return;
    }
    panelLink.style.display = 'block';
    this.populateLinkPanel(ele);
    topoViewerState.selectedEdge = ele.id();
    topoViewerState.edgeClicked = true;
  }

  private hideAllPanels(): void {
    const panelOverlays = document.getElementsByClassName(TopologyWebviewController.CLASS_PANEL_OVERLAY);
    Array.from(panelOverlays).forEach(panel => (panel as HTMLElement).style.display = 'none');
  }

  private highlightLink(ele: cytoscape.Singular): void {
    this.cy.edges().removeStyle(TopologyWebviewController.STYLE_LINE_COLOR);
    ele.style(TopologyWebviewController.STYLE_LINE_COLOR, ele.data('editor') === 'true' ? '#32CD32' : '#0043BF');
  }

  private populateLinkPanel(ele: cytoscape.Singular): void {
    const extraData = ele.data('extraData') || {};
    this.updateLinkName(ele);
    this.updateLinkEndpointInfo(ele, extraData);
  }

  private updateLinkName(ele: cytoscape.Singular): void {
    const linkNameEl = document.getElementById('panel-link-name');
    if (linkNameEl) {
      linkNameEl.innerHTML = `┌ ${ele.data('source')} :: ${ele.data('sourceEndpoint') || ''}<br>└ ${ele.data('target')} :: ${ele.data('targetEndpoint') || ''}`;
    }
  }

  private updateLinkEndpointInfo(ele: cytoscape.Singular, extraData: any): void {
    const entries: Array<[string, string | undefined]> = [
      ['panel-link-endpoint-a-name', `${ele.data('source')} :: ${ele.data('sourceEndpoint') || ''}`],
      ['panel-link-endpoint-a-mac-address', extraData.clabSourceMacAddress || 'N/A'],
      ['panel-link-endpoint-a-mtu', extraData.clabSourceMtu || 'N/A'],
      ['panel-link-endpoint-a-type', extraData.clabSourceType || 'N/A'],
      ['panel-link-endpoint-b-name', `${ele.data('target')} :: ${ele.data('targetEndpoint') || ''}`],
      ['panel-link-endpoint-b-mac-address', extraData.clabTargetMacAddress || 'N/A'],
      ['panel-link-endpoint-b-mtu', extraData.clabTargetMtu || 'N/A'],
      ['panel-link-endpoint-b-type', extraData.clabTargetType || 'N/A']
    ];
    entries.forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = value || '';
      }
    });
  }

  private handleEdgeCreation(sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular, addedEdge: cytoscape.EdgeSingular): void {
    log.debug(`Edge created from ${sourceNode.id()} to ${targetNode.id()}`);
    log.debug(`Added edge: ${addedEdge.id()}`);
    setTimeout(() => {
      this.isEdgeHandlerActive = false;
    }, 100);
    const sourceEndpoint = this.getNextEndpoint(sourceNode.id());
    const targetEndpoint = this.getNextEndpoint(targetNode.id());
    const edgeData: any = { sourceEndpoint, targetEndpoint, editor: 'true' };
    this.addNetworkEdgeProperties(sourceNode, targetNode, addedEdge, edgeData);
    addedEdge.data(edgeData);
  }

  private addNetworkEdgeProperties(sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular, addedEdge: cytoscape.EdgeSingular, edgeData: any): void {
    const sourceIsNetwork = this.isNetworkNode(sourceNode.id());
    const targetIsNetwork = this.isNetworkNode(targetNode.id());
    if (!(sourceIsNetwork || targetIsNetwork)) {
      return;
    }
    addedEdge.addClass('stub-link');
    const networkNode = sourceIsNetwork ? sourceNode : targetNode;
    const networkData = networkNode.data();
    const networkType = networkData.extraData?.kind || networkNode.id().split(':')[0];
    const extra = networkData.extraData || {};
    const extData = this.collectNetworkExtraData(networkType, extra, sourceIsNetwork);
    if (Object.keys(extData).length > 0) {
      edgeData.extraData = extData;
    }
  }

  private collectNetworkExtraData(networkType: string, extra: any, sourceIsNetwork: boolean): Record<string, any> {
    const extData: Record<string, any> = {};
    const assignIf = (key: string, value: any) => {
      if (value !== undefined) {
        extData[key] = value;
      }
    };
    if (networkType !== TopologyWebviewController.KIND_BRIDGE && networkType !== TopologyWebviewController.KIND_OVS_BRIDGE) {
      extData.extType = networkType;
    }
    assignIf(sourceIsNetwork ? 'extSourceMac' : 'extTargetMac', extra.extMac);
    assignIf('extMtu', extra.extMtu);
    assignIf('extVars', extra.extVars);
    assignIf('extLabels', extra.extLabels);
    if (['host', 'mgmt-net', 'macvlan'].includes(networkType)) {
      assignIf('extHostInterface', extra.extHostInterface);
    }
    if (networkType === 'macvlan') {
      assignIf('extMode', extra.extMode);
    }
    if (['vxlan', 'vxlan-stitch'].includes(networkType)) {
      assignIf('extRemote', extra.extRemote);
      assignIf('extVni', extra.extVni);
      assignIf('extUdpPort', extra.extUdpPort);
    }
    return extData;
  }

  private isNetworkNode(nodeId: string): boolean {
    if (isSpecialNodeOrBridge(nodeId, this.cy)) {
      return true;
    }
    const node = this.cy.getElementById(nodeId);
    const kind = node.data('extraData')?.kind;
    return kind === TopologyWebviewController.KIND_BRIDGE || kind === TopologyWebviewController.KIND_OVS_BRIDGE;
  }

  /**
   * Determines if keyboard events should be handled by the topology viewer
   * @private
   */
  private shouldHandleKeyboardEvent(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;

    // Don't handle if focus is on an input, textarea, or contenteditable element
    if (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.contentEditable === 'true' ||
      target.isContentEditable) {
      return false;
    }

    // Don't handle if focus is on a dropdown or select element
    if (target.tagName === 'SELECT') {
      return false;
    }

    // Don't handle if we're inside a dialog or modal that's not our confirmation dialog
    const isInDialog = target.closest(`.free-text-dialog, .${TopologyWebviewController.CLASS_PANEL_OVERLAY}, .dropdown-menu`);
    const isInOurConfirmDialog = target.closest('.delete-confirmation-dialog');

    if (isInDialog && !isInOurConfirmDialog) {
      return false;
    }

    // Only handle if the event target is: doc body, cytoscape/canvas area
    const cyContainer = document.getElementById('cy');
    const isInCyContainer = cyContainer && (target === cyContainer || cyContainer.contains(target));
    const isDocumentBody = target === document.body;

    return isDocumentBody || isInCyContainer || target.tagName === 'CANVAS';
  }

  /**
   * Handles Ctrl+A to select all selectable items
   * @private
   */
  private handleSelectAll(): void {
    // Get all nodes and edges that are selectable
    const selectableElements = this.cy.$('node, edge').filter((element) => {
      // Only select elements that are actually selectable
      return element.selectable();
    });

    // Deselect all first, then select all selectable elements
    this.cy.$(':selected').unselect();
    selectableElements.select();

    log.debug(`Selected ${selectableElements.length} elements with Ctrl+A`);
  }

  /**
   * Handles Delete key press to remove selected nodes and edges
   * @private
   */
  private async handleDeleteKeyPress(): Promise<void> {
    // Get all selected elements
    const selectedElements = this.cy.$(':selected');

    if (selectedElements.length === 0) {
      return;
    }

    // Show confirmation dialog if more than one item is selected
    if (selectedElements.length > 1) {
      const result = await (window as any).showDeleteConfirm(null, selectedElements.length);
      if (!result) {
        return;
      }
    }

    // Handle selected nodes
    const selectedNodes = selectedElements.nodes();
    selectedNodes.forEach(node => {
      const topoViewerRole = node.data('topoViewerRole');

      // Handle free text nodes using the existing manager
      if (topoViewerRole === 'freeText') {
        this.freeTextManager?.removeFreeTextAnnotation(node.id());
      } else if (topoViewerRole === 'group') {
        // Handle group nodes - use the group management system
        if (this.isViewportDrawerClabEditorChecked) {
          log.debug(`Delete key: removing group ${node.id()}`);
          this.groupManager?.directGroupRemoval(node.id());
        }
      } else {
        // Handle regular nodes - only delete if in edit mode and node is editable
        const isNodeInEditMode = node.data("editor") === "true";
        if (this.isViewportDrawerClabEditorChecked && isNodeInEditMode) {
          log.debug(`Delete key: removing node ${node.data('extraData')?.longname || node.id()}`);
          node.remove();
        }
      }
    });

    // Handle selected edges
    const selectedEdges = selectedElements.edges();
    selectedEdges.forEach(edge => {
      if (this.isViewportDrawerClabEditorChecked) {
        log.debug(`Delete key: removing edge ${edge.id()}`);
        edge.remove();
      }
    });
  }

  /**
   * Handles Ctrl+X to cut (copy then remove) selected nodes and edges
   * @private
   */
  private async handleCutKeyPress(): Promise<void> {
    // Copy current selection
    this.copyPasteManager.handleCopy();

    // Get all selected elements
    const selectedElements = this.cy.$(':selected');
    if (selectedElements.length === 0) {
      return;
    }

    // Remove selected nodes
    const selectedNodes = selectedElements.nodes();
    selectedNodes.forEach(node => {
      const topoViewerRole = node.data('topoViewerRole');

      if (topoViewerRole === 'freeText') {
        this.freeTextManager?.removeFreeTextAnnotation(node.id());
      } else if (topoViewerRole === 'group') {
        if (this.isViewportDrawerClabEditorChecked) {
          this.groupManager?.directGroupRemoval(node.id());
        }
      } else {
        const isNodeInEditMode = node.data('editor') === 'true';
        if (this.isViewportDrawerClabEditorChecked && isNodeInEditMode) {
          node.remove();
        }
      }
    });

    // Remove selected edges
    const selectedEdges = selectedElements.edges();
    selectedEdges.forEach(edge => {
      if (this.isViewportDrawerClabEditorChecked) {
        edge.remove();
      }
    });

    // Save after cut
    await this.saveManager.saveTopo(this.cy, true);
  }

  /**
   * Determines the next available endpoint identifier for a given node.
   * @param nodeId - The ID of the node.
   * @returns The next available endpoint string.
   * @private
  */
  private getNextEndpoint(nodeId: string): string {
    // Cloud-based nodes like host, mgmt-net or macvlan do not expose
    // regular interfaces. When creating a link to such nodes we must not
    // append an automatically generated endpoint (e.g. `eth1`). Returning an
    // empty string here ensures that the calling code stores only the node ID
    // itself as the link endpoint.
    if (isSpecialEndpoint(nodeId)) {
      return '';
    }

    const ifaceMap = window.ifacePatternMapping || {};
    const node = this.cy.getElementById(nodeId);
    const kind = node.data('extraData')?.kind || 'default';
    const pattern = ifaceMap[kind] || 'eth{n}';

    const placeholder = '__N__';
    const escaped = pattern
      .replace('{n}', placeholder)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexStr = '^' + escaped.replace(placeholder, '(\\d+)') + '$';
    const patternRegex = new RegExp(regexStr);

    const edges = this.cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);
    const usedNumbers = new Set<number>();
    edges.forEach(edge => {
      ['sourceEndpoint', 'targetEndpoint'].forEach(key => {
        const endpoint = edge.data(key);
        const isNodeEndpoint =
          (edge.data('source') === nodeId && key === 'sourceEndpoint') ||
          (edge.data('target') === nodeId && key === 'targetEndpoint');
        if (!endpoint || !isNodeEndpoint) return;
        const match = endpoint.match(patternRegex);
        if (match) {
          usedNumbers.add(parseInt(match[1], 10));
        }
      });
    });

    let endpointNum = 1;
    while (usedNumbers.has(endpointNum)) {
      endpointNum++;
    }

    return pattern.replace('{n}', endpointNum.toString());
  }

  /**
   * Detects the user's preferred color scheme and applies the corresponding theme.
   * @returns The applied theme ("dark" or "light").
   */
  public detectColorScheme(): 'light' | 'dark' {
    const bodyClassList = document.body?.classList;
    const darkMode = bodyClassList?.contains('vscode-dark') || bodyClassList?.contains('vscode-high-contrast');
    const theme: 'light' | 'dark' = darkMode ? 'dark' : 'light';
    this.applyTheme(theme);
    return theme;
  }

  /**
   * Applies a theme to the root element.
   * @param theme - The theme to apply ("dark" or "light").
   * @private
   */
  private applyTheme(theme: 'light' | 'dark'): void {
    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.setAttribute('data-theme', theme);
      log.debug(`Applied Theme: ${theme}`);
    } else {
      log.warn(`'root' element not found; cannot apply theme: ${theme}`);
    }
  }

  /**
   * Updates the subtitle element with the provided text.
   * @param newText - The new text to display in the subtitle.
   */
  public updateSubtitle(newText: string): void {
    const subtitleElement = document.getElementById("ClabSubtitle");
    if (subtitleElement) {
      subtitleElement.textContent = `Topology Editor ::: ${newText}`;
    } else {
      log.warn('Subtitle element not found');
    }
  }




  /**
   * Show/hide topology overview panel
   */
  public viewportButtonsTopologyOverview(): void {
    try {
      const overviewDrawer = document.getElementById("viewport-drawer-topology-overview");
      if (!overviewDrawer) {
        log.warn('Topology overview drawer not found');
        return;
      }

      // Toggle visibility
      if (overviewDrawer.style.display === "block") {
        overviewDrawer.style.display = "none";
      } else {
        // Hide all viewport drawers first
        const viewportDrawer = document.getElementsByClassName(TopologyWebviewController.CLASS_VIEWPORT_DRAWER);
        for (let i = 0; i < viewportDrawer.length; i++) {
          (viewportDrawer[i] as HTMLElement).style.display = "none";
        }
        // Show the topology overview drawer
        overviewDrawer.style.display = "block";
      }
    } catch (error) {
      log.error(`Error in topology overview button: ${error}`);
    }
  }

  public showBulkLinkPanel(): void {
    const panel = document.getElementById('panel-bulk-link');
    if (panel) {
      panel.style.display = 'block';
    }
  }

  public async bulkCreateLinks(sourceFilterText: string, targetFilterText: string): Promise<void> {
    const sourceFilter = FilterUtils.createFilter(sourceFilterText);
    const targetFilter = FilterUtils.createFilter(targetFilterText);
    const sources = this.cy.nodes('node[topoViewerRole != "freeText"][topoViewerRole != "group"]').filter((node) => sourceFilter(node.data('name')));
    const targets = this.cy.nodes('node[topoViewerRole != "freeText"][topoViewerRole != "group"]').filter((node) => targetFilter(node.data('name')));

    // Calculate potential links to show in confirmation
    let potentialLinks = 0;
    sources.forEach((source) => {
      targets.forEach((target) => {
        if (source.id() !== target.id() && !source.edgesTo(target).nonempty()) {
          potentialLinks++;
        }
      });
    });

    if (potentialLinks === 0) {
      (window as any).showConfirmDialog({
        title: 'No Links to Create',
        message: 'No new links would be created with the specified patterns.',
        icon: 'fas fa-info-circle text-blue-500',
        confirmText: 'OK',
        confirmStyle: 'btn-primary',
        cancelText: null // Hide cancel button for info dialogs
      });
      return;
    }

    // Show confirmation dialog
    const result = await (window as any).showBulkActionConfirm(
      'Bulk Link Creation',
      sourceFilterText,
      targetFilterText,
      potentialLinks
    );

    if (!result) {
      return;
    }

    sources.forEach((source) => {
      targets.forEach((target) => {
        if (source.id() !== target.id() && !source.edgesTo(target).nonempty()) {
          const edgeData = {
            id: `${source.id()}-${target.id()}`,
            source: source.id(),
            target: target.id(),
            sourceEndpoint: this.getNextEndpoint(source.id()),
            targetEndpoint: this.getNextEndpoint(target.id()),
            editor: 'true'
          };
          const isStubLink =
            this.isNetworkNode(source.id()) || this.isNetworkNode(target.id());
          this.cy.add({
            group: 'edges',
            data: edgeData,
            classes: isStubLink ? 'stub-link' : undefined
          });
        }
      });
    });
    this.saveManager.saveTopo(this.cy, true);
  }

  /**
   * Dispose of resources held by the engine.
   */
  public dispose(): void {
    this.messageSender.dispose();
  }
}


document.addEventListener('DOMContentLoaded', () => {
  const mode = (window as any).topoViewerMode === 'viewer' ? 'view' : 'edit';
  const controller = new TopologyWebviewController('cy', mode);
  void controller.initAsync(mode);
  // Store the instance for other modules
  topoViewerState.editorEngine = controller;
  topoViewerState.cy = controller.cy;
  // Expose for existing HTML bindings
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

  window.addEventListener('unload', () => {
    controller.dispose();
  });

  // Initial fit already happens in fetchAndLoadData, but do a final adjustment
  // after a short delay to account for any async rendering
  setTimeout(() => {
    if (controller.cy.elements().length > 0) {
      controller.cy.fit(controller.cy.elements(), 50);
      log.debug('Final viewport adjustment completed');
    }
  }, 100); // Much shorter delay - just for final adjustments
});

export default TopologyWebviewController;
