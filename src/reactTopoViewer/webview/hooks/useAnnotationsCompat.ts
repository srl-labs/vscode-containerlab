/**
 * useAnnotationsCompat - Compatibility hook providing annotation functionality with Zustand stores
 *
 * This hook provides the same interface as the old useAnnotations() hook
 * from AnnotationContext but uses the graphStore and annotationUIStore.
 */
import { useCallback, useMemo, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/types/topology";
import type { GroupEditorData } from "./groups/groupTypes";
import { useDerivedAnnotations } from "./useDerivedAnnotations";
import { findDeepestGroupAtPosition, findParentGroupForBounds, generateGroupId } from "./groups";
import {
  DEFAULT_FILL_COLOR,
  DEFAULT_FILL_OPACITY,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_STYLE
} from "../utils/annotations/constants";
import { normalizeShapeAnnotationColors } from "../utils/color";
import { freeTextToNode, freeShapeToNode, groupToNode } from "../utils/annotationNodeConverters";
import { log } from "../utils/logger";
import { useGraphStore } from "../stores/graphStore";
import { useTopoViewerStore } from "../stores/topoViewerStore";
import { useAnnotationUIStore } from "../stores/annotationUIStore";
import { useUndoRedoStore } from "../stores/undoRedoStore";

// ============================================================================
// Types
// ============================================================================

export interface AnnotationStateContextValue {
  groups: GroupStyleAnnotation[];
  selectedGroupIds: Set<string>;
  editingGroup: GroupEditorData | null;
  textAnnotations: FreeTextAnnotation[];
  selectedTextIds: Set<string>;
  editingTextAnnotation: FreeTextAnnotation | null;
  isAddTextMode: boolean;
  shapeAnnotations: FreeShapeAnnotation[];
  selectedShapeIds: Set<string>;
  editingShapeAnnotation: FreeShapeAnnotation | null;
  isAddShapeMode: boolean;
  pendingShapeType: "rectangle" | "circle" | "line";
}

export interface AnnotationActionsContextValue {
  // Groups
  selectGroup: (id: string) => void;
  toggleGroupSelection: (id: string) => void;
  boxSelectGroups: (ids: string[]) => void;
  clearGroupSelection: () => void;
  editGroup: (id: string) => void;
  closeGroupEditor: () => void;
  saveGroup: (data: GroupEditorData) => void;
  deleteGroup: (id: string) => void;
  updateGroup: (id: string, updates: Partial<GroupStyleAnnotation>) => void;
  updateGroupParent: (id: string, parentId: string | null) => void;
  updateGroupGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  getNodeMembership: (nodeId: string) => string | null;
  getGroupMembers: (groupId: string) => string[];
  handleAddGroup: () => void;
  generateGroupId: () => string;
  addGroup: (group: GroupStyleAnnotation) => void;
  updateGroupSize: (id: string, width: number, height: number) => void;

  // Text annotations
  handleAddText: () => void;
  disableAddTextMode: () => void;
  selectTextAnnotation: (id: string) => void;
  toggleTextAnnotationSelection: (id: string) => void;
  boxSelectTextAnnotations: (ids: string[]) => void;
  clearTextAnnotationSelection: () => void;
  editTextAnnotation: (id: string) => void;
  closeTextEditor: () => void;
  saveTextAnnotation: (annotation: FreeTextAnnotation) => void;
  deleteTextAnnotation: (id: string) => void;
  deleteSelectedTextAnnotations: () => void;
  updateTextRotation: (id: string, rotation: number) => void;
  onTextRotationStart: (id: string) => void;
  onTextRotationEnd: (id: string) => void;
  updateTextSize: (id: string, width: number, height: number) => void;
  updateTextGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateTextAnnotation: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  handleTextCanvasClick: (position: { x: number; y: number }) => void;

  // Shape annotations
  handleAddShapes: (shapeType?: string) => void;
  disableAddShapeMode: () => void;
  selectShapeAnnotation: (id: string) => void;
  toggleShapeAnnotationSelection: (id: string) => void;
  boxSelectShapeAnnotations: (ids: string[]) => void;
  clearShapeAnnotationSelection: () => void;
  editShapeAnnotation: (id: string) => void;
  closeShapeEditor: () => void;
  saveShapeAnnotation: (annotation: FreeShapeAnnotation) => void;
  deleteShapeAnnotation: (id: string) => void;
  deleteSelectedShapeAnnotations: () => void;
  updateShapeRotation: (id: string, rotation: number) => void;
  onShapeRotationStart: (id: string) => void;
  onShapeRotationEnd: (id: string) => void;
  updateShapeSize: (id: string, width: number, height: number) => void;
  updateShapeEndPosition: (id: string, endPosition: { x: number; y: number }) => void;
  updateShapeGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateShapeEndGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateShapeAnnotation: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
  handleShapeCanvasClick: (position: { x: number; y: number }) => void;

  // Membership
  onNodeDropped: (nodeId: string, position: { x: number; y: number }) => void;

  // Utilities
  clearAllSelections: () => void;
  deleteAllSelected: () => void;
}

export type AnnotationContextValue = AnnotationStateContextValue & AnnotationActionsContextValue;

// ============================================================================
// Helper functions
// ============================================================================

function calculateGroupBoundsFromNodes(
  selectedNodes: Array<{
    id: string;
    position: { x: number; y: number };
    measured?: { width?: number; height?: number };
  }>,
  padding: number
): { position: { x: number; y: number }; width: number; height: number; members: string[] } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const members: string[] = [];

  for (const node of selectedNodes) {
    const nodeWidth = node.measured?.width ?? 100;
    const nodeHeight = node.measured?.height ?? 100;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + nodeWidth);
    maxY = Math.max(maxY, node.position.y + nodeHeight);
    members.push(node.id);
  }

  return {
    position: { x: minX - padding, y: minY - padding },
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    members
  };
}

function calculateDefaultGroupPosition(viewport: { x: number; y: number; zoom: number }): {
  position: { x: number; y: number };
  width: number;
  height: number;
  members: string[];
} {
  return {
    position: { x: -viewport.x / viewport.zoom + 200, y: -viewport.y / viewport.zoom + 200 },
    width: 300,
    height: 200,
    members: []
  };
}

function handleAnnotationNodeDrop(
  nodeId: string,
  targetGroupId: string | null,
  annotationList: Array<{ id: string; groupId?: string }>,
  updateFn: (id: string, updates: { groupId?: string }) => void
): boolean {
  const annotation = annotationList.find((a) => a.id === nodeId);
  const currentGroupId = annotation?.groupId ?? null;
  if (currentGroupId !== targetGroupId) {
    updateFn(nodeId, { groupId: targetGroupId ?? undefined });
  }
  return true;
}

function handleTopologyNodeDrop(
  nodeId: string,
  targetGroupId: string | null,
  currentGroupId: string | null,
  addToGroup: (nodeId: string, groupId: string) => void,
  removeFromGroup: (nodeId: string) => void
): void {
  if (currentGroupId === targetGroupId) return;

  if (targetGroupId) {
    addToGroup(nodeId, targetGroupId);
  } else {
    removeFromGroup(nodeId);
  }
}

// ============================================================================
// Main Hook
// ============================================================================

interface UseAnnotationsParams {
  rfInstance: ReactFlowInstance | null;
  onLockedAction?: () => void;
}

export function useAnnotations(params?: UseAnnotationsParams): AnnotationContextValue {
  const rfInstance = params?.rfInstance ?? null;
  const onLockedAction = params?.onLockedAction ?? (() => {});

  // Get state from stores
  const mode = useTopoViewerStore((s) => s.mode);
  const isLocked = useTopoViewerStore((s) => s.isLocked);

  const uiStore = useAnnotationUIStore();
  const undoRedo = useUndoRedoStore.getState();

  // Use reactive graph state
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  // Get graph context value for derived annotations
  const graph = useMemo(() => {
    const store = useGraphStore.getState();
    return {
      nodes,
      edges,
      setNodes: store.setNodes,
      setEdges: store.setEdges,
      onNodesChange: store.onNodesChange,
      onEdgesChange: store.onEdgesChange,
      addNode: store.addNode,
      addEdge: store.addEdge,
      removeNode: store.removeNode,
      removeEdge: store.removeEdge,
      removeNodeAndEdges: store.removeNodeAndEdges,
      updateNodePositions: store.updateNodePositions,
      updateNodeData: store.updateNodeData,
      renameNode: store.renameNode,
      updateNode: store.updateNode,
      replaceNode: store.replaceNode,
      updateEdge: store.updateEdge,
      updateEdgeData: store.updateEdgeData
    };
  }, [nodes, edges]);

  // Derived annotations from graph state
  const derived = useDerivedAnnotations(graph);

  // Style refs for remembering last used styles
  const lastTextStyleRef = useRef<Partial<FreeTextAnnotation>>({});
  const lastShapeStyleRef = useRef<Partial<FreeShapeAnnotation>>({});

  // Rotation snapshot refs
  const textRotationSnapshotRef = useRef<{
    id: string;
    snapshot: ReturnType<typeof undoRedo.captureSnapshot>;
  } | null>(null);
  const shapeRotationSnapshotRef = useRef<{
    id: string;
    snapshot: ReturnType<typeof undoRedo.captureSnapshot>;
  } | null>(null);

  // ============================================================================
  // Group Actions
  // ============================================================================

  const editGroup = useCallback(
    (id: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      const group = derived.groups.find((g) => g.id === id);
      if (group) {
        uiStore.setEditingGroup({
          id: group.id,
          name: group.name,
          level: group.level ?? "1",
          style: {
            backgroundColor: group.backgroundColor,
            backgroundOpacity: group.backgroundOpacity,
            borderColor: group.borderColor,
            borderWidth: group.borderWidth,
            borderStyle: group.borderStyle,
            borderRadius: group.borderRadius,
            labelColor: group.labelColor,
            labelPosition: group.labelPosition
          },
          position: group.position,
          width: group.width ?? 200,
          height: group.height ?? 150
        });
      }
    },
    [mode, isLocked, onLockedAction, derived.groups, uiStore]
  );

  const saveGroup = useCallback(
    (data: GroupEditorData) => {
      const group = derived.groups.find((g) => g.id === data.id);
      if (!group) return;

      const memberIds = derived.getGroupMembers(data.id);
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [data.id, ...memberIds] });

      derived.updateGroup(data.id, {
        name: data.name,
        level: data.level,
        position: data.position,
        width: data.width,
        height: data.height,
        backgroundColor: data.style.backgroundColor,
        backgroundOpacity: data.style.backgroundOpacity,
        borderColor: data.style.borderColor,
        borderWidth: data.style.borderWidth,
        borderStyle: data.style.borderStyle,
        borderRadius: data.style.borderRadius,
        labelColor: data.style.labelColor,
        labelPosition: data.style.labelPosition
      });
      uiStore.closeGroupEditor();

      const updatedGroup: GroupStyleAnnotation = {
        ...group,
        name: data.name,
        level: data.level,
        position: data.position,
        width: data.width,
        height: data.height,
        backgroundColor: data.style.backgroundColor,
        backgroundOpacity: data.style.backgroundOpacity,
        borderColor: data.style.borderColor,
        borderWidth: data.style.borderWidth,
        borderStyle: data.style.borderStyle,
        borderRadius: data.style.borderRadius,
        labelColor: data.style.labelColor,
        labelPosition: data.style.labelPosition
      };
      const node = groupToNode(updatedGroup);

      undoRedo.commitChange(snapshot, `Edit group ${data.name ?? data.id}`, {
        explicitNodes: [node]
      });
    },
    [derived, uiStore, undoRedo]
  );

  const deleteGroup = useCallback(
    (id: string) => {
      const group = derived.groups.find((g) => g.id === id);
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      derived.deleteGroup(id);
      uiStore.removeFromGroupSelection(id);
      if (group) {
        undoRedo.commitChange(snapshot, `Delete group ${group.name ?? group.id}`, {
          explicitNodes: []
        });
      }
    },
    [derived, uiStore, undoRedo]
  );

  const handleAddGroup = useCallback(() => {
    if (mode !== "edit") return;
    if (isLocked) {
      onLockedAction();
      return;
    }

    const viewport = rfInstance?.getViewport() ?? { x: 0, y: 0, zoom: 1 };
    const newGroupId = generateGroupId(derived.groups);
    const PADDING = 40;

    const rfNodes = rfInstance?.getNodes() ?? [];
    const selectedNodes = rfNodes.filter((n) => n.selected && n.type !== "group");

    const { position, width, height, members } =
      selectedNodes.length > 0
        ? calculateGroupBoundsFromNodes(selectedNodes, PADDING)
        : calculateDefaultGroupPosition(viewport);

    const parentGroup = findParentGroupForBounds(
      { x: position.x, y: position.y, width, height },
      derived.groups,
      newGroupId
    );

    const newGroup: GroupStyleAnnotation = {
      id: newGroupId,
      name: "New Group",
      level: "1",
      position,
      width,
      height,
      backgroundColor: "rgba(100, 100, 255, 0.1)",
      borderColor: "#666",
      borderWidth: 2,
      borderStyle: "dashed",
      borderRadius: 8,
      members,
      ...(parentGroup ? { parentId: parentGroup.id } : {})
    };
    const snapshot = undoRedo.captureSnapshot({ nodeIds: [newGroupId, ...members] });
    derived.addGroup(newGroup);
    if (members.length > 0) {
      for (const memberId of members) {
        derived.addNodeToGroup(memberId, newGroupId);
      }
    }
    const node = groupToNode(newGroup);
    undoRedo.commitChange(snapshot, `Add group ${newGroup.name ?? newGroup.id}`, {
      explicitNodes: [node]
    });
  }, [mode, isLocked, onLockedAction, rfInstance, derived, undoRedo]);

  const addGroup = useCallback(
    (group: GroupStyleAnnotation) => {
      const memberIds = Array.isArray(group.members) ? (group.members as string[]) : [];
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [group.id, ...memberIds] });
      derived.addGroup(group);
      if (memberIds.length > 0) {
        for (const memberId of memberIds) {
          derived.addNodeToGroup(memberId, group.id);
        }
      }
      const node = groupToNode(group);
      undoRedo.commitChange(snapshot, `Add group ${group.name ?? group.id}`, {
        explicitNodes: [node]
      });
    },
    [derived, undoRedo]
  );

  const updateGroupSize = useCallback(
    (id: string, width: number, height: number) => {
      const group = derived.groups.find((g) => g.id === id);
      if (!group) return;
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      derived.updateGroup(id, { width, height });
      const updatedGroup: GroupStyleAnnotation = { ...group, width, height };
      const node = groupToNode(updatedGroup);
      undoRedo.commitChange(snapshot, `Resize group ${id}`, {
        explicitNodes: [node]
      });
    },
    [derived, undoRedo]
  );

  // ============================================================================
  // Text Annotation Actions
  // ============================================================================

  const handleAddText = useCallback(() => {
    if (mode !== "edit") return;
    if (isLocked) {
      onLockedAction();
      return;
    }
    uiStore.setAddTextMode(true);
  }, [mode, isLocked, onLockedAction, uiStore]);

  const editTextAnnotation = useCallback(
    (id: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      const annotation = derived.textAnnotations.find((a) => a.id === id);
      if (annotation) {
        uiStore.setEditingTextAnnotation(annotation);
      }
    },
    [mode, isLocked, onLockedAction, derived.textAnnotations, uiStore]
  );

  const saveTextAnnotation = useCallback(
    (annotation: FreeTextAnnotation) => {
      const isNew = !derived.textAnnotations.some((t) => t.id === annotation.id);
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [annotation.id] });

      if (isNew) {
        derived.addTextAnnotation(annotation);
      } else {
        derived.updateTextAnnotation(annotation.id, annotation);
      }

      lastTextStyleRef.current = {
        fontSize: annotation.fontSize,
        fontColor: annotation.fontColor,
        backgroundColor: annotation.backgroundColor,
        fontWeight: annotation.fontWeight,
        fontStyle: annotation.fontStyle,
        textDecoration: annotation.textDecoration,
        textAlign: annotation.textAlign,
        fontFamily: annotation.fontFamily
      };
      uiStore.closeTextEditor();

      const node = freeTextToNode(annotation);
      undoRedo.commitChange(
        snapshot,
        isNew ? `Add text ${annotation.id}` : `Update text ${annotation.id}`,
        { explicitNodes: [node] }
      );
    },
    [derived, uiStore, undoRedo]
  );

  const deleteTextAnnotation = useCallback(
    (id: string) => {
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      derived.deleteTextAnnotation(id);
      uiStore.removeFromTextSelection(id);
      undoRedo.commitChange(snapshot, `Delete text ${id}`, { explicitNodes: [] });
    },
    [derived, uiStore, undoRedo]
  );

  const deleteSelectedTextAnnotations = useCallback(() => {
    const ids = Array.from(uiStore.selectedTextIds);
    if (ids.length === 0) return;
    const snapshot = undoRedo.captureSnapshot({ nodeIds: ids });
    ids.forEach((id) => {
      derived.deleteTextAnnotation(id);
      uiStore.removeFromTextSelection(id);
    });
    undoRedo.commitChange(
      snapshot,
      `Delete ${ids.length} text annotation${ids.length === 1 ? "" : "s"}`,
      {
        explicitNodes: []
      }
    );
  }, [derived, uiStore, undoRedo]);

  const onTextRotationStart = useCallback(
    (id: string) => {
      textRotationSnapshotRef.current = {
        id,
        snapshot: undoRedo.captureSnapshot({ nodeIds: [id] })
      };
    },
    [undoRedo]
  );

  const onTextRotationEnd = useCallback(
    (id: string) => {
      if (textRotationSnapshotRef.current && textRotationSnapshotRef.current.id === id) {
        const annotation = derived.textAnnotations.find((a) => a.id === id);
        if (annotation) {
          const node = freeTextToNode(annotation);
          undoRedo.commitChange(textRotationSnapshotRef.current.snapshot, `Rotate text ${id}`, {
            explicitNodes: [node]
          });
        }
        textRotationSnapshotRef.current = null;
      }
    },
    [derived.textAnnotations, undoRedo]
  );

  const handleTextCanvasClick = useCallback(
    (position: { x: number; y: number }) => {
      if (!uiStore.isAddTextMode) return;
      const parentGroup = findDeepestGroupAtPosition(position, derived.groups);
      const newAnnotation: FreeTextAnnotation = {
        id: `freeText_${Date.now()}`,
        text: "",
        position,
        fontSize: lastTextStyleRef.current.fontSize ?? 14,
        fontColor: lastTextStyleRef.current.fontColor ?? "#ffffff",
        backgroundColor: lastTextStyleRef.current.backgroundColor,
        fontWeight: lastTextStyleRef.current.fontWeight ?? "normal",
        fontStyle: lastTextStyleRef.current.fontStyle ?? "normal",
        textDecoration: lastTextStyleRef.current.textDecoration ?? "none",
        textAlign: lastTextStyleRef.current.textAlign ?? "left",
        fontFamily: lastTextStyleRef.current.fontFamily ?? "Arial",
        groupId: parentGroup?.id
      };
      uiStore.setEditingTextAnnotation(newAnnotation);
      uiStore.disableAddTextMode();
      log.info(`[FreeText] Creating annotation at (${position.x}, ${position.y})`);
    },
    [uiStore, derived.groups]
  );

  // ============================================================================
  // Shape Annotation Actions
  // ============================================================================

  const handleAddShapes = useCallback(
    (shapeType?: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      const validType =
        shapeType === "rectangle" || shapeType === "circle" || shapeType === "line"
          ? shapeType
          : undefined;
      uiStore.setAddShapeMode(true, validType);
    },
    [mode, isLocked, onLockedAction, uiStore]
  );

  const editShapeAnnotation = useCallback(
    (id: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      const annotation = derived.shapeAnnotations.find((a) => a.id === id);
      if (annotation) {
        uiStore.setEditingShapeAnnotation(annotation);
      }
    },
    [mode, isLocked, onLockedAction, derived.shapeAnnotations, uiStore]
  );

  const saveShapeAnnotation = useCallback(
    (annotation: FreeShapeAnnotation) => {
      const isNew = !derived.shapeAnnotations.some((s) => s.id === annotation.id);
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [annotation.id] });
      const normalized = normalizeShapeAnnotationColors(annotation);

      if (isNew) {
        derived.addShapeAnnotation(normalized);
      } else {
        derived.updateShapeAnnotation(normalized.id, normalized);
      }

      lastShapeStyleRef.current = {
        fillColor: normalized.fillColor,
        fillOpacity: normalized.fillOpacity,
        borderColor: normalized.borderColor,
        borderWidth: normalized.borderWidth,
        borderStyle: normalized.borderStyle
      };
      uiStore.closeShapeEditor();

      const node = freeShapeToNode(normalized);
      undoRedo.commitChange(
        snapshot,
        isNew ? `Add shape ${annotation.id}` : `Update shape ${annotation.id}`,
        { explicitNodes: [node] }
      );
    },
    [derived, uiStore, undoRedo]
  );

  const deleteShapeAnnotation = useCallback(
    (id: string) => {
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      derived.deleteShapeAnnotation(id);
      uiStore.removeFromShapeSelection(id);
      undoRedo.commitChange(snapshot, `Delete shape ${id}`, { explicitNodes: [] });
    },
    [derived, uiStore, undoRedo]
  );

  const deleteSelectedShapeAnnotations = useCallback(() => {
    const ids = Array.from(uiStore.selectedShapeIds);
    if (ids.length === 0) return;
    const snapshot = undoRedo.captureSnapshot({ nodeIds: ids });
    ids.forEach((id) => {
      derived.deleteShapeAnnotation(id);
      uiStore.removeFromShapeSelection(id);
    });
    undoRedo.commitChange(snapshot, `Delete ${ids.length} shape${ids.length === 1 ? "" : "s"}`, {
      explicitNodes: []
    });
  }, [derived, uiStore, undoRedo]);

  const onShapeRotationStart = useCallback(
    (id: string) => {
      shapeRotationSnapshotRef.current = {
        id,
        snapshot: undoRedo.captureSnapshot({ nodeIds: [id] })
      };
    },
    [undoRedo]
  );

  const onShapeRotationEnd = useCallback(
    (id: string) => {
      if (shapeRotationSnapshotRef.current && shapeRotationSnapshotRef.current.id === id) {
        const annotation = derived.shapeAnnotations.find((a) => a.id === id);
        if (annotation) {
          const node = freeShapeToNode(annotation);
          undoRedo.commitChange(shapeRotationSnapshotRef.current.snapshot, `Rotate shape ${id}`, {
            explicitNodes: [node]
          });
        }
        shapeRotationSnapshotRef.current = null;
      }
    },
    [derived.shapeAnnotations, undoRedo]
  );

  const updateShapeSize = useCallback(
    (id: string, width: number, height: number) => {
      const shape = derived.shapeAnnotations.find((s) => s.id === id);
      if (!shape) return;
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      derived.updateShapeAnnotation(id, { width, height });
      const updatedShape: FreeShapeAnnotation = { ...shape, width, height };
      const node = freeShapeToNode(updatedShape);
      undoRedo.commitChange(snapshot, `Resize shape ${id}`, {
        explicitNodes: [node]
      });
    },
    [derived, undoRedo]
  );

  const handleShapeCanvasClick = useCallback(
    (position: { x: number; y: number }) => {
      if (!uiStore.isAddShapeMode) return;
      const parentGroup = findDeepestGroupAtPosition(position, derived.groups);
      const pendingShapeType = uiStore.pendingShapeType;
      const newAnnotation: FreeShapeAnnotation = {
        id: `freeShape_${Date.now()}`,
        shapeType: pendingShapeType,
        position,
        width: pendingShapeType === "line" ? undefined : 100,
        height: pendingShapeType === "line" ? undefined : 100,
        endPosition:
          pendingShapeType === "line" ? { x: position.x + 150, y: position.y } : undefined,
        fillColor: lastShapeStyleRef.current.fillColor ?? DEFAULT_FILL_COLOR,
        fillOpacity: lastShapeStyleRef.current.fillOpacity ?? DEFAULT_FILL_OPACITY,
        borderColor: lastShapeStyleRef.current.borderColor ?? DEFAULT_BORDER_COLOR,
        borderWidth: lastShapeStyleRef.current.borderWidth ?? DEFAULT_BORDER_WIDTH,
        borderStyle: lastShapeStyleRef.current.borderStyle ?? DEFAULT_BORDER_STYLE,
        groupId: parentGroup?.id
      };
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [newAnnotation.id] });
      derived.addShapeAnnotation(newAnnotation);
      const node = freeShapeToNode(newAnnotation);
      undoRedo.commitChange(snapshot, `Add shape ${newAnnotation.id}`, {
        explicitNodes: [node]
      });
      uiStore.disableAddShapeMode();
      log.info(`[FreeShape] Creating ${pendingShapeType} at (${position.x}, ${position.y})`);
    },
    [uiStore, derived, undoRedo]
  );

  // ============================================================================
  // Node Drop Handler
  // ============================================================================

  const onNodeDropped = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (nodeId.startsWith("group-")) return;

      const targetGroup = findDeepestGroupAtPosition(position, derived.groups);
      const targetGroupId = targetGroup?.id ?? null;

      if (nodeId.startsWith("freeText_")) {
        handleAnnotationNodeDrop(
          nodeId,
          targetGroupId,
          derived.textAnnotations,
          derived.updateTextAnnotation
        );
        return;
      }

      if (nodeId.startsWith("freeShape_")) {
        handleAnnotationNodeDrop(
          nodeId,
          targetGroupId,
          derived.shapeAnnotations,
          derived.updateShapeAnnotation
        );
        return;
      }

      handleTopologyNodeDrop(
        nodeId,
        targetGroupId,
        derived.getNodeMembership(nodeId),
        derived.addNodeToGroup,
        derived.removeNodeFromGroup
      );
    },
    [derived]
  );

  // ============================================================================
  // Utility Actions
  // ============================================================================

  const deleteAllSelected = useCallback(() => {
    uiStore.selectedGroupIds.forEach((id) => derived.deleteGroup(id));
    uiStore.selectedTextIds.forEach((id) => derived.deleteTextAnnotation(id));
    uiStore.selectedShapeIds.forEach((id) => derived.deleteShapeAnnotation(id));
    uiStore.clearAllSelections();
  }, [uiStore, derived]);

  // ============================================================================
  // Build Return Value
  // ============================================================================

  return useMemo<AnnotationContextValue>(
    () => ({
      // State
      groups: derived.groups,
      selectedGroupIds: uiStore.selectedGroupIds,
      editingGroup: uiStore.editingGroup,
      textAnnotations: derived.textAnnotations,
      selectedTextIds: uiStore.selectedTextIds,
      editingTextAnnotation: uiStore.editingTextAnnotation,
      isAddTextMode: uiStore.isAddTextMode,
      shapeAnnotations: derived.shapeAnnotations,
      selectedShapeIds: uiStore.selectedShapeIds,
      editingShapeAnnotation: uiStore.editingShapeAnnotation,
      isAddShapeMode: uiStore.isAddShapeMode,
      pendingShapeType: uiStore.pendingShapeType,

      // Group actions
      selectGroup: uiStore.selectGroup,
      toggleGroupSelection: uiStore.toggleGroupSelection,
      boxSelectGroups: uiStore.boxSelectGroups,
      clearGroupSelection: uiStore.clearGroupSelection,
      editGroup,
      closeGroupEditor: uiStore.closeGroupEditor,
      saveGroup,
      deleteGroup,
      updateGroup: derived.updateGroup,
      updateGroupParent: (id, parentId) =>
        derived.updateGroup(id, { parentId: parentId ?? undefined }),
      updateGroupGeoPosition: (id, coords) => derived.updateGroup(id, { geoCoordinates: coords }),
      addNodeToGroup: derived.addNodeToGroup,
      getNodeMembership: derived.getNodeMembership,
      getGroupMembers: derived.getGroupMembers,
      handleAddGroup,
      generateGroupId: () => generateGroupId(derived.groups),
      addGroup,
      updateGroupSize,

      // Text actions
      handleAddText,
      disableAddTextMode: uiStore.disableAddTextMode,
      selectTextAnnotation: uiStore.selectTextAnnotation,
      toggleTextAnnotationSelection: uiStore.toggleTextAnnotationSelection,
      boxSelectTextAnnotations: uiStore.boxSelectTextAnnotations,
      clearTextAnnotationSelection: uiStore.clearTextAnnotationSelection,
      editTextAnnotation,
      closeTextEditor: uiStore.closeTextEditor,
      saveTextAnnotation,
      deleteTextAnnotation,
      deleteSelectedTextAnnotations,
      updateTextRotation: (id: string, rotation: number) =>
        derived.updateTextAnnotation(id, { rotation }),
      onTextRotationStart,
      onTextRotationEnd,
      updateTextSize: (id, width, height) => derived.updateTextAnnotation(id, { width, height }),
      updateTextGeoPosition: (id, coords) =>
        derived.updateTextAnnotation(id, { geoCoordinates: coords }),
      updateTextAnnotation: derived.updateTextAnnotation,
      handleTextCanvasClick,

      // Shape actions
      handleAddShapes,
      disableAddShapeMode: uiStore.disableAddShapeMode,
      selectShapeAnnotation: uiStore.selectShapeAnnotation,
      toggleShapeAnnotationSelection: uiStore.toggleShapeAnnotationSelection,
      boxSelectShapeAnnotations: uiStore.boxSelectShapeAnnotations,
      clearShapeAnnotationSelection: uiStore.clearShapeAnnotationSelection,
      editShapeAnnotation,
      closeShapeEditor: uiStore.closeShapeEditor,
      saveShapeAnnotation,
      deleteShapeAnnotation,
      deleteSelectedShapeAnnotations,
      updateShapeRotation: (id, rotation) => derived.updateShapeAnnotation(id, { rotation }),
      onShapeRotationStart,
      onShapeRotationEnd,
      updateShapeSize,
      updateShapeEndPosition: (id, endPosition) =>
        derived.updateShapeAnnotation(id, { endPosition }),
      updateShapeGeoPosition: (id, coords) =>
        derived.updateShapeAnnotation(id, { geoCoordinates: coords }),
      updateShapeEndGeoPosition: (id, coords) =>
        derived.updateShapeAnnotation(id, { endGeoCoordinates: coords }),
      updateShapeAnnotation: derived.updateShapeAnnotation,
      handleShapeCanvasClick,

      // Membership
      onNodeDropped,

      // Utilities
      clearAllSelections: uiStore.clearAllSelections,
      deleteAllSelected
    }),
    [
      derived,
      uiStore,
      editGroup,
      saveGroup,
      deleteGroup,
      handleAddGroup,
      addGroup,
      updateGroupSize,
      handleAddText,
      editTextAnnotation,
      saveTextAnnotation,
      deleteTextAnnotation,
      deleteSelectedTextAnnotations,
      onTextRotationStart,
      onTextRotationEnd,
      handleTextCanvasClick,
      handleAddShapes,
      editShapeAnnotation,
      saveShapeAnnotation,
      deleteShapeAnnotation,
      deleteSelectedShapeAnnotations,
      onShapeRotationStart,
      onShapeRotationEnd,
      updateShapeSize,
      handleShapeCanvasClick,
      onNodeDropped,
      deleteAllSelected
    ]
  );
}
