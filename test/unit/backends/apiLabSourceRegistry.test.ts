/* global describe, it */
import { expect } from "chai";

import { ApiLabSourceRegistry } from "../../../src/backends/api/apiLabSourceRegistry";

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as T | undefined;
  }

  update(key: string, value: unknown): Thenable<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

describe("ApiLabSourceRegistry", () => {
  it("persists mappings and scopes them by backend account and lab", async () => {
    const state = new MemoryMemento();
    const alice = new ApiLabSourceRegistry(state, "api:https://one.test#alice");
    await alice.set("demo", "/workspace/demo.clab.yml", "source.clab.yml");

    const restored = new ApiLabSourceRegistry(state, "api:https://one.test#alice");
    expect(restored.get("demo")).to.equal("/workspace/demo.clab.yml");
    expect(restored.resolve("/workspace/demo.clab.yml")).to.deep.equal({
      backendId: "api:https://one.test#alice",
      labName: "demo",
      localPath: "/workspace/demo.clab.yml",
      remotePath: "source.clab.yml"
    });
    expect(restored.resolveRuntimePath("/home/alice/.clab/demo/source.clab.yml")).to.deep.equal({
      backendId: "api:https://one.test#alice",
      labName: "demo",
      localPath: "/workspace/demo.clab.yml",
      remotePath: "source.clab.yml"
    });
    expect(restored.getRemotePath("/workspace/demo.clab.yml", "demo")).to.equal("source.clab.yml");
    expect(new ApiLabSourceRegistry(state, "api:https://one.test#bob").get("demo")).to.equal(
      undefined
    );
    expect(new ApiLabSourceRegistry(state, "api:https://two.test#alice").get("demo")).to.equal(
      undefined
    );
    expect(alice.get("other-demo")).to.equal(undefined);
  });

  it("retains the remote identity when the same local source is remembered again", async () => {
    const state = new MemoryMemento();
    const registry = new ApiLabSourceRegistry(state, "api:https://one.test#alice");
    await registry.set("demo", "/workspace/demo.clab.yml", "vlan.clab.yml");
    await registry.remember("demo", "/workspace/demo.clab.yml");

    expect(registry.getRemotePath("/workspace/demo.clab.yml", "demo")).to.equal("vlan.clab.yml");

    await registry.set("demo", "/workspace/demo.clab.yml");
    expect(registry.getRemotePath("/workspace/demo.clab.yml", "demo")).to.equal(undefined);
  });

  it("supports reverse ownership lookup and removal for materialized API files", async () => {
    const state = new MemoryMemento();
    const registry = new ApiLabSourceRegistry(state, "api:https://one.test#alice");
    await registry.set("demo", "/workspace/demo.clab.yml");

    expect(registry.matches("/workspace/demo.clab.yml")).to.equal(true);
    expect(registry.matches("/workspace/demo.clab.yml", "demo")).to.equal(true);
    expect(registry.matches("/workspace/demo.clab.yml", "other")).to.equal(false);
    expect(await registry.remove("demo")).to.equal("/workspace/demo.clab.yml");
    expect(registry.matches("/workspace/demo.clab.yml")).to.equal(false);
    expect(new ApiLabSourceRegistry(state, "api:https://one.test#alice").get("demo")).to.equal(
      undefined
    );
  });
});
