/**
 * Floating Panel Component
 * A draggable, closeable panel that floats over the canvas.
 * Uses BasePanel for shared drag/persistence behavior.
 */
import React, { ReactNode } from 'react';
import { BasePanel } from '../shared/editor/BasePanel';

interface FloatingPanelProps {
  title: string;
  children: ReactNode;
  isVisible: boolean;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  width?: number;
  height?: number;
  storageKey?: string;
  zIndex?: number;
  /** Enable diagonal resizing (default: true) */
  resizable?: boolean;
  /** Minimum width when resizing */
  minWidth?: number;
  /** Minimum height when resizing */
  minHeight?: number;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  title,
  children,
  isVisible,
  onClose,
  initialPosition = { x: 20, y: 80 },
  width = 320,
  height,
  storageKey,
  zIndex = 9999,
  resizable = true,
  minWidth,
  minHeight
}) => {
  return (
    <BasePanel
      title={title}
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={initialPosition}
      width={width}
      height={height}
      storageKey={storageKey}
      zIndex={zIndex}
      footer={false}
      resizable={resizable}
      minWidth={minWidth}
      minHeight={minHeight}
    >
      {children}
    </BasePanel>
  );
};

/**
 * Property Row Component for consistent panel layouts
 */
interface PropertyRowProps {
  label: string;
  value: string | ReactNode;
  className?: string;
}

export const PropertyRow: React.FC<PropertyRowProps> = ({ label, value, className = '' }) => (
  <div className={`flex flex-col items-center ${className}`}>
    <span className="vscode-label text-xs mb-1 font-bold">{label}</span>
    <span className="text-sm text-[var(--vscode-foreground)] text-center break-all">
      {value || 'N/A'}
    </span>
  </div>
);
