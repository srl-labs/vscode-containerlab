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
import topoViewerState from '../state';
import type { EdgeData } from '../types/topoViewerGraph';
import { FilterUtils } from '../../helpers/filterUtils';
import { isSpecialNodeOrBridge, isSpecialEndpoint } from '../utilities/specialNodes';




/**
 * TopologyWebviewController is responsible for initializing the Cytoscape instance,
 * managing edge creation, node editing and viewport panels/buttons.
 * Entry point for the topology editor webview; methods are called from vscodeHtmlTemplate.ts.
 */
class TopologyWebviewController {
  public cy: cytoscape.Core;
  private eh: any;
  private isEdgeHandlerActive: boolean = false;
  private isViewportDrawerClabEditorChecked: boolean = true; // Editor mode flag

  public messageSender: VscodeMessageSender;
  public saveManager: ManagerSaveTopo;
  public undoManager: ManagerUndo;
  public addNodeManager: ManagerAddContainerlabNode;
  public viewportPanels?: ManagerViewportPanels;
  public unifiedFloatingPanel: ManagerUnifiedFloatingPanel | null = null;
  public nodeEditor?: ManagerNodeEditor;
  public groupManager: ManagerGroupManagement;
  public groupStyleManager: ManagerGroupStyle;
  /** Layout manager instance accessible by other components */
  public layoutAlgoManager: ManagerLayoutAlgo;
  public zoomToFitManager: ManagerZoomToFit;
  public labelEndpointManager: ManagerLabelEndpoint;
  public reloadTopoManager: ManagerReloadTopo;
  public freeTextManager?: ManagerFreeText;
  public copyPasteManager: CopyPasteManager;
    public captureViewportManager: { viewportButtonsCaptureViewportAsSvg: () => void };
  private interfaceCounters: Record<string, number> = {};



  private debounce(func: Function, wait: number) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: any[]) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  // Add automatic save on change
  private setupAutoSave(): void {
    // Debounced save function
    const autoSave = this.debounce(async () => {
      if (this.isEdgeHandlerActive) {
        return;
      }
      const suppressNotification = true;
      await this.saveManager.viewportButtonsSaveTopo(this.cy, suppressNotification);
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
    const autoSaveViewMode = this.debounce(async () => {
      const suppressNotification = true;
      await this.saveManager.viewportButtonsSaveTopo(this.cy, suppressNotification);
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
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error("Cytoscape container element not found");
    }

    // Initialize message sender
    this.messageSender = new VscodeMessageSender();

    // Detect and apply color scheme
    const theme = this.detectColorScheme();

    // Initialize Cytoscape instance
    perfMark('cytoscape_create_start');
    this.cy = createConfiguredCytoscape(container);
    perfMeasure('cytoscape_create', 'cytoscape_create_start');

    // Set initial viewport to prevent flashing
    this.cy.viewport({
      zoom: 1,
      pan: { x: container.clientWidth / 2, y: container.clientHeight / 2 }
    });
    const cyContainer = document.getElementById('cy') as HTMLDivElement;
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

    // Enable grid guide extension (casting cy as any to satisfy TypeScript)
    const gridColor = theme === 'dark' ? '#666666' : '#cccccc';
    (this.cy as any).gridGuide({
      snapToGridOnRelease: true,
      snapToGridDuringDrag: false,
      snapToAlignmentLocationOnRelease: true,
      snapToAlignmentLocationDuringDrag: false,
      distributionGuidelines: false,
      geometricGuideline: false,
      initPosAlignment: false,
      centerToEdgeAlignment: false,
      resize: false,
      parentPadding: false,
      drawGrid: true,

      gridSpacing: 14,
      snapToGridCenter: true,

      zoomDash: true,
      panGrid: true,
      gridStackOrder: -1,
      gridColor,
      lineWidth: 0.5,

      guidelinesStackOrder: 4,
      guidelinesTolerance: 2.0,
      guidelinesStyle: {
        strokeStyle: "#8b7d6b",
        geometricGuidelineRange: 400,
        range: 100,
        minDistRange: 10,
        distGuidelineOffset: 10,
        horizontalDistColor: "#ff0000",
        verticalDistColor: "#00ff00",
        initPosAlignmentColor: "#0000ff",
        lineDash: [0, 0],
        horizontalDistLine: [0, 0],
        verticalDistLine: [0, 0],
        initPosAlignmentLine: [0, 0],
      },

      parentSpacing: -1,
    });

    perfMark('cytoscape_style_start');
    loadCytoStyle(this.cy);
    perfMeasure('cytoscape_style', 'cytoscape_style_start');

    perfMark('fetch_data_start');
    fetchAndLoadData(this.cy, this.messageSender).then(() => {
      perfMeasure('fetch_data', 'fetch_data_start');
      perfMeasure('topoViewer_init_total', 'topoViewer_init_start');

      // Send performance data to extension
      this.messageSender.sendMessageToVscodeEndpointPost('performance-metrics', {
        metrics: PerformanceMonitor.getMeasures()
      });

      // Double-check viewport fit with animation for smoothness
      if (this.cy.elements().length > 0 && typeof requestAnimationFrame !== 'undefined') {
        // eslint-disable-next-line no-undef
        requestAnimationFrame(() => {
          this.cy.animate({
            fit: {
              eles: this.cy.elements(),
              padding: 50
            },
            duration: 150,
            easing: 'ease-out'
          });
        });
      }
    });

    // Defer environment data loading to avoid blocking initial render
    setTimeout(async () => {
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
    }, 0);

    // Register events based on mode
    this.registerEvents(mode);
    if (mode === 'edit') {
      // Defer edgehandles initialization
      setTimeout(() => this.initializeEdgehandles(), 50);
    }
    // Defer context menu initialization
    setTimeout(() => this.initializeContextMenu(mode), 100);

    new ManagerShortcutDisplay();

    // Initiate managers and panels
    this.saveManager = new ManagerSaveTopo(this.messageSender);
    this.undoManager = new ManagerUndo(this.messageSender);
    this.addNodeManager = new ManagerAddContainerlabNode();

    // Initialize free text and group style managers
    this.freeTextManager = new ManagerFreeText(this.cy, this.messageSender);
    this.groupStyleManager = new ManagerGroupStyle(this.cy, this.messageSender, this.freeTextManager);
    this.freeTextManager.setGroupStyleManager(this.groupStyleManager);

    // Initialize copy paste manager
    this.copyPasteManager = new CopyPasteManager(this.cy, this.messageSender, this.groupStyleManager, this.freeTextManager);

    // Annotations will be loaded by managerCytoscapeFetchAndLoad after layout completes
    // Only load group styles here since they're not loaded elsewhere
    setTimeout(() => {
      this.groupStyleManager?.loadGroupStyles().catch((error) => {
        log.error(`Failed to load group style annotations: ${error}`);
      });
    }, 500);

    if (mode === 'edit') {
      this.viewportPanels = new ManagerViewportPanels(this.saveManager, this.cy);
      // Expose to window for other components to access
      (window as any).viewportPanels = this.viewportPanels;
      // Always initialize enhanced node editor
      this.nodeEditor = new ManagerNodeEditor(this.cy, this.saveManager);
    }

    // Initialize unified floating panel for both modes
    this.unifiedFloatingPanel = new ManagerUnifiedFloatingPanel(this.cy, this.messageSender, this.addNodeManager);
    this.groupManager = getGroupManager(this.cy, this.groupStyleManager, mode);
    this.groupManager.initializeWheelSelection();
    this.groupManager.initializeGroupManagement();
    this.layoutAlgoManager = layoutAlgoManagerSingleton;
    this.zoomToFitManager = zoomToFitManagerSingleton;
    this.labelEndpointManager = labelEndpointManagerSingleton;
    this.reloadTopoManager = getReloadTopoManager(this.messageSender);

    // Set editor flag based on mode
    this.isViewportDrawerClabEditorChecked = mode === 'edit';

    if (mode === 'edit') {
      this.setupAutoSave();
    } else {
      // Enable autosave for view mode as well (saves annotations.json)
      this.setupAutoSaveViewMode();
    }

    // Create capture viewport manager with the required method
    this.captureViewportManager = {
      viewportButtonsCaptureViewportAsSvg: () => {
        viewportButtonsCaptureViewportAsSvg();
      }
    };

    // Add double-click handlers for opening editors
    this.cy.on('dblclick', 'node[topoViewerRole != "freeText"]', (event) => {
      const node = event.target;
      if (node.data('topoViewerRole') === 'group') {
        this.groupManager.showGroupEditor(node);
      } else if (node.data('topoViewerRole') === 'cloud') {
        this.viewportPanels?.panelNetworkEditor(node);
      } else {
        // Use node editor
        if (this.nodeEditor) {
          this.nodeEditor.open(node);
        } else {
          // Fallback to standard editor if node editor not available (shouldn't happen)
          this.viewportPanels?.panelNodeEditor(node);
        }
      }
    });

    this.cy.on('dblclick', 'edge', (event) => {
      const edge = event.target;
      this.viewportPanels?.panelEdgeEditor(edge);
    });

    // Expose layout functions globally for HTML event handlers
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

    // Expose topology overview function
    window.viewportButtonsTopologyOverview = this.viewportButtonsTopologyOverview.bind(this);

    // Expose additional functions used by shared navbar buttons
    window.viewportButtonsZoomToFit = () =>
      this.zoomToFitManager.viewportButtonsZoomToFit(this.cy);
    window.viewportButtonsLabelEndpoint = () =>
      this.labelEndpointManager.viewportButtonsLabelEndpoint(this.cy);
    window.viewportButtonsCaptureViewportAsSvg = () =>
      this.captureViewportManager.viewportButtonsCaptureViewportAsSvg();
    window.viewportButtonsReloadTopo = () =>
      this.reloadTopoManager.viewportButtonsReloadTopo(this.cy);
    window.viewportButtonsSaveTopo = () =>
      this.saveManager.viewportButtonsSaveTopo(this.cy);
    window.viewportButtonsUndo = () =>
      this.undoManager.viewportButtonsUndo();

    // Don't trigger here - will be called after controller is exposed to window

    window.addEventListener('message', (event) => {
      const msg = event.data as any;
      if (msg && msg.type === 'yaml-saved') {
        fetchAndLoadData(this.cy, this.messageSender);
      } else if (msg && msg.type === 'updateTopology') {
        try {
          const elements = msg.data as any[];
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
      } else if (msg.type === 'copiedElements') {
        const addedElements = this.copyPasteManager.performPaste(msg.data);
        if (addedElements && addedElements.length > 0) {
          // Save after paste operation
          this.saveManager.viewportButtonsSaveTopo(this.cy, true);
        }
      }
    });

    // Focus the container after initialization
    document.getElementById('cy')?.focus();
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
 * Initializes the circular context menu on nodes.
  */
  private async initializeContextMenu(mode: 'edit' | 'view' = 'edit'): Promise<void> {
    // Load context menu extension lazily
    await loadExtension('cxtmenu');
    const self = this;
    // Context menu for free text elements (available in both edit and view modes)
    this.cy.cxtmenu({
      selector: 'node[topoViewerRole = "freeText"]',
      commands: [
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                      <i class="fas fa-pen-to-square" style="font-size:1.5em;"></i>
                      <div style="height:0.5em;"></div>
                      <span>Edit Text</span>
                    </div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isNode()) {
              return;
            }
            // Trigger edit for free text
            this.freeTextManager?.editFreeText(ele.id());
          }
        },
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                      <i class="fas fa-trash-alt" style="font-size:1.5em;"></i>
                      <div style="height:0.5em;"></div>
                      <span>Remove Text</span>
                    </div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isNode()) {
              return;
            }
            // Remove free text
            this.freeTextManager?.removeFreeTextAnnotation(ele.id());
          }
        }
      ],
      menuRadius: 60, // smaller fixed radius for text menu
      fillColor: 'rgba(31, 31, 31, 0.75)', // the background colour of the menu
      activeFillColor: 'rgba(66, 88, 255, 1)', // the colour used to indicate the selected command
      activePadding: 5, // additional size in pixels for the active command
      indicatorSize: 0, // the size in pixels of the pointer to the active command
      separatorWidth: 3, // the empty spacing in pixels between successive commands
      spotlightPadding: 4, // minimal spacing to keep menu close
      adaptativeNodeSpotlightRadius: false, // DON'T adapt to node size - keep it small
      minSpotlightRadius: 20, // fixed small spotlight
      maxSpotlightRadius: 20, // fixed small spotlight
      openMenuEvents: 'cxttap', // single right-click to open menu
      itemColor: 'white', // the colour of text in the command's content
      itemTextShadowColor: 'rgba(61, 62, 64, 1)', // the text shadow colour of the command's content
      zIndex: 9999, // the z-index of the ui div
      atMouse: false, // draw menu at mouse position
      outsideMenuCancel: 10 // cancel menu when clicking outside
    });

    // Only initialize other context menus in edit mode
    if (mode === 'edit') {
      // Context menu for regular nodes (excluding groups and freeText)
      this.cy.cxtmenu({
        selector: 'node[topoViewerRole != "group"][topoViewerRole != "freeText"]',
        commands: (ele: cytoscape.Singular) => {
          const commands: any[] = [];

          if (this.isNetworkNode(ele.id())) {
            commands.push({
              content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-pen-to-square" style="font-size:1.5em;"></i>
                          <div style="height:0.5em;"></div>
                          <span>Edit Network</span>
                        </div>`,
              select: (ele: cytoscape.Singular) => {
              if (!ele.isNode()) {
                return;
              }
              // Prevent global canvas click handler from closing panels
              this.viewportPanels?.setNodeClicked(true);
              // inside here TS infers ele is NodeSingular
                this.viewportPanels?.panelNetworkEditor(ele);
            }
          });
        } else {
          commands.push({
            content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-pen-to-square" style="font-size:1.5em;"></i>
                          <div style="height:0.5em;"></div>
                          <span>Edit Node</span>
                        </div>`,
              select: (ele: cytoscape.Singular) => {
                if (!ele.isNode()) {
                  return;
                }
                // Prevent global canvas click handler from closing panels
                this.viewportPanels?.setNodeClicked(true);
                // inside here TS infers ele is NodeSingular
                if (this.nodeEditor) {
                  this.nodeEditor.open(ele);
                }
              }
            });
          }

          commands.push(
            {
              content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-trash-alt" style="font-size:1.5em;"></i>
                          <div style="height:0.5em;"></div>
                          <span>Delete Node</span>
                        </div>`,
              select: (ele: cytoscape.Singular) => {
                if (!ele.isNode()) {
                  return;
                }
                const parent = ele.parent();
                ele.remove();
                // If parent exists and now has no children, remove the parent
                if (parent.nonempty() && parent.children().length === 0) {
                  parent.remove();
                }
              }
            },
            {
              content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-link" style="font-size:1.5em;"></i>
                          <div style="height:0.5em;"></div>
                          <span>Add Link</span>
                        </div>`,
              select: (ele: cytoscape.Singular) => {
                // initiate edgehandles drawing from this node
                self.isEdgeHandlerActive = true;
                self.eh.start(ele);
              }
            }
          );

          // Add "Release from Group" option if the node is a child of a group
          if (ele.isNode() && ele.parent().nonempty()) {
            commands.push({
              content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-users-slash" style="font-size:1.5em;"></i>
                          <div style="height:0.5em;"></div>
                          <span>Release from Group</span>
                        </div>`,
              select: (node: cytoscape.Singular) => {
                if (!node.isNode()) {
                  return;
                }
                // Use setTimeout to ensure this runs after any other event handlers
                setTimeout(() => {
                  self.groupManager.orphaningNode(node);
                }, 50);
              }
            });
          }

          return commands;
        },
      menuRadius: 110, // the radius of the menu
      fillColor: 'rgba(31, 31, 31, 0.75)', // the background colour of the menu
      activeFillColor: 'rgba(66, 88, 255, 1)', // the colour used to indicate the selected command
      activePadding: 5, // additional size in pixels for the active command
      indicatorSize: 0, // the size in pixels of the pointer to the active command, will default to the node size if the node size is smaller than the indicator size,
      separatorWidth: 3, // the empty spacing in pixels between successive commands
      spotlightPadding: 20, // extra spacing in pixels between the element and the spotlight
      adaptativeNodeSpotlightRadius: true, // specify whether the spotlight radius should adapt to the node size
      minSpotlightRadius: 24, // the minimum radius in pixels of the spotlight (ignored for the node if adaptativeNodeSpotlightRadius is enabled but still used for the edge & background)
      maxSpotlightRadius: 38, // the maximum radius in pixels of the spotlight (ignored for the node if adaptativeNodeSpotlightRadius is enabled but still used for the edge & background)
      openMenuEvents: 'cxttap', // single right-click to open menu
      itemColor: 'white', // the colour of text in the command's content
      itemTextShadowColor: 'rgba(61, 62, 64, 1)', // the text shadow colour of the command's content
      zIndex: 9999, // the z-index of the ui div
      atMouse: false, // draw menu at mouse position
      outsideMenuCancel: 10 // cancel menu when clicking outside
    });

    this.cy.cxtmenu({
      selector: 'node:parent, node[topoViewerRole = "group"]',
      commands: [
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                      <i class="fas fa-pen-to-square" style="font-size:1.5em;"></i>
                      <div style="height:0.5em;"></div>
                      <span>Edit Group</span>
                    </div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isNode()) {
              return;
            }
            // prevent global canvas click handler from closing panels
              this.viewportPanels?.setNodeClicked(true);
            // inside here TS infers ele is NodeSingular
            // this.viewportPanels.panelNodeEditor(ele);
            if (ele.data("topoViewerRole") == "group") {
              this.groupManager.showGroupEditor(ele.id());
            }
          }
        },
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                      <i class="fas fa-trash-alt" style="font-size:1.5em;"></i>
                      <div style="height:0.5em;"></div>
                      <span>Delete Group</span>
                    </div>`,
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
          }
        }
      ],
      menuRadius: 110, // the radius of the menu
      fillColor: 'rgba(31, 31, 31, 0.75)', // the background colour of the menu
      activeFillColor: 'rgba(66, 88, 255, 1)', // the colour used to indicate the selected command
      activePadding: 5, // additional size in pixels for the active command
      indicatorSize: 0, // the size in pixels of the pointer to the active command, will default to the node size if the node size is smaller than the indicator size,
      separatorWidth: 3, // the empty spacing in pixels between successive commands
      spotlightPadding: 0, // extra spacing in pixels between the element and the spotlight
      adaptativeNodeSpotlightRadius: true, // specify whether the spotlight radius should adapt to the node size
      minSpotlightRadius: 0, // the minimum radius in pixels of the spotlight (ignored for the node if adaptativeNodeSpotlightRadius is enabled but still used for the edge & background)
      maxSpotlightRadius: 0, // the maximum radius in pixels of the spotlight (ignored for the node if adaptativeNodeSpotlightRadius is enabled but still used for the edge & background)
      openMenuEvents: 'cxttap', // single right-click to open menu
      itemColor: 'white', // the colour of text in the command's content
      itemTextShadowColor: 'rgba(61, 62, 64, 1)', // the text shadow colour of the command's content
      zIndex: 9999, // the z-index of the ui div
      atMouse: false, // draw menu at mouse position
      outsideMenuCancel: 10 // cancel menu when clicking outside
    });

    this.cy.cxtmenu({
      selector: 'edge',
      commands: [
        {
          content: `
            <div style="display:flex;flex-direction:column;align-items:center;line-height:1;">
              <i class="fas fa-pen" style="font-size:1.5em;"></i>
              <div style="height:0.5em;"></div>
              <span>Edit Link</span>
            </div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isEdge()) {
              return;
            }
            // Set edgeClicked to true to prevent the panel from closing immediately
              this.viewportPanels?.setEdgeClicked(true);
              // you'll need to implement panelEdgeEditor in ManagerViewportPanels
              this.viewportPanels?.panelEdgeEditor(ele);
          }
        },
        {
          content: `
            <div style="display:flex;flex-direction:column;align-items:center;line-height:1;">
              <i class="fas fa-trash-alt" style="font-size:1.5em;"></i>
              <div style="height:0.5em;"></div>
              <span>Delete Link</span>
            </div>`,
          select: (ele: cytoscape.Singular) => {
            ele.remove();
          }
        }
      ],
      menuRadius: 80, // the radius of the menu
      fillColor: 'rgba(31, 31, 31, 0.75)', // the background colour of the menu
      activeFillColor: 'rgba(66, 88, 255, 1)', // the colour used to indicate the selected command
      activePadding: 5, // additional size in pixels for the active command
      indicatorSize: 0, // the size in pixels of the pointer to the active command, will default to the node size if the node size is smaller than the indicator size,
      separatorWidth: 3, // the empty spacing in pixels between successive commands
      spotlightPadding: 0, // extra spacing in pixels between the element and the spotlight
      adaptativeNodeSpotlightRadius: true, // specify whether the spotlight radius should adapt to the node size
      minSpotlightRadius: 0, // the minimum radius in pixels of the spotlight (ignored for the node if adaptativeNodeSpotlightRadius is enabled but still used for the edge & background)
      maxSpotlightRadius: 0, // the maximum radius in pixels of the spotlight (ignored for the node if adaptativeNodeSpotlightRadius is enabled but still used for the edge & background)
      openMenuEvents: 'cxttap', // single right-click to open menu
      itemColor: 'white', // the colour of text in the command's content
      itemTextShadowColor: 'rgba(61, 62, 64, 1)', // the text shadow colour of the command's content
      zIndex: 9999, // the z-index of the ui div
      atMouse: false, // draw menu at mouse position
      outsideMenuCancel: 10 // cancel menu when clicking outside
    });
    } // end if (mode === 'edit')

    // Add radial context menu for viewer mode
    if (mode === 'view') {
      const self = this;
      // Context menu for regular nodes (excluding groups and freeText)
      this.cy.cxtmenu({
        selector: 'node[topoViewerRole != "group"][topoViewerRole != "freeText"]',
        commands: (ele: cytoscape.Singular) => {
          // Skip special endpoints - they don't have SSH/Shell/Logs
          if (self.isNetworkNode(ele.id())) {
            return [];
          }
          const commands = [
            {
              content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-terminal" style="font-size:1.5em;"></i>
                          <div style="height:0.5em;"></div>
                          <span>SSH</span>
                        </div>`,
              select: async (node: cytoscape.Singular) => {
                if (!node.isNode()) {
                  return;
                }
                const nodeName = node.data("extraData")?.longname || node.data("name") || node.id();
                await self.messageSender.sendMessageToVscodeEndpointPost('clab-node-connect-ssh', nodeName);
              }
            },
            {
              content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-cube" style="font-size:1.5em;"></i>
                          <div style="height:0.5em;"></div>
                          <span>Shell</span>
                        </div>`,
              select: async (node: cytoscape.Singular) => {
                if (!node.isNode()) {
                  return;
                }
                const nodeName = node.data("extraData")?.longname || node.data("name") || node.id();
                await self.messageSender.sendMessageToVscodeEndpointPost('clab-node-attach-shell', nodeName);
              }
            },
            {
              content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-file-alt" style="font-size:1.5em;"></i>
                          <div style="height:0.5em;"></div>
                          <span>Logs</span>
                        </div>`,
              select: async (node: cytoscape.Singular) => {
                if (!node.isNode()) {
                  return;
                }
                const nodeName = node.data("extraData")?.longname || node.data("name") || node.id();
                await self.messageSender.sendMessageToVscodeEndpointPost('clab-node-view-logs', nodeName);
              }
            },
            {
              content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-info-circle" style="font-size:1.5em;"></i>
                          <div style="height:0.5em;"></div>
                          <span>Properties</span>
                        </div>`,
              select: (node: cytoscape.Singular) => {
                if (!node.isNode()) {
                  return;
                }
                // Use setTimeout to ensure this runs after any other event handlers
                setTimeout(() => {
                  // Show node properties panel
                  const panelOverlays = document.getElementsByClassName("panel-overlay");
                  Array.from(panelOverlays).forEach(panel => (panel as HTMLElement).style.display = "none");
                  const panelNode = document.getElementById("panel-node");
                  if (panelNode) {
                    panelNode.style.display = "block";
                    const extraData = node.data("extraData") || {};
                    const nameEl = document.getElementById("panel-node-name");
                    if (nameEl) nameEl.textContent = extraData.longname || node.data("name") || node.id();
                    const kindEl = document.getElementById("panel-node-kind");
                    if (kindEl) kindEl.textContent = extraData.kind || "";
                    const mgmtIpv4El = document.getElementById("panel-node-mgmtipv4");
                    if (mgmtIpv4El) mgmtIpv4El.textContent = extraData.mgmtIpv4Address || "";
                    const mgmtIpv6El = document.getElementById("panel-node-mgmtipv6");
                    if (mgmtIpv6El) mgmtIpv6El.textContent = extraData.mgmtIpv6Address || "";
                    const fqdnEl = document.getElementById("panel-node-fqdn");
                    if (fqdnEl) fqdnEl.textContent = extraData.fqdn || "";
                    const roleEl = document.getElementById("panel-node-topoviewerrole");
                    if (roleEl) roleEl.textContent = node.data("topoViewerRole") || "";
                    const stateEl = document.getElementById("panel-node-state");
                    if (stateEl) stateEl.textContent = extraData.state || "";
                    const imageEl = document.getElementById("panel-node-image");
                    if (imageEl) imageEl.textContent = extraData.image || "";
                    topoViewerState.selectedNode = extraData.longname || node.id();
                    topoViewerState.nodeClicked = true;
                  }
                }, 50);
              }
            }
          ];

          // Add "Release from Group" option if the node is a child of a group
          if (ele.isNode() && ele.parent().nonempty()) {
            commands.push({
              content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-users-slash" style="font-size:1.5em;"></i>
                          <div style="height:0.5em;"></div>
                          <span>Release from Group</span>
                        </div>`,
              select: (node: cytoscape.Singular) => {
                if (!node.isNode()) {
                  return;
                }
                // Use setTimeout to ensure this runs after any other event handlers
                setTimeout(() => {
                  self.groupManager.orphaningNode(node);
                }, 50);
              }
            });
          }

          return commands;
        },
        menuRadius: 110, // standard radius for multiple actions
        fillColor: 'rgba(31, 31, 31, 0.75)', // the background colour of the menu
        activeFillColor: 'rgba(66, 88, 255, 1)', // the colour used to indicate the selected command
        activePadding: 5, // additional size in pixels for the active command
        indicatorSize: 0, // the size in pixels of the pointer to the active command
        separatorWidth: 3, // the empty spacing in pixels between successive commands
        spotlightPadding: 20, // extra spacing in pixels between the element and the spotlight
        adaptativeNodeSpotlightRadius: true, // specify whether the spotlight radius should adapt to the node size
        minSpotlightRadius: 24, // the minimum radius in pixels of the spotlight
        maxSpotlightRadius: 38, // the maximum radius in pixels of the spotlight
        openMenuEvents: 'cxttap', // single right-click to open menu
        itemColor: 'white', // the colour of text in the command's content
        itemTextShadowColor: 'rgba(61, 62, 64, 1)', // the text shadow colour of the command's content
        zIndex: 9999, // the z-index of the ui div
        atMouse: false, // draw menu at mouse position
        outsideMenuCancel: 10 // cancel menu when clicking outside
      });

      // Context menu for edges/links in viewer mode
        this.cy.cxtmenu({
          selector: 'edge',
            commands: (ele: cytoscape.Singular) => {
              const sourceId = ele.data("source");
              const targetId = ele.data("target");

              // Check if nodes are special network endpoints
              const sourceNode = self.cy.getElementById(sourceId);
              const targetNode = self.cy.getElementById(targetId);

            // Check for all types of special network endpoints (bridge, host, mgmt-net, macvlan)
              const sourceIsSpecialNetwork =
                isSpecialNodeOrBridge(sourceId, self.cy) ||
                (sourceNode.length > 0 &&
                  (sourceNode.data('extraData')?.kind === 'bridge' ||
                   sourceNode.data('extraData')?.kind === 'ovs-bridge'));

              const targetIsSpecialNetwork =
                isSpecialNodeOrBridge(targetId, self.cy) ||
                (targetNode.length > 0 &&
                  (targetNode.data('extraData')?.kind === 'bridge' ||
                   targetNode.data('extraData')?.kind === 'ovs-bridge'));

              const extra = ele.data('extraData') || {};

              // Get the display names - use the node ID from the graph (which is the short name without prefix)
              // Fall back to removing prefix from long name if needed
              const getDisplayName = (nodeId: string, longName: string | undefined): string => {
                // First try to use the node ID directly (this is typically the short name)
                const node = self.cy.getElementById(nodeId);
                if (node.length > 0 && node.data('name')) {
                  return node.data('name');
                }

                // If we have a long name with prefix, remove the prefix
                if (longName && topoViewerState.prefixName && longName.startsWith(topoViewerState.prefixName + '-')) {
                  return longName.substring(topoViewerState.prefixName.length + 1);
                }

                // Otherwise return what we have
                return longName || nodeId;
              };

              const sourceName = getDisplayName(sourceId, extra.clabSourceLongName);
              const targetName = getDisplayName(targetId, extra.clabTargetLongName);

            const sourceEndpoint = extra.clabSourcePort || ele.data("sourceEndpoint") || "Port A";
            const targetEndpoint = extra.clabTargetPort || ele.data("targetEndpoint") || "Port B";

            const commands = [];

            // Add capture option for source if it's not a special network
            if (!sourceIsSpecialNetwork) {
              commands.push({
                content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <img src="${(window as any).imagesUrl}/wireshark_bold.svg" style="width:1.4em; height:1.4em; filter: brightness(0) invert(1);" />
                          <div style="height:0.3em;"></div>
                          <span style="font-size:0.9em;">${sourceName} - ${sourceEndpoint}</span>
                        </div>`,
                select: (ele: cytoscape.Singular) => {
                  if (!ele.isEdge()) {
                    return;
                  }
                  // Use setTimeout to ensure this runs after any other event handlers
                  setTimeout(async () => {
                    const extra = ele.data('extraData') || {};
                    const nodeName = extra.clabSourceLongName || ele.data('source');
                    const interfaceName = extra.clabSourcePort || ele.data('sourceEndpoint') || "";
                    if (nodeName && interfaceName) {
                      // Use the default capture method from settings
                      await self.messageSender.sendMessageToVscodeEndpointPost('clab-interface-capture', { nodeName, interfaceName });
                    }
                  }, 50);
                }
              });
            }

            // Add capture option for target if it's not a special network
            if (!targetIsSpecialNetwork) {
              commands.push({
                content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <img src="${(window as any).imagesUrl}/wireshark_bold.svg" style="width:1.4em; height:1.4em; filter: brightness(0) invert(1);" />
                          <div style="height:0.3em;"></div>
                          <span style="font-size:0.9em;">${targetName} - ${targetEndpoint}</span>
                        </div>`,
                select: (ele: cytoscape.Singular) => {
                  if (!ele.isEdge()) {
                    return;
                  }
                  // Use setTimeout to ensure this runs after any other event handlers
                  setTimeout(async () => {
                    const extra = ele.data('extraData') || {};
                    const nodeName = extra.clabTargetLongName || ele.data('target');
                    const interfaceName = extra.clabTargetPort || ele.data('targetEndpoint') || "";
                    if (nodeName && interfaceName) {
                      // Use the default capture method from settings
                      await self.messageSender.sendMessageToVscodeEndpointPost('clab-interface-capture', { nodeName, interfaceName });
                    }
                  }, 50);
                }
              });
            }

            // Always add the details option
            commands.push(
            {
              content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                          <i class="fas fa-info-circle" style="font-size:1.4em;"></i>
                          <div style="height:0.3em;"></div>
                          <span style="font-size:0.9em;">Link Properties</span>
                        </div>`,
            select: (ele: cytoscape.Singular) => {
              if (!ele.isEdge()) {
                return;
              }
              // Use setTimeout to ensure this runs after any other event handlers
              setTimeout(() => {
                // Show link properties panel
                const panelOverlays = document.getElementsByClassName("panel-overlay");
                Array.from(panelOverlays).forEach(panel => (panel as HTMLElement).style.display = "none");
                self.cy.edges().removeStyle("line-color");
                if (ele.data("editor") === "true") {
                  ele.style("line-color", "#32CD32");
                } else {
                  ele.style("line-color", "#0043BF");
                }
                const panelLink = document.getElementById("panel-link");
                if (panelLink) {
                  panelLink.style.display = "block";
                  const extraData = ele.data("extraData") || {};
                  const linkNameEl = document.getElementById("panel-link-name");
                  if (linkNameEl) {
                    linkNameEl.innerHTML = `┌ ${ele.data("source")} :: ${ele.data("sourceEndpoint") || ""}<br>└ ${ele.data("target")} :: ${ele.data("targetEndpoint") || ""}`;
                  }
                  const endpointANameEl = document.getElementById("panel-link-endpoint-a-name");
                  if (endpointANameEl) {
                    endpointANameEl.textContent = `${ele.data("source")} :: ${ele.data("sourceEndpoint") || ""}`;
                  }
                  const endpointAMacEl = document.getElementById("panel-link-endpoint-a-mac-address");
                  if (endpointAMacEl) {
                    endpointAMacEl.textContent = extraData.clabSourceMacAddress || "N/A";
                  }
                  const endpointAMtuEl = document.getElementById("panel-link-endpoint-a-mtu");
                  if (endpointAMtuEl) {
                    endpointAMtuEl.textContent = extraData.clabSourceMtu || "N/A";
                  }
                  const endpointATypeEl = document.getElementById("panel-link-endpoint-a-type");
                  if (endpointATypeEl) {
                    endpointATypeEl.textContent = extraData.clabSourceType || "N/A";
                  }
                  const endpointBNameEl = document.getElementById("panel-link-endpoint-b-name");
                  if (endpointBNameEl) {
                    endpointBNameEl.textContent = `${ele.data("target")} :: ${ele.data("targetEndpoint") || ""}`;
                  }
                  const endpointBMacEl = document.getElementById("panel-link-endpoint-b-mac-address");
                  if (endpointBMacEl) {
                    endpointBMacEl.textContent = extraData.clabTargetMacAddress || "N/A";
                  }
                  const endpointBMtuEl = document.getElementById("panel-link-endpoint-b-mtu");
                  if (endpointBMtuEl) {
                    endpointBMtuEl.textContent = extraData.clabTargetMtu || "N/A";
                  }
                  const endpointBTypeEl = document.getElementById("panel-link-endpoint-b-type");
                  if (endpointBTypeEl) {
                    endpointBTypeEl.textContent = extraData.clabTargetType || "N/A";
                  }
                  topoViewerState.selectedEdge = ele.id();
                  topoViewerState.edgeClicked = true;
                }
              }, 50);
            }
          });

          return commands;
        },
        menuRadius: 110, // standard radius for fewer items
        fillColor: 'rgba(31, 31, 31, 0.75)', // the background colour of the menu
        activeFillColor: 'rgba(66, 88, 255, 1)', // the colour used to indicate the selected command
        activePadding: 5, // additional size in pixels for the active command
        indicatorSize: 0, // the size in pixels of the pointer to the active command
        separatorWidth: 3, // the empty spacing in pixels between successive commands
        spotlightPadding: 0, // extra spacing in pixels between the element and the spotlight
        adaptativeNodeSpotlightRadius: true, // specify whether the spotlight radius should adapt to the node size
        minSpotlightRadius: 0, // the minimum radius in pixels of the spotlight
        maxSpotlightRadius: 0, // the maximum radius in pixels of the spotlight
        openMenuEvents: 'cxttap', // single right-click to open menu
        itemColor: 'white', // the colour of text in the command's content
        itemTextShadowColor: 'rgba(61, 62, 64, 1)', // the text shadow colour of the command's content
        zIndex: 9999, // the z-index of the ui div
        atMouse: false, // draw menu at mouse position
        outsideMenuCancel: 10 // cancel menu when clicking outside
      });

      // Context menu for groups (same as in editor mode for group wheel functionality)
      this.cy.cxtmenu({
        selector: 'node:parent, node[topoViewerRole = "group"]',
        commands: [
          {
            content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                        <i class="fas fa-pen-to-square" style="font-size:1.5em;"></i>
                        <div style="height:0.5em;"></div>
                        <span>Edit Group</span>
                      </div>`,
            select: (ele: cytoscape.Singular) => {
              if (!ele.isNode()) {
                return;
              }
              // Use setTimeout to ensure this runs after any other event handlers
              setTimeout(() => {
                let groupId: string;
                if (ele.data("topoViewerRole") == "group" || ele.isParent()) {
                  groupId = ele.id();
                } else {
                  return;
                }
                self.groupManager.showGroupEditor(groupId);
              }, 50);
            }
          },
          {
            content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                        <i class="fas fa-trash-alt" style="font-size:1.5em;"></i>
                        <div style="height:0.5em;"></div>
                        <span>Delete Group</span>
                      </div>`,
            select: (ele: cytoscape.Singular) => {
              if (!ele.isNode()) {
                return;
              }
              // Use setTimeout to ensure this runs after any other event handlers
              setTimeout(() => {
                let groupId: string;
                if (ele.data("topoViewerRole") == "group" || ele.isParent()) {
                  groupId = ele.id();
                } else {
                  return;
                }
                self.groupManager.directGroupRemoval(groupId);
              }, 50);
            }
          }
        ],
        menuRadius: 80, // smaller radius for single action
        fillColor: 'rgba(31, 31, 31, 0.75)', // the background colour of the menu
        activeFillColor: 'rgba(66, 88, 255, 1)', // the colour used to indicate the selected command
        activePadding: 5, // additional size in pixels for the active command
        indicatorSize: 0, // the size in pixels of the pointer to the active command
        separatorWidth: 3, // the empty spacing in pixels between successive commands
        spotlightPadding: 0, // extra spacing in pixels between the element and the spotlight
        adaptativeNodeSpotlightRadius: true, // specify whether the spotlight radius should adapt to the node size
        minSpotlightRadius: 0, // the minimum radius in pixels of the spotlight
        maxSpotlightRadius: 0, // the maximum radius in pixels of the spotlight
        openMenuEvents: 'cxttap', // single right-click to open menu
        itemColor: 'white', // the colour of text in the command's content
        itemTextShadowColor: 'rgba(61, 62, 64, 1)', // the text shadow colour of the command's content
        zIndex: 9999, // the z-index of the ui div
        atMouse: false, // draw menu at mouse position
        outsideMenuCancel: 10 // cancel menu when clicking outside
      });
    } // end if (mode === 'view')
  }



  /**
   * Registers event handlers for Cytoscape elements such as canvas, nodes, and edges.
   * @private
   */
  private async registerEvents(mode: 'edit' | 'view'): Promise<void> {
    if (mode === 'edit') {
      registerCyEventHandlers({
        cy: this.cy,
        onCanvasClick: (event) => {
          const mouseEvent = event.originalEvent as MouseEvent;
          if (mouseEvent.shiftKey && this.isViewportDrawerClabEditorChecked) {
            log.debug('Canvas clicked with Shift key - adding node.');
            this.addNodeManager.viewportButtonsAddContainerlabNode(this.cy, event);
          }
        },
        onNodeClick: async (event) => {
            this.viewportPanels!.nodeClicked = true; // prevent panels from closing
          const node = event.target;
          log.debug(`Node clicked: ${node.id()}`);
          const originalEvent = event.originalEvent as MouseEvent;
          const extraData = node.data("extraData");
          const isNodeInEditMode = node.data("editor") === "true";
          switch (true) {
            case originalEvent.ctrlKey && node.isChild():
              log.debug(`Orphaning node: ${node.id()} from parent: ${node.parent().id()}`);
              node.move({ parent: null });
              break;
            case originalEvent.shiftKey && node.data('topoViewerRole') !== 'freeText':
              log.debug(`Shift+click on node: starting edge creation from node: ${extraData?.longname || node.id()}`);
              this.isEdgeHandlerActive = true;
              this.eh.start(node);
              break;
            case originalEvent.altKey && (isNodeInEditMode || node.data('topoViewerRole') === 'group' || node.data('topoViewerRole') === 'freeText'):
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
              break;
            case (node.data("topoViewerRole") == "textbox"):
              break;
            default:
              break;
          }
        },
        onEdgeClick: (event) => {
            this.viewportPanels!.edgeClicked = true; // prevent panels from closing
          const edge = event.target;
          const originalEvent = event.originalEvent as MouseEvent;
          if (originalEvent.altKey && this.isViewportDrawerClabEditorChecked) {
            log.debug(`Alt+click on edge: deleting edge ${edge.id()}`);
            edge.remove();
          }
        }
      });

      // Edgehandles lifecycle events.
      this.cy.on('ehstart', () => {
        this.isEdgeHandlerActive = true;
      });

      this.cy.on('ehstop', () => {
        this.isEdgeHandlerActive = false;
      });

      this.cy.on('ehcancel', () => {
        this.isEdgeHandlerActive = false;
      });

      document.addEventListener('keydown', (event) => {
        // Check if we should handle the keyboard event
        if (!this.shouldHandleKeyboardEvent(event)) {
          return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          this.handleDeleteKeyPress();
        } else if (event.ctrlKey && event.key === 'a') {
          event.preventDefault();
          this.handleSelectAll();
        } else if (event.key.toLowerCase() === 'g') {
          this.groupManager.viewportButtonsAddGroup();
        } else if (event.ctrlKey && event.key.toLowerCase() === 'c') {
          event.preventDefault();
          this.copyPasteManager.handleCopy();
        } else if (event.ctrlKey && event.key.toLowerCase() === 'v' && this.isViewportDrawerClabEditorChecked) {
          event.preventDefault();
          this.copyPasteManager.handlePaste();
        } else if (event.ctrlKey && event.key.toLowerCase() === 'x' && this.isViewportDrawerClabEditorChecked) {
          event.preventDefault();
          this.handleCutKeyPress();
        } else if (event.ctrlKey && event.key.toLowerCase() === 'd' && this.isViewportDrawerClabEditorChecked) {
          event.preventDefault();
          this.copyPasteManager.handleDuplicate();
        }
      });

      // Edge creation completion via edgehandles.
      this.cy.on('ehcomplete', (_event, sourceNode, targetNode, addedEdge) => {
        log.debug(`Edge created from ${sourceNode.id()} to ${targetNode.id()}`);
        log.debug(`Added edge: ${addedEdge.id()}`);

        setTimeout(() => {
          this.isEdgeHandlerActive = false;
        }, 100);

        const sourceEndpoint = this.getNextEndpoint(sourceNode.id());
        const targetEndpoint = this.getNextEndpoint(targetNode.id());

        // Prepare edge data
        const edgeData: any = { sourceEndpoint, targetEndpoint, editor: 'true' };

        // Transfer extended properties from network nodes to the edge
        const sourceIsNetwork = this.isNetworkNode(sourceNode.id());
        const targetIsNetwork = this.isNetworkNode(targetNode.id());

        if (sourceIsNetwork || targetIsNetwork) {
          addedEdge.addClass('stub-link');

          // Get the network node (could be source or target)
          const networkNode = sourceIsNetwork ? sourceNode : targetNode;
          const networkData = networkNode.data();
          const networkType = networkData.extraData?.kind || networkNode.id().split(':')[0];

          // Transfer extended properties from network node to edge
          if (networkData.extraData) {
            const extData: any = {};

            // Set link type
            if (networkType !== 'bridge' && networkType !== 'ovs-bridge') {
              extData.extType = networkType;
            }

            // Transfer all extended properties
            if (networkData.extraData.extMac !== undefined) {
              // MAC address for the network side endpoint
              if (sourceIsNetwork) {
                extData.extSourceMac = networkData.extraData.extMac;
              } else {
                extData.extTargetMac = networkData.extraData.extMac;
              }
            }
            if (networkData.extraData.extMtu !== undefined) {
              extData.extMtu = networkData.extraData.extMtu;
            }
            if (networkData.extraData.extVars !== undefined) {
              extData.extVars = networkData.extraData.extVars;
            }
            if (networkData.extraData.extLabels !== undefined) {
              extData.extLabels = networkData.extraData.extLabels;
            }

            // Transfer host interface for host/mgmt-net/macvlan
            if ((networkType === 'host' || networkType === 'mgmt-net' || networkType === 'macvlan') &&
                networkData.extraData.extHostInterface !== undefined) {
              extData.extHostInterface = networkData.extraData.extHostInterface;
            }

            // Transfer macvlan mode
            if (networkType === 'macvlan' && networkData.extraData.extMode !== undefined) {
              extData.extMode = networkData.extraData.extMode;
            }

            // Transfer vxlan properties
            if (networkType === 'vxlan' || networkType === 'vxlan-stitch') {
              if (networkData.extraData.extRemote !== undefined) extData.extRemote = networkData.extraData.extRemote;
              if (networkData.extraData.extVni !== undefined) extData.extVni = networkData.extraData.extVni;
              if (networkData.extraData.extUdpPort !== undefined) extData.extUdpPort = networkData.extraData.extUdpPort;
            }

            // Add extended properties to edge data
            if (Object.keys(extData).length > 0) {
              edgeData.extraData = extData;
            }
          }
        }

        addedEdge.data(edgeData);
      });

    } else {
      // Viewer mode - NO left-click interactions, only right-click radial menus
      const cy = this.cy;
      let radialMenuOpen = false;

      // Track radial menu state
      cy.on('cxtmenu:open', () => {
        radialMenuOpen = true;
      });

      cy.on('cxtmenu:close', () => {
        setTimeout(() => {
          radialMenuOpen = false;
        }, 200);
      });

      // Only register canvas click to close panels
      registerCyEventHandlers({
        cy,
        onCanvasClick: () => {
          // Don't close panels if radial menu is open
          if (radialMenuOpen) {
            return;
          }
          const panelOverlays = document.getElementsByClassName('panel-overlay');
          for (let i = 0; i < panelOverlays.length; i++) {
            (panelOverlays[i] as HTMLElement).style.display = 'none';
          }
          const viewportDrawer = document.getElementsByClassName('viewport-drawer');
          for (let i = 0; i < viewportDrawer.length; i++) {
            (viewportDrawer[i] as HTMLElement).style.display = 'none';
          }
          topoViewerState.nodeClicked = false;
          topoViewerState.edgeClicked = false;
          cy.edges().removeStyle("line-color");
          topoViewerState.selectedEdge = null;
        }
        // NO onNodeClick handler - all node interactions via right-click menu
        // NO onEdgeClick handler - all edge interactions via right-click menu (if needed)
      });

      // Global keyboard event handler for Ctrl+A in viewer mode
      document.addEventListener('keydown', (event) => {
        // Check if we should handle the keyboard event
        if (!this.shouldHandleKeyboardEvent(event)) {
          return;
        }

        if (event.ctrlKey && event.key === 'a') {
          event.preventDefault();
          this.handleSelectAll();
        }
      });
    }

    // Drag-and-drop reparenting logic is now handled by groupManager.initializeGroupManagement()


  }

  private isNetworkNode(nodeId: string): boolean {
    if (isSpecialNodeOrBridge(nodeId, this.cy)) {
      return true;
    }
    const node = this.cy.getElementById(nodeId);
    const kind = node.data('extraData')?.kind;
    return kind === 'bridge' || kind === 'ovs-bridge';
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
    const isInDialog = target.closest('.free-text-dialog, .panel-overlay, .dropdown-menu');
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
    await this.saveManager.viewportButtonsSaveTopo(this.cy, true);
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
        const viewportDrawer = document.getElementsByClassName("viewport-drawer");
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
    this.saveManager.viewportButtonsSaveTopo(this.cy, true);
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
