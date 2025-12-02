export function isClabYamlFile(file: string): boolean {
  return file.endsWith('.clab.yml') || file.endsWith('.clab.yaml');
}