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
    const id = `freeText_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const defaultAnnotation: FreeTextAnnotation = {
      id,
      text: '',
      position: {
        x: Math.round(position.x),
        y: Math.round(position.y)
      },
      fontSize: 14,
      fontColor: '#FFFFFF',
      backgroundColor: 'transparent',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      fontFamily: 'monospace'
    };

    const result = await this.promptForTextWithFormatting('Add Text', defaultAnnotation);
    if (!result || !result.text) return;

    this.addFreeTextAnnotation(result);
  }

  /**
   * Edit existing free text
   */
  public async editFreeText(id: string): Promise<void> {
    const annotation = this.annotations.get(id);
    if (!annotation) return;

    const result = await this.promptForTextWithFormatting('Edit Text', annotation);
    if (result && result.text) {
      // Update the annotation with new values
      Object.assign(annotation, result);
      this.updateFreeTextNode(id, annotation);
      // Annotations will be saved with the main topology save
    }
  }

  /**
   * Prompt user for text input with formatting options
   */
  private async promptForTextWithFormatting(title: string, annotation: FreeTextAnnotation): Promise<FreeTextAnnotation | null> {
    return new Promise((resolve) => {
      // Create a comprehensive formatting dialog
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
        min-width: 400px;
      `;

      // Title
      const titleEl = document.createElement('h3');
      titleEl.textContent = title;
      titleEl.style.cssText = 'color: #fff; margin: 0 0 15px 0; font-size: 16px;';
      dialog.appendChild(titleEl);

      // Text input
      const textLabel = document.createElement('label');
      textLabel.textContent = 'Text:';
      textLabel.style.cssText = 'color: #fff; display: block; margin-bottom: 5px; font-size: 12px;';
      dialog.appendChild(textLabel);

      const textInput = document.createElement('textarea');
      textInput.value = annotation.text || '';
      textInput.style.cssText = `
        width: 100%;
        height: 80px;
        padding: 5px;
        background: #1e1e1e;
        color: #fff;
        border: 1px solid #555;
        border-radius: 3px;
        font-family: ${annotation.fontFamily || 'monospace'};
        font-size: ${annotation.fontSize || 14}px;
        font-weight: ${annotation.fontWeight || 'normal'};
        font-style: ${annotation.fontStyle || 'normal'};
        text-decoration: ${annotation.textDecoration || 'none'};
        resize: vertical;
        box-sizing: border-box;
        margin-bottom: 15px;
      `;
      dialog.appendChild(textInput);

      // Formatting controls container
      const formatContainer = document.createElement('div');
      formatContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;';

      // Font size
      const fontSizeGroup = document.createElement('div');
      const fontSizeLabel = document.createElement('label');
      fontSizeLabel.textContent = 'Font Size:';
      fontSizeLabel.style.cssText = 'color: #fff; display: block; margin-bottom: 3px; font-size: 12px;';
      fontSizeGroup.appendChild(fontSizeLabel);

      const fontSizeInput = document.createElement('input');
      fontSizeInput.type = 'number';
      fontSizeInput.min = '8';
      fontSizeInput.max = '72';
      fontSizeInput.value = String(annotation.fontSize || 14);
      fontSizeInput.style.cssText = `
        width: 100%;
        padding: 3px;
        background: #1e1e1e;
        color: #fff;
        border: 1px solid #555;
        border-radius: 3px;
      `;
      fontSizeInput.addEventListener('input', () => {
        textInput.style.fontSize = fontSizeInput.value + 'px';
      });
      fontSizeGroup.appendChild(fontSizeInput);
      formatContainer.appendChild(fontSizeGroup);

      // Font family
      const fontFamilyGroup = document.createElement('div');
      const fontFamilyLabel = document.createElement('label');
      fontFamilyLabel.textContent = 'Font Family:';
      fontFamilyLabel.style.cssText = 'color: #fff; display: block; margin-bottom: 3px; font-size: 12px;';
      fontFamilyGroup.appendChild(fontFamilyLabel);

      const fontFamilySelect = document.createElement('select');
      fontFamilySelect.style.cssText = `
        width: 100%;
        padding: 3px;
        background: #1e1e1e;
        color: #fff;
        border: 1px solid #555;
        border-radius: 3px;
      `;
      const fonts = ['monospace', 'sans-serif', 'serif', 'Arial', 'Helvetica', 'Courier New', 'Times New Roman', 'Georgia'];
      fonts.forEach(font => {
        const option = document.createElement('option');
        option.value = font;
        option.textContent = font;
        option.selected = font === (annotation.fontFamily || 'monospace');
        fontFamilySelect.appendChild(option);
      });
      fontFamilySelect.addEventListener('change', () => {
        textInput.style.fontFamily = fontFamilySelect.value;
      });
      fontFamilyGroup.appendChild(fontFamilySelect);
      formatContainer.appendChild(fontFamilyGroup);

      // Font color
      const fontColorGroup = document.createElement('div');
      const fontColorLabel = document.createElement('label');
      fontColorLabel.textContent = 'Text Color:';
      fontColorLabel.style.cssText = 'color: #fff; display: block; margin-bottom: 3px; font-size: 12px;';
      fontColorGroup.appendChild(fontColorLabel);

      const fontColorInput = document.createElement('input');
      fontColorInput.type = 'color';
      fontColorInput.value = annotation.fontColor || '#FFFFFF';
      fontColorInput.style.cssText = `
        width: 100%;
        padding: 2px;
        background: #1e1e1e;
        border: 1px solid #555;
        border-radius: 3px;
        height: 28px;
      `;
      fontColorInput.addEventListener('input', () => {
        textInput.style.color = fontColorInput.value;
      });
      fontColorGroup.appendChild(fontColorInput);
      formatContainer.appendChild(fontColorGroup);

      // Background color
      const bgColorGroup = document.createElement('div');
      const bgColorLabel = document.createElement('label');
      bgColorLabel.textContent = 'Background:';
      bgColorLabel.style.cssText = 'color: #fff; display: block; margin-bottom: 3px; font-size: 12px;';
      bgColorGroup.appendChild(bgColorLabel);

      const bgColorInput = document.createElement('input');
      bgColorInput.type = 'color';
      bgColorInput.value = annotation.backgroundColor === 'transparent' ? '#000000' : (annotation.backgroundColor || '#000000');
      bgColorInput.style.cssText = `
        width: 100%;
        padding: 2px;
        background: #1e1e1e;
        border: 1px solid #555;
        border-radius: 3px;
        height: 28px;
      `;
      bgColorGroup.appendChild(bgColorInput);
      formatContainer.appendChild(bgColorGroup);

      dialog.appendChild(formatContainer);

      // Style toggles
      const styleContainer = document.createElement('div');
      styleContainer.style.cssText = 'display: flex; gap: 10px; margin-bottom: 15px;';

      // Bold toggle
      const boldBtn = document.createElement('button');
      boldBtn.innerHTML = '<strong>B</strong>';
      boldBtn.style.cssText = `
        padding: 5px 10px;
        background: ${annotation.fontWeight === 'bold' ? '#007ACC' : '#555'};
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 14px;
        min-width: 35px;
      `;
      boldBtn.onclick = () => {
        const isBold = boldBtn.style.background.includes('#007ACC');
        boldBtn.style.background = isBold ? '#555' : '#007ACC';
        textInput.style.fontWeight = isBold ? 'normal' : 'bold';
      };
      styleContainer.appendChild(boldBtn);

      // Italic toggle
      const italicBtn = document.createElement('button');
      italicBtn.innerHTML = '<em>I</em>';
      italicBtn.style.cssText = `
        padding: 5px 10px;
        background: ${annotation.fontStyle === 'italic' ? '#007ACC' : '#555'};
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 14px;
        min-width: 35px;
      `;
      italicBtn.onclick = () => {
        const isItalic = italicBtn.style.background.includes('#007ACC');
        italicBtn.style.background = isItalic ? '#555' : '#007ACC';
        textInput.style.fontStyle = isItalic ? 'normal' : 'italic';
      };
      styleContainer.appendChild(italicBtn);

      // Underline toggle
      const underlineBtn = document.createElement('button');
      underlineBtn.innerHTML = '<u>U</u>';
      underlineBtn.style.cssText = `
        padding: 5px 10px;
        background: ${annotation.textDecoration === 'underline' ? '#007ACC' : '#555'};
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 14px;
        min-width: 35px;
      `;
      underlineBtn.onclick = () => {
        const isUnderline = underlineBtn.style.background.includes('#007ACC');
        underlineBtn.style.background = isUnderline ? '#555' : '#007ACC';
        textInput.style.textDecoration = isUnderline ? 'none' : 'underline';
      };
      styleContainer.appendChild(underlineBtn);

      // Transparent background toggle
      const transparentBtn = document.createElement('button');
      transparentBtn.textContent = 'Transparent BG';
      transparentBtn.style.cssText = `
        padding: 5px 10px;
        background: ${annotation.backgroundColor === 'transparent' ? '#007ACC' : '#555'};
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
        margin-left: auto;
      `;
      transparentBtn.onclick = () => {
        const isTransparent = transparentBtn.style.background.includes('#007ACC');
        transparentBtn.style.background = isTransparent ? '#555' : '#007ACC';
        bgColorInput.disabled = !isTransparent;
        textInput.style.background = isTransparent ? bgColorInput.value : 'transparent';
      };
      styleContainer.appendChild(transparentBtn);

      dialog.appendChild(styleContainer);

      // Button container
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'text-align: right; margin-top: 15px;';

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
      cancelBtn.onclick = () => {
        document.body.removeChild(dialog);
        resolve(null);
      };

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
      okBtn.onclick = () => {
        const text = textInput.value.trim();
        if (!text) {
          document.body.removeChild(dialog);
          resolve(null);
          return;
        }

        const result: FreeTextAnnotation = {
          ...annotation,
          text,
          fontSize: parseInt(fontSizeInput.value),
          fontColor: fontColorInput.value,
          backgroundColor: transparentBtn.style.background.includes('#007ACC') ? 'transparent' : bgColorInput.value,
          fontWeight: boldBtn.style.background.includes('#007ACC') ? 'bold' : 'normal',
          fontStyle: italicBtn.style.background.includes('#007ACC') ? 'italic' : 'normal',
          textDecoration: underlineBtn.style.background.includes('#007ACC') ? 'underline' : 'none',
          fontFamily: fontFamilySelect.value
        };

        document.body.removeChild(dialog);
        resolve(result);
      };

      buttonContainer.appendChild(cancelBtn);
      buttonContainer.appendChild(okBtn);
      dialog.appendChild(buttonContainer);

      document.body.appendChild(dialog);
      textInput.focus();
      textInput.select();

      // Handle Enter key for OK and Escape for Cancel
      textInput.addEventListener('keydown', (e) => {
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

    // Apply custom styles based on annotation properties
    this.applyTextNodeStyles(node, annotation);

    this.annotationNodes.set(annotation.id, node);
    // Don't auto-save here, wait for the main save operation
  }

  /**
   * Apply custom styles to a text node based on annotation properties
   */
  private applyTextNodeStyles(node: cytoscape.NodeSingular, annotation: FreeTextAnnotation): void {
    const styles: any = {
      'font-size': `${annotation.fontSize || 14}px`,
      'color': annotation.fontColor || '#FFFFFF',
      'font-weight': annotation.fontWeight || 'normal',
      'font-style': annotation.fontStyle || 'normal',
      'font-family': annotation.fontFamily || 'monospace'
    };

    // Handle text decoration (underline)
    if (annotation.textDecoration === 'underline') {
      // Cytoscape doesn't directly support text-decoration, so we'll use text-outline as a workaround
      styles['text-border-width'] = '1px';
      styles['text-border-color'] = annotation.fontColor || '#FFFFFF';
      styles['text-border-style'] = 'solid';
    }

    // Handle background
    if (annotation.backgroundColor === 'transparent') {
      styles['text-background-opacity'] = 0;
    } else {
      styles['text-background-color'] = annotation.backgroundColor || '#000000';
      styles['text-background-opacity'] = 0.8;
    }

    node.style(styles);
  }

  /**
   * Update a free text node
   */
  private updateFreeTextNode(id: string, annotation: FreeTextAnnotation): void {
    const node = this.annotationNodes.get(id);
    if (node) {
      node.data('name', annotation.text);
      node.data('freeTextData', annotation);
      // Apply the updated styles
      this.applyTextNodeStyles(node, annotation);
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