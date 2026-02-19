/**
 * Tree utilities for finding containers and interfaces.
 */

import {
  type ClabLabTreeNode,
  type ClabContainerTreeNode,
  type ClabInterfaceTreeNode,
  flattenContainers
} from "../../../treeView/common";

function labValuesFor(
  labs: Record<string, ClabLabTreeNode> | undefined,
  clabName?: string
): ClabLabTreeNode[] {
  if (!labs) {
    return [];
  }
  return clabName
    ? Object.values(labs).filter((lab) => lab.name === clabName)
    : Object.values(labs);
}

function normalizeName(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function labelText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const label = (value as { label?: unknown }).label;
    if (typeof label === "string") {
      return label;
    }
  }
  return "";
}

function matchesInterfaceName(intfNode: ClabInterfaceTreeNode, intf: string): boolean {
  const ifaceLabel = labelText(intfNode.label);
  return intfNode.name === intf || intfNode.alias === intf || ifaceLabel === intf;
}

export function sortContainersByInterfacePriority(
  containers: ClabContainerTreeNode[]
): ClabContainerTreeNode[] {
  return [...containers].sort((left, right) => {
    const leftHasInterfaces = left.interfaces.length > 0 ? 0 : 1;
    const rightHasInterfaces = right.interfaces.length > 0 ? 0 : 1;
    if (leftHasInterfaces !== rightHasInterfaces) {
      return leftHasInterfaces - rightHasInterfaces;
    }
    return left.name.localeCompare(right.name);
  });
}

function containerMatchesNodeIdentifier(
  container: ClabContainerTreeNode,
  nodeName: string
): boolean {
  const normalizedNode = normalizeName(nodeName);
  if (!normalizedNode) {
    return false;
  }

  const candidates = [
    normalizeName(container.name),
    normalizeName(container.name_short),
    normalizeName(labelText(container.label)),
    normalizeName(container.rootNodeName)
  ];
  if (candidates.some((candidate) => candidate === normalizedNode)) {
    return true;
  }

  // Distributed SROS fallback: identify component containers by logical root name
  // without relying on slot suffix conventions (-a/-1/etc).
  if (container.kind !== "nokia_srsim") {
    return false;
  }

  const shortName = normalizeName(container.name_short);
  const label = normalizeName(labelText(container.label));

  return (
    shortName.startsWith(`${normalizedNode}-`) ||
    label.startsWith(`${normalizedNode}-`)
  );
}

function sortedMatchingContainers(
  lab: ClabLabTreeNode,
  nodeName: string,
  includeDistributedSiblings: boolean = false
): ClabContainerTreeNode[] {
  const allContainers = flattenContainers(lab.containers);
  const matched = allContainers.filter((container) =>
    containerMatchesNodeIdentifier(container, nodeName)
  );
  if (!includeDistributedSiblings || matched.length === 0) {
    return sortContainersByInterfacePriority(matched);
  }

  const siblingRoots = new Set(
    matched
      .filter((container) => container.kind === "nokia_srsim")
      .map((container) => normalizeName(container.rootNodeName))
      .filter((root) => root.length > 0)
  );
  if (siblingRoots.size === 0) {
    return sortContainersByInterfacePriority(matched);
  }

  const candidates: ClabContainerTreeNode[] = [];
  const seen = new Set<string>();
  for (const container of matched) {
    if (!seen.has(container.name)) {
      candidates.push(container);
      seen.add(container.name);
    }
  }
  for (const container of allContainers) {
    if (container.kind !== "nokia_srsim") {
      continue;
    }
    const root = normalizeName(container.rootNodeName);
    if (!root || !siblingRoots.has(root) || seen.has(container.name)) {
      continue;
    }
    candidates.push(container);
    seen.add(container.name);
  }

  return sortContainersByInterfacePriority(candidates);
}

/**
 * Finds a container node by name in the labs data.
 */
export function findContainerNode(
  labs: Record<string, ClabLabTreeNode> | undefined,
  name: string,
  clabName?: string
): ClabContainerTreeNode | undefined {
  const labValues = labValuesFor(labs, clabName);
  for (const lab of labValues) {
    const candidates = sortedMatchingContainers(lab, name);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }
  return undefined;
}

/**
 * Finds an interface node by name in the labs data.
 */
export function findInterfaceNode(
  labs: Record<string, ClabLabTreeNode> | undefined,
  nodeName: string,
  intf: string,
  clabName?: string
): ClabInterfaceTreeNode | undefined {
  const labValues = labValuesFor(labs, clabName);

  for (const lab of labValues) {
    const candidates = sortedMatchingContainers(lab, nodeName, true);
    for (const container of candidates) {
      const match = container.interfaces.find((i: ClabInterfaceTreeNode) =>
        matchesInterfaceName(i, intf)
      );
      if (match) {
        return match;
      }
    }
  }

  return undefined;
}
