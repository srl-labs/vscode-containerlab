/* global describe, it */
import { expect } from "chai";

import {
  ApiEndpointProfileStore,
  isValidApiSessionDuration,
  normalizeApiSessionDuration
} from "../../../src/apiEndpoints/profileStore";

class MemoryMemento {
  readonly values = new Map<string, unknown>();
  failUpdates = false;

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as T | undefined;
  }

  update(key: string, value: unknown): Thenable<void> {
    if (this.failUpdates) return Promise.reject(new Error("storage unavailable"));
    this.values.set(key, value);
    return Promise.resolve();
  }
}

describe("ApiEndpointProfileStore", () => {
  it("normalizes, persists, and deduplicates profiles by origin and account", async () => {
    const state = new MemoryMemento();
    const store = new ApiEndpointProfileStore(state);
    const initial = await store.save({
      id: "endpoint-one",
      label: "Primary",
      url: "https://api.example.test/",
      username: " alice ",
      sessionDuration: "7d"
    });
    const updated = await store.save({
      label: "Renamed",
      url: "https://api.example.test",
      username: "alice",
      sessionDuration: "36h"
    });

    expect(initial.url).to.equal("https://api.example.test");
    expect(updated.id).to.equal(initial.id);
    expect(store.list()).to.deep.equal([
      {
        ...initial,
        label: "Renamed",
        sessionDuration: "36h"
      }
    ]);
    expect(new ApiEndpointProfileStore(state).list()).to.deep.equal(store.list());
  });

  it("rejects an explicit identity collision", async () => {
    const store = new ApiEndpointProfileStore(new MemoryMemento());
    await store.save({
      id: "endpoint-one",
      url: "https://api.example.test",
      username: "alice"
    });

    let failure: unknown;
    try {
      await store.save({
        id: "endpoint-two",
        url: "https://api.example.test",
        username: "alice"
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.include("already exists");
    expect(store.list()).to.have.length(1);
  });

  it("does not mutate in-memory state when persistence fails", async () => {
    const state = new MemoryMemento();
    const store = new ApiEndpointProfileStore(state);
    await store.save({
      id: "endpoint-one",
      url: "https://one.example.test",
      username: "alice"
    });
    state.failUpdates = true;

    try {
      await store.save({
        id: "endpoint-two",
        url: "https://two.example.test",
        username: "bob"
      });
    } catch {
      // Expected.
    }
    expect(store.list().map((profile) => profile.id)).to.deep.equal(["endpoint-one"]);
  });

  it("accepts server duration syntax and rejects empty or non-positive values", () => {
    expect(normalizeApiSessionDuration(undefined)).to.equal("24h");
    expect(isValidApiSessionDuration("1h30m")).to.equal(true);
    expect(isValidApiSessionDuration("1.5d")).to.equal(true);
    expect(isValidApiSessionDuration("2w")).to.equal(true);
    expect(isValidApiSessionDuration("0h")).to.equal(false);
    expect(isValidApiSessionDuration("forever")).to.equal(false);
  });
});
