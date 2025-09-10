import cytoscape from 'cytoscape';
import topoViewerState from '../state';
import { log } from '../logging/logger';
import { loadExtension } from '../cytoscapeInstanceFactory';
import { buildGridGuideOptions } from '../utilities/gridGuide';

// Common Cytoscape style keys reused in this module
const STYLE_TEXT_OUTLINE_WIDTH = 'text-outline-width' as const;
const STYLE_TEXT_BACKGROUND_PADDING = 'text-background-padding' as const;
const STYLE_SOURCE_TEXT_OFFSET = 'source-text-offset' as const;
const STYLE_TARGET_TEXT_OFFSET = 'target-text-offset' as const;
const STYLE_FONT_SIZE = 'font-size' as const;
const STYLE_BORDER_WIDTH = 'border-width' as const;
const STYLE_ARROW_SCALE = 'arrow-scale' as const;

// Common DOM class/value literals
const DISPLAY_BLOCK = 'block' as const;
const CLASS_HIDDEN = 'hidden' as const;
const CLASS_LEAFLET_ACTIVE = 'leaflet-active' as const;
const COLOR_TRANSPARENT = 'transparent' as const;
const ID_CY_LEAFLET = 'cy-leaflet' as const;
const DATA_ORIG_POS_X = '_origPosX' as const;
const DATA_ORIG_POS_Y = '_origPosY' as const;
const POS_X = 'x' as const;
const POS_Y = 'y' as const;

// Use globally registered style loader to avoid duplicating implementations
function loadCytoStyle(cy: cytoscape.Core, theme?: 'light' | 'dark'): void {
  const fn = window.loadCytoStyle;
  if (typeof fn === 'function') {
    fn(cy, theme);
  }
}

/**
 * Layout manager handling various Cytoscape layouts.
 *
 * These properties mirror globals used in the JavaScript version but are kept
 * here so other classes (e.g. `TopologyWebviewController`) can access and modify
 * them directly.
 */
export class ManagerLayoutAlgo {
  /** Flag indicating if the map overlay has been initialised. */
  public isGeoMapInitialized = false;
  /** Reference to the Leaflet map instance created by the Cytoscape plugin. */
  public cytoscapeLeafletMap: any;
  /** Reference to the Cytoscape-Leaflet plugin instance. */
  public cytoscapeLeafletLeaf: any;
  /** Whether the editor is running inside VS Code. */
  public isVscodeDeployment: boolean = window.isVscodeDeployment ?? false;
  /** Force a specific Cytoscape theme (light or dark) while active */
  public geoTheme: 'light' | 'dark' | null = null;
  /** Helper to get the Cytoscape instance from the engine or global scope */
  private getCy(): cytoscape.Core | undefined {
    return (
      (topoViewerState.editorEngine?.cy as cytoscape.Core | undefined) ||
      (topoViewerState.cy as cytoscape.Core | undefined)
    );
  }

  /** Track whether node/edge styles have been scaled for Geo layout */
  private geoScaleApplied = false;
  /** Base zoom level when Geo map is initialised */
  private geoScaleBaseZoom = 1;
  /** Default scale factor applied at the base zoom level */
  private geoScaleFactor = 4;
  /** Last scale factor applied to elements */
  private lastGeoScale = this.geoScaleFactor;
  /** Extra multiplier to make labels scale slightly larger than nodes */
  private geoLabelScaleBias = 8;
  /** Baseline text metrics captured when Geo mode starts */
  private baseNodeTextOutlineWidth = 0;
  private baseNodeTextBgPadding = 0;
  private baseEdgeTextOutlineWidth = 0;
  private baseEdgeTextBgPadding = 0;
  private baseEdgeSourceTextOffset = 0;
  private baseEdgeTargetTextOffset = 0;
  /** Cached zoom handler so it can be removed */
  private onLeafletZoomBound = () => {
    if (this.zoomRaf !== null) window.cancelAnimationFrame(this.zoomRaf);
    this.zoomRaf = window.requestAnimationFrame(() => {
      // Just handle scaling, let cytoscape-leaflet handle positions
      const factor = this.calculateGeoScale();
      this.applyGeoScale(true, factor);
      log.debug(`[GeoScale] zoom factor ${factor} zoom ${this.cytoscapeLeafletMap?.getZoom()}`);
      this.zoomRaf = null;
    });
  };

  /** Zoom end handler to ensure scaling persists once zooming stops */
  private onLeafletZoomEndBound = () => {
    if (this.zoomEndTimeout !== null) window.clearTimeout(this.zoomEndTimeout);
    this.zoomEndTimeout = window.setTimeout(() => {
      // Just handle scaling, let cytoscape-leaflet handle positions
      const factor = this.calculateGeoScale();
      this.applyGeoScale(true, factor);
      log.debug(`[GeoScale] zoomend factor ${factor} zoom ${this.cytoscapeLeafletMap?.getZoom()}`);
      this.zoomEndTimeout = null;
    }, 300);
  };

  /** Handler to ensure scaling persists after Cytoscape renders */
  private renderDebounceTimer: number | null = null;
  private onCyRenderBound = () => {
    if (!this.isGeoMapInitialized) return;

    // Debounce render events to avoid excessive reapplication
    if (this.renderDebounceTimer !== null) {
      window.clearTimeout(this.renderDebounceTimer);
    }

    this.renderDebounceTimer = window.setTimeout(() => {
      const factor = this.calculateGeoScale();
      if (Math.abs(factor - this.lastGeoScale) > 0.001) {
        log.debug(`[GeoScale] render factor ${factor}`);
        this.applyGeoScale(true, factor);
      }
      this.renderDebounceTimer = null;
    }, 50);
  };

  /** Pending animation frame reference for zoom handler */
  private zoomRaf: number | null = null;

  /** Timeout used for the zoomend handler */
  private zoomEndTimeout: number | null = null;

  /** Handler that reapplies Geo scaling when new elements are added */
  private onElementAddedBound = (evt?: any) => {
    const target = evt?.target;
    if (target && target.isNode && !target.data('_origPosX')) {
      target.data('_origPosX', target.position('x'));
      target.data('_origPosY', target.position('y'));
    }
    const factor = this.calculateGeoScale();
    this.applyGeoScale(true, factor);
  };

  private captureBaseTextMetrics(cy: cytoscape.Core): void {
    if (this.baseNodeTextOutlineWidth !== 0 || this.baseNodeTextBgPadding !== 0) {
      return;
    }

    const node: any = cy.nodes()[0];
    const edge: any = cy.edges()[0];

    const parse = (el: any, style: string, fallback: number): number => {
      if (!el) return fallback;
      const val = parseFloat(el.style(style));
      return isNaN(val) ? fallback : val;
    };

    this.baseNodeTextOutlineWidth = parse(node, STYLE_TEXT_OUTLINE_WIDTH, 0.1);
    this.baseNodeTextBgPadding = parse(node, STYLE_TEXT_BACKGROUND_PADDING, 0.1);
    this.baseEdgeTextOutlineWidth = parse(edge, STYLE_TEXT_OUTLINE_WIDTH, 0.1);
    this.baseEdgeTextBgPadding = parse(edge, STYLE_TEXT_BACKGROUND_PADDING, 0.1);
    this.baseEdgeSourceTextOffset = parse(edge, STYLE_SOURCE_TEXT_OFFSET, 0.1);
    this.baseEdgeTargetTextOffset = parse(edge, STYLE_TARGET_TEXT_OFFSET, 0.1);
  }

  private ensureNumericData(
    ele: cytoscape.NodeSingular | cytoscape.EdgeSingular,
    dataKey: string,
    styleKey: string,
    fallback = 0
  ): number {
    let val = ele.data(dataKey);
    if (val === undefined) {
      const parsed = parseFloat(ele.style(styleKey));
      val = isNaN(parsed) ? fallback : parsed;
      ele.data(dataKey, val);
    }
    return val;
  }

  private ensureFontSize(
    ele: cytoscape.NodeSingular | cytoscape.EdgeSingular,
    dataKey: string
  ): number {
    let size = ele.data(dataKey);
    if (size !== undefined) return size;

    let fsStr: any = (ele as any).renderedStyle ? (ele as any).renderedStyle(STYLE_FONT_SIZE) : ele.style(STYLE_FONT_SIZE);
    if (typeof fsStr !== 'string') fsStr = String(fsStr || '');
    let fsNum = parseFloat(fsStr);
    if (isNaN(fsNum)) {
      const raw = ele.style(STYLE_FONT_SIZE);
      const rawNum = parseFloat(raw);
      if (isNaN(rawNum)) {
        fsNum = 12;
      } else if (String(raw).includes('em')) {
        fsNum = rawNum * 16;
      } else {
        fsNum = rawNum;
      }
    }
    ele.data(dataKey, fsNum);
    return fsNum;
  }

  private scaleNode(n: cytoscape.NodeSingular, factor: number, labelFactor: number): void {
    const origW = this.ensureNumericData(n, '_origWidth', 'width');
    const origH = this.ensureNumericData(n, '_origHeight', 'height');
    const origFont = this.ensureFontSize(n, '_origFont');
    this.ensureNumericData(n, '_origTextOutlineWidth', STYLE_TEXT_OUTLINE_WIDTH);
    this.ensureNumericData(n, '_origTextBgPadding', STYLE_TEXT_BACKGROUND_PADDING);
    let origBorder: number | undefined;
    if (n.data('topoViewerRole') === 'group') {
      origBorder = this.ensureNumericData(n, '_origBorderWidth', STYLE_BORDER_WIDTH);
    }

    n.style({
      width: origW * factor,
      height: origH * factor,
      [STYLE_FONT_SIZE]: `${origFont * labelFactor}px`
    });
    if (origBorder !== undefined) {
      n.style(STYLE_BORDER_WIDTH, origBorder * factor);
    }
  }

  private scaleEdge(e: cytoscape.EdgeSingular, factor: number, labelFactor: number): void {
    const origWidth = this.ensureNumericData(e, '_origWidth', 'width');
    const origFont = this.ensureFontSize(e, '_origFont');
    const origArrow = this.ensureNumericData(e, '_origArrow', STYLE_ARROW_SCALE);
    this.ensureNumericData(e, '_origTextOutlineWidth', STYLE_TEXT_OUTLINE_WIDTH);
    this.ensureNumericData(e, '_origTextBgPadding', STYLE_TEXT_BACKGROUND_PADDING);
    this.ensureNumericData(e, '_origSourceTextOffset', STYLE_SOURCE_TEXT_OFFSET);
    this.ensureNumericData(e, '_origTargetTextOffset', STYLE_TARGET_TEXT_OFFSET);

    if (origWidth) e.style('width', origWidth * factor);
    if (origFont) e.style(STYLE_FONT_SIZE, `${origFont * labelFactor}px`);
    if (origArrow) e.style(STYLE_ARROW_SCALE, origArrow * factor);
  }

  private resetNode(n: cytoscape.NodeSingular): void {
    const w = n.data('_origWidth');
    const h = n.data('_origHeight');
    const fs = n.data('_origFont');
    const bw = n.data('_origBorderWidth');
    if (w !== undefined) n.style('width', w);
    if (h !== undefined) n.style('height', h);
    if (fs !== undefined && fs !== 0) n.style('font-size', `${fs}px`);
    if (bw !== undefined && n.data('topoViewerRole') === 'group') {
      n.style('border-width', bw);
    }
    n.removeData('_origWidth');
    n.removeData('_origHeight');
    n.removeData('_origFont');
    n.removeData('_origBorderWidth');
    n.removeData('_origTextOutlineWidth');
    n.removeData('_origTextBgPadding');
  }

  private resetEdge(e: cytoscape.EdgeSingular): void {
    const w = e.data('_origWidth');
    const fs = e.data('_origFont');
    const ar = e.data('_origArrow');
    if (w !== undefined) e.style('width', w);
    if (fs !== undefined && fs !== 0) e.style('font-size', `${fs}px`);
    if (ar !== undefined) e.style('arrow-scale', ar);
    e.removeData('_origWidth');
    e.removeData('_origFont');
    e.removeData('_origArrow');
    e.removeData('_origTextOutlineWidth');
    e.removeData('_origTextBgPadding');
    e.removeData('_origSourceTextOffset');
    e.removeData('_origTargetTextOffset');
  }

  /**
   * Increase node, label and edge sizes fourfold when the Geo map is active.
   * Original styles are restored when the map is disabled.
   */
  public applyGeoScale(enable: boolean, factor: number = this.geoScaleFactor): void {
    const cy = this.getCy();
    if (!cy) return;

    log.debug(`[GeoScale] apply ${enable} factor ${factor}`);

    const labelFactor = factor * this.geoLabelScaleBias;

    if (enable) {
      this.captureBaseTextMetrics(cy);

      cy.nodes().forEach((n) => this.scaleNode(n, factor, labelFactor));
      cy.edges().forEach((e) => this.scaleEdge(e, factor, labelFactor));

      const sty = cy.style();
      sty
        .selector('node')
        .style(STYLE_TEXT_OUTLINE_WIDTH, `${this.baseNodeTextOutlineWidth * labelFactor}px`)
        .style(STYLE_TEXT_BACKGROUND_PADDING, `${this.baseNodeTextBgPadding * labelFactor}px`);
      sty
        .selector('edge')
        .style(STYLE_TEXT_OUTLINE_WIDTH, `${this.baseEdgeTextOutlineWidth * labelFactor}px`)
        .style(STYLE_TEXT_BACKGROUND_PADDING, `${this.baseEdgeTextBgPadding * labelFactor}px`)
        .style(STYLE_SOURCE_TEXT_OFFSET, this.baseEdgeSourceTextOffset * factor)
        .style(STYLE_TARGET_TEXT_OFFSET, this.baseEdgeTargetTextOffset * factor)
        .update();

      this.geoScaleApplied = true;
      this.lastGeoScale = factor;
    } else if (this.geoScaleApplied) {
      cy.nodes().forEach((n) => this.resetNode(n));
      cy.edges().forEach((e) => this.resetEdge(e));

      const sty = cy.style();
      sty
        .selector('node')
        .style(STYLE_TEXT_OUTLINE_WIDTH, `${this.baseNodeTextOutlineWidth}px`)
        .style(STYLE_TEXT_BACKGROUND_PADDING, `${this.baseNodeTextBgPadding}px`);
      sty
        .selector('edge')
        .style(STYLE_TEXT_OUTLINE_WIDTH, `${this.baseEdgeTextOutlineWidth}px`)
        .style(STYLE_TEXT_BACKGROUND_PADDING, `${this.baseEdgeTextBgPadding}px`)
        .style(STYLE_SOURCE_TEXT_OFFSET, this.baseEdgeSourceTextOffset)
        .style(STYLE_TARGET_TEXT_OFFSET, this.baseEdgeTargetTextOffset)
        .update();

      this.baseNodeTextOutlineWidth = 0;
      this.baseNodeTextBgPadding = 0;
      this.baseEdgeTextOutlineWidth = 0;
      this.baseEdgeTextBgPadding = 0;
      this.baseEdgeSourceTextOffset = 0;
      this.baseEdgeTargetTextOffset = 0;

      this.geoScaleApplied = false;
      this.lastGeoScale = this.geoScaleFactor;
    }
  }

  /** Determine the current scale factor based on Leaflet zoom level */
  public calculateGeoScale(): number {
    if (!this.cytoscapeLeafletMap) return this.geoScaleFactor;
    const currentZoom = this.cytoscapeLeafletMap.getZoom() || this.geoScaleBaseZoom;
    if (!this.geoScaleBaseZoom) this.geoScaleBaseZoom = currentZoom;
    const zoomDiff = currentZoom - this.geoScaleBaseZoom;
    return this.geoScaleFactor * Math.pow(2, zoomDiff);
  }

  /** Disable grid guide overlay and snapping */
  private disableGridGuide(): void {
    const cy = this.getCy();
    if (!cy || typeof (cy as any).gridGuide !== 'function') return;
    const theme = (topoViewerState.editorEngine?.detectColorScheme?.() === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
    (cy as any).gridGuide(
      buildGridGuideOptions(theme, {
        drawGrid: false,
        snapToGridOnRelease: false,
        snapToAlignmentLocationOnRelease: false,
        snapToGridCenter: false,
        zoomDash: false,
        panGrid: false,
      })
    );
  }

  /** Re-enable grid guide overlay and snapping */
  private enableGridGuide(): void {
    const cy = this.getCy();
    if (!cy || typeof (cy as any).gridGuide !== 'function') return;
    const theme = (topoViewerState.editorEngine?.detectColorScheme?.() === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
    (cy as any).gridGuide(
      buildGridGuideOptions(theme, {
        drawGrid: true,
        snapToGridOnRelease: true,
        snapToAlignmentLocationOnRelease: true,
        snapToGridCenter: true,
        zoomDash: true,
        panGrid: true,
      })
    );
  }

  /**
   * Assign missing latitude and longitude values to nodes.
   *
   * This mirrors the helper used in the JavaScript version and ensures that
   * all nodes have valid geographic coordinates before Geo positioning is
   * enabled. Existing values are normalised while missing ones are generated
   * using the average of known coordinates or fall back defaults.
  */
  public assignMissingLatLng(): void {
    const cy = this.getCy();
    if (!cy) return;
    const { assignMissingLatLngToCy } = require('../utilities/geoUtils');
    assignMissingLatLngToCy(cy);
  }

  // Lat/Lng helpers moved to utilities/geoUtils

  public viewportButtonsLayoutAlgo(event?: Event): void {
    // Prevent event from bubbling up
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const layoutDrawer = document.getElementById('viewport-drawer-layout');
    if (layoutDrawer) {
      // Toggle the drawer visibility
      if (layoutDrawer.style.display === DISPLAY_BLOCK) {
        layoutDrawer.style.display = 'none';
      } else {
        // Hide all other drawers first
        const drawers = document.getElementsByClassName('viewport-drawer');
        for (let i = 0; i < drawers.length; i++) {
          (drawers[i] as HTMLElement).style.display = 'none';
        }
        // Show the layout drawer
        layoutDrawer.style.display = DISPLAY_BLOCK;
      }
    }
  }

  public layoutAlgoChange(event?: Event): void {
    // Prevent event from bubbling up
    if (event) {
      event.stopPropagation();
    }

    const select = document.getElementById('select-layout-algo') as HTMLSelectElement | null;
    if (!select) return;
    const val = select.value;
    const panels = document.getElementsByClassName('layout-algo');
    for (let i = 0; i < panels.length; i++) {
      (panels[i] as HTMLElement).style.display = 'none';
    }

    switch (val) {
      case 'Force Directed':
        this.showPanel('viewport-drawer-force-directed');
        this.showPanel('viewport-drawer-force-directed-reset-start');
        break;
      case 'Force Directed Radial':
        this.showPanel('viewport-drawer-force-directed-radial');
        this.showPanel('viewport-drawer-force-directed-radial-reset-start');
        break;
      case 'Vertical':
        this.showPanel('viewport-drawer-dc-vertical');
        this.showPanel('viewport-drawer-dc-vertical-reset-start');
        break;
      case 'Horizontal':
        this.showPanel('viewport-drawer-dc-horizontal');
        this.showPanel('viewport-drawer-dc-horizontal-reset-start');
        break;
      case 'Geo Positioning':
        this.showPanel('viewport-drawer-geo-map');
        this.showPanel('viewport-drawer-geo-map-content-01');
        this.viewportDrawerLayoutGeoMap();
        break;
      case 'Preset':
        this.viewportDrawerPreset();
        break;
    }
  }

  private showPanel(id: string): void {
    const el = document.getElementById(id);
    if (el) (el as HTMLElement).style.display = DISPLAY_BLOCK;
  }

  private async ensureLeafletExtension(): Promise<boolean> {
    try {
      await loadExtension('leaflet');
      return true;
    } catch (err) {
      log.error(`[GeoMap] Failed to load leaflet extension: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private showExistingGeoMap(): void {
    const leafletContainer = document.getElementById(ID_CY_LEAFLET);
    if (leafletContainer) {
      leafletContainer.classList.remove(CLASS_HIDDEN);
      leafletContainer.style.display = DISPLAY_BLOCK;
    }
    this.showGeoMapButtons();
  }

  private storeOriginalPositions(cy: cytoscape.Core): void {
    cy.nodes().forEach((node) => {
      node.data(DATA_ORIG_POS_X, node.position(POS_X));
      node.data(DATA_ORIG_POS_Y, node.position(POS_Y));
    });
  }

  private prepareGeoModeAppearance(cy: cytoscape.Core): void {
    this.geoTheme = 'light';
    loadCytoStyle(cy, 'light');
    cy.container()?.classList.add(CLASS_LEAFLET_ACTIVE);
    if (cy.container()) {
      (cy.container() as HTMLElement).style.background = COLOR_TRANSPARENT;
    }
    this.disableGridGuide();
  }

  private precomputeMissingNodeCoords(cy: cytoscape.Core): void {
    const cyContainer = cy.container() as HTMLElement;
    const tempDiv = document.createElement('div');
    tempDiv.style.width = `${cyContainer.clientWidth}px`;
    tempDiv.style.height = `${cyContainer.clientHeight}px`;
    document.body.appendChild(tempDiv);
    const tempMap = window.L.map(tempDiv, { zoomControl: false, zoomSnap: 0 });
    tempMap.setView([48.684826888402256, 9.007895390625677], 10);
    cy.nodes().forEach((node) => {
      const data = node.data();
      if (data.lat === undefined || data.lng === undefined || data.lat === '' || data.lng === '') {
        const latlng = tempMap.containerPointToLatLng({
          x: node.position().x,
          y: node.position().y
        });
        node.data('lat', latlng.lat.toString());
        node.data('lng', latlng.lng.toString());
      }
    });
    tempMap.remove();
    tempDiv.remove();
    this.assignMissingLatLng();
  }

  private getOrCreateLeafletContainer(): HTMLElement {
    let container = document.getElementById(ID_CY_LEAFLET);
    if (!container) {
      container = document.createElement('div');
      container.id = ID_CY_LEAFLET;
      container.className = 'absolute inset-0 pt-10 pb-0 px-10 z-0';
      const rootDiv = document.getElementById('root-div');
      if (rootDiv) {
        rootDiv.insertBefore(container, rootDiv.firstChild);
      }
    }
    container.classList.remove(CLASS_HIDDEN);
    (container as HTMLElement).style.display = DISPLAY_BLOCK;
    return container as HTMLElement;
  }

  private setupCytoscapeLeaflet(cy: cytoscape.Core, container: HTMLElement): boolean {
    try {
      const cyRect = cy.container()?.getBoundingClientRect();
      log.info({
        msg: '[GeoMap] Cytoscape container dimensions',
        width: cyRect?.width,
        height: cyRect?.height
      });
      this.cytoscapeLeafletLeaf = (cy as any).leaflet({
        container,
        cyContainer: cy.container()
      });
      if (this.cytoscapeLeafletLeaf.defaultTileLayer) {
        this.cytoscapeLeafletLeaf.map.removeLayer(this.cytoscapeLeafletLeaf.defaultTileLayer);
      }
      this.cytoscapeLeafletMap = this.cytoscapeLeafletLeaf.map;
    } catch (error) {
      log.error(`[GeoMap] Error initializing cytoscape-leaflet: ${error}`);
      return false;
    }
    if (!window.L) {
      log.error('[GeoMap] Leaflet library (L) not available');
      return false;
    }
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.cytoscapeLeafletMap);

    const origGetNodeLatLng = this.cytoscapeLeafletLeaf.getNodeLatLng;
    this.cytoscapeLeafletLeaf.getNodeLatLng = (n: any) => {
      const data = n.data();
      if (data.lat === undefined || data.lng === undefined) {
        const pos = n.position();
        return this.cytoscapeLeafletMap.containerPointToLatLng({ x: pos.x, y: pos.y });
      }
      return origGetNodeLatLng.call(this.cytoscapeLeafletLeaf, n);
    };
    this.isGeoMapInitialized = true;
    this.geoScaleBaseZoom = this.cytoscapeLeafletMap.getZoom() || 1;
    this.cytoscapeLeafletMap.on('zoom', this.onLeafletZoomBound);
    this.cytoscapeLeafletMap.on('zoomend', this.onLeafletZoomEndBound);
    return true;
  }

  private async initializeGeoMapElements(cy: cytoscape.Core): Promise<boolean> {
    this.precomputeMissingNodeCoords(cy);
    const container = this.getOrCreateLeafletContainer();
    const containerRect = container.getBoundingClientRect();
    log.info({
      msg: '[GeoMap] Leaflet container created/shown',
      width: containerRect.width,
      height: containerRect.height,
      display: (container as HTMLElement).style.display,
      className: container.className
    });
    return this.setupCytoscapeLeaflet(cy, container);
  }

  private showGeoMapButtons(): void {
    const geoMapButtons = document.getElementsByClassName('viewport-geo-map');
    for (let i = 0; i < geoMapButtons.length; i++) {
      geoMapButtons[i].classList.remove(CLASS_HIDDEN);
    }
  }

  public async viewportDrawerLayoutGeoMap(): Promise<void> {
    const cy = this.getCy();
    if (!cy) {
      log.error('[GeoMap] No cytoscape instance found');
      return;
    }

    if (!(await this.ensureLeafletExtension())) return;

    if (this.isGeoMapInitialized) {
      log.info('[GeoMap] Geo-map already initialized, ensuring visibility');
      this.showExistingGeoMap();
      return;
    }

    log.info('[GeoMap] Initializing geo-positioning layout');

    await this.viewportDrawerDisableGeoMap();
    this.storeOriginalPositions(cy);
    this.prepareGeoModeAppearance(cy);

    if (!(await this.initializeGeoMapElements(cy))) return;

    log.info('[GeoMap] Applying preset layout with geo positions');

    cy.nodes().forEach((node) => {
      const data = node.data();
      const lat = parseFloat(data.lat);
      const lng = parseFloat(data.lng);
      if (isNaN(lat) || isNaN(lng)) {
        log.warn(`[GeoMap] Node ${node.id()} missing valid geo coordinates, will use defaults`);
      } else {
        log.info(`[GeoMap] Node ${node.id()} has coordinates: lat=${lat}, lng=${lng}`);
      }
    });

    cy.layout({
      name: 'preset',
      fit: false,
      animate: false,
      positions: (node: cytoscape.NodeSingular) => {
        const data = node.data();
        const lat = parseFloat(data.lat);
        const lng = parseFloat(data.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          const point = this.cytoscapeLeafletMap.latLngToContainerPoint([lat, lng]);
          return { x: point.x, y: point.y };
        }
        log.error(`[GeoMap] Node ${node.id()} still missing geo coordinates during layout`);
        return { x: node.position().x, y: node.position().y };
      }
    } as any).run();

    log.info('[GeoMap] Layout applied, fitting map');

    setTimeout(() => {
      if (this.cytoscapeLeafletLeaf && this.cytoscapeLeafletLeaf.fit) {
        this.cytoscapeLeafletLeaf.fit();
        log.info('[GeoMap] Map fitted to nodes');
      }
      const factor = this.calculateGeoScale();
      this.applyGeoScale(true, factor);
      log.info(`[GeoMap] Scale applied with factor: ${factor}`);
    }, 100);

    cy.on('add', this.onElementAddedBound);
    cy.on('render', this.onCyRenderBound);
    this.showGeoMapButtons();

    log.info('[GeoMap] Geo-positioning layout initialization complete');
  }

  public async viewportDrawerDisableGeoMap(options?: { skipPostLayout?: boolean }): Promise<void> {
    const cy = this.getCy();
    if (!cy || !this.isGeoMapInitialized) return;

    log.info('[GeoMap] Disabling geo-positioning layout');

    // Remove the leaflet-active class and restore background
    cy.container()?.classList.remove(CLASS_LEAFLET_ACTIVE);
    if (cy.container()) {
      (cy.container() as HTMLElement).style.background = '';
    }

    // Persist node geographic coordinates before destroying the overlay
    this.updateNodeGeoCoordinates();

    this.restoreOriginalPositions(cy);
    this.hideAndRemoveLeafletContainer();
    this.removeLeafletHandlers(cy);
    this.clearRenderDebounce();

    this.cytoscapeLeafletLeaf.destroy();
    this.cytoscapeLeafletLeaf = undefined as any;
    this.cytoscapeLeafletMap = undefined as any;
    this.geoScaleBaseZoom = 1;

    this.applyGeoScale(false);

    // Optionally start a Cola layout after disabling Geo mode, unless skipped
    if (!options?.skipPostLayout) await this.runPostColaLayout(cy);

    this.hideGeoOverlays();

    this.isGeoMapInitialized = false;

    // Re-enable grid guide interactions once the map overlay is removed
    this.enableGridGuide();
    // Restore theme-based styles when leaving Geo layout
    this.geoTheme = null;
    loadCytoStyle(cy);
  }

  private restoreOriginalPositions(cy: cytoscape.Core) {
    cy.nodes().forEach((node) => {
      const x = node.data(DATA_ORIG_POS_X);
      const y = node.data(DATA_ORIG_POS_Y);
      if (x !== undefined && y !== undefined) {
        node.position({ x, y });
        node.removeData(DATA_ORIG_POS_X);
        node.removeData(DATA_ORIG_POS_Y);
      }
    });
  }

  private hideAndRemoveLeafletContainer() {
    const leafletContainer = document.getElementById(ID_CY_LEAFLET);
    if (!leafletContainer) return;
    leafletContainer.style.display = 'none';
    leafletContainer.classList.add(CLASS_HIDDEN);
    if (leafletContainer.parentNode) leafletContainer.parentNode.removeChild(leafletContainer);
  }

  private removeLeafletHandlers(cy: cytoscape.Core) {
    if (this.cytoscapeLeafletMap) {
      this.cytoscapeLeafletMap.off('zoom', this.onLeafletZoomBound);
      this.cytoscapeLeafletMap.off('zoomend', this.onLeafletZoomEndBound);
    }
    cy.off('add', this.onElementAddedBound);
    cy.off('render', this.onCyRenderBound);
  }

  private clearRenderDebounce() {
    if (this.renderDebounceTimer === null) return;
    window.clearTimeout(this.renderDebounceTimer);
    this.renderDebounceTimer = null;
  }

  private async runPostColaLayout(cy: cytoscape.Core) {
    try {
      await loadExtension('cola');
    } catch (err) {
      log.error(`[GeoMap] Failed to load cola extension: ${err instanceof Error ? err.message : String(err)}`);
    }
    cy.layout({
      name: 'cola',
      nodeGap: 5,
      edgeLength: 100,
      animate: true,
      randomize: false,
      maxSimulationTime: 1500
    } as any).run();
  }

  private hideGeoOverlays() {
    const overlays = document.getElementsByClassName('viewport-geo-map');
    for (let i = 0; i < overlays.length; i++) {
      if (!overlays[i].classList.contains(CLASS_HIDDEN)) overlays[i].classList.add(CLASS_HIDDEN);
    }
  }

  public async viewportDrawerLayoutForceDirected(): Promise<void> {
    await this.viewportDrawerDisableGeoMap();
    const cy = this.getCy();
    if (!cy) return;

    const edgeLen = parseFloat((document.getElementById('force-directed-slider-link-lenght') as HTMLInputElement)?.value || '1');
    const nodeGap = parseFloat((document.getElementById('force-directed-slider-node-gap') as HTMLInputElement)?.value || '1');

    try {
      await loadExtension('cola');
    } catch (err) {
      log.error(`[Layout] Failed to load cola extension: ${err instanceof Error ? err.message : String(err)}`);
    }

    cy.layout({
      name: 'cola',
      nodeSpacing: () => nodeGap,
      edgeLength: (edge: cytoscape.EdgeSingular) =>
        edgeLen * 100 / ((edge.data('weight') as number | undefined) || 1),
      animate: true,
      randomize: false,
      maxSimulationTime: 1500
    } as any).run();
  }

  public async viewportDrawerLayoutForceDirectedRadial(): Promise<void> {
    await this.viewportDrawerDisableGeoMap();
    const cy = this.getCy();
    if (!cy) return;

    const edgeLen = parseFloat((document.getElementById('force-directed-radial-slider-link-lenght') as HTMLInputElement)?.value || '1');
    const nodeGap = parseFloat((document.getElementById('force-directed-radial-slider-node-gap') as HTMLInputElement)?.value || '1');

    const nodeWeights: Record<string, number> = {};
    cy.nodes().forEach((node) => {
      const level = parseInt(node.data('extraData')?.labels?.TopoViewerGroupLevel || '1', 10);
      nodeWeights[node.id()] = 1 / level;
    });

    cy.edges().forEach((edge) => {
      edge.style({ 'curve-style': 'bezier', 'control-point-step-size': 20 });
    });

    try {
      await loadExtension('cola');
    } catch (err) {
      log.error(`[LayoutRadial] Failed to load cola extension: ${err instanceof Error ? err.message : String(err)}`);
    }

    cy.layout({
      name: 'cola',
      fit: true,
      nodeSpacing: nodeGap,
      edgeLength: (edge: cytoscape.EdgeSingular) => {
        const s = nodeWeights[edge.source().id()] || 1;
        const t = nodeWeights[edge.target().id()] || 1;
        return edgeLen / (s + t);
      },
      edgeSymDiffLength: 10,
      nodeDimensionsIncludeLabels: true,
      animate: true,
      maxSimulationTime: 2000,
      avoidOverlap: true
    } as any).run();
  }

  public viewportDrawerLayoutVertical(): void {
    this.viewportDrawerDisableGeoMap();
    const cy = this.getCy();
    if (!cy) return;

    const nodeGap = this.parseInputValue('vertical-layout-slider-node-v-gap', '1');
    const groupGap = this.parseInputValue('vertical-layout-slider-group-v-gap', '100');

    this.applyDrawerLayout(cy, 'vertical', nodeGap, groupGap);
  }

  public viewportDrawerLayoutHorizontal(): void {
    this.viewportDrawerDisableGeoMap();
    const cy = this.getCy();
    if (!cy) return;

    const nodeGap = this.parseInputValue('horizontal-layout-slider-node-h-gap', '10', 10);
    const groupGap = this.parseInputValue('horizontal-layout-slider-group-h-gap', '100');

    this.applyDrawerLayout(cy, 'horizontal', nodeGap, groupGap);
  }

  private parseInputValue(id: string, fallback: string, multiplier = 1): number {
    const value = (document.getElementById(id) as HTMLInputElement)?.value ?? fallback;
    return parseFloat(value || fallback) * multiplier;
  }

  private applyDrawerLayout(
    cy: cytoscape.Core,
    orientation: 'vertical' | 'horizontal',
    nodeGap: number,
    groupGap: number
  ): void {
    setTimeout(() => {
      this.positionChildren(cy, orientation, nodeGap);
      const sortedParents = this.sortParentNodes(cy);
      const maxSize = this.getMaxParentSize(cy, orientation);
      this.positionParentNodes(sortedParents, orientation, groupGap, maxSize);
      cy.fit();
    }, 100);
  }

  private positionChildren(
    cy: cytoscape.Core,
    orientation: 'vertical' | 'horizontal',
    nodeGap: number
  ): void {
    cy.nodes()
      .filter(n => n.isParent())
      .forEach(node => {
        const children = node.children();
        const cell = orientation === 'vertical'
          ? node.width() / children.length
          : node.height() / children.length;
        children.forEach((child, i) => {
          if (orientation === 'vertical') {
            child.position({ x: i * (cell + nodeGap), y: 0 });
          } else {
            child.position({ x: 0, y: i * (cell + nodeGap) });
          }
        });
      });
  }

  private sortParentNodes(cy: cytoscape.Core): cytoscape.CollectionReturnValue {
    return cy
      .nodes()
      .filter(n => n.isParent())
      .sort((a, b) => {
        const aLevel = parseInt(a.data('extraData')?.topoViewerGroupLevel || '0', 10);
        const bLevel = parseInt(b.data('extraData')?.topoViewerGroupLevel || '0', 10);
        if (aLevel !== bLevel) return aLevel - bLevel;
        return (a.data('id') || '').localeCompare(b.data('id') || '');
      });
  }

  private getMaxParentSize(
    cy: cytoscape.Core,
    orientation: 'vertical' | 'horizontal'
  ): number {
    let maxSize = 0;
    cy
      .nodes()
      .filter(n => n.isParent())
      .forEach(node => {
        const size = orientation === 'vertical' ? node.width() : node.height();
        if (size > maxSize) maxSize = size;
      });
    return maxSize;
  }

  private positionParentNodes(
    parents: cytoscape.CollectionReturnValue,
    orientation: 'vertical' | 'horizontal',
    groupGap: number,
    maxSize: number
  ): void {
    const center = 0;
    const divFactor = maxSize / 2;
    let axis = 0;
    parents.forEach(parent => {
      const pos = center - (orientation === 'vertical' ? parent.width() : parent.height()) / divFactor;
      if (orientation === 'vertical') {
        parent.position({ x: pos, y: axis });
      } else {
        parent.position({ x: axis, y: pos });
      }
      axis += groupGap;
    });
  }

  public async viewportDrawerPreset(): Promise<void> {
    // Disable any active Geo map overlay and persist coordinates
    await this.viewportDrawerDisableGeoMap({ skipPostLayout: true });
    const cy = this.getCy();
    if (!cy) return;

    // Stop any running animations/layouts (e.g., cola) to avoid overriding preset
    try { cy.stop(); } catch { /* ignore */ }

    // In the JavaScript implementation this method reloaded the topology from
    // the `dataCytoMarshall.json` file. This caused freshly calculated
    // latitude/longitude values to be lost when switching layouts.  To preserve
    // coordinates we keep the current elements and simply apply the preset
    // layout to them.

    cy.layout({ name: 'preset' } as any).run();
    cy.fit();
  }

  /**
   * Enables map panning mode when the GeoMap layout is active.
   * Nodes become non-editable and the Leaflet map receives pointer events.
   */
  public viewportButtonsGeoMapPan(): void {
    log.info('[GeoMap] Switching to pan mode');
    if (!this.cytoscapeLeafletLeaf) {
      log.error('[GeoMap] Cytoscape-leaflet not initialized');
      return;
    }
    // Switch pointer events to the map
    const cy = this.getCy();
    const container = cy?.container();
    if (container) {
      container.style.pointerEvents = 'none';
    }

    // Don't lock nodes - let the plugin update their positions based on lat/lng
    // The plugin needs to update positions as the map pans

    this.cytoscapeLeafletLeaf.setZoomControlOpacity('');
    this.cytoscapeLeafletLeaf.map.dragging.enable();
    log.info('[GeoMap] Pan mode enabled');
  }

  /**
   * Enables node editing mode for the GeoMap layout.
   * Pointer events are forwarded to Cytoscape while map dragging is disabled.
   */
  public viewportButtonsGeoMapEdit(): void {
    log.info('[GeoMap] Switching to edit mode');
    if (!this.cytoscapeLeafletLeaf) {
      log.error('[GeoMap] Cytoscape-leaflet not initialized');
      return;
    }
    // Switch pointer events back to cytoscape
    const cy = this.getCy();
    const container = cy?.container();
    if (container) {
      container.style.pointerEvents = '';
    }

    // In edit mode, nodes can be moved and their geo-position will update

    this.cytoscapeLeafletLeaf.setZoomControlOpacity(0.5);
    this.cytoscapeLeafletLeaf.map.dragging.disable();
    log.info('[GeoMap] Edit mode enabled');
  }

  /**
   * Convert current node positions to latitude/longitude and store them
   * in node data so they persist across layout changes.
   */
  public updateNodeGeoCoordinates(): void {
    const cy = this.getCy();
    if (!cy || !this.cytoscapeLeafletMap) return;

    cy.nodes().forEach((node) => {
      let lat = node.data('lat');
      let lng = node.data('lng');

      // Fallback to computing coordinates from the current position only if
      // none are stored on the node (e.g. new nodes created during Geo mode).
      if (lat === undefined || lng === undefined || lat === '' || lng === '') {
        const pos = node.position();
        const latlng = this.cytoscapeLeafletMap.containerPointToLatLng({
          x: pos.x,
          y: pos.y
        });
        lat = latlng.lat.toString();
        lng = latlng.lng.toString();
        node.data('lat', lat);
        node.data('lng', lng);
      }

    });
  }
}
