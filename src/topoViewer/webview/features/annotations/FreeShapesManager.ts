import cytoscape from 'cytoscape';
import { VscodeMessageSender } from '../../core/VscodeMessaging';
import { FreeShapeAnnotation } from '../../../shared/types/topoViewerGraph';
import { log } from '../../platform/logging/logger';

const DEFAULT_SHAPE_WIDTH = 50;
const DEFAULT_SHAPE_HEIGHT = 50;
const DEFAULT_LINE_LENGTH = 150;
const DEFAULT_FILL_COLOR = '#ffffff';
const DEFAULT_FILL_OPACITY = 0;
const DEFAULT_BORDER_COLOR = '#646464';
const DEFAULT_BORDER_WIDTH = 2;
const DEFAULT_BORDER_STYLE = 'solid';
const DEFAULT_ARROW_SIZE = 10;
const DEFAULT_CORNER_RADIUS = 0;
const MIN_SHAPE_SIZE = 5;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SVG_STROKE_WIDTH_ATTR = 'stroke-width';
const SVG_STROKE_DASHARRAY_ATTR = 'stroke-dasharray';
const HANDLE_TRANSLATE = 'translate(-50%, -50%)';
const RESIZE_HANDLE_VISIBLE_CLASS = 'free-shape-overlay-resize-visible';
const ROTATE_HANDLE_VISIBLE_CLASS = 'free-shape-overlay-rotate-visible';
const PANEL_FREE_SHAPES_ID = 'panel-free-shapes';
const CLASS_HAS_CHANGES = 'btn-has-changes';

interface ShapeModalElements {
  panel: HTMLDivElement;
  titleEl: HTMLSpanElement;
  closeBtn: HTMLButtonElement;
  typeSelect: HTMLSelectElement;
  widthInput: HTMLInputElement;
  heightInput: HTMLInputElement;
  fillColorInput: HTMLInputElement;
  fillOpacityInput: HTMLInputElement;
  fillOpacityValue: HTMLSpanElement;
  fillControls: HTMLDivElement;
  borderColorInput: HTMLInputElement;
  borderColorLabel: HTMLLabelElement;
  borderWidthInput: HTMLInputElement;
  borderWidthLabel: HTMLLabelElement;
  borderStyleSelect: HTMLSelectElement;
  borderStyleLabel: HTMLLabelElement;
  cornerRadiusInput: HTMLInputElement;
  cornerRadiusControl: HTMLDivElement;
  lineStartArrowCheck: HTMLInputElement;
  lineEndArrowCheck: HTMLInputElement;
  arrowSizeInput: HTMLInputElement;
  lineControls: HTMLDivElement;
  sizeControls: HTMLDivElement;
  rotationInput: HTMLInputElement;
  rotationControl: HTMLDivElement;
  transparentBtn: HTMLButtonElement;
  noBorderBtn: HTMLButtonElement;
  applyBtn: HTMLButtonElement;
  okBtn: HTMLButtonElement;
}

interface OverlayEntry {
  wrapper: HTMLDivElement;
  svg: SVGSVGElement;
  shape: SVGElement;
  resizeHandle?: HTMLButtonElement;
  rotateHandle?: HTMLButtonElement;
}

// eslint-disable-next-line no-unused-vars
type ShapeResolve = (annotation: FreeShapeAnnotation | null) => void;
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

export class ManagerFreeShapes {
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
  // Track intended (unsnapped) positions for free shapes during drag
  private intendedPositions: Map<string, { x: number; y: number }> = new Map();
  // Guard to prevent recursive position corrections
  private positionCorrectionInProgress: Set<string> = new Set();
  // Loading state management (matches freeText pattern)
  private loadInProgress = false;
  private loadTimeout: ReturnType<typeof setTimeout> | null = null;
  private onLoadTimeout: () => Promise<void>;
  // Initial values for change tracking
  private freeShapeInitialValues: Record<string, string> | null = null;

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.setupEventHandlers();
    this.initializeOverlayLayer();
    this.registerLockStateListener();

    // Initialize the load timeout callback (matches freeText pattern)
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

    // After drag release, restore the intended (unsnapped) position to bypass grid snapping
    this.cy.on('dragfree', SELECTOR_FREE_SHAPE, (event) => {
      const node = event.target;
      const nodeId = node.id();
      const intendedPos = this.intendedPositions.get(nodeId);
      if (intendedPos) {
        // Restore the unsnapped position - grid snap has already modified node.position()
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

  /**
   * Handle position changes for free shape nodes.
   * If user is dragging, track the position. Otherwise, enforce annotation position.
   */
  private handleShapePositionChange(event: cytoscape.EventObject): void {
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
      if (annotation.shapeType === 'line' && annotation.endPosition) {
        const prevCenter = this.getLineCenter(annotation);
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
      // Node is NOT being dragged - enforce annotation position
      this.enforceAnnotationPosition(node, annotation);
    }
  }

  /**
   * Force free shape node position to match annotation data.
   * This prevents external changes (layout, grid snap) from moving free shapes.
   */
  private enforceAnnotationPosition(node: cytoscape.NodeSingular, annotation: FreeShapeAnnotation): void {
    const nodeId = node.id();
    if (this.positionCorrectionInProgress.has(nodeId)) {
      return; // Prevent infinite recursion
    }
    const pos = node.position();
    let annotationX: number;
    let annotationY: number;

    if (annotation.shapeType === 'line') {
      const center = this.getLineCenter(annotation);
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

  /**
   * Update shape annotation position after drag.
   */
  private updateShapePosition(nodeId: string, position: { x: number; y: number }): void {
    const annotation = this.annotations.get(nodeId);
    if (!annotation) return;

    if (annotation.shapeType === 'line') {
      // For lines, position is the center - compute from endpoints
      const center = this.getLineCenter(annotation);
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

      // Check if target is a group or parent node - prevent shape addition on groups
      if (target !== this.cy) {
        // If clicked on a group or parent node, cancel shape mode
        if (target.isParent?.() || target.data?.('topoViewerRole') === 'group') {
          this.disableAddShapeMode();
          log.debug('Shape addition cancelled - cannot add shape to groups');
          return;
        }
      }

      // Only add shape when clicking on empty canvas
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

  private async addFreeShapeAtPosition(
    position: cytoscape.Position,
    shapeType: ShapeType
  ): Promise<void> {
    const id = `freeShape_${Date.now()}_${++this.idCounter}`;
    const defaultAnnotation = this.buildDefaultAnnotation(id, position, shapeType);

    const result = await this.promptForShape('Add Shape', defaultAnnotation);
    if (!result) return;

    this.addFreeShapeAnnotation(result);
  }

  private buildDefaultAnnotation(
    id: string,
    position: cytoscape.Position,
    shapeType: ShapeType
  ): FreeShapeAnnotation {
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

    // Calculate the correct initial position (for lines, use center; for others, use annotation position)
    const initialPosition = annotation.shapeType === 'line'
      ? this.getLineCenter(annotation)
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
      // Respect lock state when updating existing node
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

    // Respect lock state after adding node
    if ((window as any).topologyLocked) {
      node.lock();
    }

    this.annotationNodes.set(annotation.id, node);
    // Set position again to ensure it's correct
    node.position(initialPosition);
    this.applyShapeNodeStyles(node, annotation);
    this.removeShapeOverlay(annotation.id);
    this.createShapeOverlay(node, annotation);

    // Restore position after a short delay to bypass any grid snapping
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

    let shape: SVGElement;
    if (annotation.shapeType === 'rectangle') {
      shape = this.createRectangleShape(annotation);
    } else if (annotation.shapeType === 'circle') {
      shape = this.createCircleShape(annotation);
    } else {
      shape = this.createLineShape(annotation);
    }

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

  private createRectangleShape(annotation: FreeShapeAnnotation): SVGRectElement {
    const rect = document.createElementNS(SVG_NAMESPACE, 'rect');
    const width = annotation.width ?? DEFAULT_SHAPE_WIDTH;
    const height = annotation.height ?? DEFAULT_SHAPE_HEIGHT;
    const cornerRadius = annotation.cornerRadius ?? 0;

    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('rx', String(cornerRadius));
    rect.setAttribute('ry', String(cornerRadius));
    rect.setAttribute('fill', this.applyAlphaToColor(annotation.fillColor ?? DEFAULT_FILL_COLOR, annotation.fillOpacity ?? DEFAULT_FILL_OPACITY));
    rect.setAttribute('stroke', annotation.borderColor ?? DEFAULT_BORDER_COLOR);
    rect.setAttribute(SVG_STROKE_WIDTH_ATTR, String(annotation.borderWidth ?? DEFAULT_BORDER_WIDTH));
    rect.setAttribute(SVG_STROKE_DASHARRAY_ATTR, this.getBorderDashArray(annotation.borderStyle));

    return rect;
  }

  private createCircleShape(annotation: FreeShapeAnnotation): SVGEllipseElement {
    const ellipse = document.createElementNS(SVG_NAMESPACE, 'ellipse');
    const width = annotation.width ?? DEFAULT_SHAPE_WIDTH;
    const height = annotation.height ?? DEFAULT_SHAPE_HEIGHT;

    ellipse.setAttribute('cx', String(width / 2));
    ellipse.setAttribute('cy', String(height / 2));
    ellipse.setAttribute('rx', String(width / 2));
    ellipse.setAttribute('ry', String(height / 2));
    ellipse.setAttribute('fill', this.applyAlphaToColor(annotation.fillColor ?? DEFAULT_FILL_COLOR, annotation.fillOpacity ?? DEFAULT_FILL_OPACITY));
    ellipse.setAttribute('stroke', annotation.borderColor ?? DEFAULT_BORDER_COLOR);
    ellipse.setAttribute(SVG_STROKE_WIDTH_ATTR, String(annotation.borderWidth ?? DEFAULT_BORDER_WIDTH));
    ellipse.setAttribute(SVG_STROKE_DASHARRAY_ATTR, this.getBorderDashArray(annotation.borderStyle));

    return ellipse;
  }

  private computeLineGeometry(annotation: FreeShapeAnnotation): {
    dx: number;
    dy: number;
    minX: number;
    minY: number;
    width: number;
    height: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
  } {
    const startX = annotation.position.x;
    const startY = annotation.position.y;
    const endX = annotation.endPosition?.x ?? (annotation.position.x + DEFAULT_LINE_LENGTH);
    const endY = annotation.endPosition?.y ?? annotation.position.y;
    const dx = endX - startX;
    const dy = endY - startY;

    const strokeWidth = annotation.borderWidth ?? DEFAULT_BORDER_WIDTH;
    const arrowSize = (annotation.lineStartArrow || annotation.lineEndArrow)
      ? (annotation.lineArrowSize ?? DEFAULT_ARROW_SIZE)
      : 0;
    const padding = Math.max(strokeWidth, arrowSize) + 1;

    const halfDx = dx / 2;
    const halfDy = dy / 2;
    const startCenterX = -halfDx;
    const startCenterY = -halfDy;
    const endCenterX = halfDx;
    const endCenterY = halfDy;

    const minX = Math.min(startCenterX, endCenterX) - padding;
    const maxX = Math.max(startCenterX, endCenterX) + padding;
    const minY = Math.min(startCenterY, endCenterY) - padding;
    const maxY = Math.max(startCenterY, endCenterY) + padding;

    const width = Math.max(MIN_SHAPE_SIZE, maxX - minX);
    const height = Math.max(MIN_SHAPE_SIZE, maxY - minY);

    const start = { x: startCenterX - minX, y: startCenterY - minY };
    const end = { x: endCenterX - minX, y: endCenterY - minY };

    return { dx, dy, minX, minY, width, height, start, end };
  }

  private getLineCenter(annotation: FreeShapeAnnotation): { x: number; y: number } {
    const endX = annotation.endPosition?.x ?? annotation.position.x;
    const endY = annotation.endPosition?.y ?? annotation.position.y;
    return {
      x: (annotation.position.x + endX) / 2,
      y: (annotation.position.y + endY) / 2
    };
  }

  private createLineShape(annotation: FreeShapeAnnotation): SVGGElement {
    const g = document.createElementNS(SVG_NAMESPACE, 'g');
    const line = document.createElementNS(SVG_NAMESPACE, 'line');

    const geometry = this.computeLineGeometry(annotation);
    const arrowSize = annotation.lineArrowSize ?? DEFAULT_ARROW_SIZE;

    // Calculate line endpoints, shortened if arrows are present
    let lineStartX = geometry.start.x;
    let lineStartY = geometry.start.y;
    let lineEndX = geometry.end.x;
    let lineEndY = geometry.end.y;

    // Calculate line direction and length
    const dx = geometry.end.x - geometry.start.x;
    const dy = geometry.end.y - geometry.start.y;
    const lineLength = Math.sqrt(dx * dx + dy * dy);

    if (lineLength > 0) {
      // Unit vector along the line
      const ux = dx / lineLength;
      const uy = dy / lineLength;

      // Shorten line at start if there's a start arrow
      if (annotation.lineStartArrow) {
        lineStartX += ux * arrowSize * 0.7;
        lineStartY += uy * arrowSize * 0.7;
      }

      // Shorten line at end if there's an end arrow
      if (annotation.lineEndArrow) {
        lineEndX -= ux * arrowSize * 0.7;
        lineEndY -= uy * arrowSize * 0.7;
      }
    }

    line.setAttribute('x1', String(lineStartX));
    line.setAttribute('y1', String(lineStartY));
    line.setAttribute('x2', String(lineEndX));
    line.setAttribute('y2', String(lineEndY));
    line.setAttribute('stroke', annotation.borderColor ?? DEFAULT_BORDER_COLOR);
    line.setAttribute(SVG_STROKE_WIDTH_ATTR, String(annotation.borderWidth ?? DEFAULT_BORDER_WIDTH));
    line.setAttribute(SVG_STROKE_DASHARRAY_ATTR, this.getBorderDashArray(annotation.borderStyle));

    g.appendChild(line);

    if (annotation.lineStartArrow) {
      g.appendChild(this.createArrow(geometry.start.x, geometry.start.y, geometry.end.x, geometry.end.y, annotation));
    }
    if (annotation.lineEndArrow) {
      g.appendChild(this.createArrow(geometry.end.x, geometry.end.y, geometry.start.x, geometry.start.y, annotation));
    }

    return g;
  }

  private createArrow(
    x: number,
    y: number,
    fromX: number,
    fromY: number,
    annotation: FreeShapeAnnotation
  ): SVGPolygonElement {
    const arrow = document.createElementNS(SVG_NAMESPACE, 'polygon');
    const arrowSize = annotation.lineArrowSize ?? DEFAULT_ARROW_SIZE;

    const angle = Math.atan2(y - fromY, x - fromX);
    const arrowAngle = Math.PI / 6;

    const p1x = x - arrowSize * Math.cos(angle - arrowAngle);
    const p1y = y - arrowSize * Math.sin(angle - arrowAngle);
    const p2x = x;
    const p2y = y;
    const p3x = x - arrowSize * Math.cos(angle + arrowAngle);
    const p3y = y - arrowSize * Math.sin(angle + arrowAngle);

    arrow.setAttribute('points', `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
    arrow.setAttribute('fill', annotation.borderColor ?? DEFAULT_BORDER_COLOR);

    return arrow;
  }

  private getBorderDashArray(style?: 'solid' | 'dashed' | 'dotted'): string {
    switch (style) {
      case 'dashed':
        return '10,5';
      case 'dotted':
        return '2,2';
      default:
        return '';
    }
  }

  private applyAlphaToColor(color: string, alpha: number): string {
    const normalizedAlpha = Math.min(1, Math.max(0, alpha));
    const hexMatch = /^#([0-9a-f]{6})$/i.exec(color);

    if (hexMatch) {
      const r = parseInt(hexMatch[1].slice(0, 2), 16);
      const g = parseInt(hexMatch[1].slice(2, 4), 16);
      const b = parseInt(hexMatch[1].slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }

    return color;
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
      const geometry = this.computeLineGeometry(annotation);
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
      const geometry = this.computeLineGeometry(annotation);
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
    if (!this.canInitiateOverlayHandleAction(event)) {
      return;
    }
    const annotation = this.annotations.get(annotationId);
    const overlay = this.overlayElements.get(annotationId);
    if (!annotation || !overlay || !overlay.resizeHandle) return;

    const isLine = annotation.shapeType === 'line';
    const startWidth = annotation.width ?? DEFAULT_SHAPE_WIDTH;
    const startHeight = annotation.height ?? DEFAULT_SHAPE_HEIGHT;
    const rotationRad = ((annotation.rotation ?? 0) * Math.PI) / 180;
    if (isLine) {
      const geometry = this.computeLineGeometry(annotation);
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
      // Keep the rotated top-left corner fixed so the bottom-right handle drives the resize
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

    const {
      rotationRad,
      anchorX,
      anchorY,
      isLine,
      startDx = 0,
      startDy = 0
    } = this.overlayResizeState;
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
    if (!this.canInitiateOverlayHandleAction(event)) {
      return;
    }
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
      if (this.overlayHoverLocks.has(annotationId)) {
        return;
      }

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

    const result = await this.promptForShape('Edit Shape', annotation);
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
      const center = this.getLineCenter(annotation);
      node.position(center);
    } else if (annotation.position) {
      node.position(annotation.position);
    }
    this.applyShapeNodeStyles(node, annotation);
    this.removeShapeOverlay(id);
    this.createShapeOverlay(node, annotation);
  }

  private canInitiateOverlayHandleAction(event: PointerEvent): boolean {
    if (event.button !== 0) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    if ((window as any).topologyLocked) {
      (window as any).showLabLockedMessage?.();
      return false;
    }
    return true;
  }

  private async promptForShape(title: string, annotation: FreeShapeAnnotation): Promise<FreeShapeAnnotation | null> {
    return new Promise((resolve) => {
      this.openShapeModal(title, annotation, resolve);
    });
  }

  private openShapeModal(title: string, annotation: FreeShapeAnnotation, resolve: ShapeResolve): void {
    const elements = this.getModalElements();
    if (!elements) {
      resolve(null);
      return;
    }

    this.initializeModal(title, annotation, elements);
    this.setupModalHandlers(annotation, elements, resolve);

    // Capture initial values for change tracking after a small delay to ensure DOM is updated
    setTimeout(() => {
      this.freeShapeInitialValues = this.captureFreeShapeValues(elements);
      this.updateFreeShapeApplyButtonState(elements);
    }, 0);

    // Set up change tracking on all inputs
    this.setupFreeShapeChangeTracking(elements);

    this.showModal(elements);
  }

  /**
   * Sets up change tracking on free shape editor inputs.
   */
  private setupFreeShapeChangeTracking(els: ShapeModalElements): void {
    const updateState = () => this.updateFreeShapeApplyButtonState(els);

    const inputs = [
      els.typeSelect, els.widthInput, els.heightInput,
      els.fillColorInput, els.fillOpacityInput,
      els.borderColorInput, els.borderWidthInput, els.borderStyleSelect,
      els.cornerRadiusInput, els.lineStartArrowCheck, els.lineEndArrowCheck,
      els.arrowSizeInput, els.rotationInput
    ];

    inputs.forEach(input => {
      if (input) {
        input.addEventListener('input', updateState);
        input.addEventListener('change', updateState);
      }
    });
  }

  private getModalElements(): ShapeModalElements | null {
    const elements = {
      panel: document.getElementById(PANEL_FREE_SHAPES_ID) as HTMLDivElement | null,
      titleEl: document.getElementById(`${PANEL_FREE_SHAPES_ID}-title`) as HTMLSpanElement | null,
      closeBtn: document.getElementById(`${PANEL_FREE_SHAPES_ID}-close`) as HTMLButtonElement | null,
      typeSelect: document.getElementById('free-shapes-type') as HTMLSelectElement | null,
      widthInput: document.getElementById('free-shapes-width') as HTMLInputElement | null,
      heightInput: document.getElementById('free-shapes-height') as HTMLInputElement | null,
      fillColorInput: document.getElementById('free-shapes-fill-color') as HTMLInputElement | null,
      fillOpacityInput: document.getElementById('free-shapes-fill-opacity') as HTMLInputElement | null,
      fillOpacityValue: document.getElementById('free-shapes-fill-opacity-value') as HTMLSpanElement | null,
      fillControls: document.getElementById('free-shapes-fill-controls') as HTMLDivElement | null,
      borderColorInput: document.getElementById('free-shapes-border-color') as HTMLInputElement | null,
      borderColorLabel: document.getElementById('free-shapes-border-color-label') as HTMLLabelElement | null,
      borderWidthInput: document.getElementById('free-shapes-border-width') as HTMLInputElement | null,
      borderWidthLabel: document.getElementById('free-shapes-border-width-label') as HTMLLabelElement | null,
      borderStyleSelect: document.getElementById('free-shapes-border-style') as HTMLSelectElement | null,
      borderStyleLabel: document.getElementById('free-shapes-border-style-label') as HTMLLabelElement | null,
      cornerRadiusInput: document.getElementById('free-shapes-corner-radius') as HTMLInputElement | null,
      cornerRadiusControl: document.getElementById('free-shapes-corner-radius-control') as HTMLDivElement | null,
      lineStartArrowCheck: document.getElementById('free-shapes-line-start-arrow') as HTMLInputElement | null,
      lineEndArrowCheck: document.getElementById('free-shapes-line-end-arrow') as HTMLInputElement | null,
      arrowSizeInput: document.getElementById('free-shapes-arrow-size') as HTMLInputElement | null,
      lineControls: document.getElementById('free-shapes-line-controls') as HTMLDivElement | null,
      sizeControls: document.getElementById('free-shapes-size-controls') as HTMLDivElement | null,
      rotationInput: document.getElementById('free-shapes-rotation') as HTMLInputElement | null,
      rotationControl: document.getElementById('free-shapes-rotation-control') as HTMLDivElement | null,
      transparentBtn: document.getElementById('free-shapes-transparent-btn') as HTMLButtonElement | null,
      noBorderBtn: document.getElementById('free-shapes-no-border-btn') as HTMLButtonElement | null,
      applyBtn: document.getElementById('free-shapes-apply-btn') as HTMLButtonElement | null,
      okBtn: document.getElementById('free-shapes-ok-btn') as HTMLButtonElement | null,
    };

    if (Object.values(elements).some(el => el === null)) {
      log.error('Free shapes modal elements not found');
      return null;
    }

    return elements as ShapeModalElements;
  }

  private initializeModal(title: string, annotation: FreeShapeAnnotation, els: ShapeModalElements): void {
    els.titleEl.textContent = title;
    els.typeSelect.value = annotation.shapeType;
    els.widthInput.value = String(annotation.width ?? DEFAULT_SHAPE_WIDTH);
    els.heightInput.value = String(annotation.height ?? DEFAULT_SHAPE_HEIGHT);
    els.fillColorInput.value = annotation.fillColor ?? DEFAULT_FILL_COLOR;
    els.fillOpacityInput.value = String(Math.round((annotation.fillOpacity ?? DEFAULT_FILL_OPACITY) * 100));
    els.fillOpacityValue.textContent = `${Math.round((annotation.fillOpacity ?? DEFAULT_FILL_OPACITY) * 100)}%`;
    els.borderColorInput.value = annotation.borderColor ?? DEFAULT_BORDER_COLOR;
    els.borderWidthInput.value = String(annotation.borderWidth ?? DEFAULT_BORDER_WIDTH);
    els.borderStyleSelect.value = annotation.borderStyle ?? DEFAULT_BORDER_STYLE;
    els.cornerRadiusInput.value = String(annotation.cornerRadius ?? 0);
    els.lineStartArrowCheck.checked = annotation.lineStartArrow ?? false;
    els.lineEndArrowCheck.checked = annotation.lineEndArrow ?? false;
    els.arrowSizeInput.value = String(annotation.lineArrowSize ?? DEFAULT_ARROW_SIZE);
    els.rotationInput.value = String(annotation.rotation ?? 0);

    this.updateModalControlVisibility(annotation.shapeType, els);
  }

  private updateModalControlVisibility(shapeType: string, els: ShapeModalElements): void {
    const isLine = shapeType === 'line';

    // Size controls (hidden for lines)
    els.sizeControls.style.display = isLine ? 'none' : 'grid';

    // Line-specific controls
    els.lineControls.style.display = isLine ? 'block' : 'none';

    // Corner radius (only for rectangles)
    els.cornerRadiusControl.style.display = shapeType === 'rectangle' ? 'block' : 'none';

    // Fill controls (hidden for lines - lines don't have fill)
    els.fillControls.style.display = isLine ? 'none' : 'grid';

    // Rotation (hidden for lines - line angle is determined by endpoints)
    els.rotationControl.style.display = isLine ? 'none' : 'block';

    // Update labels for lines
    els.borderColorLabel.textContent = isLine ? 'Line Color:' : 'Border Color:';
    els.borderWidthLabel.textContent = isLine ? 'Line Width:' : 'Border Width:';
    els.borderStyleLabel.textContent = isLine ? 'Line Style:' : 'Border Style:';
  }

  /**
   * Captures current values from free shape editor inputs for change tracking.
   */
  private captureFreeShapeValues(els: ShapeModalElements): Record<string, string> {
    return {
      type: els.typeSelect.value,
      width: els.widthInput.value,
      height: els.heightInput.value,
      fillColor: els.fillColorInput.value,
      fillOpacity: els.fillOpacityInput.value,
      borderColor: els.borderColorInput.value,
      borderWidth: els.borderWidthInput.value,
      borderStyle: els.borderStyleSelect.value,
      cornerRadius: els.cornerRadiusInput.value,
      lineStartArrow: String(els.lineStartArrowCheck.checked),
      lineEndArrow: String(els.lineEndArrowCheck.checked),
      arrowSize: els.arrowSizeInput.value,
      rotation: els.rotationInput.value
    };
  }

  /**
   * Checks if there are unsaved changes in the free shape editor.
   */
  private hasFreeShapeChanges(els: ShapeModalElements): boolean {
    if (!this.freeShapeInitialValues) return false;
    const current = this.captureFreeShapeValues(els);
    return Object.keys(this.freeShapeInitialValues).some(
      key => this.freeShapeInitialValues![key] !== current[key]
    );
  }

  /**
   * Updates the free shape editor Apply button visual state.
   */
  private updateFreeShapeApplyButtonState(els: ShapeModalElements): void {
    const { applyBtn } = els;
    if (!applyBtn) return;
    const hasChanges = this.hasFreeShapeChanges(els);
    applyBtn.classList.toggle(CLASS_HAS_CHANGES, hasChanges);
  }

  /**
   * Resets free shape editor initial values after applying changes.
   */
  private resetFreeShapeInitialValues(els: ShapeModalElements): void {
    this.freeShapeInitialValues = this.captureFreeShapeValues(els);
    this.updateFreeShapeApplyButtonState(els);
  }

  private setupModalHandlers(annotation: FreeShapeAnnotation, els: ShapeModalElements, resolve: ShapeResolve): void {
    const cleanup = () => {
      this.hideModal(els);
    };

    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    els.typeSelect.addEventListener('change', () => {
      this.updateModalControlVisibility(els.typeSelect.value, els);
    });

    els.fillOpacityInput.addEventListener('input', () => {
      els.fillOpacityValue.textContent = `${els.fillOpacityInput.value}%`;
    });

    els.transparentBtn.addEventListener('click', () => {
      els.fillOpacityInput.value = '0';
      els.fillOpacityValue.textContent = '0%';
    });

    els.noBorderBtn.addEventListener('click', () => {
      els.borderWidthInput.value = '0';
    });

    // Close button just closes without saving
    els.closeBtn.addEventListener('click', handleCancel);

    const buildResult = (): FreeShapeAnnotation => ({
      ...annotation,
      shapeType: els.typeSelect.value as 'rectangle' | 'circle' | 'line',
      width: parseInt(els.widthInput.value),
      height: parseInt(els.heightInput.value),
      fillColor: els.fillColorInput.value,
      fillOpacity: parseInt(els.fillOpacityInput.value) / 100,
      borderColor: els.borderColorInput.value,
      borderWidth: parseInt(els.borderWidthInput.value),
      borderStyle: els.borderStyleSelect.value as 'solid' | 'dashed' | 'dotted',
      cornerRadius: parseInt(els.cornerRadiusInput.value),
      lineStartArrow: els.lineStartArrowCheck.checked,
      lineEndArrow: els.lineEndArrowCheck.checked,
      lineArrowSize: parseInt(els.arrowSizeInput.value),
      rotation: parseInt(els.rotationInput.value)
    });

    // Apply changes without closing or resolving
    const applyChanges = () => {
      const result = buildResult();
      // Update annotation in place
      Object.assign(annotation, result);
      this.updateFreeShapeNode(annotation.id, annotation);
      this.debouncedSave();
      // Reset initial values after successful apply
      this.resetFreeShapeInitialValues(els);
    };

    // Apply saves but keeps panel open (doesn't resolve promise)
    els.applyBtn.addEventListener('click', applyChanges);

    // OK saves and closes
    els.okBtn.addEventListener('click', () => {
      cleanup();
      resolve(buildResult());
    });
  }

  private showModal(els: ShapeModalElements): void {
    // Use window manager to show the panel
    const managedWindow = (window as any).panelManager?.getPanel(PANEL_FREE_SHAPES_ID);
    if (managedWindow) {
      managedWindow.show();
    } else {
      // Fallback if window manager not available
      els.panel.style.display = 'flex';
    }
  }

  private hideModal(els: ShapeModalElements): void {
    // Use window manager to hide the panel
    const managedWindow = (window as any).panelManager?.getPanel(PANEL_FREE_SHAPES_ID);
    if (managedWindow) {
      managedWindow.hide();
    } else {
      // Fallback if window manager not available
      els.panel.style.display = 'none';
    }
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
    }, ManagerFreeShapes.SAVE_DEBOUNCE_MS);
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

  /**
   * Load annotations from backend with debouncing to prevent duplicate requests
   * and ensure graph is stable before loading (matches freeText pattern)
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

    // Debounce the load to prevent rapid-fire requests and ensure graph is stable
    this.loadTimeout = setTimeout(this.onLoadTimeout, 100);
    return Promise.resolve();
  }

  /**
   * Restore all shape annotation positions from stored annotation data.
   * This ensures positions are preserved despite grid snapping or layout operations.
   */
  public restoreAnnotationPositions(): void {
    this.annotations.forEach((annotation, id) => {
      const node = this.annotationNodes.get(id);
      if (node && node.inside()) {
        if (annotation.shapeType === 'line') {
          node.position(this.getLineCenter(annotation));
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

  /**
   * Reapply styles to all shape annotations.
   * Called before position restore to ensure nodes are in correct state.
   * Also called after paste operations to restore proper dimensions.
   */
  public reapplyAllShapeStyles(): void {
    this.annotationNodes.forEach((node, id) => {
      const annotation = this.annotations.get(id);
      if (annotation) {
        this.applyShapeNodeStyles(node, annotation);
      }
    });
    log.debug('Reapplied styles to free shape annotations');
  }

  /**
   * Schedule multiple position restores after loading to ensure free shape positions
   * persist despite any grid snapping or layout operations.
   */
  private schedulePositionRestores(): void {
    // Restore positions after delays to ensure nodes are rendered and
    // bypass any grid snapping that may occur during initialization
    setTimeout(() => {
      this.reapplyAllShapeStyles();
      this.restoreAnnotationPositions();
    }, 200);
    // Additional restores at longer delays to catch any late layout operations
    setTimeout(() => this.restoreAnnotationPositions(), 500);
    setTimeout(() => this.restoreAnnotationPositions(), 1000);
  }
}
