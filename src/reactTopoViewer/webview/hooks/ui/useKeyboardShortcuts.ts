/**
 * useKeyboardShortcuts - Hook for keyboard shortcuts
 */
import { useEffect, useCallback } from "react";

import { log } from "../../utils/logger";
import { useGraphStore } from "../../stores/graphStore";
import {
  FREE_TEXT_NODE_TYPE,
  FREE_SHAPE_NODE_TYPE,
  TRAFFIC_RATE_NODE_TYPE,
  GROUP_NODE_TYPE
} from "../../annotations/annotationNodeConverters";

interface KeyboardShortcutsOptions {
  mode: "edit" | "view";
  isLocked: boolean;
  selectedNode: string | null;
  selectedEdge: string | null;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeleteSelection?: () => void;
  onDeselectAll: () => void;
  /** Undo handler (Ctrl+Z) */
  onUndo?: () => void;
  /** Redo handler (Ctrl+Y / Ctrl+Shift+Z) */
  onRedo?: () => void;
  /** Whether undo is available */
  canUndo?: boolean;
  /** Whether redo is available */
  canRedo?: boolean;
  /** Copy handler (Ctrl+C) */
  onCopy?: () => void;
  /** Paste handler (Ctrl+V) */
  onPaste?: () => void;
  /** Duplicate handler (Ctrl+D) */
  onDuplicate?: () => void;
  /** Selected annotation IDs */
  selectedAnnotationIds?: Set<string>;
  /** Copy annotations handler */
  onCopyAnnotations?: () => void;
  /** Paste annotations handler */
  onPasteAnnotations?: () => void;
  /** Duplicate annotations handler */
  onDuplicateAnnotations?: () => void;
  /** Delete selected annotations handler */
  onDeleteAnnotations?: () => void;
  /** Clear annotation selection */
  onClearAnnotationSelection?: () => void;
  /** Check if annotation clipboard has content */
  hasAnnotationClipboard?: () => boolean;
  /** Check if graph clipboard has content */
  hasGraphClipboard?: () => boolean;
  /** Create group from selected nodes (Ctrl+G) */
  onCreateGroup?: () => void;
}

/**
 * Check if target is an input field
 */
function isInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;

  return Boolean(
    target.closest(
      [
        "input",
        "textarea",
        "[contenteditable='']",
        "[contenteditable='true']",
        "[contenteditable='plaintext-only']",
        "[role='textbox']",
        ".monaco-editor",
        ".monaco-inputbox",
        ".monaco-findInput"
      ].join(",")
    )
  );
}

/**
 * Handle Ctrl+Z: Undo
 */
function handleUndo(
  event: KeyboardEvent,
  mode: "edit" | "view",
  canUndo: boolean,
  onUndo?: () => void
): boolean {
  if (mode !== "edit") return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== "z" || event.shiftKey) return false;
  if (!canUndo || !onUndo) return false;

  log.info("[Keyboard] Undo");
  onUndo();
  event.preventDefault();
  return true;
}

/**
 * Handle Ctrl+Y or Ctrl+Shift+Z: Redo
 */
function handleRedo(
  event: KeyboardEvent,
  mode: "edit" | "view",
  canRedo: boolean,
  onRedo?: () => void
): boolean {
  if (mode !== "edit") return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (!canRedo || !onRedo) return false;

  // Ctrl+Y or Ctrl+Shift+Z
  const isCtrlY = event.key === "y";
  const isCtrlShiftZ = event.key === "z" && event.shiftKey;
  if (!isCtrlY && !isCtrlShiftZ) return false;

  log.info("[Keyboard] Redo");
  onRedo();
  event.preventDefault();
  return true;
}

/**
 * Handle Ctrl+C: Copy (nodes/edges and/or annotations)
 */
function handleCopy(
  event: KeyboardEvent,
  onCopy?: () => void,
  selectedAnnotationIds?: Set<string>,
  onCopyAnnotations?: () => void
): boolean {
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== "c") return false;

  let handled = false;

  // Copy annotations if any are selected
  if (selectedAnnotationIds && selectedAnnotationIds.size > 0 && onCopyAnnotations) {
    log.info("[Keyboard] Copy annotations");
    onCopyAnnotations();
    handled = true;
  }

  // Also copy graph elements if any are selected
  // Note: Selection state is managed by ReactFlow
  // The onCopy handler should check selection state internally
  if (onCopy) {
    log.info("[Keyboard] Copy graph elements");
    onCopy();
    handled = true;
  }

  if (handled) {
    event.preventDefault();
  }
  return handled;
}

/**
 * Handle Ctrl+V: Paste (nodes/edges and/or annotations)
 */
function handlePaste(
  event: KeyboardEvent,
  mode: "edit" | "view",
  isLocked: boolean,
  onPaste?: () => void,
  onPasteAnnotations?: () => void,
  hasAnnotationClipboard?: () => boolean,
  hasGraphClipboard?: () => boolean
): boolean {
  if (mode !== "edit") return false;
  if (isLocked) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== "v") return false;

  let handled = false;

  // Paste annotations if clipboard has any
  if (onPasteAnnotations && hasAnnotationClipboard && hasAnnotationClipboard()) {
    log.info("[Keyboard] Paste annotations");
    onPasteAnnotations();
    handled = true;
  }

  // Also paste graph elements if clipboard has any
  if (onPaste && (!hasGraphClipboard || hasGraphClipboard())) {
    log.info("[Keyboard] Paste graph elements");
    onPaste();
    handled = true;
  }

  if (handled) {
    event.preventDefault();
  }
  return handled;
}

/**
 * Handle Ctrl+D: Duplicate (nodes/edges and/or annotations)
 */
function handleDuplicate(
  event: KeyboardEvent,
  mode: "edit" | "view",
  isLocked: boolean,
  onDuplicate?: () => void,
  selectedAnnotationIds?: Set<string>,
  onDuplicateAnnotations?: () => void
): boolean {
  if (mode !== "edit") return false;
  if (isLocked) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== "d") return false;

  let handled = false;

  // Duplicate annotations if any are selected
  if (selectedAnnotationIds && selectedAnnotationIds.size > 0 && onDuplicateAnnotations) {
    log.info("[Keyboard] Duplicate annotations");
    onDuplicateAnnotations();
    handled = true;
  }

  // Also duplicate graph elements if any are selected
  // Note: Selection state is managed by ReactFlow
  // The onDuplicate handler should check selection state internally
  if (onDuplicate) {
    log.info("[Keyboard] Duplicate graph elements");
    onDuplicate();
    handled = true;
  }

  if (handled) {
    event.preventDefault();
  }
  return handled;
}

/**
 * Handle Ctrl+G: Create group from selected nodes
 * Note: Selection state and node filtering is handled by the onCreateGroup callback
 * since ReactFlow manages selection state directly
 */
function handleCreateGroup(
  event: KeyboardEvent,
  mode: "edit" | "view",
  onCreateGroup?: () => void
): boolean {
  if (mode !== "edit") return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key.toLowerCase() !== "g") return false;
  if (!onCreateGroup) return false;

  log.info("[Keyboard] Creating group from selected nodes");
  onCreateGroup();
  event.preventDefault();
  return true;
}

/**
 * Handle Ctrl+A: Select all nodes
 * Note: Selection is now handled by ReactFlow natively via its built-in select all
 * Returns true when the shortcut is recognized (but doesn't prevent default),
 * false when the key combination doesn't match.
 */
function handleSelectAll(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.key !== "a") return false;

  const target = event.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  ) {
    return false;
  }

  const { nodes, edges, setNodes, setEdges } = useGraphStore.getState();
  setNodes(nodes.map((n) => ({ ...n, selected: true })));
  setEdges(edges.map((e) => ({ ...e, selected: true })));

  log.info("[Keyboard] Select all nodes and edges");
  event.preventDefault();
  return true;
}

/**
 * Delete annotations if any are selected.
 */
function deleteSelectedAnnotations(
  selectedAnnotationIds: Set<string> | undefined,
  onDeleteAnnotations: (() => void) | undefined
): boolean {
  if (!selectedAnnotationIds || selectedAnnotationIds.size === 0 || !onDeleteAnnotations)
    return false;
  log.info(`[Keyboard] Deleting ${selectedAnnotationIds.size} annotations`);
  onDeleteAnnotations();
  return true;
}

/**
 * Delete selected elements (nodes and edges).
 * Note: Selection state is now managed by ReactFlow.
 * This function uses the selectedNode/selectedEdge params passed from the parent.
 */
function deleteSelectedElements(
  selectedNode: string | null,
  selectedEdge: string | null,
  onDeleteNode: (nodeId: string) => void,
  onDeleteEdge: (edgeId: string) => void
): boolean {
  let handled = false;

  if (!selectedNode && !selectedEdge) {
    const { nodes, edges } = useGraphStore.getState();
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);

    if (selectedNodes.length > 0) {
      log.info(`[Keyboard] Deleting ${selectedNodes.length} selected nodes`);
      selectedNodes.forEach((node) => onDeleteNode(node.id));
      return true;
    }

    if (selectedEdges.length > 0) {
      log.info(`[Keyboard] Deleting ${selectedEdges.length} selected edges`);
      selectedEdges.forEach((edge) => onDeleteEdge(edge.id));
      return true;
    }
  }

  if (selectedNode) {
    log.info(`[Keyboard] Deleting node: ${selectedNode}`);
    onDeleteNode(selectedNode);
    handled = true;
  }

  if (selectedEdge) {
    log.info(`[Keyboard] Deleting edge: ${selectedEdge}`);
    onDeleteEdge(selectedEdge);
    handled = true;
  }

  return handled;
}

function isAnnotationType(type: string | undefined): boolean {
  return (
    type === FREE_TEXT_NODE_TYPE ||
    type === FREE_SHAPE_NODE_TYPE ||
    type === GROUP_NODE_TYPE ||
    type === TRAFFIC_RATE_NODE_TYPE
  );
}

function handleDeleteInViewMode(
  event: KeyboardEvent,
  selectedNode: string | null,
  selectedEdge: string | null,
  onDeleteSelection: (() => void) | undefined,
  selectedAnnotationIds: Set<string> | undefined,
  onDeleteAnnotations: (() => void) | undefined
): boolean {
  const { nodes, edges } = useGraphStore.getState();
  const selectedNodes = nodes.filter((node) => node.selected);
  const hasSelectedEdges = edges.some((edge) => edge.selected) || Boolean(selectedEdge);
  const hasSelectedAnnotationNodes = selectedNodes.some((node) => isAnnotationType(node.type));
  const hasSelectedNonAnnotationNode = selectedNodes.some((node) => !isAnnotationType(node.type));

  // If canvas selection includes only annotation nodes, use batched delete path
  // so deletion works even when annotation UI selection is out of sync.
  if (
    onDeleteSelection &&
    hasSelectedAnnotationNodes &&
    !hasSelectedEdges &&
    !hasSelectedNonAnnotationNode &&
    !selectedNode
  ) {
    log.info("[Keyboard] Deleting selected annotation nodes (view mode)");
    onDeleteSelection();
    event.preventDefault();
    return true;
  }

  const handled = deleteSelectedAnnotations(selectedAnnotationIds, onDeleteAnnotations);
  if (handled) event.preventDefault();
  return handled;
}

function handleBatchedDeleteInEditMode(
  event: KeyboardEvent,
  selectedNode: string | null,
  selectedEdge: string | null,
  onDeleteSelection: (() => void) | undefined,
  selectedAnnotationIds: Set<string> | undefined
): boolean {
  if (!onDeleteSelection) return false;

  const { nodes, edges } = useGraphStore.getState();
  const selectedNodeIds = nodes.filter((node) => node.selected).map((node) => node.id);
  const selectedEdgeIds = edges.filter((edge) => edge.selected).map((edge) => edge.id);
  let totalSelected = selectedNodeIds.length + selectedEdgeIds.length + (selectedAnnotationIds?.size ?? 0);

  if (selectedNode && !selectedNodeIds.includes(selectedNode)) {
    totalSelected += 1;
  }
  if (selectedEdge && !selectedEdgeIds.includes(selectedEdge)) {
    totalSelected += 1;
  }

  if (totalSelected === 0) {
    return false;
  }

  log.info(`[Keyboard] Deleting ${totalSelected} selected items (batched)`);
  onDeleteSelection();
  event.preventDefault();
  return true;
}

/**
 * Handle Delete/Backspace: Delete selected element (nodes/edges and/or annotations)
 */
function handleDelete(
  event: KeyboardEvent,
  mode: "edit" | "view",
  isLocked: boolean,
  selectedNode: string | null,
  selectedEdge: string | null,
  onDeleteNode: (nodeId: string) => void,
  onDeleteEdge: (edgeId: string) => void,
  onDeleteSelection: (() => void) | undefined,
  selectedAnnotationIds?: Set<string>,
  onDeleteAnnotations?: () => void
): boolean {
  if (event.key !== "Delete" && event.key !== "Backspace") return false;
  if (isLocked) return false;

  // In view mode (running/deployed labs), allow deleting annotations only when unlocked.
  if (mode !== "edit") {
    return handleDeleteInViewMode(
      event,
      selectedNode,
      selectedEdge,
      onDeleteSelection,
      selectedAnnotationIds,
      onDeleteAnnotations
    );
  }

  if (
    handleBatchedDeleteInEditMode(
      event,
      selectedNode,
      selectedEdge,
      onDeleteSelection,
      selectedAnnotationIds
    )
  ) {
    return true;
  }

  let handled = deleteSelectedAnnotations(selectedAnnotationIds, onDeleteAnnotations);

  // Delete selected graph elements
  if (deleteSelectedElements(selectedNode, selectedEdge, onDeleteNode, onDeleteEdge)) {
    handled = true;
  }

  if (handled) event.preventDefault();
  return handled;
}

/**
 * Handle Escape: Deselect all / close panels
 */
function handleEscape(
  event: KeyboardEvent,
  selectedNode: string | null,
  selectedEdge: string | null,
  onDeselectAll: () => void,
  selectedAnnotationIds?: Set<string>,
  onClearAnnotationSelection?: () => void
): boolean {
  if (event.key !== "Escape") return false;

  // Clear annotation selection
  if (selectedAnnotationIds && selectedAnnotationIds.size > 0 && onClearAnnotationSelection) {
    log.debug("[Keyboard] Clearing annotation selection");
    onClearAnnotationSelection();
    event.preventDefault();
    return true;
  }

  // NOTE: Element deselection is handled via onDeselectAll callback
  // ReactFlow manages selection state internally
  if (selectedNode || selectedEdge) {
    log.debug("[Keyboard] Deselecting all");
    onDeselectAll();
    event.preventDefault();
    return true;
  }

  // Also clear multi-selection even when there is no single selected element
  onDeselectAll();
  event.preventDefault();
  return true;
}

/**
 * Hook for managing keyboard shortcuts
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions): void {
  const {
    mode,
    isLocked,
    selectedNode,
    selectedEdge,
    onDeleteNode,
    onDeleteEdge,
    onDeleteSelection,
    onDeselectAll,
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false,
    onCopy,
    onPaste,
    onDuplicate,
    selectedAnnotationIds,
    onCopyAnnotations,
    onPasteAnnotations,
    onDuplicateAnnotations,
    onDeleteAnnotations,
    onClearAnnotationSelection,
    hasAnnotationClipboard,
    hasGraphClipboard,
    onCreateGroup
  } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (isInputElement(event.target)) return;

      // Undo/Redo must be checked before other shortcuts
      if (handleUndo(event, mode, canUndo, onUndo)) return;
      if (handleRedo(event, mode, canRedo, onRedo)) return;
      // Copy/Paste/Duplicate (with annotation support)
      if (handleCopy(event, onCopy, selectedAnnotationIds, onCopyAnnotations)) return;
      if (
        handlePaste(
          event,
          mode,
          isLocked,
          onPaste,
          onPasteAnnotations,
          hasAnnotationClipboard,
          hasGraphClipboard
        )
      )
        return;
      if (
        handleDuplicate(
          event,
          mode,
          isLocked,
          onDuplicate,
          selectedAnnotationIds,
          onDuplicateAnnotations
        )
      )
        return;
      // Group shortcut (Ctrl+G)
      if (handleCreateGroup(event, mode, onCreateGroup)) return;
      // Other shortcuts
      if (handleSelectAll(event)) return;
      if (
        handleDelete(
          event,
          mode,
          isLocked,
          selectedNode,
          selectedEdge,
          onDeleteNode,
          onDeleteEdge,
          onDeleteSelection,
          selectedAnnotationIds,
          onDeleteAnnotations
        )
      )
        return;
      handleEscape(
        event,
        selectedNode,
        selectedEdge,
        onDeselectAll,
        selectedAnnotationIds,
        onClearAnnotationSelection
      );
    },
    [
      mode,
      isLocked,
      selectedNode,
      selectedEdge,
      onDeleteNode,
      onDeleteEdge,
      onDeleteSelection,
      onDeselectAll,
      onUndo,
      onRedo,
      canUndo,
      canRedo,
      onCopy,
      onPaste,
      onDuplicate,
      selectedAnnotationIds,
      onCopyAnnotations,
      onPasteAnnotations,
      onDuplicateAnnotations,
      onDeleteAnnotations,
      onClearAnnotationSelection,
      hasAnnotationClipboard,
      hasGraphClipboard,
      onCreateGroup
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
