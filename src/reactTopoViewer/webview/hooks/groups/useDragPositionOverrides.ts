/**
 * Hook for managing drag position overrides during group dragging
 */
import { useState, useCallback } from 'react';

export interface UseDragPositionOverridesReturn {
  dragPositions: Record<string, { x: number; y: number }>;
  setDragPosition: (groupId: string, position: { x: number; y: number }) => void;
  clearDragPosition: (groupId: string) => void;
}

export function useDragPositionOverrides(): UseDragPositionOverridesReturn {
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});

  const setDragPosition = useCallback((groupId: string, position: { x: number; y: number }) => {
    setDragPositions(prev => ({ ...prev, [groupId]: position }));
  }, []);

  const clearDragPosition = useCallback((groupId: string) => {
    setDragPositions(prev => {
      if (!(groupId in prev)) return prev;
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
  }, []);

  return { dragPositions, setDragPosition, clearDragPosition };
}
