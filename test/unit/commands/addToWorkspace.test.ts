/* global describe, it, after, beforeEach, afterEach */
/**
 * Tests for the `addLabFolderToWorkspace` command.
 *
 * The suite checks that a chosen lab folder is added to the VS Code
 * workspace using a stubbed `vscode` API from `test/helpers`.  It also
 * verifies that appropriate errors are returned when the path is
 * missing or invalid.
 */
// These tests simulate adding a folder to the workspace without launching VS Code
import Module from "module";
import path from "path";

import { expect } from "chai";
import sinon from "sinon";

// Replace the vscode module with our stub before importing the command
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

import { addLabFolderToWorkspace } from "../../../src/commands/addToWorkspace";

const vscodeStub = require("../../helpers/vscode-stub");

describe("addLabFolderToWorkspace command", () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    vscodeStub.window.lastInfoMessage = "";
    vscodeStub.workspace.workspaceFolders = [];
    sinon.spy(vscodeStub.workspace, "updateWorkspaceFolders");
    sinon.spy(vscodeStub.window, "showInformationMessage");
    sinon.spy(vscodeStub.window, "showErrorMessage");
  });

  afterEach(() => {
    sinon.restore();
  });

  // Adds a new folder entry to the current workspace.
  it("adds the folder to the workspace", async () => {
    const node = {
      labPath: { absolute: "/home/user/path/to/lab.clab.yaml" },
      label: "lab1",
      name: "lab1"
    } as any;
    await addLabFolderToWorkspace(node);

    const addSpy = vscodeStub.workspace.updateWorkspaceFolders as sinon.SinonSpy;
    const msgSpy = vscodeStub.window.showInformationMessage as sinon.SinonSpy;
    expect(addSpy.calledOnce).to.be.true;
    expect(addSpy.firstCall.args[2].uri.fsPath).to.equal("/home/user/path/to");
    expect(addSpy.firstCall.args[2].name).to.equal("lab1");
    expect(msgSpy.calledOnceWith('Added "lab1" to your workspace.')).to.be.true;
  });

  // Should return an error when the labPath field is empty.
  it("shows an error when labPath is missing", async () => {
    const result = await addLabFolderToWorkspace({ labPath: { absolute: "" } } as any);
    expect(result).to.be.undefined;
    const errSpy = vscodeStub.window.showErrorMessage as sinon.SinonSpy;
    expect(errSpy.calledOnceWith("No lab path found for this lab")).to.be.true;
    const addSpy = vscodeStub.workspace.updateWorkspaceFolders as sinon.SinonSpy;
    expect(addSpy.notCalled).to.be.true;
  });
});
