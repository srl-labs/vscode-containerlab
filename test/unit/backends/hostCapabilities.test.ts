/* global describe, it */
import { expect } from "chai";

import { buildClabUiHostCapabilities } from "../../../src/backends/hostCapabilities";
import type { BackendCapability, ContainerlabBackend } from "../../../src/backends/types";

function backendWith(...capabilities: BackendCapability[]): ContainerlabBackend {
  return { capabilities: new Set(capabilities) } as unknown as ContainerlabBackend;
}

describe("clab-ui host capabilities", () => {
  it("enables API runtime actions from explicit capabilities", () => {
    const capabilities = buildClabUiHostCapabilities(
      backendWith("runtime-inspect", "lab-lifecycle", "api-auth", "runtime-actions", "captures")
    );
    expect(capabilities.lifecycleActions.applyLab).to.equal(true);
    expect(capabilities.lifecycleActions.restartLab).to.equal(true);
    expect(capabilities.nodeActions.ssh).to.equal(true);
    expect(capabilities.features.interfaceCapture).to.equal(true);
  });

  it("keeps local runtime actions enabled", () => {
    const capabilities = buildClabUiHostCapabilities(
      backendWith(
        "runtime-inspect",
        "lab-lifecycle",
        "local-runtime",
        "runtime-actions",
        "captures",
        "netem"
      )
    );
    expect(capabilities.nodeActions.shell).to.equal(true);
    expect(capabilities.features.linkImpairment).to.equal(true);
  });
});
