import cytoscape from 'cytoscape';
import { VscodeMessageSender } from './managerVscodeWebview';
import { FreeTextAnnotation } from '../types/topoViewerGraph';
import { log } from '../logging/logger';
import type { ManagerGroupStyle } from './managerGroupStyle';

interface FreeTextModalElements {
  backdrop: HTMLDivElement;
  dialog: HTMLDivElement;
  dragHandle: HTMLDivElement;
  titleEl: HTMLHeadingElement;
  textInput: HTMLTextAreaElement;
  fontSizeInput: HTMLInputElement;
  fontFamilySelect: HTMLSelectElement;
  fontColorInput: HTMLInputElement;
  bgColorInput: HTMLInputElement;
  boldBtn: HTMLButtonElement;
  italicBtn: HTMLButtonElement;
  underlineBtn: HTMLButtonElement;
  transparentBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  okBtn: HTMLButtonElement;
}

interface FormattingState {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isTransparentBg: boolean;
}

// eslint-disable-next-line no-unused-vars
type FreeTextResolve = (value: FreeTextAnnotation | null) => void;

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
  private idCounter = 0;
  private reapplyStylesBound: () => void;
  private onLoadTimeout: () => Promise<void>;

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender, groupStyleManager?: ManagerGroupStyle) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.groupStyleManager = groupStyleManager;
    this.setupEventHandlers();
    this.setupStylePreservation();

    this.reapplyStylesBound = () => {
      this.annotationNodes.forEach((node, id) => {
        const annotation = this.annotations.get(id);
        if (annotation) {
          this.applyTextNodeStyles(node, annotation);
        }
      });
      log.debug('Reapplied styles to free text annotations');
    };

    this.onLoadTimeout = async () => {
      this.loadInProgress = true;
      try {
        const response = await this.messageSender.sendMessageToVscodeEndpointPost(
          'topo-editor-load-annotations',
          {}
        );

        if (response && response.annotations) {
          this.annotations.clear();
          this.annotationNodes.forEach(node => { if (node && node.inside()) node.remove(); });
          this.annotationNodes.clear();

          const annotations = response.annotations as FreeTextAnnotation[];
          annotations.forEach(annotation => this.addFreeTextAnnotation(annotation));
          log.info(`Loaded ${annotations.length} free text annotations`);

          setTimeout(this.reapplyStylesBound, 200);
        }
      } catch (error) {
        log.error(`Failed to load annotations: ${error}`);
      } finally {
        this.loadInProgress = false;
      }
    };
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
    const SELECTOR_FREE_TEXT = 'node[topoViewerRole="freeText"]';
    // Handle double-click on free text nodes to edit
    this.cy.on('dblclick', SELECTOR_FREE_TEXT, (event) => {
      event.preventDefault();
      event.stopPropagation();
      const node = event.target;
      this.editFreeText(node.id());
    });

    // Also try dbltap for touch devices
    this.cy.on('dbltap', SELECTOR_FREE_TEXT, (event) => {
      event.preventDefault();
      event.stopPropagation();
      const node = event.target;
      this.editFreeText(node.id());
    });

    // Handle deletion of free text nodes
    this.cy.on('remove', SELECTOR_FREE_TEXT, (event) => {
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
    this.cy.on('dragfree', SELECTOR_FREE_TEXT, (event) => {
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
    const id = `freeText_${Date.now()}_${++this.idCounter}`;
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
      this.openFreeTextModal(title, annotation, resolve);
    });
  }

  private openFreeTextModal(title: string, annotation: FreeTextAnnotation, resolve: FreeTextResolve): void {
    const elements = this.getModalElements();
    if (!elements) {
      resolve(null);
      return;
    }

    const cleanupTasks: Array<() => void> = [];
    const cleanup = () => cleanupTasks.forEach(task => task());

    this.initializeModal(title, annotation, elements);
    const state = this.setupFormattingControls(annotation, elements, cleanupTasks);
    cleanupTasks.push(this.setupDragHandlers(elements.dialog, elements.dragHandle));
    this.setupSubmitHandlers(annotation, elements, state, resolve, cleanup, cleanupTasks);
    cleanupTasks.push(() => {
      elements.dialog.style.display = 'none';
      elements.dialog.style.position = '';
      elements.dialog.style.left = '';
      elements.dialog.style.top = '';
      elements.dialog.style.transform = '';
      elements.dragHandle.style.cursor = 'grab';
      elements.backdrop.style.display = 'none';
    });

    this.showModal(elements);
  }

  private getModalElements(): FreeTextModalElements | null {
    const elements = {
      backdrop: document.getElementById('free-text-modal-backdrop') as HTMLDivElement | null,
      dialog: document.getElementById('free-text-modal') as HTMLDivElement | null,
      dragHandle: document.getElementById('free-text-drag-handle') as HTMLDivElement | null,
      titleEl: document.getElementById('free-text-modal-title') as HTMLHeadingElement | null,
      textInput: document.getElementById('free-text-modal-text') as HTMLTextAreaElement | null,
      fontSizeInput: document.getElementById('free-text-font-size') as HTMLInputElement | null,
      fontFamilySelect: document.getElementById('free-text-font-family') as HTMLSelectElement | null,
      fontColorInput: document.getElementById('free-text-font-color') as HTMLInputElement | null,
      bgColorInput: document.getElementById('free-text-bg-color') as HTMLInputElement | null,
      boldBtn: document.getElementById('free-text-bold-btn') as HTMLButtonElement | null,
      italicBtn: document.getElementById('free-text-italic-btn') as HTMLButtonElement | null,
      underlineBtn: document.getElementById('free-text-underline-btn') as HTMLButtonElement | null,
      transparentBtn: document.getElementById('free-text-transparent-btn') as HTMLButtonElement | null,
      cancelBtn: document.getElementById('free-text-cancel-btn') as HTMLButtonElement | null,
      okBtn: document.getElementById('free-text-ok-btn') as HTMLButtonElement | null,
    };

    if (Object.values(elements).some(el => el === null)) {
      log.error('Free text modal elements not found');
      return null;
    }

    return elements as FreeTextModalElements;
  }

  private initializeModal(title: string, annotation: FreeTextAnnotation, els: FreeTextModalElements): void {
    const { titleEl, textInput, fontSizeInput, fontFamilySelect, fontColorInput, bgColorInput } = els;

    titleEl.textContent = title;
    this.applyTextInputStyles(textInput, annotation);
    fontSizeInput.value = String(annotation.fontSize ?? 14);
    this.populateFontFamilySelect(fontFamilySelect, annotation.fontFamily);
    fontColorInput.value = annotation.fontColor ?? '#FFFFFF';
    bgColorInput.value = this.resolveBackgroundColor(annotation.backgroundColor, true);
  }

  private applyTextInputStyles(textInput: HTMLTextAreaElement, annotation: FreeTextAnnotation): void {
    textInput.value = annotation.text ?? '';
    textInput.style.fontFamily = annotation.fontFamily ?? 'monospace';
    textInput.style.fontSize = `${annotation.fontSize ?? 14}px`;
    textInput.style.fontWeight = annotation.fontWeight ?? 'normal';
    textInput.style.fontStyle = annotation.fontStyle ?? 'normal';
    textInput.style.textDecoration = annotation.textDecoration ?? 'none';
    textInput.style.color = annotation.fontColor ?? '#FFFFFF';
    textInput.style.background = this.resolveBackgroundColor(annotation.backgroundColor, false);
  }

  private populateFontFamilySelect(select: HTMLSelectElement, selectedFamily?: string): void {
    select.innerHTML = '';
    const fonts = ['monospace', 'sans-serif', 'serif', 'Arial', 'Helvetica', 'Courier New', 'Times New Roman', 'Georgia'];
    const selected = selectedFamily ?? 'monospace';
    fonts.forEach(font => {
      const option = document.createElement('option');
      option.value = font;
      option.textContent = font;
      option.selected = font === selected;
      select.appendChild(option);
    });
  }

  private resolveBackgroundColor(color: string | undefined, forInput: boolean): string {
    if (color === 'transparent') {
      return forInput ? '#000000' : 'transparent';
    }
    return color ?? '#000000';
  }

  private bindHandler(
    el: HTMLElement,
    prop: 'onclick' | 'oninput' | 'onchange' | 'onkeydown',
    handler: any,
    cleanupTasks: Array<() => void>
  ): void {
    (el as any)[prop] = handler;
    cleanupTasks.push(() => { (el as any)[prop] = null; });
  }

  private configureFontInputs(els: FreeTextModalElements, cleanupTasks: Array<() => void>): void {
    const { fontSizeInput, fontFamilySelect, fontColorInput, bgColorInput, textInput } = els;
    this.bindHandler(fontSizeInput, 'oninput', () => {
      textInput.style.fontSize = fontSizeInput.value + 'px';
    }, cleanupTasks);
    this.bindHandler(fontFamilySelect, 'onchange', () => {
      textInput.style.fontFamily = fontFamilySelect.value;
    }, cleanupTasks);
    this.bindHandler(fontColorInput, 'oninput', () => {
      textInput.style.color = fontColorInput.value;
    }, cleanupTasks);
    this.bindHandler(bgColorInput, 'oninput', () => {
      if (!bgColorInput.disabled) {
        textInput.style.background = bgColorInput.value;
      }
    }, cleanupTasks);
  }

  private configureStyleButtons(
    els: FreeTextModalElements,
    state: FormattingState,
    cleanupTasks: Array<() => void>
  ): () => void {
    const { boldBtn, italicBtn, underlineBtn, transparentBtn, bgColorInput, textInput } = els;
    const BTN_BASE = 'btn btn-small';
    const BTN_BASE_RIGHT = 'btn btn-small ml-auto';
    const BTN_PRIMARY = 'btn-primary';
    const BTN_OUTLINED = 'btn-outlined';
    const updateButtonClasses = () => {
      boldBtn.className = `${BTN_BASE} ${state.isBold ? BTN_PRIMARY : BTN_OUTLINED}`;
      italicBtn.className = `${BTN_BASE} ${state.isItalic ? BTN_PRIMARY : BTN_OUTLINED}`;
      underlineBtn.className = `${BTN_BASE} ${state.isUnderline ? BTN_PRIMARY : BTN_OUTLINED}`;
      transparentBtn.className = `${BTN_BASE_RIGHT} ${state.isTransparentBg ? BTN_PRIMARY : BTN_OUTLINED}`;
    };

    const toggles = [
      { btn: boldBtn, key: 'isBold', style: ['fontWeight', 'bold', 'normal'] as const },
      { btn: italicBtn, key: 'isItalic', style: ['fontStyle', 'italic', 'normal'] as const },
      { btn: underlineBtn, key: 'isUnderline', style: ['textDecoration', 'underline', 'none'] as const },
    ] as const;

    toggles.forEach(({ btn, key, style }) => {
      this.bindHandler(btn, 'onclick', () => {
        state[key] = !state[key];
        (textInput.style as any)[style[0]] = state[key] ? style[1] : style[2];
        updateButtonClasses();
      }, cleanupTasks);
    });

    this.bindHandler(transparentBtn, 'onclick', () => {
      state.isTransparentBg = !state.isTransparentBg;
      bgColorInput.disabled = state.isTransparentBg;
      textInput.style.background = state.isTransparentBg ? 'transparent' : bgColorInput.value;
      updateButtonClasses();
    }, cleanupTasks);

    return updateButtonClasses;
  }

  private setupFormattingControls(annotation: FreeTextAnnotation, els: FreeTextModalElements, cleanupTasks: Array<() => void>): FormattingState {
    const { bgColorInput, textInput } = els;

    const state: FormattingState = {
      isBold: annotation.fontWeight === 'bold',
      isItalic: annotation.fontStyle === 'italic',
      isUnderline: annotation.textDecoration === 'underline',
      isTransparentBg: annotation.backgroundColor === 'transparent',
    };

    this.configureFontInputs(els, cleanupTasks);
    const updateButtonClasses = this.configureStyleButtons(els, state, cleanupTasks);

    if (state.isTransparentBg) {
      bgColorInput.disabled = true;
      textInput.style.background = 'transparent';
    }

    updateButtonClasses();
    return state;
  }

  private setupDragHandlers(dialog: HTMLDivElement, dragHandle: HTMLDivElement): () => void {
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

    return () => {
      dragHandle.onmousedown = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  private buildAnnotationResult(
    annotation: FreeTextAnnotation,
    els: FreeTextModalElements,
    state: FormattingState
  ): FreeTextAnnotation | null {
    const { textInput, fontSizeInput, fontColorInput, bgColorInput, fontFamilySelect } = els;
    const text = textInput.value.trim();
    if (!text) {
      return null;
    }
    return {
      ...annotation,
      text,
      fontSize: parseInt(fontSizeInput.value),
      fontColor: fontColorInput.value,
      backgroundColor: state.isTransparentBg ? 'transparent' : bgColorInput.value,
      fontWeight: state.isBold ? 'bold' : 'normal',
      fontStyle: state.isItalic ? 'italic' : 'normal',
      textDecoration: state.isUnderline ? 'underline' : 'none',
      fontFamily: fontFamilySelect.value,
    };
  }

  private setupSubmitHandlers(
    annotation: FreeTextAnnotation,
    els: FreeTextModalElements,
    state: FormattingState,
    resolve: FreeTextResolve,
    cleanup: () => void,
    cleanupTasks: Array<() => void>
  ): void {
    const { textInput, cancelBtn, okBtn } = els;

    this.bindHandler(cancelBtn, 'onclick', () => {
      cleanup();
      resolve(null);
    }, cleanupTasks);

    this.bindHandler(okBtn, 'onclick', () => {
      const result = this.buildAnnotationResult(annotation, els, state);
      cleanup();
      resolve(result);
    }, cleanupTasks);

    this.bindHandler(textInput, 'onkeydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelBtn.click();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        okBtn.click();
      }
    }, cleanupTasks);
  }

  private showModal(els: FreeTextModalElements): void {
    els.backdrop.style.display = 'block';
    els.dialog.style.display = 'block';
    els.textInput.focus();
    els.textInput.select();
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
    this.loadTimeout = setTimeout(this.onLoadTimeout, 100);
    return Promise.resolve();
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
