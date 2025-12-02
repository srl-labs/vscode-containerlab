import { VscodeMessageSender } from '../core/VscodeMessaging';
import { ManagerGroupStyle } from '../groups/GroupStyleManager';
import { ManagerFreeText } from '../annotations/FreeTextManager';
import { ManagerFreeShapes } from '../annotations/FreeShapesManager';
import loadCytoStyle from '../cytoscape/BaseStyles';
import { isSpecialEndpoint } from '../shared/utilities/SpecialNodes';
import { log } from '../logging/logger';
import { TopologyAnnotations } from '../shared/types/topoViewerGraph';
import { getUniqueId } from '../ui/IdUtils';

// Constants for copy/paste operations
const PASTE_OFFSET = {
  X: 20,
  Y: 20
} as const;


interface CopyData {
  elements: any[];
  annotations: TopologyAnnotations;
  originalCenter: { x: number; y: number };
}

/**
 * Manages copy, paste, and duplicate operations for topology elements.
 */
export class CopyPasteManager {
  private cy: any;
  private messageSender: VscodeMessageSender;
  private groupStyleManager: ManagerGroupStyle;
  private freeTextManager: ManagerFreeText;
  private freeShapesManager: ManagerFreeShapes | null = null;
  private pasteCounter: number = 0;
  private lastPasteCenter: { x: number; y: number } | null = null;

  constructor(
    cy: any,
    messageSender: VscodeMessageSender,
    groupStyleManager: ManagerGroupStyle,
    freeTextManager: ManagerFreeText
  ) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.groupStyleManager = groupStyleManager;
    this.freeTextManager = freeTextManager;
    this.pasteCounter = 0;
    this.lastPasteCenter = null;
  }

  /**
   * Sets the free shapes manager for copy/paste operations.
   * Called after initialization since freeShapesManager may be created later.
   */
  public setFreeShapesManager(manager: ManagerFreeShapes): void {
    this.freeShapesManager = manager;
  }

  /**
   * Handles copy operation for selected elements.
   * Collects selected nodes, edges, and annotations, then sends to VSCode for storage.
   */
  public handleCopy(): void {
    const copyData = this.getCopyData();
    if (copyData) {
      this.messageSender.sendMessageToVscodeEndpointPost('copyElements', copyData);
      this.pasteCounter = 0;
      this.lastPasteCenter = null;
    }
  }

  /**
   * Handles paste operation by requesting copied elements from VSCode.
   */
  public async handlePaste(): Promise<void> {
    this.messageSender.sendMessageToVscodeEndpointPost('getCopiedElements', '');
  }

  /**
   * Handles duplicate operation by immediately pasting the current selection.
   * @returns The collection of newly created elements.
   */
  public handleDuplicate(): any {
    const copyData = this.getCopyData();
    return copyData ? this.performPaste(copyData) : this.cy.collection();
  }

  /**
   * Collects data for copy operation including elements and annotations.
   * @returns Copy data containing elements, annotations, and original center position.
   */
  private getCopyData(): CopyData | null {
    const selected = this.cy.$(':selected');
    if (selected.empty()) return null;

    let nodes = selected.nodes().union(selected.nodes().descendants());
    nodes = nodes.union(nodes.connectedNodes().filter((n: any) => isSpecialEndpoint(n.id()) && n.edgesWith(nodes).size() > 0));

    const elements = nodes.union(nodes.edgesWith(nodes)).jsons();
    const bb = nodes.boundingBox();
    const originalCenter = { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 };

    // Collect annotations from managers
    const annotations: TopologyAnnotations = {
      groupStyleAnnotations: nodes.filter('[topoViewerRole = "group"]').map((n: any) => ({
        id: n.id(),
        ...this.groupStyleManager.getStyle(n.id())
      })),
      freeTextAnnotations: nodes.filter('[topoViewerRole = "freeText"]').map((node: any) => {
        const allAnnotations = this.freeTextManager.getAnnotations();
        return allAnnotations.find(annotation => annotation.id === node.id());
      }).filter(Boolean),
      freeShapeAnnotations: nodes.filter('[topoViewerRole = "freeShape"]').map((node: any) => {
        return node.data('freeShapeData');
      }).filter(Boolean),
      cloudNodeAnnotations: [],
      nodeAnnotations: []
    };

    return { elements, annotations, originalCenter };
  }

  /**
   * Creates new elements with unique IDs and applies positioning offsets.
  * @param data - The copy data containing elements and annotations.
  * @returns The collection of newly added elements.
  */
  public performPaste(data: CopyData): any {
    if (!data?.elements?.length) {
      return this.cy.collection();
    }

    const { newElements, idMap } = this.buildNewElements(data.elements);

    if (data.originalCenter) {
      this.applyPasteOffsetAndCenter(newElements, data.originalCenter);
    }

    const added = this.cy.add(newElements);
    this.postProcess(added, idMap, data.annotations);

    const pastedAnnotationIds = this.pasteAnnotations(data.annotations, data.originalCenter);

    this.cy.$(':selected').unselect();
    added.select();
    // Also select pasted annotation nodes (freeText, freeShapes)
    pastedAnnotationIds.forEach(id => {
      const node = this.cy.$id(id);
      if (node && node.length > 0) {
        node.select();
      }
    });
    this.pasteCounter++;
    return added;
  }

  /**
   * Build new node and edge elements based on copied data.
   * @param elements - Array of copied elements.
   * @returns Object containing new elements array and id map.
   */
  private buildNewElements(elements: any[]): { newElements: any[]; idMap: Map<string, string> } {
    const idMap = new Map<string, string>();
    const usedIds = new Set<string>(this.cy.nodes().map((n: any) => n.id()));
    const usedNames = new Set<string>(this.cy.nodes().map((n: any) => n.data('name')));
    const newElements: any[] = [];

    elements.forEach(el => {
      if (el.group === 'nodes' && el.data.topoViewerRole !== 'freeText' && el.data.topoViewerRole !== 'freeShape') {
        const { newNode, newId, nodeName } = this.createNode(el, usedIds, usedNames);
        idMap.set(el.data.id, newId);
        usedIds.add(newId);
        usedNames.add(nodeName);
        newElements.push(newNode);
      }
    });

    newElements.forEach(el => {
      if (el.data.parent && idMap.has(el.data.parent)) {
        el.data.parent = idMap.get(el.data.parent);
      }
    });

    elements.forEach(el => {
      if (el.group === 'edges' && idMap.has(el.data.source) && idMap.has(el.data.target)) {
        const src = idMap.get(el.data.source)!;
        const tgt = idMap.get(el.data.target)!;
        newElements.push({ group: 'edges', data: { ...el.data, id: `${src}-${tgt}`, source: src, target: tgt } });
      }
    });

    return { newElements, idMap };
  }

  /**
   * Create a node element with a unique id and name.
   * @param el - Original element.
   * @param usedIds - Set of ids already used in the graph.
   * @param usedNames - Set of names already used in the graph.
   */
  // eslint-disable-next-line aggregate-complexity/aggregate-complexity
  private createNode(el: any, usedIds: Set<string>, usedNames: Set<string>) {
    const isTemplateNode = el.data.id.startsWith('nodeId-');
    let newId: string;
    let nodeName: string;

    if (isTemplateNode && el.data.name) {
      nodeName = this.getUniqueId(el.data.name, usedNames, false);
      const existingNodeIds = Array.from(usedIds).filter(id => id.startsWith('nodeId-'));
      const maxId = existingNodeIds
        .map(id => parseInt(id.replace('nodeId-', ''), 10))
        .filter(num => !isNaN(num))
        .reduce((max, current) => Math.max(max, current), 0);
      newId = `nodeId-${maxId + 1}`;
    } else {
      const isGroup = el.data.topoViewerRole === 'group';
      newId = this.getUniqueId(el.data.name || el.data.id, usedIds, isGroup);
      if (isGroup) {
        nodeName = el.data.name || el.data.label || newId.split(':')[0];
      } else {
        nodeName = newId;
      }
    }

    let nodeLabel = el.data.label || nodeName;
    if (newId.startsWith('dummy')) {
      nodeName = 'dummy';
      nodeLabel = 'dummy';
    } else if (isSpecialEndpoint(newId) && newId.includes(':')) {
      nodeName = newId;
      nodeLabel = newId;
    }

    const newData = {
      ...el.data,
      id: newId,
      name: nodeName,
      label: nodeLabel
    };

    // Record provenance for copy/paste
    this.addCopyFromProvenance(newData, el);

    if (el.data.topoViewerRole === 'group' && newData.extraData) {
      const [group, level] = newId.split(':');
      newData.extraData.topoViewerGroup = group;
      newData.extraData.topoViewerGroupLevel = level;
    }

    const newNode = { group: 'nodes', data: newData, position: { ...el.position } };
    return { newNode, newId, nodeName };
  }

  /**
   * Generates a unique ID based on the base name and existing IDs.
   * For groups, appends ":1" suffix. For regular nodes, increments numeric suffix.
   * For network-nodes (host:eth0, macvlan:eth1, etc.), preserves the adapter suffix.
   * @param baseName - The base name to generate unique ID from.
   * @param usedIds - Set of already used IDs to avoid conflicts.
   * @param isGroup - Whether this is a group node requiring special formatting.
   * @returns A unique ID string.
   */
  private getUniqueId(baseName: string, usedIds: Set<string>, isGroup: boolean): string {
    return getUniqueId(baseName, usedIds, isGroup);
  }

  /**
   * Adds copy/paste provenance to the new node's extraData.
   * Stores the source Cytoscape node id at copy time as copyFrom.
   */
  private addCopyFromProvenance(newData: any, sourceEl: any): void {
    const sourceId = String(sourceEl?.data?.id || '');
    if (!sourceId) return;
    newData.extraData = { ...(newData.extraData || {}), copyFrom: sourceId };
  }


  /**
   * Calculates the position delta for paste operations.
   * First paste centers to viewport, subsequent pastes offset by PASTE_OFFSET.
   * @param originalCenter - The original center position of copied elements.
   * @returns Delta object with deltaX and deltaY, or null if calculation fails.
   */
  private _getPasteDelta(originalCenter: { x: number, y: number }): { deltaX: number, deltaY: number } | null {
    let deltaX: number;
    let deltaY: number;

    if (this.pasteCounter === 0) {
      const viewport = this.cy.extent();
      const viewportCenter = { x: (viewport.x1 + viewport.w / 2), y: (viewport.y1 + viewport.h / 2) };
      deltaX = viewportCenter.x - originalCenter.x;
      deltaY = viewportCenter.y - originalCenter.y;
    } else if (this.lastPasteCenter) {
      deltaX = this.lastPasteCenter.x + PASTE_OFFSET.X - originalCenter.x;
      deltaY = this.lastPasteCenter.y + PASTE_OFFSET.Y - originalCenter.y;
    } else {
      return null;
    }
    return { deltaX, deltaY };
  }


  /**
   * Applies position offset to pasted elements and updates the last paste center.
   * @param elements - Array of elements to position.
   * @param originalCenter - The original center position of the copied elements.
   */
  private applyPasteOffsetAndCenter(elements: any[], originalCenter: { x: number, y: number }): void {
    const positioned = elements.filter(el => el.position);
    if (!positioned.length) return;

    const delta = this._getPasteDelta(originalCenter);
    if (!delta) {
      return;
    }
    const { deltaX, deltaY } = delta;

    positioned.forEach(el => {
      el.position.x += deltaX;
      el.position.y += deltaY;
    });

    // Update lastPasteCenter for subsequent pastes
    const newBounds = positioned.reduce((acc, el) => ({
      minX: Math.min(acc.minX, el.position.x), maxX: Math.max(acc.maxX, el.position.x),
      minY: Math.min(acc.minY, el.position.y), maxY: Math.max(acc.maxY, el.position.y)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

    this.lastPasteCenter = { x: (newBounds.minX + newBounds.maxX) / 2, y: (newBounds.minY + newBounds.maxY) / 2 };
  }

  /**
   * Post-processes newly added elements by applying styles, endpoints, and group management.
   * @param added - The collection of newly added elements.
   * @param idMap - Map of old IDs to new IDs for annotation updates.
   * @param annotations - The annotations to apply to the new elements.
   */
  private postProcess(added: any, idMap: Map<string, string>, annotations: TopologyAnnotations): void {
    loadCytoStyle(this.cy).then(() => {
      // After styles are reloaded, reapply shape-specific styles to prevent dimension reset
      this.freeShapesManager?.reapplyAllShapeStyles();
    }).catch((error) => {
      log.error(`Failed to load cytoscape styles during paste operation: ${error}`);
    });

    // Apply group styles from annotations
    try {
      annotations.groupStyleAnnotations?.forEach(style => {
        const newId = idMap.get(style.id);
        if (newId) {
          this.groupStyleManager.updateGroupStyle(newId, style);
        }
      });

      // Apply all group styles to ensure proper rendering
      this.groupStyleManager.getGroupStyles()?.forEach((s: any) =>
        this.groupStyleManager.applyStyleToNode(s.id)
      );
    } catch (error) {
      log.error(`Failed to apply group styles during paste operation: ${error}`);
    }

    // Add endpoints and mark edges as editor-created
    added.edges().forEach((edge: any) => {
      const [src, tgt] = [edge.data('source'), edge.data('target')];
      // Only add endpoint identifiers for regular nodes, not for special endpoints
      if (!edge.data('sourceEndpoint')) {
        edge.data('sourceEndpoint', isSpecialEndpoint(src) ? '' : this.getNextEndpoint(src));
      }
      if (!edge.data('targetEndpoint')) {
        edge.data('targetEndpoint', isSpecialEndpoint(tgt) ? '' : this.getNextEndpoint(tgt));
      }
      edge.data('editor', 'true');
      if (isSpecialEndpoint(src) || isSpecialEndpoint(tgt)) edge.addClass('stub-link');
    });
  }

  /**
   * Determines the next available endpoint identifier for a given node.
   * Scans existing connected edges to find the next unused endpoint number.
   * @param nodeId - The ID of the node to generate an endpoint for.
   * @returns The next available endpoint string (e.g., "ep1", "ep2").
   */
  private getNextEndpoint(nodeId: string): string {
    const node = this.cy.$id(nodeId);
    if (node.empty()) return 'ep1';

    const usedNums = new Set(node.connectedEdges().map((e: any) => {
      const ep = e.data().source === nodeId ? e.data().sourceEndpoint : e.data().targetEndpoint;
      if (!ep || typeof ep !== 'string') return 0;
      let i = ep.length - 1;
      while (i >= 0 && ep[i] >= '0' && ep[i] <= '9') i--;
      const digits = ep.slice(i + 1);
      return digits ? parseInt(digits, 10) : 0;
    }).filter((n: number) => n > 0));

    let num = 1;
    while (usedNums.has(num)) num++;
    return `ep${num}`;
  }

  /**
   * Handle annotation pasting directly with managers
   * @param annotations - The annotations to paste.
   * @param originalCenter - The original center position for calculating deltas.
   * @returns Array of IDs of pasted annotation nodes.
   */
  private pasteAnnotations(annotations: TopologyAnnotations, originalCenter: { x: number; y: number }): string[] {
    const pastedIds: string[] = [];
    const delta = this._getPasteDelta(originalCenter);
    if (!delta) return pastedIds;
    const { deltaX, deltaY } = delta;

    // Handle free text annotations with position adjustment
    annotations.freeTextAnnotations?.forEach((annotation, index) => {
      const newId = `freeText_${Date.now()}_${this.pasteCounter}_${index}`;
      const newAnnotation = {
        ...annotation,
        id: newId,
        position: {
          x: annotation.position.x + deltaX,
          y: annotation.position.y + deltaY
        }
      };
      this.freeTextManager.addFreeTextAnnotation(newAnnotation);
      pastedIds.push(newId);
    });

    // Handle free shape annotations with position adjustment
    if (this.freeShapesManager) {
      annotations.freeShapeAnnotations?.forEach((annotation, index) => {
        const newId = `freeShape_${Date.now()}_${this.pasteCounter}_${index}`;
        const newAnnotation = {
          ...annotation,
          id: newId,
          position: {
            x: annotation.position.x + deltaX,
            y: annotation.position.y + deltaY
          }
        };
        // For lines, also adjust the end position
        if (annotation.shapeType === 'line' && annotation.endPosition) {
          newAnnotation.endPosition = {
            x: annotation.endPosition.x + deltaX,
            y: annotation.endPosition.y + deltaY
          };
        }
        this.freeShapesManager!.addFreeShapeAnnotation(newAnnotation);
        pastedIds.push(newId);
      });
    }

    // Group style annotations are handled in postProcess
    // Future special annotation handling can be added here:
    // annotations.cloudNodeAnnotations?.forEach(...)
    // annotations.nodeAnnotations?.forEach(...)
    return pastedIds;
  }
}
