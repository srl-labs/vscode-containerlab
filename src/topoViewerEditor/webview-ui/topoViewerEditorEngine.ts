// file: topoViewerEditorEngine.ts

import cytoscape from 'cytoscape';
import edgehandles from 'cytoscape-edgehandles';
import cola from 'cytoscape-cola';
import gridGuide from 'cytoscape-grid-guide';

import loadCytoStyle from './managerCytoscapeStyle';
import { fetchAndLoadData, fetchAndLoadDataEnvironment } from './managerCytoscapeFetchAndLoad';
import { ManagerViewportButtons } from './managerViewportButtons';
import { ManagerViewportPanels } from './managerViewportPanels';

cytoscape.use(edgehandles);
cytoscape.use(cola);
cytoscape.use(gridGuide);

/**
 * Interface representing node data.
 */
interface NodeData {
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
    longname?: string;
    image?: string;
    mgmtIpv4Addresss?: string;
  };
}

/**
 * Interface representing edge data.
 */
interface EdgeData {
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
 */
class TopoViewerEditorEngine {
  private cy: cytoscape.Core;
  private eh: any;
  private isEdgeHandlerActive: boolean = false;
  private isViewportDrawerClabEditorChecked: boolean = true; // Editor mode flag

  private viewportButtons: ManagerViewportButtons;
  private viewportPanels: ManagerViewportPanels;

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

    // Detect and apply color scheme
    this.detectColorScheme();

    // Initialize Cytoscape instance
    this.cy = cytoscape({
      container,
      elements: [],
      wheelSensitivity: 0.2,
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
    fetchAndLoadData(this.cy);

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

    // Initiate viewport buttons and panels
    this.viewportButtons = new ManagerViewportButtons();
    this.viewportPanels = new ManagerViewportPanels(this.viewportButtons, this.cy);
    this.viewportPanels.registerTogglePanels(containerId);
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
      canConnect: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular): boolean =>
        !sourceNode.same(targetNode) && !sourceNode.isParent() && !targetNode.isParent(),
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
   * Registers event handlers for Cytoscape elements such as canvas, nodes, and edges.
   * @private
   */
  private async registerEvents(): Promise<void> {
    // Canvas click: add node when Shift is held.
    this.cy.on('click', (event) => {
      const mouseEvent = event.originalEvent as MouseEvent;
      if (event.target === this.cy && mouseEvent.shiftKey && this.isViewportDrawerClabEditorChecked) {
        console.log("Canvas clicked with Shift key - adding node.");
        this.addNodeAtPosition(event.position);
      } else {
        this.viewportButtons.viewportButtonsSaveTopo(this.cy);
      }
    });

    // Node click: handle orphaning, edge creation, and deletion.
    this.cy.on('click', 'node', async (event) => {
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
        // Open node editor for a normal click.
        case !originalEvent.shiftKey:
          console.info("Opening node editor for node:", extraData?.longname || node.id());
          await this.viewportPanels.panelNodeEditor(node);
          break;
        default:
          break;
      }
    });

    // Edge click: delete edge when Alt is held.
    this.cy.on('click', 'edge', (event) => {
      const edge = event.target;
      const originalEvent = event.originalEvent as MouseEvent;
      if (originalEvent.altKey && this.isViewportDrawerClabEditorChecked) {
        console.info("Alt+click on edge: deleting edge", edge.id());
        edge.remove();
      }
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
  }

  /**
   * Adds a new node at the specified position.
   * @param position - The position where the node will be added.
   * @private
   */
  private addNodeAtPosition(position: cytoscape.Position): void {
    const newNodeId = `id:nodeId-${this.cy.nodes().length + 1}`;
    const newNodeData: NodeData = {
      id: newNodeId,
      editor: "true",
      weight: "30",
      name: newNodeId.split(":")[1],
      parent: "",
      topoViewerRole: "pe",
      sourceEndpoint: "",
      targetEndpoint: "",
      containerDockerExtraAttribute: { state: "", status: "" },
      extraData: { kind: "nokia_srlinux", longname: "", image: "", mgmtIpv4Addresss: "" },
    };
    this.cy.add({ group: 'nodes', data: newNodeData, position });
  }

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
}

document.addEventListener('DOMContentLoaded', () => {
  // Create and store the instance globally
  (window as any).topoViewerEditorEngine = new TopoViewerEditorEngine('cy');
});

export default TopoViewerEditorEngine;
