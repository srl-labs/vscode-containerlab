/**
 * Shared selection outline for annotations
 */
import React from 'react';

export const SelectionOutline: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      inset: '-2px',
      border: '2px solid #64b4ff',
      borderRadius: '4px',
      pointerEvents: 'none'
    }}
  />
);
