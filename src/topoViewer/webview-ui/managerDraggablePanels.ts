// file: managerDraggablePanels.ts
// Makes overlay panels draggable within the webview.

type PanelEntry = {
  element: HTMLElement;
  dragHandle: HTMLElement | null;
  isDraggable: boolean;
};

export class ManagerDraggablePanels {
  private static panels: Map<string, PanelEntry> = new Map();
  private static isDragging = false;
  private static currentPanel: HTMLElement | null = null;
  private static startX = 0;
  private static startY = 0;
  private static initialLeft = 0;
  private static initialTop = 0;

  static init(): void {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  private static initialize(): void {
    this.initializeAllDraggablePanels();
    this.installGlobalListeners();
    this.observeDomMutations();
    this.observeUnifiedPanelLockState();
  }

  private static shouldUseSharedPosition(panelId: string): boolean {
    return panelId !== 'unified-floating-panel';
  }

  private static isUnifiedPanelLocked(): boolean {
    try {
      const savedState = window.localStorage.getItem('unifiedPanelState');
      if (savedState) {
        const state = JSON.parse(savedState);
        return !!state.locked;
      }
    } catch (e) {
      console.warn('Failed to parse unified panel state:', e);
    }
    return false;
  }

  private static loadSharedPanelPosition(): { left: number; top: number } | null {
    try {
      const savedPosition = window.localStorage.getItem('topoViewerSharedPanelPosition');
      if (savedPosition) {
        return JSON.parse(savedPosition);
      }
    } catch (e) {
      console.warn('Failed to parse saved shared panel position:', e);
    }
    return null;
  }

  private static saveSharedPanelPosition(position: { left: number; top: number }): void {
    window.localStorage.setItem('topoViewerSharedPanelPosition', JSON.stringify(position));
  }

  private static getNavbarHeight(): number {
    const navbar = document.querySelector('.navbar') as HTMLElement | null;
    return navbar ? navbar.offsetHeight : 72; // 4.5rem fallback
  }

  private static applySavedPosition(panel: HTMLElement, panelId: string): void {
    if (!this.shouldUseSharedPosition(panelId)) return;
    const saved = this.loadSharedPanelPosition();
    if (!saved) return;

    const navbarHeight = this.getNavbarHeight();
    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;
    const minTop = navbarHeight;

    const left = Math.max(0, Math.min(saved.left, maxLeft));
    const top = Math.max(minTop, Math.min(saved.top, maxTop));

    panel.style.position = 'fixed';
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
  }

  private static updateDragHandleAppearance(dragHandle: HTMLElement | null): void {
    if (!dragHandle) return;
    dragHandle.style.cursor = this.isUnifiedPanelLocked() ? 'default' : 'grab';
  }

  private static createDragHandle(panel: HTMLElement): HTMLElement {
    const existing = panel.querySelector('.panel-drag-handle') as HTMLElement | null;
    if (existing) return existing;

    const dragHandle = document.createElement('div');
    dragHandle.className = 'panel-drag-handle w-full h-[6px] bg-[var(--vscode-button-hoverBackground)] rounded-t-md cursor-grab';
    dragHandle.style.margin = '0 0 8px 0';
    panel.insertBefore(dragHandle, panel.firstChild);
    this.updateDragHandleAppearance(dragHandle);
    return dragHandle;
  }

  private static initializePanelDrag(panel: HTMLElement): void {
    const panelId = panel.id;
    const dragHandle = this.createDragHandle(panel);
    if (!dragHandle) return;

    this.panels.set(panelId, { element: panel, dragHandle, isDraggable: true });

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && (m as MutationRecord).attributeName === 'style') {
          if ((panel as HTMLElement).style.display !== 'none' && !panel.hasAttribute('data-position-applied')) {
            this.applySavedPosition(panel, panelId);
            panel.setAttribute('data-position-applied', 'true');
          }
        }
      }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['style'] });

    dragHandle.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.isUnifiedPanelLocked()) return;
      this.isDragging = true;
      this.currentPanel = panel;
      dragHandle.style.cursor = 'grabbing';
      panel.style.cursor = 'grabbing';
      const rect = panel.getBoundingClientRect();
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.initialLeft = rect.left;
      this.initialTop = rect.top;
      panel.style.position = 'fixed';
      panel.style.left = `${this.initialLeft}px`;
      panel.style.top = `${this.initialTop}px`;
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
      e.preventDefault();
      e.stopPropagation();
    });

    // No hover effects - drag handle always shows its color
  }

  private static installGlobalListeners(): void {
    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isDragging || !this.currentPanel || this.isUnifiedPanelLocked()) return;
      const deltaX = e.clientX - this.startX;
      const deltaY = e.clientY - this.startY;
      let newLeft = this.initialLeft + deltaX;
      let newTop = this.initialTop + deltaY;
      const rect = this.currentPanel.getBoundingClientRect();
      const navbarHeight = this.getNavbarHeight();
      const maxLeft = window.innerWidth - rect.width;
      const maxTop = window.innerHeight - rect.height;
      const minTop = navbarHeight;
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(minTop, Math.min(newTop, maxTop));
      this.currentPanel.style.left = `${newLeft}px`;
      this.currentPanel.style.top = `${newTop}px`;
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging && this.currentPanel) {
        this.isDragging = false;
        const handle = this.currentPanel.querySelector('.panel-drag-handle') as HTMLElement | null;
        if (handle) {
          handle.style.cursor = 'grab';
        }
        this.currentPanel.style.cursor = 'default';
        if (this.shouldUseSharedPosition(this.currentPanel.id)) {
          const rect = this.currentPanel.getBoundingClientRect();
          this.saveSharedPanelPosition({ left: rect.left, top: rect.top });
        }
        this.currentPanel = null;
      }
    });

    window.addEventListener('resize', () => {
      let sharedUpdated = false;
      this.panels.forEach((_, panelId) => {
        const panel = document.getElementById(panelId) as HTMLElement | null;
        if (panel && panel.style.display !== 'none') {
          const rect = panel.getBoundingClientRect();
          const navbarHeight = this.getNavbarHeight();
          const maxLeft = window.innerWidth - rect.width;
          const maxTop = window.innerHeight - rect.height;
          const minTop = navbarHeight;
          const newLeft = Math.max(0, Math.min(rect.left, maxLeft));
          const newTop = Math.max(minTop, Math.min(rect.top, maxTop));
          if (newLeft !== rect.left || newTop !== rect.top) {
            panel.style.left = `${newLeft}px`;
            panel.style.top = `${newTop}px`;
            if (this.shouldUseSharedPosition(panelId) && !sharedUpdated) {
              this.saveSharedPanelPosition({ left: newLeft, top: newTop });
              sharedUpdated = true;
            }
          }
        }
      });
    });

    // Prevent drag start on interactions with form controls
    document.addEventListener('mousedown', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'BUTTON' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        !!target.closest('button') ||
        !!target.closest('input') ||
        !!target.closest('.dropdown-menu') ||
        !!target.closest('.input-field')
      ) {
        return;
      }
    });
  }

  private static updateAllDragHandles(): void {
    this.panels.forEach((data) => this.updateDragHandleAppearance(data.dragHandle));
  }

  private static initializeAllDraggablePanels(): void {
    document.querySelectorAll<HTMLElement>('.draggable-panel').forEach((panel) => {
      if (!this.panels.has(panel.id)) {
        this.initializePanelDrag(panel);
      }
    });
  }

  private static observeUnifiedPanelLockState(): void {
    let last = this.isUnifiedPanelLocked();
    setInterval(() => {
      const current = this.isUnifiedPanelLocked();
      if (current !== last) {
        last = current;
        this.updateAllDragHandles();
      }
    }, 100);
  }

  private static observeDomMutations(): void {
    const observer = new MutationObserver(() => this.initializeAllDraggablePanels());
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

export default ManagerDraggablePanels;
