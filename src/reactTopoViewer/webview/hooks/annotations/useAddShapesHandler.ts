/**
 * Hook for handling add shapes action with lock checking
 */
import React from 'react';
import type { FreeShapeAnnotation } from '../../../shared/types/topology';

interface UseAddShapesHandlerParams {
  isLocked: boolean;
  onLockedAction: () => void;
  enableAddShapeMode: (shapeType: FreeShapeAnnotation['shapeType']) => void;
}

function normalizeShapeType(shapeType: string | undefined): FreeShapeAnnotation['shapeType'] {
  if (shapeType === 'circle' || shapeType === 'line' || shapeType === 'rectangle') {
    return shapeType;
  }
  return 'rectangle';
}

export function useAddShapesHandler({
  isLocked,
  onLockedAction,
  enableAddShapeMode
}: UseAddShapesHandlerParams): (shapeType?: string) => void {
  return React.useCallback((shapeType?: string) => {
    if (isLocked) {
      onLockedAction();
      return;
    }
    const normalized = normalizeShapeType(shapeType);
    enableAddShapeMode(normalized);
  }, [isLocked, onLockedAction, enableAddShapeMode]);
}
