/* === test/commands/deployCommand.test.ts === */
import * as assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";
import * as sinon from "sinon";
import * as vscode from "vscode";

import { deploy, deployCleanup, deploySpecificFile } from "../../src/commands/deploy";
import { ClabCommand } from "../../src/commands/clabCommand";
import { ClabLabTreeNode } from "../../src/clabTreeDataProvider";


describe("Deploy Command Tests", function () {
  let sandbox: sinon.SinonSandbox;
  let runStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    // Stub ClabCommand.prototype.run to avoid actually running containerlab
    runStub = sandbox.stub(ClabCommand.prototype, "run").resolves();
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("deploy() calls ClabCommand.run with correct arguments", async function () {
    const node = new ClabLabTreeNode(
      "lab.clab.yaml",
      vscode.TreeItemCollapsibleState.None,
      { absolute: "/fake/lab.clab.yaml", relative: "lab.clab.yaml" },
      "testLab"
    );

    await deploy(node);

    // Confirm run() was called once
    assert.strictEqual(runStub.calledOnce, true, "Expected run() to be called exactly once");

    // If you want to test spinnerMsg or any protected property, cast to any
    const cmdInstance = runStub.thisValues[0] as any; 
    const spinnerArg = cmdInstance.spinnerMsg;
    assert.ok(spinnerArg, "Expected spinnerMsg to be set on ClabCommand");
    assert.strictEqual(spinnerArg.progressMsg, "Deploying Lab... ");
    assert.strictEqual(spinnerArg.successMsg, "Lab deployed successfully!");
  });

  it("deployCleanup() calls ClabCommand with '-c' (cleanup) flag", async function () {
    const node = new ClabLabTreeNode(
      "lab.clab.yml",
      vscode.TreeItemCollapsibleState.None,
      { absolute: "/fake/lab.clab.yml", relative: "lab.clab.yml" },
      "testLab"
    );

    await deployCleanup(node);

    assert.strictEqual(runStub.calledOnce, true, "run() should be called once");
    // The first call's arguments are the array passed to run(...)
    const callArgs = runStub.getCall(0).args[0] as string[];
    // We expect the '-c' cleanup flag
    assert.ok(callArgs.includes("-c"), "Expected '-c' flag in deployCleanup");
  });

  it("deploySpecificFile() prompts for file, then calls deploy() with user selection", async function () {
    // Stub the showOpenDialog so it returns a single file Uri
    const openDialogStub = sandbox.stub(vscode.window, "showOpenDialog")
      .resolves([vscode.Uri.file("/selected/path/topo.clab.yml")]);

    // Actually call deploySpecificFile
    await deploySpecificFile();

    // Confirm we asked user for an open file
    assert.strictEqual(openDialogStub.calledOnce, true, "Expected showOpenDialog to be called once");
    // Confirm run() was called via our stubs
    assert.strictEqual(runStub.calledOnce, true, "Expected ClabCommand.run() to be called once after picking file");

    // The node that was constructed for deploy() should have the chosen file path
    const nodeArg = runStub.thisValues[0] as any; // or cast to ClabCommand
    assert.strictEqual(nodeArg.node.labPath.absolute, "/selected/path/topo.clab.yml");
  });
});
