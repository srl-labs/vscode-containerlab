/**
 * State management hook for overlay groups.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import { log } from '../../utils/logger';
import { GROUP_SAVE_DEBOUNCE_MS } from './groupHelpers';
import type { UseGroupStateReturn, GroupEditorData } from './groupTypes';

export function useGroupState(): UseGroupStateReturn {
  const [groups, setGroups] = useState<GroupStyleAnnotation[]>([]);
  const [editingGroup, setEditingGroup] = useState<GroupEditorData | null>(null);

  const lastStyleRef = useRef<Partial<GroupStyleAnnotation>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveGroupsToExtension = useCallback(
    (updatedGroups: GroupStyleAnnotation[]) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        sendCommandToExtension('save-group-style-annotations', {
          annotations: updatedGroups
        });
        log.info(`[Groups] Saved ${updatedGroups.length} overlay groups`);
      }, GROUP_SAVE_DEBOUNCE_MS);
    },
    []
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    groups,
    setGroups,
    editingGroup,
    setEditingGroup,
    saveGroupsToExtension,
    lastStyleRef
  };
}
