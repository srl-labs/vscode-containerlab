import cytoscape from 'cytoscape';
import { VscodeMessageSender } from './managerVscodeWebview';
import { log } from '../logging/logger';
import type { GroupStyleAnnotation } from '../types/topoViewerGraph';
import type { ManagerFreeText } from './managerFreeText';

export class ManagerGroupStyle {
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender;
  private freeTextManager?: ManagerFreeText;
  private groupStyles: Map<string, GroupStyleAnnotation> = new Map();
  private saveDebounced: () => void;
  private loadInProgress = false;
  private loadTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender, freeTextManager?: ManagerFreeText) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.freeTextManager = freeTextManager;
    this.saveDebounced = this.debounce(() => {
      this.saveAnnotations();
    }, 300);
  }

  public setFreeTextManager(manager: ManagerFreeText): void {
    this.freeTextManager = manager;
  }

  private debounce(func: Function, wait: number) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: any[]) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  public getGroupStyles(): GroupStyleAnnotation[] {
    return Array.from(this.groupStyles.values());
  }

  public getStyle(id: string): GroupStyleAnnotation | undefined {
    return this.groupStyles.get(id);
  }

  public updateGroupStyle(id: string, style: GroupStyleAnnotation): void {
    style.id = id;
    this.groupStyles.set(id, style);
    this.applyStyleToNode(id);
    this.saveDebounced();
  }

  public removeGroupStyle(id: string): void {
    this.groupStyles.delete(id);
    const node = this.cy.getElementById(id);
    if (!node.empty()) {
      node.style({
        'background-color': '',
        'background-opacity': '',
        'border-color': '',
        'border-width': '',
        'border-style': '',
        'shape': '',
        'corner-radius': '',
        color: ''
      });
    }
    this.saveDebounced();
  }

  public applyStyleToNode(id: string): void {
    const style = this.groupStyles.get(id);
    if (!style) return;

    let node = this.cy.getElementById(id);

    // If node doesn't exist, create it (for empty groups)
    if (node.empty()) {
      const [groupName, level] = id.split(':');
      if (groupName && level) {
        const pos = this.cy.nodes().length > 0
          ? { x: this.cy.extent().x1 + 100, y: this.cy.extent().y1 + 100 }
          : { x: 100, y: 100 };

        node = this.cy.add({
          group: 'nodes',
          data: {
            id, name: groupName, weight: '1000', topoViewerRole: 'group',
            extraData: {
              clabServerUsername: 'asad', weight: '2', name: '',
              topoViewerGroup: groupName, topoViewerGroupLevel: level
            }
          },
          position: pos,
          classes: 'empty-group'
        });
        log.debug(`Created missing group: ${id}`);
      } else {
        return;
      }
    }

    const css: any = {};
    if (style.backgroundColor) {
      css['background-color'] = style.backgroundColor;
      if (style.backgroundOpacity !== undefined) {
        css['background-opacity'] = style.backgroundOpacity / 100;
      }
    }
    if (style.borderColor) css['border-color'] = style.borderColor;
    if (style.borderWidth !== undefined) css['border-width'] = `${style.borderWidth}px`;
    if (style.borderStyle) css['border-style'] = style.borderStyle;
    if (style.borderRadius !== undefined) {
      css['shape'] = style.borderRadius > 0 ? 'round-rectangle' : 'rectangle';
      css['corner-radius'] = `${style.borderRadius}px`;
    }
    if (style.color) css['color'] = style.color;
    node.style(css);
  }

  public async loadGroupStyles(): Promise<void> {
    // If a load is already in progress, skip this request
    if (this.loadInProgress) {
      log.debug('Group styles load already in progress, skipping duplicate request');
      return;
    }

    // Clear any pending load timeout
    if (this.loadTimeout) {
      clearTimeout(this.loadTimeout);
    }

    // Debounce the load to prevent rapid-fire requests
    return new Promise((resolve, reject) => {
      this.loadTimeout = setTimeout(async () => {
        this.loadInProgress = true;
        try {
          const response = await this.messageSender.sendMessageToVscodeEndpointPost('topo-editor-load-annotations', {});
          if (response && Array.isArray(response.groupStyles)) {
            response.groupStyles.forEach((s: GroupStyleAnnotation) => {
              this.groupStyles.set(s.id, s);
              this.applyStyleToNode(s.id);
            });
            log.info(`Loaded ${response.groupStyles.length} group style annotations`);
          }
          resolve();
        } catch (error) {
          log.error(`Failed to load group style annotations: ${error}`);
          reject(error);
        } finally {
          this.loadInProgress = false;
        }
      }, 100); // 100ms debounce
    });
  }

  private async saveAnnotations(): Promise<void> {
    try {
      const annotations = this.freeTextManager ? this.freeTextManager.getAnnotations() : [];
      const groupStyles = this.getGroupStyles();
      await this.messageSender.sendMessageToVscodeEndpointPost('topo-editor-save-annotations', {
        annotations,
        groupStyles
      });
      log.debug(`Saved ${groupStyles.length} group style annotations`);
    } catch (error) {
      log.error(`Failed to save group style annotations: ${error}`);
    }
  }
}
