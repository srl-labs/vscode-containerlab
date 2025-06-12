import cytoscape from 'cytoscape';
import loadCytoStyle from './managerCytoscapeStyle';

/**
 * Layout manager handling various Cytoscape layouts.
 *
 * These properties mirror globals used in the JavaScript version but are kept
 * here so other classes (e.g. `TopoViewerEditorEngine`) can access and modify
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
  public isVscodeDeployment: boolean = (window as any).isVscodeDeployment;
  /** Force a specific Cytoscape theme (light or dark) while active */
  public geoTheme: 'light' | 'dark' | null = null;
  /** Helper to get the Cytoscape instance from the engine */
  private getCy(): cytoscape.Core | undefined {
    return (window as any).topoViewerEditorEngine?.cy as cytoscape.Core | undefined;
  }

  /** Track whether node/edge styles have been scaled for Geo layout */
  private geoScaleApplied = false;
  /** Base zoom level when Geo map is initialised */
  private geoScaleBaseZoom = 1;
  /** Default scale factor applied at the base zoom level */
  private geoScaleFactor = 4;
  /** Last scale factor applied to elements */
  private lastGeoScale = this.geoScaleFactor;
  /** Cached zoom handler so it can be removed */
  private onLeafletZoomBound = () => {
    if (this.zoomRaf !== null) window.cancelAnimationFrame(this.zoomRaf);
    this.zoomRaf = window.requestAnimationFrame(() => {
      const factor = this.calculateGeoScale();
      this.applyGeoScale(true, factor);
      console.debug('[GeoScale] zoom factor', factor, 'zoom', this.cytoscapeLeafletMap?.getZoom());
      this.zoomRaf = null;
    });
  };

  /** Zoom end handler to ensure scaling persists once zooming stops */
  private onLeafletZoomEndBound = () => {
    if (this.zoomEndTimeout !== null) window.clearTimeout(this.zoomEndTimeout);
    this.zoomEndTimeout = window.setTimeout(() => {
      const factor = this.calculateGeoScale();
      this.applyGeoScale(true, factor);
      console.debug('[GeoScale] zoomend factor', factor, 'zoom', this.cytoscapeLeafletMap?.getZoom());
      this.zoomEndTimeout = null;
    }, 300);
  };

  /** Handler to ensure scaling persists after Cytoscape renders */
  private onCyRenderBound = () => {
    if (!this.isGeoMapInitialized) return;
    const factor = this.calculateGeoScale();
    if (Math.abs(factor - this.lastGeoScale) > 0.001) {
      console.debug('[GeoScale] render factor', factor);
      this.applyGeoScale(true, factor);
    }
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

  /**
   * Increase node, label and edge sizes fourfold when the Geo map is active.
   * Original styles are restored when the map is disabled.
   */
  public applyGeoScale(enable: boolean, factor: number = this.geoScaleFactor): void {
    const cy = this.getCy();
    if (!cy) return;

    console.debug('[GeoScale] apply', enable, 'factor', factor);

    if (enable) {
      cy.nodes().forEach((n) => {
        let origW = n.data('_origWidth');
        let origH = n.data('_origHeight');
        let origFont = n.data('_origFont');
        let origBorder = n.data('_origBorderWidth');
        if (origW === undefined) {
          origW = n.width();
          n.data('_origWidth', origW);
        }
        if (origH === undefined) {
          origH = n.height();
          n.data('_origHeight', origH);
        }
        if (origFont === undefined) {
          const fs = parseFloat(n.style('font-size'));
          origFont = isNaN(fs) ? 0 : fs;
          n.data('_origFont', origFont);
        }
        if (origBorder === undefined && n.data('topoViewerRole') === 'group') {
          const bw = parseFloat(n.style('border-width'));
          origBorder = isNaN(bw) ? 0 : bw;
          n.data('_origBorderWidth', origBorder);
        }
        n.style({
          width: origW * factor,
          height: origH * factor,
          'font-size': origFont ? `${origFont * factor}px` : n.style('font-size')
        });
        if (n.data('topoViewerRole') === 'group' && origBorder !== undefined) {
          n.style('border-width', origBorder * factor);
        }
      });
      cy.edges().forEach((e) => {
        let origWidth = e.data('_origWidth');
        let origFont = e.data('_origFont');
        let origArrow = e.data('_origArrow');
        if (origWidth === undefined) {
          const width = parseFloat(e.style('width'));
          origWidth = isNaN(width) ? 0 : width;
          e.data('_origWidth', origWidth);
        }
        if (origFont === undefined) {
          const fs = parseFloat(e.style('font-size'));
          origFont = isNaN(fs) ? 0 : fs;
          e.data('_origFont', origFont);
        }
        if (origArrow === undefined) {
          const arrow = parseFloat(e.style('arrow-scale'));
          origArrow = isNaN(arrow) ? 0 : arrow;
          e.data('_origArrow', origArrow);
        }
        e.style({
          width: origWidth ? origWidth * factor : e.style('width'),
          'font-size': origFont ? `${origFont * factor}px` : e.style('font-size'),
          'arrow-scale': origArrow ? origArrow * factor : e.style('arrow-scale')
        });
      });
      this.geoScaleApplied = true;
      this.lastGeoScale = factor;
    } else if (!enable && this.geoScaleApplied) {
      cy.nodes().forEach((n) => {
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
      });
      cy.edges().forEach((e) => {
        const w = e.data('_origWidth');
        const fs = e.data('_origFont');
        const ar = e.data('_origArrow');
        if (w !== undefined) e.style('width', w);
        if (fs !== undefined && fs !== 0) e.style('font-size', `${fs}px`);
        if (ar !== undefined) e.style('arrow-scale', ar);
        e.removeData('_origWidth');
        e.removeData('_origFont');
        e.removeData('_origArrow');
      });
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
    (cy as any).gridGuide({
      drawGrid: false,
      snapToGridOnRelease: false,
      snapToGridDuringDrag: false,
      snapToAlignmentLocationOnRelease: false,
      snapToAlignmentLocationDuringDrag: false
    });
  }

  /** Re-enable grid guide overlay and snapping */
  private enableGridGuide(): void {
    const cy = this.getCy();
    if (!cy || typeof (cy as any).gridGuide !== 'function') return;
    (cy as any).gridGuide({
      drawGrid: true,
      snapToGridOnRelease: true,
      snapToGridDuringDrag: false,
      snapToAlignmentLocationOnRelease: true,
      snapToAlignmentLocationDuringDrag: false
    });
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

    const DEFAULT_AVERAGE_LAT = 48.684826888402256;
    const DEFAULT_AVERAGE_LNG = 9.007895390625677;

    const existingLats: number[] = [];
    const existingLngs: number[] = [];

    cy.nodes().forEach(node => {
      const lat = parseFloat(node.data('lat'));
      if (!isNaN(lat)) existingLats.push(lat);

      const lng = parseFloat(node.data('lng'));
      if (!isNaN(lng)) existingLngs.push(lng);
    });

    let averageLat = existingLats.length > 0
      ? existingLats.reduce((a, b) => a + b, 0) / existingLats.length
      : DEFAULT_AVERAGE_LAT;
    let averageLng = existingLngs.length > 0
      ? existingLngs.reduce((a, b) => a + b, 0) / existingLngs.length
      : DEFAULT_AVERAGE_LNG;

    const useDefaultLat = existingLats.length === 0;
    const useDefaultLng = existingLngs.length === 0;

    cy.nodes().forEach(node => {
      let lat = parseFloat(node.data('lat'));
      if (!node.data('lat') || isNaN(lat)) {
        lat = (useDefaultLat ? DEFAULT_AVERAGE_LAT : averageLat) + Math.random() * 0.9;
      }
      let lng = parseFloat(node.data('lng'));
      if (!node.data('lng') || isNaN(lng)) {
        lng = (useDefaultLng ? DEFAULT_AVERAGE_LNG : averageLng) + Math.random() * 0.9;
      }

      const latStr = lat.toFixed(15);
      const lngStr = lng.toFixed(15);
      node.data('lat', latStr);
      node.data('lng', lngStr);

      const labels = (node.data('extraData')?.labels ?? {}) as Record<string, string>;
      labels['graph-geoCoordinateLat'] = latStr;
      labels['graph-geoCoordinateLng'] = lngStr;
      if (node.data('extraData')) {
        (node.data('extraData') as any).labels = labels;
      }
    });
  }

  /** Shows only the given element id among all viewport drawers */
  private showDrawer(id: string): void {
    const drawers = document.getElementsByClassName('viewport-drawer');
    for (let i = 0; i < drawers.length; i++) {
      (drawers[i] as HTMLElement).style.display = 'none';
    }
    const el = document.getElementById(id);
    if (el) {
      (el as HTMLElement).style.display = 'block';
    }
  }

  public viewportButtonsLayoutAlgo(): void {
    this.showDrawer('viewport-drawer-layout');
  }

  public layoutAlgoChange(): void {
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
    if (el) (el as HTMLElement).style.display = 'block';
  }

  public viewportDrawerLayoutGeoMap(): void {
    const cy = this.getCy();
    if (!cy) return;

    this.viewportDrawerDisableGeoMap();

    // Store current positions so they can be restored when Geo layout is disabled
    cy.nodes().forEach((node) => {
      node.data('_origPosX', node.position('x'));
      node.data('_origPosY', node.position('y'));
    });

    // Apply light theme styles when Geo layout is active
    this.geoTheme = 'light';
    loadCytoStyle(cy, 'light');

    // Disable grid guide interactions when the map overlay is active
    this.disableGridGuide();

    if (!this.isGeoMapInitialized) {
      // Pre-compute geographic coordinates for nodes lacking them so the
      // Cytoscape-Leaflet plugin doesn't fail during initialisation.
      const cyContainer = cy.container() as HTMLElement;
      const tempDiv = document.createElement('div');
      tempDiv.style.width = `${cyContainer.clientWidth}px`;
      tempDiv.style.height = `${cyContainer.clientHeight}px`;
      document.body.appendChild(tempDiv);
      const tempMap = (window as any).L.map(tempDiv, { zoomControl: false, zoomSnap: 0 });
      tempMap.setView([43.83155486662417, -79.37278747558595], 10);
      cy.nodes().forEach((node) => {
        const data = node.data();
        if (data.lat === undefined || data.lng === undefined) {
          const latlng = tempMap.containerPointToLatLng({
            x: node.position().x,
            y: node.position().y
          });
          node.data('lat', latlng.lat.toString());
          node.data('lng', latlng.lng.toString());
          const labels = (node.data('extraData')?.labels ?? {}) as Record<string, string>;
          labels['graph-geoCoordinateLat'] = latlng.lat.toString();
          labels['graph-geoCoordinateLng'] = latlng.lng.toString();
          if (node.data('extraData')) {
            (node.data('extraData') as any).labels = labels;
          }
        }
      });
      tempMap.remove();
      tempDiv.remove();

      // Normalise or generate any still-missing coordinates
      this.assignMissingLatLng();

      let leafletContainer = document.getElementById('cy-leaflet');
      if (!leafletContainer) {
        leafletContainer = document.createElement('div');
        leafletContainer.id = 'cy-leaflet';
        const rootDiv = document.getElementById('root-div');
        if (rootDiv) {
          rootDiv.insertBefore(leafletContainer, rootDiv.firstChild);
        }
      }
      (leafletContainer as HTMLElement).style.display = 'block';
      this.cytoscapeLeafletLeaf = (cy as any).leaflet({ container: leafletContainer });
      this.cytoscapeLeafletLeaf.map.removeLayer(this.cytoscapeLeafletLeaf.defaultTileLayer);
      this.cytoscapeLeafletMap = this.cytoscapeLeafletLeaf.map;
      // add basic tile layer
      (window as any).L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(this.cytoscapeLeafletMap);

      // Patch getNodeLatLng so nodes missing coordinates return a value derived
      // from the node's current position. Updating the node data here would
      // trigger Cytoscape events and can lead to recursion inside the plugin,
      // so we only compute the coordinates without modifying the node.
      const origGetNodeLatLng = this.cytoscapeLeafletLeaf.getNodeLatLng;
      this.cytoscapeLeafletLeaf.getNodeLatLng = (n: any) => {
        const data = n.data();
        if (data.lat === undefined || data.lng === undefined) {
          const pos = n.position();
          return this.cytoscapeLeafletMap.containerPointToLatLng({
            x: pos.x,
            y: pos.y
          });
        }
        return origGetNodeLatLng.call(this.cytoscapeLeafletLeaf, n);
      };
      this.isGeoMapInitialized = true;
      this.geoScaleBaseZoom = this.cytoscapeLeafletMap.getZoom() || 1;
      this.cytoscapeLeafletMap.on('zoom', this.onLeafletZoomBound);
      this.cytoscapeLeafletMap.on('zoomend', this.onLeafletZoomEndBound);
    }

    cy.layout({
      name: 'preset',
      fit: false,
      positions: (node: cytoscape.NodeSingular) => {
        const data = node.data();
        if (data.lat === undefined || data.lng === undefined) {
          // Convert existing position to geographic coordinates so the node can
          // be mapped correctly and future layout changes preserve it.
          const latlng = this.cytoscapeLeafletMap.containerPointToLatLng({
            x: node.position().x,
            y: node.position().y
          });
          node.data('lat', latlng.lat.toString());
          node.data('lng', latlng.lng.toString());
          const labels = (node.data('extraData')?.labels ?? {}) as Record<string, string>;
          labels['graph-geoCoordinateLat'] = latlng.lat.toString();
          labels['graph-geoCoordinateLng'] = latlng.lng.toString();
          if (node.data('extraData')) {
            (node.data('extraData') as any).labels = labels;
          }
          // Use current position as no conversion is needed
          return { x: node.position().x, y: node.position().y };
        }

        const point = this.cytoscapeLeafletMap.latLngToContainerPoint([
          Number((data as any).lat),
          Number((data as any).lng)
        ]);
        return { x: point.x, y: point.y };
      }
    } as any).run();

    this.cytoscapeLeafletLeaf.fit();
    const factor = this.calculateGeoScale();
    this.applyGeoScale(true, factor);
    cy.on('add', this.onElementAddedBound);
    cy.on('render', this.onCyRenderBound);
    const geoMapButtons = document.getElementsByClassName('viewport-geo-map');
    for (let i = 0; i < geoMapButtons.length; i++) {
      geoMapButtons[i].classList.remove('is-hidden');
    }
  }

  public viewportDrawerDisableGeoMap(): void {
    const cy = this.getCy();
    if (!cy || !this.isGeoMapInitialized) return;

    // Persist node geographic coordinates before destroying the overlay
    this.updateNodeGeoCoordinates();

    // Restore original graph positions captured when Geo layout was activated
    cy.nodes().forEach((node) => {
      const x = node.data('_origPosX');
      const y = node.data('_origPosY');
      if (x !== undefined && y !== undefined) {
        node.position({ x, y });
        node.removeData('_origPosX');
        node.removeData('_origPosY');
      }
    });

    const leafletContainer = document.getElementById('cy-leaflet');
    if (leafletContainer) {
      leafletContainer.style.display = 'none';
      // Remove the container entirely to ensure a clean reinitialisation later
      if (leafletContainer.parentNode) {
        leafletContainer.parentNode.removeChild(leafletContainer);
      }
    }
    if (this.cytoscapeLeafletMap) {
      this.cytoscapeLeafletMap.off('zoom', this.onLeafletZoomBound);
      this.cytoscapeLeafletMap.off('zoomend', this.onLeafletZoomEndBound);
    }
    cy.off('add', this.onElementAddedBound);
    cy.off('render', this.onCyRenderBound);
    this.cytoscapeLeafletLeaf.destroy();
    this.cytoscapeLeafletLeaf = undefined as any;
    this.cytoscapeLeafletMap = undefined as any;
    this.geoScaleBaseZoom = 1;

    this.applyGeoScale(false);

    cy.layout({
      name: 'cola',
      nodeGap: 5,
      edgeLength: 100,
      animate: true,
      randomize: false,
      maxSimulationTime: 1500
    } as any).run();

    const overlays = document.getElementsByClassName('viewport-geo-map');
    for (let i = 0; i < overlays.length; i++) {
      if (!overlays[i].classList.contains('is-hidden')) overlays[i].classList.add('is-hidden');
    }

    this.isGeoMapInitialized = false;

    // Re-enable grid guide interactions once the map overlay is removed
    this.enableGridGuide();
    // Restore theme-based styles when leaving Geo layout
    this.geoTheme = null;
    loadCytoStyle(cy);
  }

  public viewportDrawerLayoutForceDirected(): void {
    this.viewportDrawerDisableGeoMap();
    const cy = this.getCy();
    if (!cy) return;

    const edgeLen = parseFloat((document.getElementById('force-directed-slider-link-lenght') as HTMLInputElement)?.value || '1');
    const nodeGap = parseFloat((document.getElementById('force-directed-slider-node-gap') as HTMLInputElement)?.value || '1');

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

  public viewportDrawerLayoutForceDirectedRadial(): void {
    this.viewportDrawerDisableGeoMap();
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

    const nodeGap = parseFloat((document.getElementById('vertical-layout-slider-node-v-gap') as HTMLInputElement)?.value || '1');
    const groupGap = parseFloat((document.getElementById('vertical-layout-slider-group-v-gap') as HTMLInputElement)?.value || '100');

    setTimeout(() => {
      cy.nodes().forEach((node) => {
        if (node.isParent()) {
          const children = node.children();
          const cellWidth = node.width() / children.length;
          children.forEach((child, i) => {
            child.position({ x: i * (cellWidth + nodeGap), y: 0 });
          });
        }
      });

      const sortedParents = cy.nodes().filter((n) => n.isParent()).sort((a, b) => {
        const aLevel = parseInt(a.data('extraData')?.topoViewerGroupLevel || '0', 10);
        const bLevel = parseInt(b.data('extraData')?.topoViewerGroupLevel || '0', 10);
        if (aLevel !== bLevel) return aLevel - bLevel;
        return (a.data('id') || '').localeCompare(b.data('id') || '');
      });

      let y = 0;
      let maxWidth = 0;
      cy.nodes().forEach((node) => { if (node.isParent()) maxWidth = Math.max(maxWidth, node.width()); });
      const centerX = 0;
      const divFactor = maxWidth / 2;

      sortedParents.forEach((parent) => {
        const x = centerX - parent.width() / divFactor;
        parent.position({ x, y });
        y += groupGap;
      });

      cy.fit();
    }, 100);
  }

  public viewportDrawerLayoutHorizontal(): void {
    this.viewportDrawerDisableGeoMap();
    const cy = this.getCy();
    if (!cy) return;

    const nodeGap = parseFloat((document.getElementById('horizontal-layout-slider-node-h-gap') as HTMLInputElement)?.value || '10') * 10;
    const groupGap = parseFloat((document.getElementById('horizontal-layout-slider-group-h-gap') as HTMLInputElement)?.value || '100');

    setTimeout(() => {
      cy.nodes().forEach((node) => {
        if (node.isParent()) {
          const children = node.children();
          const cellHeight = node.height() / children.length;
          children.forEach((child, i) => {
            child.position({ x: 0, y: i * (cellHeight + nodeGap) });
          });
        }
      });

      const sortedParents = cy.nodes().filter((n) => n.isParent()).sort((a, b) => {
        const aLevel = parseInt(a.data('extraData')?.topoViewerGroupLevel || '0', 10);
        const bLevel = parseInt(b.data('extraData')?.topoViewerGroupLevel || '0', 10);
        if (aLevel !== bLevel) return aLevel - bLevel;
        return (a.data('id') || '').localeCompare(b.data('id') || '');
      });

      let x = 0;
      let maxHeight = 0;
      cy.nodes().forEach((node) => { if (node.isParent()) maxHeight = Math.max(maxHeight, node.height()); });
      const centerY = 0;
      const divFactor = maxHeight / 2;

      sortedParents.forEach((parent) => {
        const y = centerY - parent.height() / divFactor;
        parent.position({ x, y });
        x += groupGap;
      });

      cy.fit();
    }, 100);
  }

  public async viewportDrawerPreset(): Promise<void> {
    // Disable any active Geo map overlay and persist coordinates
    this.viewportDrawerDisableGeoMap();
    const cy = this.getCy();
    if (!cy) return;

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
    if (!this.cytoscapeLeafletLeaf) return;
    this.cytoscapeLeafletLeaf.cy.container().style.pointerEvents = 'none';
    this.cytoscapeLeafletLeaf.setZoomControlOpacity('');
    this.cytoscapeLeafletLeaf.map.dragging.enable();
  }

  /**
   * Enables node editing mode for the GeoMap layout.
   * Pointer events are forwarded to Cytoscape while map dragging is disabled.
   */
  public viewportButtonsGeoMapEdit(): void {
    if (!this.cytoscapeLeafletLeaf) return;
    this.cytoscapeLeafletLeaf.cy.container().style.pointerEvents = '';
    this.cytoscapeLeafletLeaf.setZoomControlOpacity(0.5);
    this.cytoscapeLeafletLeaf.map.dragging.disable();
  }

  /**
   * Convert current node positions to latitude/longitude and store them
   * in node data and labels so they persist across layout changes.
   */
  public updateNodeGeoCoordinates(): void {
    const cy = this.getCy();
    if (!cy || !this.cytoscapeLeafletMap) return;

    cy.nodes().forEach((node) => {
      let lat = node.data('lat');
      let lng = node.data('lng');

      // Fallback to computing coordinates from the current position only if
      // none are stored on the node (e.g. new nodes created during Geo mode).
      if (lat === undefined || lng === undefined) {
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

      const labels = (node.data('extraData')?.labels ?? {}) as Record<string, string>;
      labels['graph-geoCoordinateLat'] = lat.toString();
      labels['graph-geoCoordinateLng'] = lng.toString();
      if (node.data('extraData')) {
        (node.data('extraData') as any).labels = labels;
      }
    });
  }
}
