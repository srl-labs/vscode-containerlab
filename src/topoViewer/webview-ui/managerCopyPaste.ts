import { VscodeMessageSender } from './managerVscodeWebview';
import { ManagerGroupStyle } from './managerGroupStyle';
import loadCytoStyle from './managerCytoscapeBaseStyles';
import { isSpecialEndpoint } from './utils';
import { ManagerFreeText } from './managerFreeText';
import { log } from '../logging/webviewLogger';

// Constants for copy/paste operations
const PASTE_OFFSET = {
  X: 20,
  Y: 20
} as const;

const ID_GENERATION = {
  RADIX: 36,
  SUBSTRING_LENGTH: 9
} as const;

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

  public handleCopy(): void {
    const copyData = this.getCopyData();
    if (copyData) {
      this.messageSender.sendMessageToVscodeEndpointPost('copyElements', copyData);
      this.pasteCounter = 0;
      this.lastPasteCenter = null;
    }
  }

  public async handlePaste(): Promise<void> {
    this.messageSender.sendMessageToVscodeEndpointPost('getCopiedElements', '');
  }

  public handleDuplicate(): any {
    const copyData = this.getCopyData();
    return copyData ? this.performPaste(copyData) : this.cy.collection();
  }

  private getCopyData() {
    const selected = this.cy.$(':selected');
    if (selected.empty()) return null;

    let nodes = selected.nodes().union(selected.nodes().descendants()).filter('[topoViewerRole != "dummyChild"]');
    nodes = nodes.union(nodes.connectedNodes().filter((n: any) => isSpecialEndpoint(n.id()) && n.edgesWith(nodes).size() > 0));

    const elements = nodes.union(nodes.edgesWith(nodes)).jsons();
    const styles = nodes.filter('[topoViewerRole = "group"]').map((n: any) => ({ oldId: n.id(), style: this.groupStyleManager.getStyle(n.id()) }));

    // Capture free text annotations for selected free text nodes
    const freeTextNodes = nodes.filter('[topoViewerRole = "freeText"]');
    const freeTextAnnotations = freeTextNodes.map((node: any) => {
      const allAnnotations = this.freeTextManager.getAnnotations();
      return allAnnotations.find(annotation => annotation.id === node.id());
    }).filter(Boolean);

    const bb = nodes.boundingBox();
    const originalCenter = { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 };

    return { elements, styles, freeTextAnnotations, originalCenter };
  }

  public performPaste(data: { elements: any[], styles?: any[], freeTextAnnotations?: any[], originalCenter?: { x: number, y: number } }): any {
    if (!data?.elements?.length) return this.cy.collection();

    const idMap = new Map();
    const usedIds = new Set<string>(this.cy.nodes().map((n: any) => n.id()));
    const newElements: any[] = [];

    // Generate unique IDs for nodes (excluding free text nodes - they're handled separately)
    data.elements.forEach((el: any) => {
      if (el.group === 'nodes' && el.data.topoViewerRole !== 'dummyChild' && el.data.topoViewerRole !== 'freeText') {
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
    this.postProcess(added, idMap, data.styles);

    if (data.freeTextAnnotations?.length) {
      this.pasteFreeTextAnnotations(data.freeTextAnnotations, data.originalCenter);
    }

    this.cy.$(':selected').unselect();
    added.select();
    this.pasteCounter++;
    return added;
  }

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

  private _getPasteDelta(originalCenter: { x: number, y: number }): { deltaX: number, deltaY: number } | null {
    let deltaX: number;
    let deltaY: number;

    if (this.pasteCounter === 0) {
      // First paste: center to viewport
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

    // Update lastPasteCenter to the new center
    const newBounds = positioned.reduce((acc, el) => ({
      minX: Math.min(acc.minX, el.position.x), maxX: Math.max(acc.maxX, el.position.x),
      minY: Math.min(acc.minY, el.position.y), maxY: Math.max(acc.maxY, el.position.y)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

    this.lastPasteCenter = { x: (newBounds.minX + newBounds.maxX) / 2, y: (newBounds.minY + newBounds.maxY) / 2 };
  }

  private postProcess(added: any, idMap: Map<string, string>, styles?: any[]): void {
    try { 
      loadCytoStyle(this.cy); 
    } catch (error) {
      log.error(`Failed to load cytoscape styles during paste operation: ${error}`);
    }
    
    try { 
      this.groupStyleManager.getGroupStyles()?.forEach((s: any) => this.groupStyleManager.applyStyleToNode(s.id)); 
    } catch (error) {
      log.error(`Failed to apply group styles during paste operation: ${error}`);
    }

    // Add endpoints and mark edges
    added.edges().forEach((edge: any) => {
      const [src, tgt] = [edge.data('source'), edge.data('target')];
      if (!edge.data('sourceEndpoint')) edge.data('sourceEndpoint', this.getNextEndpoint(src));
      if (!edge.data('targetEndpoint')) edge.data('targetEndpoint', this.getNextEndpoint(tgt));
      edge.data('editor', 'true');
      if (isSpecialEndpoint(src) || isSpecialEndpoint(tgt)) edge.addClass('stub-link');
    });

    // Add dummy children for empty groups
    added.nodes('[topoViewerRole = "group"]').forEach((group: any) => {
      if (group.children('[topoViewerRole != "dummyChild"]').empty()) {
        this.cy.add({ group: 'nodes', data: { id: `${group.id()}:dummyChild`, parent: group.id(), topoViewerRole: 'dummyChild' }, classes: 'dummy' });
      }
    });

    styles?.forEach(s => {
      const newId = idMap.get(s.oldId);
      if (newId) this.groupStyleManager.updateGroupStyle(newId, s.style);
    });
  }

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

  private pasteFreeTextAnnotations(freeTextAnnotations: any[], originalCenter?: { x: number, y: number }): void {
    if (!freeTextAnnotations?.length || !originalCenter) return;

    const delta = this._getPasteDelta(originalCenter);
    if (!delta) return;
    const { deltaX, deltaY } = delta;

    freeTextAnnotations.forEach(annotation => {
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
  }
}