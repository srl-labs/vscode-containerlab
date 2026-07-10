import * as vscode from "vscode";

import { getBackendForResource } from "../backends/manager";
import { ApiContainerlabBackend } from "../backends/api/apiContainerlabBackend";
import { backendHasCapability, type BackendCapability } from "../backends/types";
import type { ClabLabTreeNode } from "../treeView/common";

export interface ApiLabTarget {
  backend: ApiContainerlabBackend;
  labName: string;
}

export interface ApiNodeTarget extends ApiLabTarget {
  nodeName: string;
}

export function requireBackendCapability(
  capability: BackendCapability,
  operation: string,
  resource?: unknown
): boolean {
  const backend = getBackendForResource(resource);
  if (backendHasCapability(backend, capability)) return true;
  vscode.window.showInformationMessage(
    `${operation} is not available through the selected ${backend.kind} backend.`
  );
  return false;
}

export function localLabPath(node: ClabLabTreeNode, operation: string): string | undefined {
  if (node.labRef?.remotePath) {
    vscode.window.showInformationMessage(
      `${operation} requires a local workspace topology. This lab is managed by clab-api-server.`
    );
    return undefined;
  }
  const explicitLocalPath = node.labRef?.localPath;
  if (explicitLocalPath) return explicitLocalPath;
  return node.labPath.absolute || undefined;
}

export async function editableLabPath(
  node: ClabLabTreeNode,
  operation: string
): Promise<string | undefined> {
  const explicitLocalPath = node.labRef?.localPath;
  if (explicitLocalPath) return explicitLocalPath;
  if (!node.labRef?.remotePath) return node.labPath.absolute || undefined;

  const backend = getBackendForResource(node);
  if (!(backend instanceof ApiContainerlabBackend)) {
    vscode.window.showInformationMessage(
      `${operation} requires a connected clab-api-server endpoint.`
    );
    return undefined;
  }

  const labName = node.labRef.labName ?? node.name;
  if (!labName) {
    vscode.window.showErrorMessage(
      `Could not determine the API lab for ${operation.toLowerCase()}.`
    );
    return undefined;
  }
  const materialized = await backend.materializeTopology(labName, node.labRef.remotePath);
  return materialized.localPath;
}

export function resolveApiLabTarget(resource: unknown): ApiLabTarget | undefined {
  const backend = resolveApiBackend(resource);
  if (!backend) return undefined;
  const labName = backend.resolveLabNameForResource(resource);
  return labName ? { backend, labName } : undefined;
}

export function resolveApiBackend(resource: unknown): ApiContainerlabBackend | undefined {
  const backend = getBackendForResource(resource);
  return backend instanceof ApiContainerlabBackend ? backend : undefined;
}

export function resolveApiNodeTarget(resource: unknown): ApiNodeTarget | undefined {
  const labTarget = resolveApiLabTarget(resource);
  if (!labTarget || typeof resource !== "object" || resource === null) return undefined;
  const rootNodeName = Reflect.get(resource, "rootNodeName");
  const name = Reflect.get(resource, "name");
  const parentName = Reflect.get(resource, "parentName");
  const candidates = [rootNodeName, name, parentName];
  const nodeName = candidates
    .find(
      (candidate): candidate is string =>
        typeof candidate === "string" && candidate.trim().length > 0
    )
    ?.trim();
  return nodeName ? { ...labTarget, nodeName } : undefined;
}
