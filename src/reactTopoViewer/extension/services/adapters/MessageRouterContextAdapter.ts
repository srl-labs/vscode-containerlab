/**
 * Message Router Context Adapter
 *
 * Adapter for MessageRouterContext
 */

import type { IMessageRouterContext } from '../../../shared/messaging';
import type { CyElement } from '../../../shared/types/topology';

export class MessageRouterContextAdapter implements IMessageRouterContext {
  private elements: CyElement[] = [];
  private _isViewMode: boolean;
  private _yamlFilePath: string;
  private _loadTopologyData: () => Promise<unknown>;

  constructor(options: {
    yamlFilePath: string;
    isViewMode: boolean;
    lastTopologyElements: CyElement[];
    loadTopologyData: () => Promise<unknown>;
  }) {
    this._yamlFilePath = options.yamlFilePath;
    this._isViewMode = options.isViewMode;
    this.elements = options.lastTopologyElements;
    this._loadTopologyData = options.loadTopologyData;
  }

  get yamlFilePath(): string {
    return this._yamlFilePath;
  }

  get isViewMode(): boolean {
    return this._isViewMode;
  }

  getCachedElements(): CyElement[] {
    return this.elements;
  }

  updateCachedElements(elements: CyElement[]): void {
    this.elements = elements;
  }

  findCachedNode(nodeId: string): CyElement | undefined {
    return this.elements.find(
      el => el.group === 'nodes' && (el.data as Record<string, unknown>)?.id === nodeId
    );
  }

  findCachedEdge(edgeId: string): CyElement | undefined {
    return this.elements.find(
      el => el.group === 'edges' && (el.data as Record<string, unknown>)?.id === edgeId
    );
  }

  async loadTopologyData(): Promise<unknown> {
    return this._loadTopologyData();
  }

  // Methods for updating context
  setYamlFilePath(path: string): void {
    this._yamlFilePath = path;
  }

  setViewMode(isViewMode: boolean): void {
    this._isViewMode = isViewMode;
  }

  setElements(elements: CyElement[]): void {
    this.elements = elements;
  }
}
