/* global describe, it */
import { expect } from "chai";

import { resolveLabSessionSharingLinks } from "../../../src/treeView/sessionSharing";
import type { BackendCapability, ContainerlabBackend } from "../../../src/backends/types";

function backendWith(...capabilities: BackendCapability[]): ContainerlabBackend {
  return { capabilities: new Set(capabilities) } as unknown as ContainerlabBackend;
}

describe("lab session-sharing backend policy", () => {
  const sshx = new Map([["demo", "https://sshx.example/session"]]);
  const gotty = new Map([["demo", "https://gotty.example/session"]]);

  it("keeps cached local links away from same-name API labs", () => {
    const links = resolveLabSessionSharingLinks(
      backendWith("runtime-inspect", "api-auth"),
      "demo",
      sshx,
      gotty
    );
    expect(links).to.deep.equal({});
  });

  it("keeps sharing links available to the local runtime", () => {
    const links = resolveLabSessionSharingLinks(
      backendWith("runtime-inspect", "local-runtime"),
      "demo",
      sshx,
      gotty
    );
    expect(links).to.deep.equal({
      sshxLink: "https://sshx.example/session",
      gottyLink: "https://gotty.example/session"
    });
  });
});
