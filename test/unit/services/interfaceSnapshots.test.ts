/* global describe, it */
import { expect } from "chai";

import { mergeInterfaceSnapshots } from "../../../src/services/interfaceSnapshots";
import type {
  ClabInterfaceSnapshot,
  ClabInterfaceSnapshotEntry
} from "../../../src/types/containerlab";

function iface(
  name: string,
  alias: string,
  overrides: Partial<ClabInterfaceSnapshotEntry> = {}
): ClabInterfaceSnapshotEntry {
  return {
    name,
    alias,
    type: "veth",
    state: "up",
    mac: "02:00:00:00:00:01",
    mtu: 1500,
    ifindex: 10,
    ...overrides
  };
}

function snapshot(interfaces: ClabInterfaceSnapshotEntry[]): ClabInterfaceSnapshot[] {
  return [{ name: "clab-demo-sros1", interfaces }];
}

describe("interface snapshot merging", () => {
  it("uses the inspected host-side stitch interface and keeps live statistics", () => {
    const inspected = snapshot([iface("clab-s-12345678", "1/1/c1/1", { ifindex: 42 })]);
    const live = snapshot([
      iface("eth1", "1/1/c1/1", {
        rxBps: 1000,
        txBps: 2000,
        netemLoss: "5%"
      })
    ]);

    const merged = mergeInterfaceSnapshots(inspected, live)[0].interfaces;

    expect(merged).to.have.length(1);
    expect(merged[0]).to.include({
      name: "clab-s-12345678",
      alias: "1/1/c1/1",
      ifindex: 42,
      rxBps: 1000,
      txBps: 2000,
      netemLoss: "5%"
    });
  });

  it("retains live interfaces that are not present in a cached inspection", () => {
    const inspected = snapshot([iface("eth1", "e1-1")]);
    const live = snapshot([iface("eth1", "e1-1"), iface("eth2", "e1-2")]);

    const merged = mergeInterfaceSnapshots(inspected, live)[0].interfaces;

    expect(merged.map((entry) => entry.name)).to.deep.equal(["eth1", "eth2"]);
  });
});
