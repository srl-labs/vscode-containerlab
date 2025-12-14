/**
 * useAnnotationInteractions - Combined hook for annotation interaction state
 * Wraps drag, rotation, and resize hooks for cleaner component code
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';
import { FreeTextAnnotation } from '../../../shared/types/topology';
import { useAnnotationDrag } from './useAnnotationDrag';
import { useRotationDrag, useResizeDrag } from './useAnnotationHandles';

/**
 * Combined hook for all annotation interaction behaviors
 * @param cy - Cytoscape core instance
 * @param annotation - The annotation being interacted with
 * @param isLocked - Whether editing is locked
 * @param onPositionChange - Handler for position changes
 * @param onRotationChange - Handler for rotation changes
 * @param onSizeChange - Handler for size changes
 * @param contentRef - Ref to the content element for size calculations
 */
export function useAnnotationInteractions(
  cy: CyCore,
  annotation: FreeTextAnnotation,
  isLocked: boolean,
  onPositionChange: (position: { x: number; y: number }) => void,
  onRotationChange: (rotation: number) => void,
  onSizeChange: (width: number, height: number) => void,
  contentRef: React.RefObject<HTMLDivElement | null>
) {
  const { isDragging, renderedPos, handleMouseDown } = useAnnotationDrag({
    cy,
    modelPosition: annotation.position,
    isLocked,
    onPositionChange
  });

  const { isRotating, handleRotationMouseDown } = useRotationDrag({
    cy,
    renderedPos,
    currentRotation: annotation.rotation || 0,
    isLocked,
    onRotationChange
  });

  const { isResizing, handleResizeMouseDown } = useResizeDrag({
    renderedPos,
    currentWidth: annotation.width,
    currentHeight: annotation.height,
    contentRef,
    isLocked,
    onSizeChange
  });

  return {
    isDragging,
    isRotating,
    isResizing,
    renderedPos,
    handleMouseDown,
    handleRotationMouseDown,
    handleResizeMouseDown
  };
}
