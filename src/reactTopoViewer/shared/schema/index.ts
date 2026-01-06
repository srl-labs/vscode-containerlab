/**
 * Shared schema module
 */
export type { CustomNodeTemplate } from '../types/editors.js';
export type { SchemaData, SrosComponentTypes } from './SchemaParser';
export {
  extractKindsFromSchema,
  extractTypesByKindFromSchema,
  extractSrosComponentTypes,
  parseSchemaData,
} from './SchemaParser';
