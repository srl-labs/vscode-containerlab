/**
 * Shared Annotations Module
 *
 * This module provides VS Code-free annotation parsing and merging utilities
 * that can be used by both the production extension and the dev server.
 */

// Types
export type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation,
  CloudNodeAnnotation,
  NetworkNodeAnnotation,
  NodeAnnotation,
  AliasEndpointAnnotation,
  TopologyAnnotations
} from "./types";

// Utilities
export { createEmptyAnnotations } from "./types";
