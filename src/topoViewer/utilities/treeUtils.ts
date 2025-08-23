// file: treeUtils.ts
// Helpers for locating nodes and interfaces in Containerlab tree data.

import { ClabLabTreeNode, ClabContainerTreeNode, ClabInterfaceTreeNode } from '../../treeView/common';

/**
 * Find a container node by name within discovered labs.
 *
 * @param labs - Map of labs indexed by name.
 * @param name - Container name to search for.
 * @param clabName - Optional lab name filter.
 * @returns Matching container node, if found.
 */
export function findContainerNode(
  labs: Record<string, ClabLabTreeNode> | undefined,
  name: string,
  clabName?: string
): ClabContainerTreeNode | undefined {
  if (!labs) {
    return undefined;
  }
  const labValues = clabName
    ? Object.values(labs).filter(l => l.name === clabName)
    : Object.values(labs);
  for (const lab of labValues) {
    const container = lab.containers?.find(
      c => c.name === name || c.name_short === name || c.label === name
    );
    if (container) {
      return container;
    }
  }
  return undefined;
}

/**
 * Find an interface node on a specific container.
 *
 * @param labs - Map of labs indexed by name.
 * @param nodeName - Name of the container node.
 * @param intf - Interface identifier.
 * @param clabName - Optional lab name filter.
 * @returns Matching interface node, if found.
 */
export function findInterfaceNode(
  labs: Record<string, ClabLabTreeNode> | undefined,
  nodeName: string,
  intf: string,
  clabName?: string
): ClabInterfaceTreeNode | undefined {
  const container = findContainerNode(labs, nodeName, clabName);
  if (!container) {
    return undefined;
  }
  return container.interfaces.find(
    i => i.name === intf || i.alias === intf || i.label === intf
  );
}
