/* global describe, it */
import { expect } from "chai";

import type { ClabInterfaceTreeNode } from "../../../src/treeView/common";
import {
  buildPacketflixTarget,
  captureScopeKey,
  isHostCaptureInterface
} from "../../../src/utils/packetflixTarget";

function interfaceNode(name: string, parentName = "clab-demo-sros1"): ClabInterfaceTreeNode {
  return { name, parentName } as unknown as ClabInterfaceTreeNode;
}

describe("Packetflix capture targets", () => {
  it("targets the host network namespace for a veth-stitch interface", () => {
    const node = interfaceNode("clab-s-12345678");

    expect(isHostCaptureInterface(node)).to.equal(true);
    expect(buildPacketflixTarget([node], 4026531840)).to.deep.equal({
      netns: 4026531840,
      "network-interfaces": ["clab-s-12345678"]
    });
  });

  it("keeps ordinary interfaces scoped to their Docker container", () => {
    const node = interfaceNode("eth1");

    expect(buildPacketflixTarget([node])).to.deep.equal({
      name: "clab-demo-sros1",
      type: "docker",
      "network-interfaces": ["eth1"]
    });
  });

  it("separates host and container interfaces into different capture scopes", () => {
    const host = interfaceNode("clab-s-12345678");
    const container = interfaceNode("eth1");

    expect(captureScopeKey(host)).not.to.equal(captureScopeKey(container));
  });
});
