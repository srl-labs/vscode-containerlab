// Text annotation editor form.
import React from "react";
import {
  FormatAlignCenter as FormatAlignCenterIcon,
  FormatAlignLeft as FormatAlignLeftIcon,
  FormatAlignRight as FormatAlignRightIcon,
  FormatBold as FormatBoldIcon,
  FormatItalic as FormatItalicIcon,
  FormatUnderlined as FormatUnderlinedIcon
} from "@mui/icons-material";
import {
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton as MuiIconButton,
  InputAdornment,
  MenuItem,
  TextField,
  Typography
} from "@mui/material";

import type { FreeTextAnnotation } from "../../../../shared/types/topology";
import { ColorField } from "../../ui/form";

// Helper functions to avoid duplicate calculations
const isBackgroundTransparent = (bg: string | undefined): boolean => bg === "transparent";

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
        pb: 0.75,
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
    <TextField
      select
      label="Font Family"
      size="small"
      value={formData.fontFamily || "monospace"}
      onChange={(e) => updateField("fontFamily", e.target.value)}
      sx={{ flex: 7 }}
    >
      {FONTS.map((f) => (
        <MenuItem key={f} value={f}>
          {f}
        </MenuItem>
      ))}
    </TextField>
    <TextField
      label="Font Size"
      type="number"
      size="small"
      value={formData.fontSize || 14}
      onChange={(e) => updateField("fontSize", parseInt(e.target.value) || 14)}
      slotProps={{
        htmlInput: { min: 1, max: 72, style: { textAlign: "center" } },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <Typography variant="caption" color="text.secondary">
                px
              </Typography>
            </InputAdornment>
          )
        }
      }}
      sx={{ flex: 3 }}
    />
  </Box>
);

// Style options (colors, toggles, rotation)
const StyleOptions: React.FC<{
  formData: FreeTextAnnotation;
  updateField: Props["updateField"];
}> = ({ formData, updateField }) => {
  const isTransparent = isBackgroundTransparent(formData.backgroundColor);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <ColorField
            label="Text"
            value={formData.fontColor || "#FFFFFF"}
            onChange={(v) => updateField("fontColor", v)}
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <ColorField
            label="Fill"
            value={isTransparent ? "#000000" : formData.backgroundColor || "#000000"}
            onChange={(v) => updateField("backgroundColor", v)}
            disabled={isTransparent}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={isTransparent}
                onChange={() => updateField("backgroundColor", isTransparent ? "#000000" : "transparent")}
              />
            }
            label="No fill"
            slotProps={{ typography: { variant: "caption" } }}
          />
        </Box>
      </Box>
      <TextField
        label="Rotation"
        type="number"
        size="small"
        value={formData.rotation || 0}
        onChange={(e) => updateField("rotation", parseInt(e.target.value) || 0)}
        slotProps={{
          htmlInput: { min: -360, max: 360 },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <Typography variant="caption" color="text.secondary">
                  deg
                </Typography>
              </InputAdornment>
            )
          }
        }}
      />
    </Box>
  );
};

// Main component
export const FreeTextFormContent: React.FC<Props> = ({
  formData,
  updateField
}) => (
  <Box sx={{ display: "flex", flexDirection: "column" }}>
    {/* Text */}
    <Box sx={{ px: 2, py: 1 }}>
      <Typography variant="subtitle2">Text</Typography>
    </Box>
    <Divider />
    <Box sx={{ p: 2 }}>
      <Toolbar formData={formData} updateField={updateField} />
      <TextField
        multiline
        minRows={2}
        fullWidth
        value={formData.text}
        onChange={(e) => updateField("text", e.target.value)}
        placeholder="Enter your text... (Markdown and fenced code blocks supported)"
        autoFocus
        sx={{ "& textarea": { resize: "vertical", overflow: "auto" } }}
      />
    </Box>

    {/* Font */}
    <Divider />
    <Box sx={{ px: 2, py: 1 }}>
      <Typography variant="subtitle2">Font</Typography>
    </Box>
    <Divider />
    <Box sx={{ p: 2 }}>
      <FontControls formData={formData} updateField={updateField} />
    </Box>

    {/* Style */}
    <Divider />
    <Box sx={{ px: 2, py: 1 }}>
      <Typography variant="subtitle2">Style</Typography>
    </Box>
    <Divider />
    <Box sx={{ p: 2 }}>
      <StyleOptions formData={formData} updateField={updateField} />
    </Box>

  </Box>
);
