/**
 * Sub-components for BasePanel
 */
import React from 'react';

export const PanelFooter: React.FC<{ hasChanges: boolean; onPrimary: () => void; onSecondary: () => void; primary: string; secondary: string }> =
  ({ hasChanges, onPrimary, onSecondary, primary, secondary }) => (
  <div className="panel-footer flex justify-end gap-2 p-2 border-t flex-shrink-0" style={{ borderColor: 'var(--vscode-panel-border)' }}>
    <button type="button" className={`btn btn-small ${hasChanges ? 'btn-has-changes' : 'btn-secondary'}`} onClick={onSecondary} data-testid="panel-apply-btn">{secondary}</button>
    <button type="button" className="btn btn-primary btn-small" onClick={onPrimary} data-testid="panel-ok-btn">{primary}</button>
  </div>
);

export const PanelHeader: React.FC<{ title: string; isDragging: boolean; onMouseDown: (e: React.MouseEvent) => void; onClose: () => void }> =
  ({ title, isDragging, onMouseDown, onClose }) => (
  <div className="panel-heading panel-title-bar" onMouseDown={onMouseDown} style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
    <span className="panel-title" data-testid="panel-title">{title}</span>
    <button className="panel-close-btn" onClick={onClose} aria-label="Close" data-testid="panel-close-btn"><i className="fas fa-times"></i></button>
  </div>
);

export const ResizeHandle: React.FC<{ onMouseDown: (e: React.MouseEvent) => void }> = ({ onMouseDown }) => (
  <div className="panel-resize-handle" onMouseDown={onMouseDown} title="Drag to resize" />
);

export const Backdrop: React.FC<{ zIndex: number; onClick: () => void }> = ({ zIndex, onClick }) => (
  <div className="fixed inset-0 bg-black/30" style={{ zIndex: zIndex - 1 }} onClick={onClick} />
);
