/* global describe, it */
import { expect } from "chai";

import {
  normalizeCustomNodeTemplate,
  normalizeCustomNodeTemplates
} from "../../../src/reactTopoViewer/extension/services/customNodeTypes";

describe("custom node type normalization", () => {
  it("rewrites deprecated SR Linux node type aliases", () => {
    const normalized = normalizeCustomNodeTemplate({
      name: "SR Linux",
      kind: "nokia_srlinux",
      type: "ixrd1"
    });

    expect(normalized.type).to.equal("ixr-d1");
  });

  it("leaves non-SR Linux templates unchanged", () => {
    const normalized = normalizeCustomNodeTemplates([
      {
        name: "Linux",
        kind: "linux",
        type: "ixrd1"
      }
    ]);

    expect(normalized[0]?.type).to.equal("ixrd1");
  });
});
