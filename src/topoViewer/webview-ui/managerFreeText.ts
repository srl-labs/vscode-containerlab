import cytoscape from 'cytoscape';
import { VscodeMessageSender } from './managerVscodeWebview';
import { FreeTextAnnotation } from '../types/topoViewerGraph';
import { log } from '../logging/logger';
import type { ManagerGroupStyle } from './managerGroupStyle';

/**
 * Manages free text annotations in the Cytoscape viewport
 */
export class ManagerFreeText {
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender;
  private groupStyleManager?: ManagerGroupStyle;
  private annotations: Map<string, FreeTextAnnotation> = new Map();
  private annotationNodes: Map<string, cytoscape.NodeSingular> = new Map();
  private styleReapplyInProgress = false;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private loadInProgress = false;
  private loadTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender, groupStyleManager?: ManagerGroupStyle) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.groupStyleManager = groupStyleManager;
    this.setupEventHandlers();
    this.setupStylePreservation();
  }

  public setGroupStyleManager(manager: ManagerGroupStyle): void {
    this.groupStyleManager = manager;
  }

  private setupStylePreservation(): void {
    // Hook into the global loadCytoStyle function to reapply styles after it's called
    const originalLoadCytoStyle = (window as any).loadCytoStyle;
    if (originalLoadCytoStyle) {
      (window as any).loadCytoStyle = (cy: cytoscape.Core, theme?: string) => {
        // Call the original function
        const result = originalLoadCytoStyle(cy, theme);

        // Reapply free text styles after a short delay
        setTimeout(() => {
          this.reapplyAllFreeTextStyles();
        }, 50);

        return result;
      };
    }

    // Also listen for style changes on the cy instance
    this.cy.on('style', () => {
      if (this.styleReapplyInProgress) return;
      // Reapply styles after any style change with a small delay
      setTimeout(() => {
        this.reapplyAllFreeTextStyles();
      }, 50);
    });
  }

  private reapplyAllFreeTextStyles(): void {
    // Set flag before reapplying to prevent recursive calls
    if (this.styleReapplyInProgress) return;
    this.styleReapplyInProgress = true;

    try {
      this.annotationNodes.forEach((node, id) => {
        const annotation = this.annotations.get(id);
        if (annotation && node && node.inside()) {
          // Note: applyTextNodeStyles also sets/unsets styleReapplyInProgress
          // but we need the outer flag to prevent multiple simultaneous reapplies
          this.applyTextNodeStyles(node, annotation);
        }
      });
    } finally {
      this.styleReapplyInProgress = false;
    }
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
      const target = event.target;

      // Check if target is a group or parent node - prevent text addition on groups
      if (target !== this.cy) {
        // If clicked on a group or parent node, cancel text mode
        if (target.isParent?.() ||
            target.data?.('topoViewerRole') === 'group') {
          this.disableAddTextMode();
          log.debug('Text addition cancelled - cannot add text to groups');
          return;
        }
      }

      // Only add text when clicking on empty canvas
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
      // Save annotations after edit (debounced)
      this.debouncedSave();
    }
  }

  /**
   * Prompt user for text input with formatting options
   */
  private async promptForTextWithFormatting(title: string, annotation: FreeTextAnnotation): Promise<FreeTextAnnotation | null> {
    return new Promise((resolve) => {
      const backdrop = document.getElementById('free-text-modal-backdrop') as HTMLDivElement;
      const dialog = document.getElementById('free-text-modal') as HTMLDivElement;
      const dragHandle = document.getElementById('free-text-drag-handle') as HTMLDivElement;
      const titleEl = document.getElementById('free-text-modal-title') as HTMLHeadingElement;
      const textInput = document.getElementById('free-text-modal-text') as HTMLTextAreaElement;
      const fontSizeInput = document.getElementById('free-text-font-size') as HTMLInputElement;
      const fontFamilySelect = document.getElementById('free-text-font-family') as HTMLSelectElement;
      const fontColorInput = document.getElementById('free-text-font-color') as HTMLInputElement;
      const bgColorInput = document.getElementById('free-text-bg-color') as HTMLInputElement;
      const boldBtn = document.getElementById('free-text-bold-btn') as HTMLButtonElement;
      const italicBtn = document.getElementById('free-text-italic-btn') as HTMLButtonElement;
      const underlineBtn = document.getElementById('free-text-underline-btn') as HTMLButtonElement;
      const transparentBtn = document.getElementById('free-text-transparent-btn') as HTMLButtonElement;
      const cancelBtn = document.getElementById('free-text-cancel-btn') as HTMLButtonElement;
      const okBtn = document.getElementById('free-text-ok-btn') as HTMLButtonElement;

      if (!backdrop || !dialog || !dragHandle || !titleEl || !textInput || !fontSizeInput || !fontFamilySelect || !fontColorInput || !bgColorInput || !boldBtn || !italicBtn || !underlineBtn || !transparentBtn || !cancelBtn || !okBtn) {
        log.error('Free text modal elements not found');
        resolve(null);
        return;
      }

      titleEl.textContent = title;
      textInput.value = annotation.text || '';
      textInput.style.fontFamily = annotation.fontFamily || 'monospace';
      textInput.style.fontSize = `${annotation.fontSize || 14}px`;
      textInput.style.fontWeight = annotation.fontWeight || 'normal';
      textInput.style.fontStyle = annotation.fontStyle || 'normal';
      textInput.style.textDecoration = annotation.textDecoration || 'none';
      textInput.style.color = annotation.fontColor || '#FFFFFF';
      textInput.style.background = annotation.backgroundColor === 'transparent' ? 'transparent' : (annotation.backgroundColor || '#000000');

      fontSizeInput.value = String(annotation.fontSize || 14);
      fontSizeInput.oninput = () => {
        textInput.style.fontSize = fontSizeInput.value + 'px';
      };

      fontFamilySelect.innerHTML = '';
      const fonts = ['monospace', 'sans-serif', 'serif', 'Arial', 'Helvetica', 'Courier New', 'Times New Roman', 'Georgia'];
      fonts.forEach(font => {
        const option = document.createElement('option');
        option.value = font;
        option.textContent = font;
        if (font === (annotation.fontFamily || 'monospace')) {
          option.selected = true;
        }
        fontFamilySelect.appendChild(option);
      });
      fontFamilySelect.onchange = () => {
        textInput.style.fontFamily = fontFamilySelect.value;
      };

      fontColorInput.value = annotation.fontColor || '#FFFFFF';
      fontColorInput.oninput = () => {
        textInput.style.color = fontColorInput.value;
      };

      bgColorInput.value = annotation.backgroundColor === 'transparent' ? '#000000' : (annotation.backgroundColor || '#000000');
      bgColorInput.oninput = () => {
        if (!bgColorInput.disabled) {
          textInput.style.background = bgColorInput.value;
        }
      };

      let isBold = annotation.fontWeight === 'bold';
      let isItalic = annotation.fontStyle === 'italic';
      let isUnderline = annotation.textDecoration === 'underline';
      let isTransparentBg = annotation.backgroundColor === 'transparent';

      const updateButtonClasses = () => {
        boldBtn.className = `btn btn-small ${isBold ? 'btn-primary' : 'btn-outlined'}`;
        italicBtn.className = `btn btn-small ${isItalic ? 'btn-primary' : 'btn-outlined'}`;
        underlineBtn.className = `btn btn-small ${isUnderline ? 'btn-primary' : 'btn-outlined'}`;
        transparentBtn.className = `btn btn-small ml-auto ${isTransparentBg ? 'btn-primary' : 'btn-outlined'}`;
      };
      updateButtonClasses();

      boldBtn.onclick = () => {
        isBold = !isBold;
        textInput.style.fontWeight = isBold ? 'bold' : 'normal';
        updateButtonClasses();
      };

      italicBtn.onclick = () => {
        isItalic = !isItalic;
        textInput.style.fontStyle = isItalic ? 'italic' : 'normal';
        updateButtonClasses();
      };

      underlineBtn.onclick = () => {
        isUnderline = !isUnderline;
        textInput.style.textDecoration = isUnderline ? 'underline' : 'none';
        updateButtonClasses();
      };

      transparentBtn.onclick = () => {
        isTransparentBg = !isTransparentBg;
        bgColorInput.disabled = isTransparentBg;
        textInput.style.background = isTransparentBg ? 'transparent' : bgColorInput.value;
        updateButtonClasses();
      };
      if (isTransparentBg) {
        bgColorInput.disabled = true;
        textInput.style.background = 'transparent';
      }

      let isDragging = false;
      let offsetX = 0;
      let offsetY = 0;

      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        dialog.style.left = `${e.clientX - offsetX}px`;
        dialog.style.top = `${e.clientY - offsetY}px`;
      };

      const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        dragHandle.style.cursor = 'grab';
      };

      const cleanup = () => {
        dialog.style.display = 'none';
        dialog.style.position = '';
        dialog.style.left = '';
        dialog.style.top = '';
        dialog.style.transform = '';
        dragHandle.style.cursor = 'grab';
        backdrop.style.display = 'none';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        textInput.onkeydown = null;
        fontSizeInput.oninput = null;
        fontFamilySelect.onchange = null;
        fontColorInput.oninput = null;
        bgColorInput.oninput = null;
        boldBtn.onclick = null;
        italicBtn.onclick = null;
        underlineBtn.onclick = null;
        transparentBtn.onclick = null;
        cancelBtn.onclick = null;
        okBtn.onclick = null;
      };

      dragHandle.onmousedown = (e: MouseEvent) => {
        isDragging = true;
        const rect = dialog.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        dialog.style.position = 'fixed';
        dialog.style.left = `${rect.left}px`;
        dialog.style.top = `${rect.top}px`;
        dialog.style.transform = 'none';
        dragHandle.style.cursor = 'grabbing';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };

      okBtn.onclick = () => {
        const text = textInput.value.trim();
        if (!text) {
          cleanup();
          resolve(null);
          return;
        }

        const result: FreeTextAnnotation = {
          ...annotation,
          text,
          fontSize: parseInt(fontSizeInput.value),
          fontColor: fontColorInput.value,
          backgroundColor: isTransparentBg ? 'transparent' : bgColorInput.value,
          fontWeight: isBold ? 'bold' : 'normal',
          fontStyle: isItalic ? 'italic' : 'normal',
          textDecoration: isUnderline ? 'underline' : 'none',
          fontFamily: fontFamilySelect.value,
        };
        cleanup();
        resolve(result);
      };

      textInput.onkeydown = (e) => {
        if (e.key === 'Escape') {
          cancelBtn.click();
        } else if (e.key === 'Enter' && e.ctrlKey) {
          okBtn.click();
        }
      };

      backdrop.style.display = 'block';
      dialog.style.display = 'block';
      textInput.focus();
      textInput.select();
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

    // Apply custom styles based on annotation properties with a slight delay to ensure node is rendered
    this.applyTextNodeStyles(node, annotation);
    // Apply styles again after a short delay to ensure they stick
    setTimeout(() => {
      this.applyTextNodeStyles(node, annotation);
    }, 100);

    this.annotationNodes.set(annotation.id, node);
    // Save annotations after adding new text (debounced)
    this.debouncedSave();
  }

  /**
   * Apply custom styles to a text node based on annotation properties
   */
  private applyTextNodeStyles(node: cytoscape.NodeSingular, annotation: FreeTextAnnotation): void {
    // Store the annotation data in the node for persistence
    node.data('freeTextData', annotation);

    // Create a comprehensive style object with all necessary properties
    const styles: any = {};

    // Font size
    const fontSize = annotation.fontSize || 14;
    styles['font-size'] = fontSize;

    // Text color
    styles['color'] = annotation.fontColor || '#FFFFFF';

    // Font weight - use string values as Cytoscape expects
    styles['font-weight'] = annotation.fontWeight === 'bold' ? 'bold' : 'normal';

    // Font style
    styles['font-style'] = annotation.fontStyle === 'italic' ? 'italic' : 'normal';

    // Font family - ensure italic is in the font string if needed
    const fontFamily = annotation.fontFamily || 'monospace';
    styles['font-family'] = fontFamily;

    // Cytoscape doesn't support the CSS `font` shorthand property,
    // so we rely on the individual font-* properties above.

    // Text outline for visibility (and underline effect)
    if (annotation.textDecoration === 'underline') {
      // Use a thicker outline to simulate underline
      styles['text-outline-width'] = 2;
      styles['text-outline-color'] = annotation.fontColor || '#FFFFFF';
      styles['text-outline-opacity'] = 0.5;
    } else {
      // Standard outline for text visibility
      styles['text-outline-width'] = 1;
      styles['text-outline-color'] = '#000000';
      styles['text-outline-opacity'] = 0.8;
    }

    // Background handling - be very explicit
    if (annotation.backgroundColor === 'transparent') {
      // For transparent background, set opacity to 0
      styles['text-background-opacity'] = 0;
      // Don't set background color or shape when transparent
    } else {
      // For colored background
      styles['text-background-color'] = annotation.backgroundColor || '#000000';
      styles['text-background-opacity'] = 0.9;
      styles['text-background-shape'] = 'roundrectangle';
      styles['text-background-padding'] = 3;
    }

    // Apply all styles at once
    // Note: The flag is already managed by reapplyAllFreeTextStyles if called from there
    const wasAlreadyInProgress = this.styleReapplyInProgress;
    if (!wasAlreadyInProgress) {
      this.styleReapplyInProgress = true;
    }
    try {
      node.style(styles);
    } finally {
      if (!wasAlreadyInProgress) {
        this.styleReapplyInProgress = false;
      }
    }

    // Force a render update to ensure styles are applied
    node.cy().forceRender();
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
      // Save annotations after position update (debounced)
      this.debouncedSave();
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
    // Save annotations after removal (debounced)
    this.debouncedSave();
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
   * Load annotations from backend with debouncing to prevent duplicate requests
   */
  public async loadAnnotations(): Promise<void> {
    // If a load is already in progress, skip this request
    if (this.loadInProgress) {
      log.debug('Load already in progress, skipping duplicate request');
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

          // Reapply styles after a delay to ensure they persist after refresh
          setTimeout(() => {
            this.annotationNodes.forEach((node, id) => {
              const annotation = this.annotations.get(id);
              if (annotation) {
                this.applyTextNodeStyles(node, annotation);
              }
            });
            log.debug('Reapplied styles to free text annotations');
          }, 200);
        }
        resolve();
      } catch (error) {
        log.error(`Failed to load annotations: ${error}`);
        reject(error);
      } finally {
        this.loadInProgress = false;
      }
      }, 100); // 100ms debounce
    });
  }

  /**
   * Debounced save - prevents rapid-fire saves when multiple annotations change
   */
  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveAnnotations();
    }, 300); // Wait 300ms after last change before saving
  }

  /**
   * Save annotations to backend
   */
  public async saveAnnotations(): Promise<void> {
    try {
      const annotations = Array.from(this.annotations.values());
      const groupStyles = this.groupStyleManager ? this.groupStyleManager.getGroupStyles() : [];
      await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-save-annotations',
        { annotations, groupStyles }
      );
      log.debug(
        `Saved ${annotations.length} annotations and ${groupStyles.length} group styles successfully`
      );
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
    // Cancel any pending saves first
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

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