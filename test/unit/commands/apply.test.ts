/* global describe, it, before, after, beforeEach, afterEach */
/**
 * Tests for the `apply` command.
 */
import Module from "module";
import path from "path";

import { expect } from "chai";
import sinon from "sinon";

const originalResolve = (Module as any)._resolveFilename;

function clearModuleCache() {
  Object.keys(require.cache).forEach((key) => {
    if (key.includes("vscode-containerlab") && !key.includes("node_modules")) {
      delete require.cache[key];
    }
  });
}

function getStubPath(request: string): string | null {
  if (request === "vscode") {
    return path.join(__dirname, "..", "..", "helpers", "vscode-stub.js");
  }
  if (request.includes("clabCommand") && !request.includes("stub")) {
    return path.join(__dirname, "..", "..", "helpers", "clabCommand-stub.js");
  }
  if (request.includes("utils") && !request.includes("stub")) {
    return path.join(__dirname, "..", "..", "helpers", "utils-stub.js");
  }
  if ((request === "./graph" || request.endsWith("/graph")) && !request.includes("stub")) {
    return path.join(__dirname, "..", "..", "helpers", "graph-stub.js");
  }
  return null;
}

describe("apply command", () => {
  let applyLab: Function;
  let clabStub: any;

  before(() => {
    clearModuleCache();

    (Module as any)._resolveFilename = function (
      request: string,
      parent: any,
      isMain: boolean,
      options: any
    ) {
      const stubPath = getStubPath(request);
      if (stubPath !== null) {
        return stubPath;
      }
      return originalResolve.call(this, request, parent, isMain, options);
    };

    clabStub = require("../../helpers/clabCommand-stub");
    const applyModule = require("../../../src/commands/apply");
    applyLab = applyModule.applyLab;
  });

  after(() => {
    (Module as any)._resolveFilename = originalResolve;
    clearModuleCache();
  });

  beforeEach(() => {
    clabStub.instances.length = 0;
    sinon.spy(clabStub.ClabCommand.prototype, "run");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("creates ClabCommand and runs apply", async () => {
    const node = { labPath: { absolute: "/home/user/lab.yml" } } as any;
    await applyLab(node);

    expect(clabStub.instances.length).to.equal(1);
    const instance = clabStub.instances[0];
    expect(instance.action).to.equal("apply");
    expect(instance.node).to.equal(node);

    const spy = clabStub.ClabCommand.prototype.run as sinon.SinonSpy;
    expect(spy.calledOnceWithExactly()).to.be.true;
    expect(instance.runArgs).to.be.undefined;
  });
});
