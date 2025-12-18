/**
 * Annotation type definitions for the shared annotations module.
 * Re-exports annotation types from the main topology types file.
 */

export type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation,
  CloudNodeAnnotation,
  NetworkNodeAnnotation,
  NodeAnnotation,
  AliasEndpointAnnotation,
  TopologyAnnotations,
} from '../types/topology';

/**
 * Default empty annotations object.
 */
export function createEmptyAnnotations(): import('../types/topology').TopologyAnnotations {
  return {
    freeTextAnnotations: [],
    freeShapeAnnotations: [],
    groupStyleAnnotations: [],
    networkNodeAnnotations: [],
    nodeAnnotations: [],
    aliasEndpointAnnotations: [],
  };
}
