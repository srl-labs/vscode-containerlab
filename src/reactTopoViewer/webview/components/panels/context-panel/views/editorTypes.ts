import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  TrafficRateAnnotation,
  GroupStyleAnnotation
} from "../../../../../shared/types/topology";
import type { GroupEditorData } from "../../../../hooks/canvas";
import type { LinkImpairmentData } from "../../link-impairment/types";
import type { LinkEditorData } from "../../link-editor/types";
import type { NetworkEditorData } from "../../network-editor/types";
import type { NodeEditorData } from "../../node-editor/types";

export interface EditorFooterRef {
  handleApply: () => void;
  handleSave: () => void;
  handleDiscard: () => void;
  hasChanges: boolean;
}

export interface EditorBannerRef {
  errors: string[];
}

export interface ContextPanelEditorState {
  editingNodeData: NodeEditorData | null;
  editingNodeInheritedProps: string[];
  nodeEditorHandlers: {
    handleClose: () => void;
    handleSave: (data: NodeEditorData) => void;
    handleApply: (data: NodeEditorData) => void;
    previewVisuals: (data: NodeEditorData) => void;
    handleDelete?: () => void;
  };
  editingLinkData: LinkEditorData | null;
  linkEditorHandlers: {
    handleClose: () => void;
    handleSave: (data: LinkEditorData) => void;
    handleApply: (data: LinkEditorData) => void;
    previewOffset: (data: LinkEditorData) => void;
    revertOffset: () => void;
    handleDelete?: () => void;
  };
  editingNetworkData: NetworkEditorData | null;
  networkEditorHandlers: {
    handleClose: () => void;
    handleSave: (data: NetworkEditorData) => void;
    handleApply: (data: NetworkEditorData) => void;
  };
  linkImpairmentData: LinkImpairmentData | null;
  linkImpairmentHandlers: {
    onError: (error: string) => void;
    onApply: (data: LinkImpairmentData) => void;
    onSave: (data: LinkImpairmentData) => void;
    onClose: () => void;
  };
  editingTextAnnotation: FreeTextAnnotation | null;
  textAnnotationHandlers: {
    onSave: (annotation: FreeTextAnnotation) => void;
    onPreview?: (annotation: FreeTextAnnotation) => boolean;
    onPreviewDelete?: (id: string) => void;
    onClose: () => void;
    onDelete: (id: string) => void;
  };
  editingShapeAnnotation: FreeShapeAnnotation | null;
  shapeAnnotationHandlers: {
    onSave: (annotation: FreeShapeAnnotation) => void;
    onPreview?: (annotation: FreeShapeAnnotation) => boolean;
    onPreviewDelete?: (id: string) => void;
    onClose: () => void;
    onDelete: (id: string) => void;
  };
  editingTrafficRateAnnotation: TrafficRateAnnotation | null;
  trafficRateAnnotationHandlers: {
    onSave: (annotation: TrafficRateAnnotation) => void;
    onPreview?: (annotation: TrafficRateAnnotation) => void;
    onClose: () => void;
    onDelete: (id: string) => void;
  };
  editingGroup: GroupEditorData | null;
  groupHandlers: {
    onSave: (data: GroupEditorData) => void;
    onClose: () => void;
    onDelete: (groupId: string) => void;
    onStylePreview: (groupId: string, style: Partial<GroupStyleAnnotation>) => void;
  };
}
