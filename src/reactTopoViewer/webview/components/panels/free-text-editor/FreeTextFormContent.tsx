/**
 * FreeTextFormContent - Sleek, modern form for text annotation editing
 * Supports markdown rendering in preview
 */
import React, { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import MuiIconButton from "@mui/material/IconButton";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import DeleteIcon from "@mui/icons-material/Delete";

import type { FreeTextAnnotation } from "../../../../shared/types/topology";
import { renderMarkdown } from "../../../utils/markdownRenderer";
import { Toggle, ColorSwatch, PREVIEW_GRID_BG } from "../../ui/form";

// Helper functions to avoid duplicate calculations
const isBackgroundTransparent = (bg: string | undefined): boolean => bg === "transparent";
const isBackgroundRounded = (rounded: boolean | undefined): boolean => rounded !== false;

const FONTS = [
  "monospace",
  "sans-serif",
  "serif",
  "Arial",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Times New Roman",
  "Verdana"
];

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
  <MuiIconButton
    title={title}
    onClick={onClick}
    size="small"
    sx={{
      borderRadius: 0.5,
      color: active ? "primary.contrastText" : "text.primary",
      bgcolor: active ? "primary.main" : "transparent",
      "&:hover": { bgcolor: active ? "primary.dark" : "action.hover" }
    }}
  >
    {children}
  </MuiIconButton>
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
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.25,
        p: 0.75,
        bgcolor: "var(--vscode-input-background)",
        borderRadius: 0.5
      }}
    >
      <IconBtn
        active={isBold}
        onClick={() => updateField("fontWeight", isBold ? "normal" : "bold")}
        title="Bold"
      >
        <FormatBoldIcon fontSize="small" />
      </IconBtn>
      <IconBtn
        active={isItalic}
        onClick={() => updateField("fontStyle", isItalic ? "normal" : "italic")}
        title="Italic"
      >
        <FormatItalicIcon fontSize="small" />
      </IconBtn>
      <IconBtn
        active={isUnderline}
        onClick={() => updateField("textDecoration", isUnderline ? "none" : "underline")}
        title="Underline"
      >
        <FormatUnderlinedIcon fontSize="small" />
      </IconBtn>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.75 }} />
      <IconBtn
        active={align === "left"}
        onClick={() => updateField("textAlign", "left")}
        title="Align Left"
      >
        <FormatAlignLeftIcon fontSize="small" />
      </IconBtn>
      <IconBtn
        active={align === "center"}
        onClick={() => updateField("textAlign", "center")}
        title="Align Center"
      >
        <FormatAlignCenterIcon fontSize="small" />
      </IconBtn>
      <IconBtn
        active={align === "right"}
        onClick={() => updateField("textAlign", "right")}
        title="Align Right"
      >
        <FormatAlignRightIcon fontSize="small" />
      </IconBtn>
    </Box>
  );
};

// Font controls
const FontControls: React.FC<{
  formData: FreeTextAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => (
  <Box sx={{ display: "flex", gap: 1 }}>
    <Select
      size="small"
      value={formData.fontFamily || "monospace"}
      onChange={(e) => updateField("fontFamily", e.target.value)}
      sx={{ flex: 1, fontSize: "0.75rem" }}
    >
      {FONTS.map((f) => (
        <MenuItem key={f} value={f} sx={{ fontSize: "0.75rem" }}>
          {f}
        </MenuItem>
      ))}
    </Select>
    <TextField
      type="number"
      size="small"
      value={formData.fontSize || 14}
      onChange={(e) => updateField("fontSize", parseInt(e.target.value) || 14)}
      inputProps={{ min: 1, max: 72, style: { textAlign: "center" } }}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <Typography variant="caption" color="text.secondary">
              px
            </Typography>
          </InputAdornment>
        )
      }}
      sx={{ width: 80, "& .MuiInputBase-input": { fontSize: "0.75rem" } }}
    />
  </Box>
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
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, ml: "auto" }}>
        <Typography variant="caption" color="text.secondary">
          Rotate
        </Typography>
        <TextField
          type="number"
          size="small"
          value={formData.rotation || 0}
          onChange={(e) => updateField("rotation", parseInt(e.target.value) || 0)}
          inputProps={{ min: -360, max: 360, style: { textAlign: "center" } }}
          sx={{ width: 64, "& .MuiInputBase-input": { fontSize: "0.75rem", py: 0.75, px: 1 } }}
        />
      </Box>
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
  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <Typography variant="caption" color="text.secondary">
      Preview
    </Typography>
    <Typography variant="caption" color="text.secondary">
      Markdown supported
    </Typography>
  </Box>
);

// Live preview with markdown rendering
const Preview: React.FC<{ formData: FreeTextAnnotation }> = ({ formData }) => {
  const renderedHtml = useMemo(() => renderMarkdown(formData.text || ""), [formData.text]);
  const isEmpty = !formData.text?.trim();
  const style = computePreviewStyle(formData);

  return (
    <div className="flex flex-col gap-1">
      <PreviewHeader />
      <div className="relative p-6 bg-[var(--vscode-input-background)] rounded-sm border border-[var(--vscode-panel-border)] min-h-[80px] flex items-center justify-center overflow-hidden">
        <div className={`absolute inset-0 ${PREVIEW_GRID_BG} opacity-50`} />
        <div className="relative z-10 transition-all duration-200 free-text-markdown" style={style}>
          {isEmpty ? (
            <span className="opacity-50 italic">Start typing to see preview...</span>
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
    <TextField
      multiline
      minRows={5}
      fullWidth
      value={formData.text}
      onChange={(e) => updateField("text", e.target.value)}
      placeholder="Enter your text... (Markdown and fenced code blocks supported)"
      autoFocus
      sx={{ "& textarea": { resize: "vertical" } }}
    />
    <Toolbar formData={formData} updateField={updateField} />
    <FontControls formData={formData} updateField={updateField} />
    <StyleOptions formData={formData} updateField={updateField} />
    <Preview formData={formData} />
    {!isNew && onDelete && (
      <Button
        variant="text"
        color="error"
        size="small"
        startIcon={<DeleteIcon />}
        onClick={onDelete}
        sx={{ alignSelf: "flex-start", textTransform: "none" }}
      >
        Delete
      </Button>
    )}
  </div>
);
