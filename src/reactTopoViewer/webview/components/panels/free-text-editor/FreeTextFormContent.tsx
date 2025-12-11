/**
 * FreeTextFormContent - Sleek, modern form for text annotation editing
 */
import React from 'react';
import { FreeTextAnnotation } from '../../../../shared/types/topology';

const FONTS = ['monospace', 'sans-serif', 'serif', 'Arial', 'Helvetica', 'Courier New', 'Times New Roman', 'Georgia'];

// Helper functions to avoid duplicate calculations
const isBackgroundTransparent = (bg: string | undefined): boolean => bg === 'transparent';
const isBackgroundRounded = (rounded: boolean | undefined): boolean => rounded !== false;

interface Props {
  formData: FreeTextAnnotation;
  updateField: <K extends keyof FreeTextAnnotation>(field: K, value: FreeTextAnnotation[K]) => void;
  isNew: boolean;
  onDelete?: () => void;
}

// Icon button for toolbar
const IconBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; title?: string }> = ({ active, onClick, children, title }) => (
  <button
    title={title}
    onClick={onClick}
    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150 ${
      active
        ? 'bg-[var(--accent)] text-white shadow-sm'
        : 'text-[var(--vscode-foreground)] hover:bg-white/10'
    }`}
  >
    {children}
  </button>
);

// Toggle pill button
const Toggle: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-150 ${
      active
        ? 'bg-[var(--accent)] text-white shadow-sm'
        : 'bg-white/5 text-[var(--vscode-foreground)] hover:bg-white/10 border border-white/10'
    }`}
  >
    {children}
  </button>
);

// Color swatch with label
const ColorSwatch: React.FC<{ label: string; value: string; onChange: (v: string) => void; disabled?: boolean }> = ({ label, value, onChange, disabled }) => (
  <div className="flex flex-col items-center gap-1">
    <div className={`relative w-10 h-10 rounded-xl overflow-hidden shadow-sm border-2 border-white/20 ${disabled ? 'opacity-40' : ''}`}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer border-0"
      />
    </div>
    <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">{label}</span>
  </div>
);

// Formatting toolbar
const Toolbar: React.FC<{ formData: FreeTextAnnotation; updateField: Props['updateField'] }> = ({ formData, updateField }) => {
  const isBold = formData.fontWeight === 'bold';
  const isItalic = formData.fontStyle === 'italic';
  const isUnderline = formData.textDecoration === 'underline';
  const align = formData.textAlign || 'left';

  return (
    <div className="flex items-center gap-0.5 p-1.5 bg-black/20 rounded-xl backdrop-blur-sm">
      <IconBtn active={isBold} onClick={() => updateField('fontWeight', isBold ? 'normal' : 'bold')} title="Bold">
        <span className="font-bold text-sm">B</span>
      </IconBtn>
      <IconBtn active={isItalic} onClick={() => updateField('fontStyle', isItalic ? 'normal' : 'italic')} title="Italic">
        <span className="italic text-sm">I</span>
      </IconBtn>
      <IconBtn active={isUnderline} onClick={() => updateField('textDecoration', isUnderline ? 'none' : 'underline')} title="Underline">
        <span className="underline text-sm">U</span>
      </IconBtn>
      <div className="w-px h-6 bg-white/10 mx-1.5" />
      <IconBtn active={align === 'left'} onClick={() => updateField('textAlign', 'left')} title="Align Left">
        <i className="fas fa-align-left text-xs" />
      </IconBtn>
      <IconBtn active={align === 'center'} onClick={() => updateField('textAlign', 'center')} title="Align Center">
        <i className="fas fa-align-center text-xs" />
      </IconBtn>
      <IconBtn active={align === 'right'} onClick={() => updateField('textAlign', 'right')} title="Align Right">
        <i className="fas fa-align-right text-xs" />
      </IconBtn>
    </div>
  );
};

// Font controls
const FontControls: React.FC<{ formData: FreeTextAnnotation; updateField: Props['updateField'] }> = ({ formData, updateField }) => (
  <div className="flex gap-2">
    <select
      className="flex-1 px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-xl text-sm cursor-pointer hover:border-white/20 transition-colors"
      value={formData.fontFamily || 'monospace'}
      onChange={(e) => updateField('fontFamily', e.target.value)}
    >
      {FONTS.map(f => <option key={f} value={f} className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]">{f}</option>)}
    </select>
    <div className="relative">
      <input
        type="number"
        className="w-20 px-3 py-2 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-xl text-sm text-center hover:border-white/20 transition-colors"
        value={formData.fontSize || 14}
        onChange={(e) => updateField('fontSize', parseInt(e.target.value) || 14)}
        min={1}
        max={72}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--vscode-descriptionForeground)] pointer-events-none">px</span>
    </div>
  </div>
);

// Style options (colors, toggles, rotation)
const StyleOptions: React.FC<{ formData: FreeTextAnnotation; updateField: Props['updateField'] }> = ({ formData, updateField }) => {
  const isTransparent = isBackgroundTransparent(formData.backgroundColor);
  const isRounded = isBackgroundRounded(formData.roundedBackground);

  return (
    <div className="flex items-end gap-4 flex-wrap">
      <ColorSwatch label="Text" value={formData.fontColor || '#FFFFFF'} onChange={(v) => updateField('fontColor', v)} />
      <ColorSwatch label="Fill" value={isTransparent ? '#000000' : (formData.backgroundColor || '#000000')} onChange={(v) => updateField('backgroundColor', v)} disabled={isTransparent} />
      <div className="flex flex-col gap-2">
        <Toggle active={isTransparent} onClick={() => updateField('backgroundColor', isTransparent ? '#000000' : 'transparent')}>No Fill</Toggle>
        <Toggle active={isRounded} onClick={() => updateField('roundedBackground', !isRounded)}>Rounded</Toggle>
      </div>
      <div className="flex flex-col items-center gap-1 ml-auto">
        <input
          type="number"
          className="w-16 px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-lg text-xs text-center hover:border-white/20 transition-colors"
          value={formData.rotation || 0}
          onChange={(e) => updateField('rotation', parseInt(e.target.value) || 0)}
          min={-360}
          max={360}
        />
        <span className="text-[10px] uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">Rotate</span>
      </div>
    </div>
  );
};

// Live preview
const Preview: React.FC<{ formData: FreeTextAnnotation }> = ({ formData }) => {
  const isTransparent = isBackgroundTransparent(formData.backgroundColor);
  const isRounded = isBackgroundRounded(formData.roundedBackground);

  return (
    <div className="relative p-6 bg-gradient-to-br from-black/30 to-black/10 rounded-xl border border-white/5 min-h-[80px] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cdefs%3E%3Cpattern%20id%3D%22grid%22%20width%3D%2220%22%20height%3D%2220%22%20patternUnits%3D%22userSpaceOnUse%22%3E%3Cpath%20d%3D%22M%200%200%20L%2020%200%2020%2020%22%20fill%3D%22none%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.03)%22%20stroke-width%3D%221%22%2F%3E%3C%2Fpattern%3E%3C%2Fdefs%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22url(%23grid)%22%2F%3E%3C%2Fsvg%3E')] opacity-50" />
      <div
        className="relative z-10 transition-all duration-200"
        style={{
          fontFamily: formData.fontFamily || 'monospace',
          fontSize: Math.min(formData.fontSize || 14, 22),
          fontWeight: formData.fontWeight || 'normal',
          fontStyle: formData.fontStyle || 'normal',
          textDecoration: formData.textDecoration || 'none',
          textAlign: formData.textAlign || 'left',
          color: formData.fontColor || '#FFFFFF',
          backgroundColor: formData.backgroundColor || 'transparent',
          padding: !isTransparent ? '6px 12px' : 0,
          borderRadius: isRounded ? 6 : 0,
          transform: `rotate(${formData.rotation || 0}deg)`,
          whiteSpace: 'pre-wrap',
          maxWidth: '100%',
          boxShadow: !isTransparent ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
        }}
      >
        {formData.text || 'Preview'}
      </div>
    </div>
  );
};

// Main component
export const FreeTextFormContent: React.FC<Props> = ({ formData, updateField, isNew, onDelete }) => (
  <div className="flex flex-col gap-4">
    <textarea
      className="w-full h-32 px-4 py-3 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] border border-white/10 rounded-xl resize-y focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
      value={formData.text}
      onChange={(e) => updateField('text', e.target.value)}
      placeholder="Enter your text..."
      autoFocus
    />
    <Toolbar formData={formData} updateField={updateField} />
    <FontControls formData={formData} updateField={updateField} />
    <StyleOptions formData={formData} updateField={updateField} />
    <Preview formData={formData} />
    {!isNew && onDelete && (
      <button className="self-start text-xs text-[var(--vscode-errorForeground)] opacity-60 hover:opacity-100 transition-opacity" onClick={onDelete}>
        <i className="fas fa-trash-alt mr-1.5" />Delete
      </button>
    )}
  </div>
);
