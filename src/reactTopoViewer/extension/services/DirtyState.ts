import * as fs from "fs";
import * as path from "path";

import * as YAML from "yaml";

export interface DirtyStateFileSystem {
  statSync(filePath: string): { mtimeMs: number };
  readFileSync(filePath: string, encoding: BufferEncoding): string;
}

const DEFAULT_VETH_MTU = 9500;

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | CanonicalObject;
type CanonicalObject = { [key: string]: CanonicalValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveStateFilePath(yamlFilePath: string, labName: string): string {
  return path.join(path.dirname(yamlFilePath), `clab-${labName}`, ".state.clab.yaml");
}

function normalizeEndpoint(endpoint: unknown): unknown {
  if (typeof endpoint === "string") return endpoint;
  if (
    isRecord(endpoint) &&
    typeof endpoint.node === "string" &&
    typeof endpoint.interface === "string"
  ) {
    return `${endpoint.node}:${endpoint.interface}`;
  }
  return endpoint;
}

function normalizeLink(link: unknown): unknown {
  if (!isRecord(link)) return link;

  const normalized: Record<string, unknown> = { ...link };
  if (Array.isArray(normalized.endpoints)) {
    normalized.endpoints = normalized.endpoints.map((endpoint) => normalizeEndpoint(endpoint));
  }
  if (normalized.type === "veth") {
    delete normalized.type;
  }
  if (normalized.mtu === DEFAULT_VETH_MTU) {
    delete normalized.mtu;
  }
  return normalized;
}

function normalizeTopology(topology: unknown): unknown {
  if (!isRecord(topology)) return topology;

  const normalized: Record<string, unknown> = { ...topology };
  if (isRecord(normalized.defaults) && Object.keys(normalized.defaults).length === 0) {
    delete normalized.defaults;
  }
  if (Array.isArray(normalized.links)) {
    normalized.links = normalized.links.map((link) => normalizeLink(link));
  }
  return normalized;
}

function normalizeTopologyDocument(document: unknown, labName: string): unknown {
  if (!isRecord(document)) return document;

  const normalized: Record<string, unknown> = { ...document };
  if (normalized.name === labName) {
    delete normalized.name;
  }
  if ("topology" in normalized) {
    normalized.topology = normalizeTopology(normalized.topology);
  }
  return normalized;
}

function canonicalize(value: unknown): CanonicalValue {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (isRecord(value)) {
    const result: CanonicalObject = {};
    for (const [key, entry] of Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    )) {
      if (entry !== undefined) {
        result[key] = canonicalize(entry);
      }
    }
    return result;
  }
  return null;
}

export function areTopologyContentsEquivalent(
  topologyContent: string,
  stateContent: string,
  labName: string
): boolean {
  const topologyDocument = normalizeTopologyDocument(YAML.parse(topologyContent), labName);
  const stateDocument = normalizeTopologyDocument(YAML.parse(stateContent), labName);
  return (
    JSON.stringify(canonicalize(topologyDocument)) === JSON.stringify(canonicalize(stateDocument))
  );
}

export function computeDeployedTopologyDirtyState(
  yamlFilePath: string,
  labName: string,
  fileSystem: DirtyStateFileSystem = fs
): boolean | undefined {
  if (!yamlFilePath || !labName) {
    return undefined;
  }

  const stateFilePath = resolveStateFilePath(yamlFilePath, labName);
  try {
    const yamlStat = fileSystem.statSync(yamlFilePath);
    const stateStat = fileSystem.statSync(stateFilePath);
    if (yamlStat.mtimeMs <= stateStat.mtimeMs) {
      return false;
    }

    const topologyContent = fileSystem.readFileSync(yamlFilePath, "utf8");
    const stateContent = fileSystem.readFileSync(stateFilePath, "utf8");
    try {
      return !areTopologyContentsEquivalent(topologyContent, stateContent, labName);
    } catch {
      return true;
    }
  } catch {
    return undefined;
  }
}
