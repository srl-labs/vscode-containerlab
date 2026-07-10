/* global describe, it */
import { expect } from "chai";

import {
  apiManagedTopologyPath,
  apiLifecycleMutationFlags,
  isHttpTopologySource,
  planApiTopologySource,
  planLocalTopologySync
} from "../../../src/backends/api/apiLifecyclePlan";

describe("API lifecycle source planning", () => {
  it("recognizes URL deploys that let the server determine the lab name", () => {
    expect(isHttpTopologySource("https://example.test/demo.clab.yml")).to.equal(true);
    expect(isHttpTopologySource("/workspace/demo.clab.yml")).to.equal(false);
  });

  it("never treats a materialized API editor cache as a local upload source", () => {
    expect(
      planApiTopologySource(
        {
          localPath: "/home/alice/.config/Code/User/globalStorage/api-topologies/vlan.clab.yml",
          remotePath: "vlan.clab.yml"
        },
        "/home/alice/.config/Code/User/globalStorage/api-topologies/vlan.clab.yml"
      )
    ).to.deep.equal({ kind: "managed", remotePath: "vlan.clab.yml" });
    expect(
      planApiTopologySource(
        {
          localPath: "/tmp/materialized/vlan.clab.yml",
          remotePath: "/home/alice/.clab/source/vlan.clab.yml"
        },
        "/tmp/materialized/vlan.clab.yml"
      )
    ).to.deep.equal({ kind: "runtime" });
  });

  it("accepts only safe relative API topology paths", () => {
    expect(apiManagedTopologyPath("labs/demo.clab.yml")).to.equal("labs/demo.clab.yml");
    expect(apiManagedTopologyPath("/home/alice/demo.clab.yml")).to.equal(undefined);
    expect(apiManagedTopologyPath("../demo.clab.yml")).to.equal(undefined);
  });
  it("imports an undeployed apply source as a full archive", () => {
    expect(planLocalTopologySync("apply", true, false)).to.equal("archive-deploy");
  });

  it("uses YAML sync only after the remote topology exists", () => {
    expect(planLocalTopologySync("apply", true, true)).to.equal("yaml-sync");
    expect(planLocalTopologySync("redeploy", true, true)).to.equal("yaml-sync");
  });

  it("maps deploy cleanup to reconfigure and cleanup only to destructive actions", () => {
    expect(apiLifecycleMutationFlags("deploy", true)).to.deep.equal({ reconfigure: true });
    expect(apiLifecycleMutationFlags("destroy", true)).to.deep.equal({ cleanup: true });
    expect(apiLifecycleMutationFlags("redeploy", true)).to.deep.equal({ cleanup: true });
    expect(apiLifecycleMutationFlags("apply", true)).to.deep.equal({});
    expect(apiLifecycleMutationFlags("deploy", false)).to.deep.equal({});
  });
});
