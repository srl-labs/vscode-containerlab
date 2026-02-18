/* global describe, it */
import { expect } from "chai";
import type { Edge, Node } from "@xyflow/react";

import {
  buildGrafanaDashboardJson,
  buildGrafanaPanelYaml,
  collectGrafanaEdgeCellMappings,
  sanitizeSvgForGrafana
} from "../../../src/reactTopoViewer/webview/components/panels/svg-export/grafanaExport";

describe("grafanaExport helpers", () => {
  const LEAF_NODE_ID = "leaf1";
  const CLIENT_NODE_ID = "client1";
  const TOPOLOGY_NODE_TYPE = "topology-node";
  const EDGE_VALID_ID = "edge-valid";
  const EDGE_VALID_OPERSTATE_ID = "leaf1:e1-1";
  const EDGE_VALID_OPERSTATE_REVERSE_ID = "client1:eth1";
  const EDGE_VALID_TRAFFIC_ID = "link_id:leaf1:e1-1:client1:eth1";
  const EDGE_VALID_TRAFFIC_REVERSE_ID = "link_id:client1:eth1:leaf1:e1-1";

  it("collects Grafana edge mappings only for valid topology links", () => {
    const nodes = [
      { id: LEAF_NODE_ID, type: TOPOLOGY_NODE_TYPE },
      { id: CLIENT_NODE_ID, type: TOPOLOGY_NODE_TYPE },
      { id: "note1", type: "free-text-node" }
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

    const mappings = collectGrafanaEdgeCellMappings(
      edges,
      nodes,
      new Set(["free-text-node", "free-shape-node", "group-node"])
    );

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
    expect(yaml).to.contain("{ valueMax: 199999, text: \"\\u200B\" }");
    expect(yaml).to.not.contain("{ valueMin: 200000 }");
    expect(yaml).to.contain("\"leaf1:e1-1\":");
    expect(yaml).to.contain("\"client1:eth1\":");
    expect(yaml).to.contain("\"link_id:leaf1:e1-1:client1:eth1\":");
    expect(yaml).to.contain("\"link_id:client1:eth1:leaf1:e1-1\":");
    expect(yaml).to.contain("dataRef: \"oper-state:leaf1:e1-1\"");
    expect(yaml).to.contain("dataRef: \"oper-state:client1:eth1\"");
    expect(yaml).to.contain("dataRef: \"leaf1:e1-1:out\"");
    expect(yaml).to.contain("dataRef: \"client1:eth1:out\"");
    expect(yaml).to.contain("label: *label-config");
  });

  it("builds dashboard JSON with embedded panel config and SVG", () => {
    const panelConfig = "---\ncells: {}\n";
    const svg = "<svg><g id=\"cell-test\"/></svg>";
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
});
