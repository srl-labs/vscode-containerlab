/**
 * Manages free text annotations in the Cytoscape viewport.
 * Coordinates between overlay rendering, modal UI, and annotation persistence.
 */
import cytoscape from 'cytoscape';
import { VscodeMessageSender } from '../../platform/messaging/VscodeMessaging';
import { FreeTextAnnotation, GroupStyleAnnotation } from '../../../shared/types/topoViewerGraph';
import { log } from '../../platform/logging/logger';
import type { ManagerGroupStyle } from '../groups/GroupStyleManager';
import { FreeTextOverlayManager, OverlayManagerCallbacks } from './FreeTextOverlayManager';
import { FreeTextModalController, ModalControllerCallbacks } from './FreeTextModalController';
import {
  DEFAULT_FREE_TEXT_FONT_SIZE,
  DEFAULT_FREE_TEXT_WIDTH,
  MIN_FREE_TEXT_WIDTH,
  MIN_FREE_TEXT_NODE_SIZE,
  normalizeFontSize,
  normalizeRotation,
  resolveBackgroundColor
} from './freeTextUtils';

/**
 * Manages free text annotations in the Cytoscape viewport
 */
export class ManagerFreeText {
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender;
  private groupStyleManager?: ManagerGroupStyle;
  private annotations: Map<string, FreeTextAnnotation> = new Map();
  private annotationNodes: Map<string, cytoscape.NodeSingular> = new Map();

  // Sub-managers
  private overlayManager: FreeTextOverlayManager;
  private modalController: FreeTextModalController;

  // Track intended (unsnapped) positions for free text during drag
  private intendedPositions: Map<string, { x: number; y: number }> = new Map();
  // Guard to prevent recursive position corrections
  private positionCorrectionInProgress: Set<string> = new Set();

  // Save state management
  private saveInProgress = false;
  private pendingSaveWhileBusy = false;
  private lastSavedStateKey: string | null = null;
  private styleReapplyInProgress = false;

  // Debounce configuration
  private static readonly SAVE_DEBOUNCE_MS = 300;
  private static readonly SAVE_MAX_WAIT_MS = 1200;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private saveBurstStart: number | null = null;

  // Load state management
  private loadInProgress = false;
  private loadTimeout: ReturnType<typeof setTimeout> | null = null;
  private idCounter = 0;

  private reapplyStylesBound: () => void;
  private onLoadTimeout: () => Promise<void>;

  private isLabLocked(): boolean {
    return Boolean((window as any)?.topologyLocked);
  }

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender, groupStyleManager?: ManagerGroupStyle) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.groupStyleManager = groupStyleManager;

    this.overlayManager = new FreeTextOverlayManager(cy, messageSender, this.createOverlayCallbacks());
    this.modalController = new FreeTextModalController(this.createModalCallbacks());

    this.setupEventHandlers();
    this.setupStylePreservation();

    this.reapplyStylesBound = this.createReapplyStylesBound();
    this.onLoadTimeout = this.createLoadTimeoutHandler();
  }

  private createOverlayCallbacks(): OverlayManagerCallbacks {
    return {
      getAnnotation: (id: string) => this.annotations.get(id),
      getNode: (id: string) => this.annotationNodes.get(id),
      isLabLocked: () => this.isLabLocked(),
      onAnnotationResized: (id: string, width: number, height: number) => {
        const annotation = this.annotations.get(id);
        if (annotation) {
          annotation.width = width;
          annotation.height = height;
        }
      },
      onAnnotationRotated: (id: string, rotation: number) => {
        const annotation = this.annotations.get(id);
        if (annotation) {
          annotation.rotation = rotation;
        }
      },
      onSaveRequested: () => this.debouncedSave()
    };
  }

  private createModalCallbacks(): ModalControllerCallbacks {
    return {
      onAnnotationUpdated: (annotation: FreeTextAnnotation) => {
        this.updateFreeTextNode(annotation.id, annotation);
      },
      onSaveRequested: () => this.debouncedSave()
    };
  }

  private createReapplyStylesBound(): () => void {
    return () => {
      this.annotationNodes.forEach((node, id) => {
        const annotation = this.annotations.get(id);
        if (annotation) {
          this.applyTextNodeStyles(node, annotation);
        }
      });
      log.debug('Reapplied styles to free text annotations');
    };
  }

  private createLoadTimeoutHandler(): () => Promise<void> {
    return async () => {
      this.loadInProgress = true;
      try {
        log.info('freeText:loadAnnotations:request');
        const response = await this.messageSender.sendMessageToVscodeEndpointPost(
          'topo-editor-load-annotations',
          {}
        );

        if (response && response.annotations) {
          this.clearAnnotationsForLoad();
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

  private clearAnnotationsForLoad(): void {
    this.annotations.clear();
    this.annotationNodes.forEach(node => { if (node && node.inside()) node.remove(); });
    this.annotationNodes.clear();
    this.overlayManager.clearAnnotationOverlays();
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
      this.overlayManager.setOverlayHoverState(node.id(), true);
    });

    this.cy.on('mouseout', SELECTOR_FREE_TEXT, (event) => {
      const node = event.target;
      this.overlayManager.setOverlayHoverState(node.id(), false);
    });

    // Handle deletion of free text nodes
    this.cy.on('remove', SELECTOR_FREE_TEXT, (event) => {
      const node = event.target;
      const id = node.id();
      // Only remove from our tracking if it's not already being handled
      if (this.annotations.has(id)) {
        this.annotations.delete(id);
        this.annotationNodes.delete(id);
        this.overlayManager.removeAnnotationOverlay(id);
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
    this.overlayManager.positionOverlayById(node.id());

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

    const result = await this.modalController.promptForTextWithFormatting('Add Text', defaultAnnotation);
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
      fontSize: normalizeFontSize(fontSize),
      fontColor,
      backgroundColor,
      fontWeight,
      fontStyle,
      textDecoration,
      fontFamily,
      textAlign,
      rotation: normalizeRotation(rotation),
      roundedBackground
    };
  }

  /**
   * Edit existing free text
   */
  public async editFreeText(id: string): Promise<void> {
    const annotation = this.annotations.get(id);
    if (!annotation) return;

    const result = await this.modalController.promptForTextWithFormatting('Edit Text', annotation);
    if (result && result.text) {
      // Update the annotation with new values
      Object.assign(annotation, result);
      this.updateFreeTextNode(id, annotation);
      // Save annotations after edit (debounced)
      this.debouncedSave();
    }
  }

  /**
   * Add a free text annotation to the graph
   */
  public addFreeTextAnnotation(annotation: FreeTextAnnotation, options?: { skipSave?: boolean }): void {
    const rotation = normalizeRotation(annotation.rotation);
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
      this.overlayManager.positionOverlayById(annotation.id);
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
    const rotation = normalizeRotation(annotation.rotation);
    annotation.rotation = rotation;
    node.data('freeTextData', annotation);

    // Create a comprehensive style object with all necessary properties
    const styles: any = {};
    const textAlign = annotation.textAlign ?? 'left';
    const useOverlay = this.overlayManager.hasOverlayContainer();

    // Font size
    const fontSize = normalizeFontSize(annotation.fontSize);
    styles['font-size'] = fontSize;

    // Text color
    styles['color'] = annotation.fontColor || '#FFFFFF';

    // Font weight - use string values as Cytoscape expects
    styles['font-weight'] = annotation.fontWeight === 'bold' ? 'bold' : 'normal';

    // Font style
    styles['font-style'] = annotation.fontStyle === 'italic' ? 'italic' : 'normal';

    // Font family
    const fontFamily = annotation.fontFamily || 'monospace';
    styles['font-family'] = fontFamily;
    styles['text-halign'] = textAlign;
    styles['text-valign'] = 'center';
    styles['text-opacity'] = useOverlay ? 0 : 1;
    styles['text-events'] = useOverlay ? 'no' : 'yes';
    styles['text-wrap'] = useOverlay ? 'none' : 'wrap';
    styles['text-max-width'] = this.getNodeTextMaxWidth(annotation, useOverlay);
    styles['text-rotation'] = rotation;

    Object.assign(styles, this.getOutlineStyles(annotation, useOverlay));
    Object.assign(styles, this.getBackgroundStyles(annotation, useOverlay));

    // Apply all styles at once
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
    this.overlayManager.updateAnnotationOverlay(node, annotation);
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

    const backgroundColor = resolveBackgroundColor(annotation.backgroundColor, false);
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
      this.overlayManager.positionOverlayById(id);
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
        this.overlayManager.positionOverlayById(id);
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
    this.overlayManager.removeAnnotationOverlay(id);
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
    this.overlayManager.clearAnnotationOverlays();
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
