// file: LinkPanelManager.ts
// Manages the link properties panel and uPlot graphs for interface statistics

import type cytoscape from "cytoscape";
import uPlot from "uplot";
import topoViewerState from "../../app/state";

type InterfaceStatsPayload = {
  rxBps?: number;
  rxPps?: number;
  rxBytes?: number;
  rxPackets?: number;
  txBps?: number;
  txPps?: number;
  txBytes?: number;
  txPackets?: number;
  statsIntervalSeconds?: number;
};

export interface LinkPanelDependencies {
  cy: cytoscape.Core;
  getCurrentMode: () => "edit" | "view";
}

export class LinkPanelManager {
  private static readonly PANEL_LINK_ID = "panel-link" as const;
  private static readonly STYLE_LINE_COLOR = "line-color" as const;
  private static readonly MAX_GRAPH_POINTS = 60;

  private cy: cytoscape.Core;
  private deps: LinkPanelDependencies;
  private linkGraphs: { a: uPlot | null; b: uPlot | null } = { a: null, b: null };
  private linkStatsHistory: Map<
    string,
    { timestamps: number[]; rxBps: number[]; rxPps: number[]; txBps: number[]; txPps: number[] }
  > = new Map();
  private linkPanelResizeObserver: ResizeObserver | null = null;
  private currentBpsUnit: { divisor: number; label: string; shortLabel: string } = {
    divisor: 1000,
    label: "Kbps",
    shortLabel: "Kbps"
  };

  constructor(deps: LinkPanelDependencies) {
    this.cy = deps.cy;
    this.deps = deps;
  }

  public showLinkPropertiesPanel(ele: cytoscape.Singular): void {
    this.highlightLink(ele);

    const linkId = ele.id();
    const panelManager = (window as any).panelManager;
    if (panelManager) {
      const isNewInstance = !panelManager.hasPanelInstance(LinkPanelManager.PANEL_LINK_ID, linkId);

      const panelInstance = panelManager.getOrCreatePanelInstance(
        LinkPanelManager.PANEL_LINK_ID,
        linkId
      );
      if (panelInstance) {
        const source = ele.data("source");
        const target = ele.data("target");
        const titleElement = panelInstance.element.querySelector(".panel-title");
        if (titleElement) {
          titleElement.textContent = `Link: ${source} → ${target}`;
        }

        if (isNewInstance) {
          const sourceEndpoint = `a:${source} :: ${ele.data("sourceEndpoint") || ""}`;
          const targetEndpoint = `b:${target} :: ${ele.data("targetEndpoint") || ""}`;
          this.linkStatsHistory.delete(sourceEndpoint);
          this.linkStatsHistory.delete(targetEndpoint);

          panelManager.onInstanceClose(LinkPanelManager.PANEL_LINK_ID, linkId, () => {
            ele.removeStyle(LinkPanelManager.STYLE_LINE_COLOR);
          });
        }

        this.populateLinkPanel(ele, panelInstance.element);
        panelInstance.show();
        topoViewerState.selectedEdge = ele.id();
        topoViewerState.edgeClicked = true;
        this.setupLinkPanelResizeObserver();
        return;
      }
    }

    // Fallback to original behavior
    const panelLink = document.getElementById(LinkPanelManager.PANEL_LINK_ID);
    if (!panelLink) {
      return;
    }
    this.linkStatsHistory.clear();
    panelLink.style.display = "block";
    this.populateLinkPanel(ele);
    topoViewerState.selectedEdge = ele.id();
    topoViewerState.edgeClicked = true;
    this.setupLinkPanelResizeObserver();
  }

  public highlightLink(ele: cytoscape.Singular): void {
    this.cy.edges().removeStyle(LinkPanelManager.STYLE_LINE_COLOR);
    const highlightColor = this.deps.getCurrentMode() === "edit" ? "#32CD32" : "#0043BF";
    ele.style(LinkPanelManager.STYLE_LINE_COLOR, highlightColor);
  }

  public populateLinkPanel(ele: cytoscape.Singular, panelElement?: HTMLElement): void {
    const extraData = ele.data("extraData") || {};
    this.updateLinkEndpointInfo(ele, extraData, panelElement);
  }

  public refreshLinkPanelIfSelected(edge: cytoscape.Singular): void {
    if (!edge.isEdge()) {
      return;
    }

    const linkId = edge.id();
    const panelManager = (window as any).panelManager;

    if (
      panelManager &&
      panelManager.hasPanelInstance(LinkPanelManager.PANEL_LINK_ID, linkId)
    ) {
      const panelInstance = panelManager.getOrCreatePanelInstance(
        LinkPanelManager.PANEL_LINK_ID,
        linkId
      );
      if (panelInstance && panelInstance.element.style.display !== "none") {
        this.populateLinkPanel(edge, panelInstance.element);
      }
      return;
    }

    const selectedId = topoViewerState.selectedEdge;
    if (!selectedId || edge.id() !== selectedId) {
      return;
    }
    const panelLink = document.getElementById(LinkPanelManager.PANEL_LINK_ID) as HTMLElement | null;
    if (!panelLink || panelLink.style.display === "none") {
      return;
    }
    this.populateLinkPanel(edge);
  }

  private updateLinkEndpointInfo(
    ele: cytoscape.Singular,
    extraData: any,
    panelElement?: HTMLElement
  ): void {
    this.setEndpointFields(
      "a",
      {
        name: `${ele.data("source")} :: ${ele.data("sourceEndpoint") || ""}`,
        mac: extraData?.clabSourceMacAddress,
        mtu: extraData?.clabSourceMtu,
        type: extraData?.clabSourceType,
        stats: extraData?.clabSourceStats as InterfaceStatsPayload | undefined
      },
      panelElement
    );
    this.setEndpointFields(
      "b",
      {
        name: `${ele.data("target")} :: ${ele.data("targetEndpoint") || ""}`,
        mac: extraData?.clabTargetMacAddress,
        mtu: extraData?.clabTargetMtu,
        type: extraData?.clabTargetType,
        stats: extraData?.clabTargetStats as InterfaceStatsPayload | undefined
      },
      panelElement
    );
  }

  private setEndpointFields(
    letter: "a" | "b",
    data: {
      name: string;
      mac?: string;
      mtu?: string | number;
      type?: string;
      stats?: InterfaceStatsPayload;
    },
    panelElement?: HTMLElement
  ): void {
    const prefix = `panel-link-endpoint-${letter}`;
    this.setLabelText(`${prefix}-mac-address`, data.mac, "N/A", panelElement);
    this.setLabelText(`${prefix}-mtu`, data.mtu, "N/A", panelElement);
    this.setLabelText(`${prefix}-type`, data.type, "N/A", panelElement);

    this.updateTabLabel(letter, data.name, panelElement);

    const endpointKey = `${letter}:${data.name}`;
    this.initOrUpdateGraph(letter, endpointKey, data.stats, panelElement);
  }

  private updateTabLabel(endpoint: "a" | "b", name: string, panelElement?: HTMLElement): void {
    const context = panelElement || document;
    const tabButton = context.querySelector(`button.endpoint-tab[data-endpoint="${endpoint}"]`);
    if (tabButton) {
      tabButton.textContent = name || `Endpoint ${endpoint.toUpperCase()}`;
    }
  }

  private setLabelText(
    id: string,
    value: string | number | undefined,
    fallback: string,
    panelElement?: HTMLElement
  ): void {
    const context = panelElement || document;
    const el = context.querySelector(`#${id}`) as HTMLElement | null;
    if (!el) {
      const globalEl = document.getElementById(id);
      if (!globalEl) {
        return;
      }
      let text: string;
      if (value === undefined) {
        text = fallback;
      } else if (typeof value === "number") {
        text = value.toLocaleString();
      } else {
        text = value;
      }
      globalEl.textContent = text;
      return;
    }
    let text: string;
    if (value === undefined) {
      text = fallback;
    } else if (typeof value === "number") {
      text = value.toLocaleString();
    } else {
      text = value;
    }
    el.textContent = text;
  }

  private initOrUpdateGraph(
    endpoint: "a" | "b",
    endpointKey: string,
    stats: InterfaceStatsPayload | undefined,
    panelElement?: HTMLElement
  ): void {
    const context = panelElement || document;
    const containerEl =
      (context.querySelector(`#panel-link-endpoint-${endpoint}-graph`) as HTMLElement | null) ||
      document.getElementById(`panel-link-endpoint-${endpoint}-graph`);
    if (!containerEl) {
      return;
    }

    let graphInstance = (containerEl as any).__uplot_instance__;

    if (!graphInstance) {
      const rect = containerEl.getBoundingClientRect();
      const width = rect.width || 500;
      const height = (rect.height || 400) - 60;
      const emptyData: uPlot.AlignedData = [[], [], [], [], []] as unknown as uPlot.AlignedData;
      const opts = this.createGraphOptions(width, height);
      graphInstance = new uPlot(opts, emptyData, containerEl);

      (containerEl as any).__uplot_instance__ = graphInstance;

      if (!panelElement) {
        this.linkGraphs[endpoint] = graphInstance;
      }

      this.setupPanelGraphResizeObserver(panelElement, endpoint, containerEl, graphInstance);
    }

    if (stats) {
      const history = this.updateStatsHistory(endpointKey, stats);
      const data = this.prepareGraphData(history);
      graphInstance?.setData(data);

      this.updateGraphUnitLabels(graphInstance, containerEl);
    }
  }

  private updateGraphUnitLabels(graphInstance: uPlot, containerEl: HTMLElement): void {
    if (!graphInstance) return;

    const unitLabel = this.currentBpsUnit.label;

    const axisLabel = containerEl.querySelector(".u-axis.u-off1 .u-label") as HTMLElement | null;
    if (axisLabel) {
      axisLabel.textContent = unitLabel;
    }

    const legendLabels = containerEl.querySelectorAll(".u-legend .u-series td.u-label");
    legendLabels.forEach((label, index) => {
      if (index === 1) {
        label.textContent = `RX ${unitLabel}`;
      } else if (index === 2) {
        label.textContent = `TX ${unitLabel}`;
      }
    });
  }

  private setupPanelGraphResizeObserver(
    panelElement: HTMLElement | undefined,
    _endpoint: string,
    containerEl: HTMLElement,
    graphInstance: uPlot
  ): void {
    if (!panelElement) return;

    const resizeObserver = new ResizeObserver(() => {
      const rect = containerEl.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height - 60;
      if (width > 0 && height > 0) {
        graphInstance.setSize({ width, height });
        this.fixLegendDisplay(graphInstance);
      }
    });

    resizeObserver.observe(containerEl);
    (containerEl as any).__resize_observer__ = resizeObserver;
  }

  private updateStatsHistory(
    endpointKey: string,
    stats: InterfaceStatsPayload
  ): { timestamps: number[]; rxBps: number[]; rxPps: number[]; txBps: number[]; txPps: number[] } {
    let history = this.linkStatsHistory.get(endpointKey);
    if (!history) {
      history = {
        timestamps: [],
        rxBps: [],
        rxPps: [],
        txBps: [],
        txPps: []
      };
      this.linkStatsHistory.set(endpointKey, history);
    }

    const now = Date.now() / 1000;
    history.timestamps.push(now);
    history.rxBps.push(stats.rxBps ?? 0);
    history.rxPps.push(stats.rxPps ?? 0);
    history.txBps.push(stats.txBps ?? 0);
    history.txPps.push(stats.txPps ?? 0);

    if (history.timestamps.length > LinkPanelManager.MAX_GRAPH_POINTS) {
      history.timestamps.shift();
      history.rxBps.shift();
      history.rxPps.shift();
      history.txBps.shift();
      history.txPps.shift();
    }

    return history;
  }

  private determineBpsUnit(maxBps: number): { divisor: number; label: string; shortLabel: string } {
    if (maxBps >= 1_000_000_000) {
      return { divisor: 1_000_000_000, label: "Gbps", shortLabel: "Gbps" };
    } else if (maxBps >= 1_000_000) {
      return { divisor: 1_000_000, label: "Mbps", shortLabel: "Mbps" };
    } else if (maxBps >= 1_000) {
      return { divisor: 1_000, label: "Kbps", shortLabel: "Kbps" };
    } else {
      return { divisor: 1, label: "bps", shortLabel: "bps" };
    }
  }

  private prepareGraphData(history: {
    timestamps: number[];
    rxBps: number[];
    rxPps: number[];
    txBps: number[];
    txPps: number[];
  }): number[][] {
    const maxBps = Math.max(...history.rxBps, ...history.txBps, 1);

    this.currentBpsUnit = this.determineBpsUnit(maxBps);
    const { divisor } = this.currentBpsUnit;

    const rxScaled = history.rxBps.map((v) => v / divisor);
    const txScaled = history.txBps.map((v) => v / divisor);

    return [history.timestamps, rxScaled, txScaled, history.rxPps, history.txPps];
  }

  private createGraphSeries(): uPlot.Series[] {
    const formatValue = (_self: uPlot, rawValue: number | null): string => {
      return rawValue == null ? "-" : rawValue.toFixed(2);
    };

    const unitLabel = this.currentBpsUnit.label;

    return [
      {},
      {
        label: `RX ${unitLabel}`,
        stroke: "#4ec9b0",
        width: 2,
        scale: "bps",
        value: formatValue
      },
      {
        label: `TX ${unitLabel}`,
        stroke: "#569cd6",
        width: 2,
        scale: "bps",
        value: formatValue
      },
      {
        label: "RX PPS",
        stroke: "#b5cea8",
        width: 2,
        scale: "pps",
        value: formatValue
      },
      {
        label: "TX PPS",
        stroke: "#9cdcfe",
        width: 2,
        scale: "pps",
        value: formatValue
      }
    ];
  }

  private createGraphOptions(width: number, height: number = 300): uPlot.Options {
    return {
      width,
      height,
      padding: [12, 12, 12, 0],
      cursor: {
        show: true,
        x: false,
        y: false,
        points: {
          show: false
        }
      },
      series: this.createGraphSeries(),
      axes: [
        {
          scale: "x",
          show: false
        },
        {
          scale: "bps",
          side: 3,
          label: this.currentBpsUnit.label,
          labelSize: 20,
          labelFont: "12px sans-serif",
          size: 60,
          stroke: "#cccccc",
          grid: {
            show: true,
            stroke: "#3e3e42",
            width: 1
          },
          ticks: {
            show: true,
            stroke: "#3e3e42",
            width: 1
          },
          values: (_self, ticks) => ticks.map((v) => v.toFixed(1))
        },
        {
          scale: "pps",
          side: 1,
          label: "PPS",
          labelSize: 20,
          labelFont: "12px sans-serif",
          size: 60,
          stroke: "#cccccc",
          grid: {
            show: false
          },
          ticks: {
            show: true,
            stroke: "#3e3e42",
            width: 1
          },
          values: (_self, ticks) => ticks.map((v) => v.toFixed(1))
        }
      ],
      scales: {
        x: {},
        bps: {
          auto: true,
          range: (_self, dataMin, dataMax) => {
            const minRange = 10;
            const actualMax = Math.max(dataMax, minRange);
            const pad = (actualMax - dataMin) * 0.1;
            return [0, actualMax + pad];
          }
        },
        pps: {
          auto: true,
          range: (_self, dataMin, dataMax) => {
            const minRange = 10;
            const actualMax = Math.max(dataMax, minRange);
            const pad = (actualMax - dataMin) * 0.1;
            return [0, actualMax + pad];
          }
        }
      },
      legend: {
        show: true,
        live: true,
        isolate: false,
        markers: {
          show: true,
          width: 2
        },
        mount: (self, legend) => {
          self.root.appendChild(legend);
        }
      },
      hooks: this.createGraphHooks()
    };
  }

  private createGraphHooks(): uPlot.Hooks.Arrays {
    const setCursorToLatest = (u: uPlot): void => {
      if (u.data && u.data[0] && u.data[0].length > 0) {
        const lastIdx = u.data[0].length - 1;
        window.requestAnimationFrame(() => {
          u.setLegend({ idx: lastIdx });
        });
      }
    };

    const setupMouseLeaveHandler = (u: uPlot): void => {
      u.over.addEventListener("mouseleave", () => {
        setCursorToLatest(u);
      });
    };

    return {
      init: [
        (u: uPlot) => {
          this.fixLegendDisplay(u);
          setupMouseLeaveHandler(u);
          setCursorToLatest(u);
        }
      ],
      setData: [setCursorToLatest]
    };
  }

  private fixLegendDisplay(u: uPlot): void {
    window.requestAnimationFrame(() => {
      const legendEl = u.root.querySelector(".u-legend");
      if (!legendEl) {
        return;
      }

      const seriesItems = legendEl.querySelectorAll(".u-series");
      if (seriesItems && seriesItems.length > 0) {
        (seriesItems[0] as HTMLElement).style.display = "none";
      }
    });
  }

  private setupLinkPanelResizeObserver(): void {
    this.disconnectLinkPanelResizeObserver();

    const panelLink = document.getElementById(LinkPanelManager.PANEL_LINK_ID);
    if (!panelLink) {
      return;
    }

    this.linkPanelResizeObserver = new ResizeObserver(() => {
      this.resizeLinkGraphs();
    });

    this.linkPanelResizeObserver.observe(panelLink);

    window.addEventListener("link-tab-switched", () => {
      setTimeout(() => {
        this.resizeLinkGraphs();
      }, 0);
    });
  }

  private disconnectLinkPanelResizeObserver(): void {
    if (this.linkPanelResizeObserver) {
      this.linkPanelResizeObserver.disconnect();
      this.linkPanelResizeObserver = null;
    }
  }

  private resizeLinkGraphs(): void {
    if (this.linkGraphs.a) {
      const containerA = document.getElementById("panel-link-endpoint-a-graph");
      if (containerA) {
        const rect = containerA.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height - 60;
        if (width > 0 && height > 0) {
          this.linkGraphs.a.setSize({ width, height });
          this.fixLegendDisplay(this.linkGraphs.a);
        }
      }
    }

    if (this.linkGraphs.b) {
      const containerB = document.getElementById("panel-link-endpoint-b-graph");
      if (containerB) {
        const rect = containerB.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height - 60;
        if (width > 0 && height > 0) {
          this.linkGraphs.b.setSize({ width, height });
          this.fixLegendDisplay(this.linkGraphs.b);
        }
      }
    }
  }
}
