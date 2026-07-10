import type { BackendCapability, BackendServerCapabilities } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseApiServerCapabilities(value: unknown): BackendServerCapabilities {
  if (!isRecord(value)) {
    throw new Error("clab-api-server returned an invalid capabilities response.");
  }
  const { apiVersion, serverVersion, runtime, features } = value;
  if (
    apiVersion !== "v1" ||
    typeof serverVersion !== "string" ||
    typeof runtime !== "string" ||
    !Array.isArray(features) ||
    !features.every((feature) => typeof feature === "string")
  ) {
    throw new Error("clab-api-server returned an invalid capabilities response.");
  }
  return {
    apiVersion,
    serverVersion,
    runtime,
    features: new Set(features),
    legacy: false
  };
}

export function advertisedBackendCapabilities(
  server: BackendServerCapabilities
): BackendCapability[] {
  const capabilities: BackendCapability[] = [
    "runtime-inspect",
    "api-auth",
    "runtime-actions",
    "netem"
  ];
  if (server.features.has("lab-lifecycle") && server.features.has("lifecycle-logs-ndjson")) {
    capabilities.push("lab-lifecycle");
  }
  if (server.features.has("captures")) capabilities.push("captures");
  if (server.features.has("runtime-images")) capabilities.push("runtime-images");
  if (server.features.has("terminal-websocket")) capabilities.push("terminal-sessions");
  if (server.features.has("topology-files")) capabilities.push("topology-files");
  if (server.features.has("workspace-files")) capabilities.push("workspace-files");
  return capabilities;
}
