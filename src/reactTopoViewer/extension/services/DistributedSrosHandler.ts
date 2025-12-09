/**
 * Handler for distributed SROS (Nokia SR SIM) nodes.
 */

import * as vscode from 'vscode';
import { ClabNode } from '../../shared/types/topology';
import { ClabLabTreeNode, ClabContainerTreeNode, ClabInterfaceTreeNode } from '../../../treeView/common';
import { findContainerNode } from './TreeUtils';

/**
 * Checks if a node is a distributed SROS node (nokia_srsim with components).
 */
export function isDistributedSrosNode(node: ClabNode | undefined): boolean {
  if (!node) return false;
  if (node.kind !== 'nokia_srsim') return false;
  const components = (node as Record<string, unknown>).components;
  return Array.isArray(components) && components.length > 0;
}

/**
 * Converts a TreeItemLabel to a string.
 */
export function treeItemLabelToString(label: string | vscode.TreeItemLabel | undefined): string {
  if (!label) {
    return '';
  }
  if (typeof label === 'string') {
    return label;
  }
  return label.label ?? '';
}

/**
 * Maps SROS interface names to their container interface names.
 */
export function mapSrosInterfaceName(ifaceName: string): string | undefined {
  if (!ifaceName) return undefined;
  const trimmed = ifaceName.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('eth')) {
    return trimmed;
  }
  const regex = /^(\d+)\/(?:x(\d+)\/)?(\d+)(?:\/c(\d+))?\/(\d+)$/;
  const res = regex.exec(trimmed);
  if (!res) {
    return undefined;
  }
  const [, card, xiom, mda, connector, port] = res;
  if (!card || !mda || !port) {
    return undefined;
  }
  if (xiom && connector) {
    return `e${card}-x${xiom}-${mda}-c${connector}-${port}`;
  }
  if (xiom) {
    return `e${card}-x${xiom}-${mda}-${port}`;
  }
  if (connector) {
    return `e${card}-${mda}-c${connector}-${port}`;
  }
  return `e${card}-${mda}-${port}`;
}

/**
 * Gets candidate interface names for matching.
 */
export function getCandidateInterfaceNames(ifaceName: string): string[] {
  const unique = new Set<string>();
  if (ifaceName) {
    unique.add(ifaceName);
  }
  const mapped = mapSrosInterfaceName(ifaceName);
  if (mapped) {
    unique.add(mapped);
  }
  return Array.from(unique);
}

/**
 * Matches an interface in a container.
 */
export function matchInterfaceInContainer(
  container: ClabContainerTreeNode,
  ifaceName: string
): ClabInterfaceTreeNode | undefined {
  if (!container.interfaces) return undefined;
  const candidates = getCandidateInterfaceNames(ifaceName);
  for (const iface of container.interfaces) {
    const labelStr = treeItemLabelToString(iface.label);
    if (
      candidates.includes(iface.name) ||
      candidates.includes(iface.alias) ||
      (labelStr && candidates.includes(labelStr))
    ) {
      return iface;
    }
  }
  return undefined;
}

/**
 * Checks if a container belongs to a distributed node.
 */
export function containerBelongsToDistributedNode(
  container: ClabContainerTreeNode,
  baseNodeName: string,
  fullPrefix: string
): boolean {
  const prefix = fullPrefix ? `${fullPrefix}-${baseNodeName}` : baseNodeName;
  const shortPrefix = `${baseNodeName}`;
  return (
    container.name.startsWith(`${prefix}-`) ||
    container.name_short.startsWith(`${shortPrefix}-`) ||
    (typeof container.label === 'string' && container.label.startsWith(`${shortPrefix}-`))
  );
}

/**
 * Builds candidate container names for distributed SROS nodes.
 */
export function buildDistributedCandidateNames(
  baseNodeName: string,
  fullPrefix: string,
  components: unknown[]
): string[] {
  const names: string[] = [];
  for (const comp of components) {
    const compObj = comp as Record<string, unknown>;
    const slotRaw = typeof compObj?.slot === 'string' ? compObj.slot.trim() : '';
    if (!slotRaw) continue;
    const suffix = slotRaw.toLowerCase();
    const longName = fullPrefix ? `${fullPrefix}-${baseNodeName}-${suffix}` : `${baseNodeName}-${suffix}`;
    names.push(longName, `${baseNodeName}-${suffix}`);
  }
  return names;
}

/**
 * Finds an interface by candidate names.
 */
export function findInterfaceByCandidateNames(params: {
  candidateNames: string[];
  ifaceName: string;
  clabTreeData: Record<string, ClabLabTreeNode>;
  clabName: string;
}): { containerName: string; ifaceData?: ClabInterfaceTreeNode } | undefined {
  const { candidateNames, ifaceName, clabTreeData, clabName } = params;
  for (const candidate of candidateNames) {
    const container = findContainerNode(clabTreeData, candidate, clabName);
    if (!container) continue;
    const ifaceData = matchInterfaceInContainer(container, ifaceName);
    if (ifaceData) {
      return { containerName: container.name, ifaceData };
    }
  }
  return undefined;
}

/**
 * Scans all distributed containers for an interface.
 */
export function scanAllDistributedContainers(params: {
  baseNodeName: string;
  ifaceName: string;
  fullPrefix: string;
  clabTreeData: Record<string, ClabLabTreeNode>;
  clabName: string;
}): { containerName: string; ifaceData?: ClabInterfaceTreeNode } | undefined {
  const { baseNodeName, ifaceName, fullPrefix, clabTreeData, clabName } = params;
  for (const lab of Object.values(clabTreeData)) {
    if (clabName && lab.name !== clabName) continue;
    for (const container of lab.containers ?? []) {
      if (!containerBelongsToDistributedNode(container, baseNodeName, fullPrefix)) continue;
      const ifaceData = matchInterfaceInContainer(container, ifaceName);
      if (ifaceData) {
        return { containerName: container.name, ifaceData };
      }
    }
  }
  return undefined;
}

/**
 * Finds a distributed SROS interface.
 */
export function findDistributedSrosInterface(params: {
  baseNodeName: string;
  ifaceName: string;
  fullPrefix: string;
  clabName: string;
  clabTreeData?: Record<string, ClabLabTreeNode>;
  components: unknown[];
}): { containerName: string; ifaceData?: ClabInterfaceTreeNode } | undefined {
  const { baseNodeName, ifaceName, fullPrefix, clabName, clabTreeData, components } = params;
  if (!clabTreeData || !Array.isArray(components) || components.length === 0) {
    return undefined;
  }

  const candidateNames = buildDistributedCandidateNames(baseNodeName, fullPrefix, components);
  const directMatch = findInterfaceByCandidateNames({
    candidateNames,
    ifaceName,
    clabTreeData,
    clabName,
  });
  if (directMatch) {
    return directMatch;
  }

  return scanAllDistributedContainers({
    baseNodeName,
    ifaceName,
    fullPrefix,
    clabTreeData,
    clabName,
  });
}

/**
 * Extracts SROS component info from a container.
 */
export function extractSrosComponentInfo(
  container: ClabContainerTreeNode
): { base: string; slot: string } | undefined {
  const candidateNames = [container.name_short, container.name].filter(Boolean) as string[];
  for (const raw of candidateNames) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    const lastDash = trimmed.lastIndexOf('-');
    if (lastDash === -1) {
      continue;
    }

    const base = trimmed.slice(0, lastDash);
    const slot = trimmed.slice(lastDash + 1);
    if (!base || !slot) {
      continue;
    }

    return { base, slot };
  }

  return undefined;
}

/**
 * Gets the slot priority for SROS components.
 */
export function srosSlotPriority(slot: string): number {
  const normalized = slot.toLowerCase();
  if (normalized === 'a') {
    return 0;
  }
  if (normalized === 'b') {
    return 1;
  }
  return 2;
}

/**
 * Collects distributed SROS containers from a lab.
 */
export function collectDistributedSrosContainers(
  lab: ClabLabTreeNode,
  candidateSet: Set<string>,
  baseNodeName: string,
  fullPrefix: string
): { container: ClabContainerTreeNode; slot: string }[] {
  const results: { container: ClabContainerTreeNode; slot: string }[] = [];
  for (const container of lab.containers ?? []) {
    if (container.kind !== 'nokia_srsim') {
      continue;
    }

    const info = extractSrosComponentInfo(container);
    if (!info) {
      continue;
    }

    const normalizedBase = info.base.toLowerCase();
    if (
      !candidateSet.has(normalizedBase) &&
      !containerBelongsToDistributedNode(container, baseNodeName, fullPrefix)
    ) {
      continue;
    }

    results.push({ container, slot: info.slot });
  }
  return results;
}

/**
 * Finds a distributed SROS container.
 */
export function findDistributedSrosContainer(params: {
  baseNodeName: string;
  fullPrefix: string;
  clabTreeData?: Record<string, ClabLabTreeNode>;
  clabName: string;
  components: unknown[];
}): ClabContainerTreeNode | undefined {
  const { baseNodeName, fullPrefix, clabTreeData, clabName, components } = params;
  if (!clabTreeData) {
    return undefined;
  }

  const candidateNames = buildDistributedCandidateNames(baseNodeName, fullPrefix, components);
  const candidateSet = new Set(candidateNames.map(name => name.toLowerCase()));

  const labs = clabName
    ? Object.values(clabTreeData).filter(l => l.name === clabName)
    : Object.values(clabTreeData);

  const candidateContainers = labs.flatMap(lab =>
    collectDistributedSrosContainers(lab, candidateSet, baseNodeName, fullPrefix)
  );

  if (!candidateContainers.length) {
    return undefined;
  }

  candidateContainers.sort((a, b) => {
    const slotOrder = srosSlotPriority(a.slot) - srosSlotPriority(b.slot);
    if (slotOrder !== 0) {
      return slotOrder;
    }
    return a.slot.localeCompare(b.slot, undefined, { sensitivity: 'base' });
  });

  return candidateContainers[0].container;
}
