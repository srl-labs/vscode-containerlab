/* global describe, it, after, beforeEach */
import Module from "module";
import path from "path";

import { expect } from "chai";

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (
  request: string,
  parent: any,
  isMain: boolean,
  options: any
) {
  if (request === "vscode") {
    return path.join(__dirname, "..", "..", "helpers", "vscode-stub.js");
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import {
  estimateStartedAtFromStatusForTests,
  getInterfaceSnapshot,
  handleEventLineForTests,
  resetForTests
} from "../../../src/services/containerlabEvents";

describe("containerlabEvents uptime parsing", () => {
  beforeEach(() => {
    resetForTests();
  });

  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it("parses week-based uptime from docker status", () => {
    const eventTimestamp = Date.parse("2026-02-25T12:00:00.000Z");
    const parsed = estimateStartedAtFromStatusForTests("Up 2 weeks", eventTimestamp);

    expect(parsed).to.equal(eventTimestamp - 14 * 24 * 60 * 60 * 1000);
  });

  it("parses week-based uptime with health suffix", () => {
    const eventTimestamp = Date.parse("2026-02-25T12:00:00.000Z");
    const parsed = estimateStartedAtFromStatusForTests("Up 2 weeks (healthy)", eventTimestamp);

    expect(parsed).to.equal(eventTimestamp - 14 * 24 * 60 * 60 * 1000);
  });

  it("preserves netem state when later interface events omit netem attributes", () => {
    handleEventLineForTests(
      JSON.stringify({
        type: "interface",
        action: "create",
        actor_id: "container-1",
        attributes: {
          ifname: "eth1",
          type: "veth",
          state: "up",
          netem_delay: "25ms",
          netem_jitter: "5ms"
        }
      })
    );

    handleEventLineForTests(
      JSON.stringify({
        type: "interface",
        action: "stats",
        actor_id: "container-1",
        attributes: {
          ifname: "eth1",
          rx_bps: 1000,
          tx_bps: 2000
        }
      })
    );

    const snapshot = getInterfaceSnapshot("container-1", "clab-demo-srl1");
    const iface = snapshot[0]?.interfaces.find((entry) => entry.name === "eth1");

    expect(iface?.netemDelay).to.equal("25ms");
    expect(iface?.netemJitter).to.equal("5ms");
    expect(iface?.rxBps).to.equal(1000);
    expect(iface?.txBps).to.equal(2000);
  });

  it("defaults new interfaces without netem state and honors explicit reset values", () => {
    handleEventLineForTests(
      JSON.stringify({
        type: "interface",
        action: "create",
        actor_id: "container-2",
        attributes: {
          ifname: "eth2",
          type: "veth",
          state: "up"
        }
      })
    );

    let snapshot = getInterfaceSnapshot("container-2", "clab-demo-srl2");
    let iface = snapshot[0]?.interfaces.find((entry) => entry.name === "eth2");

    expect(iface?.netemDelay).to.equal("0ms");
    expect(iface?.netemJitter).to.equal("0ms");

    handleEventLineForTests(
      JSON.stringify({
        type: "interface",
        action: "update",
        actor_id: "container-2",
        attributes: {
          ifname: "eth2",
          netem_delay: "30ms"
        }
      })
    );
    handleEventLineForTests(
      JSON.stringify({
        type: "interface",
        action: "update",
        actor_id: "container-2",
        attributes: {
          ifname: "eth2",
          netem_delay: "0ms"
        }
      })
    );

    snapshot = getInterfaceSnapshot("container-2", "clab-demo-srl2");
    iface = snapshot[0]?.interfaces.find((entry) => entry.name === "eth2");

    expect(iface?.netemDelay).to.equal("0ms");
  });
});
