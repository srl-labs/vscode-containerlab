/**
 * Utility functions for generating unique IDs for nodes
 * Mirrors the logic from legacy topoViewer IdUtils.ts
 */

import { isSpecialEndpoint } from './LinkTypes';

/**
 * Generate unique ID for dummy nodes (dummy1, dummy2, etc.)
 */
export function generateDummyId(baseName: string, usedIds: Set<string>): string {
  const re = /^(dummy)(\d*)$/;
  const match = re.exec(baseName);
  const base = match?.[1] || 'dummy';
  let num = parseInt(match?.[2] || '1') || 1;
  while (usedIds.has(`${base}${num}`)) num++;
  return `${base}${num}`;
}

/**
 * Generate unique ID for adapter nodes (host:eth1, macvlan:eth1, etc.)
 */
export function generateAdapterNodeId(baseName: string, usedIds: Set<string>): string {
  const [nodeType, adapter] = baseName.split(':');
  const adapterRe = /^([a-zA-Z]+)(\d+)$/;
  const adapterMatch = adapterRe.exec(adapter);
  if (adapterMatch) {
    const adapterBase = adapterMatch[1];
    let adapterNum = parseInt(adapterMatch[2]);
    let name = baseName;
    while (usedIds.has(name)) {
      adapterNum++;
      name = `${nodeType}:${adapterBase}${adapterNum}`;
    }
    return name;
  }
  let name = baseName;
  let counter = 1;
  while (usedIds.has(name)) {
    name = `${nodeType}:${adapter}${counter}`;
    counter++;
  }
  return name;
}

/**
 * Generate unique ID for special nodes by incrementing trailing number
 */
export function generateSpecialNodeId(baseName: string, usedIds: Set<string>): string {
  let name = baseName;
  while (usedIds.has(name)) {
    let i = name.length - 1;
    while (i >= 0 && name[i] >= '0' && name[i] <= '9') i--;
    const base = name.slice(0, i + 1) || name;
    const digits = name.slice(i + 1);
    let num = digits ? parseInt(digits, 10) : 0;
    num += 1;
    name = `${base}${num}`;
  }
  return name;
}

/**
 * Generate unique ID for regular nodes
 * If baseName has trailing number (e.g., "srl2"), start from that number
 * If baseName has no number (e.g., "srl"), start from 1 (srl1, srl2, etc.)
 */
export function generateRegularNodeId(baseName: string, usedIds: Set<string>): string {
  // Find trailing digits in baseName
  let i = baseName.length - 1;
  while (i >= 0 && baseName[i] >= '0' && baseName[i] <= '9') i--;
  const hasNumber = i < baseName.length - 1;
  const base = hasNumber ? baseName.slice(0, i + 1) : baseName;
  let num: number;
  if (hasNumber) {
    num = parseInt(baseName.slice(i + 1), 10);
  } else {
    num = 1;
  }
  while (usedIds.has(`${base}${num}`)) num++;
  return `${base}${num}`;
}

/**
 * Get a unique ID based on baseName type
 * Handles special endpoints (dummy, host:eth, macvlan:eth, etc.) and regular nodes
 */
export function getUniqueId(baseName: string, usedIds: Set<string>): string {
  if (isSpecialEndpoint(baseName)) {
    if (baseName.startsWith('dummy')) {
      return generateDummyId(baseName, usedIds);
    }
    if (baseName.includes(':')) {
      return generateAdapterNodeId(baseName, usedIds);
    }
    return generateSpecialNodeId(baseName, usedIds);
  }
  return generateRegularNodeId(baseName, usedIds);
}
