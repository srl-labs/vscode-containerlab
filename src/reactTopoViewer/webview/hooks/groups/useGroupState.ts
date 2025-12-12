/**
 * State management hook for groups.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import { log } from '../../utils/logger';
import { GROUP_SAVE_DEBOUNCE_MS } from './groupHelpers';
import type { UseGroupStateReturn, GroupEditorData } from './groupTypes';

export function useGroupState(): UseGroupStateReturn {
  const [groupStyles, setGroupStyles] = useState<GroupStyleAnnotation[]>([]);
  const [editingGroup, setEditingGroup] = useState<GroupEditorData | null>(null);

  const lastStyleRef = useRef<Partial<GroupStyleAnnotation>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveGroupStylesToExtension = useCallback(
    (updatedStyles: GroupStyleAnnotation[]) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        sendCommandToExtension('save-group-style-annotations', {
          annotations: updatedStyles
        });
        log.info(`[Groups] Saved ${updatedStyles.length} group styles`);
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
    groupStyles,
    setGroupStyles,
    editingGroup,
    setEditingGroup,
    saveGroupStylesToExtension,
    lastStyleRef
  };
}
