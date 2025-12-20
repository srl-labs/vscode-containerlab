/**
 * SchemaParser - Utilities for parsing containerlab JSON schema
 *
 * Shared between VS Code extension and dev server (browser environment).
 * Contains only pure parsing functions with no environment-specific dependencies.
 */

/**
 * Custom node template from configuration
 */
export interface CustomNodeTemplate {
  name: string;
  kind: string;
  type?: string;
  image?: string;
  icon?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  baseName?: string;
  interfacePattern?: string;
  setDefault?: boolean;
}

/**
 * Schema data interface for kind/type options
 */
export interface SchemaData {
  kinds: string[];
  typesByKind: Record<string, string[]>;
}

/**
 * Extract sorted kinds from schema (Nokia first, then alphabetical)
 */
export function extractKindsFromSchema(schema: Record<string, unknown>): string[] {
  const nodeConfig = (schema.definitions as Record<string, unknown>)?.['node-config'] as Record<string, unknown>;
  const kindProp = (nodeConfig?.properties as Record<string, unknown>)?.kind as Record<string, unknown>;
  const kindsEnum = (kindProp?.enum as string[]) || [];
  const nokiaKinds = kindsEnum.filter((k: string) => k.startsWith('nokia_')).sort();
  const otherKinds = kindsEnum.filter((k: string) => !k.startsWith('nokia_')).sort();
  return [...nokiaKinds, ...otherKinds];
}

/**
 * Get kind name from schema condition pattern
 * Patterns can be "(nokia_srlinux)" or "^(nokia_srlinux)$"
 */
function getKindFromPattern(pattern: string | undefined): string | null {
  if (!pattern) return null;
  const start = pattern.indexOf('(');
  const end = pattern.indexOf(')', start + 1);
  if (start < 0 || end < 0) return null;
  return pattern.slice(start + 1, end);
}

/**
 * Extract type enum values from schema type property
 */
function getTypeEnumValues(typeProp: Record<string, unknown>): string[] {
  if (typeProp.enum) return typeProp.enum as string[];
  if (!typeProp.anyOf) return [];
  return (typeProp.anyOf as Record<string, unknown>[])
    .filter(opt => opt.enum)
    .flatMap(opt => opt.enum as string[]);
}

/**
 * Extract type options for a single condition item
 */
function extractTypesFromCondition(item: Record<string, unknown>): { kind: string; types: string[] } | null {
  const ifProps = (item?.if as Record<string, unknown>)?.properties as Record<string, unknown>;
  const kindPattern = (ifProps?.kind as Record<string, unknown>)?.pattern as string | undefined;
  const kind = getKindFromPattern(kindPattern);
  if (!kind) return null;

  const thenProps = (item?.then as Record<string, unknown>)?.properties as Record<string, unknown>;
  const typeProp = thenProps?.type as Record<string, unknown>;
  if (!typeProp) return null;

  const types = getTypeEnumValues(typeProp);
  return types.length > 0 ? { kind, types } : null;
}

/**
 * Extract types by kind from schema allOf conditions
 */
export function extractTypesByKindFromSchema(schema: Record<string, unknown>): Record<string, string[]> {
  const typesByKind: Record<string, string[]> = {};
  const nodeConfig = (schema.definitions as Record<string, unknown>)?.['node-config'] as Record<string, unknown>;
  const allOf = (nodeConfig?.allOf as Record<string, unknown>[]) || [];

  for (const item of allOf) {
    const result = extractTypesFromCondition(item);
    if (result) {
      typesByKind[result.kind] = result.types;
    }
  }
  return typesByKind;
}

/**
 * Parse schema and return SchemaData
 */
export function parseSchemaData(schema: Record<string, unknown>): SchemaData {
  return {
    kinds: extractKindsFromSchema(schema),
    typesByKind: extractTypesByKindFromSchema(schema)
  };
}
