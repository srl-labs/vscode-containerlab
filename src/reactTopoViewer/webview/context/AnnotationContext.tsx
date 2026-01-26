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
import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect
} from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/annotations";
import type { GroupEditorData } from "../hooks/groups/groupTypes";
import type { TopoNode } from "../../shared/types/graph";
import { useDerivedAnnotations } from "../hooks/useDerivedAnnotations";
import { useUndoRedoContext } from "./UndoRedoContext";
import type { UndoRedoActionAnnotation } from "../hooks/state/useUndoRedo";
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
} from "../hooks/annotations/freeShape";
import { normalizeShapeAnnotationColors } from "../utils/color";
import { log } from "../utils/logger";

/** Pending membership change during node drag */
export interface PendingMembershipChange {
  nodeId: string;
  oldGroupId: string | null;
  newGroupId: string | null;
}

/** Props for AnnotationProvider */
interface AnnotationProviderProps {
  nodes: TopoNode[];
  rfInstance: ReactFlowInstance | null;
  mode: "edit" | "view";
  isLocked: boolean;
  onLockedAction: () => void;
  pendingMembershipChangesRef: { current: Map<string, PendingMembershipChange> };
  updateNodePositions: (
    positions: Array<{ id: string; position: { x: number; y: number } }>
  ) => void;
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
  handleAddGroupWithUndo: () => void;
  deleteGroupWithUndo: (id: string) => void;
  generateGroupId: () => string;
  addGroupWithUndo: (group: GroupStyleAnnotation) => void;
  onGroupDragStart: (groupId: string) => void;
  onGroupDragEnd: (
    groupId: string,
    finalPosition: { x: number; y: number },
    delta: { dx: number; dy: number }
  ) => void;
  onGroupDragMove: (groupId: string, delta: { dx: number; dy: number }) => void;
  updateGroupSizeWithUndo: (id: string, width: number, height: number) => void;
  onResizeStart: (groupId: string) => void;
  onResizeMove: (
    groupId: string,
    width: number,
    height: number,
    position: { x: number; y: number }
  ) => void;
  onResizeEnd: (
    groupId: string,
    finalWidth: number,
    finalHeight: number,
    finalPosition: { x: number; y: number }
  ) => void;

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
  saveTextAnnotationWithUndo: (annotation: FreeTextAnnotation, isNew: boolean) => void;
  deleteTextAnnotation: (id: string) => void;
  deleteTextAnnotationWithUndo: (id: string) => void;
  deleteSelectedTextAnnotations: () => void;
  updateTextPosition: (id: string, position: { x: number; y: number }) => void;
  updateTextRotation: (id: string, rotation: number) => void;
  updateTextSize: (id: string, width: number, height: number) => void;
  updateTextGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateTextAnnotation: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  handleTextCanvasClick: (position: { x: number; y: number }) => void;
  migrateTextAnnotationsGroupId: (oldGroupId: string, newGroupId: string | null) => void;

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
  deleteShapeAnnotationWithUndo: (id: string) => void;
  deleteSelectedShapeAnnotations: () => void;
  updateShapePositionWithUndo: (id: string, position: { x: number; y: number }) => void;
  updateShapeRotation: (id: string, rotation: number) => void;
  updateShapeSize: (id: string, width: number, height: number) => void;
  updateShapeEndPosition: (id: string, endPosition: { x: number; y: number }) => void;
  updateShapeGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateShapeEndGeoPosition: (id: string, coords: { lat: number; lng: number }) => void;
  updateShapeAnnotation: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
  handleShapeCanvasClickWithUndo: (position: { x: number; y: number }) => void;
  captureShapeAnnotationBefore: (id: string) => FreeShapeAnnotation | null;
  finalizeShapeWithUndo: (before: FreeShapeAnnotation | null, id: string) => void;
  migrateShapeAnnotationsGroupId: (oldGroupId: string, newGroupId: string | null) => void;

  // Membership
  applyMembershipChange: (memberships: { nodeId: string; groupId: string | null }[]) => void;
  onMembershipWillChange: (
    nodeId: string,
    oldGroupId: string | null,
    newGroupId: string | null
  ) => void;
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
  nodes,
  rfInstance,
  mode,
  isLocked,
  onLockedAction,
  pendingMembershipChangesRef,
  updateNodePositions,
  children
}) => {
  // Access undo/redo context for annotation undo support
  const { undoRedo, registerAnnotationHandler } = useUndoRedoContext();

  // Get derived annotation data and mutation functions from GraphContext
  const derived = useDerivedAnnotations();

  // Register annotation handler for undo/redo
  useEffect(() => {
    registerAnnotationHandler((action: UndoRedoActionAnnotation, isUndo: boolean) => {
      if (action.annotationType !== "group") {
        // TODO: Handle text and shape annotations
        return;
      }

      // Determine target state based on undo/redo direction
      const targetState = isUndo ? action.before : action.after;
      const currentState = isUndo ? action.after : action.before;

      if (targetState === null && currentState !== null) {
        // Delete the group (going from existing to not existing)
        const groupId = (currentState as GroupStyleAnnotation).id;
        derived.deleteGroup(groupId);
        setSelectedGroupIds((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
        log.info(`[AnnotationUndo] Deleted group ${groupId}`);
      } else if (targetState !== null && currentState === null) {
        // Add the group back (going from not existing to existing)
        const group = targetState as GroupStyleAnnotation;
        derived.addGroup(group);
        log.info(`[AnnotationUndo] Restored group ${group.id}`);
      }
    });
  }, [registerAnnotationHandler, derived]);

  // ============================================================================
  // Local UI State (not stored in GraphContext)
  // ============================================================================

  // Group UI state
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<GroupEditorData | null>(null);

  // Text UI state
  const [selectedTextIds, setSelectedTextIds] = useState<Set<string>>(new Set());
  const [editingTextAnnotation, setEditingTextAnnotation] = useState<FreeTextAnnotation | null>(
    null
  );
  const [isAddTextMode, setIsAddTextMode] = useState(false);
  const lastTextStyleRef = useRef<Partial<FreeTextAnnotation>>({});

  // Shape UI state
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set());
  const [editingShapeAnnotation, setEditingShapeAnnotation] = useState<FreeShapeAnnotation | null>(
    null
  );
  const [isAddShapeMode, setIsAddShapeMode] = useState(false);
  const [pendingShapeType, setPendingShapeType] = useState<"rectangle" | "circle" | "line">(
    "rectangle"
  );
  const lastShapeStyleRef = useRef<Partial<FreeShapeAnnotation>>({});

  // Group drag state
  const groupDragStartRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const groupResizeStartRef = useRef<Map<string, GroupStyleAnnotation>>(new Map());

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

  const saveGroup = useCallback(
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

  const deleteGroupCallback = useCallback(
    (id: string) => {
      derived.deleteGroup(id);
      setSelectedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [derived]
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

  const handleAddGroupWithUndo = useCallback(() => {
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
    derived.addGroup(newGroup);
    // Push undo action: before=null (didn't exist), after=newGroup (created)
    undoRedo.pushAction({
      type: "annotation",
      annotationType: "group",
      before: null,
      after: newGroup as unknown as Record<string, unknown>
    });
  }, [mode, isLocked, onLockedAction, rfInstance, derived, undoRedo]);

  const deleteGroupWithUndo = useCallback(
    (id: string) => {
      // Capture group state before deletion for undo
      const group = derived.groups.find((g) => g.id === id);
      derived.deleteGroup(id);
      setSelectedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      // Push undo action: before=group (existed), after=null (deleted)
      if (group) {
        undoRedo.pushAction({
          type: "annotation",
          annotationType: "group",
          before: group as unknown as Record<string, unknown>,
          after: null
        });
      }
    },
    [derived, undoRedo]
  );

  const addGroupWithUndo = useCallback(
    (group: GroupStyleAnnotation) => {
      derived.addGroup(group);
      // Push undo action: before=null (didn't exist), after=group (created)
      undoRedo.pushAction({
        type: "annotation",
        annotationType: "group",
        before: null,
        after: group as unknown as Record<string, unknown>
      });
    },
    [derived, undoRedo]
  );

  // Group drag handlers
  const onGroupDragStart = useCallback(
    (groupId: string) => {
      const group = derived.groups.find((g) => g.id === groupId);
      if (group) {
        groupDragStartRef.current.set(groupId, { ...group.position });
      }
    },
    [derived.groups]
  );

  const onGroupDragMove = useCallback(
    (groupId: string, delta: { dx: number; dy: number }) => {
      const group = derived.groups.find((g) => g.id === groupId);
      if (!group) return;

      // Update group position
      derived.updateGroup(groupId, {
        position: { x: group.position.x + delta.dx, y: group.position.y + delta.dy }
      });

      // Move member nodes
      const memberNodeIds = derived.getGroupMembers(groupId);
      const nodePositions: Array<{ id: string; position: { x: number; y: number } }> = [];

      for (const nodeId of memberNodeIds) {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          nodePositions.push({
            id: nodeId,
            position: { x: node.position.x + delta.dx, y: node.position.y + delta.dy }
          });
        }
      }

      if (nodePositions.length > 0) {
        updateNodePositions(nodePositions);
      }
    },
    [derived, nodes, updateNodePositions]
  );

  const onGroupDragEnd = useCallback(
    (groupId: string, _finalPosition: { x: number; y: number }) => {
      groupDragStartRef.current.delete(groupId);
      // Position is already updated in onGroupDragMove
    },
    []
  );

  const updateGroupSizeWithUndo = useCallback(
    (id: string, width: number, height: number) => {
      derived.updateGroup(id, { width, height });
    },
    [derived]
  );

  // Group resize handlers
  const onResizeStart = useCallback(
    (groupId: string) => {
      const group = derived.groups.find((g) => g.id === groupId);
      if (group) {
        groupResizeStartRef.current.set(groupId, { ...group });
      }
    },
    [derived.groups]
  );

  const onResizeMove = useCallback(
    (groupId: string, width: number, height: number, position: { x: number; y: number }) => {
      derived.updateGroup(groupId, { width, height, position });
    },
    [derived]
  );

  const onResizeEnd = useCallback(
    (
      groupId: string,
      _finalWidth: number,
      _finalHeight: number,
      _finalPosition: { x: number; y: number }
    ) => {
      groupResizeStartRef.current.delete(groupId);
    },
    []
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

  const saveTextAnnotation = useCallback(
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

  const saveTextAnnotationWithUndo = useCallback(
    (annotation: FreeTextAnnotation, _isNew: boolean) => {
      saveTextAnnotation(annotation);
    },
    [saveTextAnnotation]
  );

  const deleteTextAnnotation = useCallback(
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

  const deleteTextAnnotationWithUndo = useCallback(
    (id: string) => {
      deleteTextAnnotation(id);
    },
    [deleteTextAnnotation]
  );

  const deleteSelectedTextAnnotations = useCallback(() => {
    selectedTextIds.forEach((id) => derived.deleteTextAnnotation(id));
    setSelectedTextIds(new Set());
  }, [selectedTextIds, derived]);

  const updateTextPosition = useCallback(
    (id: string, position: { x: number; y: number }) => {
      derived.updateTextAnnotation(id, { position });
    },
    [derived]
  );

  const updateTextRotation = useCallback(
    (id: string, rotation: number) => {
      derived.updateTextAnnotation(id, { rotation });
    },
    [derived]
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

  const migrateTextAnnotationsGroupId = useCallback(
    (oldGroupId: string, newGroupId: string | null) => {
      for (const annotation of derived.textAnnotations) {
        if (annotation.groupId === oldGroupId) {
          derived.updateTextAnnotation(annotation.id, { groupId: newGroupId ?? undefined });
        }
      }
    },
    [derived]
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

  const saveShapeAnnotation = useCallback(
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
    },
    [derived]
  );

  const deleteShapeAnnotation = useCallback(
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

  const deleteShapeAnnotationWithUndo = useCallback(
    (id: string) => {
      deleteShapeAnnotation(id);
    },
    [deleteShapeAnnotation]
  );

  const deleteSelectedShapeAnnotations = useCallback(() => {
    selectedShapeIds.forEach((id) => derived.deleteShapeAnnotation(id));
    setSelectedShapeIds(new Set());
  }, [selectedShapeIds, derived]);

  const updateShapePositionWithUndo = useCallback(
    (id: string, position: { x: number; y: number }) => {
      derived.updateShapeAnnotation(id, { position });
    },
    [derived]
  );

  const updateShapeRotation = useCallback(
    (id: string, rotation: number) => {
      derived.updateShapeAnnotation(id, { rotation });
    },
    [derived]
  );

  const updateShapeSize = useCallback(
    (id: string, width: number, height: number) => {
      derived.updateShapeAnnotation(id, { width, height });
    },
    [derived]
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

  const handleShapeCanvasClickWithUndo = useCallback(
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
      derived.addShapeAnnotation(newAnnotation);
      setIsAddShapeMode(false);
      log.info(`[FreeShape] Creating ${pendingShapeType} at (${position.x}, ${position.y})`);
    },
    [isAddShapeMode, pendingShapeType, derived]
  );

  const captureShapeAnnotationBefore = useCallback(
    (id: string): FreeShapeAnnotation | null => {
      return derived.shapeAnnotations.find((a) => a.id === id) ?? null;
    },
    [derived.shapeAnnotations]
  );

  const finalizeShapeWithUndo = useCallback((_before: FreeShapeAnnotation | null, _id: string) => {
    // No-op for now, undo/redo simplified
  }, []);

  const migrateShapeAnnotationsGroupId = useCallback(
    (oldGroupId: string, newGroupId: string | null) => {
      for (const annotation of derived.shapeAnnotations) {
        if (annotation.groupId === oldGroupId) {
          derived.updateShapeAnnotation(annotation.id, { groupId: newGroupId ?? undefined });
        }
      }
    },
    [derived]
  );

  // ============================================================================
  // Membership Actions
  // ============================================================================

  const applyMembershipChange = useCallback(
    (memberships: { nodeId: string; groupId: string | null }[]) => {
      for (const { nodeId, groupId } of memberships) {
        if (groupId) {
          derived.addNodeToGroup(nodeId, groupId);
        } else {
          derived.removeNodeFromGroup(nodeId);
        }
      }
    },
    [derived]
  );

  const onMembershipWillChange = useCallback(
    (nodeId: string, oldGroupId: string | null, newGroupId: string | null) => {
      pendingMembershipChangesRef.current.set(nodeId, { nodeId, oldGroupId, newGroupId });
    },
    [pendingMembershipChangesRef]
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
      deleteGroup: deleteGroupCallback,
      updateGroup: updateGroupCallback,
      updateGroupParent,
      updateGroupGeoPosition,
      addNodeToGroup: derived.addNodeToGroup,
      getNodeMembership: derived.getNodeMembership,
      getGroupMembers: derived.getGroupMembers,
      handleAddGroupWithUndo,
      deleteGroupWithUndo,
      generateGroupId: generateGroupIdCallback,
      addGroupWithUndo,
      onGroupDragStart,
      onGroupDragEnd,
      onGroupDragMove,
      updateGroupSizeWithUndo,
      onResizeStart,
      onResizeMove,
      onResizeEnd,
      handleAddText,
      disableAddTextMode,
      selectTextAnnotation,
      toggleTextAnnotationSelection,
      boxSelectTextAnnotations,
      clearTextAnnotationSelection,
      editTextAnnotation,
      closeTextEditor,
      saveTextAnnotation,
      saveTextAnnotationWithUndo,
      deleteTextAnnotation,
      deleteTextAnnotationWithUndo,
      deleteSelectedTextAnnotations,
      updateTextPosition,
      updateTextRotation,
      updateTextSize,
      updateTextGeoPosition,
      updateTextAnnotation,
      handleTextCanvasClick,
      migrateTextAnnotationsGroupId,
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
      deleteShapeAnnotationWithUndo,
      deleteSelectedShapeAnnotations,
      updateShapePositionWithUndo,
      updateShapeRotation,
      updateShapeSize,
      updateShapeEndPosition,
      updateShapeGeoPosition,
      updateShapeEndGeoPosition,
      updateShapeAnnotation,
      handleShapeCanvasClickWithUndo,
      captureShapeAnnotationBefore,
      finalizeShapeWithUndo,
      migrateShapeAnnotationsGroupId,
      applyMembershipChange,
      onMembershipWillChange,
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
      deleteGroupCallback,
      updateGroupCallback,
      updateGroupParent,
      updateGroupGeoPosition,
      derived.addNodeToGroup,
      derived.getNodeMembership,
      derived.getGroupMembers,
      handleAddGroupWithUndo,
      deleteGroupWithUndo,
      generateGroupIdCallback,
      addGroupWithUndo,
      onGroupDragStart,
      onGroupDragEnd,
      onGroupDragMove,
      updateGroupSizeWithUndo,
      onResizeStart,
      onResizeMove,
      onResizeEnd,
      handleAddText,
      disableAddTextMode,
      selectTextAnnotation,
      toggleTextAnnotationSelection,
      boxSelectTextAnnotations,
      clearTextAnnotationSelection,
      editTextAnnotation,
      closeTextEditor,
      saveTextAnnotation,
      saveTextAnnotationWithUndo,
      deleteTextAnnotation,
      deleteTextAnnotationWithUndo,
      deleteSelectedTextAnnotations,
      updateTextPosition,
      updateTextRotation,
      updateTextSize,
      updateTextGeoPosition,
      updateTextAnnotation,
      handleTextCanvasClick,
      migrateTextAnnotationsGroupId,
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
      deleteShapeAnnotationWithUndo,
      deleteSelectedShapeAnnotations,
      updateShapePositionWithUndo,
      updateShapeRotation,
      updateShapeSize,
      updateShapeEndPosition,
      updateShapeGeoPosition,
      updateShapeEndGeoPosition,
      updateShapeAnnotation,
      handleShapeCanvasClickWithUndo,
      captureShapeAnnotationBefore,
      finalizeShapeWithUndo,
      migrateShapeAnnotationsGroupId,
      applyMembershipChange,
      onMembershipWillChange,
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
