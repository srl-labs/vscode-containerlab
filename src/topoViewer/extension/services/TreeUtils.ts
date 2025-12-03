import { ClabLabTreeNode, ClabContainerTreeNode, ClabInterfaceTreeNode } from '../../../treeView/common';

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
      (c: ClabContainerTreeNode) =>
        c.name === name || c.name_short === name || c.label === name
    );
    if (container) {
      return container;
    }
  }
  return undefined;
}

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
    (i: ClabInterfaceTreeNode) =>
      i.name === intf || i.alias === intf || i.label === intf
  );
}
