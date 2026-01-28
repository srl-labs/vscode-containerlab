/**
 * AnnotationHandles - Reusable handles component for rotation and resizing
 */
import React from "react";

import { ResizeHandle } from "./ResizeHandle";
import { RotationHandle } from "./RotationHandle";
import { SelectionOutline } from "./SelectionOutline";
import type { ResizeCorner } from "./handleConstants";

export interface AnnotationHandlesProps {
  onRotation: (e: React.MouseEvent) => void;
  onResize: (e: React.MouseEvent, corner: ResizeCorner) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const AnnotationHandles: React.FC<AnnotationHandlesProps> = ({
  onRotation,
  onResize,
  onMouseEnter,
  onMouseLeave
}) => (
  <>
    <SelectionOutline />
    <RotationHandle
      onMouseDown={onRotation}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
    <ResizeHandle position="nw" onMouseDown={(e) => onResize(e, "nw")} />
    <ResizeHandle position="ne" onMouseDown={(e) => onResize(e, "ne")} />
    <ResizeHandle position="sw" onMouseDown={(e) => onResize(e, "sw")} />
    <ResizeHandle position="se" onMouseDown={(e) => onResize(e, "se")} />
  </>
);
