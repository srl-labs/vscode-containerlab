/* global describe, it, after */
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

import { estimateStartedAtFromStatusForTests } from "../../../src/services/containerlabEvents";

describe("containerlabEvents uptime parsing", () => {
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
});
