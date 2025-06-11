import cytoscape from 'cytoscape';

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
  /** Helper to get the Cytoscape instance from the engine */
  private getCy(): cytoscape.Core | undefined {
    return (window as any).topoViewerEditorEngine?.cy as cytoscape.Core | undefined;
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

    // Disable grid guide interactions when the map overlay is active
    this.disableGridGuide();

    if (!this.isGeoMapInitialized) {
      const leafletContainer = document.getElementById('cy-leaflet');
      if (leafletContainer) leafletContainer.style.display = 'block';
      this.cytoscapeLeafletLeaf = (cy as any).leaflet({ container: leafletContainer });
      this.cytoscapeLeafletLeaf.map.removeLayer(this.cytoscapeLeafletLeaf.defaultTileLayer);
      this.cytoscapeLeafletMap = this.cytoscapeLeafletLeaf.map;
      // add basic tile layer
      (window as any).L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(this.cytoscapeLeafletMap);
      this.isGeoMapInitialized = true;
    }

    cy.layout({
      name: 'preset',
      fit: false,
      positions: (node: cytoscape.NodeSingular) => {
        const data = node.data();
        const point = this.cytoscapeLeafletMap.latLngToContainerPoint([
          Number((data as any).lat),
          Number((data as any).lng)
        ]);
        return { x: point.x, y: point.y };
      }
    } as any).run();

    this.cytoscapeLeafletLeaf.fit();
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

    const leafletContainer = document.getElementById('cy-leaflet');
    if (leafletContainer) leafletContainer.style.display = 'none';
    this.cytoscapeLeafletLeaf.destroy();

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
      const pos = node.position();
      const latlng = this.cytoscapeLeafletMap.containerPointToLatLng({
        x: pos.x,
        y: pos.y
      });
      node.data('lat', latlng.lat.toString());
      node.data('lng', latlng.lng.toString());
      const labels = (node.data('extraData')?.labels ?? {}) as Record<string, string>;
      labels['graph-geoCoordinateLat'] = latlng.lat.toString();
      labels['graph-geoCoordinateLng'] = latlng.lng.toString();
      if (node.data('extraData')) {
        (node.data('extraData') as any).labels = labels;
      }
    });
  }
}
