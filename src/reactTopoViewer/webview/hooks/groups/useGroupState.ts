/**
 * State management hook for overlay groups.
 */
import { useState, useCallback, useRef, useEffect } from "react";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import { saveGroupStyleAnnotations as saveGroupsToIO } from "../../services";
import { log } from "../../utils/logger";

import { GROUP_SAVE_DEBOUNCE_MS } from "./groupHelpers";
import type { UseGroupStateReturn, GroupEditorData } from "./groupTypes";

export function useGroupState(): UseGroupStateReturn {
  const [groups, setGroups] = useState<GroupStyleAnnotation[]>([]);
  const [editingGroup, setEditingGroup] = useState<GroupEditorData | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  const lastStyleRef = useRef<Partial<GroupStyleAnnotation>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveGroupsToExtension = useCallback((updatedGroups: GroupStyleAnnotation[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveGroupsToIO(updatedGroups).catch((err) => {
        log.error(`[Groups] Failed to save groups: ${err}`);
      });
      log.info(`[Groups] Saved ${updatedGroups.length} overlay groups`);
    }, GROUP_SAVE_DEBOUNCE_MS);
  }, []);

  // Selection operations
  const selectGroup = useCallback((id: string) => {
    setSelectedGroupIds(new Set([id]));
    log.info(`[Groups] Selected group: ${id}`);
  }, []);

  const toggleGroupSelection = useCallback((id: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        log.info(`[Groups] Deselected group: ${id}`);
      } else {
        next.add(id);
        log.info(`[Groups] Added group to selection: ${id}`);
      }
      return next;
    });
  }, []);

  const boxSelectGroups = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    log.info(`[Groups] Box selected ${ids.length} groups`);
  }, []);

  const clearGroupSelection = useCallback(() => {
    setSelectedGroupIds(new Set());
    log.info("[Groups] Cleared group selection");
  }, []);

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
    lastStyleRef,
    selectedGroupIds,
    selectGroup,
    toggleGroupSelection,
    boxSelectGroups,
    clearGroupSelection
  };
}
