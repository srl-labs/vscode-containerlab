/* global describe, it */
import { expect } from "chai";

import {
  calculateElapsedSeconds,
  formatElapsedSeconds
} from "../../../src/reactTopoViewer/webview/utils/lifecycleTimer";

describe("calculateElapsedSeconds", () => {
  it("returns whole elapsed seconds", () => {
    expect(calculateElapsedSeconds(1000, 5000)).to.equal(4);
    expect(calculateElapsedSeconds(1000, 5999)).to.equal(4);
  });

  it("clamps negative durations to zero", () => {
    expect(calculateElapsedSeconds(5000, 1000)).to.equal(0);
  });
});

describe("formatElapsedSeconds", () => {
  it("formats minutes and seconds under one hour", () => {
    expect(formatElapsedSeconds(0)).to.equal("0:00");
    expect(formatElapsedSeconds(5)).to.equal("0:05");
    expect(formatElapsedSeconds(65)).to.equal("1:05");
  });

  it("formats hours with zero-padded minutes and seconds", () => {
    expect(formatElapsedSeconds(3600)).to.equal("1:00:00");
    expect(formatElapsedSeconds(3661)).to.equal("1:01:01");
  });

  it("clamps invalid values to zero", () => {
    expect(formatElapsedSeconds(-1)).to.equal("0:00");
    expect(formatElapsedSeconds(2.9)).to.equal("0:02");
  });
});
