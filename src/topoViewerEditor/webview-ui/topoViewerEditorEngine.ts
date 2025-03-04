import cytoscape from 'cytoscape';
import edgehandles from 'cytoscape-edgehandles';

import loadCytoStyle from './managerCytoscapeStyle';


cytoscape.use(edgehandles);

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

interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  editor?: string;
}

class TopoViewerEditorEngine {
  private cy: cytoscape.Core;
  private eh: any;
  private isEdgeHandlerActive: boolean = false;
  private isViewportDrawerClabEditorChecked: boolean = true; // Editor mode flag

  /**
   * Creates a new TopoViewerEditorEngine instance.
   * @param containerId - The id of the HTML element that will host the Cytoscape container.
   */
  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error("Cytoscape container element not found");
    }

    // Initialize Cytoscape instance
    this.cy = cytoscape({
      container,
      elements: [
        {
          data:
          {
            id: 'a',
            name: "A",
            topoViewerRole: 'pe'
          }
        },
        {
          data:
          {
            id: 'b',
            name: "B",
            topoViewerRole: 'pe'
          }
        },
        {
          data:
          {
            id: 'c',
            name: "C",
            topoViewerRole: 'pe'
          }
        },
        {
          data:
          {
            id: 'd',
            name: "D",
            topoViewerRole: 'pe'
          }
        },

        { data: { id: 'ab1', source: 'a', target: 'b' } },
        { data: { id: 'ac1', source: 'a', target: 'c' } },

        { data: { id: 'ab2', source: 'a', target: 'b' } },
        { data: { id: 'ac2', source: 'a', target: 'c' } },

        { data: { id: 'ad', source: 'a', target: 'd' } },

        { data: { id: 'bd', source: 'b', target: 'd' } },

        { data: { id: 'cd', source: 'c', target: 'd' } },




      ],

      layout: {
        name: 'grid',
        rows: 1
      }
    });

    this.initializeEdgehandles();
    this.registerEvents();

    // Apply styles once the graph is ready.
    this.loadCytoStyle();
  }


  /**
 * Loads Cytoscape styles by delegating to the external manager function.
 * This method is private to the class.
 */
  private loadCytoStyle(): void {
    loadCytoStyle(this.cy);
  }

  /**
   * Configures and enables the edgehandles plugin.
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
        return !sourceNode.same(targetNode) && !sourceNode.isParent() && !targetNode.isParent();
      },
      edgeParams: (sourceNode: cytoscape.NodeSingular, targetNode: cytoscape.NodeSingular): EdgeData => {
        return {
          id: `${sourceNode.id()}-${targetNode.id()}`,
          source: sourceNode.id(),
          target: targetNode.id(),
        };
      },
    };

    this.eh = (this.cy as any).edgehandles(edgehandlesOptions);
    this.eh.enable();
    this.isEdgeHandlerActive = false;
  }

  /**
   * Registers all event listeners: canvas clicks, node clicks, edge clicks, and edge creation.
   */
  private registerEvents(): void {
    // Canvas click: add node when Shift is held.
    this.cy.on('click', (event) => {
      const mouseEvent = event.originalEvent as MouseEvent;
      if (event.target === this.cy && mouseEvent.shiftKey && this.isViewportDrawerClabEditorChecked) {
        console.log("Canvas clicked with Shift key - adding node.");
        this.addNodeAtPosition(event.position);
      }
    });

    // Node click: handle orphaning, edge creation, and deletion using a switch-case.
    this.cy.on('click', 'node', (event) => {
      const node = event.target;
      console.info("Node clicked:", node.id());
      const originalEvent = event.originalEvent as MouseEvent;
      const extraData = node.data("extraData");
      const isNodeInEditMode = node.data("editor") === "true";

      switch (true) {
        case originalEvent.ctrlKey && node.isChild():
          console.info(`Orphaning node: ${node.id()} from parent: ${node.parent().id()}`);
          node.move({ parent: null });
          break;

        case originalEvent.shiftKey:
          console.info("Shift+click on node: starting edge creation from node:", extraData?.longname || node.id());
          this.isEdgeHandlerActive = true;
          this.eh.start(node);
          break;

        case originalEvent.altKey && isNodeInEditMode:
          console.info("Alt+click on node: deleting node", extraData?.longname || node.id());
          node.remove();
          // TODO: Persist the node deletion if necessary
          break;

        default:
          break;
      }
    });

    // Edge click: delete edge when Alt is held.
    this.cy.on('click', 'edge', (event) => {
      const edge = event.target;
      const originalEvent = event.originalEvent as MouseEvent;
      switch (true) {
        case originalEvent.altKey && this.isViewportDrawerClabEditorChecked:
          console.info("Alt+click on edge: deleting edge", edge.id());
          edge.remove();
          // TODO: Persist the edge deletion if necessary
          break;
        default:
          break;
      }
    });

    // Edge creation completion via edgehandles.
    this.cy.on('ehcomplete', (event, sourceNode, targetNode, addedEdge) => {
      console.info(`Edge created from ${sourceNode.id()} to ${targetNode.id()}`);
      console.info("Added edge:", addedEdge);

      // Reset the edge handler flag after a short delay.
      setTimeout(() => {
        this.isEdgeHandlerActive = false;
      }, 100);

      // Calculate endpoints for the new edge.
      const sourceEndpoint = this.getNextEndpoint(sourceNode.id());
      const targetEndpoint = this.getNextEndpoint(targetNode.id());

      addedEdge.data({
        sourceEndpoint,
        targetEndpoint,
        editor: 'true',
      });

      // TODO: Persist the edge if necessary
    });
  }

  /**
   * Adds a new node at the specified position.
   * @param position - The position to place the new node.
   */
  private addNodeAtPosition(position: cytoscape.Position): void {
    const newNodeId = `nodeId-${this.cy.nodes().length + 1}`;
    const newNodeData: NodeData = {
      id: newNodeId,
      editor: "true",
      weight: "30",
      name: newNodeId,
      parent: "",
      topoViewerRole: "pe",
      sourceEndpoint: "",
      targetEndpoint: "",
      containerDockerExtraAttribute: { state: "", status: "" },
      extraData: { kind: "container", longname: "", image: "", mgmtIpv4Addresss: "" },
    };

    this.cy.add({
      group: 'nodes',
      data: newNodeData,
      position,
    });
  }

  /**
   * Determines the next available endpoint string for a given node.
   * @param nodeId - The id of the node.
   * @returns The next endpoint string (e.g., "e1-2" or "eth2").
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
   * Detects the user's preferred color scheme.
   * @returns {string} "dark" or "light"
   */
  private detectColorScheme(): string {
    // Use the Window matchMedia API.
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light";
  }
}

// Instantiate the TopoViewerEditorEngine when the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', () => {
  // Ensure that your HTML includes an element with id "cy" and proper CSS dimensions.
  new TopoViewerEditorEngine('cy');
});

export default TopoViewerEditorEngine;
