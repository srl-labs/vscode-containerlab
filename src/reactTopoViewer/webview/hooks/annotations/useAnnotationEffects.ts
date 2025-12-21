/**
 * Combined hook for annotation effects (background clear, group move)
 */
import { useCallback, useEffect } from 'react';
import type { Core as CyCore, EventObject } from 'cytoscape';

import { log } from '../../utils/logger';

import type { FreeTextAnnotation } from './freeText';
import { useAnnotationGroupMove } from './useAnnotationGroupMove';

interface UseAnnotationBackgroundClearOptions {
  cy: CyCore | null;
  selectedAnnotationIds: Set<string>;
  onClearSelection: () => void;
}

/**
 * Internal hook that clears annotation selection when clicking on the canvas background
 */
function useAnnotationBackgroundClear(options: UseAnnotationBackgroundClearOptions): void {
  const { cy, selectedAnnotationIds, onClearSelection } = options;

  const handleBackgroundTap = useCallback((event: EventObject) => {
    // Only handle clicks directly on the cytoscape canvas (not on nodes/edges)
    if (event.target !== cy) return;

    // Only clear if there are selected annotations
    if (selectedAnnotationIds.size > 0) {
      log.info('[AnnotationBackgroundClear] Clearing annotation selection on background tap');
      onClearSelection();
    }
  }, [cy, selectedAnnotationIds, onClearSelection]);

  useEffect(() => {
    if (!cy) return;

    cy.on('tap', handleBackgroundTap);

    return () => {
      cy.off('tap', handleBackgroundTap);
    };
  }, [cy, handleBackgroundTap]);
}

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
  // Group annotations
  groupSelectedIds?: Set<string>;
  onGroupClearSelection?: () => void;
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
  onFreeShapeClearSelection,
  groupSelectedIds,
  onGroupClearSelection
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

  // Clear group selection when clicking on canvas background
  useAnnotationBackgroundClear({
    cy,
    selectedAnnotationIds: groupSelectedIds ?? new Set(),
    onClearSelection: onGroupClearSelection ?? (() => {})
  });
}
