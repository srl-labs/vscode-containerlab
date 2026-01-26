/**
 * AnnotationContext - Centralized annotation state management (Unified Architecture)
 *
 * This version uses GraphContext as the single source of truth for all nodes.
 * Annotation data is derived from GraphContext nodes, not managed separately.
 *
 * Key changes from the old architecture:
 * - Groups, text, and shape annotations are derived from GraphContext nodes
 * - All mutations go through GraphContext (via useDerivedAnnotations)
 * - Only UI state (selection, editing, add mode) is managed locally
 */
import React, { createContext, useContext, useCallback, useMemo, useState, useRef } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/annotations";
import type { GroupEditorData } from "../hooks/groups/groupTypes";
import { useDerivedAnnotations } from "../hooks/useDerivedAnnotations";
import {
  findDeepestGroupAtPosition,
  findParentGroupForBounds,
  generateGroupId
} from "../hooks/groups";
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

import { useUndoRedoContext } from "./UndoRedoContext";

/** Props for AnnotationProvider */
interface AnnotationProviderProps {
  rfInstance: ReactFlowInstance | null;
  mode: "edit" | "view";
  isLocked: boolean;
  onLockedAction: () => void;
  children: React.ReactNode;
}

interface AnnotationStateContextValue {
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

interface AnnotationActionsContextValue {
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

const AnnotationStateContext = createContext<AnnotationStateContextValue | undefined>(undefined);
const AnnotationActionsContext = createContext<AnnotationActionsContextValue | undefined>(
  undefined
);

/** Provider component for annotation context */
export const AnnotationProvider: React.FC<AnnotationProviderProps> = ({
  rfInstance,
  mode,
  isLocked,
  onLockedAction,
  children
}) => {
  // Access undo/redo context for snapshot recording
  const { undoRedo } = useUndoRedoContext();

  // Get derived annotation data and mutation functions from GraphContext
  const derived = useDerivedAnnotations();

  // Shape UI state
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set());

  // Text UI state
  const [selectedTextIds, setSelectedTextIds] = useState<Set<string>>(new Set());

  // Group UI state
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  // Undo/redo application handled centrally via snapshot system

  // ============================================================================
  // Local UI State (not stored in GraphContext)
  // ============================================================================

  // Group UI state (selectedGroupIds declared earlier for undo/redo)
  const [editingGroup, setEditingGroup] = useState<GroupEditorData | null>(null);

  // Text UI state (selectedTextIds declared earlier for undo/redo)
  const [editingTextAnnotation, setEditingTextAnnotation] = useState<FreeTextAnnotation | null>(
    null
  );
  const [isAddTextMode, setIsAddTextMode] = useState(false);
  const lastTextStyleRef = useRef<Partial<FreeTextAnnotation>>({});

  // Shape UI state (selectedShapeIds declared earlier for undo/redo)
  const [editingShapeAnnotation, setEditingShapeAnnotation] = useState<FreeShapeAnnotation | null>(
    null
  );
  const [isAddShapeMode, setIsAddShapeMode] = useState(false);
  const [pendingShapeType, setPendingShapeType] = useState<"rectangle" | "circle" | "line">(
    "rectangle"
  );
  const lastShapeStyleRef = useRef<Partial<FreeShapeAnnotation>>({});

  // Rotation undo/redo snapshot refs (to track state between start/end)
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

  const selectGroup = useCallback((id: string) => {
    setSelectedGroupIds(new Set([id]));
  }, []);

  const toggleGroupSelection = useCallback((id: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const boxSelectGroups = useCallback((ids: string[]) => {
    setSelectedGroupIds(new Set(ids));
  }, []);

  const clearGroupSelection = useCallback(() => {
    setSelectedGroupIds(new Set());
  }, []);

  const editGroup = useCallback(
    (id: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      const group = derived.groups.find((g) => g.id === id);
      if (group) {
        setEditingGroup({
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
    [mode, isLocked, onLockedAction, derived.groups]
  );

  const closeGroupEditor = useCallback(() => {
    setEditingGroup(null);
  }, []);

  /** Internal helper to apply group changes without undo tracking */
  const applyGroupChanges = useCallback(
    (data: GroupEditorData) => {
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
      setEditingGroup(null);
    },
    [derived]
  );

  const saveGroup = useCallback(
    (data: GroupEditorData) => {
      const group = derived.groups.find((g) => g.id === data.id);
      if (!group) {
        // Fallback for new groups (shouldn't happen via editor)
        applyGroupChanges(data);
        return;
      }

      const memberIds = derived.getGroupMembers(data.id);
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [data.id, ...memberIds] });

      applyGroupChanges(data);

      // Build expected "after" group
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
    [derived, applyGroupChanges, undoRedo]
  );

  const updateGroupCallback = useCallback(
    (id: string, updates: Partial<GroupStyleAnnotation>) => {
      derived.updateGroup(id, updates);
    },
    [derived]
  );

  const updateGroupParent = useCallback(
    (id: string, parentId: string | null) => {
      derived.updateGroup(id, { parentId: parentId ?? undefined });
    },
    [derived]
  );

  const updateGroupGeoPosition = useCallback(
    (id: string, coords: { lat: number; lng: number }) => {
      derived.updateGroup(id, { geoCoordinates: coords });
    },
    [derived]
  );

  const generateGroupIdCallback = useCallback(() => {
    return generateGroupId(derived.groups);
  }, [derived.groups]);

  const handleAddGroup = useCallback(() => {
    if (mode !== "edit") return;
    if (isLocked) {
      onLockedAction();
      return;
    }
    const viewport = rfInstance?.getViewport() ?? { x: 0, y: 0, zoom: 1 };
    const newGroupId = generateGroupId(derived.groups);

    // Get selected nodes from React Flow to create group around them
    const rfNodes = rfInstance?.getNodes() ?? [];
    const selectedNodes = rfNodes.filter((n) => n.selected && n.type !== "group");

    let position: { x: number; y: number };
    let width: number;
    let height: number;
    const members: string[] = [];
    const PADDING = 40; // Padding around nodes

    if (selectedNodes.length > 0) {
      // Calculate bounding box of selected nodes
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const node of selectedNodes) {
        const nodeWidth = node.measured?.width ?? 100;
        const nodeHeight = node.measured?.height ?? 100;
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + nodeWidth);
        maxY = Math.max(maxY, node.position.y + nodeHeight);
        members.push(node.id);
      }
      position = { x: minX - PADDING, y: minY - PADDING };
      width = maxX - minX + PADDING * 2;
      height = maxY - minY + PADDING * 2;
    } else {
      // No selection - create at viewport position
      position = { x: -viewport.x / viewport.zoom + 200, y: -viewport.y / viewport.zoom + 200 };
      width = 300;
      height = 200;
    }

    // Find the parent group (smallest existing group that contains this new group)
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
    // Pass explicit node so commitChange doesn't rely on stale state ref
    const node = groupToNode(newGroup);
    undoRedo.commitChange(snapshot, `Add group ${newGroup.name ?? newGroup.id}`, {
      explicitNodes: [node]
    });
  }, [mode, isLocked, onLockedAction, rfInstance, derived, undoRedo]);

  const deleteGroup = useCallback(
    (id: string) => {
      // Capture group state before deletion for undo
      const group = derived.groups.find((g) => g.id === id);
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      derived.deleteGroup(id);
      setSelectedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (group) {
        // Pass empty explicit nodes to indicate deletion (after = null)
        undoRedo.commitChange(snapshot, `Delete group ${group.name ?? group.id}`, {
          explicitNodes: []
        });
      }
    },
    [derived, undoRedo]
  );

  const addGroup = useCallback(
    (group: GroupStyleAnnotation) => {
      const memberIds = Array.isArray(group.members) ? group.members : [];
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [group.id, ...memberIds] });
      derived.addGroup(group);
      if (memberIds.length > 0) {
        for (const memberId of memberIds) {
          derived.addNodeToGroup(memberId, group.id);
        }
      }
      // Pass explicit node so commitChange doesn't rely on stale state ref
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
      // Build expected "after" state with updated size
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
    setIsAddTextMode(true);
    setIsAddShapeMode(false);
  }, [mode, isLocked, onLockedAction]);

  const disableAddTextMode = useCallback(() => {
    setIsAddTextMode(false);
  }, []);

  const selectTextAnnotation = useCallback((id: string) => {
    setSelectedTextIds(new Set([id]));
  }, []);

  const toggleTextAnnotationSelection = useCallback((id: string) => {
    setSelectedTextIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const boxSelectTextAnnotations = useCallback((ids: string[]) => {
    setSelectedTextIds(new Set(ids));
  }, []);

  const clearTextAnnotationSelection = useCallback(() => {
    setSelectedTextIds(new Set());
  }, []);

  const editTextAnnotation = useCallback(
    (id: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      const annotation = derived.textAnnotations.find((a) => a.id === id);
      if (annotation) {
        setEditingTextAnnotation(annotation);
      }
    },
    [mode, isLocked, onLockedAction, derived.textAnnotations]
  );

  const closeTextEditor = useCallback(() => {
    setEditingTextAnnotation(null);
  }, []);

  /** Internal helper to apply text changes without undo tracking */
  const applyTextChanges = useCallback(
    (annotation: FreeTextAnnotation) => {
      const existing = derived.textAnnotations.find((a) => a.id === annotation.id);
      if (existing) {
        derived.updateTextAnnotation(annotation.id, annotation);
      } else {
        derived.addTextAnnotation(annotation);
      }
      // Save style for next annotation
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
      setEditingTextAnnotation(null);
    },
    [derived]
  );

  const saveTextAnnotation = useCallback(
    (annotation: FreeTextAnnotation) => {
      const isNew = !derived.textAnnotations.some((t) => t.id === annotation.id);
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [annotation.id] });
      applyTextChanges(annotation);
      // Pass explicit node so commitChange doesn't rely on stale state ref
      const node = freeTextToNode(annotation);
      undoRedo.commitChange(
        snapshot,
        isNew ? `Add text ${annotation.id}` : `Update text ${annotation.id}`,
        {
          explicitNodes: [node]
        }
      );
    },
    [derived.textAnnotations, applyTextChanges, undoRedo]
  );

  /** Internal helper to remove text without undo tracking */
  const removeTextInternal = useCallback(
    (id: string) => {
      derived.deleteTextAnnotation(id);
      setSelectedTextIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [derived]
  );

  const deleteTextAnnotation = useCallback(
    (id: string) => {
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      removeTextInternal(id);
      // Pass empty explicit nodes to indicate deletion (after = null)
      undoRedo.commitChange(snapshot, `Delete text ${id}`, {
        explicitNodes: []
      });
    },
    [removeTextInternal, undoRedo]
  );

  const deleteSelectedTextAnnotations = useCallback(() => {
    const ids = Array.from(selectedTextIds);
    if (ids.length === 0) return;
    const snapshot = undoRedo.captureSnapshot({ nodeIds: ids });
    ids.forEach((id) => removeTextInternal(id));
    // Pass empty explicit nodes to indicate deletion (after = null)
    undoRedo.commitChange(
      snapshot,
      `Delete ${ids.length} text annotation${ids.length === 1 ? "" : "s"}`,
      {
        explicitNodes: []
      }
    );
  }, [selectedTextIds, removeTextInternal, undoRedo]);

  const updateTextRotation = useCallback(
    (id: string, rotation: number) => {
      derived.updateTextAnnotation(id, { rotation });
    },
    [derived]
  );

  const onTextRotationStart = useCallback(
    (id: string) => {
      // Capture snapshot at start of rotation for undo/redo
      textRotationSnapshotRef.current = {
        id,
        snapshot: undoRedo.captureSnapshot({ nodeIds: [id] })
      };
    },
    [undoRedo]
  );

  const onTextRotationEnd = useCallback(
    (id: string) => {
      // Commit the rotation change for undo/redo
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

  const updateTextSize = useCallback(
    (id: string, width: number, height: number) => {
      derived.updateTextAnnotation(id, { width, height });
    },
    [derived]
  );

  const updateTextGeoPosition = useCallback(
    (id: string, coords: { lat: number; lng: number }) => {
      derived.updateTextAnnotation(id, { geoCoordinates: coords });
    },
    [derived]
  );

  const updateTextAnnotation = useCallback(
    (id: string, updates: Partial<FreeTextAnnotation>) => {
      derived.updateTextAnnotation(id, updates);
    },
    [derived]
  );

  const handleTextCanvasClick = useCallback(
    (position: { x: number; y: number }) => {
      if (!isAddTextMode) return;
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
      setEditingTextAnnotation(newAnnotation);
      setIsAddTextMode(false);
      log.info(`[FreeText] Creating annotation at (${position.x}, ${position.y})`);
    },
    [isAddTextMode, derived.groups]
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
      setIsAddShapeMode(true);
      setIsAddTextMode(false);
      if (shapeType === "rectangle" || shapeType === "circle" || shapeType === "line") {
        setPendingShapeType(shapeType);
      }
    },
    [mode, isLocked, onLockedAction]
  );

  const disableAddShapeMode = useCallback(() => {
    setIsAddShapeMode(false);
  }, []);

  const selectShapeAnnotation = useCallback((id: string) => {
    setSelectedShapeIds(new Set([id]));
  }, []);

  const toggleShapeAnnotationSelection = useCallback((id: string) => {
    setSelectedShapeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const boxSelectShapeAnnotations = useCallback((ids: string[]) => {
    setSelectedShapeIds(new Set(ids));
  }, []);

  const clearShapeAnnotationSelection = useCallback(() => {
    setSelectedShapeIds(new Set());
  }, []);

  const editShapeAnnotation = useCallback(
    (id: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      const annotation = derived.shapeAnnotations.find((a) => a.id === id);
      if (annotation) {
        setEditingShapeAnnotation(annotation);
      }
    },
    [mode, isLocked, onLockedAction, derived.shapeAnnotations]
  );

  const closeShapeEditor = useCallback(() => {
    setEditingShapeAnnotation(null);
  }, []);

  /** Internal helper to apply shape changes without undo tracking */
  const applyShapeChanges = useCallback(
    (annotation: FreeShapeAnnotation) => {
      const normalized = normalizeShapeAnnotationColors(annotation);
      const existing = derived.shapeAnnotations.find((a) => a.id === normalized.id);
      if (existing) {
        derived.updateShapeAnnotation(normalized.id, normalized);
      } else {
        derived.addShapeAnnotation(normalized);
      }
      // Save style for next annotation
      lastShapeStyleRef.current = {
        fillColor: normalized.fillColor,
        fillOpacity: normalized.fillOpacity,
        borderColor: normalized.borderColor,
        borderWidth: normalized.borderWidth,
        borderStyle: normalized.borderStyle
      };
      setEditingShapeAnnotation(null);
      return normalized;
    },
    [derived]
  );

  const saveShapeAnnotation = useCallback(
    (annotation: FreeShapeAnnotation) => {
      const isNew = !derived.shapeAnnotations.some((s) => s.id === annotation.id);
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [annotation.id] });
      const normalized = applyShapeChanges(annotation);
      // Pass explicit node so commitChange doesn't rely on stale state ref
      const node = freeShapeToNode(normalized);
      undoRedo.commitChange(
        snapshot,
        isNew ? `Add shape ${annotation.id}` : `Update shape ${annotation.id}`,
        {
          explicitNodes: [node]
        }
      );
    },
    [derived.shapeAnnotations, applyShapeChanges, undoRedo]
  );

  /** Internal helper to remove shape without undo tracking */
  const removeShapeInternal = useCallback(
    (id: string) => {
      derived.deleteShapeAnnotation(id);
      setSelectedShapeIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [derived]
  );

  const deleteShapeAnnotation = useCallback(
    (id: string) => {
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      removeShapeInternal(id);
      // Pass empty explicit nodes to indicate deletion (after = null)
      undoRedo.commitChange(snapshot, `Delete shape ${id}`, {
        explicitNodes: []
      });
    },
    [removeShapeInternal, undoRedo]
  );

  const deleteSelectedShapeAnnotations = useCallback(() => {
    const ids = Array.from(selectedShapeIds);
    if (ids.length === 0) return;
    const snapshot = undoRedo.captureSnapshot({ nodeIds: ids });
    ids.forEach((id) => removeShapeInternal(id));
    // Pass empty explicit nodes to indicate deletion (after = null)
    undoRedo.commitChange(snapshot, `Delete ${ids.length} shape${ids.length === 1 ? "" : "s"}`, {
      explicitNodes: []
    });
  }, [selectedShapeIds, removeShapeInternal, undoRedo]);

  const updateShapeRotation = useCallback(
    (id: string, rotation: number) => {
      derived.updateShapeAnnotation(id, { rotation });
    },
    [derived]
  );

  const onShapeRotationStart = useCallback(
    (id: string) => {
      // Capture snapshot at start of rotation for undo/redo
      shapeRotationSnapshotRef.current = {
        id,
        snapshot: undoRedo.captureSnapshot({ nodeIds: [id] })
      };
    },
    [undoRedo]
  );

  const onShapeRotationEnd = useCallback(
    (id: string) => {
      // Commit the rotation change for undo/redo
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
      // Build expected "after" state with updated size
      const updatedShape: FreeShapeAnnotation = { ...shape, width, height };
      const node = freeShapeToNode(updatedShape);
      undoRedo.commitChange(snapshot, `Resize shape ${id}`, {
        explicitNodes: [node]
      });
    },
    [derived, undoRedo]
  );

  const updateShapeEndPosition = useCallback(
    (id: string, endPosition: { x: number; y: number }) => {
      derived.updateShapeAnnotation(id, { endPosition });
    },
    [derived]
  );

  const updateShapeGeoPosition = useCallback(
    (id: string, coords: { lat: number; lng: number }) => {
      derived.updateShapeAnnotation(id, { geoCoordinates: coords });
    },
    [derived]
  );

  const updateShapeEndGeoPosition = useCallback(
    (id: string, coords: { lat: number; lng: number }) => {
      derived.updateShapeAnnotation(id, { endGeoCoordinates: coords });
    },
    [derived]
  );

  const updateShapeAnnotation = useCallback(
    (id: string, updates: Partial<FreeShapeAnnotation>) => {
      derived.updateShapeAnnotation(id, updates);
    },
    [derived]
  );

  const handleShapeCanvasClick = useCallback(
    (position: { x: number; y: number }) => {
      if (!isAddShapeMode) return;
      const parentGroup = findDeepestGroupAtPosition(position, derived.groups);
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
      // Pass explicit node so commitChange doesn't rely on stale state ref
      const node = freeShapeToNode(newAnnotation);
      undoRedo.commitChange(snapshot, `Add shape ${newAnnotation.id}`, {
        explicitNodes: [node]
      });
      setIsAddShapeMode(false);
      log.info(`[FreeShape] Creating ${pendingShapeType} at (${position.x}, ${position.y})`);
    },
    [isAddShapeMode, pendingShapeType, derived, undoRedo]
  );

  const onNodeDropped = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      // Skip group nodes
      if (nodeId.startsWith("group-")) return;

      // Find group at position
      const targetGroup = findDeepestGroupAtPosition(position, derived.groups);
      const targetGroupId = targetGroup?.id ?? null;

      // Handle text/shape annotations
      if (nodeId.startsWith("freeText_")) {
        const annotation = derived.textAnnotations.find((a) => a.id === nodeId);
        const currentGroupId = annotation?.groupId ?? null;
        if (currentGroupId !== targetGroupId) {
          derived.updateTextAnnotation(nodeId, { groupId: targetGroupId ?? undefined });
        }
        return;
      }

      if (nodeId.startsWith("freeShape_")) {
        const annotation = derived.shapeAnnotations.find((a) => a.id === nodeId);
        const currentGroupId = annotation?.groupId ?? null;
        if (currentGroupId !== targetGroupId) {
          derived.updateShapeAnnotation(nodeId, { groupId: targetGroupId ?? undefined });
        }
        return;
      }

      // Handle topology nodes
      const currentGroupId = derived.getNodeMembership(nodeId);
      if (currentGroupId === targetGroupId) return;

      if (targetGroupId) {
        derived.addNodeToGroup(nodeId, targetGroupId);
      } else {
        derived.removeNodeFromGroup(nodeId);
      }
    },
    [derived]
  );

  // ============================================================================
  // Utility Actions
  // ============================================================================

  const clearAllSelections = useCallback(() => {
    setSelectedGroupIds(new Set());
    setSelectedTextIds(new Set());
    setSelectedShapeIds(new Set());
  }, []);

  const deleteAllSelected = useCallback(() => {
    selectedGroupIds.forEach((id) => derived.deleteGroup(id));
    selectedTextIds.forEach((id) => derived.deleteTextAnnotation(id));
    selectedShapeIds.forEach((id) => derived.deleteShapeAnnotation(id));
    clearAllSelections();
  }, [selectedGroupIds, selectedTextIds, selectedShapeIds, derived, clearAllSelections]);

  // ============================================================================
  // Context Values
  // ============================================================================

  const stateValue = useMemo<AnnotationStateContextValue>(
    () => ({
      groups: derived.groups,
      selectedGroupIds,
      editingGroup,
      textAnnotations: derived.textAnnotations,
      selectedTextIds,
      editingTextAnnotation,
      isAddTextMode,
      shapeAnnotations: derived.shapeAnnotations,
      selectedShapeIds,
      editingShapeAnnotation,
      isAddShapeMode,
      pendingShapeType
    }),
    [
      derived.groups,
      selectedGroupIds,
      editingGroup,
      derived.textAnnotations,
      selectedTextIds,
      editingTextAnnotation,
      isAddTextMode,
      derived.shapeAnnotations,
      selectedShapeIds,
      editingShapeAnnotation,
      isAddShapeMode,
      pendingShapeType
    ]
  );

  const actionsValue = useMemo<AnnotationActionsContextValue>(
    () => ({
      selectGroup,
      toggleGroupSelection,
      boxSelectGroups,
      clearGroupSelection,
      editGroup,
      closeGroupEditor,
      saveGroup,
      deleteGroup,
      updateGroup: updateGroupCallback,
      updateGroupParent,
      updateGroupGeoPosition,
      addNodeToGroup: derived.addNodeToGroup,
      getNodeMembership: derived.getNodeMembership,
      getGroupMembers: derived.getGroupMembers,
      handleAddGroup,
      generateGroupId: generateGroupIdCallback,
      addGroup,
      updateGroupSize,
      handleAddText,
      disableAddTextMode,
      selectTextAnnotation,
      toggleTextAnnotationSelection,
      boxSelectTextAnnotations,
      clearTextAnnotationSelection,
      editTextAnnotation,
      closeTextEditor,
      saveTextAnnotation,
      deleteTextAnnotation,
      deleteSelectedTextAnnotations,
      updateTextRotation,
      onTextRotationStart,
      onTextRotationEnd,
      updateTextSize,
      updateTextGeoPosition,
      updateTextAnnotation,
      handleTextCanvasClick,
      handleAddShapes,
      disableAddShapeMode,
      selectShapeAnnotation,
      toggleShapeAnnotationSelection,
      boxSelectShapeAnnotations,
      clearShapeAnnotationSelection,
      editShapeAnnotation,
      closeShapeEditor,
      saveShapeAnnotation,
      deleteShapeAnnotation,
      deleteSelectedShapeAnnotations,
      updateShapeRotation,
      onShapeRotationStart,
      onShapeRotationEnd,
      updateShapeSize,
      updateShapeEndPosition,
      updateShapeGeoPosition,
      updateShapeEndGeoPosition,
      updateShapeAnnotation,
      handleShapeCanvasClick,
      onNodeDropped,
      clearAllSelections,
      deleteAllSelected
    }),
    [
      selectGroup,
      toggleGroupSelection,
      boxSelectGroups,
      clearGroupSelection,
      editGroup,
      closeGroupEditor,
      saveGroup,
      deleteGroup,
      updateGroupCallback,
      updateGroupParent,
      updateGroupGeoPosition,
      derived.addNodeToGroup,
      derived.getNodeMembership,
      derived.getGroupMembers,
      handleAddGroup,
      generateGroupIdCallback,
      addGroup,
      updateGroupSize,
      handleAddText,
      disableAddTextMode,
      selectTextAnnotation,
      toggleTextAnnotationSelection,
      boxSelectTextAnnotations,
      clearTextAnnotationSelection,
      editTextAnnotation,
      closeTextEditor,
      saveTextAnnotation,
      deleteTextAnnotation,
      deleteSelectedTextAnnotations,
      updateTextRotation,
      onTextRotationStart,
      onTextRotationEnd,
      updateTextSize,
      updateTextGeoPosition,
      updateTextAnnotation,
      handleTextCanvasClick,
      handleAddShapes,
      disableAddShapeMode,
      selectShapeAnnotation,
      toggleShapeAnnotationSelection,
      boxSelectShapeAnnotations,
      clearShapeAnnotationSelection,
      editShapeAnnotation,
      closeShapeEditor,
      saveShapeAnnotation,
      deleteShapeAnnotation,
      deleteSelectedShapeAnnotations,
      updateShapeRotation,
      onShapeRotationStart,
      onShapeRotationEnd,
      updateShapeSize,
      updateShapeEndPosition,
      updateShapeGeoPosition,
      updateShapeEndGeoPosition,
      updateShapeAnnotation,
      handleShapeCanvasClick,
      onNodeDropped,
      clearAllSelections,
      deleteAllSelected
    ]
  );

  return (
    <AnnotationStateContext.Provider value={stateValue}>
      <AnnotationActionsContext.Provider value={actionsValue}>
        {children}
      </AnnotationActionsContext.Provider>
    </AnnotationStateContext.Provider>
  );
};

export function useAnnotationsState(): AnnotationStateContextValue {
  const context = useContext(AnnotationStateContext);
  if (context === undefined) {
    throw new Error("useAnnotationsState must be used within an AnnotationProvider");
  }
  return context;
}

export function useAnnotationsActions(): AnnotationActionsContextValue {
  const context = useContext(AnnotationActionsContext);
  if (context === undefined) {
    throw new Error("useAnnotationsActions must be used within an AnnotationProvider");
  }
  return context;
}

/** Legacy combined hook (prefer useAnnotationsState/useAnnotationsActions) */
export function useAnnotations(): AnnotationContextValue {
  const state = useAnnotationsState();
  const actions = useAnnotationsActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
