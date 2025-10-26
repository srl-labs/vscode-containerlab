// managerGridGuide.ts
// Centralized grid manager for TopoViewer's Cytoscape canvas.
// Consolidates:
//  - Overlay grid drawing (previously in TopologyWebviewController)
//  - cytoscape-grid-guide plugin configuration (previously in utilities/gridGuide)
//
// Traceability notes:
//  - Overlay implementation adapted from TopologyWebviewController (methods: setupPersistentGrid, drawGridOverlay, etc.)
//  - Plugin options adapted from utilities/gridGuide.ts (buildGridGuideOptions)

import type cytoscape from 'cytoscape';
import { log } from '../logging/logger';

export type Theme = 'light' | 'dark';

const LIGHT_GRID_RGBA = 'rgba(204,204,204,0.58)';
const DARK_GRID_RGBA = 'rgba(102,102,102,0.58)';

export class ManagerGridGuide {
  private cy: cytoscape.Core;
  // Overlay state
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  private overlayNeedsRedraw = false;
  private overlayObserver?: MutationObserver;

  // Unified configuration
  private spacing = 14; // unified grid spacing (px)
  private lineWidth = 0.5; // default grid line width; adjustable via UI
  private color: string = LIGHT_GRID_RGBA; // updated by theme

  // Bound handlers for add/remove
  private readonly onPanZoom = () => this.requestRedraw();
  private readonly onRender = () => this.requestRedraw();
  private readonly onResize = () => this.handleResize();

  constructor(cy: cytoscape.Core) {
    this.cy = cy;
  }

  public initialize(theme: Theme): void {
    this.updateTheme(theme);
    this.createOverlay();
    this.applyPluginOptions(theme, { drawGrid: false, snapToGridOnRelease: false, snapToAlignmentLocationOnRelease: false });
  }

  public updateTheme(theme: Theme): void {
    this.color = theme === 'dark' ? DARK_GRID_RGBA : LIGHT_GRID_RGBA;
    this.requestRedraw();
    // Update plugin colors as well (mainly guidelines)
    this.applyPluginOptions(theme, { /* keep snapping state as-is */ });
  }

  public setSpacing(spacing: number): void {
    if (spacing > 0) this.spacing = spacing;
    this.requestRedraw();
    // Keep plugin spacing consistent
    this.applyPluginOptions(this.getCurrentTheme(), {});
  }

  // Allow runtime configuration of grid line width via UI controls
  public setLineWidth(width: number): void {
    const w = Number(width);
    if (!Number.isFinite(w)) return;
    // Clamp to a sensible range for visibility
    const clamped = Math.max(0.1, Math.min(w, 2));
    this.lineWidth = clamped;
    this.requestRedraw();
    this.applyPluginOptions(this.getCurrentTheme(), {});
  }

  public enableSnapping(enabled: boolean): void {
    this.applyPluginOptions(this.getCurrentTheme(), {
      snapToGridOnRelease: enabled,
      snapToAlignmentLocationOnRelease: enabled,
      snapToGridCenter: enabled,
      zoomDash: true,
      panGrid: true,
    });
  }

  private getCurrentTheme(): Theme {
    const cls = document.body?.classList;
    const isDark = !!(cls && (cls.contains('vscode-dark') || cls.contains('vscode-high-contrast')));
    return isDark ? 'dark' as Theme : 'light' as Theme;
  }

  public requestRedraw(): void {
    if (!this.overlayCanvas || !this.overlayCtx) return;
    if (this.overlayCanvas.style.display === 'none') return;
    if (this.overlayNeedsRedraw) return;
    this.overlayNeedsRedraw = true;
    window.requestAnimationFrame(() => {
      this.overlayNeedsRedraw = false;
      this.drawOverlay();
    });
  }

  public dispose(): void {
    try {
      this.cy.off('pan', this.onPanZoom);
      this.cy.off('zoom', this.onPanZoom);
      this.cy.off('render', this.onRender);
      this.cy.off('resize', this.onResize);
      window.removeEventListener('resize', this.onResize);
      if (this.overlayObserver) this.overlayObserver.disconnect();
      if (this.overlayCanvas && this.overlayCanvas.parentElement) {
        this.overlayCanvas.parentElement.removeChild(this.overlayCanvas);
      }
    } catch (e) {
      log.warn(`GridManager dispose error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.overlayCanvas = null;
      this.overlayCtx = null;
    }
  }

  private createOverlay(): void {
    const container = this.cy.container() as HTMLElement | null;
    if (!container) return;
    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    const canvas = document.createElement('canvas');
    canvas.classList.add('topoviewer-grid-overlay');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '-1';
    canvas.style.pointerEvents = 'none';
    container.insertBefore(canvas, container.firstChild ?? null);
    this.overlayCanvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      log.warn('GridManager: unable to acquire canvas context');
      return;
    }
    this.overlayCtx = ctx;

    // Wire events for redraw
    this.cy.on('pan', this.onPanZoom);
    this.cy.on('zoom', this.onPanZoom);
    this.cy.on('render', this.onRender);
    this.cy.on('resize', this.onResize);
    window.addEventListener('resize', this.onResize, { passive: true });

    // Hide overlay when Leaflet map is active (matches legacy behavior)
    this.overlayObserver = new MutationObserver(() => {
      const hidden = container.classList.contains('leaflet-active');
      if (this.overlayCanvas) {
        this.overlayCanvas.style.display = hidden ? 'none' : 'block';
        if (!hidden) this.requestRedraw();
      }
    });
    this.overlayObserver.observe(container, { attributes: true, attributeFilter: ['class'] });

    this.handleResize();
    this.requestRedraw();
  }

  private handleResize(): void {
    if (!this.overlayCanvas) return;
    const container = this.cy.container() as HTMLElement | null;
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.round(width * ratio));
    const targetHeight = Math.max(1, Math.round(height * ratio));
    if (this.overlayCanvas.width !== targetWidth) this.overlayCanvas.width = targetWidth;
    if (this.overlayCanvas.height !== targetHeight) this.overlayCanvas.height = targetHeight;
    this.overlayCanvas.style.width = `${width}px`;
    this.overlayCanvas.style.height = `${height}px`;
  }

  private drawOverlay(): void {
    const canvas = this.overlayCanvas;
    const ctx = this.overlayCtx;
    if (!canvas || !ctx) return;
    const container = this.cy.container() as HTMLElement | null;
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    this.handleResize();
    const ratio = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const zoom = this.cy.zoom();
    const spacingRaw = this.spacing * zoom;
    const spacing = spacingRaw > 0 ? spacingRaw : this.spacing;
    const pan = this.cy.pan();
    const offsetX = ((pan.x % spacing) + spacing) % spacing;
    const offsetY = ((pan.y % spacing) + spacing) % spacing;

    ctx.beginPath();
    for (let x = offsetX; x <= width + spacing; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = offsetY; y <= height + spacing; y += spacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  // Build and apply plugin options (consolidated from utilities/gridGuide.ts)
  private applyPluginOptions(theme: Theme, overrides: Record<string, any>): void {
    const cyAny = this.cy as any;
    if (typeof cyAny.gridGuide !== 'function') return;
    const base: Record<string, any> = {
      snapToGridOnRelease: true,
      snapToGridDuringDrag: false,
      snapToAlignmentLocationOnRelease: true,
      snapToAlignmentLocationDuringDrag: false,
      distributionGuidelines: false,
      geometricGuideline: false,
      initPosAlignment: false,
      centerToEdgeAlignment: false,
      resize: false,
      parentPadding: false,
      drawGrid: false, // overlay handles visuals
      gridSpacing: this.spacing,
      snapToGridCenter: true,
      zoomDash: true,
      panGrid: true,
      gridStackOrder: -1,
      lineWidth: this.lineWidth,
      guidelinesStackOrder: 4,
      guidelinesTolerance: 2.0,
      guidelinesStyle: {
        strokeStyle: '#8b7d6b',
        geometricGuidelineRange: 400,
        range: 100,
        minDistRange: 10,
        distGuidelineOffset: 10,
        horizontalDistColor: '#ff0000',
        verticalDistColor: '#00ff00',
        initPosAlignmentColor: '#0000ff',
        lineDash: [0, 0],
        horizontalDistLine: [0, 0],
        verticalDistLine: [0, 0],
        initPosAlignmentLine: [0, 0],
      },
    };
    const gridColor = theme === 'dark' ? DARK_GRID_RGBA : LIGHT_GRID_RGBA;
    const merged: Record<string, any> = {
      ...base,
      ...overrides,
      gridColor,
      guidelinesStyle: {
        ...base.guidelinesStyle,
        ...(overrides.guidelinesStyle || {}),
      },
    };
    try {
      cyAny.gridGuide(merged);
    } catch (e) {
      log.warn(`GridManager plugin apply failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
