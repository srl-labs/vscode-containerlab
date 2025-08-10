// file: topoViewerEditorEngine.ts

import cytoscape from 'cytoscape';
import edgehandles from 'cytoscape-edgehandles';
import cola from 'cytoscape-cola';
import gridGuide from 'cytoscape-grid-guide';
import leaflet from 'cytoscape-leaf';
// Import and register context-menu plugin
import cxtmenu from 'cytoscape-cxtmenu';
// import 'cytoscape-cxtmenu/cytoscape-cxtmenu.css';
import cytoscapeSvg from 'cytoscape-svg';

// Import Tailwind CSS and Font Awesome
import '../../common/webview-ui/tailwind.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
// Import Leaflet CSS for map tiles
import 'leaflet/dist/leaflet.css';
// Import cytoscape-leaflet CSS for geo-positioning
import '../../view/webview-ui/cytoscape-leaflet.css';

import loadCytoStyle from '../../common/webview-ui/managerCytoscapeBaseStyles';
import { VscodeMessageSender } from '../../common/webview-ui/managerVscodeWebview';
import { fetchAndLoadData, fetchAndLoadDataEnvironment } from './managerCytoscapeFetchAndLoad';
import { ManagerSaveTopo } from './managerSaveTopo';
import { ManagerAddContainerlabNode } from './managerAddContainerlabNode';
import { ManagerViewportPanels } from './managerViewportPanels';
import { exportViewportAsSvg } from '../../common/webview-ui/utils';
import type { ManagerGroupManagement } from '../../common/webview-ui/managerGroupManagement';
import type { ManagerLayoutAlgo } from '../../common/webview-ui/managerLayoutAlgo';
import type { ManagerZoomToFit } from '../../common/webview-ui/managerZoomToFit';
import type { ManagerLabelEndpoint } from './managerLabelEndpoint';
import type { ManagerReloadTopo } from './managerReloadTopo';
import { layoutAlgoManager as layoutAlgoManagerSingleton, getGroupManager, zoomToFitManager as zoomToFitManagerSingleton, labelEndpointManager as labelEndpointManagerSingleton, getReloadTopoManager } from '../../common/core/managerRegistry';
import { log } from '../../common/logging/webviewLogger';
import { registerCyEventHandlers } from '../../common/webview-ui/cyEventHandlers';
import topoViewerState from '../../common/webview-ui/state';
import type { EdgeData } from '../../common/types/topoViewerGraph';




cytoscape.use(edgehandles);
cytoscape.use(cola);
cytoscape.use(gridGuide);
cytoscape.use(cxtmenu);
cytoscape.use(leaflet);
cytoscape.use(cytoscapeSvg);




/**
 * TopoViewerEditorEngine class is responsible for initializing the Cytoscape instance,
 * managing edge creation, node editing and viewport panels/buttons.
 * entry point for the topology editor webview; methods are called from vscodeHtmlTemplate.ts.
 */
class TopoViewerEditorEngine {
  public cy: cytoscape.Core;
  private cyEvent: cytoscape.EventObject | undefined;
  private eh: any;
  private isEdgeHandlerActive: boolean = false;
  private isViewportDrawerClabEditorChecked: boolean = true; // Editor mode flag

  private messageSender: VscodeMessageSender;
  public saveManager: ManagerSaveTopo;
  public addNodeManager: ManagerAddContainerlabNode;
  private viewportPanels: ManagerViewportPanels;
  public groupManager: ManagerGroupManagement;
  /** Layout manager instance accessible by other components */
  public layoutAlgoManager: ManagerLayoutAlgo;
  public zoomToFitManager: ManagerZoomToFit;
  public labelEndpointManager: ManagerLabelEndpoint;
  public reloadTopoManager: ManagerReloadTopo;
  // eslint-disable-next-line no-unused-vars
  public captureViewportManager: { viewportButtonsCaptureViewportAsSvg: (cy: cytoscape.Core) => void };
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

    // Listen for topology changes
    this.cy.on('add remove data position', autoSave);
  }

  /**
   * Creates an instance of TopoViewerEditorEngine.
   * @param containerId - The ID of the container element for Cytoscape.
   * @throws Will throw an error if the container element is not found.
   */
  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error("Cytoscape container element not found");
    }

    // Initialize message sender
    this.messageSender = new VscodeMessageSender();

    // Detect and apply color scheme
    this.detectColorScheme();

    // Initialize Cytoscape instance
    this.cy = cytoscape({
      container,
      elements: [],
      wheelSensitivity: 2,
    });

    this.cy.on('tap', (event) => {
      this.cyEvent = event as cytoscape.EventObject;
      log.debug(`Cytoscape event: ${event.type}`);
    });

    // Enable grid guide extension (casting cy as any to satisfy TypeScript)
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

      gridSpacing: 10,
      snapToGridCenter: true,

      zoomDash: true,
      panGrid: true,
      gridStackOrder: -1,
      gridColor: '#434343',
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

    loadCytoStyle(this.cy);
    fetchAndLoadData(this.cy, this.messageSender);

    // Fetch and load data from the environment and update the subtitle
    (async () => {
      try {
        const result = await fetchAndLoadDataEnvironment(["clab-name"]);
        this.updateSubtitle(result["clab-name"] || "Unknown");
      } catch (error) {
        log.error(`Error loading lab name: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();

    this.registerEvents();
    this.initializeEdgehandles();
    this.initializeContextMenu();

    // Initiate managers and panels
    this.saveManager = new ManagerSaveTopo(this.messageSender);
    this.addNodeManager = new ManagerAddContainerlabNode();
    this.viewportPanels = new ManagerViewportPanels(this.saveManager, this.cy);
    this.groupManager = getGroupManager(this.cy, 'edit');
    this.groupManager.initializeWheelSelection();
    this.groupManager.initializeGroupManagement();
    this.layoutAlgoManager = layoutAlgoManagerSingleton;
    this.zoomToFitManager = zoomToFitManagerSingleton;
    this.labelEndpointManager = labelEndpointManagerSingleton;
    this.reloadTopoManager = getReloadTopoManager(this.messageSender);

    // Create capture viewport manager with the required method
    this.captureViewportManager = {
      viewportButtonsCaptureViewportAsSvg: (cy: cytoscape.Core) => {
        exportViewportAsSvg(cy);
      }
    };

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
      this.captureViewportManager.viewportButtonsCaptureViewportAsSvg(this.cy);
    window.viewportButtonsReloadTopo = () =>
      this.reloadTopoManager.viewportButtonsReloadTopo(this.cy);
    window.viewportButtonsSaveTopo = () =>
      this.saveManager.viewportButtonsSaveTopo(this.cy);

    this.setupAutoSave();

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg && msg.type === 'yaml-saved') {
        fetchAndLoadData(this.cy, this.messageSender);
      }
    });
  }

  /**
   * Initializes the edgehandles extension with defined options.
   * Enables the edgehandles instance for creating edges.
   * @private
   */
  private initializeEdgehandles(): void {
    const edgehandlesOptions = {
      hoverDelay: 50,
      snap: false,
      snapThreshold: 10,
      snapFrequency: 150,
      noEdgeEventsInDraw: false,
      disableBrowserGestures: false,
      canConnect: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular): boolean => {
        const targetRole = targetNode.data('topoViewerRole');
        return (
          !sourceNode.same(targetNode) &&
          !sourceNode.isParent() &&
          !targetNode.isParent() &&
          targetRole !== 'dummyChild'
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
  private initializeContextMenu(): void {
    const self = this;
    this.cy.cxtmenu({
      selector: 'node[topoViewerRole != "group"][topoViewerRole != "dummyChild"]',
      commands: [
        {
          content: `<div style="display:flex; flex-direction:column; align-items:center; line-height:1;">
                      <i class="fas fa-pen-to-square" style="font-size:1.5em;"></i>
                      <div style="height:0.5em;"></div>
                      <span>Edit Node</span>
                    </div>`,
          select: (ele: cytoscape.Singular) => {
            if (!ele.isNode()) {
              return;
            }
            // inside here TS infers ele is NodeSingular
            this.viewportPanels.panelNodeEditor(ele);
          }
        },
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
      ],
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
      selector: 'node:parent, node[topoViewerRole = "dummyChild"]',
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
            // inside here TS infers ele is NodeSingular
            // this.viewportPanels.panelNodeEditor(ele);
            if (ele.data("topoViewerRole") == "dummyChild") {
              log.debug(`Editing parent of dummyChild: ${ele.parent().first().id()}`);
              this.groupManager.showGroupEditor(ele.parent().first().id());
            } else if (ele.data("topoViewerRole") == "group") {
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
          select: () => {
            this.groupManager.nodeParentRemoval();
          }
        }
      ],
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
            // you’ll need to implement panelEdgeEditor in ManagerViewportPanels
            this.viewportPanels.panelEdgeEditor(ele);
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

  }



  /**
   * Registers event handlers for Cytoscape elements such as canvas, nodes, and edges.
   * @private
   */
  private async registerEvents(): Promise<void> {

    registerCyEventHandlers({
      cy: this.cy,
      onCanvasClick: (event) => {
        const mouseEvent = event.originalEvent as MouseEvent;
        if (mouseEvent.shiftKey && this.isViewportDrawerClabEditorChecked) {
          log.debug('Canvas clicked with Shift key - adding node.');
          this.addNodeManager.viewportButtonsAddContainerlabNode(this.cy, this.cyEvent as cytoscape.EventObject);
        }
      },
      onNodeClick: async (event) => {
        this.viewportPanels.nodeClicked = true; // prevent panels from closing
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
          case originalEvent.shiftKey:
            log.debug(`Shift+click on node: starting edge creation from node: ${extraData?.longname || node.id()}`);
            this.isEdgeHandlerActive = true;
            this.eh.start(node);
            break;
          case originalEvent.altKey && isNodeInEditMode:
            log.debug(`Alt+click on node: deleting node ${extraData?.longname || node.id()}`);
            node.remove();
            break;
          case (node.data("topoViewerRole") == "textbox"):
            break;
          default:
            break;
        }
      },
      onEdgeClick: (event) => {
        this.viewportPanels.edgeClicked = true; // prevent panels from closing
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

    // Edge creation completion via edgehandles.
      this.cy.on('ehcomplete', (_event, sourceNode, targetNode, addedEdge) => {
      log.debug(`Edge created from ${sourceNode.id()} to ${targetNode.id()}`);
      log.debug(`Added edge: ${addedEdge.id()}`);

      setTimeout(() => {
        this.isEdgeHandlerActive = false;
      }, 100);

      const sourceEndpoint = this.getNextEndpoint(sourceNode.id());
      const targetEndpoint = this.getNextEndpoint(targetNode.id());
      addedEdge.data({ sourceEndpoint, targetEndpoint, editor: 'true' });
    });

    // Drag-and-drop reparenting logic is now handled by groupManager.initializeGroupManagement()


  }

  // /**
  //  * Adds a new node at the specified position.
  //  * @param position - The position where the node will be added.
  //  * @public
  //  */
  // public addNodeAtPosition(position: cytoscape.Position): void {
  //   // const newNodeId = `id:nodeId-${this.cy.nodes().length + 1}`;
  //   const newNodeId = `nodeId-${this.cy.nodes().length + 1}`;

  //   const newNodeData: NodeData = {
  //     id: newNodeId,
  //     editor: "true",
  //     weight: "30",
  //     // name: newNodeId.split(":")[1]
  //     name: newNodeId,
  //     parent: "",
  //     topoViewerRole: "pe",
  //     sourceEndpoint: "",
  //     targetEndpoint: "",
  //     containerDockerExtraAttribute: { state: "", status: "" },
  //     extraData: { kind: "nokia_srlinux", longname: "", image: "", mgmtIpv4Addresss: "" },
  // };
  //   this.cy.add({ group: 'nodes', data: newNodeData, position });
  // }

  /**
   * Determines the next available endpoint identifier for a given node.
   * @param nodeId - The ID of the node.
   * @returns The next available endpoint string.
   * @private
   */
  private getNextEndpoint(nodeId: string): string {
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
  public detectColorScheme(): string {
    const darkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.applyTheme(darkMode ? 'dark' : 'light');
    return darkMode ? 'dark' : 'light';
  }

  /**
   * Applies a theme to the root element.
   * @param theme - The theme to apply ("dark" or "light").
   * @private
   */
  private applyTheme(theme: string): void {
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

  /**
   * Dispose of resources held by the engine.
   */
  public dispose(): void {
    this.messageSender.dispose();
  }
}


document.addEventListener('DOMContentLoaded', () => {
  const engine = new TopoViewerEditorEngine('cy');
  // Store the instance for other modules
  topoViewerState.editorEngine = engine;
  topoViewerState.cy = engine.cy;
  // Expose for existing HTML bindings
  window.topoViewerEditorEngine = engine;

  const gm = engine.groupManager;
  window.orphaningNode = gm.orphaningNode.bind(gm);
  window.createNewParent = gm.createNewParent.bind(gm);
  window.panelNodeEditorParentToggleDropdown = gm.panelNodeEditorParentToggleDropdown.bind(gm);
  window.nodeParentPropertiesUpdate = gm.nodeParentPropertiesUpdate.bind(gm);
  window.nodeParentPropertiesUpdateClose = gm.nodeParentPropertiesUpdateClose.bind(gm);
  window.nodeParentRemoval = gm.nodeParentRemoval.bind(gm);
  window.viewportButtonsAddGroup = gm.viewportButtonsAddGroup.bind(gm);
  window.showPanelGroupEditor = gm.showGroupEditor.bind(gm);

  window.addEventListener('unload', () => {
    engine.dispose();
  });
});

export default TopoViewerEditorEngine;
