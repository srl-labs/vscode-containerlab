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
});
