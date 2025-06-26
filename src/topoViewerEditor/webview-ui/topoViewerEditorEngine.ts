// file: topoViewerEditorEngine.ts

import cytoscape from 'cytoscape';
import edgehandles from 'cytoscape-edgehandles';
import cola from 'cytoscape-cola';
import gridGuide from 'cytoscape-grid-guide';
import leaflet from 'cytoscape-leaf';
// Import and register context-menu plugin
import cxtmenu from 'cytoscape-cxtmenu';
// import 'cytoscape-cxtmenu/cytoscape-cxtmenu.css';

import loadCytoStyle from './managerCytoscapeStyle';
import { VscodeMessageSender } from './managerVscodeWebview';
import { fetchAndLoadData, fetchAndLoadDataEnvironment } from './managerCytoscapeFetchAndLoad';
import { ManagerViewportButtons } from './managerViewportButtons';
import { ManagerViewportPanels } from './managerViewportPanels';
import { ManagerGroupManager } from './managerGroupManager';
import { ManagerLayoutAlgo } from './managerLayoutAlgo';




cytoscape.use(edgehandles);
cytoscape.use(cola);
cytoscape.use(gridGuide);
cytoscape.use(cxtmenu);
cytoscape.use(leaflet);



/**
 * Interface representing node data.
 */
export interface NodeData {
  id: string;
  editor?: string;
  weight?: string;
  name?: string;
  parent?: string;
  topoViewerRole?: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  containerDockerExtraAttribute?: {
    state?: string;
    status?: string;
  };
  extraData?: {
    kind?: string;
    image?: string;
    type?: string
    longname?: string;
    mgmtIpv4Address?: string;
  };
}

/**
 * Interface representing edge data.
 */
export interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  editor?: string;
}

/**
 * TopoViewerEditorEngine class is responsible for initializing the Cytoscape instance,
 * managing edge creation, node editing and viewport panels/buttons.
 * entry point for the topology editor webview; methods are called from vscodeHtmlTemplate.ts.
 */
class TopoViewerEditorEngine {
  private cy: cytoscape.Core;
  private cyEvent: cytoscape.EventObject | undefined;
  private eh: any;
  private isEdgeHandlerActive: boolean = false;
  private isViewportDrawerClabEditorChecked: boolean = true; // Editor mode flag

  private messageSender: VscodeMessageSender;
  private viewportButtons: ManagerViewportButtons;
  private viewportPanels: ManagerViewportPanels;
  private groupManager: ManagerGroupManager = new ManagerGroupManager();
  /** Layout manager instance accessible by other components */
  public layoutAlgoManager: ManagerLayoutAlgo = new ManagerLayoutAlgo();



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
      await this.viewportButtons.viewportButtonsSaveTopo(this.cy, suppressNotification);
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
      console.log("Cytoscape event:", event);
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
        console.error("Error loading lab name:", error);
      }
    })();

    this.registerEvents();
    this.initializeEdgehandles();
    this.initializeContextMenu();

    // Initiate viewport buttons and panels
    this.viewportButtons = new ManagerViewportButtons(this.messageSender);
    this.viewportPanels = new ManagerViewportPanels(this.viewportButtons, this.cy, this.messageSender);
    this.groupManager = new ManagerGroupManager();
    this.layoutAlgoManager = new ManagerLayoutAlgo();

    // Expose layout functions globally for HTML event handlers
    (window as any).viewportButtonsLayoutAlgo = this.layoutAlgoManager.viewportButtonsLayoutAlgo.bind(this.layoutAlgoManager);
    (window as any).layoutAlgoChange = this.layoutAlgoManager.layoutAlgoChange.bind(this.layoutAlgoManager);
    (window as any).viewportDrawerLayoutGeoMap = this.layoutAlgoManager.viewportDrawerLayoutGeoMap.bind(this.layoutAlgoManager);
    (window as any).viewportDrawerDisableGeoMap = this.layoutAlgoManager.viewportDrawerDisableGeoMap.bind(this.layoutAlgoManager);
    (window as any).viewportDrawerLayoutForceDirected = this.layoutAlgoManager.viewportDrawerLayoutForceDirected.bind(this.layoutAlgoManager);
    (window as any).viewportDrawerLayoutForceDirectedRadial = this.layoutAlgoManager.viewportDrawerLayoutForceDirectedRadial.bind(this.layoutAlgoManager);
    (window as any).viewportDrawerLayoutVertical = this.layoutAlgoManager.viewportDrawerLayoutVertical.bind(this.layoutAlgoManager);
    (window as any).viewportDrawerLayoutHorizontal = this.layoutAlgoManager.viewportDrawerLayoutHorizontal.bind(this.layoutAlgoManager);
    (window as any).viewportDrawerPreset = this.layoutAlgoManager.viewportDrawerPreset.bind(this.layoutAlgoManager);
    (window as any).viewportButtonsGeoMapPan = this.layoutAlgoManager.viewportButtonsGeoMapPan.bind(this.layoutAlgoManager);
    (window as any).viewportButtonsGeoMapEdit = this.layoutAlgoManager.viewportButtonsGeoMapEdit.bind(this.layoutAlgoManager);

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
      edgeParams: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular): EdgeData => ({
        id: `${sourceNode.id()}-${targetNode.id()}`,
        source: sourceNode.id(),
        target: targetNode.id(),
      }),
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
      openMenuEvents: 'cxttapstart taphold', // space-separated cytoscape events that will open the menu; only `cxttapstart` and/or `taphold` work here
      itemColor: 'white', // the colour of text in the command's content
      itemTextShadowColor: 'rgba(61, 62, 64, 1)', // the text shadow colour of the command's content
      zIndex: 9999, // the z-index of the ui div
      atMouse: false, // draw menu at mouse position
      outsideMenuCancel: false // if set to a number, this will cancel the command if the pointer
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
              console.info("Editing parent of dummyChild: ", ele.parent().first().id());
              // this.viewportButtons.viewportButtonsPanelGroupManager.panelGroupTogle(ele.parent().first().id());
              this.groupManager.panelGroupToggle(ele.parent().first().id());
            } else if (ele.data("topoViewerRole") == "group") {
              // this.viewportButtons.viewportButtonsPanelGroupManager.panelGroupTogle(ele.id());
              this.groupManager.panelGroupToggle(ele.id());
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
            //this.viewportButtons.viewportButtonsPanelGroupManager.nodeParentRemoval(this.cy);
            this.groupManager.nodeParentRemoval(this.cy);
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
      openMenuEvents: 'cxttapstart taphold', // space-separated cytoscape events that will open the menu; only `cxttapstart` and/or `taphold` work here
      itemColor: 'white', // the colour of text in the command's content
      itemTextShadowColor: 'rgba(61, 62, 64, 1)', // the text shadow colour of the command's content
      zIndex: 9999, // the z-index of the ui div
      atMouse: false, // draw menu at mouse position
      outsideMenuCancel: false // if set to a number, this will cancel the command if the pointer
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
      openMenuEvents: 'cxttapstart taphold', // space-separated cytoscape events that will open the menu; only `cxttapstart` and/or `taphold` work here
      itemColor: 'white', // the colour of text in the command's content
      itemTextShadowColor: 'rgba(61, 62, 64, 1)', // the text shadow colour of the command's content
      zIndex: 9999, // the z-index of the ui div
      atMouse: false, // draw menu at mouse position
      outsideMenuCancel: 10 // if set to a number, this will cancel the command if the pointer
    });

  }



  /**
   * Registers event handlers for Cytoscape elements such as canvas, nodes, and edges.
   * @private
   */
  private async registerEvents(): Promise<void> {

    // Canvas click: add node when Shift is held.
    this.cy.on('click', (event) => {
      const mouseEvent = event.originalEvent as MouseEvent;
      if (event.target === this.cy && mouseEvent.shiftKey && this.isViewportDrawerClabEditorChecked) {
        console.log("Canvas clicked with Shift key - adding node.");
        this.viewportButtons.viewportButtonsAddContainerlabNode(this.cy, this.cyEvent as cytoscape.EventObject);
      }
    });

    // Node click: handle orphaning, edge creation, and deletion.
    this.cy.on('click', 'node', async (event) => {
      this.viewportPanels.nodeClicked = true; // Set flag to true when a node is clicked, passed to viewportPanels; this is used to prevent the viewport panels from closing when a node is clicked.
      const node = event.target;
      console.info("Node clicked:", node.id());
      const originalEvent = event.originalEvent as MouseEvent;
      const extraData = node.data("extraData");
      const isNodeInEditMode = node.data("editor") === "true";

      switch (true) {
        // Remove node from parent if Ctrl is pressed and node is a child.
        case originalEvent.ctrlKey && node.isChild():
          console.info(`Orphaning node: ${node.id()} from parent: ${node.parent().id()}`);
          node.move({ parent: null });
          break;
        // Start edge creation if Shift is pressed.
        case originalEvent.shiftKey:
          console.info("Shift+click on node: starting edge creation from node:", extraData?.longname || node.id());
          this.isEdgeHandlerActive = true;
          this.eh.start(node);
          break;
        // Delete node if Alt is pressed and node is in edit mode.
        case originalEvent.altKey && isNodeInEditMode:
          console.info("Alt+click on node: deleting node", extraData?.longname || node.id());
          node.remove();
          break;

        case (node.data("topoViewerRole") == "textbox"):
          break;

        // case (node.data("topoViewerRole") == "dummyChild"):
        //   console.info("Editing parent of dummyChiled: ", node.parent().id());
        //   this.viewportButtons.viewportButtonsPanelGroupManager.panelGroupTogle(node.parent().id());
        //   break;
        // // If the node is a parent, open the panel for that parent.
        // case node.isParent():
        //   console.info("Editing existing parent node: ", node.id());
        //   this.viewportButtons.viewportButtonsPanelGroupManager.panelGroupTogle(node.id());
        //   break;
        default:
          break;
      }
    });

    // Edge click: delete edge when Alt is held.
    this.cy.on('click', 'edge', (event) => {
      this.viewportPanels.edgeClicked = true; // Set flag to true when a edge is clicked, passed to viewportPanels; this is used to prevent the viewport panels from closing when a edge is clicked.
      const edge = event.target;
      const originalEvent = event.originalEvent as MouseEvent;
      if (originalEvent.altKey && this.isViewportDrawerClabEditorChecked) {
        console.info("Alt+click on edge: deleting edge", edge.id());
        edge.remove();
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
    this.cy.on('ehcomplete', (event, sourceNode, targetNode, addedEdge) => {
      console.info(`Edge created from ${sourceNode.id()} to ${targetNode.id()}`);
      console.info("Added edge:", addedEdge);

      setTimeout(() => {
        this.isEdgeHandlerActive = false;
      }, 100);

      const sourceEndpoint = this.getNextEndpoint(sourceNode.id());
      const targetEndpoint = this.getNextEndpoint(targetNode.id());
      addedEdge.data({ sourceEndpoint, targetEndpoint, editor: 'true' });
    });

    // Drag-and-drop reparenting logic
    this.cy.on('dragfree', 'node', (event) => {
      // aarafat-tag: keep this commented out for now, will be used later(when TopoViewer and TopoEditor merged) to identify if the node is in clab editor mode.
      // const isViewportDrawerClabEditorCheckboxChecked = this.isViewportDrawerClabEditorChecked;
      // if (!isViewportDrawerClabEditorCheckboxChecked) return;

      const draggedNode = event.target;

      let assignedParent: cytoscape.NodeSingular | undefined
      this.cy.nodes(':parent').forEach((el) => {
        const parent = el as cytoscape.NodeSingular;

        if (this.isNodeInsideParent(draggedNode, parent)) {
          assignedParent = parent;
        }
      });

      if (assignedParent) {
        draggedNode.move({ parent: assignedParent.id() });
        console.info(`${draggedNode.id()} became a child of ${assignedParent.id()}`);

        const dummyChild = assignedParent.children('[topoViewerRole = "dummyChild"]');

        if (dummyChild.length > 0) {
          const realChildren = assignedParent.children().not(dummyChild);
          if (realChildren.length > 0) {
            dummyChild.remove();
            console.log("Dummy child removed");
          } else {
            console.log("No real children present, dummy child remains");
          }
        }
      }

      // Remove empty group nodes
      this.cy.nodes('[topoViewerRole = "group"]').forEach((parentNode) => {
        if (parentNode.children().empty()) {
          parentNode.remove();
        }
      });
    });


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
    const edges = this.cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);
    const e1Pattern = /^e1-(\d+)$/;
    const ethPattern = /^eth(\d+)$/;
    const usedNumbers = new Set<number>();
    let selectedPattern: RegExp | null = null;

    edges.forEach(edge => {
      ['sourceEndpoint', 'targetEndpoint'].forEach(key => {
        const endpoint = edge.data(key);
        const isNodeEndpoint =
          (edge.data('source') === nodeId && key === 'sourceEndpoint') ||
          (edge.data('target') === nodeId && key === 'targetEndpoint');
        if (!endpoint || !isNodeEndpoint) return;
        let match = endpoint.match(e1Pattern);
        if (match) {
          usedNumbers.add(parseInt(match[1], 10));
          if (!selectedPattern) selectedPattern = e1Pattern;
        } else {
          match = endpoint.match(ethPattern);
          if (match) {
            usedNumbers.add(parseInt(match[1], 10));
            if (!selectedPattern) selectedPattern = ethPattern;
          }
        }
      });
    });

    if (!selectedPattern) {
      selectedPattern = e1Pattern;
    }

    let endpointNum = 1;
    while (usedNumbers.has(endpointNum)) {
      endpointNum++;
    }

    return selectedPattern === e1Pattern ? `e1-${endpointNum}` : `eth${endpointNum}`;
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
      console.log("Applied Theme:", theme);
    } else {
      console.warn("'root' element not found; cannot apply theme:", theme);
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
      console.warn("Subtitle element not found");
    }
  }

  /**
 * Checks whether a node is inside the bounding box of a parent node.
 * @param node - The node being moved.
 * @param parent - The potential parent node.
 * @returns True if node is visually inside parent.
 */
  private isNodeInsideParent(node: cytoscape.NodeSingular, parent: cytoscape.NodeSingular): boolean {
    const parentBox = parent.boundingBox();
    const nodePos = node.position();

    return (
      nodePos.x >= parentBox.x1 &&
      nodePos.x <= parentBox.x2 &&
      nodePos.y >= parentBox.y1 &&
      nodePos.y <= parentBox.y2
    );
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
  // Create and store the instance globally
  (window as any).topoViewerEditorEngine = engine;

  window.addEventListener('unload', () => {
    engine.dispose();
  });
});

export default TopoViewerEditorEngine;
