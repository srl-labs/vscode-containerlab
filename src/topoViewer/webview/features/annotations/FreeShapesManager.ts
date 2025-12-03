import cytoscape from 'cytoscape';
import { VscodeMessageSender } from '../../platform/messaging/VscodeMessaging';
import { FreeShapeAnnotation } from '../../../shared/types/topoViewerGraph';
import { log } from '../../platform/logging/logger';
import {
  FreeShapesSvgRenderer,
  DEFAULT_SHAPE_WIDTH,
  DEFAULT_SHAPE_HEIGHT,
  DEFAULT_LINE_LENGTH,
  DEFAULT_FILL_COLOR,
  DEFAULT_FILL_OPACITY,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_STYLE,
  DEFAULT_ARROW_SIZE,
  DEFAULT_CORNER_RADIUS,
  MIN_SHAPE_SIZE,
  SVG_NAMESPACE
} from './FreeShapesSvgRenderer';
import { FreeShapesModal } from './FreeShapesModal';

const HANDLE_TRANSLATE = 'translate(-50%, -50%)';
const RESIZE_HANDLE_VISIBLE_CLASS = 'free-shape-overlay-resize-visible';
const ROTATE_HANDLE_VISIBLE_CLASS = 'free-shape-overlay-rotate-visible';

interface OverlayEntry {
  wrapper: HTMLDivElement;
  svg: SVGSVGElement;
  shape: SVGElement;
  resizeHandle?: HTMLButtonElement;
  rotateHandle?: HTMLButtonElement;
}

type ShapeType = 'rectangle' | 'circle' | 'line';

interface OverlayResizeState {
  annotationId: string;
  startWidth: number;
  startHeight: number;
  startClientX: number;
  startClientY: number;
  anchorX: number;
  anchorY: number;
  rotationRad: number;
  isLine: boolean;
  startDx?: number;
  startDy?: number;
}

interface OverlayRotateState {
  annotationId: string;
  startRotation: number;
  centerClientX: number;
  centerClientY: number;
  startAngle: number;
}

export class FreeShapesManager {
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender;
  private annotations: Map<string, FreeShapeAnnotation> = new Map();
  private annotationNodes: Map<string, cytoscape.NodeSingular> = new Map();
  private managedNodes: Set<string> = new Set();
  private overlayContainer: HTMLDivElement | null = null;
  private overlayElements: Map<string, OverlayEntry> = new Map();
  private idCounter = 0;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private static readonly SAVE_DEBOUNCE_MS = 300;

  private overlayResizeState: OverlayResizeState | null = null;
  private overlayRotateState: OverlayRotateState | null = null;
  private overlayHoverLocks: Set<string> = new Set();
  private overlayHoverHideTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private intendedPositions: Map<string, { x: number; y: number }> = new Map();
  private positionCorrectionInProgress: Set<string> = new Set();
  private loadInProgress = false;
  private loadTimeout: ReturnType<typeof setTimeout> | null = null;
  private onLoadTimeout: () => Promise<void>;

  private svgRenderer: FreeShapesSvgRenderer;
  private modal: FreeShapesModal;

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.svgRenderer = new FreeShapesSvgRenderer();
    this.modal = new FreeShapesModal();
    this.setupEventHandlers();
    this.initializeOverlayLayer();
    this.registerLockStateListener();

    this.onLoadTimeout = async () => {
      this.loadInProgress = true;
      try {
        const response = await this.messageSender.sendMessageToVscodeEndpointPost(
          'topo-editor-load-annotations',
          {}
        );

        if (response && response.freeShapeAnnotations) {
          this.annotations.clear();
          this.annotationNodes.forEach((node, id) => {
            if (node && node.inside() && this.managedNodes.has(id)) {
              node.remove();
            }
          });
          this.annotationNodes.clear();
          this.managedNodes.clear();
          Array.from(this.overlayElements.keys()).forEach((id) => this.removeShapeOverlay(id));

          const annotations = response.freeShapeAnnotations as FreeShapeAnnotation[];
          annotations.forEach(annotation => this.addFreeShapeAnnotation(annotation, { skipSave: true }));
          log.info(`Loaded ${annotations.length} shape annotations`);

          this.schedulePositionRestores();
        }
      } catch (error) {
        log.error(`Failed to load shape annotations: ${error}`);
      } finally {
        this.loadInProgress = false;
      }
    };
  }

  private setupEventHandlers(): void {
    const SELECTOR_FREE_SHAPE = 'node[topoViewerRole="freeShape"]';

    this.cy.on('dblclick', SELECTOR_FREE_SHAPE, (event) => {
      event.preventDefault();
      event.stopPropagation();
      if ((window as any).topologyLocked) {
        (window as any).showLabLockedMessage?.();
        return;
      }
      const node = event.target;
      this.editFreeShape(node.id());
    });

    this.cy.on('dbltap', SELECTOR_FREE_SHAPE, (event) => {
      event.preventDefault();
      event.stopPropagation();
      if ((window as any).topologyLocked) {
        (window as any).showLabLockedMessage?.();
        return;
      }
      const node = event.target;
      this.editFreeShape(node.id());
    });

    this.cy.on('remove', SELECTOR_FREE_SHAPE, (event) => {
      const node = event.target;
      const id = node.id();
      if (this.annotations.has(id)) {
        this.annotations.delete(id);
        this.annotationNodes.delete(id);
        this.managedNodes.delete(id);
        this.removeShapeOverlay(id);
        this.debouncedSave();
      }
    });

    this.cy.on('position', SELECTOR_FREE_SHAPE, (event) => this.handleShapePositionChange(event));

    this.cy.on('dragfree', SELECTOR_FREE_SHAPE, (event) => {
      const node = event.target;
      const nodeId = node.id();
      const intendedPos = this.intendedPositions.get(nodeId);
      if (intendedPos) {
        node.position(intendedPos);
        this.updateShapePosition(nodeId, intendedPos);
        this.intendedPositions.delete(nodeId);
      } else {
        this.updateShapePosition(nodeId, node.position());
      }
      this.debouncedSave();
    });

    this.cy.on('viewport', () => {
      this.overlayElements.forEach((_, id) => this.positionOverlayById(id));
    });

    this.cy.on('mouseover', SELECTOR_FREE_SHAPE, (event) => {
      const node = event.target;
      this.setOverlayHoverState(node.id(), true);
    });

    this.cy.on('mouseout', SELECTOR_FREE_SHAPE, (event) => {
      const node = event.target;
      this.setOverlayHoverState(node.id(), false);
    });
  }

  private initializeOverlayLayer(): void {
    const cyContainer = this.cy.container();
    if (!cyContainer) return;

    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'free-shapes-overlay-container';
    this.overlayContainer.style.position = 'absolute';
    this.overlayContainer.style.top = '0';
    this.overlayContainer.style.left = '0';
    this.overlayContainer.style.width = '100%';
    this.overlayContainer.style.height = '100%';
    this.overlayContainer.style.pointerEvents = 'none';
    this.overlayContainer.style.zIndex = '1';
    cyContainer.appendChild(this.overlayContainer);
  }

  private handleShapePositionChange(event: cytoscape.EventObject): void {
    const node = event.target;
    if (!node) return;
    this.positionOverlayById(node.id());

    const annotation = this.annotations.get(node.id());
    if (!annotation) return;

    if (node.grabbed()) {
      const pos = node.position();
      if (annotation.shapeType === 'line' && annotation.endPosition) {
        const prevCenter = this.svgRenderer.getLineCenter(annotation);
        const deltaX = Math.round(pos.x - prevCenter.x);
        const deltaY = Math.round(pos.y - prevCenter.y);
        annotation.endPosition = {
          x: annotation.endPosition.x + deltaX,
          y: annotation.endPosition.y + deltaY
        };
        annotation.position = {
          x: annotation.position.x + deltaX,
          y: annotation.position.y + deltaY
        };
        this.intendedPositions.set(node.id(), { x: pos.x, y: pos.y });
      } else {
        annotation.position = {
          x: Math.round(pos.x),
          y: Math.round(pos.y)
        };
        this.intendedPositions.set(node.id(), {
          x: Math.round(pos.x),
          y: Math.round(pos.y)
        });
      }
    } else {
      this.enforceAnnotationPosition(node, annotation);
    }
  }

  private enforceAnnotationPosition(node: cytoscape.NodeSingular, annotation: FreeShapeAnnotation): void {
    const nodeId = node.id();
    if (this.positionCorrectionInProgress.has(nodeId)) return;
    const pos = node.position();
    let annotationX: number;
    let annotationY: number;

    if (annotation.shapeType === 'line') {
      const center = this.svgRenderer.getLineCenter(annotation);
      annotationX = center.x;
      annotationY = center.y;
    } else {
      annotationX = annotation.position.x;
      annotationY = annotation.position.y;
    }

    if (Math.round(pos.x) !== annotationX || Math.round(pos.y) !== annotationY) {
      this.positionCorrectionInProgress.add(nodeId);
      node.position({ x: annotationX, y: annotationY });
      this.positionCorrectionInProgress.delete(nodeId);
    }
  }

  private updateShapePosition(nodeId: string, position: { x: number; y: number }): void {
    const annotation = this.annotations.get(nodeId);
    if (!annotation) return;

    if (annotation.shapeType === 'line') {
      const center = this.svgRenderer.getLineCenter(annotation);
      const deltaX = Math.round(position.x - center.x);
      const deltaY = Math.round(position.y - center.y);
      if (annotation.endPosition) {
        annotation.endPosition = {
          x: annotation.endPosition.x + deltaX,
          y: annotation.endPosition.y + deltaY
        };
      }
      annotation.position = {
        x: annotation.position.x + deltaX,
        y: annotation.position.y + deltaY
      };
    } else {
      annotation.position = {
        x: Math.round(position.x),
        y: Math.round(position.y)
      };
    }

    this.positionOverlayById(nodeId);
  }

  private registerLockStateListener(): void {
    window.addEventListener('topology-lock-change', () => {
      this.updateOverlayHandleInteractivity();
    });
  }

  public enableAddShapeMode(shapeType: ShapeType): void {
    const container = this.cy.container();
    if (container) {
      container.style.cursor = 'crosshair';
    }

    const handler = (event: cytoscape.EventObject) => {
      const target = event.target;

      if (target !== this.cy) {
        if (target.isParent?.() || target.data?.('topoViewerRole') === 'group') {
          this.disableAddShapeMode();
          log.debug('Shape addition cancelled - cannot add shape to groups');
          return;
        }
      }

      if (event.target === this.cy) {
        const position = event.position || (event as any).cyPosition;
        if (position) {
          this.addFreeShapeAtPosition(position, shapeType);
        }
        this.disableAddShapeMode();
      }
    };

    this.cy.one('tap', handler);
  }

  public disableAddShapeMode(): void {
    const container = this.cy.container();
    if (container) {
      container.style.cursor = '';
    }
  }

  private async addFreeShapeAtPosition(position: cytoscape.Position, shapeType: ShapeType): Promise<void> {
    const id = `freeShape_${Date.now()}_${++this.idCounter}`;
    const defaultAnnotation = this.buildDefaultAnnotation(id, position, shapeType);

    const result = await this.modal.promptForShape('Add Shape', defaultAnnotation);
    if (!result) return;

    this.addFreeShapeAnnotation(result);
  }

  private buildDefaultAnnotation(id: string, position: cytoscape.Position, shapeType: ShapeType): FreeShapeAnnotation {
    const lastAnnotation = Array.from(this.annotations.values()).slice(-1)[0];
    const baseAnnotation: FreeShapeAnnotation = {
      id,
      shapeType,
      position: {
        x: Math.round(position.x),
        y: Math.round(position.y)
      },
      fillColor: lastAnnotation?.fillColor ?? DEFAULT_FILL_COLOR,
      fillOpacity: lastAnnotation?.fillOpacity ?? DEFAULT_FILL_OPACITY,
      borderColor: lastAnnotation?.borderColor ?? DEFAULT_BORDER_COLOR,
      borderWidth: lastAnnotation?.borderWidth ?? DEFAULT_BORDER_WIDTH,
      borderStyle: lastAnnotation?.borderStyle ?? DEFAULT_BORDER_STYLE,
      rotation: 0
    };

    if (shapeType === 'line') {
      const halfLength = DEFAULT_LINE_LENGTH / 2;
      baseAnnotation.position = {
        x: Math.round(position.x - halfLength),
        y: Math.round(position.y)
      };
      baseAnnotation.endPosition = {
        x: Math.round(position.x + halfLength),
        y: Math.round(position.y)
      };
      baseAnnotation.lineStartArrow = false;
      baseAnnotation.lineEndArrow = true;
      baseAnnotation.lineArrowSize = DEFAULT_ARROW_SIZE;
    } else {
      baseAnnotation.width = DEFAULT_SHAPE_WIDTH;
      baseAnnotation.height = DEFAULT_SHAPE_HEIGHT;
      if (shapeType === 'rectangle') {
        baseAnnotation.cornerRadius = DEFAULT_CORNER_RADIUS;
      }
    }

    return baseAnnotation;
  }

  public addFreeShapeAnnotation(annotation: FreeShapeAnnotation, options: { skipSave?: boolean } = {}): void {
    this.annotations.set(annotation.id, annotation);

    const initialPosition = annotation.shapeType === 'line'
      ? this.svgRenderer.getLineCenter(annotation)
      : { x: annotation.position.x, y: annotation.position.y };

    const existing = this.cy.getElementById(annotation.id);
    let node: cytoscape.NodeSingular;
    if (existing && existing.length > 0) {
      node = existing[0] as cytoscape.NodeSingular;
      node.data({
        ...node.data(),
        topoViewerRole: 'freeShape',
        freeShapeData: annotation
      });
      node.position(initialPosition);
      node.selectify();
      node.grabify();
      if ((window as any).topologyLocked) {
        node.lock();
      } else {
        node.unlock();
      }
      this.managedNodes.delete(annotation.id);
    } else {
      node = this.cy.add({
        group: 'nodes',
        data: {
          id: annotation.id,
          topoViewerRole: 'freeShape',
          freeShapeData: annotation
        },
        position: initialPosition,
        selectable: true,
        grabbable: true,
        locked: false
      })[0] as cytoscape.NodeSingular;
      this.managedNodes.add(annotation.id);
    }

    if ((window as any).topologyLocked) {
      node.lock();
    }

    this.annotationNodes.set(annotation.id, node);
    node.position(initialPosition);
    this.applyShapeNodeStyles(node, annotation);
    this.removeShapeOverlay(annotation.id);
    this.createShapeOverlay(node, annotation);

    setTimeout(() => {
      node.position(initialPosition);
      this.positionOverlayById(annotation.id);
    }, 100);

    if (!options.skipSave) {
      this.debouncedSave();
    }
  }

  private applyShapeNodeStyles(node: cytoscape.NodeSingular, annotation: FreeShapeAnnotation): void {
    const width = annotation.shapeType === 'line'
      ? Math.abs((annotation.endPosition?.x ?? 0) - annotation.position.x)
      : (annotation.width ?? DEFAULT_SHAPE_WIDTH);
    const height = annotation.shapeType === 'line'
      ? Math.abs((annotation.endPosition?.y ?? 0) - annotation.position.y)
      : (annotation.height ?? DEFAULT_SHAPE_HEIGHT);

    node.style({
      'width': Math.max(MIN_SHAPE_SIZE, width),
      'height': Math.max(MIN_SHAPE_SIZE, height),
      'background-color': 'transparent',
      'background-opacity': 0,
      'border-width': 0,
      'shape': 'rectangle',
      'label': '',
      'z-index': 0
    });
  }

  private createShapeOverlay(_node: cytoscape.NodeSingular, annotation: FreeShapeAnnotation): void {
    if (!this.overlayContainer) return;

    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.transformOrigin = 'center center';

    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    svg.style.overflow = 'visible';
    svg.style.position = 'absolute';
    svg.style.transformOrigin = 'center center';

    const shape = this.svgRenderer.createShapeElement(annotation);

    svg.appendChild(shape);
    wrapper.appendChild(svg);
    this.overlayContainer.appendChild(wrapper);

    const resizeHandle = this.createOverlayHandle(
      annotation.id,
      'free-shape-overlay-resize',
      'Resize shape',
      (event) => this.startOverlayResize(annotation.id, event),
      () => this.overlayResizeState?.annotationId === annotation.id
    );
    this.overlayContainer.appendChild(resizeHandle);

    let rotateHandle: HTMLButtonElement | undefined;
    if (annotation.shapeType !== 'line') {
      rotateHandle = this.createOverlayHandle(
        annotation.id,
        'free-shape-overlay-rotate',
        'Rotate shape',
        (event) => this.startOverlayRotate(annotation.id, event),
        () => this.overlayRotateState?.annotationId === annotation.id
      );
      this.overlayContainer.appendChild(rotateHandle);
    }

    this.overlayElements.set(annotation.id, { wrapper, svg, shape, resizeHandle, rotateHandle });
    this.positionOverlayById(annotation.id);
  }

  private positionOverlayById(id: string): void {
    const node = this.annotationNodes.get(id);
    const annotation = this.annotations.get(id);
    const overlay = this.overlayElements.get(id);

    if (!node || !annotation || !overlay || !node.inside()) return;

    const pos = node.renderedPosition();
    const zoom = this.cy.zoom();

    this.positionOverlayShape(overlay, annotation, pos, zoom);
    this.positionOverlayHandles(overlay, annotation, pos, zoom);
  }

  private positionOverlayShape(
    overlay: OverlayEntry,
    annotation: FreeShapeAnnotation,
    pos: { x: number; y: number },
    zoom: number
  ): void {
    const rotation = annotation.rotation ?? 0;

    if (annotation.shapeType === 'line') {
      const geometry = this.svgRenderer.computeLineGeometry(annotation);
      const centerX = pos.x;
      const centerY = pos.y;
      const width = geometry.width * zoom;
      const height = geometry.height * zoom;

      overlay.wrapper.style.width = `${width}px`;
      overlay.wrapper.style.height = `${height}px`;
      overlay.wrapper.style.left = `${centerX}px`;
      overlay.wrapper.style.top = `${centerY}px`;
      overlay.wrapper.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
      overlay.svg.setAttribute('width', String(width));
      overlay.svg.setAttribute('height', String(height));
      overlay.svg.setAttribute('viewBox', `0 0 ${geometry.width} ${geometry.height}`);
      overlay.svg.style.transform = '';
    } else {
      const baseWidth = annotation.width ?? DEFAULT_SHAPE_WIDTH;
      const baseHeight = annotation.height ?? DEFAULT_SHAPE_HEIGHT;
      const width = baseWidth * zoom;
      const height = baseHeight * zoom;

      overlay.wrapper.style.left = `${pos.x - width / 2}px`;
      overlay.wrapper.style.top = `${pos.y - height / 2}px`;
      overlay.wrapper.style.transform = '';
      overlay.svg.setAttribute('width', String(width));
      overlay.svg.setAttribute('height', String(height));
      overlay.svg.setAttribute('viewBox', `0 0 ${baseWidth} ${baseHeight}`);
      overlay.svg.style.transform = `rotate(${rotation}deg)`;
    }
  }

  private positionOverlayHandles(
    overlay: OverlayEntry,
    annotation: FreeShapeAnnotation,
    pos: { x: number; y: number },
    zoom: number
  ): void {
    if (annotation.shapeType === 'line') {
      const geometry = this.svgRenderer.computeLineGeometry(annotation);
      const rotation = annotation.rotation ?? 0;
      const rad = (rotation * Math.PI) / 180;
      const centerX = pos.x;
      const centerY = pos.y;

      if (overlay.resizeHandle) {
        const endOffsetX = geometry.dx / 2;
        const endOffsetY = geometry.dy / 2;
        const rotatedEndX = (endOffsetX * Math.cos(rad) - endOffsetY * Math.sin(rad)) * zoom;
        const rotatedEndY = (endOffsetX * Math.sin(rad) + endOffsetY * Math.cos(rad)) * zoom;
        overlay.resizeHandle.style.left = `${centerX + rotatedEndX}px`;
        overlay.resizeHandle.style.top = `${centerY + rotatedEndY}px`;
        overlay.resizeHandle.style.transform = HANDLE_TRANSLATE;
      }
      return;
    }

    const size = {
      width: annotation.width ?? DEFAULT_SHAPE_WIDTH,
      height: annotation.height ?? DEFAULT_SHAPE_HEIGHT
    };
    const rotation = annotation.rotation ?? 0;

    if (overlay.resizeHandle) {
      this.positionOverlayResizeHandle(overlay.resizeHandle, pos, size, rotation, zoom);
    }
    if (overlay.rotateHandle) {
      this.positionOverlayRotateHandle(overlay.rotateHandle, pos, size.height, rotation, zoom);
    }
  }

  private createOverlayHandle(
    annotationId: string,
    className: string,
    ariaLabel: string,
    // eslint-disable-next-line no-unused-vars
    onPointerDown: (event: PointerEvent) => void,
    isActiveCheck: () => boolean
  ): HTMLButtonElement {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = className;
    handle.setAttribute('aria-label', ariaLabel);
    handle.style.pointerEvents = 'auto';
    handle.style.touchAction = 'none';
    handle.onpointerdown = (event: PointerEvent) => {
      if (event.button !== 0) {
        this.forwardContextMenuEvent(annotationId, event);
        return;
      }
      onPointerDown(event);
    };
    handle.onpointerenter = () => {
      this.overlayHoverLocks.add(annotationId);
      this.setOverlayHoverState(annotationId, true);
    };
    handle.onpointerleave = () => {
      if (!isActiveCheck()) {
        this.overlayHoverLocks.delete(annotationId);
        this.setOverlayHoverState(annotationId, false);
      }
    };
    return handle;
  }

  private forwardContextMenuEvent(annotationId: string, event: PointerEvent): void {
    const node = this.annotationNodes.get(annotationId);
    if (!node) return;

    const cxtEvent = {
      target: node,
      originalEvent: event
    } as unknown as cytoscape.EventObject;

    node.emit('cxttapstart', [cxtEvent]);
    node.emit('cxttap', [cxtEvent]);
  }

  private positionOverlayResizeHandle(
    handle: HTMLButtonElement,
    centerPos: { x: number; y: number },
    size: { width: number; height: number },
    rotation: number,
    zoom: number
  ): void {
    const halfW = (size.width * zoom) / 2;
    const halfH = (size.height * zoom) / 2;
    const rad = (rotation * Math.PI) / 180;

    const localX = halfW;
    const localY = halfH;
    const rotatedX = localX * Math.cos(rad) - localY * Math.sin(rad);
    const rotatedY = localX * Math.sin(rad) + localY * Math.cos(rad);

    handle.style.left = `${centerPos.x + rotatedX}px`;
    handle.style.top = `${centerPos.y + rotatedY}px`;
    handle.style.transform = HANDLE_TRANSLATE;
  }

  private positionOverlayRotateHandle(
    handle: HTMLButtonElement,
    centerPos: { x: number; y: number },
    height: number,
    rotation: number,
    zoom: number
  ): void {
    const offsetDistance = 20;
    const halfH = (height * zoom) / 2;
    const rad = (rotation * Math.PI) / 180;

    const localX = 0;
    const localY = -(halfH + offsetDistance);
    const rotatedX = localX * Math.cos(rad) - localY * Math.sin(rad);
    const rotatedY = localX * Math.sin(rad) + localY * Math.cos(rad);

    handle.style.left = `${centerPos.x + rotatedX}px`;
    handle.style.top = `${centerPos.y + rotatedY}px`;
    handle.style.transform = HANDLE_TRANSLATE;
  }

  private startOverlayResize(annotationId: string, event: PointerEvent): void {
    if (!this.canInitiateOverlayHandleAction(event)) return;
    const annotation = this.annotations.get(annotationId);
    const overlay = this.overlayElements.get(annotationId);
    if (!annotation || !overlay || !overlay.resizeHandle) return;

    const isLine = annotation.shapeType === 'line';
    const startWidth = annotation.width ?? DEFAULT_SHAPE_WIDTH;
    const startHeight = annotation.height ?? DEFAULT_SHAPE_HEIGHT;
    const rotationRad = ((annotation.rotation ?? 0) * Math.PI) / 180;
    if (isLine) {
      const geometry = this.svgRenderer.computeLineGeometry(annotation);
      this.overlayResizeState = {
        annotationId,
        startWidth,
        startHeight,
        startClientX: event.clientX,
        startClientY: event.clientY,
        anchorX: annotation.position.x,
        anchorY: annotation.position.y,
        rotationRad,
        isLine: true,
        startDx: geometry.dx,
        startDy: geometry.dy
      };
    } else {
      const rotatedTopLeftX = (-startWidth / 2) * Math.cos(rotationRad) - (-startHeight / 2) * Math.sin(rotationRad);
      const rotatedTopLeftY = (-startWidth / 2) * Math.sin(rotationRad) + (-startHeight / 2) * Math.cos(rotationRad);
      const anchorX = annotation.position.x + rotatedTopLeftX;
      const anchorY = annotation.position.y + rotatedTopLeftY;

      this.overlayResizeState = {
        annotationId,
        startWidth,
        startHeight,
        startClientX: event.clientX,
        startClientY: event.clientY,
        anchorX,
        anchorY,
        rotationRad,
        isLine: false
      };
    }

    overlay.resizeHandle.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', this.onOverlayResizeMove);
    window.addEventListener('pointerup', this.onOverlayResizeEnd);
    this.overlayHoverLocks.add(annotationId);
    this.setOverlayHoverState(annotationId, true);
  }

  private onOverlayResizeMove = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!this.overlayResizeState) return;

    const annotation = this.annotations.get(this.overlayResizeState.annotationId);
    if (!annotation) return;

    const { rotationRad, anchorX, anchorY, isLine, startDx = 0, startDy = 0 } = this.overlayResizeState;
    const zoom = this.cy.zoom();

    const dx = event.clientX - this.overlayResizeState.startClientX;
    const dy = event.clientY - this.overlayResizeState.startClientY;

    const rotatedDx = dx * Math.cos(-rotationRad) - dy * Math.sin(-rotationRad);
    const rotatedDy = dx * Math.sin(-rotationRad) + dy * Math.cos(-rotationRad);

    if (isLine) {
      let newDx = startDx + rotatedDx / zoom;
      let newDy = startDy + rotatedDy / zoom;
      const length = Math.hypot(newDx, newDy);
      const minLength = MIN_SHAPE_SIZE;
      if (length > 0 && length < minLength) {
        const scale = minLength / length;
        newDx *= scale;
        newDy *= scale;
      }

      annotation.endPosition = {
        x: Math.round(annotation.position.x + newDx),
        y: Math.round(annotation.position.y + newDy)
      };

      this.updateFreeShapeNode(this.overlayResizeState.annotationId, annotation);
      return;
    }

    const newWidth = Math.max(MIN_SHAPE_SIZE, this.overlayResizeState.startWidth + rotatedDx / zoom);
    const newHeight = Math.max(MIN_SHAPE_SIZE, this.overlayResizeState.startHeight + rotatedDy / zoom);

    annotation.width = Math.round(newWidth);
    annotation.height = Math.round(newHeight);
    if (!isLine) {
      const rotatedTopLeftX = (-newWidth / 2) * Math.cos(rotationRad) - (-newHeight / 2) * Math.sin(rotationRad);
      const rotatedTopLeftY = (-newWidth / 2) * Math.sin(rotationRad) + (-newHeight / 2) * Math.cos(rotationRad);
      const newCenterX = anchorX - rotatedTopLeftX;
      const newCenterY = anchorY - rotatedTopLeftY;
      annotation.position = {
        x: Math.round(newCenterX),
        y: Math.round(newCenterY)
      };
    }

    this.updateFreeShapeNode(this.overlayResizeState.annotationId, annotation);
  };

  private onOverlayResizeEnd = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!this.overlayResizeState) return;

    const annotationId = this.overlayResizeState.annotationId;

    window.removeEventListener('pointermove', this.onOverlayResizeMove);
    window.removeEventListener('pointerup', this.onOverlayResizeEnd);

    this.debouncedSave();
    this.overlayResizeState = null;
    this.overlayHoverLocks.delete(annotationId);
    this.setOverlayHoverState(annotationId, false);
  };

  private startOverlayRotate(annotationId: string, event: PointerEvent): void {
    if (!this.canInitiateOverlayHandleAction(event)) return;
    const annotation = this.annotations.get(annotationId);
    const node = this.annotationNodes.get(annotationId);
    const overlay = this.overlayElements.get(annotationId);
    if (!annotation || !node || !overlay || !overlay.rotateHandle) return;

    const pos = node.renderedPosition();
    const centerX = pos.x;
    const centerY = pos.y;

    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);

    this.overlayRotateState = {
      annotationId,
      startRotation: annotation.rotation ?? 0,
      centerClientX: centerX,
      centerClientY: centerY,
      startAngle
    };

    overlay.rotateHandle.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', this.onOverlayRotateMove);
    window.addEventListener('pointerup', this.onOverlayRotateEnd);
    this.overlayHoverLocks.add(annotationId);
    this.setOverlayHoverState(annotationId, true);
  }

  private onOverlayRotateMove = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!this.overlayRotateState) return;

    const annotation = this.annotations.get(this.overlayRotateState.annotationId);
    if (!annotation) return;

    const currentAngle = Math.atan2(
      event.clientY - this.overlayRotateState.centerClientY,
      event.clientX - this.overlayRotateState.centerClientX
    ) * (180 / Math.PI);

    const angleDelta = currentAngle - this.overlayRotateState.startAngle;
    let newRotation = this.overlayRotateState.startRotation + angleDelta;

    while (newRotation < 0) newRotation += 360;
    while (newRotation >= 360) newRotation -= 360;

    annotation.rotation = Math.round(newRotation);
    this.updateFreeShapeNode(this.overlayRotateState.annotationId, annotation);
  };

  private onOverlayRotateEnd = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!this.overlayRotateState) return;

    const annotationId = this.overlayRotateState.annotationId;

    window.removeEventListener('pointermove', this.onOverlayRotateMove);
    window.removeEventListener('pointerup', this.onOverlayRotateEnd);

    this.debouncedSave();
    this.overlayRotateState = null;
    this.overlayHoverLocks.delete(annotationId);
    this.setOverlayHoverState(annotationId, false);
  };

  private setOverlayHoverState(annotationId: string, hovered: boolean): void {
    const overlay = this.overlayElements.get(annotationId);
    if (!overlay) return;

    if (hovered) {
      const timer = this.overlayHoverHideTimers.get(annotationId);
      if (timer) {
        clearTimeout(timer);
        this.overlayHoverHideTimers.delete(annotationId);
      }

      if (overlay.resizeHandle && !this.overlayResizeState) {
        overlay.resizeHandle.classList.add(RESIZE_HANDLE_VISIBLE_CLASS);
      }
      if (overlay.rotateHandle && !this.overlayRotateState) {
        overlay.rotateHandle.classList.add(ROTATE_HANDLE_VISIBLE_CLASS);
      }
    } else {
      if (this.overlayHoverLocks.has(annotationId)) return;

      const timer = setTimeout(() => {
        this.overlayHoverHideTimers.delete(annotationId);
        if (overlay.resizeHandle && !this.overlayResizeState) {
          overlay.resizeHandle.classList.remove(RESIZE_HANDLE_VISIBLE_CLASS);
        }
        if (overlay.rotateHandle && !this.overlayRotateState) {
          overlay.rotateHandle.classList.remove(ROTATE_HANDLE_VISIBLE_CLASS);
        }
      }, 200);

      this.overlayHoverHideTimers.set(annotationId, timer);
    }
  }

  private updateOverlayHandleInteractivity(): void {
    const locked = (window as any).topologyLocked;
    this.overlayElements.forEach((overlay, annotationId) => {
      if (overlay.resizeHandle) {
        overlay.resizeHandle.style.pointerEvents = locked ? 'none' : 'auto';
        if (locked) {
          overlay.resizeHandle.classList.remove(RESIZE_HANDLE_VISIBLE_CLASS);
        }
      }
      if (overlay.rotateHandle) {
        overlay.rotateHandle.style.pointerEvents = locked ? 'none' : 'auto';
        if (locked) {
          overlay.rotateHandle.classList.remove(ROTATE_HANDLE_VISIBLE_CLASS);
        }
      }
      if (locked) {
        this.overlayHoverLocks.delete(annotationId);
        const timer = this.overlayHoverHideTimers.get(annotationId);
        if (timer) {
          clearTimeout(timer);
          this.overlayHoverHideTimers.delete(annotationId);
        }
      }
    });
  }

  private removeShapeOverlay(id: string): void {
    const overlay = this.overlayElements.get(id);
    if (overlay) {
      overlay.wrapper.remove();
      if (overlay.resizeHandle) {
        overlay.resizeHandle.remove();
      }
      if (overlay.rotateHandle) {
        overlay.rotateHandle.remove();
      }
      this.overlayElements.delete(id);
    }

    const timer = this.overlayHoverHideTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.overlayHoverHideTimers.delete(id);
    }
    this.overlayHoverLocks.delete(id);
  }

  public async editFreeShape(id: string): Promise<void> {
    const annotation = this.annotations.get(id);
    if (!annotation) return;

    const result = await this.modal.promptForShape(
      'Edit Shape',
      annotation,
      (updated) => {
        this.updateFreeShapeNode(id, updated);
        this.debouncedSave();
      }
    );
    if (result) {
      Object.assign(annotation, result);
      this.updateFreeShapeNode(id, annotation);
      this.debouncedSave();
    }
  }

  private updateFreeShapeNode(id: string, annotation: FreeShapeAnnotation): void {
    const node = this.annotationNodes.get(id);
    if (!node || !node.inside()) return;

    if (annotation.shapeType === 'line') {
      const center = this.svgRenderer.getLineCenter(annotation);
      node.position(center);
    } else if (annotation.position) {
      node.position(annotation.position);
    }
    this.applyShapeNodeStyles(node, annotation);
    this.removeShapeOverlay(id);
    this.createShapeOverlay(node, annotation);
  }

  private canInitiateOverlayHandleAction(event: PointerEvent): boolean {
    if (event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    if ((window as any).topologyLocked) {
      (window as any).showLabLockedMessage?.();
      return false;
    }
    return true;
  }

  public removeFreeShapeAnnotation(id: string): void {
    const node = this.annotationNodes.get(id);
    if (node && node.inside() && this.managedNodes.has(id)) {
      node.remove();
    }
    this.annotations.delete(id);
    this.annotationNodes.delete(id);
    this.managedNodes.delete(id);
    this.removeShapeOverlay(id);
    this.debouncedSave();
  }

  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveAnnotations();
    }, FreeShapesManager.SAVE_DEBOUNCE_MS);
  }

  private async saveAnnotations(): Promise<void> {
    try {
      const freeShapeAnnotations = Array.from(this.annotations.values());
      await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-save-annotations',
        { freeShapeAnnotations }
      );
      log.debug(`Saved ${freeShapeAnnotations.length} shape annotations`);
    } catch (error) {
      log.error(`Failed to save shape annotations: ${error}`);
    }
  }

  public async loadAnnotations(): Promise<void> {
    if (this.loadInProgress) {
      log.debug('Load already in progress, skipping duplicate request');
      return;
    }

    if (this.loadTimeout) {
      clearTimeout(this.loadTimeout);
    }

    this.loadTimeout = setTimeout(this.onLoadTimeout, 100);
    return Promise.resolve();
  }

  public restoreAnnotationPositions(): void {
    this.annotations.forEach((annotation, id) => {
      const node = this.annotationNodes.get(id);
      if (node && node.inside()) {
        if (annotation.shapeType === 'line') {
          node.position(this.svgRenderer.getLineCenter(annotation));
        } else {
          node.position({
            x: annotation.position.x,
            y: annotation.position.y
          });
        }
        this.positionOverlayById(id);
      }
    });
  }

  public reapplyAllShapeStyles(): void {
    this.annotationNodes.forEach((node, id) => {
      const annotation = this.annotations.get(id);
      if (annotation) {
        this.applyShapeNodeStyles(node, annotation);
      }
    });
    log.debug('Reapplied styles to free shape annotations');
  }

  private schedulePositionRestores(): void {
    setTimeout(() => {
      this.reapplyAllShapeStyles();
      this.restoreAnnotationPositions();
    }, 200);
    setTimeout(() => this.restoreAnnotationPositions(), 500);
    setTimeout(() => this.restoreAnnotationPositions(), 1000);
  }
}
