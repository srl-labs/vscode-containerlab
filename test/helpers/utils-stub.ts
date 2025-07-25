export function getSudo() {
  return '';
}

export async function getSelectedLabNode(node?: any): Promise<any> {
  // In tests, always return the node that was passed in
  return node;
}
