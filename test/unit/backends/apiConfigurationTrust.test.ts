/* global describe, it */
import { expect } from "chai";

import {
  API_TRUST_SETTING_KEYS,
  assertNoWorkspaceApiTrustOverrides,
  findWorkspaceApiTrustOverrides
} from "../../../src/backends/api/apiConfigurationTrust";

describe("API configuration trust", () => {
  it("rejects workspace TLS overrides without treating endpoint identity as configuration", () => {
    const config = {
      inspect<T>(key: string) {
        if (key === "api.tls.verify") return { workspaceValue: false } as T;
        if (key === "api.url") return { workspaceFolderValue: "https://evil.test" } as T;
        return {} as T;
      }
    };

    expect(findWorkspaceApiTrustOverrides(config as never)).to.deep.equal(["api.tls.verify"]);
    expect(() => assertNoWorkspaceApiTrustOverrides(config as never)).to.throw(
      "cannot be configured by a workspace"
    );
  });

  it("accepts global machine values", () => {
    const config = {
      inspect<T>() {
        return { globalValue: "trusted" } as T;
      }
    };
    expect(findWorkspaceApiTrustOverrides(config as never)).to.deep.equal([]);
  });

  it("declares every API trust setting as machine scoped", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const manifest = require(`${process.cwd()}/package.json`);
    const groups = manifest.contributes.configuration as Array<{
      properties?: Record<string, { scope?: string }>;
    }>;
    const properties = Object.assign({}, ...groups.map((group) => group.properties ?? {}));
    for (const key of API_TRUST_SETTING_KEYS) {
      expect(properties[`containerlab.${key}`]?.scope, key).to.equal("machine");
    }
  });
});
