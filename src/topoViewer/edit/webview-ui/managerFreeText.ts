import cytoscape from 'cytoscape';
import { VscodeMessageSender } from '../../common/webview-ui/managerVscodeWebview';
import { FreeTextAnnotation } from '../../common/types/topoViewerGraph';
import { log } from '../../common/logging/webviewLogger';

/**
 * Manages free text annotations in the Cytoscape viewport
 */
export class ManagerFreeText {
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender;
  private annotations: Map<string, FreeTextAnnotation> = new Map();
  private annotationNodes: Map<string, cytoscape.NodeSingular> = new Map();

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle double-click on free text nodes to edit
    this.cy.on('dblclick', 'node[topoViewerRole="freeText"]', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const node = event.target;
      this.editFreeText(node.id());
    });

    // Also try dbltap for touch devices
    this.cy.on('dbltap', 'node[topoViewerRole="freeText"]', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const node = event.target;
      this.editFreeText(node.id());
    });

    // Handle deletion of free text nodes
    this.cy.on('remove', 'node[topoViewerRole="freeText"]', (event) => {
      const node = event.target;
      const id = node.id();
      // Only remove from our tracking if it's not already being handled
      if (this.annotations.has(id)) {
        this.annotations.delete(id);
        this.annotationNodes.delete(id);
        // Don't call saveAnnotations here as it might cause recursion
      }
    });

    // Handle position changes for free text nodes
    this.cy.on('dragfree', 'node[topoViewerRole="freeText"]', (event) => {
      const node = event.target;
      this.updateFreeTextPosition(node.id(), node.position());
    });

    // Also handle position changes during drag for real-time updates
    this.cy.on('position', 'node[topoViewerRole="freeText"]', (event) => {
      const node = event.target;
      if (!node.grabbed()) return; // Only update when being dragged
      const annotation = this.annotations.get(node.id());
      if (annotation) {
        annotation.position = {
          x: Math.round(node.position().x),
          y: Math.round(node.position().y)
        };
      }
    });
  }

  /**
   * Enable free text adding mode
   */
  public enableAddTextMode(): void {
    // Change cursor to indicate text mode
    const container = this.cy.container();
    if (container) {
      container.style.cursor = 'text';
    }

    // Add one-time click handler for placing text
    const handler = (event: cytoscape.EventObject) => {
      if (event.target === this.cy) {
        const position = event.position || (event as any).cyPosition;
        if (position) {
          this.addFreeTextAtPosition(position);
        }
        this.disableAddTextMode();
      }
    };

    this.cy.one('tap', handler);
  }

  /**
   * Disable free text adding mode
   */
  public disableAddTextMode(): void {
    const container = this.cy.container();
    if (container) {
      container.style.cursor = '';
    }
  }

  /**
   * Add free text at a specific position
   */
  private async addFreeTextAtPosition(position: cytoscape.Position): Promise<void> {
    const text = await this.promptForText('Enter text:', '');
    if (!text) return;

    const id = `freeText_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const annotation: FreeTextAnnotation = {
      id,
      text,
      position: {
        x: Math.round(position.x),
        y: Math.round(position.y)
      },
      fontSize: 12,
      fontColor: '#FFFFFF',
      backgroundColor: '#000000'
    };

    this.addFreeTextAnnotation(annotation);
  }

  /**
   * Edit existing free text
   */
  public async editFreeText(id: string): Promise<void> {
    const annotation = this.annotations.get(id);
    if (!annotation) return;

    const newText = await this.promptForText('Edit text:', annotation.text);
    if (newText && newText !== annotation.text) {
      annotation.text = newText;
      this.updateFreeTextNode(id, annotation);
      // Annotations will be saved with the main topology save
    }
  }

  /**
   * Prompt user for text input
   */
  private async promptForText(prompt: string, defaultValue: string): Promise<string | null> {
    return new Promise((resolve) => {
      // Create a simple input dialog
      const dialog = document.createElement('div');
      dialog.className = 'free-text-dialog';
      dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #2d2d30;
        border: 1px solid #555;
        padding: 20px;
        z-index: 10000;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        border-radius: 4px;
      `;

      const label = document.createElement('label');
      label.textContent = prompt;
      label.style.cssText = 'color: #fff; display: block; margin-bottom: 10px;';

      const input = document.createElement('textarea');
      input.value = defaultValue;
      input.style.cssText = `
        width: 300px;
        height: 100px;
        padding: 5px;
        background: #1e1e1e;
        color: #fff;
        border: 1px solid #555;
        border-radius: 3px;
        font-family: monospace;
        resize: vertical;
      `;

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'margin-top: 10px; text-align: right;';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = `
        margin-right: 10px;
        padding: 5px 15px;
        background: #555;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
      `;

      const okBtn = document.createElement('button');
      okBtn.textContent = 'OK';
      okBtn.style.cssText = `
        padding: 5px 15px;
        background: #007ACC;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
      `;

      cancelBtn.onclick = () => {
        document.body.removeChild(dialog);
        resolve(null);
      };

      okBtn.onclick = () => {
        const value = input.value.trim();
        document.body.removeChild(dialog);
        resolve(value || null);
      };

      buttonContainer.appendChild(cancelBtn);
      buttonContainer.appendChild(okBtn);

      dialog.appendChild(label);
      dialog.appendChild(input);
      dialog.appendChild(buttonContainer);

      document.body.appendChild(dialog);
      input.focus();
      input.select();

      // Handle Enter key for OK and Escape for Cancel
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          cancelBtn.click();
        } else if (e.key === 'Enter' && e.ctrlKey) {
          okBtn.click();
        }
      });
    });
  }

  /**
   * Add a free text annotation to the graph
   */
  public addFreeTextAnnotation(annotation: FreeTextAnnotation): void {
    this.annotations.set(annotation.id, annotation);

    // Create a Cytoscape node for the text
    const node = this.cy.add({
      group: 'nodes',
      data: {
        id: annotation.id,
        name: annotation.text,
        topoViewerRole: 'freeText',
        freeTextData: annotation
      },
      position: {
        x: annotation.position.x,
        y: annotation.position.y
      },
      classes: 'free-text-node',
      grabbable: true,
      selectable: true
    });

    this.annotationNodes.set(annotation.id, node);
    // Don't auto-save here, wait for the main save operation
  }

  /**
   * Update a free text node
   */
  private updateFreeTextNode(id: string, annotation: FreeTextAnnotation): void {
    const node = this.annotationNodes.get(id);
    if (node) {
      node.data('name', annotation.text);
      node.data('freeTextData', annotation);
    }
  }

  /**
   * Update free text position
   */
  private updateFreeTextPosition(id: string, position: cytoscape.Position): void {
    const annotation = this.annotations.get(id);
    if (annotation) {
      annotation.position = {
        x: Math.round(position.x),
        y: Math.round(position.y)
      };
      // Annotations will be saved with the main topology save
    }
  }

  /**
   * Remove a free text annotation
   */
  public removeFreeTextAnnotation(id: string): void {
    this.annotations.delete(id);
    const node = this.annotationNodes.get(id);
    if (node && node.inside()) {
      node.remove();
    }
    this.annotationNodes.delete(id);
    // Annotations will be saved with the main topology save
  }

  /**
   * Handle deletion key press for selected free text
   */
  public deleteSelectedFreeText(): void {
    const selected = this.cy.$('node[topoViewerRole="freeText"]:selected');
    selected.forEach(node => {
      this.removeFreeTextAnnotation(node.id());
    });
  }

  /**
   * Load annotations from backend
   */
  public async loadAnnotations(): Promise<void> {
    try {
      const response = await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-load-annotations',
        {}
      );

      if (response && response.annotations) {
        // Clear existing annotations first to avoid duplicates
        this.annotations.clear();
        this.annotationNodes.forEach(node => {
          if (node && node.inside()) {
            node.remove();
          }
        });
        this.annotationNodes.clear();

        const annotations = response.annotations as FreeTextAnnotation[];
        annotations.forEach(annotation => {
          this.addFreeTextAnnotation(annotation);
        });
        log.info(`Loaded ${annotations.length} free text annotations`);
      }
    } catch (error) {
      log.error(`Failed to load annotations: ${error}`);
    }
  }

  /**
   * Save annotations to backend
   */
  public async saveAnnotations(): Promise<void> {
    try {
      const annotations = Array.from(this.annotations.values());
      await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-save-annotations',
        { annotations }
      );
      log.debug(`Saved ${annotations.length} annotations successfully`);
    } catch (error) {
      log.error(`Failed to save annotations: ${error}`);
    }
  }

  /**
   * Get all annotations
   */
  public getAnnotations(): FreeTextAnnotation[] {
    return Array.from(this.annotations.values());
  }

  /**
   * Clear all annotations
   */
  public clearAnnotations(save: boolean = true): void {
    this.annotationNodes.forEach(node => {
      if (node && node.inside()) {
        node.remove();
      }
    });
    this.annotations.clear();
    this.annotationNodes.clear();
    if (save) {
      this.saveAnnotations();
    }
  }
}