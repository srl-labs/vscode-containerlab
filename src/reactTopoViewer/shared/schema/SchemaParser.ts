/**
 * SchemaParser - Utilities for parsing containerlab JSON schema
 *
 * Shared between VS Code extension and dev server (browser environment).
 * Contains only pure parsing functions with no environment-specific dependencies.
 */

/**
 * SROS component types for nokia_srsim nodes
 */
export interface SrosComponentTypes {
  sfm: string[];
  cpm: string[];
  card: string[];
  mda: string[];
  xiom: string[];
  xiomMda: string[];
}

/**
 * Schema data interface for kind/type options
 */
export interface SchemaData {
  kinds: string[];
  typesByKind: Record<string, string[]>;
  srosComponentTypes: SrosComponentTypes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * Extract sorted kinds from schema (Nokia first, then alphabetical)
 */
export function extractKindsFromSchema(schema: Record<string, unknown>): string[] {
  const definitions = toRecord(schema.definitions);
  const nodeConfig = definitions ? toRecord(definitions["node-config"]) : undefined;
  const properties = nodeConfig ? toRecord(nodeConfig.properties) : undefined;
  const kindProp = properties ? toRecord(properties.kind) : undefined;
  const kindsEnum = toStringArray(kindProp?.enum);
  const nokiaKinds = kindsEnum.filter((k) => k.startsWith("nokia_")).sort();
  const otherKinds = kindsEnum.filter((k) => !k.startsWith("nokia_")).sort();
  return [...nokiaKinds, ...otherKinds];
}

/**
 * Get kind name from schema condition pattern
 * Patterns can be "(nokia_srlinux)" or "^(nokia_srlinux)$"
 */
function getKindFromPattern(pattern: string | undefined): string | null {
  if (pattern === undefined || pattern === "") return null;
  const start = pattern.indexOf("(");
  const end = pattern.indexOf(")", start + 1);
  if (start < 0 || end < 0) return null;
  return pattern.slice(start + 1, end);
}

/**
 * Extract type enum values from schema type property
 */
function getTypeEnumValues(typeProp: Record<string, unknown>): string[] {
  const enumValues = toStringArray(typeProp.enum);
  if (enumValues.length > 0) return enumValues;
  if (!Array.isArray(typeProp.anyOf)) return [];
  return typeProp.anyOf
    .filter(isRecord)
    .flatMap((opt) => toStringArray(opt.enum));
}

/**
 * Extract type options for a single condition item
 */
function extractTypesFromCondition(
  item: Record<string, unknown>
): { kind: string; types: string[] } | null {
  const ifConfig = toRecord(item.if);
  const ifProps = ifConfig ? toRecord(ifConfig.properties) : undefined;
  const kindConfig = ifProps ? toRecord(ifProps.kind) : undefined;
  const kindPattern = toString(kindConfig?.pattern);
  const kind = getKindFromPattern(kindPattern);
  if (kind === null) return null;

  const thenConfig = toRecord(item.then);
  const thenProps = thenConfig ? toRecord(thenConfig.properties) : undefined;
  const typeProp = thenProps ? toRecord(thenProps.type) : undefined;
  if (typeProp === undefined) return null;

  const types = getTypeEnumValues(typeProp);
  return types.length > 0 ? { kind, types } : null;
}

/**
 * Extract types by kind from schema allOf conditions
 */
export function extractTypesByKindFromSchema(
  schema: Record<string, unknown>
): Record<string, string[]> {
  const typesByKind: Record<string, string[]> = {};
  const definitions = toRecord(schema.definitions);
  const nodeConfig = definitions ? toRecord(definitions["node-config"]) : undefined;
  const allOf = Array.isArray(nodeConfig?.allOf)
    ? nodeConfig.allOf.filter(isRecord)
    : [];

  for (const item of allOf) {
    const result = extractTypesFromCondition(item);
    if (result !== null) {
      typesByKind[result.kind] = result.types;
    }
  }
  return typesByKind;
}

/**
 * Extract SROS component types from schema definitions
 */
export function extractSrosComponentTypes(schema: Record<string, unknown>): SrosComponentTypes {
  const defs = toRecord(schema.definitions) ?? {};

  const getEnumFromDef = (defName: string): string[] => {
    const def = toRecord(defs[defName]);
    return toStringArray(def?.enum);
  };

  return {
    sfm: getEnumFromDef("sros-sfm-types"),
    cpm: getEnumFromDef("sros-cpm-types"),
    card: getEnumFromDef("sros-card-types"),
    mda: getEnumFromDef("sros-mda-types"),
    xiom: getEnumFromDef("sros-xiom-types"),
    xiomMda: getEnumFromDef("sros-xiom-mda-types")
  };
}

/**
 * Parse schema and return SchemaData
 */
export function parseSchemaData(schema: Record<string, unknown>): SchemaData {
  return {
    kinds: extractKindsFromSchema(schema),
    typesByKind: extractTypesByKindFromSchema(schema),
    srosComponentTypes: extractSrosComponentTypes(schema)
  };
}
