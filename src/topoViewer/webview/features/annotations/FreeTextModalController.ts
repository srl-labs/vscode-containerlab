/**
 * Controls the free text editing modal UI.
 * Handles modal display, formatting controls, and user input.
 */
import MarkdownIt from 'markdown-it';
import { full as markdownItEmoji } from 'markdown-it-emoji';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import { FreeTextAnnotation } from '../../../shared/types/topoViewerGraph';
import { log } from '../../platform/logging/logger';
import {
  TextAlignment,
  BUTTON_BASE_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_OUTLINED_CLASS,
  BUTTON_BASE_RIGHT_CLASS,
  CLASS_HAS_CHANGES,
  PANEL_FREE_TEXT_ID,
  MARKDOWN_EMPTY_STATE_MESSAGE,
  MIN_FREE_TEXT_FONT_SIZE,
  escapeHtml,
  normalizeFontSize,
  normalizeRotation,
  applyPreviewFontSize,
  resolveBackgroundColor,
  bindHandler
} from './freeTextUtils';

// Markdown renderer instance for preview
const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
  langPrefix: 'hljs language-',
  highlight(code: string, lang: string) {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch (error) {
      log.warn({ message: 'freeText:highlightFailed', error });
      return escapeHtml(code);
    }
  }
}).use(markdownItEmoji);

export interface FreeTextModalElements {
  panel: HTMLDivElement;
  titleEl: HTMLSpanElement;
  closeBtn: HTMLButtonElement;
  textInput: HTMLTextAreaElement;
  previewContainer: HTMLDivElement;
  previewContent: HTMLDivElement;
  tabWriteBtn: HTMLButtonElement;
  tabPreviewBtn: HTMLButtonElement;
  fontSizeInput: HTMLInputElement;
  fontFamilySelect: HTMLSelectElement;
  fontColorInput: HTMLInputElement;
  bgColorInput: HTMLInputElement;
  rotationInput: HTMLInputElement;
  boldBtn: HTMLButtonElement;
  italicBtn: HTMLButtonElement;
  underlineBtn: HTMLButtonElement;
  alignLeftBtn: HTMLButtonElement;
  alignCenterBtn: HTMLButtonElement;
  alignRightBtn: HTMLButtonElement;
  transparentBtn: HTMLButtonElement;
  roundedBtn: HTMLButtonElement;
  applyBtn: HTMLButtonElement;
  okBtn: HTMLButtonElement;
}

export interface FormattingState {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isTransparentBg: boolean;
  hasRoundedBg: boolean;
  alignment: TextAlignment;
}

export type FreeTextResolve = (value: FreeTextAnnotation | null) => void;

/**
 * Callback interface for modal controller to notify parent of changes
 */
export interface ModalControllerCallbacks {
  onAnnotationUpdated: (annotation: FreeTextAnnotation) => void;
  onSaveRequested: () => void;
}

/**
 * Controls the free text editing modal.
 */
export class FreeTextModalController {
  private callbacks: ModalControllerCallbacks;
  private freeTextInitialValues: Record<string, string> | null = null;

  constructor(callbacks: ModalControllerCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Open the free text modal for editing.
   */
  public openFreeTextModal(title: string, annotation: FreeTextAnnotation, resolve: FreeTextResolve): void {
    const elements = this.getModalElements();
    if (!elements) {
      resolve(null);
      return;
    }

    const cleanupTasks: Array<() => void> = [];
    const cleanup = () => cleanupTasks.forEach(task => task());

    this.initializeModal(title, annotation, elements);
    const state = this.setupFormattingControls(annotation, elements, cleanupTasks);
    this.initializeMarkdownPreview(elements, cleanupTasks);
    this.setupSubmitHandlers(annotation, elements, state, resolve, cleanup, cleanupTasks);
    cleanupTasks.push(() => {
      this.hideModal(elements);
    });

    // Capture initial values for change tracking after a small delay to ensure DOM is updated
    setTimeout(() => {
      this.freeTextInitialValues = this.captureFreeTextValues(elements);
      this.updateFreeTextApplyButtonState(elements);
    }, 0);

    // Set up change tracking on all inputs
    this.setupFreeTextChangeTracking(elements, cleanupTasks);

    this.showModal(elements);
  }

  /**
   * Prompt user for text input with formatting options.
   */
  public async promptForTextWithFormatting(title: string, annotation: FreeTextAnnotation): Promise<FreeTextAnnotation | null> {
    return new Promise((resolve) => {
      this.openFreeTextModal(title, annotation, resolve);
    });
  }

  private getModalElements(): FreeTextModalElements | null {
    const elements = {
      panel: document.getElementById(PANEL_FREE_TEXT_ID) as HTMLDivElement | null,
      titleEl: document.getElementById(`${PANEL_FREE_TEXT_ID}-title`) as HTMLSpanElement | null,
      closeBtn: document.getElementById(`${PANEL_FREE_TEXT_ID}-close`) as HTMLButtonElement | null,
      textInput: document.getElementById('free-text-modal-text') as HTMLTextAreaElement | null,
      previewContainer: document.getElementById('free-text-preview-container') as HTMLDivElement | null,
      previewContent: document.getElementById('free-text-preview') as HTMLDivElement | null,
      tabWriteBtn: document.getElementById('free-text-tab-write') as HTMLButtonElement | null,
      tabPreviewBtn: document.getElementById('free-text-tab-preview') as HTMLButtonElement | null,
      fontSizeInput: document.getElementById('free-text-font-size') as HTMLInputElement | null,
      fontFamilySelect: document.getElementById('free-text-font-family') as HTMLSelectElement | null,
      fontColorInput: document.getElementById('free-text-font-color') as HTMLInputElement | null,
      bgColorInput: document.getElementById('free-text-bg-color') as HTMLInputElement | null,
      rotationInput: document.getElementById('free-text-rotation') as HTMLInputElement | null,
      boldBtn: document.getElementById('free-text-bold-btn') as HTMLButtonElement | null,
      italicBtn: document.getElementById('free-text-italic-btn') as HTMLButtonElement | null,
      underlineBtn: document.getElementById('free-text-underline-btn') as HTMLButtonElement | null,
      alignLeftBtn: document.getElementById('free-text-align-left-btn') as HTMLButtonElement | null,
      alignCenterBtn: document.getElementById('free-text-align-center-btn') as HTMLButtonElement | null,
      alignRightBtn: document.getElementById('free-text-align-right-btn') as HTMLButtonElement | null,
      transparentBtn: document.getElementById('free-text-transparent-btn') as HTMLButtonElement | null,
      roundedBtn: document.getElementById('free-text-rounded-btn') as HTMLButtonElement | null,
      applyBtn: document.getElementById('free-text-apply-btn') as HTMLButtonElement | null,
      okBtn: document.getElementById('free-text-ok-btn') as HTMLButtonElement | null,
    };

    if (Object.values(elements).some(el => el === null)) {
      log.error('Free text modal elements not found');
      return null;
    }

    return elements as FreeTextModalElements;
  }

  private initializeModal(title: string, annotation: FreeTextAnnotation, els: FreeTextModalElements): void {
    const {
      titleEl,
      textInput,
      fontSizeInput,
      fontFamilySelect,
      fontColorInput,
      bgColorInput,
      rotationInput
    } = els;

    titleEl.textContent = title;
    this.applyTextInputStyles(textInput, annotation);
    fontSizeInput.min = String(MIN_FREE_TEXT_FONT_SIZE);
    fontSizeInput.value = String(normalizeFontSize(annotation.fontSize));
    this.populateFontFamilySelect(fontFamilySelect, annotation.fontFamily);
    fontColorInput.value = annotation.fontColor ?? '#FFFFFF';
    bgColorInput.value = resolveBackgroundColor(annotation.backgroundColor, true);
    rotationInput.min = '-360';
    rotationInput.max = '360';
    rotationInput.step = '1';
    rotationInput.value = String(normalizeRotation(annotation.rotation));
  }

  private applyTextInputStyles(textInput: HTMLTextAreaElement, annotation: FreeTextAnnotation): void {
    textInput.value = annotation.text ?? '';
    textInput.style.fontFamily = annotation.fontFamily ?? 'monospace';
    applyPreviewFontSize(textInput, annotation.fontSize);
    textInput.style.fontWeight = annotation.fontWeight ?? 'normal';
    textInput.style.fontStyle = annotation.fontStyle ?? 'normal';
    textInput.style.textDecoration = annotation.textDecoration ?? 'none';
    textInput.style.textAlign = annotation.textAlign ?? 'left';
    textInput.style.color = annotation.fontColor ?? '#FFFFFF';
    textInput.style.background = resolveBackgroundColor(annotation.backgroundColor, false);
    textInput.style.borderRadius = annotation.roundedBackground === false ? '0' : '';
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

  private setupFreeTextChangeTracking(els: FreeTextModalElements, cleanupTasks: Array<() => void>): void {
    const { textInput, fontSizeInput, fontFamilySelect, fontColorInput, bgColorInput, rotationInput } = els;
    const updateState = () => this.updateFreeTextApplyButtonState(els);

    const inputs = [textInput, fontSizeInput, fontFamilySelect, fontColorInput, bgColorInput, rotationInput];
    inputs.forEach(input => {
      if (input) {
        input.addEventListener('input', updateState);
        cleanupTasks.push(() => input.removeEventListener('input', updateState));
      }
    });

    // Also track change events for selects
    if (fontFamilySelect) {
      fontFamilySelect.addEventListener('change', updateState);
      cleanupTasks.push(() => fontFamilySelect.removeEventListener('change', updateState));
    }
  }

  private captureFreeTextValues(els: FreeTextModalElements): Record<string, string> {
    return {
      text: els.textInput.value,
      fontSize: els.fontSizeInput.value,
      fontFamily: els.fontFamilySelect.value,
      fontColor: els.fontColorInput.value,
      bgColor: els.bgColorInput.value,
      rotation: els.rotationInput.value
    };
  }

  private hasFreeTextChanges(els: FreeTextModalElements): boolean {
    if (!this.freeTextInitialValues) return false;
    const current = this.captureFreeTextValues(els);
    return Object.keys(this.freeTextInitialValues).some(
      key => this.freeTextInitialValues![key] !== current[key]
    );
  }

  private updateFreeTextApplyButtonState(els: FreeTextModalElements): void {
    const { applyBtn } = els;
    if (!applyBtn) return;
    const hasChanges = this.hasFreeTextChanges(els);
    applyBtn.classList.toggle(CLASS_HAS_CHANGES, hasChanges);
  }

  private resetFreeTextInitialValues(els: FreeTextModalElements): void {
    this.freeTextInitialValues = this.captureFreeTextValues(els);
    this.updateFreeTextApplyButtonState(els);
  }

  private configureFontInputs(els: FreeTextModalElements, cleanupTasks: Array<() => void>): void {
    const { fontSizeInput, fontFamilySelect, fontColorInput, bgColorInput, textInput, previewContent } = els;
    bindHandler(fontSizeInput, 'oninput', () => {
      const size = Number.parseInt(fontSizeInput.value, 10);
      const normalized = normalizeFontSize(size);
      applyPreviewFontSize(textInput, normalized);
      previewContent.style.fontSize = `${normalized}px`;
    }, cleanupTasks);
    bindHandler(fontFamilySelect, 'onchange', () => {
      textInput.style.fontFamily = fontFamilySelect.value;
      previewContent.style.fontFamily = fontFamilySelect.value;
    }, cleanupTasks);
    bindHandler(fontColorInput, 'oninput', () => {
      textInput.style.color = fontColorInput.value;
      previewContent.style.color = fontColorInput.value;
    }, cleanupTasks);
    bindHandler(bgColorInput, 'oninput', () => {
      if (!bgColorInput.disabled) {
        textInput.style.background = bgColorInput.value;
        previewContent.style.background = bgColorInput.value;
      }
    }, cleanupTasks);
  }

  private configureStyleButtons(
    els: FreeTextModalElements,
    state: FormattingState,
    cleanupTasks: Array<() => void>
  ): () => void {
    const {
      boldBtn,
      italicBtn,
      underlineBtn,
      transparentBtn,
      roundedBtn,
      bgColorInput,
      textInput,
      previewContent
    } = els;
    const updateButtonClasses = () => {
      boldBtn.className = `${BUTTON_BASE_CLASS} ${state.isBold ? BUTTON_PRIMARY_CLASS : BUTTON_OUTLINED_CLASS}`;
      italicBtn.className = `${BUTTON_BASE_CLASS} ${state.isItalic ? BUTTON_PRIMARY_CLASS : BUTTON_OUTLINED_CLASS}`;
      underlineBtn.className = `${BUTTON_BASE_CLASS} ${state.isUnderline ? BUTTON_PRIMARY_CLASS : BUTTON_OUTLINED_CLASS}`;
      transparentBtn.className = `${BUTTON_BASE_RIGHT_CLASS} ${state.isTransparentBg ? BUTTON_PRIMARY_CLASS : BUTTON_OUTLINED_CLASS}`;
      roundedBtn.className = `${BUTTON_BASE_CLASS} ${state.hasRoundedBg ? BUTTON_PRIMARY_CLASS : BUTTON_OUTLINED_CLASS}`;
    };

    const toggles = [
      { btn: boldBtn, key: 'isBold', style: ['fontWeight', 'bold', 'normal'] as const },
      { btn: italicBtn, key: 'isItalic', style: ['fontStyle', 'italic', 'normal'] as const },
      { btn: underlineBtn, key: 'isUnderline', style: ['textDecoration', 'underline', 'none'] as const },
    ] as const;

    toggles.forEach(({ btn, key, style }) => {
      bindHandler(btn, 'onclick', () => {
        state[key] = !state[key];
        (textInput.style as any)[style[0]] = state[key] ? style[1] : style[2];
        (previewContent.style as any)[style[0]] = state[key] ? style[1] : style[2];
        updateButtonClasses();
      }, cleanupTasks);
    });

    bindHandler(transparentBtn, 'onclick', () => {
      state.isTransparentBg = !state.isTransparentBg;
      bgColorInput.disabled = state.isTransparentBg;
      textInput.style.background = state.isTransparentBg ? 'transparent' : bgColorInput.value;
      previewContent.style.background = state.isTransparentBg ? 'transparent' : bgColorInput.value;
      updateButtonClasses();
    }, cleanupTasks);

    this.configureRoundedButton(roundedBtn, state, textInput, previewContent, updateButtonClasses, cleanupTasks);

    return updateButtonClasses;
  }

  private configureRoundedButton(
    roundedBtn: HTMLButtonElement,
    state: FormattingState,
    textInput: HTMLTextAreaElement,
    previewContent: HTMLDivElement,
    onChange: () => void,
    cleanupTasks: Array<() => void>
  ): void {
    bindHandler(roundedBtn, 'onclick', () => {
      state.hasRoundedBg = !state.hasRoundedBg;
      const radius = state.hasRoundedBg ? '' : '0';
      textInput.style.borderRadius = radius;
      previewContent.style.borderRadius = radius;
      onChange();
    }, cleanupTasks);
  }

  private configureAlignmentButtons(
    els: FreeTextModalElements,
    state: FormattingState,
    cleanupTasks: Array<() => void>
  ): void {
    const { alignLeftBtn, alignCenterBtn, alignRightBtn, textInput, previewContent } = els;

    const setAlignmentClasses = () => {
      const { alignment } = state;
      alignLeftBtn.className = `${BUTTON_BASE_CLASS} ${alignment === 'left' ? BUTTON_PRIMARY_CLASS : BUTTON_OUTLINED_CLASS}`;
      alignCenterBtn.className = `${BUTTON_BASE_CLASS} ${alignment === 'center' ? BUTTON_PRIMARY_CLASS : BUTTON_OUTLINED_CLASS}`;
      alignRightBtn.className = `${BUTTON_BASE_CLASS} ${alignment === 'right' ? BUTTON_PRIMARY_CLASS : BUTTON_OUTLINED_CLASS}`;
    };

    const buttons: Array<{ btn: HTMLButtonElement; value: TextAlignment }> = [
      { btn: alignLeftBtn, value: 'left' },
      { btn: alignCenterBtn, value: 'center' },
      { btn: alignRightBtn, value: 'right' }
    ];

    buttons.forEach(({ btn, value }) => {
      bindHandler(btn, 'onclick', () => {
        state.alignment = value;
        textInput.style.textAlign = value;
        previewContent.style.textAlign = value;
        setAlignmentClasses();
      }, cleanupTasks);
    });

    setAlignmentClasses();
  }

  private setupFormattingControls(annotation: FreeTextAnnotation, els: FreeTextModalElements, cleanupTasks: Array<() => void>): FormattingState {
    const { bgColorInput, textInput, previewContent } = els;

    const state: FormattingState = {
      isBold: annotation.fontWeight === 'bold',
      isItalic: annotation.fontStyle === 'italic',
      isUnderline: annotation.textDecoration === 'underline',
      isTransparentBg: annotation.backgroundColor === 'transparent',
      hasRoundedBg: annotation.roundedBackground !== false,
      alignment: annotation.textAlign ?? 'left'
    };

    this.configureFontInputs(els, cleanupTasks);
    const updateButtonClasses = this.configureStyleButtons(els, state, cleanupTasks);
    this.configureAlignmentButtons(els, state, cleanupTasks);

    if (state.isTransparentBg) {
      bgColorInput.disabled = true;
      textInput.style.background = 'transparent';
      previewContent.style.background = 'transparent';
    }

    previewContent.style.textAlign = state.alignment;
    previewContent.style.fontWeight = textInput.style.fontWeight;
    previewContent.style.fontStyle = textInput.style.fontStyle;
    previewContent.style.textDecoration = textInput.style.textDecoration;
    previewContent.style.fontFamily = textInput.style.fontFamily;
    previewContent.style.color = textInput.style.color;
    previewContent.style.background = textInput.style.background;
    previewContent.style.borderRadius = state.hasRoundedBg ? '' : '0';
    previewContent.style.fontSize = `${normalizeFontSize(annotation.fontSize)}px`;

    updateButtonClasses();
    return state;
  }

  private initializeMarkdownPreview(els: FreeTextModalElements, cleanupTasks: Array<() => void>): void {
    const { textInput, previewContainer, previewContent, tabWriteBtn, tabPreviewBtn } = els;
    previewContent.style.textAlign = textInput.style.textAlign || 'left';

    const setButtonState = (btn: HTMLButtonElement, isActive: boolean) => {
      btn.classList.toggle('btn-primary', isActive);
      btn.classList.toggle('btn-outlined', !isActive);
    };

    const setTabState = (mode: 'write' | 'preview') => {
      const isWrite = mode === 'write';
      textInput.classList.toggle('hidden', !isWrite);
      previewContainer.classList.toggle('hidden', isWrite);
      setButtonState(tabWriteBtn, isWrite);
      setButtonState(tabPreviewBtn, !isWrite);
      if (isWrite) {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => {
            textInput.focus();
          });
        } else {
          textInput.focus();
        }
      }
    };

    const updatePreview = () => {
      this.updateMarkdownPreview(previewContent, textInput.value);
    };

    updatePreview();
    setTabState('write');

    bindHandler(textInput, 'oninput', () => {
      updatePreview();
    }, cleanupTasks);

    bindHandler(tabWriteBtn, 'onclick', () => {
      setTabState('write');
    }, cleanupTasks);

    bindHandler(tabPreviewBtn, 'onclick', () => {
      updatePreview();
      setTabState('preview');
    }, cleanupTasks);

    cleanupTasks.push(() => {
      setTabState('write');
    });
  }

  private updateMarkdownPreview(previewContent: HTMLDivElement, text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      previewContent.textContent = MARKDOWN_EMPTY_STATE_MESSAGE;
      previewContent.style.opacity = '0.75';
      previewContent.style.fontStyle = 'italic';
      previewContent.style.color = 'var(--text-secondary)';
      return;
    }

    previewContent.style.opacity = '';
    previewContent.style.fontStyle = '';
    previewContent.style.color = '';

    previewContent.innerHTML = this.renderMarkdown(text);
  }

  private renderMarkdown(text: string): string {
    if (!text) {
      return '';
    }
    const rendered = markdownRenderer.render(text);
    return DOMPurify.sanitize(rendered);
  }

  private buildAnnotationResult(
    annotation: FreeTextAnnotation,
    els: FreeTextModalElements,
    state: FormattingState
  ): FreeTextAnnotation | null {
    const { textInput, fontSizeInput, fontColorInput, bgColorInput, fontFamilySelect, rotationInput } = els;
    const text = textInput.value.trim();
    if (!text) {
      return null;
    }
    const rotationValue = normalizeRotation(Number.parseFloat(rotationInput.value));
    return {
      ...annotation,
      text,
      fontSize: normalizeFontSize(Number.parseInt(fontSizeInput.value, 10)),
      fontColor: fontColorInput.value,
      backgroundColor: state.isTransparentBg ? 'transparent' : bgColorInput.value,
      fontWeight: state.isBold ? 'bold' : 'normal',
      fontStyle: state.isItalic ? 'italic' : 'normal',
      textDecoration: state.isUnderline ? 'underline' : 'none',
      fontFamily: fontFamilySelect.value,
      textAlign: state.alignment,
      roundedBackground: state.hasRoundedBg,
      rotation: rotationValue
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
    const { textInput, applyBtn, okBtn, closeBtn } = els;

    const handleClose = () => {
      cleanup();
      resolve(null);
    };

    // Apply changes without closing or resolving
    const applyChanges = () => {
      const result = this.buildAnnotationResult(annotation, els, state);
      if (result && result.text) {
        // Update annotation in place
        Object.assign(annotation, result);
        this.callbacks.onAnnotationUpdated(annotation);
        this.callbacks.onSaveRequested();
        // Reset initial values after successful apply
        this.resetFreeTextInitialValues(els);
      }
    };

    // Close button just closes without saving
    bindHandler(closeBtn, 'onclick', handleClose, cleanupTasks);

    // Apply saves but keeps panel open (doesn't resolve promise)
    bindHandler(applyBtn, 'onclick', applyChanges, cleanupTasks);

    // OK saves and closes
    bindHandler(okBtn, 'onclick', () => {
      const result = this.buildAnnotationResult(annotation, els, state);
      cleanup();
      resolve(result);
    }, cleanupTasks);

    bindHandler(textInput, 'onkeydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        okBtn.click();
      }
    }, cleanupTasks);
  }

  private showModal(els: FreeTextModalElements): void {
    // Use window manager to show the panel
    const managedWindow = (window as any).panelManager?.getPanel(PANEL_FREE_TEXT_ID);
    if (managedWindow) {
      managedWindow.show();
    } else {
      // Fallback if window manager not available
      els.panel.style.display = 'flex';
    }
    els.textInput.focus();
    els.textInput.select();
  }

  private hideModal(els: FreeTextModalElements): void {
    // Use window manager to hide the panel
    const managedWindow = (window as any).panelManager?.getPanel(PANEL_FREE_TEXT_ID);
    if (managedWindow) {
      managedWindow.hide();
    } else {
      // Fallback if window manager not available
      els.panel.style.display = 'none';
    }
  }
}
