import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../../shared/types/topology";
import type { GroupEditorData } from "./groupTypes";
import type {
  SnapshotCapture,
  CaptureSnapshotOptions,
  CommitChangeOptions
} from "../../stores/undoRedoStore";

export interface AnnotationState {
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

export interface AnnotationActions {
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

export type AnnotationContextValue = AnnotationState & AnnotationActions;

export interface UndoRedoActions {
  captureSnapshot: (options?: CaptureSnapshotOptions) => SnapshotCapture;
  commitChange: (
    before: SnapshotCapture,
    description: string,
    options?: CommitChangeOptions
  ) => void;
}
