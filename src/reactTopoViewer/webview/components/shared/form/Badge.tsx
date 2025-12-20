/**
 * Badge components for form fields
 */
import React from 'react';
import { quoteBlockStyle } from '../../../styles/cssVariables';

/**
 * Inheritance badge - shown when a field value comes from defaults, kinds, or groups
 */
export const InheritanceBadge: React.FC = () => (
  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded">
    inherited
  </span>
);

/**
 * Read-only badge for displaying non-editable values
 */
export const ReadOnlyBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-base px-2 py-1 inline-block rounded" style={quoteBlockStyle}>
    {children}
  </span>
);
