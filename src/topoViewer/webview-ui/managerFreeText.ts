import cytoscape from 'cytoscape';
import MarkdownIt from 'markdown-it';
import { full as markdownItEmoji } from 'markdown-it-emoji';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import { VscodeMessageSender } from './managerVscodeWebview';
import { FreeTextAnnotation, GroupStyleAnnotation } from '../types/topoViewerGraph';
import { log } from '../logging/logger';
import type { ManagerGroupStyle } from './managerGroupStyle';

// Keep the saved font size small by default, but boost the preview to better match
// the appearance on the Cytoscape canvas where text renders larger than the modal.
const MIN_FREE_TEXT_FONT_SIZE = 1;
const DEFAULT_FREE_TEXT_FONT_SIZE = 8;
const DEFAULT_FREE_TEXT_PADDING = 3;
const PREVIEW_FONT_SCALE = 2;
const MARKDOWN_EMPTY_STATE_MESSAGE = 'Use Markdown (including ```fences```) to format notes.';
const DEFAULT_FREE_TEXT_WIDTH = 420;
const MIN_FREE_TEXT_WIDTH = 5;
const MIN_FREE_TEXT_HEIGHT = 5;
const MIN_FREE_TEXT_NODE_SIZE = 6;
const BUTTON_BASE_CLASS = 'btn btn-small';
const BUTTON_PRIMARY_CLASS = 'btn-primary';
const BUTTON_OUTLINED_CLASS = 'btn-outlined';
const BUTTON_BASE_RIGHT_CLASS = 'btn btn-small ml-auto';
const OVERLAY_HOVER_CLASS = 'free-text-overlay-hover';
const HANDLE_VISIBLE_CLASS = 'free-text-overlay-resize-visible';
const ROTATE_HANDLE_VISIBLE_CLASS = 'free-text-overlay-rotate-visible';
const PANEL_FREE_TEXT_ID = 'panel-free-text';
type TextAlignment = 'left' | 'center' | 'right';
const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, match => htmlEscapeMap[match]);

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

interface FreeTextModalElements {
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

interface FormattingState {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isTransparentBg: boolean;
  hasRoundedBg: boolean;
  alignment: TextAlignment;
}

interface OverlayEntry {
  wrapper: HTMLDivElement;
  content: HTMLDivElement;
  resizeHandle: HTMLButtonElement;
  rotateHandle: HTMLButtonElement;
  scrollbar: HTMLDivElement;
  frame?: { centerX: number; centerY: number; width: number; height: number };
  size?: { width: number; height: number };
  resizeObserver?: ResizeObserver | null;
}

interface OverlayResizeState {
  annotationId: string;
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

interface OverlayRotateState {
  annotationId: string;
  pointerId: number;
  startPointerAngle: number;
  startRotation: number;
  centerX: number;
  centerY: number;
}

// eslint-disable-next-line no-unused-vars
type PointerDownHandler = (event: PointerEvent) => void;

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
  private overlayContainer: HTMLDivElement | null = null;
  private overlayElements: Map<string, OverlayEntry> = new Map();
  private overlayResizeState: OverlayResizeState | null = null;
  private overlayRotateState: OverlayRotateState | null = null;
  private activeResizeHandle: HTMLButtonElement | null = null;
  private activeRotateHandle: HTMLButtonElement | null = null;
  private overlayHoverLocks: Set<string> = new Set();
  private overlayHoverHideTimers: Map<string, number> = new Map();
  private overlayWheelTarget: HTMLElement | null = null;
  private onLockStateChanged = (): void => {
    this.updateOverlayHandleInteractivity();
    if (this.isLabLocked()) {
      this.overlayElements.forEach((_entry, id) => this.setOverlayHoverState(id, false));
    }
  };
  // Track intended (unsnapped) positions for free text during drag
  private intendedPositions: Map<string, { x: number; y: number }> = new Map();
  // Guard to prevent recursive position corrections
  private positionCorrectionInProgress: Set<string> = new Set();
  private saveInProgress = false;
  private pendingSaveWhileBusy = false;
  private lastSavedStateKey: string | null = null;
  private onInteractiveAnchorPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  private isLabLocked(): boolean {
    return Boolean((window as any)?.topologyLocked);
  }
  private onOverlayResizeMove = (event: PointerEvent): void => {
    if (!this.overlayResizeState) {
      return;
    }
    const { annotationId, startX, startY, startWidth, startHeight } = this.overlayResizeState;
    const annotation = this.annotations.get(annotationId);
    const node = this.annotationNodes.get(annotationId);
    if (!annotation || !node) {
      return;
    }
    const zoom = this.cy.zoom() || 1;
    const deltaX = (event.clientX - startX) / zoom;
    const deltaY = (event.clientY - startY) / zoom;
    const nextWidth = Math.max(MIN_FREE_TEXT_WIDTH, Math.round(startWidth + deltaX));
    const nextHeight = Math.max(MIN_FREE_TEXT_HEIGHT, Math.round(startHeight + deltaY));
    const widthChanged = annotation.width !== nextWidth;
    const heightChanged = annotation.height !== nextHeight;
    if (!widthChanged && !heightChanged) {
      this.positionOverlayById(annotationId);
      return;
    }
    if (widthChanged) {
      annotation.width = nextWidth;
    }
    if (heightChanged) {
      annotation.height = nextHeight;
    }
    this.updateAnnotationOverlay(node, annotation);
  };

  private onOverlayResizeEnd = (): void => {
    if (!this.overlayResizeState) {
      return;
    }
    const { annotationId, pointerId } = this.overlayResizeState;
    if (this.activeResizeHandle && typeof this.activeResizeHandle.releasePointerCapture === 'function') {
      this.activeResizeHandle.releasePointerCapture(pointerId);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.onOverlayResizeMove);
      window.removeEventListener('pointerup', this.onOverlayResizeEnd);
      window.removeEventListener('pointercancel', this.onOverlayResizeEnd);
    }
    this.overlayHoverLocks.delete(annotationId);
    this.setOverlayHoverState(annotationId, false);
    this.overlayResizeState = null;
    this.activeResizeHandle = null;
    this.debouncedSave();
  };

  private onOverlayRotateMove = (event: PointerEvent): void => {
    if (!this.overlayRotateState) {
      return;
    }
    const { annotationId, startPointerAngle, startRotation, centerX, centerY } = this.overlayRotateState;
    const pointer = this.getRelativePointerPosition(event);
    const annotation = this.annotations.get(annotationId);
    const node = this.annotationNodes.get(annotationId);
    if (!annotation || !node) {
      return;
    }
    const pointerAngle = Math.atan2(pointer.y - centerY, pointer.x - centerX);
    const deltaAngleDeg = (pointerAngle - startPointerAngle) * (180 / Math.PI);
    const nextRotation = this.normalizeRotation(startRotation + deltaAngleDeg);
    if (annotation.rotation === nextRotation) {
      this.positionOverlayById(annotationId);
      return;
    }
    annotation.rotation = nextRotation;
    this.updateAnnotationOverlay(node, annotation);
  };

  private onOverlayRotateEnd = (): void => {
    if (!this.overlayRotateState) {
      return;
    }
    const { annotationId, pointerId } = this.overlayRotateState;
    if (this.activeRotateHandle && typeof this.activeRotateHandle.releasePointerCapture === 'function') {
      this.activeRotateHandle.releasePointerCapture(pointerId);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.onOverlayRotateMove);
      window.removeEventListener('pointerup', this.onOverlayRotateEnd);
      window.removeEventListener('pointercancel', this.onOverlayRotateEnd);
    }
    this.overlayHoverLocks.delete(annotationId);
    this.setOverlayHoverState(annotationId, false);
    this.overlayRotateState = null;
    this.activeRotateHandle = null;
    this.debouncedSave();
  };
  private styleReapplyInProgress = false;
  private static readonly SAVE_DEBOUNCE_MS = 300;
  private static readonly SAVE_MAX_WAIT_MS = 1200;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private saveBurstStart: number | null = null;
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
    this.initializeOverlayLayer();
    this.registerLockStateListener();

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
        log.info('freeText:loadAnnotations:request');
        const response = await this.messageSender.sendMessageToVscodeEndpointPost(
          'topo-editor-load-annotations',
          {}
        );

        if (response && response.annotations) {
          this.annotations.clear();
          this.annotationNodes.forEach(node => { if (node && node.inside()) node.remove(); });
          this.annotationNodes.clear();
          this.clearAnnotationOverlays();

          const annotations = response.annotations as FreeTextAnnotation[];
          annotations.forEach(annotation => this.addFreeTextAnnotation(annotation, { skipSave: true }));
          const groupStyles = this.groupStyleManager ? this.groupStyleManager.getGroupStyles() : [];
          this.lastSavedStateKey = this.buildSaveStateKey(annotations, groupStyles);
          log.info(`freeText:loadAnnotations:applied (annotations=${annotations.length})`);

          this.schedulePositionRestores();
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

  }

  public reapplyAllFreeTextStyles(): void {
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
      if ((window as any).topologyLocked) {
        (window as any).showLabLockedMessage?.();
        return;
      }
      const node = event.target;
      this.editFreeText(node.id());
    });

    // Also try dbltap for touch devices
    this.cy.on('dbltap', SELECTOR_FREE_TEXT, (event) => {
      event.preventDefault();
      event.stopPropagation();
      if ((window as any).topologyLocked) {
        (window as any).showLabLockedMessage?.();
        return;
      }
      const node = event.target;
      this.editFreeText(node.id());
    });

    this.cy.on('mouseover', SELECTOR_FREE_TEXT, (event) => {
      const node = event.target;
      this.setOverlayHoverState(node.id(), true);
    });

    this.cy.on('mouseout', SELECTOR_FREE_TEXT, (event) => {
      const node = event.target;
      this.setOverlayHoverState(node.id(), false);
    });

    // Handle deletion of free text nodes
    this.cy.on('remove', SELECTOR_FREE_TEXT, (event) => {
      const node = event.target;
      const id = node.id();
      // Only remove from our tracking if it's not already being handled
      if (this.annotations.has(id)) {
        this.annotations.delete(id);
        this.annotationNodes.delete(id);
        this.removeAnnotationOverlay(id);
        // Don't call saveAnnotations here as it might cause recursion
      }
    });

    // Handle position changes for free text nodes
    // After drag release, restore the intended (unsnapped) position to bypass grid snapping
    this.cy.on('dragfree', SELECTOR_FREE_TEXT, (event) => {
      const node = event.target;
      const nodeId = node.id();
      const intendedPos = this.intendedPositions.get(nodeId);
      if (intendedPos) {
        // Restore the unsnapped position - grid snap has already modified node.position()
        node.position(intendedPos);
        this.updateFreeTextPosition(nodeId, intendedPos);
        this.intendedPositions.delete(nodeId);
      } else {
        this.updateFreeTextPosition(nodeId, node.position());
      }
    });

    // Also handle position changes to keep overlays in sync and enforce annotation positions
    this.cy.on('position', SELECTOR_FREE_TEXT, (event) => this.handleFreeTextPositionChange(event));
  }

  /**
   * Handle position changes for free text nodes.
   * If user is dragging, track the position. Otherwise, enforce annotation position.
   */
  private handleFreeTextPositionChange(event: cytoscape.EventObject): void {
    const node = event.target;
    if (!node) {
      return;
    }
    this.positionOverlayById(node.id());

    const annotation = this.annotations.get(node.id());
    if (!annotation) {
      return;
    }

    if (node.grabbed()) {
      // Track the intended (unsnapped) position during drag
      const pos = node.position();
      this.intendedPositions.set(node.id(), {
        x: Math.round(pos.x),
        y: Math.round(pos.y)
      });
      annotation.position = {
        x: Math.round(pos.x),
        y: Math.round(pos.y)
      };
    } else {
      // Node is NOT being dragged - enforce annotation position
      this.enforceAnnotationPosition(node, annotation);
    }
  }

  /**
   * Force free text node position to match annotation data.
   * This prevents external changes (layout, grid snap) from moving free text.
   */
  private enforceAnnotationPosition(node: cytoscape.NodeSingular, annotation: FreeTextAnnotation): void {
    const nodeId = node.id();
    if (this.positionCorrectionInProgress.has(nodeId)) {
      return; // Prevent infinite recursion
    }
    const pos = node.position();
    const annotationX = annotation.position.x;
    const annotationY = annotation.position.y;
    if (Math.round(pos.x) !== annotationX || Math.round(pos.y) !== annotationY) {
      this.positionCorrectionInProgress.add(nodeId);
      node.position({ x: annotationX, y: annotationY });
      this.positionCorrectionInProgress.delete(nodeId);
    }
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
    const defaultAnnotation = this.buildDefaultAnnotation(id, position);

    const result = await this.promptForTextWithFormatting('Add Text', defaultAnnotation);
    if (!result || !result.text) return;

    this.addFreeTextAnnotation(result);
  }

  private buildDefaultAnnotation(id: string, position: cytoscape.Position): FreeTextAnnotation {
    const lastAnnotation = Array.from(this.annotations.values()).slice(-1)[0];
    const {
      fontSize = DEFAULT_FREE_TEXT_FONT_SIZE,
      fontColor = '#FFFFFF',
      backgroundColor = 'transparent',
      fontWeight = 'normal',
      fontStyle = 'normal',
      textDecoration = 'none',
      fontFamily = 'monospace',
      textAlign = 'left',
      rotation = 0,
      roundedBackground = true
    } = lastAnnotation ?? {};
    return {
      id,
      text: '',
      position: {
        x: Math.round(position.x),
        y: Math.round(position.y)
      },
      fontSize: this.normalizeFontSize(fontSize),
      fontColor,
      backgroundColor,
      fontWeight,
      fontStyle,
      textDecoration,
      fontFamily,
      textAlign,
      rotation: this.normalizeRotation(rotation),
      roundedBackground
    };
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
    this.initializeMarkdownPreview(elements, cleanupTasks);
    // Note: dragging is now handled by the window manager via panel-title-bar class
    this.setupSubmitHandlers(annotation, elements, state, resolve, cleanup, cleanupTasks);
    cleanupTasks.push(() => {
      this.hideModal(elements);
    });

    this.showModal(elements);
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
    fontSizeInput.value = String(this.normalizeFontSize(annotation.fontSize));
    this.populateFontFamilySelect(fontFamilySelect, annotation.fontFamily);
    fontColorInput.value = annotation.fontColor ?? '#FFFFFF';
    bgColorInput.value = this.resolveBackgroundColor(annotation.backgroundColor, true);
    rotationInput.min = '-360';
    rotationInput.max = '360';
    rotationInput.step = '1';
    rotationInput.value = String(this.normalizeRotation(annotation.rotation));
  }

  private applyTextInputStyles(textInput: HTMLTextAreaElement, annotation: FreeTextAnnotation): void {
    textInput.value = annotation.text ?? '';
    textInput.style.fontFamily = annotation.fontFamily ?? 'monospace';
    this.applyPreviewFontSize(textInput, annotation.fontSize);
    textInput.style.fontWeight = annotation.fontWeight ?? 'normal';
    textInput.style.fontStyle = annotation.fontStyle ?? 'normal';
    textInput.style.textDecoration = annotation.textDecoration ?? 'none';
    textInput.style.textAlign = annotation.textAlign ?? 'left';
    textInput.style.color = annotation.fontColor ?? '#FFFFFF';
    textInput.style.background = this.resolveBackgroundColor(annotation.backgroundColor, false);
    textInput.style.borderRadius = annotation.roundedBackground === false ? '0' : '';
  }

  private normalizeFontSize(fontSize?: number): number {
    const numeric = Number.isFinite(fontSize) && (fontSize as number) > 0
      ? Math.round(fontSize as number)
      : DEFAULT_FREE_TEXT_FONT_SIZE;
    return Math.max(MIN_FREE_TEXT_FONT_SIZE, numeric);
  }

  private normalizeRotation(rotation?: number): number {
    if (typeof rotation !== 'number' || !Number.isFinite(rotation)) {
      return 0;
    }
    const normalized = rotation % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  private degToRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private rotateOffset(x: number, y: number, rotationDeg: number): { x: number; y: number } {
    if (!rotationDeg) {
      return { x, y };
    }
    const angle = this.degToRad(rotationDeg);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos
    };
  }

  private applyPreviewFontSize(textInput: HTMLTextAreaElement, fontSize?: number): void {
    const baseSize = this.normalizeFontSize(fontSize);
    const previewSize = Math.max(baseSize, Math.round(baseSize * PREVIEW_FONT_SCALE));
    textInput.style.fontSize = `${previewSize}px`;
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

  private applyAlphaToColor(color: string, alpha: number): string {
    if (!color || color === 'transparent') {
      return 'transparent';
    }
    const normalizedAlpha = Math.min(1, Math.max(0, alpha));
    const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color);
    if (hexMatch) {
      const hex = hexMatch[1];
      const expandHex = (value: string): number => {
        if (value.length === 1) {
          return Number.parseInt(`${value}${value}`, 16);
        }
        return Number.parseInt(value, 16);
      };
      if (hex.length === 3) {
        const r = expandHex(hex[0]);
        const g = expandHex(hex[1]);
        const b = expandHex(hex[2]);
        return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
      }
      if (hex.length === 6 || hex.length === 8) {
        const r = expandHex(hex.slice(0, 2));
        const g = expandHex(hex.slice(2, 4));
        const b = expandHex(hex.slice(4, 6));
        const baseAlpha = hex.length === 8 ? expandHex(hex.slice(6, 8)) / 255 : 1;
        return `rgba(${r}, ${g}, ${b}, ${baseAlpha * normalizedAlpha})`;
      }
    }
    const rgbMatch = /^rgba?\(([^)]+)\)$/i.exec(color);
    if (rgbMatch) {
      const [r, g, b, existingAlpha = '1'] = rgbMatch[1].split(',').map(part => part.trim());
      const currentAlpha = Number.parseFloat(existingAlpha);
      const combinedAlpha = Number.isFinite(currentAlpha) ? currentAlpha * normalizedAlpha : normalizedAlpha;
      return `rgba(${r}, ${g}, ${b}, ${combinedAlpha})`;
    }
    return color;
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
    const { fontSizeInput, fontFamilySelect, fontColorInput, bgColorInput, textInput, previewContent } = els;
    this.bindHandler(fontSizeInput, 'oninput', () => {
      const size = Number.parseInt(fontSizeInput.value, 10);
      const normalized = this.normalizeFontSize(size);
      this.applyPreviewFontSize(textInput, normalized);
      previewContent.style.fontSize = `${normalized}px`;
    }, cleanupTasks);
    this.bindHandler(fontFamilySelect, 'onchange', () => {
      textInput.style.fontFamily = fontFamilySelect.value;
      previewContent.style.fontFamily = fontFamilySelect.value;
    }, cleanupTasks);
    this.bindHandler(fontColorInput, 'oninput', () => {
      textInput.style.color = fontColorInput.value;
      previewContent.style.color = fontColorInput.value;
    }, cleanupTasks);
    this.bindHandler(bgColorInput, 'oninput', () => {
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
      this.bindHandler(btn, 'onclick', () => {
        state[key] = !state[key];
        (textInput.style as any)[style[0]] = state[key] ? style[1] : style[2];
        (previewContent.style as any)[style[0]] = state[key] ? style[1] : style[2];
        updateButtonClasses();
      }, cleanupTasks);
    });

    this.bindHandler(transparentBtn, 'onclick', () => {
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
    this.bindHandler(roundedBtn, 'onclick', () => {
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
      this.bindHandler(btn, 'onclick', () => {
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
    previewContent.style.fontSize = `${this.normalizeFontSize(annotation.fontSize)}px`;

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

    this.bindHandler(textInput, 'oninput', () => {
      updatePreview();
    }, cleanupTasks);

    this.bindHandler(tabWriteBtn, 'onclick', () => {
      setTabState('write');
    }, cleanupTasks);

    this.bindHandler(tabPreviewBtn, 'onclick', () => {
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
    this.decorateMarkdownLinks(previewContent);
  }

  private renderMarkdown(text: string): string {
    if (!text) {
      return '';
    }
    const rendered = markdownRenderer.render(text);
    return DOMPurify.sanitize(rendered);
  }

  private decorateMarkdownLinks(container: HTMLElement): void {
    const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'));
    anchors.forEach(anchor => {
      if (anchor.dataset.freeTextLinkDecorated === 'true') {
        return;
      }
      anchor.dataset.freeTextLinkDecorated = 'true';
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
      anchor.style.pointerEvents = 'auto';
      const openLink = async (event: MouseEvent | KeyboardEvent): Promise<void> => {
        event.preventDefault();
        event.stopPropagation();
        const href = anchor.getAttribute('href');
        if (!href) {
          return;
        }
        try {
          await this.messageSender.sendMessageToVscodeEndpointPost('topo-editor-open-link', { url: href });
        } catch (error) {
          log.error(`freeText:openLinkFailed - ${String(error)}`);
        }
      };
      anchor.addEventListener('pointerdown', this.onInteractiveAnchorPointerDown);
      anchor.addEventListener('click', openLink);
      anchor.addEventListener('auxclick', event => {
        if (event.button === 1) {
          void openLink(event);
        }
      });
      anchor.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          void openLink(event);
        }
      });
    });
  }

  private initializeOverlayLayer(): void {
    const container = this.cy.container();
    if (!container || typeof document === 'undefined') {
      return;
    }

    if (typeof window !== 'undefined') {
      const computed = window.getComputedStyle(container);
      if (!computed || computed.position === 'static') {
        container.style.position = 'relative';
      }
    } else if (!container.style.position) {
      container.style.position = 'relative';
    }

    const overlay = document.createElement('div');
    overlay.className = 'free-text-overlay-layer';
    container.appendChild(overlay);
    this.overlayContainer = overlay;
    if (!this.overlayWheelTarget) {
      container.addEventListener('wheel', this.onOverlayWheel, { passive: false, capture: true });
      this.overlayWheelTarget = container;
    }

    const handler = () => {
      this.positionAllOverlays();
    };
    this.cy.on('pan', handler);
    this.cy.on('zoom', handler);
    this.cy.on('resize', handler);
  }

  private normalizeOverlayDimension(value: number | undefined, fallback: number): number {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.max(MIN_FREE_TEXT_NODE_SIZE, Math.round(numeric));
  }

  private registerLockStateListener(): void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    window.addEventListener('topology-lock-change', this.onLockStateChanged);
    this.updateOverlayHandleInteractivity();
  }

  private getRelativePointerPosition(event: PointerEvent): { x: number; y: number } {
    const container = this.cy.container();
    if (!container || typeof container.getBoundingClientRect !== 'function') {
      return { x: event.clientX, y: event.clientY };
    }
    const rect = container.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  private canUseResizeObserver(entry: OverlayEntry): boolean {
    return !entry.resizeObserver && typeof window !== 'undefined' && typeof window.ResizeObserver !== 'undefined';
  }

  private observeOverlayDom(entry: OverlayEntry, observer: ResizeObserver): void {
    try {
      observer.observe(entry.wrapper, { box: 'border-box' });
    } catch {
      observer.observe(entry.wrapper);
    }
  }

  private handleOverlayResizeEntries(annotationId: string, entry: OverlayEntry, entries: ResizeObserverEntry[]): void {
    if (!entries || entries.length === 0) {
      return;
    }
    const resizeEntry = entries[0];
    const wrapper = resizeEntry.target as HTMLDivElement;
    const fallbackHeight = Math.max(24, Number(wrapper.dataset.baseFontSize ?? '12'));
    const borderBoxArray = resizeEntry.borderBoxSize;
    const borderBox = borderBoxArray && borderBoxArray.length > 0 ? borderBoxArray[0] : undefined;
    const widthMeasurement = borderBox?.inlineSize ?? resizeEntry.contentRect.width;
    const heightMeasurement = borderBox?.blockSize ?? resizeEntry.contentRect.height;
    const width = this.normalizeOverlayDimension(widthMeasurement, DEFAULT_FREE_TEXT_WIDTH);
    const height = this.normalizeOverlayDimension(heightMeasurement, fallbackHeight);
    const prev = entry.size;
    if (prev && prev.width === width && prev.height === height) {
      return;
    }
    entry.size = { width, height };
    this.updateOverlayScrollbar(entry);
    this.positionOverlayById(annotationId);
  }

  private installOverlayResizeObserver(annotationId: string, entry: OverlayEntry): void {
    if (!this.canUseResizeObserver(entry)) {
      return;
    }

    const observer = new window.ResizeObserver(entries => {
      this.handleOverlayResizeEntries(annotationId, entry, entries);
    });

    this.observeOverlayDom(entry, observer);
    entry.resizeObserver = observer;
  }

  private createOverlayWrapper(annotationId: string): {
    wrapper: HTMLDivElement;
    content: HTMLDivElement;
    scrollbar: HTMLDivElement;
  } {
    const wrapper = document.createElement('div');
    wrapper.className = 'free-text-overlay free-text-overlay-scrollable';
    wrapper.dataset.annotationId = annotationId;
    wrapper.style.position = 'absolute';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.transform = 'translate(-50%, -50%)';
    wrapper.style.transformOrigin = 'center center';
    wrapper.style.lineHeight = '1.35';
    wrapper.style.whiteSpace = 'normal';
    wrapper.style.wordBreak = 'break-word';

    const content = document.createElement('div');
    content.className = 'free-text-overlay-content free-text-markdown';
    wrapper.appendChild(content);

    const scrollbar = document.createElement('div');
    scrollbar.className = 'free-text-overlay-scrollbar';
    wrapper.appendChild(scrollbar);

    return { wrapper, content, scrollbar };
  }

  private createOverlayHandle(
    annotationId: string,
    className: string,
    ariaLabel: string,
    onPointerDown: PointerDownHandler,
    isActive: () => boolean
  ): HTMLButtonElement {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = className;
    handle.setAttribute('aria-label', ariaLabel);
    handle.style.pointerEvents = 'auto';
    handle.style.touchAction = 'none';
    handle.onpointerdown = onPointerDown;
    handle.onpointerenter = () => {
      this.overlayHoverLocks.add(annotationId);
      this.setOverlayHoverState(annotationId, true);
    };
    handle.onpointerleave = () => {
      if (!isActive()) {
        this.overlayHoverLocks.delete(annotationId);
        this.setOverlayHoverState(annotationId, false);
      }
    };
    return handle;
  }

  private getOrCreateOverlayEntry(annotation: FreeTextAnnotation): OverlayEntry | null {
    const parent = this.cy.container();
    if (!this.overlayContainer || !parent) {
      return null;
    }

    let entry = this.overlayElements.get(annotation.id);
    if (entry) {
      return entry;
    }

    const { wrapper, content, scrollbar } = this.createOverlayWrapper(annotation.id);

    const resizeHandle = this.createOverlayHandle(
      annotation.id,
      'free-text-overlay-resize',
      'Resize text block',
      (event: PointerEvent) => this.startOverlayResize(annotation.id, event),
      () => this.overlayResizeState?.annotationId === annotation.id
    );

    const rotateHandle = this.createOverlayHandle(
      annotation.id,
      'free-text-overlay-rotate',
      'Rotate text block',
      (event: PointerEvent) => this.startOverlayRotate(annotation.id, event),
      () => this.overlayRotateState?.annotationId === annotation.id
    );

    this.overlayContainer.appendChild(wrapper);
    parent.appendChild(resizeHandle);
    parent.appendChild(rotateHandle);
    entry = { wrapper, content, resizeHandle, rotateHandle, scrollbar, resizeObserver: null };
    this.overlayElements.set(annotation.id, entry);
    this.updateOverlayHandleInteractivity(entry);
    this.installOverlayResizeObserver(annotation.id, entry);
    return entry;
  }

  private computeOverlaySizing(annotation: FreeTextAnnotation): {
    baseFontSize: number;
    basePaddingX: number;
    basePaddingY: number;
    baseRadius: number;
    baseWidth?: number;
    baseHeight?: number;
  } {
    const baseFontSize = this.normalizeFontSize(annotation.fontSize);
    const hasBackground = annotation.backgroundColor !== 'transparent';
    const basePaddingY = hasBackground ? DEFAULT_FREE_TEXT_PADDING : 0;
    const basePaddingX = hasBackground ? DEFAULT_FREE_TEXT_PADDING : 0;
    const baseRadius = hasBackground && (annotation.roundedBackground !== false)
      ? Math.max(4, Math.round(baseFontSize * 0.4))
      : 0;
    const hasExplicitWidth = Number.isFinite(annotation.width) && (annotation.width as number) > 0;
    const hasExplicitHeight = Number.isFinite(annotation.height) && (annotation.height as number) > 0;
    const baseWidth = hasExplicitWidth ? Math.max(MIN_FREE_TEXT_WIDTH, annotation.width as number) : undefined;
    const baseHeight = hasExplicitHeight ? Math.max(MIN_FREE_TEXT_HEIGHT, annotation.height as number) : undefined;
    return {
      baseFontSize,
      basePaddingX,
      basePaddingY,
      baseRadius,
      baseWidth,
      baseHeight
    };
  }

  private updateAnnotationOverlay(node: cytoscape.NodeSingular, annotation: FreeTextAnnotation): void {
    const entry = this.getOrCreateOverlayEntry(annotation);
    if (!entry) {
      return;
    }

    const { wrapper, content } = entry;
    const rotation = this.normalizeRotation(annotation.rotation);
    annotation.rotation = rotation;
    const sizing = this.computeOverlaySizing(annotation);
    wrapper.dataset.baseFontSize = String(sizing.baseFontSize);
    wrapper.dataset.basePaddingY = String(sizing.basePaddingY);
    wrapper.dataset.basePaddingX = String(sizing.basePaddingX);
    wrapper.dataset.baseBorderRadius = String(sizing.baseRadius);
    wrapper.dataset.baseMaxWidth = sizing.baseWidth ? String(sizing.baseWidth) : 'auto';
    wrapper.dataset.baseMaxHeight = sizing.baseHeight ? String(sizing.baseHeight) : 'auto';

    wrapper.style.color = annotation.fontColor ?? '#FFFFFF';
    wrapper.style.fontFamily = annotation.fontFamily ?? 'monospace';
    wrapper.style.fontWeight = annotation.fontWeight ?? 'normal';
    wrapper.style.fontStyle = annotation.fontStyle ?? 'normal';
    wrapper.style.textDecoration = annotation.textDecoration ?? 'none';
    wrapper.style.textAlign = annotation.textAlign ?? 'left';
    const hasBackground = annotation.backgroundColor !== 'transparent';
    const overlayBackground = hasBackground
      ? this.applyAlphaToColor(this.resolveBackgroundColor(annotation.backgroundColor, false), 0.9)
      : 'transparent';
    wrapper.style.background = overlayBackground;
    wrapper.style.opacity = '1';
    wrapper.style.boxShadow = 'none';

    const trimmedText = annotation.text?.trim();
    content.innerHTML = trimmedText ? this.renderMarkdown(annotation.text) : '';
    if (trimmedText) {
      this.decorateMarkdownLinks(content);
    }

    entry.size = this.applyOverlayBoxSizing(wrapper);
    this.updateOverlayScrollbar(entry);
    this.positionAnnotationOverlay(node, entry, annotation);
  }

  private positionAnnotationOverlay(
    node: cytoscape.NodeSingular,
    entry: OverlayEntry,
    annotation: FreeTextAnnotation
  ): void {
    const renderedPosition = node.renderedPosition();
    if (!renderedPosition) {
      return;
    }
    const { wrapper, resizeHandle, rotateHandle } = entry;
    const zoom = this.cy.zoom() || 1;
    const rotation = this.normalizeRotation(annotation.rotation);
    wrapper.style.left = `${renderedPosition.x}px`;
    wrapper.style.top = `${renderedPosition.y}px`;
    const shouldCacheSize = Boolean(entry.resizeObserver);
    let baseBox = entry.size;
    if (!baseBox || !shouldCacheSize) {
      baseBox = this.applyOverlayBoxSizing(wrapper);
      entry.size = baseBox;
      this.updateOverlayScrollbar(entry);
    }
    wrapper.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${zoom})`;
    const baseWidth = baseBox?.width ?? wrapper.offsetWidth ?? 0;
    const baseHeight = baseBox?.height ?? wrapper.offsetHeight ?? 0;
    const scaledUnrotatedWidth = baseWidth * zoom;
    const scaledUnrotatedHeight = baseHeight * zoom;
    const scaledBox = this.getRotatedFrame(baseBox, rotation, zoom);
    entry.frame = {
      centerX: renderedPosition.x,
      centerY: renderedPosition.y,
      width: scaledBox.width,
      height: scaledBox.height
    };
    this.syncNodeHitboxWithOverlay(node, scaledBox, zoom);
    this.positionOverlayResizeHandle(
      resizeHandle,
      renderedPosition,
      { width: scaledUnrotatedWidth, height: scaledUnrotatedHeight },
      rotation
    );
    this.positionOverlayRotateHandle(
      rotateHandle,
      renderedPosition,
      scaledUnrotatedHeight,
      rotation
    );
  }

  private getRotatedFrame(
    box: { width: number; height: number },
    rotationDeg: number,
    zoom: number
  ): { width: number; height: number } {
    if (!rotationDeg) {
      return {
        width: box.width * zoom,
        height: box.height * zoom
      };
    }
    const angle = this.degToRad(rotationDeg);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotatedWidth = Math.abs(box.width * cos) + Math.abs(box.height * sin);
    const rotatedHeight = Math.abs(box.width * sin) + Math.abs(box.height * cos);
    return {
      width: rotatedWidth * zoom,
      height: rotatedHeight * zoom
    };
  }

  private syncNodeHitboxWithOverlay(
    node: cytoscape.NodeSingular,
    box: { width: number; height: number },
    zoom: number
  ): void {
    const normalizedZoom = zoom || 1;
    const baseWidth = Math.max(MIN_FREE_TEXT_NODE_SIZE, Math.round(box.width / normalizedZoom));
    const baseHeight = Math.max(MIN_FREE_TEXT_NODE_SIZE, Math.round(box.height / normalizedZoom));
    node.style('width', baseWidth);
    node.style('height', baseHeight);
  }

  private getNodeTextMaxWidth(annotation: FreeTextAnnotation, useOverlay: boolean): string {
    if (useOverlay) {
      return `${Math.max(1, MIN_FREE_TEXT_NODE_SIZE)}px`;
    }
    const hasExplicitWidth = Number.isFinite(annotation.width) && (annotation.width as number) > 0;
    const baseWidth = hasExplicitWidth
      ? Math.max(MIN_FREE_TEXT_WIDTH, annotation.width as number)
      : DEFAULT_FREE_TEXT_WIDTH;
    return `${baseWidth}px`;
  }

  private applyOverlayBoxSizing(wrapper: HTMLDivElement): { width: number; height: number } {
    wrapper.style.fontSize = `${Math.max(MIN_FREE_TEXT_FONT_SIZE, Number(wrapper.dataset.baseFontSize ?? '12'))}px`;

    const basePaddingY = Number(wrapper.dataset.basePaddingY ?? '0');
    const basePaddingX = Number(wrapper.dataset.basePaddingX ?? '0');
    if (basePaddingX === 0 && basePaddingY === 0) {
      wrapper.style.padding = '0';
    } else {
      wrapper.style.padding = `${Math.max(0, basePaddingY)}px ${Math.max(0, basePaddingX)}px`;
    }
    const baseRadius = Number(wrapper.dataset.baseBorderRadius ?? '0');
    wrapper.style.borderRadius = baseRadius ? `${Math.max(0, baseRadius)}px` : '0';
    const width = this.applyOverlayWidthSizing(wrapper);
    const height = this.applyOverlayHeightSizing(wrapper);
    return { width, height };
  }

  private applyOverlayWidthSizing(wrapper: HTMLDivElement): number {
    const baseWidthRaw = wrapper.dataset.baseMaxWidth;
    if (baseWidthRaw && baseWidthRaw !== 'auto') {
      const numericWidth = Math.max(MIN_FREE_TEXT_WIDTH, Number(baseWidthRaw));
      wrapper.style.width = `${numericWidth}px`;
      wrapper.style.maxWidth = `${numericWidth}px`;
      return numericWidth;
    }
    wrapper.style.width = 'auto';
    wrapper.style.maxWidth = 'none';
    return wrapper.offsetWidth || wrapper.scrollWidth || DEFAULT_FREE_TEXT_WIDTH;
  }

  private applyOverlayHeightSizing(wrapper: HTMLDivElement): number {
    const baseHeightRaw = wrapper.dataset.baseMaxHeight;
    if (baseHeightRaw && baseHeightRaw !== 'auto') {
      const numericHeight = Math.max(MIN_FREE_TEXT_HEIGHT, Number(baseHeightRaw));
      wrapper.style.height = `${numericHeight}px`;
      wrapper.style.maxHeight = `${numericHeight}px`;
      wrapper.style.overflowY = 'auto';
      wrapper.style.scrollbarWidth = 'none';
      wrapper.style.setProperty('-ms-overflow-style', 'none');
      return numericHeight;
    }
    wrapper.style.height = 'auto';
    wrapper.style.maxHeight = 'none';
    wrapper.style.overflowY = '';
    wrapper.style.scrollbarWidth = '';
    wrapper.style.removeProperty('-ms-overflow-style');
    const fallbackHeight = Math.max(MIN_FREE_TEXT_HEIGHT, Number(wrapper.dataset.baseFontSize ?? '12'));
    return wrapper.offsetHeight || wrapper.scrollHeight || fallbackHeight;
  }

  private updateOverlayScrollbar(entry: OverlayEntry): void {
    const { wrapper, scrollbar } = entry;
    if (!scrollbar) {
      return;
    }
    const scrollHeight = wrapper.scrollHeight;
    const clientHeight = wrapper.clientHeight;
    const overflowGap = scrollHeight - clientHeight;
    const defaultVerticalMargin = Number(wrapper.dataset.basePaddingY ?? '0') * 2;
    const overflowThreshold = Math.max(0.5, defaultVerticalMargin);
    const hasOverflow = overflowGap > overflowThreshold;
    if (!hasOverflow) {
      wrapper.scrollTop = 0;
      scrollbar.classList.remove('free-text-overlay-scrollbar-visible');
      scrollbar.style.opacity = '0';
      scrollbar.style.transform = '';
      scrollbar.style.height = '';
      return;
    }
    const visibleHeight = clientHeight || 1;
    const thumbRatio = Math.min(1, visibleHeight / (scrollHeight || visibleHeight));
    const thumbHeight = Math.max(12, Math.round(visibleHeight * thumbRatio));
    const maxScrollTop = scrollHeight - visibleHeight;
    const maxOffset = Math.max(0, visibleHeight - thumbHeight);
    const scrollTop = Math.min(maxScrollTop, Math.max(0, wrapper.scrollTop));
    const translateY = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * maxOffset : 0;

    scrollbar.style.height = `${thumbHeight}px`;
    scrollbar.style.transform = `translateY(${translateY}px)`;
    scrollbar.style.opacity = '';
    scrollbar.classList.add('free-text-overlay-scrollbar-visible');
  }

  private findOverlayEntryAtPoint(clientX: number, clientY: number): OverlayEntry | null {
    if (!this.overlayContainer) {
      return null;
    }
    const containerRect = this.overlayContainer.getBoundingClientRect();
    const relativeX = clientX - containerRect.left;
    const relativeY = clientY - containerRect.top;
    for (const entry of this.overlayElements.values()) {
      const frame = entry.frame;
      if (!frame) {
        continue;
      }
      const left = frame.centerX - frame.width / 2;
      const top = frame.centerY - frame.height / 2;
      if (
        relativeX >= left &&
        relativeX <= left + frame.width &&
        relativeY >= top &&
        relativeY <= top + frame.height
      ) {
        return entry;
      }
    }
    return null;
  }

  private onOverlayWheel = (event: WheelEvent): void => {
    if (!this.overlayContainer || this.overlayElements.size === 0) {
      return;
    }
    const entry = this.findOverlayEntryAtPoint(event.clientX, event.clientY);
    if (!entry) {
      return;
    }
    const { wrapper } = entry;
    const canScrollY = wrapper.scrollHeight - wrapper.clientHeight > 1;
    const canScrollX = wrapper.scrollWidth - wrapper.clientWidth > 1;
    if (!canScrollY && !canScrollX) {
      return;
    }
    let consumed = false;
    if (canScrollY && event.deltaY !== 0) {
      const maxScrollTop = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
      const nextTop = Math.min(maxScrollTop, Math.max(0, wrapper.scrollTop + event.deltaY));
      if (nextTop !== wrapper.scrollTop) {
        wrapper.scrollTop = nextTop;
      }
      consumed = true;
    }
    if (canScrollX && event.deltaX !== 0) {
      const maxScrollLeft = Math.max(0, wrapper.scrollWidth - wrapper.clientWidth);
      const nextLeft = Math.min(maxScrollLeft, Math.max(0, wrapper.scrollLeft + event.deltaX));
      if (nextLeft !== wrapper.scrollLeft) {
        wrapper.scrollLeft = nextLeft;
      }
      consumed = true;
    }
    if (consumed) {
      this.updateOverlayScrollbar(entry);
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private positionOverlayResizeHandle(
    handle: HTMLButtonElement,
    position: { x: number; y: number },
    size: { width: number; height: number },
    rotationDeg: number
  ): void {
    const handleWidth = handle.offsetWidth || 18;
    const handleHeight = handle.offsetHeight || 18;
    const handleInset = 6;
    const offsetX = size.width / 2 - handleInset - handleWidth / 2;
    const offsetY = size.height / 2 - handleInset - handleHeight / 2;
    const rotated = this.rotateOffset(offsetX, offsetY, rotationDeg);
    handle.style.left = `${position.x + rotated.x - handleWidth / 2}px`;
    handle.style.top = `${position.y + rotated.y - handleHeight / 2}px`;
  }

  private positionOverlayRotateHandle(
    handle: HTMLButtonElement,
    position: { x: number; y: number },
    height: number,
    rotationDeg: number
  ): void {
    const handleWidth = handle.offsetWidth || 18;
    const handleHeight = handle.offsetHeight || 18;
    const handleOffset = 10;
    const offsetY = -height / 2 - handleHeight / 2 - handleOffset;
    const rotated = this.rotateOffset(0, offsetY, rotationDeg);
    handle.style.left = `${position.x + rotated.x - handleWidth / 2}px`;
    handle.style.top = `${position.y + rotated.y - handleHeight / 2}px`;
  }

  private positionOverlayById(id: string): void {
    const entry = this.overlayElements.get(id);
    const node = this.annotationNodes.get(id);
    const annotation = this.annotations.get(id);
    if (entry && node && annotation) {
      this.positionAnnotationOverlay(node, entry, annotation);
    }
  }

  private positionAllOverlays(): void {
    this.overlayElements.forEach((_entry, id) => {
      this.positionOverlayById(id);
    });
  }

  private setOverlayHoverState(id: string, isHover: boolean): void {
    const entry = this.overlayElements.get(id);
    if (!entry) {
      return;
    }
    if (this.isLabLocked()) {
      this.updateOverlayHandleInteractivity(entry);
      entry.wrapper.classList.remove(OVERLAY_HOVER_CLASS);
      entry.resizeHandle.classList.remove(HANDLE_VISIBLE_CLASS);
      entry.rotateHandle.classList.remove(ROTATE_HANDLE_VISIBLE_CLASS);
      this.overlayHoverLocks.delete(id);
      const pending = this.overlayHoverHideTimers.get(id);
      if (pending) {
        window.clearTimeout(pending);
        this.overlayHoverHideTimers.delete(id);
      }
      return;
    }
    if (isHover || this.overlayHoverLocks.has(id)) {
      const pending = this.overlayHoverHideTimers.get(id);
      if (pending) {
        window.clearTimeout(pending);
        this.overlayHoverHideTimers.delete(id);
      }
      entry.wrapper.classList.add(OVERLAY_HOVER_CLASS);
      entry.resizeHandle.classList.add(HANDLE_VISIBLE_CLASS);
      entry.rotateHandle.classList.add(ROTATE_HANDLE_VISIBLE_CLASS);
      return;
    }

    if (this.overlayHoverHideTimers.has(id)) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      this.overlayHoverHideTimers.delete(id);
      if (this.overlayHoverLocks.has(id)) {
        return;
      }
      entry.wrapper.classList.remove(OVERLAY_HOVER_CLASS);
      entry.resizeHandle.classList.remove(HANDLE_VISIBLE_CLASS);
      entry.rotateHandle.classList.remove(ROTATE_HANDLE_VISIBLE_CLASS);
    }, 120);
    this.overlayHoverHideTimers.set(id, timeoutId);
  }

  private updateOverlayHandleInteractivity(entry?: OverlayEntry): void {
    const locked = this.isLabLocked();
    const apply = (target: OverlayEntry): void => {
      target.resizeHandle.style.pointerEvents = locked ? 'none' : '';
      target.rotateHandle.style.pointerEvents = locked ? 'none' : '';
      target.resizeHandle.style.cursor = locked ? 'default' : '';
      target.rotateHandle.style.cursor = locked ? 'default' : '';
    };
    if (entry) {
      apply(entry);
      return;
    }
    this.overlayElements.forEach(current => apply(current));
  }

  private canInitiateOverlayHandleAction(event: PointerEvent): boolean {
    if (event.button !== 0) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof window === 'undefined') {
      return false;
    }
    if (this.isLabLocked()) {
      (window as any).showLabLockedMessage?.();
      return false;
    }
    return true;
  }

  private resolveResizeTargets(annotationId: string): { annotation: FreeTextAnnotation; entry: OverlayEntry } | null {
    const annotation = this.annotations.get(annotationId);
    const entry = this.overlayElements.get(annotationId);
    if (!annotation || !entry) {
      return null;
    }
    return { annotation, entry };
  }

  private resolveRotateTargets(annotationId: string): {
    annotation: FreeTextAnnotation;
    entry: OverlayEntry;
    node: cytoscape.NodeSingular | undefined;
  } | null {
    const annotation = this.annotations.get(annotationId);
    const entry = this.overlayElements.get(annotationId);
    if (!annotation || !entry) {
      return null;
    }
    return { annotation, entry, node: this.annotationNodes.get(annotationId) };
  }

  private calculateOverlayStartWidth(annotation: FreeTextAnnotation, entry: OverlayEntry): number {
    const datasetWidth = Number(entry.wrapper.dataset.baseMaxWidth ?? DEFAULT_FREE_TEXT_WIDTH);
    const measuredWidth = entry.size?.width ?? entry.wrapper.offsetWidth;
    const numericAnnotationWidth = typeof annotation.width === 'number' && Number.isFinite(annotation.width)
      ? annotation.width as number
      : undefined;
    const fallbackWidth = Math.round(datasetWidth || measuredWidth || DEFAULT_FREE_TEXT_WIDTH);
    return Math.max(MIN_FREE_TEXT_WIDTH, numericAnnotationWidth ?? fallbackWidth);
  }

  private calculateOverlayStartHeight(annotation: FreeTextAnnotation, entry: OverlayEntry): number {
    const datasetHeight = entry.wrapper.dataset.baseMaxHeight;
    const measuredHeight = entry.size?.height ?? entry.wrapper.offsetHeight;
    const numericAnnotationHeight = typeof annotation.height === 'number' && Number.isFinite(annotation.height)
      ? annotation.height as number
      : undefined;
    const fallbackHeightSource = datasetHeight && datasetHeight !== 'auto'
      ? Number(datasetHeight)
      : measuredHeight || DEFAULT_FREE_TEXT_WIDTH;
    const fallbackHeight = Math.max(MIN_FREE_TEXT_HEIGHT, Math.round(fallbackHeightSource));
    return numericAnnotationHeight ?? fallbackHeight;
  }

  private startOverlayResize(annotationId: string, event: PointerEvent): void {
    if (!this.canInitiateOverlayHandleAction(event)) {
      return;
    }
    const targets = this.resolveResizeTargets(annotationId);
    if (!targets) {
      return;
    }
    const { annotation, entry } = targets;
    const startWidth = this.calculateOverlayStartWidth(annotation, entry);
    const startHeight = this.calculateOverlayStartHeight(annotation, entry);

    this.overlayResizeState = {
      annotationId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth,
      startHeight
    };
    this.activeResizeHandle = entry.resizeHandle;
    if (typeof entry.resizeHandle.setPointerCapture === 'function') {
      entry.resizeHandle.setPointerCapture(event.pointerId);
    }

    window.addEventListener('pointermove', this.onOverlayResizeMove);
    window.addEventListener('pointerup', this.onOverlayResizeEnd);
    window.addEventListener('pointercancel', this.onOverlayResizeEnd);
    this.overlayHoverLocks.add(annotationId);
    this.setOverlayHoverState(annotationId, true);
  }

  private startOverlayRotate(annotationId: string, event: PointerEvent): void {
    if (!this.canInitiateOverlayHandleAction(event)) {
      return;
    }
    const targets = this.resolveRotateTargets(annotationId);
    if (!targets) {
      return;
    }
    const { annotation, entry, node } = targets;
    if (node && !entry.frame) {
      this.positionAnnotationOverlay(node, entry, annotation);
    }
    const frame = entry.frame;
    const pointer = this.getRelativePointerPosition(event);
    const centerX = frame?.centerX ?? pointer.x;
    const centerY = frame?.centerY ?? pointer.y;
    const startPointerAngle = Math.atan2(pointer.y - centerY, pointer.x - centerX);
    const startRotation = this.normalizeRotation(annotation.rotation);

    this.overlayRotateState = {
      annotationId,
      pointerId: event.pointerId,
      startPointerAngle,
      startRotation,
      centerX,
      centerY
    };
    this.activeRotateHandle = entry.rotateHandle;
    if (typeof entry.rotateHandle.setPointerCapture === 'function') {
      entry.rotateHandle.setPointerCapture(event.pointerId);
    }

    window.addEventListener('pointermove', this.onOverlayRotateMove);
    window.addEventListener('pointerup', this.onOverlayRotateEnd);
    window.addEventListener('pointercancel', this.onOverlayRotateEnd);
    this.overlayHoverLocks.add(annotationId);
    this.setOverlayHoverState(annotationId, true);
  }

  private disposeOverlayEntry(entry: OverlayEntry): void {
    if (entry.resizeObserver) {
      entry.resizeObserver.disconnect();
      entry.resizeObserver = null;
    }
    entry.wrapper.remove();
    entry.resizeHandle.remove();
    entry.rotateHandle.remove();
    entry.size = undefined;
  }

  private removeAnnotationOverlay(id: string): void {
    const entry = this.overlayElements.get(id);
    if (entry) {
      this.disposeOverlayEntry(entry);
      this.overlayElements.delete(id);
      this.overlayHoverLocks.delete(id);
      if (this.overlayResizeState?.annotationId === id) {
        this.overlayResizeState = null;
        this.activeResizeHandle = null;
      }
      if (this.overlayRotateState?.annotationId === id) {
        this.overlayRotateState = null;
        this.activeRotateHandle = null;
      }
      const pending = this.overlayHoverHideTimers.get(id);
      if (pending) {
        window.clearTimeout(pending);
        this.overlayHoverHideTimers.delete(id);
      }
    }
  }

  private clearAnnotationOverlays(): void {
    this.overlayElements.forEach(entry => {
      this.disposeOverlayEntry(entry);
    });
    this.overlayElements.clear();
    this.overlayResizeState = null;
    this.overlayRotateState = null;
    this.activeResizeHandle = null;
    this.activeRotateHandle = null;
    this.overlayHoverLocks.clear();
    this.overlayHoverHideTimers.forEach(timer => window.clearTimeout(timer));
    this.overlayHoverHideTimers.clear();
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
    const rotationValue = this.normalizeRotation(Number.parseFloat(rotationInput.value));
    return {
      ...annotation,
      text,
      fontSize: this.normalizeFontSize(Number.parseInt(fontSizeInput.value, 10)),
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

    // Close button just closes without saving
    this.bindHandler(closeBtn, 'onclick', handleClose, cleanupTasks);

    // Apply saves but keeps panel open
    this.bindHandler(applyBtn, 'onclick', () => {
      const result = this.buildAnnotationResult(annotation, els, state);
      resolve(result);
    }, cleanupTasks);

    // OK saves and closes
    this.bindHandler(okBtn, 'onclick', () => {
      const result = this.buildAnnotationResult(annotation, els, state);
      cleanup();
      resolve(result);
    }, cleanupTasks);

    this.bindHandler(textInput, 'onkeydown', (e: KeyboardEvent) => {
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

  /**
   * Add a free text annotation to the graph
   */
  public addFreeTextAnnotation(annotation: FreeTextAnnotation, options?: { skipSave?: boolean }): void {
    const rotation = this.normalizeRotation(annotation.rotation);
    annotation.rotation = rotation;
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

    if ((window as any).topologyLocked) {
      node.lock();
    }

    // Apply custom styles based on annotation properties with a slight delay to ensure node is rendered
    this.applyTextNodeStyles(node, annotation);
    // Apply styles again after a short delay to ensure they stick
    // Also restore position to bypass any grid snapping
    setTimeout(() => {
      this.applyTextNodeStyles(node, annotation);
      // Restore position from annotation data (bypass grid snap)
      node.position({
        x: annotation.position.x,
        y: annotation.position.y
      });
      this.positionOverlayById(annotation.id);
    }, 100);

    this.annotationNodes.set(annotation.id, node);
    if (!options?.skipSave) {
      this.debouncedSave();
    }
  }

  /**
   * Apply custom styles to a text node based on annotation properties
   */
  private applyTextNodeStyles(node: cytoscape.NodeSingular, annotation: FreeTextAnnotation): void {
    // Store the annotation data in the node for persistence
    const rotation = this.normalizeRotation(annotation.rotation);
    annotation.rotation = rotation;
    node.data('freeTextData', annotation);

    // Create a comprehensive style object with all necessary properties
    const styles: any = {};
    const textAlign = annotation.textAlign ?? 'left';
    const useOverlay = Boolean(this.overlayContainer);

    // Font size
    const fontSize = this.normalizeFontSize(annotation.fontSize);
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
    styles['text-halign'] = textAlign;
    styles['text-valign'] = 'center';
    styles['text-opacity'] = useOverlay ? 0 : 1;
    styles['text-events'] = useOverlay ? 'no' : 'yes';
    styles['text-wrap'] = useOverlay ? 'none' : 'wrap';
    styles['text-max-width'] = this.getNodeTextMaxWidth(annotation, useOverlay);
    styles['text-rotation'] = rotation;

    // Cytoscape doesn't support the CSS `font` shorthand property,
    // so we rely on the individual font-* properties above.

    Object.assign(styles, this.getOutlineStyles(annotation, useOverlay));
    Object.assign(styles, this.getBackgroundStyles(annotation, useOverlay));

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
    this.updateAnnotationOverlay(node, annotation);
  }

  private getOutlineStyles(annotation: FreeTextAnnotation, useOverlay: boolean): Record<string, number | string> {
    if (annotation.textDecoration === 'underline') {
      return {
        'text-outline-width': 2,
        'text-outline-color': annotation.fontColor || '#FFFFFF',
        'text-outline-opacity': useOverlay ? 0 : 0.5
      };
    }
    return {
      'text-outline-width': 1,
      'text-outline-color': '#000000',
      'text-outline-opacity': useOverlay ? 0 : 0.8
    };
  }

  private getBackgroundStyles(annotation: FreeTextAnnotation, useOverlay: boolean): Record<string, number | string> {
    const hasSolidBackground = annotation.backgroundColor !== 'transparent';
    if (useOverlay) {
      return {
        'text-background-opacity': 0,
        'background-opacity': 0,
        'background-color': 'transparent',
        shape: 'rectangle',
        'corner-radius': '0px'
      };
    }

    if (!hasSolidBackground) {
      return { 'text-background-opacity': 0 };
    }

    const backgroundColor = this.resolveBackgroundColor(annotation.backgroundColor, false);
    return {
      'text-background-color': backgroundColor,
      'text-background-opacity': 0.9,
      'text-background-shape': annotation.roundedBackground === false ? 'rectangle' : 'roundrectangle',
      'text-background-padding': 3
    };
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
      this.positionOverlayById(id);
      this.debouncedSave();
    }
  }

  /**
   * Sync all free text annotation positions with their current Cytoscape node positions.
   * Call this before saving to ensure coordinates persist correctly.
   */
  public syncAnnotationPositions(): void {
    this.annotationNodes.forEach((node, id) => {
      const annotation = this.annotations.get(id);
      if (annotation && node && node.inside()) {
        const pos = node.position();
        annotation.position = {
          x: Math.round(pos.x),
          y: Math.round(pos.y)
        };
      }
    });
  }

  /**
   * Restore all free text node positions from their annotation data.
   * Call this after loading to ensure nodes match saved positions (bypassing any grid snap).
   */
  public restoreAnnotationPositions(): void {
    this.annotations.forEach((annotation, id) => {
      const node = this.annotationNodes.get(id);
      if (node && node.inside()) {
        node.position({
          x: annotation.position.x,
          y: annotation.position.y
        });
        this.positionOverlayById(id);
      }
    });
  }

  /**
   * Schedule multiple position restores after loading to ensure free text positions
   * persist despite any grid snapping or layout operations.
   */
  private schedulePositionRestores(): void {
    // Restore positions after delays to ensure nodes are rendered and
    // bypass any grid snapping that may occur during initialization
    setTimeout(() => {
      this.reapplyStylesBound();
      this.restoreAnnotationPositions();
    }, 200);
    // Additional restores at longer delays to catch any late layout operations
    setTimeout(() => this.restoreAnnotationPositions(), 500);
    setTimeout(() => this.restoreAnnotationPositions(), 1000);
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
    this.removeAnnotationOverlay(id);
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
    (window as any).writeTopoDebugLog?.('freeText:loadAnnotations invoked');
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
    const now = Date.now();
    if (this.saveBurstStart === null) {
      this.saveBurstStart = now;
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    const elapsed = now - this.saveBurstStart;
    const delay = elapsed >= ManagerFreeText.SAVE_MAX_WAIT_MS ? 0 : ManagerFreeText.SAVE_DEBOUNCE_MS;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.saveBurstStart = null;
      this.saveAnnotations();
    }, delay);
  }

  /**
   * Allow external managers (e.g., group styles) to queue a combined annotations save without
   * duplicating persistence logic.
   */
  public queueSaveAnnotations(): void {
    this.debouncedSave();
  }

  /**
   * Save annotations to backend
   */
  public async saveAnnotations(): Promise<void> {
    if (this.saveInProgress) {
      this.pendingSaveWhileBusy = true;
      log.info('freeText:saveAnnotations:queued (busy)');
      return;
    }

    // Sync positions from Cytoscape nodes to annotation data before saving
    this.syncAnnotationPositions();

    const annotations = Array.from(this.annotations.values());
    const groupStyles = this.groupStyleManager ? this.groupStyleManager.getGroupStyles() : [];
    const stateKey = this.buildSaveStateKey(annotations, groupStyles);

    if (stateKey === this.lastSavedStateKey) {
      log.info(
        `freeText:saveAnnotations:skipped (unchanged, annotations=${annotations.length}, groupStyles=${groupStyles.length})`
      );
      return;
    }

    this.saveInProgress = true;
    log.info(
      `freeText:saveAnnotations:start (annotations=${annotations.length}, groupStyles=${groupStyles.length})`
    );
    try {
      await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-save-annotations',
        { annotations, groupStyles }
      );
      this.lastSavedStateKey = stateKey;
      log.info(
        `freeText:saveAnnotations:success (annotations=${annotations.length}, groupStyles=${groupStyles.length})`
      );
    } catch (error) {
      log.error(`Failed to save annotations: ${error}`);
    } finally {
      this.saveInProgress = false;
      if (this.pendingSaveWhileBusy) {
        this.pendingSaveWhileBusy = false;
        this.debouncedSave();
      }
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
    this.saveBurstStart = null;

    this.annotationNodes.forEach(node => {
      if (node && node.inside()) {
        node.remove();
      }
    });
    this.annotations.clear();
    this.annotationNodes.clear();
    this.clearAnnotationOverlays();
    this.lastSavedStateKey = null;
    if (save) {
      this.saveAnnotations();
    }
  }

  /**
   * Synchronize the cached "last saved" signature with the current annotation + group style state.
   * Useful when an external component (like the group style manager) finishes an async load.
   */
  public syncSavedStateBaseline(): void {
    const annotations = Array.from(this.annotations.values());
    const groupStyles = this.groupStyleManager ? this.groupStyleManager.getGroupStyles() : [];
    this.lastSavedStateKey = this.buildSaveStateKey(annotations, groupStyles);
    log.debug(
      `freeText:syncSavedStateBaseline (annotations=${annotations.length}, groupStyles=${groupStyles.length})`
    );
  }

  private buildSaveStateKey(
    annotations: FreeTextAnnotation[],
    groupStyles: GroupStyleAnnotation[]
  ): string {
    return JSON.stringify({
      annotations,
      groupStyles
    });
  }

}
