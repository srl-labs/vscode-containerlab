/**
 * Floating Panel Component
 * A draggable, closeable panel that floats over the canvas
 */
import React, { useState, useRef, useCallback, ReactNode } from 'react';

interface FloatingPanelProps {
  title: string;
  children: ReactNode;
  isVisible: boolean;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  width?: number;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  title,
  children,
  isVisible,
  onClose,
  initialPosition = { x: 20, y: 80 },
  width = 320
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-close-btn')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!isVisible) return null;

  return (
    <div
      ref={panelRef}
      className="panel panel-overlay fixed z-[9999] overflow-hidden shadow-lg"
      style={{
        left: position.x,
        top: position.y,
        width: width,
        display: isVisible ? 'block' : 'none'
      }}
    >
      <div
        className="panel-header"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <span className="panel-title flex-1 font-semibold">{title}</span>
        <button
          className="panel-close-btn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      <div className="panel-content">
        {children}
      </div>
    </div>
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
