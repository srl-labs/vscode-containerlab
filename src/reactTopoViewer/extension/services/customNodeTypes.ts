import type { CustomNodeTemplate } from "@srl-labs/clab-ui/session";

const DEPRECATED_SRLINUX_TYPE_ALIASES: Record<string, string> = {
  ixsa1: "ixs-a1",
  ixrd1: "ixr-d1",
  ixrd2: "ixr-d2",
  ixrd3: "ixr-d3",
  ixrd2l: "ixr-d2l",
  ixrd3l: "ixr-d3l",
  ixrd4: "ixr-d4",
  ixrd5: "ixr-d5",
  ixrh2: "ixr-h2",
  ixrh3: "ixr-h3",
  ixrh4: "ixr-h4",
  ixrh432d: "ixr-h4-32d",
  ixrh5: "ixr-h5",
  ixrh532d: "ixr-h5-32d",
  ixrh564d: "ixr-h5-64d",
  ixrh564o: "ixr-h5-64o",
  ixr6: "ixr-6",
  ixr6e: "ixr-6e",
  ixr10: "ixr-10",
  ixr10e: "ixr-10e",
  ixr18e: "ixr-18e",
  sxr1x44s: "sxr-1x-44s",
  sxr1d32d: "sxr-1d-32d",
  ixrx1b: "ixr-x1b",
  ixrx3b: "ixr-x3b"
};

export function normalizeCustomNodeTemplate(template: CustomNodeTemplate): CustomNodeTemplate {
  if (template.kind !== "nokia_srlinux" || typeof template.type !== "string") {
    return template;
  }

  const normalizedType = DEPRECATED_SRLINUX_TYPE_ALIASES[template.type.trim()];
  return normalizedType === undefined ? template : { ...template, type: normalizedType };
}

export function normalizeCustomNodeTemplates(
  templates: CustomNodeTemplate[]
): CustomNodeTemplate[] {
  return templates.map(normalizeCustomNodeTemplate);
}
