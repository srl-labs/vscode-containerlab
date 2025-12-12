/**
 * BasePanel - Core draggable panel component
 *
 * Provides:
 * - Draggable header
 * - Position persistence
 * - Viewport constraints
 * - Optional backdrop
 * - Standard footer with customizable buttons
 */
import React, { useState, useRef, useCallback, useEffect, ReactNode } from 'react';

const DEFAULT_POSITION = { x: 20, y: 80 };
const DEFAULT_WIDTH = 400;
const MIN_VISIBLE_HEIGHT = 50;
const MIN_VISIBLE_WIDTH = 100;
const TOP_MARGIN = 40;

interface BasePanelProps {
  title: string;
  isVisible: boolean;
  onClose: () => void;
  children: ReactNode;
  // Footer buttons
  onPrimaryClick?: () => void;
  onSecondaryClick?: () => void;
  primaryLabel?: string;
  secondaryLabel?: string;
  // Change tracking - highlights secondary (Apply) button when true
  hasChanges?: boolean;
  /** When false, hides the footer entirely */
  footer?: boolean;
  // Panel options
  width?: number;
  initialPosition?: { x: number; y: number };
  storageKey?: string;
  backdrop?: boolean;
  zIndex?: number;
}

/**
 * Constrain position to keep panel visible within viewport
 */
function constrainPosition(
  pos: { x: number; y: number },
  panelWidth: number
): { x: number; y: number } {
  const maxX = window.innerWidth - MIN_VISIBLE_WIDTH;
  const maxY = window.innerHeight - MIN_VISIBLE_HEIGHT;
  return {
    x: Math.max(-(panelWidth - MIN_VISIBLE_WIDTH), Math.min(pos.x, maxX)),
    y: Math.max(TOP_MARGIN, Math.min(pos.y, maxY))
  };
}

/**
 * Load position from storage
 */
function loadPosition(
  storageKey: string | undefined,
  defaultPos: { x: number; y: number },
  panelWidth: number
): { x: number; y: number } {
  if (!storageKey) return constrainPosition(defaultPos, panelWidth);
  try {
    const saved = window.localStorage.getItem(`panel-pos-${storageKey}`);
    if (saved) {
      return constrainPosition(JSON.parse(saved), panelWidth);
    }
  } catch {
    // Ignore parse errors
  }
  return constrainPosition(defaultPos, panelWidth);
}

/**
 * Save position to storage
 */
function savePosition(storageKey: string | undefined, position: { x: number; y: number }): void {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(`panel-pos-${storageKey}`, JSON.stringify(position));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook for draggable panel behavior
 */
function useDraggable(
  storageKey?: string,
  initialPosition = DEFAULT_POSITION,
  panelWidth = DEFAULT_WIDTH
) {
  const [position, setPosition] = useState(() =>
    loadPosition(storageKey, initialPosition, panelWidth)
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;

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
    const newPos = {
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    };
    setPosition(constrainPosition(newPos, panelWidthRef.current));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      savePosition(storageKey, position);
    }
    setIsDragging(false);
  }, [isDragging, position, storageKey]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Re-constrain position on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => constrainPosition(prev, panelWidthRef.current));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { position, isDragging, handleMouseDown };
}

interface PanelFooterProps {
  hasChanges: boolean;
  onPrimaryClick: () => void;
  onSecondaryClick: () => void;
  primaryLabel: string;
  secondaryLabel: string;
}

const PanelFooter: React.FC<PanelFooterProps> = ({
  hasChanges,
  onPrimaryClick,
  onSecondaryClick,
  primaryLabel,
  secondaryLabel
}) => (
  <div
    className="panel-footer flex justify-end gap-2 p-2 border-t flex-shrink-0"
    style={{ borderColor: 'var(--vscode-panel-border)' }}
  >
    <button
      type="button"
      className={`btn btn-small ${hasChanges ? 'btn-has-changes' : 'btn-secondary'}`}
      onClick={onSecondaryClick}
      title="Apply changes without closing"
    >
      {secondaryLabel}
    </button>
    <button
      type="button"
      className="btn btn-primary btn-small"
      onClick={onPrimaryClick}
      title="Apply changes and close"
    >
      {primaryLabel}
    </button>
  </div>
);

export const BasePanel: React.FC<BasePanelProps> = ({
  title,
  isVisible,
  onClose,
  children,
  onPrimaryClick = () => {},
  onSecondaryClick = () => {},
  primaryLabel = 'OK',
  secondaryLabel = 'Apply',
  hasChanges = false,
  footer = true,
  width = DEFAULT_WIDTH,
  initialPosition = DEFAULT_POSITION,
  storageKey,
  backdrop = false,
  zIndex = 21
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const { position, isDragging, handleMouseDown } = useDraggable(storageKey, initialPosition, width);

  if (!isVisible) return null;

  return (
    <>
      {/* Optional backdrop */}
      {backdrop && (
        <div
          className="fixed inset-0 bg-black/30"
          style={{ zIndex: zIndex - 1 }}
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className="panel panel-overlay panel-editor fixed overflow-hidden flex flex-col"
        style={{
          left: position.x,
          top: position.y,
          width,
          maxHeight: 'calc(100vh - 100px)',
          zIndex
        }}
      >
        {/* Header */}
        <div
          className="panel-heading panel-title-bar"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <span className="panel-title">{title}</span>
          <button
            className="panel-close-btn"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Content */}
        <div className="panel-block p-2 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <PanelFooter
            hasChanges={hasChanges}
            onPrimaryClick={onPrimaryClick}
            onSecondaryClick={onSecondaryClick}
            primaryLabel={primaryLabel}
            secondaryLabel={secondaryLabel}
          />
        )}
      </div>
    </>
  );
};
