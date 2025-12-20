/**
 * Shared resize handle for annotations
 */
import React from 'react';

import type {
  ResizeCorner
} from './handleConstants';
import {
  HANDLE_SIZE,
  HANDLE_BOX_SHADOW,
  HANDLE_BORDER,
  CORNER_STYLES
} from './handleConstants';

interface ResizeHandleProps {
  position: ResizeCorner;
  onMouseDown: (e: React.MouseEvent) => void;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({ position, onMouseDown }) => (
  <div
    onMouseDown={onMouseDown}
    style={{
      position: 'absolute',
      width: `${HANDLE_SIZE}px`,
      height: `${HANDLE_SIZE}px`,
      backgroundColor: 'white',
      border: HANDLE_BORDER,
      borderRadius: '2px',
      boxShadow: HANDLE_BOX_SHADOW,
      ...CORNER_STYLES[position]
    }}
    title="Drag to resize (Shift for aspect ratio)"
  />
);
