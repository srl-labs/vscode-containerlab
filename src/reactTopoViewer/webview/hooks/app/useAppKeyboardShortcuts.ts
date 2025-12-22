/**
 * useAppKeyboardShortcuts - App-level keyboard shortcuts integration
 *
 * Extracts keyboard shortcut configuration from App.tsx:
 * - Combined selection IDs calculation
 * - useKeyboardShortcuts call with all 20+ arguments
 */
import React from 'react';
import type { Core as CyCore } from 'cytoscape';

import { useKeyboardShortcuts } from '../ui/useKeyboardShortcuts';
import type { ClipboardHandlersReturn } from './useClipboardHandlers';

/**
 * Configuration for useAppKeyboardShortcuts hook
 */
export interface AppKeyboardShortcutsConfig {
  state: {
    mode: 'edit' | 'view';
    isLocked: boolean;
    selectedNode: string | null;
    selectedEdge: string | null;
  };
  cyInstance: CyCore | null;
  undoRedo: {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
  };
  annotations: {
    selectedTextIds: Set<string>;
    selectedShapeIds: Set<string>;
    selectedGroupIds: Set<string>;
    clearAllSelections: () => void;
    handleAddGroupWithUndo: () => void;
  };
  clipboardHandlers: ClipboardHandlersReturn;
  deleteHandlers: {
    handleDeleteNodeWithUndo: (nodeId: string) => void;
    handleDeleteLinkWithUndo: (edgeId: string) => void;
  };
  handleDeselectAll: () => void;
}

/**
 * Hook that configures app-level keyboard shortcuts.
 *
 * Simplifies the 20+ argument useKeyboardShortcuts call into a structured config.
 */
export function useAppKeyboardShortcuts(config: AppKeyboardShortcutsConfig): void {
  const {
    state,
    cyInstance,
    undoRedo,
    annotations,
    clipboardHandlers,
    deleteHandlers,
    handleDeselectAll
  } = config;

  // Combined selection IDs (text + shape + group annotations)
  const combinedSelectedAnnotationIds = React.useMemo(() => {
    const combined = new Set<string>([...annotations.selectedTextIds, ...annotations.selectedShapeIds]);
    annotations.selectedGroupIds.forEach(id => combined.add(id));
    return combined;
  }, [annotations.selectedTextIds, annotations.selectedShapeIds, annotations.selectedGroupIds]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    mode: state.mode,
    isLocked: state.isLocked,
    selectedNode: state.selectedNode,
    selectedEdge: state.selectedEdge,
    cyInstance,
    onDeleteNode: deleteHandlers.handleDeleteNodeWithUndo,
    onDeleteEdge: deleteHandlers.handleDeleteLinkWithUndo,
    onDeselectAll: handleDeselectAll,
    onUndo: undoRedo.undo,
    onRedo: undoRedo.redo,
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
    onCopy: clipboardHandlers.handleUnifiedCopy,
    onPaste: clipboardHandlers.handleUnifiedPaste,
    onDuplicate: clipboardHandlers.handleUnifiedDuplicate,
    selectedAnnotationIds: combinedSelectedAnnotationIds,
    onCopyAnnotations: clipboardHandlers.handleUnifiedCopy,
    onPasteAnnotations: clipboardHandlers.handleUnifiedPaste,
    onDuplicateAnnotations: clipboardHandlers.handleUnifiedDuplicate,
    onDeleteAnnotations: clipboardHandlers.handleUnifiedDelete,
    onClearAnnotationSelection: annotations.clearAllSelections,
    hasAnnotationClipboard: clipboardHandlers.hasClipboardData,
    onCreateGroup: annotations.handleAddGroupWithUndo
  });
}
