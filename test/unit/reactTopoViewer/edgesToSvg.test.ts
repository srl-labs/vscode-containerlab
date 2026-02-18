/* global describe, it */
import { expect } from "chai";
import type { Edge, Node } from "@xyflow/react";

import { renderEdgesToSvg } from "../../../src/reactTopoViewer/webview/components/panels/svg-export/edgesToSvg";

describe("edgesToSvg", () => {
  it("renders node-proximate endpoint labels closer to nodes", () => {
    const nodes = [
      { id: "n1", type: "topology-node", position: { x: 0, y: 0 } },
      { id: "n2", type: "topology-node", position: { x: 200, y: 0 } }
    ] as unknown as Node[];

    const edges = [
      {
        id: "e1",
        source: "n1",
        target: "n2",
        data: {
          sourceEndpoint: "e1-1",
          targetEndpoint: "eth1",
          endpointLabelOffsetEnabled: true,
          endpointLabelOffset: 60
        }
      }
    ] as unknown as Edge[];

    const defaultSvg = renderEdgesToSvg(edges, nodes, true, undefined, false);
    const proximateSvg = renderEdgesToSvg(edges, nodes, true, undefined, true);

    const defaultMatch = /<circle cx="([^"]+)"/.exec(defaultSvg);
    const proximateMatch = /<circle cx="([^"]+)"/.exec(proximateSvg);

    expect(defaultMatch).to.not.equal(null);
    expect(proximateMatch).to.not.equal(null);

    const defaultCx = Number.parseFloat(defaultMatch![1]);
    const proximateCx = Number.parseFloat(proximateMatch![1]);

    expect(defaultCx).to.be.greaterThan(proximateCx);
    expect(defaultCx).to.equal(58);
    expect(proximateCx).to.equal(47);
  });

  it("anchors edge endpoints to interface label positions in node-proximate mode", () => {
    const nodes = [
      { id: "n1", type: "topology-node", position: { x: 0, y: 0 } },
      { id: "n2", type: "topology-node", position: { x: 200, y: 0 } }
    ] as unknown as Node[];

    const edges = [
      {
        id: "e1",
        source: "n1",
        target: "n2",
        data: {
          sourceEndpoint: "e1-1",
          targetEndpoint: "eth1"
        }
      }
    ] as unknown as Edge[];

    const proximateSvg = renderEdgesToSvg(edges, nodes, true, undefined, true);
    const pathMatch = /<path d="([^"]+)"/.exec(proximateSvg);
    const circleMatches = Array.from(
      proximateSvg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)"/g)
    );

    expect(pathMatch).to.not.equal(null);
    expect(circleMatches.length).to.equal(2);

    const pathNumbers = (pathMatch?.[1].match(/-?\d+(?:\.\d+)?/g) ?? []).map((value) =>
      Number.parseFloat(value)
    );
    expect(pathNumbers.length).to.be.greaterThan(3);

    const pathStart = { x: pathNumbers[0], y: pathNumbers[1] };
    const pathEnd = {
      x: pathNumbers[pathNumbers.length - 2],
      y: pathNumbers[pathNumbers.length - 1]
    };

    const sourceCircle = {
      x: Number.parseFloat(circleMatches[0][1]),
      y: Number.parseFloat(circleMatches[0][2])
    };
    const targetCircle = {
      x: Number.parseFloat(circleMatches[1][1]),
      y: Number.parseFloat(circleMatches[1][2])
    };

    expect(pathStart).to.deep.equal(sourceCircle);
    expect(pathEnd).to.deep.equal(targetCircle);
  });

  it("keeps non-horizontal links on top/bottom interfaces", () => {
    const nodes = [
      { id: "n1", type: "topology-node", position: { x: 0, y: 0 } },
      { id: "n2", type: "topology-node", position: { x: 160, y: 90 } }
    ] as unknown as Node[];

    const edges = [
      {
        id: "e1",
        source: "n1",
        target: "n2",
        data: {
          sourceEndpoint: "eth1",
          targetEndpoint: "eth2"
        }
      }
    ] as unknown as Edge[];

    const proximateSvg = renderEdgesToSvg(edges, nodes, true, undefined, true);
    const circleMatches = Array.from(
      proximateSvg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)"/g)
    );

    expect(circleMatches.length).to.equal(2);

    const sourceCircle = {
      x: Number.parseFloat(circleMatches[0][1]),
      y: Number.parseFloat(circleMatches[0][2])
    };
    const targetCircle = {
      x: Number.parseFloat(circleMatches[1][1]),
      y: Number.parseFloat(circleMatches[1][2])
    };

    // Source anchor is below source node and not on left/right side.
    expect(sourceCircle.y).to.be.greaterThan(40);
    expect(sourceCircle.x).to.be.greaterThan(0);
    expect(sourceCircle.x).to.be.lessThan(40);

    // Target anchor is above target node and not on left/right side.
    expect(targetCircle.y).to.be.lessThan(90);
    expect(targetCircle.x).to.be.greaterThan(160);
    expect(targetCircle.x).to.be.lessThan(200);
  });

  it("applies node/interface sizing options to interface anchors", () => {
    const nodes = [
      { id: "n1", type: "topology-node", position: { x: 0, y: 0 } },
      { id: "n2", type: "topology-node", position: { x: 200, y: 0 } }
    ] as unknown as Node[];

    const edges = [
      {
        id: "e1",
        source: "n1",
        target: "n2",
        data: {
          sourceEndpoint: "e1-1",
          targetEndpoint: "eth1"
        }
      }
    ] as unknown as Edge[];

    const defaultSvg = renderEdgesToSvg(edges, nodes, true, undefined, true);
    const scaledSvg = renderEdgesToSvg(edges, nodes, true, undefined, true, {
      nodeIconSize: 60,
      interfaceScale: 2
    });

    const defaultCircle = /<circle cx="([^"]+)"/.exec(defaultSvg);
    const scaledCircle = /<circle cx="([^"]+)"/.exec(scaledSvg);
    expect(defaultCircle).to.not.equal(null);
    expect(scaledCircle).to.not.equal(null);

    const defaultCx = Number.parseFloat(defaultCircle![1]);
    const scaledCx = Number.parseFloat(scaledCircle![1]);
    expect(scaledCx).to.be.greaterThan(defaultCx);
    expect(scaledCx - defaultCx).to.be.greaterThan(20);
  });

  it("uses configured interface label overrides", () => {
    const nodes = [
      { id: "n1", type: "topology-node", position: { x: 0, y: 0 } },
      { id: "n2", type: "topology-node", position: { x: 200, y: 0 } }
    ] as unknown as Node[];

    const edges = [
      {
        id: "e1",
        source: "n1",
        target: "n2",
        data: {
          sourceEndpoint: "1/1/c1/1",
          targetEndpoint: "1/1/c2/1"
        }
      }
    ] as unknown as Edge[];

    const svg = renderEdgesToSvg(edges, nodes, true, undefined, true, {
      interfaceLabelOverrides: {
        "1/1/c1/1": "c1",
        "1/1/c2/1": "c2"
      }
    });

    expect(svg).to.contain(">c1</text>");
    expect(svg).to.contain(">c2</text>");
  });
});
