import { VscodeMessageSender } from './managerVscodeWebview';
import { ManagerGroupStyle } from './managerGroupStyle';
import { ManagerFreeText } from './managerFreeText';
import loadCytoStyle from './managerCytoscapeBaseStyles';
import { isSpecialEndpoint } from '../utilities/specialNodes';
import { log } from '../logging/logger';
import { TopologyAnnotations } from '../types/topoViewerGraph';

// Constants for copy/paste operations
const PASTE_OFFSET = {
  X: 20,
  Y: 20
} as const;

const ID_GENERATION = {
  RADIX: 36,
  SUBSTRING_LENGTH: 9
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
    if (!data?.elements?.length) return this.cy.collection();

    const idMap = new Map();
    const usedIds = new Set<string>(this.cy.nodes().map((n: any) => n.id()));
    const newElements: any[] = [];

    // Generate unique IDs for nodes (excluding free text nodes - they're handled separately)
    data.elements.forEach((el: any) => {
      if (el.group === 'nodes' && el.data.topoViewerRole !== 'freeText') {
        const newId = this.getUniqueId(el.data.name || el.data.id, usedIds, el.data.topoViewerRole === 'group');
        idMap.set(el.data.id, newId);
        usedIds.add(newId);

        const newData = { ...el.data, id: newId, name: newId.split(':')[0], label: newId.split(':')[0] };
        if (el.data.topoViewerRole === 'group' && newData.extraData) {
          const [group, level] = newId.split(':');
          newData.extraData.topoViewerGroup = group;
          newData.extraData.topoViewerGroupLevel = level;
        }
        newElements.push({ group: 'nodes', data: newData, position: { ...el.position } });
      }
    });

    // Update parent refs and add edges
    newElements.forEach(el => el.data.parent && idMap.has(el.data.parent) && (el.data.parent = idMap.get(el.data.parent)));
    data.elements.forEach((el: any) => {
      if (el.group === 'edges' && idMap.has(el.data.source) && idMap.has(el.data.target)) {
        const src = idMap.get(el.data.source), tgt = idMap.get(el.data.target);
        newElements.push({ group: 'edges', data: { ...el.data, id: `${src}-${tgt}`, source: src, target: tgt } });
      }
    });

    if (data.originalCenter) {
      this.applyPasteOffsetAndCenter(newElements, data.originalCenter);
    }

    const added = this.cy.add(newElements);
    this.postProcess(added, idMap, data.annotations);

    this.pasteAnnotations(data.annotations, data.originalCenter);

    this.cy.$(':selected').unselect();
    added.select();
    this.pasteCounter++;
    return added;
  }

  /**
   * Generates a unique ID based on the base name and existing IDs.
   * For groups, appends ":1" suffix. For regular nodes, increments numeric suffix.
   * @param baseName - The base name to generate unique ID from.
   * @param usedIds - Set of already used IDs to avoid conflicts.
   * @param isGroup - Whether this is a group node requiring special formatting.
   * @returns A unique ID string.
   */
  private getUniqueId(baseName: string, usedIds: Set<string>, isGroup: boolean): string {
    const match = baseName.match(/^(.*?)(\d*)$/);
    const base = match?.[1] || baseName;
    let num = parseInt(match?.[2] || '0') || 0;

    if (isGroup) {
      while (usedIds.has(`${base}${num || ''}:1`)) num++;
      return `${base}${num || ''}:1`;
    } else {
      let name = baseName;
      while (usedIds.has(name)) name = base + (++num);
      return name;
    }
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
    try {
      loadCytoStyle(this.cy);
    } catch (error) {
      log.error(`Failed to load cytoscape styles during paste operation: ${error}`);
    }

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
      if (!edge.data('sourceEndpoint')) edge.data('sourceEndpoint', this.getNextEndpoint(src));
      if (!edge.data('targetEndpoint')) edge.data('targetEndpoint', this.getNextEndpoint(tgt));
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
      return ep ? parseInt(ep.match(/\d+$/)?.[0] || '0') : 0;
    }).filter((n: number) => n > 0));

    let num = 1;
    while (usedNums.has(num)) num++;
    return `ep${num}`;
  }

  /**
   * Handle annotation pasting directly with managers
   * @param annotations - The annotations to paste.
   * @param originalCenter - The original center position for calculating deltas.
   */
  private pasteAnnotations(annotations: TopologyAnnotations, originalCenter: { x: number; y: number }): void {
    const delta = this._getPasteDelta(originalCenter);
    if (!delta) return;
    const { deltaX, deltaY } = delta;

    // Handle free text annotations with position adjustment
    annotations.freeTextAnnotations?.forEach(annotation => {
      const newId = `freeText_${Date.now()}_${Math.random().toString(ID_GENERATION.RADIX).substr(2, ID_GENERATION.SUBSTRING_LENGTH)}`;
      const newAnnotation = {
        ...annotation,
        id: newId,
        position: {
          x: annotation.position.x + deltaX,
          y: annotation.position.y + deltaY
        }
      };
      this.freeTextManager.addFreeTextAnnotation(newAnnotation);
    });

    // Group style annotations are handled in postProcess
    // Future special annotation handling can be added here:
    // annotations.cloudNodeAnnotations?.forEach(...)
    // annotations.nodeAnnotations?.forEach(...)
  }
}