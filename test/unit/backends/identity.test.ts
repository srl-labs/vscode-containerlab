/* global describe, it, before, after */
import Module from "module";
import path from "path";

import { expect } from "chai";

import {
  apiLabFavoriteKey,
  apiTopologySourcePathMatches,
  labIdentityKey,
  labRefMatchesLocalSource
} from "../../../src/backends/labIdentity";
import type * as CommonModule from "../../../src/treeView/common";
import type * as VscodeStubModule from "../../helpers/vscode-stub";

const originalResolve = (Module as any)._resolveFilename;

describe("lab backend identity", () => {
  let ClabLabTreeNode: typeof CommonModule.ClabLabTreeNode;
  let vscodeStub: typeof VscodeStubModule;

  before(() => {
    (Module as any)._resolveFilename = function (
      request: string,
      parent: unknown,
      isMain: boolean,
      options: unknown
    ) {
      if (request === "vscode") {
        return path.join(__dirname, "..", "..", "helpers", "vscode-stub.js");
      }
      return originalResolve.call(this, request, parent, isMain, options);
    };
    ({ ClabLabTreeNode } = require("../../../src/treeView/common"));
    vscodeStub = require("../../helpers/vscode-stub");
  });

  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it("does not collide when local and API labs have the same name", () => {
    const local = new ClabLabTreeNode(
      "demo",
      vscodeStub.TreeItemCollapsibleState.None,
      { absolute: "/workspace/demo.clab.yml", relative: "demo.clab.yml" },
      "demo"
    );
    const remote = new ClabLabTreeNode(
      "demo",
      vscodeStub.TreeItemCollapsibleState.None,
      { absolute: "/var/lib/clab/alice/demo.clab.yml", relative: "demo.clab.yml" },
      "demo",
      "alice",
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      {
        backendId: "api:https://api.example.test",
        labName: "demo",
        remotePath: "/var/lib/clab/alice/demo.clab.yml"
      }
    );

    expect(local.id).not.to.equal(remote.id);
    expect(remote.labRef.localPath).to.equal(undefined);
    expect(remote.labRef.remotePath).to.include("/var/lib/clab");
  });

  it("does not collide when two local paths declare the same lab name", () => {
    const first = new ClabLabTreeNode(
      "demo",
      vscodeStub.TreeItemCollapsibleState.None,
      { absolute: "/workspace/one/demo.clab.yml", relative: "one/demo.clab.yml" },
      "demo"
    );
    const second = new ClabLabTreeNode(
      "demo",
      vscodeStub.TreeItemCollapsibleState.None,
      { absolute: "/workspace/two/demo.clab.yml", relative: "two/demo.clab.yml" },
      "demo"
    );

    expect(first.id).not.to.equal(second.id);
  });

  it("scopes mapped sources to the active API endpoint and account", () => {
    const source = "/workspace/demo.clab.yml";
    const first = {
      backendId: "api:https://one.test#alice",
      labName: "demo",
      localPath: source,
      remotePath: "/srv/alice/demo.clab.yml"
    };
    const second = {
      backendId: "api:https://two.test#alice",
      labName: "demo",
      localPath: source,
      remotePath: "/srv/alice/demo.clab.yml"
    };

    expect(labIdentityKey(first)).not.to.equal(labIdentityKey(second));
    expect(labRefMatchesLocalSource(first, first.backendId, source, "demo")).to.equal(true);
    expect(labRefMatchesLocalSource(second, first.backendId, source, "demo")).to.equal(false);
    expect(labRefMatchesLocalSource(first, first.backendId, source, "other")).to.equal(false);
  });

  it("uses paths to distinguish same-name local labs", () => {
    expect(
      labIdentityKey({ backendId: "local", labName: "demo", localPath: "/workspace/a.clab.yml" })
    ).not.to.equal(
      labIdentityKey({ backendId: "local", labName: "demo", localPath: "/workspace/b.clab.yml" })
    );
  });

  it("scopes API favorites by endpoint while keeping runtime and file views aligned", () => {
    expect(
      apiLabFavoriteKey({
        backendId: "api:https://one.test#alice",
        labName: "demo",
        remotePath: "labs/demo.clab.yml"
      })
    ).to.equal("api:https://one.test#alice\ndemo");
    expect(
      apiLabFavoriteKey({
        backendId: "api:https://two.test#alice",
        labName: "demo",
        remotePath: "/home/alice/.clab/demo/demo.clab.yml"
      })
    ).to.equal("api:https://two.test#alice\ndemo");
    expect(
      apiLabFavoriteKey({ backendId: "local", labName: "demo", localPath: "/tmp/demo.yml" })
    ).to.equal(undefined);
  });

  it("aligns differently named API source folders, runtime labs, and favorites by path", () => {
    const backendId = "api:https://one.test#alice";
    expect(
      apiTopologySourcePathMatches(
        "/home/alice/.clab/srlinux-vlan-handling-lab/vlan.clab.yml",
        "srlinux-vlan-handling-lab",
        "vlan.clab.yml"
      )
    ).to.equal(true);
    expect(
      apiLabFavoriteKey({
        backendId,
        labName: "srlinux-vlan-handling-lab",
        remotePath: "vlan.clab.yml"
      })
    ).to.equal(
      apiLabFavoriteKey({
        backendId,
        labName: "vlan",
        remotePath: "/home/alice/.clab/srlinux-vlan-handling-lab/vlan.clab.yml"
      })
    );
    expect(
      labRefMatchesLocalSource(
        {
          backendId,
          labName: "vlan",
          localPath: "/tmp/materialized/vlan.clab.yml",
          remotePath: "/home/alice/.clab/srlinux-vlan-handling-lab/vlan.clab.yml",
          sourceLabName: "srlinux-vlan-handling-lab",
          sourcePath: "vlan.clab.yml"
        },
        backendId,
        "/tmp/materialized/vlan.clab.yml",
        "srlinux-vlan-handling-lab"
      )
    ).to.equal(true);
  });
});
