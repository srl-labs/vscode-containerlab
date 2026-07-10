/* global describe, it */
import { expect } from "chai";

import {
  advertisedBackendCapabilities,
  parseApiServerCapabilities
} from "../../../src/backends/api/apiCapabilities";

describe("API capabilities", () => {
  it("accepts v1 and maps stable runtime operations plus advertised lifecycle support", () => {
    const server = parseApiServerCapabilities({
      apiVersion: "v1",
      serverVersion: "1.2.3",
      runtime: "docker",
      features: ["runtime-events-ndjson", "lab-lifecycle", "lifecycle-logs-ndjson"]
    });
    expect([...server.features]).to.include("runtime-events-ndjson");
    expect(advertisedBackendCapabilities(server)).to.deep.equal([
      "runtime-inspect",
      "api-auth",
      "runtime-actions",
      "netem",
      "lab-lifecycle"
    ]);
  });

  it("maps optional API feature families independently", () => {
    const server = parseApiServerCapabilities({
      apiVersion: "v1",
      serverVersion: "1.2.3",
      runtime: "docker",
      features: [
        "captures",
        "runtime-images",
        "terminal-websocket",
        "topology-files",
        "workspace-files"
      ]
    });
    expect(advertisedBackendCapabilities(server)).to.include.members([
      "captures",
      "runtime-images",
      "terminal-sessions",
      "topology-files",
      "workspace-files"
    ]);
  });

  it("requires both semantic lifecycle and NDJSON transport features", () => {
    const semanticOnly = parseApiServerCapabilities({
      apiVersion: "v1",
      serverVersion: "1.2.3",
      runtime: "docker",
      features: ["lab-lifecycle"]
    });
    const transportOnly = parseApiServerCapabilities({
      apiVersion: "v1",
      serverVersion: "1.2.3",
      runtime: "docker",
      features: ["lifecycle-logs-ndjson"]
    });
    expect(advertisedBackendCapabilities(semanticOnly)).not.to.include("lab-lifecycle");
    expect(advertisedBackendCapabilities(transportOnly)).not.to.include("lab-lifecycle");
  });

  it("rejects unsupported API versions before enabling features", () => {
    expect(() =>
      parseApiServerCapabilities({
        apiVersion: "v2",
        serverVersion: "2.0.0",
        runtime: "docker",
        features: ["lifecycle-logs-ndjson"]
      })
    ).to.throw("invalid capabilities");
  });
});
