/**
 * Shared rotation handle for annotations
 */
import React from 'react';
import {
  HANDLE_SIZE,
  ROTATION_HANDLE_OFFSET,
  HANDLE_BOX_SHADOW,
  CENTER_TRANSLATE
} from './handleConstants';

interface RotationHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

export const RotationHandle: React.FC<RotationHandleProps> = ({ onMouseDown }) => (
  <>
    {/* Invisible hitbox for easier grabbing */}
    <div
      style={{
        position: 'absolute',
        top: `-${ROTATION_HANDLE_OFFSET}px`,
        left: '50%',
        width: '16px',
        height: `${ROTATION_HANDLE_OFFSET + 4}px`,
        transform: 'translateX(-50%)',
        pointerEvents: 'auto'
      }}
    />
    {/* Connecting line */}
    <div
      style={{
        position: 'absolute',
        top: `-${ROTATION_HANDLE_OFFSET}px`,
        left: '50%',
        width: '2px',
        height: `${ROTATION_HANDLE_OFFSET - HANDLE_SIZE / 2}px`,
        backgroundColor: 'rgba(100, 180, 255, 0.8)',
        transform: 'translateX(-50%)',
        pointerEvents: 'none'
      }}
    />
    {/* Handle circle */}
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        top: `-${ROTATION_HANDLE_OFFSET}px`,
        left: '50%',
        width: `${HANDLE_SIZE}px`,
        height: `${HANDLE_SIZE}px`,
        backgroundColor: '#64b4ff',
        border: '2px solid white',
        borderRadius: '50%',
        transform: CENTER_TRANSLATE,
        cursor: 'grab',
        boxShadow: HANDLE_BOX_SHADOW
      }}
      title="Drag to rotate (Shift for 15° snap)"
    />
  </>
);
