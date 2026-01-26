/**
 * FreeTextFormContent - Sleek, modern form for text annotation editing
 * Supports markdown rendering in preview
 */
import React, { useMemo } from "react";

import type { FreeTextAnnotation } from "../../../../shared/types/topology";
import { renderMarkdown, MARKDOWN_EMPTY_MESSAGE } from "../../../utils/markdownRenderer";
import { Toggle, ColorSwatch, PREVIEW_GRID_BG } from "../../ui/form";

const FONTS = [
  "monospace",
  "sans-serif",
  "serif",
  "Arial",
  "Helvetica",
  "Courier New",
  "Times New Roman",
  "Georgia"
];

// Helper functions to avoid duplicate calculations
const isBackgroundTransparent = (bg: string | undefined): boolean => bg === "transparent";
const isBackgroundRounded = (rounded: boolean | undefined): boolean => rounded !== false;

interface Props {
  formData: FreeTextAnnotation;
  updateField: <K extends keyof FreeTextAnnotation>(field: K, value: FreeTextAnnotation[K]) => void;
  isNew: boolean;
  onDelete?: () => void;
}

// Icon button for toolbar
const IconBtn: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}> = ({ active, onClick, children, title }) => (
  <button
    title={title}
    onClick={onClick}
    className={`w-8 h-8 flex items-center justify-center rounded-sm transition-all duration-150 ${
      active
        ? "bg-[var(--accent)] text-white shadow-sm"
        : "text-[var(--vscode-foreground)] hover:bg-white/10"
    }`}
  >
    {children}
  </button>
);

// Formatting toolbar
const Toolbar: React.FC<{ formData: FreeTextAnnotation; updateField: Props["updateField"] }> = ({
  formData,
  updateField
}) => {
  const isBold = formData.fontWeight === "bold";
  const isItalic = formData.fontStyle === "italic";
  const isUnderline = formData.textDecoration === "underline";
  const align = formData.textAlign || "left";

  return (
    <div className="flex items-center gap-0.5 p-1.5 bg-black/20 rounded-sm backdrop-blur-sm">
      <IconBtn
        active={isBold}
        onClick={() => updateField("fontWeight", isBold ? "normal" : "bold")}
        title="Bold"
      >
        <span className="font-bold text-sm">B</span>
      </IconBtn>
      <IconBtn
        active={isItalic}
        onClick={() => updateField("fontStyle", isItalic ? "normal" : "italic")}
        title="Italic"
      >
        <span className="italic text-sm">I</span>
      </IconBtn>
      <IconBtn
        active={isUnderline}
        onClick={() => updateField("textDecoration", isUnderline ? "none" : "underline")}
        title="Underline"
      >
        <span className="underline text-sm">U</span>
      </IconBtn>
      <div className="w-px h-6 bg-white/10 mx-1.5" />
      <IconBtn
        active={align === "left"}
        onClick={() => updateField("textAlign", "left")}
        title="Align Left"
      >
        <i className="fas fa-align-left text-xs" />
      </IconBtn>
      <IconBtn
        active={align === "center"}
        onClick={() => updateField("textAlign", "center")}
        title="Align Center"
      >
        <i className="fas fa-align-center text-xs" />
      </IconBtn>
      <IconBtn
        active={align === "right"}
        onClick={() => updateField("textAlign", "right")}
        title="Align Right"
      >
        <i className="fas fa-align-right text-xs" />
      </IconBtn>
    </div>
  );
};

// Font controls
const FontControls: React.FC<{
  formData: FreeTextAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => (
  <div className="flex gap-2">
    <select
      className="flex-1 px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-sm text-xs cursor-pointer hover:border-white/20 transition-colors"
      value={formData.fontFamily || "monospace"}
      onChange={(e) => updateField("fontFamily", e.target.value)}
    >
      {FONTS.map((f) => (
        <option
          key={f}
          value={f}
          className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]"
        >
          {f}
        </option>
      ))}
    </select>
    <div className="relative">
      <input
        type="number"
        className="w-16 px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-sm text-xs text-center hover:border-white/20 transition-colors"
        value={formData.fontSize || 14}
        onChange={(e) => updateField("fontSize", parseInt(e.target.value) || 14)}
        min={1}
        max={72}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--vscode-descriptionForeground)] pointer-events-none">
        px
      </span>
    </div>
  </div>
);

// Style options (colors, toggles, rotation)
const StyleOptions: React.FC<{
  formData: FreeTextAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => {
  const isTransparent = isBackgroundTransparent(formData.backgroundColor);
  const isRounded = isBackgroundRounded(formData.roundedBackground);

  return (
    <div className="flex items-start gap-4 flex-wrap">
      <ColorSwatch
        label="Text"
        value={formData.fontColor || "#FFFFFF"}
        onChange={(v) => updateField("fontColor", v)}
      />
      <ColorSwatch
        label="Fill"
        value={isTransparent ? "#000000" : formData.backgroundColor || "#000000"}
        onChange={(v) => updateField("backgroundColor", v)}
        disabled={isTransparent}
      />
      <div className="flex gap-2 pt-4">
        <Toggle
          active={isTransparent}
          onClick={() => updateField("backgroundColor", isTransparent ? "#000000" : "transparent")}
        >
          No Fill
        </Toggle>
        <Toggle active={isRounded} onClick={() => updateField("roundedBackground", !isRounded)}>
          Rounded
        </Toggle>
      </div>
      <div className="flex flex-col gap-0.5 ml-auto">
        <span className="field-label">Rotate</span>
        <input
          type="number"
          className="w-16 px-2 py-1.5 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-white/10 rounded-sm text-xs text-center hover:border-white/20 transition-colors"
          value={formData.rotation || 0}
          onChange={(e) => updateField("rotation", parseInt(e.target.value) || 0)}
          min={-360}
          max={360}
        />
      </div>
    </div>
  );
};

// Compute preview content style
function computePreviewStyle(formData: FreeTextAnnotation): React.CSSProperties {
  const isTransparent = isBackgroundTransparent(formData.backgroundColor);
  const isRounded = isBackgroundRounded(formData.roundedBackground);
  return {
    fontFamily: formData.fontFamily || "monospace",
    fontSize: Math.min(formData.fontSize || 14, 22),
    fontWeight: formData.fontWeight || "normal",
    fontStyle: formData.fontStyle || "normal",
    textDecoration: formData.textDecoration || "none",
    textAlign: formData.textAlign || "left",
    color: formData.fontColor || "#FFFFFF",
    backgroundColor: formData.backgroundColor || "transparent",
    padding: !isTransparent ? "6px 12px" : 0,
    borderRadius: isRounded ? 6 : 0,
    transform: `rotate(${formData.rotation || 0}deg)`,
    maxWidth: "100%",
    boxShadow: !isTransparent ? "0 2px 8px rgba(0,0,0,0.3)" : "none"
  };
}

// Preview header component
const PreviewHeader: React.FC = () => (
  <div className="flex items-center justify-between">
    <span className="field-label">Preview</span>
    <span className="helper-text">Markdown supported</span>
  </div>
);

// Live preview with markdown rendering
const Preview: React.FC<{ formData: FreeTextAnnotation }> = ({ formData }) => {
  const renderedHtml = useMemo(() => renderMarkdown(formData.text || ""), [formData.text]);
  const isEmpty = !formData.text?.trim();
  const style = computePreviewStyle(formData);

  return (
    <div className="flex flex-col gap-1">
      <PreviewHeader />
      <div className="relative p-6 bg-gradient-to-br from-black/30 to-black/10 rounded-sm border border-white/5 min-h-[80px] flex items-center justify-center overflow-hidden">
        <div className={`absolute inset-0 ${PREVIEW_GRID_BG} opacity-50`} />
        <div className="relative z-10 transition-all duration-200 free-text-markdown" style={style}>
          {isEmpty ? (
            <span className="opacity-50 italic">{MARKDOWN_EMPTY_MESSAGE}</span>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          )}
        </div>
      </div>
    </div>
  );
};

// Main component
export const FreeTextFormContent: React.FC<Props> = ({
  formData,
  updateField,
  isNew,
  onDelete
}) => (
  <div className="flex flex-col gap-4">
    <textarea
      className="w-full h-32 px-4 py-3 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] placeholder-[var(--vscode-input-placeholderForeground)] border border-white/10 rounded-sm resize-y focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
      value={formData.text}
      onChange={(e) => updateField("text", e.target.value)}
      placeholder="Enter your text... (Markdown and fenced code blocks supported)"
      autoFocus
    />
    <Toolbar formData={formData} updateField={updateField} />
    <FontControls formData={formData} updateField={updateField} />
    <StyleOptions formData={formData} updateField={updateField} />
    <Preview formData={formData} />
    {!isNew && onDelete && (
      <button
        className="self-start text-xs text-[var(--vscode-errorForeground)] opacity-60 hover:opacity-100 transition-opacity"
        onClick={onDelete}
      >
        <i className="fas fa-trash-alt mr-1.5" />
        Delete
      </button>
    )}
  </div>
);
