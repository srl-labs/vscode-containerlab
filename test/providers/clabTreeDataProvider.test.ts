/* === test/providers/clabTreeDataProvider.test.ts === */

import * as assert from "assert";
import { describe, it, before, beforeEach, afterEach } from "mocha";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { ClabTreeDataProvider, ClabLabTreeNode } from "../../src/clabTreeDataProvider";

/**
 * BDD-style tests for ClabTreeDataProvider.
 */
describe("ClabTreeDataProvider Tests", function () {
  let provider: ClabTreeDataProvider;
  let sandbox: sinon.SinonSandbox;

  before(function () {
    // Runs once before all tests in this suite (optional).
  });

  beforeEach(function () {
    // Runs before each test. Create new ClabTreeDataProvider & sandbox.
    sandbox = sinon.createSandbox();

    // Minimal fake ExtensionContext for the provider:
    const fakeContext = {
      asAbsolutePath: (p: string) => p
    } as unknown as vscode.ExtensionContext;

    provider = new ClabTreeDataProvider(fakeContext);
  });

  afterEach(function () {
    // Runs after each test, restore stubs/spies.
    sandbox.restore();
  });

  it("should return undefined if workspace has no .clab YAML", async function () {
    // Stub out vscode.workspace.findFiles to return empty array:
    sandbox.stub(vscode.workspace, "findFiles").resolves([]);

    // discoverLocalLabs is private; we can still call it with `as any`
    const labs = await (provider as any).discoverLocalLabs();
    assert.strictEqual(labs, undefined, "Expected no labs to be discovered");
  });

  it("should discover local labs if .clab files exist", async function () {
    // Stub for multiple findFiles calls:
    const findFilesStub = sandbox.stub(vscode.workspace, "findFiles");

    // First pattern: found two .clab.* files
    findFilesStub.onFirstCall().resolves([
      vscode.Uri.file("/fake/ws/topology1.clab.yaml"),
      vscode.Uri.file("/fake/ws/topology2.clab.yml")
    ]);
    // Second pattern call: no new files
    findFilesStub.onSecondCall().resolves([]);

    // discoverLocalLabs (private) call via `as any`
    const labs = await (provider as any).discoverLocalLabs();
    assert.ok(labs, "Expected labs dictionary to be returned");

    const keys = Object.keys(labs);
    assert.strictEqual(keys.length, 2, "Should discover exactly 2 labs");

    // Check the first lab node
    const lab1 = labs["/fake/ws/topology1.clab.yaml"];
    assert.ok(lab1 instanceof ClabLabTreeNode, "Expected a ClabLabTreeNode instance");
    assert.strictEqual(lab1.label, "topology1.clab.yaml");
    assert.strictEqual(lab1.contextValue, "containerlabLabUndeployed");
  });
});
