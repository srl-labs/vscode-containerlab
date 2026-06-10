import type { CustomNodeTemplate } from "@srl-labs/clab-ui/session";

const NODE_TEMPLATES_EXPORT_FILE_TYPE = "clab-node-templates";

export interface MergeCustomNodeTemplatesResult {
  customNodes: CustomNodeTemplate[];
  added: number;
  replaced: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCustomNodeTemplate(value: unknown): value is CustomNodeTemplate {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.kind === "string" &&
    value.kind.trim().length > 0
  );
}

function describeFileType(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function extractTemplateEntries(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isRecord(parsed) && Array.isArray(parsed.templates)) {
    if (parsed.fileType !== undefined && parsed.fileType !== NODE_TEMPLATES_EXPORT_FILE_TYPE) {
      throw new Error(`Not a node templates file (fileType: ${describeFileType(parsed.fileType)})`);
    }
    return parsed.templates;
  }
  throw new Error('Expected a node templates file with a "templates" array');
}

export function parseCustomNodeTemplatesExport(content: string): CustomNodeTemplate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("File is not valid JSON");
  }

  const entries = extractTemplateEntries(parsed);
  if (entries.length === 0) {
    throw new Error("File contains no node templates");
  }

  const byName = new Map<string, CustomNodeTemplate>();
  for (const [index, entry] of entries.entries()) {
    if (!isCustomNodeTemplate(entry)) {
      throw new Error(`Template at index ${index} is missing a valid "name" or "kind"`);
    }
    byName.set(entry.name, entry);
  }
  return Array.from(byName.values());
}

export function mergeCustomNodeTemplates(
  existing: CustomNodeTemplate[],
  imported: CustomNodeTemplate[]
): MergeCustomNodeTemplatesResult {
  const existingDefaultName = existing.find((template) => template.setDefault === true)?.name;
  const merged = [...existing];
  let added = 0;
  let replaced = 0;

  for (const template of imported) {
    const index = merged.findIndex((entry) => entry.name === template.name);
    if (index >= 0) {
      merged[index] = template;
      replaced += 1;
    } else {
      merged.push(template);
      added += 1;
    }
  }

  const flagged = merged
    .filter((template) => template.setDefault === true)
    .map((template) => template.name);
  let defaultName: string | undefined;
  if (existingDefaultName !== undefined && flagged.includes(existingDefaultName)) {
    defaultName = existingDefaultName;
  } else {
    defaultName = existingDefaultName ?? flagged[0];
  }

  const customNodes = merged.map((template) => {
    const isDefault = template.name === defaultName;
    if ((template.setDefault === true) === isDefault) return template;
    return { ...template, setDefault: isDefault };
  });

  return { customNodes, added, replaced };
}
