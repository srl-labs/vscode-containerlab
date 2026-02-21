/* global describe, it */
import { expect } from "chai";
import type { Edge } from "@xyflow/react";

import { resolveTrafficRateStats } from "../../../src/reactTopoViewer/webview/utils/trafficRateAnnotation";

describe("resolveTrafficRateStats", () => {
  it("preserves statsIntervalSeconds for a single endpoint", () => {
    const edges = [
      {
        id: "edge-1",
        source: "n1",
        target: "n2",
        data: {
          sourceEndpoint: "eth1",
          extraData: {
            clabSourceStats: {
              rxBps: 123,
              txBps: 456,
              statsIntervalSeconds: 2
            }
          }
        }
      }
    ] as unknown as Edge[];

    const result = resolveTrafficRateStats(edges, "n1", "eth1");
    expect(result.endpointCount).to.equal(1);
    expect(result.stats?.rxBps).to.equal(123);
    expect(result.stats?.txBps).to.equal(456);
    expect(result.stats?.statsIntervalSeconds).to.equal(2);
  });

  it("aggregates counters and keeps the smallest valid interval across endpoints", () => {
    const edges = [
      {
        id: "edge-1",
        source: "n1",
        target: "n2",
        data: {
          sourceEndpoint: "eth1",
          extraData: {
            clabSourceStats: {
              rxBps: 100,
              txBps: 200,
              statsIntervalSeconds: 2
            }
          }
        }
      },
      {
        id: "edge-2",
        source: "n3",
        target: "n1",
        data: {
          targetEndpoint: "eth1",
          extraData: {
            clabTargetStats: {
              rxBps: 25,
              txBps: 75,
              statsIntervalSeconds: 1
            }
          }
        }
      }
    ] as unknown as Edge[];

    const result = resolveTrafficRateStats(edges, "n1", "eth1");
    expect(result.endpointCount).to.equal(2);
    expect(result.endpointKey).to.equal("traffic-rate:n1:eth1:s:edge-1|t:edge-2");
    expect(result.stats?.rxBps).to.equal(125);
    expect(result.stats?.txBps).to.equal(275);
    expect(result.stats?.statsIntervalSeconds).to.equal(1);
  });

  it("ignores invalid intervals and keeps a valid interval when available", () => {
    const edges = [
      {
        id: "edge-1",
        source: "n1",
        target: "n2",
        data: {
          sourceEndpoint: "eth1",
          extraData: {
            clabSourceStats: {
              rxBps: 10,
              statsIntervalSeconds: 0
            }
          }
        }
      },
      {
        id: "edge-2",
        source: "n1",
        target: "n3",
        data: {
          sourceEndpoint: "eth1",
          extraData: {
            clabSourceStats: {
              rxBps: 20,
              statsIntervalSeconds: 3
            }
          }
        }
      }
    ] as unknown as Edge[];

    const result = resolveTrafficRateStats(edges, "n1", "eth1");
    expect(result.stats?.rxBps).to.equal(30);
    expect(result.stats?.statsIntervalSeconds).to.equal(3);
  });
});
