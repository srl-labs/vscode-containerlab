/**
 * FormField - Label wrapper with optional tooltip
 */
import React from 'react';

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  tooltip?: string;
  required?: boolean;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  children,
  className = '',
  tooltip,
  required
}) => (
  <div className={`form-group ${className}`}>
    <label className="block vscode-label mb-1">
      {label}
      {required && <span className="text-[var(--vscode-editorError-foreground)] ml-0.5">*</span>}
      {tooltip && <TooltipIcon tooltip={tooltip} label={label} />}
    </label>
    {children}
  </div>
);

/**
 * Tooltip icon with hover popup
 */
const TooltipIcon: React.FC<{ tooltip: string; label: string }> = ({ tooltip, label }) => (
  <span className="relative inline-flex items-center ml-1 group">
    <button
      type="button"
      className="inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      aria-label={`${label} help`}
    >
      <i className="fas fa-info-circle text-xs" aria-hidden="true"></i>
    </button>
    <span className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-md border border-[var(--vscode-editorHoverWidget-border)] bg-[var(--vscode-editorHoverWidget-background)] px-3 py-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
      {tooltip}
    </span>
  </span>
);
