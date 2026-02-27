/* global describe, it */
import { expect } from "chai";
import type { Edge, Node } from "@xyflow/react";

import {
  applyGrafanaCellIdsToSvg,
  buildGrafanaDashboardJson,
  buildGrafanaPanelYaml,
  collectLinkedNodeIds,
  collectGrafanaEdgeCellMappings,
  addGrafanaTrafficLegend,
  makeGrafanaSvgResponsive,
  removeUnlinkedNodesFromSvg,
  sanitizeSvgForGrafana,
  trimGrafanaSvgToTopologyContent
} from "../../../src/reactTopoViewer/webview/components/panels/svg-export/grafanaExport";

describe("grafanaExport helpers", () => {
  const LEAF_NODE_ID = "leaf1";
  const CLIENT_NODE_ID = "client1";
  const TOPOLOGY_NODE_TYPE = "topology-node";
  const FREE_TEXT_NODE_TYPE = "free-text-node";
  const ANNOTATION_NODE_TYPES = new Set([FREE_TEXT_NODE_TYPE, "free-shape-node", "group-node"]);
  const EDGE_VALID_ID = "edge-valid";
  const EDGE_VALID_OPERSTATE_ID = "leaf1:e1-1";
  const EDGE_VALID_OPERSTATE_REVERSE_ID = "client1:eth1";
  const EDGE_VALID_TRAFFIC_ID = "link_id:leaf1:e1-1:client1:eth1";
  const EDGE_VALID_TRAFFIC_REVERSE_ID = "link_id:client1:eth1:leaf1:e1-1";

  it("collects Grafana edge mappings only for valid topology links", () => {
    const nodes = [
      { id: LEAF_NODE_ID, type: TOPOLOGY_NODE_TYPE },
      { id: CLIENT_NODE_ID, type: TOPOLOGY_NODE_TYPE },
      { id: "note1", type: FREE_TEXT_NODE_TYPE }
    ] as unknown as Node[];

    const edges = [
      {
        id: EDGE_VALID_ID,
        source: LEAF_NODE_ID,
        target: CLIENT_NODE_ID,
        data: { sourceEndpoint: "e1-1", targetEndpoint: "eth1" }
      },
      {
        id: "edge-missing-endpoint",
        source: LEAF_NODE_ID,
        target: CLIENT_NODE_ID,
        data: { sourceEndpoint: "e1-2" }
      },
      {
        id: "edge-annotation",
        source: "note1",
        target: CLIENT_NODE_ID,
        data: { sourceEndpoint: "e1-9", targetEndpoint: "eth9" }
      }
    ] as unknown as Edge[];

    const mappings = collectGrafanaEdgeCellMappings(edges, nodes, ANNOTATION_NODE_TYPES);

    expect(mappings).to.have.lengthOf(1);
    expect(mappings[0]).to.deep.include({
      edgeId: EDGE_VALID_ID,
      source: "leaf1",
      sourceEndpoint: "e1-1",
      target: "client1",
      targetEndpoint: "eth1",
      operstateCellId: EDGE_VALID_OPERSTATE_ID,
      targetOperstateCellId: EDGE_VALID_OPERSTATE_REVERSE_ID,
      trafficCellId: EDGE_VALID_TRAFFIC_ID,
      reverseTrafficCellId: EDGE_VALID_TRAFFIC_REVERSE_ID
    });
  });

  it("builds panel YAML with anchors and per-link cells", () => {
    const yaml = buildGrafanaPanelYaml([
      {
        edgeId: EDGE_VALID_ID,
        source: "leaf1",
        sourceEndpoint: "e1-1",
        target: "client1",
        targetEndpoint: "eth1",
        operstateCellId: EDGE_VALID_OPERSTATE_ID,
        targetOperstateCellId: EDGE_VALID_OPERSTATE_REVERSE_ID,
        trafficCellId: EDGE_VALID_TRAFFIC_ID,
        reverseTrafficCellId: EDGE_VALID_TRAFFIC_REVERSE_ID
      }
    ]);

    expect(yaml).to.contain("---");
    expect(yaml).to.contain("thresholds-operstate: &thresholds-operstate");
    expect(yaml).to.contain("thresholds-traffic: &thresholds-traffic");
    expect(yaml).to.contain("label-config: &label-config");
    expect(yaml).to.contain("valueMappings:");
    expect(yaml).to.contain('{ valueMax: 199999, text: "\\u200B" }');
    expect(yaml).to.not.contain("{ valueMin: 200000 }");
    expect(yaml).to.contain('"leaf1:e1-1":');
    expect(yaml).to.contain('"client1:eth1":');
    expect(yaml).to.contain('"link_id:leaf1:e1-1:client1:eth1":');
    expect(yaml).to.contain('"link_id:client1:eth1:leaf1:e1-1":');
    expect(yaml).to.contain('dataRef: "oper-state:leaf1:e1-1"');
    expect(yaml).to.contain('dataRef: "oper-state:client1:eth1"');
    expect(yaml).to.contain('dataRef: "leaf1:e1-1:out"');
    expect(yaml).to.contain('dataRef: "client1:eth1:out"');
    expect(yaml).to.contain("label: *label-config");
  });

  it("supports custom traffic thresholds in panel YAML", () => {
    const yaml = buildGrafanaPanelYaml(
      [
        {
          edgeId: EDGE_VALID_ID,
          source: "leaf1",
          sourceEndpoint: "e1-1",
          target: "client1",
          targetEndpoint: "eth1",
          operstateCellId: EDGE_VALID_OPERSTATE_ID,
          targetOperstateCellId: EDGE_VALID_OPERSTATE_REVERSE_ID,
          trafficCellId: EDGE_VALID_TRAFFIC_ID,
          reverseTrafficCellId: EDGE_VALID_TRAFFIC_REVERSE_ID
        }
      ],
      {
        trafficThresholds: {
          green: 123,
          yellow: 456,
          orange: 789,
          red: 1234
        }
      }
    );

    expect(yaml).to.contain('{ color: "green", level: 123 }');
    expect(yaml).to.contain('{ color: "yellow", level: 456 }');
    expect(yaml).to.contain('{ color: "orange", level: 789 }');
    expect(yaml).to.contain('{ color: "red", level: 1234 }');
    expect(yaml).to.contain('{ valueMax: 123, text: "\\u200B" }');
  });

  it("builds dashboard JSON with embedded panel config and SVG", () => {
    const panelConfig = "---\ncells: {}\n";
    const svg = '<svg><g id="cell-test"/></svg>';
    const json = buildGrafanaDashboardJson(panelConfig, svg, "Lab A");
    const parsed = JSON.parse(json) as {
      title: string;
      panels: Array<{
        title: string;
        options: { panelConfig: string; svg: string };
        targets: Array<{ expr: string; refId: string }>;
      }>;
    };

    expect(parsed.title).to.equal("Lab A");
    expect(parsed.panels[0].title).to.equal("Lab A");
    expect(parsed.panels[0].options.panelConfig).to.equal(panelConfig);
    expect(parsed.panels[0].options.svg).to.equal(svg);
    expect(parsed.panels[0].targets).to.have.lengthOf(3);
    expect(parsed.panels[0].targets[0]).to.deep.include({
      expr: "interface_oper_state",
      refId: "A"
    });
  });

  it("removes text-shadow filter usage for Grafana compatibility", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><filter id="text-shadow"><feGaussianBlur stdDeviation="1.5"/></filter></defs><text filter="url(#text-shadow)">n1</text></svg>';

    const sanitized = sanitizeSvgForGrafana(svg);

    expect(sanitized).to.not.contain('filter="url(#text-shadow)"');
    expect(sanitized).to.not.contain('<filter id="text-shadow"');
  });

  it("removes unlinked nodes from SVG when filtering is enabled", () => {
    const nodes = [
      { id: LEAF_NODE_ID, type: TOPOLOGY_NODE_TYPE },
      { id: CLIENT_NODE_ID, type: TOPOLOGY_NODE_TYPE },
      { id: "orphan", type: TOPOLOGY_NODE_TYPE }
    ] as unknown as Node[];

    const edges = [
      {
        id: EDGE_VALID_ID,
        source: LEAF_NODE_ID,
        target: CLIENT_NODE_ID,
        data: { sourceEndpoint: "e1-1", targetEndpoint: "eth1" }
      }
    ] as unknown as Edge[];

    const linkedNodeIds = collectLinkedNodeIds(edges, nodes, ANNOTATION_NODE_TYPES);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<g class="export-node topology-node" data-id="leaf1"></g>' +
      '<g class="export-node topology-node" data-id="client1"></g>' +
      '<g class="export-node topology-node" data-id="orphan"></g>' +
      "</svg>";

    const filtered = removeUnlinkedNodesFromSvg(svg, linkedNodeIds);

    expect(filtered).to.contain('data-id="leaf1"');
    expect(filtered).to.contain('data-id="client1"');
    expect(filtered).to.not.contain('data-id="orphan"');
  });

  it("normalizes trimmed viewBox origin while preserving topology position", () => {
    if (typeof DOMParser === "undefined") {
      return;
    }

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300">' +
      '<g transform="translate(100, 200) scale(2)">' +
      '<g class="export-edge" data-id="edge-a"><path d="M 0 0 L 100 50"/></g>' +
      "</g>" +
      "</svg>";

    const trimmed = trimGrafanaSvgToTopologyContent(svg, 0);
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, "image/svg+xml");
    const svgEl = doc.documentElement;
    const transformedRoot = svgEl.querySelector("g[transform]");

    expect(svgEl.getAttribute("viewBox")).to.equal("0 0 200 100");
    expect(svgEl.getAttribute("width")).to.equal("200");
    expect(svgEl.getAttribute("height")).to.equal("100");
    expect(transformedRoot?.getAttribute("transform")).to.equal("translate(0, 0) scale(2)");
  });

  it("offsets traffic labels to reduce overlap for nearby links", () => {
    if (typeof DOMParser === "undefined") {
      return;
    }

    const baseSvg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<g class="export-edge" data-id="edge-a"><path d="M 0 0 L 100 100"/></g>' +
      '<g class="export-edge" data-id="edge-b"><path d="M 0 0 L 100 100"/></g>' +
      "</svg>";

    const withCells = applyGrafanaCellIdsToSvg(baseSvg, [
      {
        edgeId: "edge-a",
        source: "spine1",
        sourceEndpoint: "e1-1",
        target: "leaf1",
        targetEndpoint: "e1-49",
        operstateCellId: "spine1:e1-1",
        targetOperstateCellId: "leaf1:e1-49",
        trafficCellId: "link_id:spine1:e1-1:leaf1:e1-49",
        reverseTrafficCellId: "link_id:leaf1:e1-49:spine1:e1-1"
      },
      {
        edgeId: "edge-b",
        source: "spine2",
        sourceEndpoint: "e1-2",
        target: "leaf2",
        targetEndpoint: "e1-50",
        operstateCellId: "spine2:e1-2",
        targetOperstateCellId: "leaf2:e1-50",
        trafficCellId: "link_id:spine2:e1-2:leaf2:e1-50",
        reverseTrafficCellId: "link_id:leaf2:e1-50:spine2:e1-2"
      }
    ]);

    const textCoordMatches = Array.from(
      withCells.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>([^<]+)<\/text>/g)
    );
    expect(textCoordMatches.length).to.equal(4);
    expect(textCoordMatches.every((match) => match[3] === "rate")).to.equal(true);
    const textPoints = textCoordMatches.map((match) => ({
      x: Number.parseFloat(match[1]),
      y: Number.parseFloat(match[2])
    }));
    const uniqueCoords = new Set(textCoordMatches.map((match) => `${match[1]}:${match[2]}`));

    expect(uniqueCoords.size).to.equal(textCoordMatches.length);

    // Approximate long-value bounds with ~1px gap target.
    const minDx = "775.3 Mb/s".length * 10 * 0.58 + 2;
    const minDy = 10 + 2;
    for (let i = 0; i < textPoints.length; i++) {
      for (let j = i + 1; j < textPoints.length; j++) {
        const dx = Math.abs(textPoints[i].x - textPoints[j].x);
        const dy = Math.abs(textPoints[i].y - textPoints[j].y);
        expect(dx < minDx && dy < minDy).to.equal(false);
      }
    }
  });

  it("keeps traffic labels on-link and away from node interface labels", () => {
    if (typeof DOMParser === "undefined") {
      return;
    }

    const baseSvg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<g class="export-edge" data-id="edge-a">' +
      '<path d="M 0 0 L 120 0"/>' +
      '<g class="edge-label"><circle cx="0" cy="0" r="8"/><text x="0" y="0">e1-1</text></g>' +
      '<g class="edge-label"><circle cx="120" cy="0" r="8"/><text x="120" y="0">e1-49</text></g>' +
      "</g>" +
      "</svg>";

    const withCells = applyGrafanaCellIdsToSvg(baseSvg, [
      {
        edgeId: "edge-a",
        source: "spine1",
        sourceEndpoint: "e1-1",
        target: "leaf1",
        targetEndpoint: "e1-49",
        operstateCellId: "spine1:e1-1",
        targetOperstateCellId: "leaf1:e1-49",
        trafficCellId: "link_id:spine1:e1-1:leaf1:e1-49",
        reverseTrafficCellId: "link_id:leaf1:e1-49:spine1:e1-1"
      }
    ]);

    const textCoordMatches = Array.from(
      withCells.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>([^<]+)<\/text>/g)
    ).filter((match) => match[3] === "rate");

    expect(textCoordMatches.length).to.equal(2);
    const textPoints = textCoordMatches.map((match) => ({
      x: Number.parseFloat(match[1]),
      y: Number.parseFloat(match[2])
    }));
    expect(textPoints.every((point) => Math.abs(point.y) < 0.001)).to.equal(true);
    expect(textPoints.every((point) => Math.abs(point.x - 0) > 24)).to.equal(true);
    expect(textPoints.every((point) => Math.abs(point.x - 120) > 24)).to.equal(true);
  });

  it("can export traffic rate labels as hover-only", () => {
    if (typeof DOMParser === "undefined") {
      return;
    }

    const baseSvg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<g class="export-edge" data-id="edge-a"><path d="M 0 0 L 100 0"/></g>' +
      "</svg>";

    const withCells = applyGrafanaCellIdsToSvg(
      baseSvg,
      [
        {
          edgeId: "edge-a",
          source: "spine1",
          sourceEndpoint: "e1-1",
          target: "leaf1",
          targetEndpoint: "e1-49",
          operstateCellId: "spine1:e1-1",
          targetOperstateCellId: "leaf1:e1-49",
          trafficCellId: "link_id:spine1:e1-1:leaf1:e1-49",
          reverseTrafficCellId: "link_id:leaf1:e1-49:spine1:e1-1"
        }
      ],
      { trafficRatesOnHoverOnly: true }
    );

    expect(withCells).to.contain('class="grafana-traffic-hitbox"');
    expect(withCells).to.contain('id="grafana-traffic-hover-style"');
    expect(withCells).to.contain(
      ".grafana-traffic-half > path.grafana-traffic-hitbox{fill:none;stroke:transparent !important;"
    );
    expect(withCells).to.contain(".grafana-traffic-half > text{opacity:0");
    expect(withCells).to.contain(".grafana-traffic-half:hover > text{opacity:1;}");
  });

  it("formats traffic legend values in selected unit", () => {
    if (typeof DOMParser === "undefined") {
      return;
    }

    const baseSvg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const legendSvg = addGrafanaTrafficLegend(
      baseSvg,
      {
        green: 1_000_000_000,
        yellow: 2_000_000_000,
        orange: 5_000_000_000,
        red: 10_000_000_000
      },
      "gbit"
    );

    expect(legendSvg).to.contain("0 - 1 Gbps");
    expect(legendSvg).to.contain("1 - 2 Gbps");
    expect(legendSvg).to.contain("2 - 5 Gbps");
    expect(legendSvg).to.contain("5 - 10 Gbps");
    expect(legendSvg).to.contain("10+ Gbps");
  });

  it("uses centered responsive aspect ratio for Grafana SVG", () => {
    if (typeof DOMParser === "undefined") {
      return;
    }

    const baseSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>';
    const responsive = makeGrafanaSvgResponsive(baseSvg);

    expect(responsive).to.contain('width="100%"');
    expect(responsive).to.contain('height="100%"');
    expect(responsive).to.contain('preserveAspectRatio="xMidYMid meet"');
  });
});
