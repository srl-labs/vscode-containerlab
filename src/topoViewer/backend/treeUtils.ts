import { ClabLabTreeNode, ClabContainerTreeNode, ClabInterfaceTreeNode } from '../../treeView/common';

export function findContainerNode(
  labs: Record<string, ClabLabTreeNode> | undefined,
  name: string
): ClabContainerTreeNode | undefined {
  if (!labs) {
    return undefined;
  }
  for (const lab of Object.values(labs)) {
    const container = lab.containers?.find(
      c => c.name === name || c.name_short === name || c.label === name
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
  intf: string
): ClabInterfaceTreeNode | undefined {
  const container = findContainerNode(labs, nodeName);
  if (!container) {
    return undefined;
  }
  return container.interfaces.find(
    i => i.name === intf || i.alias === intf || i.label === intf
  );
}
