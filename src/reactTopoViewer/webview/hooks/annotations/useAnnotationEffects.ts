/**
 * Combined hook for annotation effects (background clear, group move)
 */
import type { Core as CyCore } from 'cytoscape';
import type { FreeTextAnnotation } from './freeTextTypes';
import { useAnnotationGroupMove } from './useAnnotationGroupMove';
import { useAnnotationBackgroundClear } from './useAnnotationBackgroundClear';

interface AnnotationEffectsOptions {
  cy: CyCore | null;
  isLocked: boolean;
  // Free text annotations
  freeTextAnnotations: FreeTextAnnotation[];
  freeTextSelectedIds: Set<string>;
  onFreeTextPositionChange: (id: string, position: { x: number; y: number }) => void;
  onFreeTextClearSelection: () => void;
  // Free shape annotations
  freeShapeSelectedIds: Set<string>;
  onFreeShapeClearSelection: () => void;
}

/**
 * Combines annotation effects to reduce complexity in App.tsx
 */
export function useAnnotationEffects({
  cy,
  isLocked,
  freeTextAnnotations,
  freeTextSelectedIds,
  onFreeTextPositionChange,
  onFreeTextClearSelection,
  freeShapeSelectedIds,
  onFreeShapeClearSelection
}: AnnotationEffectsOptions): void {
  // Enable synchronized movement of annotations with nodes during drag
  useAnnotationGroupMove({
    cy,
    annotations: freeTextAnnotations,
    selectedAnnotationIds: freeTextSelectedIds,
    onPositionChange: onFreeTextPositionChange,
    isLocked
  });

  // Clear free text annotation selection when clicking on canvas background
  useAnnotationBackgroundClear({
    cy,
    selectedAnnotationIds: freeTextSelectedIds,
    onClearSelection: onFreeTextClearSelection
  });

  // Clear free shape selection when clicking on canvas background
  useAnnotationBackgroundClear({
    cy,
    selectedAnnotationIds: freeShapeSelectedIds,
    onClearSelection: onFreeShapeClearSelection
  });
}
