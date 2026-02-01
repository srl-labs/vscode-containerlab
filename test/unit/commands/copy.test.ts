/* global describe, it, after, beforeEach, afterEach */
/**
 * Tests for the various `copy` commands which place information about a
 * lab or container on the system clipboard.
 *
 * The suite ensures the correct text is copied using the stubbed clipboard
 * API and verifies that helpful error messages are shown when required
 * values are missing.
 */
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

import {
  copyLabPath,
  copyContainerIPv4Address,
  copyContainerIPv6Address,
  copyContainerName,
  copyContainerID,
  copyContainerKind,
  copyContainerImage,
  copyMACAddress
} from "../../../src/commands/copy";

const vscodeStub = require("../../helpers/vscode-stub");

describe("copyLabPath command", () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  beforeEach(() => {
    vscodeStub.window.lastErrorMessage = "";
    vscodeStub.window.lastInfoMessage = "";
    vscodeStub.env.clipboard.lastText = "";
    sinon.spy(vscodeStub.env.clipboard, "writeText");
    sinon.spy(vscodeStub.window, "showInformationMessage");
    sinon.spy(vscodeStub.window, "showErrorMessage");
  });

  afterEach(() => {
    sinon.restore();
  });

  // Copies the absolute path of the lab file and notifies the user.
  it("copies the lab path to the clipboard and shows info message", async () => {
    const node = { labPath: { absolute: "/home/user/lab.clab.yml" } } as any;
    copyLabPath(node);

    const clipSpy = vscodeStub.env.clipboard.writeText as sinon.SinonSpy;
    await clipSpy.returnValues[0];
    const msgSpy = vscodeStub.window.showInformationMessage as sinon.SinonSpy;
    expect(clipSpy.calledOnceWith("/home/user/lab.clab.yml")).to.be.true;
    expect(msgSpy.calledOnceWith("Copied file path of /home/user/lab.clab.yml to clipboard.")).to.be
      .true;
  });

  // Should error when no node is provided.
  it("shows an error when node is undefined", () => {
    copyLabPath(undefined as any);
    const spy = vscodeStub.window.showErrorMessage as sinon.SinonSpy;
    expect(spy.calledOnceWith("No lab node selected.")).to.be.true;
  });

  // Should error when the node does not contain a labPath.
  it("shows an error when labPath is missing", () => {
    copyLabPath({ labPath: { absolute: "" } } as any);
    const spy = vscodeStub.window.showErrorMessage as sinon.SinonSpy;
    expect(spy.calledOnceWith("No labPath found.")).to.be.true;
  });
});

// The remaining copy helpers share the same behaviour so we loop through
// a list of commands and verify each one in turn.
describe("other copy commands", () => {
  beforeEach(() => {
    vscodeStub.window.lastErrorMessage = "";
    vscodeStub.window.lastInfoMessage = "";
    vscodeStub.env.clipboard.lastText = "";
    sinon.spy(vscodeStub.env.clipboard, "writeText");
    sinon.spy(vscodeStub.window, "showInformationMessage");
    sinon.spy(vscodeStub.window, "showErrorMessage");
  });

  afterEach(() => {
    sinon.restore();
  });

  const containerCmds = [
    {
      fn: copyContainerIPv4Address,
      field: "IPv4Address",
      value: "10.0.0.1",
      success: "node1: Copied IPv4 address to clipboard succesfully.",
      error: "node1: Could not fetch IPv4 address."
    },
    {
      fn: copyContainerIPv6Address,
      field: "IPv6Address",
      value: "2001::1",
      success: "node1: Copied IPv6 address to clipboard succesfully.",
      error: "node1: Could not fetch IPv6 address."
    },
    {
      fn: copyContainerName,
      field: "name",
      value: "node1",
      success: "node1: Copied hostname to clipboard succesfully.",
      error: ": Could not fetch container hostname."
    },
    {
      fn: copyContainerID,
      field: "cID",
      value: "abc123",
      success: "node1: Copied ID to clipboard succesfully.",
      error: "node1: Could not fetch container ID."
    },
    {
      fn: copyContainerKind,
      field: "kind",
      value: "linux",
      success: "node1: Copied kind to clipboard succesfully.",
      error: "node1: Could not fetch kind."
    },
    {
      fn: copyContainerImage,
      field: "image",
      value: "img:1",
      success: "node1: Copied image to clipboard succesfully.",
      error: "node1: Could not fetch image."
    }
  ];

  containerCmds.forEach(({ fn, field, value, success, error }) => {
    // Each helper should copy a specific property from the node.
    it(`copies container ${field} to the clipboard`, async () => {
      const node: any = { name: "node1", [field]: value };
      fn(node);

      const clipSpy = vscodeStub.env.clipboard.writeText as sinon.SinonSpy;
      await clipSpy.returnValues[0];
      const msgSpy = vscodeStub.window.showInformationMessage as sinon.SinonSpy;
      expect(clipSpy.calledOnceWith(value)).to.be.true;
      expect(msgSpy.calledOnceWith(success)).to.be.true;
    });

    // Should emit an error if the property is missing on the node.
    it(`shows an error when ${field} is missing`, () => {
      const node: any = { name: "node1", [field]: "" };
      fn(node);
      const spy = vscodeStub.window.showErrorMessage as sinon.SinonSpy;
      expect(spy.calledOnceWith(error)).to.be.true;
    });

    // Should emit an error if no node is provided at all.
    it(`shows an error when node is undefined for ${field}`, () => {
      fn(undefined as any);
      const spy = vscodeStub.window.showErrorMessage as sinon.SinonSpy;
      expect(spy.calledOnceWith("No lab node selected.")).to.be.true;
    });
  });

  // Copies the MAC address of a network interface node.
  it("copies interface MAC address to the clipboard", async () => {
    const node: any = { name: "eth0", mac: "aa:bb:cc:dd:ee:ff" };
    copyMACAddress(node);

    const clipSpy = vscodeStub.env.clipboard.writeText as sinon.SinonSpy;
    await clipSpy.returnValues[0];
    const msgSpy = vscodeStub.window.showInformationMessage as sinon.SinonSpy;
    expect(clipSpy.calledOnceWith("aa:bb:cc:dd:ee:ff")).to.be.true;
    expect(msgSpy.calledOnceWith("eth0: Copied MAC address to clipboard succesfully.")).to.be.true;
  });

  // Should show an error when no interface node is provided.
  it("shows an error when interface node is undefined", () => {
    copyMACAddress(undefined as any);
    const spy = vscodeStub.window.showErrorMessage as sinon.SinonSpy;
    expect(spy.calledOnceWith("No interface node selected.")).to.be.true;
  });

  // Should show an error when the MAC address value is empty.
  it("shows an error when MAC address is missing", () => {
    copyMACAddress({ name: "eth0", mac: "" } as any);
    const spy = vscodeStub.window.showErrorMessage as sinon.SinonSpy;
    expect(spy.calledOnceWith("eth0: Could not fetch interface MAC address.")).to.be.true;
  });
});
