/**
 * Group types for group editor panel and hooks
 */
import type { GroupStyleAnnotation } from "../../../shared/types/topology";

/** Style properties for groups */
export interface GroupStyle {
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dotted" | "dashed" | "double";
  borderRadius?: number;
  color?: string;
  labelColor?: string;
  labelPosition?: string;
}

/** Editor data for group editing panel */
export interface GroupEditorData {
  id: string;
  name: string;
  level: string;
  style: GroupStyle;
  position: { x: number; y: number };
  width: number;
  height: number;
  members?: string[];
  parentId?: string;
  zIndex?: number;
}

/** Return type for group clipboard operations */
export interface UseGroupClipboardReturn {
  copyGroup: (groupId: string) => boolean;
  pasteGroup: (position: { x: number; y: number }) => void;
  hasClipboardData: () => boolean;
}

/** Label position options */
export const GROUP_LABEL_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

/** Convert GroupStyleAnnotation to GroupEditorData */
export function groupToEditorData(group: GroupStyleAnnotation): GroupEditorData {
  const members = Array.isArray(group.members)
    ? group.members.filter((member): member is string => typeof member === "string")
    : undefined;

  return {
    id: group.id,
    name: group.name,
    level: group.level,
    position: group.position,
    width: group.width,
    height: group.height,
    members,
    parentId: group.parentId,
    zIndex: group.zIndex,
    style: {
      backgroundColor: group.backgroundColor,
      backgroundOpacity: group.backgroundOpacity,
      borderColor: group.borderColor,
      borderWidth: group.borderWidth,
      borderStyle: group.borderStyle,
      borderRadius: group.borderRadius,
      color: group.color,
      labelColor: group.labelColor,
      labelPosition: group.labelPosition,
    },
  };
}

/** Convert GroupEditorData to GroupStyleAnnotation */
export function editorDataToGroup(data: GroupEditorData): GroupStyleAnnotation {
  return {
    id: data.id,
    name: data.name,
    level: data.level,
    position: data.position,
    width: data.width,
    height: data.height,
    members: data.members,
    parentId: data.parentId,
    zIndex: data.zIndex,
    backgroundColor: data.style.backgroundColor,
    backgroundOpacity: data.style.backgroundOpacity,
    borderColor: data.style.borderColor,
    borderWidth: data.style.borderWidth,
    borderStyle: data.style.borderStyle,
    borderRadius: data.style.borderRadius,
    color: data.style.color,
    labelColor: data.style.labelColor,
    labelPosition: data.style.labelPosition,
  };
}
