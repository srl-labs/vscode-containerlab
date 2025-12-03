/**
 * Manages HTML overlay rendering for free text annotations in the Cytoscape viewport.
 * Handles overlay creation, positioning, resizing, rotating, and hover states.
 */
import cytoscape from 'cytoscape';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import { full as markdownItEmoji } from 'markdown-it-emoji';
import hljs from 'highlight.js';
import { FreeTextAnnotation } from '../../../shared/types/topoViewerGraph';
import { log } from '../../platform/logging/logger';
import { VscodeMessageSender } from '../../platform/messaging/VscodeMessaging';
import {
  MIN_FREE_TEXT_WIDTH,
  MIN_FREE_TEXT_HEIGHT,
  MIN_FREE_TEXT_NODE_SIZE,
  DEFAULT_FREE_TEXT_WIDTH,
  DEFAULT_FREE_TEXT_PADDING,
  OVERLAY_HOVER_CLASS,
  HANDLE_VISIBLE_CLASS,
  ROTATE_HANDLE_VISIBLE_CLASS,
  escapeHtml,
  normalizeFontSize,
  normalizeRotation,
  degToRad,
  rotateOffset,
  resolveBackgroundColor,
  applyAlphaToColor
} from './freeTextUtils';

// Markdown renderer instance
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

export interface OverlayEntry {
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

/**
 * Callback interface for overlay manager to notify parent of changes
 */
export interface OverlayManagerCallbacks {
  // eslint-disable-next-line no-unused-vars
  getAnnotation: (id: string) => FreeTextAnnotation | undefined;
  // eslint-disable-next-line no-unused-vars
  getNode: (id: string) => cytoscape.NodeSingular | undefined;
  isLabLocked: () => boolean;
  // eslint-disable-next-line no-unused-vars
  onAnnotationResized: (id: string, width: number, height: number) => void;
  // eslint-disable-next-line no-unused-vars
  onAnnotationRotated: (id: string, rotation: number) => void;
  onSaveRequested: () => void;
}

/**
 * Manages HTML overlay rendering for free text annotations.
 */
export class FreeTextOverlayManager {
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender;
  private callbacks: OverlayManagerCallbacks;
  private overlayContainer: HTMLDivElement | null = null;
  private overlayElements: Map<string, OverlayEntry> = new Map();
  private overlayResizeState: OverlayResizeState | null = null;
  private overlayRotateState: OverlayRotateState | null = null;
  private activeResizeHandle: HTMLButtonElement | null = null;
  private activeRotateHandle: HTMLButtonElement | null = null;
  private overlayHoverLocks: Set<string> = new Set();
  private overlayHoverHideTimers: Map<string, number> = new Map();
  private overlayWheelTarget: HTMLElement | null = null;

  private onInteractiveAnchorPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  private onLockStateChanged = (): void => {
    this.updateOverlayHandleInteractivity();
    if (this.callbacks.isLabLocked()) {
      this.overlayElements.forEach((_entry, id) => this.setOverlayHoverState(id, false));
    }
  };

  private onOverlayResizeMove = (event: PointerEvent): void => {
    if (!this.overlayResizeState) {
      return;
    }
    const { annotationId, startX, startY, startWidth, startHeight } = this.overlayResizeState;
    const annotation = this.callbacks.getAnnotation(annotationId);
    const node = this.callbacks.getNode(annotationId);
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
    if (widthChanged || heightChanged) {
      this.callbacks.onAnnotationResized(annotationId, nextWidth, nextHeight);
      this.updateAnnotationOverlay(node, annotation);
    }
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
    this.callbacks.onSaveRequested();
  };

  private onOverlayRotateMove = (event: PointerEvent): void => {
    if (!this.overlayRotateState) {
      return;
    }
    const { annotationId, startPointerAngle, startRotation, centerX, centerY } = this.overlayRotateState;
    const pointer = this.getRelativePointerPosition(event);
    const annotation = this.callbacks.getAnnotation(annotationId);
    const node = this.callbacks.getNode(annotationId);
    if (!annotation || !node) {
      return;
    }
    const pointerAngle = Math.atan2(pointer.y - centerY, pointer.x - centerX);
    const deltaAngleDeg = (pointerAngle - startPointerAngle) * (180 / Math.PI);
    const nextRotation = normalizeRotation(startRotation + deltaAngleDeg);
    if (annotation.rotation === nextRotation) {
      this.positionOverlayById(annotationId);
      return;
    }
    this.callbacks.onAnnotationRotated(annotationId, nextRotation);
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
    this.callbacks.onSaveRequested();
  };

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

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender, callbacks: OverlayManagerCallbacks) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.callbacks = callbacks;
    this.initializeOverlayLayer();
    this.registerLockStateListener();
  }

  public hasOverlayContainer(): boolean {
    return Boolean(this.overlayContainer);
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

  private normalizeOverlayDimension(value: number | undefined, fallback: number): number {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.max(MIN_FREE_TEXT_NODE_SIZE, Math.round(numeric));
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

  public getOrCreateOverlayEntry(annotation: FreeTextAnnotation): OverlayEntry | null {
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
    const baseFontSize = normalizeFontSize(annotation.fontSize);
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

  public updateAnnotationOverlay(node: cytoscape.NodeSingular, annotation: FreeTextAnnotation): void {
    const entry = this.getOrCreateOverlayEntry(annotation);
    if (!entry) {
      return;
    }

    const { wrapper, content } = entry;
    const rotation = normalizeRotation(annotation.rotation);
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
      ? applyAlphaToColor(resolveBackgroundColor(annotation.backgroundColor, false), 0.9)
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
    this.positionAnnotationOverlay(node, entry, annotation, rotation);
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

  private positionAnnotationOverlay(
    node: cytoscape.NodeSingular,
    entry: OverlayEntry,
    _annotation: FreeTextAnnotation,
    rotation: number
  ): void {
    const renderedPosition = node.renderedPosition();
    if (!renderedPosition) {
      return;
    }
    const { wrapper, resizeHandle, rotateHandle } = entry;
    const zoom = this.cy.zoom() || 1;
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
    const angle = degToRad(rotationDeg);
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

  private applyOverlayBoxSizing(wrapper: HTMLDivElement): { width: number; height: number } {
    wrapper.style.fontSize = `${Math.max(1, Number(wrapper.dataset.baseFontSize ?? '12'))}px`;

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
    const rotated = rotateOffset(offsetX, offsetY, rotationDeg);
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
    const rotated = rotateOffset(0, offsetY, rotationDeg);
    handle.style.left = `${position.x + rotated.x - handleWidth / 2}px`;
    handle.style.top = `${position.y + rotated.y - handleHeight / 2}px`;
  }

  public positionOverlayById(id: string): void {
    const entry = this.overlayElements.get(id);
    const node = this.callbacks.getNode(id);
    const annotation = this.callbacks.getAnnotation(id);
    if (entry && node && annotation) {
      const rotation = normalizeRotation(annotation.rotation);
      this.positionAnnotationOverlay(node, entry, annotation, rotation);
    }
  }

  public positionAllOverlays(): void {
    this.overlayElements.forEach((_entry, id) => {
      this.positionOverlayById(id);
    });
  }

  public setOverlayHoverState(id: string, isHover: boolean): void {
    const entry = this.overlayElements.get(id);
    if (!entry) {
      return;
    }
    if (this.callbacks.isLabLocked()) {
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
    const locked = this.callbacks.isLabLocked();
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
    if (this.callbacks.isLabLocked()) {
      (window as any).showLabLockedMessage?.();
      return false;
    }
    return true;
  }

  private resolveResizeTargets(annotationId: string): { annotation: FreeTextAnnotation; entry: OverlayEntry } | null {
    const annotation = this.callbacks.getAnnotation(annotationId);
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
    const annotation = this.callbacks.getAnnotation(annotationId);
    const entry = this.overlayElements.get(annotationId);
    if (!annotation || !entry) {
      return null;
    }
    return { annotation, entry, node: this.callbacks.getNode(annotationId) };
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
      const rotation = normalizeRotation(annotation.rotation);
      this.positionAnnotationOverlay(node, entry, annotation, rotation);
    }
    const frame = entry.frame;
    const pointer = this.getRelativePointerPosition(event);
    const centerX = frame?.centerX ?? pointer.x;
    const centerY = frame?.centerY ?? pointer.y;
    const startPointerAngle = Math.atan2(pointer.y - centerY, pointer.x - centerX);
    const startRotation = normalizeRotation(annotation.rotation);

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

  public removeAnnotationOverlay(id: string): void {
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

  public clearAnnotationOverlays(): void {
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
}
