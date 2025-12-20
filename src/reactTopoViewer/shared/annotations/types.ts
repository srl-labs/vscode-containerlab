/**
 * Annotation type definitions for the shared annotations module.
 * Types are available from shared/types/topology directly.
 */

import type {
  FreeTextAnnotation as _FreeTextAnnotation,
  FreeShapeAnnotation as _FreeShapeAnnotation,
  GroupStyleAnnotation as _GroupStyleAnnotation,
  CloudNodeAnnotation as _CloudNodeAnnotation,
  NetworkNodeAnnotation as _NetworkNodeAnnotation,
  NodeAnnotation as _NodeAnnotation,
  AliasEndpointAnnotation as _AliasEndpointAnnotation,
  TopologyAnnotations as _TopologyAnnotations,
} from '../types/topology';

// Re-export types
export type FreeTextAnnotation = _FreeTextAnnotation;
export type FreeShapeAnnotation = _FreeShapeAnnotation;
export type GroupStyleAnnotation = _GroupStyleAnnotation;
export type CloudNodeAnnotation = _CloudNodeAnnotation;
export type NetworkNodeAnnotation = _NetworkNodeAnnotation;
export type NodeAnnotation = _NodeAnnotation;
export type AliasEndpointAnnotation = _AliasEndpointAnnotation;
export type TopologyAnnotations = _TopologyAnnotations;

/**
 * Default empty annotations object.
 */
export function createEmptyAnnotations(): TopologyAnnotations {
  return {
    freeTextAnnotations: [],
    freeShapeAnnotations: [],
    groupStyleAnnotations: [],
    networkNodeAnnotations: [],
    nodeAnnotations: [],
    aliasEndpointAnnotations: [],
  };
}
