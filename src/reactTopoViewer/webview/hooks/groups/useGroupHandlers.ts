/**
 * Hook for group item event handlers
 */
import type React from 'react';
import { useCallback } from 'react';

export interface UseGroupItemHandlersReturn {
  handleClick: (e: React.MouseEvent) => void;
  handleContextMenu: (e: React.MouseEvent) => void;
  handleDoubleClick: (e: React.MouseEvent) => void;
}

export function useGroupItemHandlers(
  groupId: string,
  isLocked: boolean,
  onGroupEdit: (id: string) => void,
  onGroupSelect: ((id: string) => void) | undefined,
  onGroupToggleSelect: ((id: string) => void) | undefined,
  onShowContextMenu: (groupId: string, position: { x: number; y: number }) => void
): UseGroupItemHandlersReturn {
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) return;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      onGroupToggleSelect?.(groupId);
      return;
    }
    onGroupSelect?.(groupId);
  }, [groupId, onGroupSelect, onGroupToggleSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLocked) onShowContextMenu(groupId, { x: e.clientX, y: e.clientY });
  }, [isLocked, groupId, onShowContextMenu]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLocked) onGroupEdit(groupId);
  }, [groupId, isLocked, onGroupEdit]);

  return { handleClick, handleContextMenu, handleDoubleClick };
}
