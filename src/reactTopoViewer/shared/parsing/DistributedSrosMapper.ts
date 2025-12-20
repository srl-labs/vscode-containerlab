/**
 * Handler for distributed SROS (Nokia SR SIM) nodes.
 * Pure functions - no VS Code dependencies.
 */

import { ClabNode } from '../types/topology';

import type { ContainerDataProvider, ContainerInfo, InterfaceInfo } from './types';

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
 * Maps SROS interface names to their container interface names.
 * Converts format like "1/x2/3/c4/5" to "e1-x2-3-c4-5".
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
  container: ContainerInfo,
  ifaceName: string
): InterfaceInfo | undefined {
  if (!container.interfaces) return undefined;
  const candidates = getCandidateInterfaceNames(ifaceName);
  for (const iface of container.interfaces) {
    const labelStr = container.label || '';
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
  container: ContainerInfo,
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
    const longName = fullPrefix
      ? `${fullPrefix}-${baseNodeName}-${suffix}`
      : `${baseNodeName}-${suffix}`;
    names.push(longName, `${baseNodeName}-${suffix}`);
  }
  return names;
}

/**
 * Extracts SROS component info from a container.
 */
export function extractSrosComponentInfo(
  container: ContainerInfo
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

// ============================================================================
// ContainerDataProvider-based functions
// ============================================================================

/**
 * Finds an interface by candidate names using ContainerDataProvider.
 */
export function findInterfaceByCandidateNames(params: {
  candidateNames: string[];
  ifaceName: string;
  provider: ContainerDataProvider;
  labName: string;
}): { containerName: string; ifaceData?: InterfaceInfo } | undefined {
  const { candidateNames, ifaceName, provider, labName } = params;
  for (const candidate of candidateNames) {
    const container = provider.findContainer(candidate, labName);
    if (!container) continue;
    const ifaceData = matchInterfaceInContainer(container, ifaceName);
    if (ifaceData) {
      return { containerName: container.name, ifaceData };
    }
  }
  return undefined;
}

/**
 * Finds a distributed SROS interface using ContainerDataProvider.
 */
export function findDistributedSrosInterface(params: {
  baseNodeName: string;
  ifaceName: string;
  fullPrefix: string;
  labName: string;
  provider?: ContainerDataProvider;
  components: unknown[];
}): { containerName: string; ifaceData?: InterfaceInfo } | undefined {
  const { baseNodeName, ifaceName, fullPrefix, labName, provider, components } = params;
  if (!provider || !Array.isArray(components) || components.length === 0) {
    return undefined;
  }

  // Check if provider has specialized method
  if (provider.findDistributedSrosInterface) {
    return provider.findDistributedSrosInterface({
      baseNodeName,
      ifaceName,
      fullPrefix,
      labName,
      components,
    });
  }

  // Fallback to direct lookup
  const candidateNames = buildDistributedCandidateNames(baseNodeName, fullPrefix, components);
  return findInterfaceByCandidateNames({
    candidateNames,
    ifaceName,
    provider,
    labName,
  });
}

/**
 * Finds a distributed SROS container using ContainerDataProvider.
 */
export function findDistributedSrosContainer(params: {
  baseNodeName: string;
  fullPrefix: string;
  labName: string;
  provider?: ContainerDataProvider;
  components: unknown[];
}): ContainerInfo | undefined {
  const { baseNodeName, fullPrefix, labName, provider, components } = params;
  if (!provider) {
    return undefined;
  }

  // Check if provider has specialized method
  if (provider.findDistributedSrosContainer) {
    return provider.findDistributedSrosContainer({
      baseNodeName,
      fullPrefix,
      labName,
      components,
    });
  }

  // Fallback to checking candidate names
  const candidateNames = buildDistributedCandidateNames(baseNodeName, fullPrefix, components);
  for (const name of candidateNames) {
    const container = provider.findContainer(name, labName);
    if (container) {
      return container;
    }
  }

  return undefined;
}
