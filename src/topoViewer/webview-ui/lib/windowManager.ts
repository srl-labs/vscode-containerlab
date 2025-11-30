/**
 * WindowManager - A lightweight window management library for floating panels
 * Similar to WinBox.js but tailored for topoviewer needs
 *
 * Features:
 * - Draggable windows via title bar
 * - Resizable windows with handles
 * - Z-index management (click to focus)
 * - Boundary constraints
 * - LocalStorage persistence
 * - VSCode theme integration
 */

/* eslint-disable no-unused-vars */
export interface WindowConfig {
  id: string;
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizable?: boolean;
  draggable?: boolean;
  fixedSize?: boolean; // If true, width and height are fixed and cannot be resized
  storageKey?: string;
  onFocus?: (win: ManagedWindow) => void;
  onMove?: (win: ManagedWindow, x: number, y: number) => void;
  onResize?: (win: ManagedWindow, width: number, height: number) => void;
  onClose?: (win: ManagedWindow) => void;
}
/* eslint-enable no-unused-vars */

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

// Constants
const PANEL_TITLE_BAR_CLASS = 'panel-title-bar';
const WM_WINDOW_CLASS = 'wm-window';
const WM_DRAGGING_CLASS = 'wm-dragging';
const WM_RESIZING_CLASS = 'wm-resizing';

export class ManagedWindow {
  public id: string;
  public element: HTMLElement;
  public config: WindowConfig;
  private state: WindowState;
  private isDragging = false;
  private isResizing = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeDirection = '';
  private titleBar: HTMLElement | null = null;
  private resizeHandles: HTMLElement[] = [];
  private manager: WindowManager;

  constructor(element: HTMLElement, config: WindowConfig, manager: WindowManager) {
    this.element = element;
    this.config = config;
    this.id = config.id;
    this.manager = manager;

    // Calculate initial dimensions - if 0, use minimum size
    const minWidth = config.minWidth ?? 300;
    const minHeight = config.minHeight ?? 200;
    const initialWidth = config.width === 0 ? minWidth : (config.width ?? 400);
    const initialHeight = config.height === 0 ? minHeight : (config.height ?? 300);

    // Initialize state
    this.state = {
      x: config.x ?? 100,
      y: config.y ?? 100,
      width: initialWidth,
      height: initialHeight,
      zIndex: manager.getNextZIndex()
    };

    // Load saved state from localStorage if available
    if (config.storageKey) {
      this.loadState();
    }

    this.initialize();
  }

  private initialize(): void {
    // Make element positioned absolutely if not already
    if (window.getComputedStyle(this.element).position === 'static') {
      this.element.style.position = 'absolute';
    }

    // Find or create title bar for dragging
    this.titleBar = this.element.querySelector(`.${PANEL_TITLE_BAR_CLASS}`) as HTMLElement;

    if (!this.titleBar) {
      // Look for alternative drag handles
      this.titleBar = this.element.querySelector('[data-drag-handle]') as HTMLElement;
    }

    // Add window manager class
    this.element.classList.add(WM_WINDOW_CLASS);

    // Set up dragging
    if (this.config.draggable !== false && this.titleBar) {
      this.setupDragging();
    }

    // Set up resizing (unless fixedSize is true)
    if (this.config.resizable !== false && !this.config.fixedSize) {
      this.setupResizing();
    }

    // Set up focus management
    this.setupFocusManagement();

    // Set up display observer to apply state when panel becomes visible
    this.setupDisplayObserver();

    // Apply initial state (only if visible)
    if (this.element.style.display !== 'none') {
      this.applyState();
    }
  }

  private setupDisplayObserver(): void {
    let previousDisplay = this.element.style.display;

    // Watch for changes to the display property
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const currentDisplay = this.element.style.display;

          // Only act if display actually changed from none to something else
          if (previousDisplay === 'none' && currentDisplay !== 'none' && currentDisplay !== '') {
            // Disconnect observer temporarily to prevent infinite loop
            observer.disconnect();

            this.applyState();
            this.focus();

            // Reconnect observer
            observer.observe(this.element, {
              attributes: true,
              attributeFilter: ['style']
            });
          }

          previousDisplay = currentDisplay;
        }
      });
    });

    observer.observe(this.element, {
      attributes: true,
      attributeFilter: ['style']
    });
  }

  private setupDragging(): void {
    if (!this.titleBar) return;

    this.titleBar.style.cursor = 'move';

    const onMouseDown = (e: MouseEvent) => {
      // Ignore if clicking on buttons or other interactive elements
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input') || target.closest('select')) {
        return;
      }

      this.isDragging = true;
      this.dragStartX = e.clientX - this.state.x;
      this.dragStartY = e.clientY - this.state.y;

      this.element.classList.add(WM_DRAGGING_CLASS);
      document.body.style.userSelect = 'none';

      e.preventDefault();
    };

    this.titleBar.addEventListener('mousedown', onMouseDown);
  }

  private setupResizing(): void {
    // Create resize handles for all 8 directions
    const directions = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

    directions.forEach(dir => {
      const handle = document.createElement('div');
      handle.className = `wm-resize-handle wm-resize-${dir}`;
      handle.dataset.direction = dir;

      handle.addEventListener('mousedown', (e) => {
        this.startResize(e, dir);
      });

      this.element.appendChild(handle);
      this.resizeHandles.push(handle);
    });
  }

  private setupFocusManagement(): void {
    this.element.addEventListener('mousedown', () => {
      this.focus();
    });
  }

  private startResize(e: MouseEvent, direction: string): void {
    this.isResizing = true;
    this.resizeDirection = direction;
    this.resizeStartX = e.clientX;
    this.resizeStartY = e.clientY;
    this.resizeStartWidth = this.state.width;
    this.resizeStartHeight = this.state.height;

    this.element.classList.add(WM_RESIZING_CLASS);
    document.body.style.userSelect = 'none';

    e.preventDefault();
    e.stopPropagation();
  }

  public handleMouseMove(e: MouseEvent): void {
    if (this.isDragging) {
      this.handleDrag(e);
    } else if (this.isResizing) {
      this.handleResize(e);
    }
  }

  private handleDrag(e: MouseEvent): void {
    let newX = e.clientX - this.dragStartX;
    let newY = e.clientY - this.dragStartY;

    // Apply boundary constraints
    const bounds = this.manager.getBoundaryConstraints();
    const rect = this.element.getBoundingClientRect();

    newX = Math.max(bounds.left, Math.min(newX, bounds.right - rect.width));
    newY = Math.max(bounds.top, Math.min(newY, bounds.bottom - rect.height));

    this.state.x = newX;
    this.state.y = newY;

    this.applyPosition();

    if (this.config.onMove) {
      this.config.onMove(this, newX, newY);
    }
  }

  private handleResize(e: MouseEvent): void {
    const deltaX = e.clientX - this.resizeStartX;
    const deltaY = e.clientY - this.resizeStartY;

    // Apply min/max constraints - enforce absolute minimum of 100x100
    const minWidth = Math.max(100, this.config.minWidth ?? 200);
    const minHeight = Math.max(100, this.config.minHeight ?? 100);
    const maxWidth = this.config.maxWidth ?? Infinity;
    const maxHeight = this.config.maxHeight ?? Infinity;

    let newWidth = this.state.width;
    let newHeight = this.state.height;
    let newX = this.state.x;
    let newY = this.state.y;

    // Store original position for comparison
    const originalX = this.state.x;
    const originalY = this.state.y;
    const originalWidth = this.state.width;
    const originalHeight = this.state.height;

    // Calculate new dimensions and positions based on resize direction
    if (this.resizeDirection.includes('e')) {
      // Resize from east (right edge)
      newWidth = Math.max(minWidth, Math.min(this.resizeStartWidth + deltaX, maxWidth));
    }

    if (this.resizeDirection.includes('w')) {
      // Resize from west (left edge)
      const proposedWidth = this.resizeStartWidth - deltaX;
      newWidth = Math.max(minWidth, Math.min(proposedWidth, maxWidth));
      // Adjust x position: move left edge, keeping right edge fixed
      newX = originalX + (originalWidth - newWidth);
    }

    if (this.resizeDirection.includes('s')) {
      // Resize from south (bottom edge)
      newHeight = Math.max(minHeight, Math.min(this.resizeStartHeight + deltaY, maxHeight));
    }

    if (this.resizeDirection.includes('n')) {
      // Resize from north (top edge)
      const proposedHeight = this.resizeStartHeight - deltaY;
      newHeight = Math.max(minHeight, Math.min(proposedHeight, maxHeight));
      // Adjust y position: move top edge, keeping bottom edge fixed
      newY = originalY + (originalHeight - newHeight);
    }

    // Apply boundary constraints to prevent window from going off screen
    const bounds = this.manager.getBoundaryConstraints();

    // Ensure window stays within bounds
    const maxRight = bounds.right - newWidth;
    const maxBottom = bounds.bottom - newHeight;

    newX = Math.max(bounds.left, Math.min(newX, maxRight));
    newY = Math.max(bounds.top, Math.min(newY, maxBottom));

    // Update state
    this.state.x = newX;
    this.state.y = newY;
    this.state.width = newWidth;
    this.state.height = newHeight;

    this.applyState();

    if (this.config.onResize) {
      this.config.onResize(this, this.state.width, this.state.height);
    }
  }

  public handleMouseUp(): void {
    if (this.isDragging || this.isResizing) {
      this.isDragging = false;
      this.isResizing = false;
      this.element.classList.remove(WM_DRAGGING_CLASS, WM_RESIZING_CLASS);
      document.body.style.userSelect = '';

      // Save state to localStorage
      this.saveState();
    }
  }

  public focus(): void {
    const newZIndex = this.manager.getNextZIndex();
    if (newZIndex !== this.state.zIndex) {
      this.state.zIndex = newZIndex;
      this.element.style.zIndex = String(this.state.zIndex);

      if (this.config.onFocus) {
        this.config.onFocus(this);
      }
    }
  }

  private applyState(): void {
    this.applyPosition();
    this.applySize();
    this.element.style.zIndex = String(this.state.zIndex);
  }

  private applyPosition(): void {
    this.element.style.left = `${this.state.x}px`;
    this.element.style.top = `${this.state.y}px`;
  }

  private applySize(): void {
    this.element.style.width = `${this.state.width}px`;
    this.element.style.height = `${this.state.height}px`;
  }

  public setPosition(x: number, y: number): void {
    this.state.x = x;
    this.state.y = y;
    this.applyPosition();
    this.saveState();
  }

  public setSize(width: number, height: number): void {
    this.state.width = width;
    this.state.height = height;
    this.applySize();
    this.saveState();
  }

  public getState(): WindowState {
    return { ...this.state };
  }

  private saveState(): void {
    if (this.config.storageKey && typeof window !== 'undefined' && window.localStorage) {
      const state = {
        x: this.state.x,
        y: this.state.y,
        width: this.state.width,
        height: this.state.height
      };
      window.localStorage.setItem(this.config.storageKey, JSON.stringify(state));
    }
  }

  private loadState(): void {
    if (this.config.storageKey && typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(this.config.storageKey);
      if (saved) {
        try {
          const state = JSON.parse(saved);
          this.state.x = state.x ?? this.state.x;
          this.state.y = state.y ?? this.state.y;
          this.state.width = state.width ?? this.state.width;
          this.state.height = state.height ?? this.state.height;
        } catch (e) {
          console.warn(`Failed to load window state for ${this.id}:`, e);
        }
      }
    }
  }

  public show(): void {
    this.element.style.display = 'block';
    this.applyState();
    this.focus();
  }

  public hide(): void {
    this.element.style.display = 'none';
  }

  public close(): void {
    this.hide();
    if (this.config.onClose) {
      this.config.onClose(this);
    }
  }

  public destroy(): void {
    // Remove resize handles
    this.resizeHandles.forEach(handle => handle.remove());
    this.resizeHandles = [];

    // Remove classes
    this.element.classList.remove(WM_WINDOW_CLASS, WM_DRAGGING_CLASS, WM_RESIZING_CLASS);

    // Clear styles
    this.element.style.position = '';
    this.element.style.left = '';
    this.element.style.top = '';
    this.element.style.width = '';
    this.element.style.height = '';
    this.element.style.zIndex = '';

    if (this.titleBar) {
      this.titleBar.style.cursor = '';
    }
  }
}

export class WindowManager {
  private windows: Map<string, ManagedWindow> = new Map();
  private baseZIndex = 21; // Start above regular panels
  private currentMaxZIndex = 21;
  private boundaryConstraints = {
    top: 40, // Account for navbar
    left: 0,
    right: window.innerWidth,
    bottom: window.innerHeight
  };

  constructor() {
    this.setupGlobalListeners();
    this.updateBoundaries();
  }

  private setupGlobalListeners(): void {
    // Global mouse move for drag and resize
    document.addEventListener('mousemove', (e) => {
      this.windows.forEach(win => win.handleMouseMove(e));
    });

    // Global mouse up to stop drag and resize
    document.addEventListener('mouseup', () => {
      this.windows.forEach(win => win.handleMouseUp());
    });

    // Update boundaries on window resize
    window.addEventListener('resize', () => {
      this.updateBoundaries();
    });
  }

  private updateBoundaries(): void {
    this.boundaryConstraints = {
      top: 40, // Account for navbar height
      left: 0,
      right: window.innerWidth,
      bottom: window.innerHeight
    };
  }

  public getBoundaryConstraints() {
    return { ...this.boundaryConstraints };
  }

  public getNextZIndex(): number {
    this.currentMaxZIndex++;
    return this.currentMaxZIndex;
  }

  public register(element: HTMLElement, config: WindowConfig): ManagedWindow {
    // Check if already registered
    if (this.windows.has(config.id)) {
      console.warn(`Window ${config.id} is already registered`);
      return this.windows.get(config.id)!;
    }

    const win = new ManagedWindow(element, config, this);
    this.windows.set(config.id, win);

    return win;
  }

  public unregister(id: string): void {
    const win = this.windows.get(id);
    if (win) {
      win.destroy();
      this.windows.delete(id);
    }
  }

  public get(id: string): ManagedWindow | undefined {
    return this.windows.get(id);
  }

  public getAll(): ManagedWindow[] {
    return Array.from(this.windows.values());
  }

  public focusWindow(id: string): void {
    const win = this.windows.get(id);
    if (win) {
      win.focus();
    }
  }

  public closeAll(): void {
    this.windows.forEach(win => win.close());
  }

  public destroyAll(): void {
    this.windows.forEach(win => win.destroy());
    this.windows.clear();
    this.currentMaxZIndex = this.baseZIndex;
  }
}

// Export singleton instance
export const windowManager = new WindowManager();
