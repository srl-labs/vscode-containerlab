/**
 * IconSelectorModal - Modal for selecting and customizing node icons
 * Uses MUI Dialog. Supports both built-in and custom icons.
 */
import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Close as CloseIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton as MuiIconButton,
  Slider,
  TextField,
  Typography
} from "@mui/material";

import type { NodeType } from "../../icons/SvgGenerator";
import { generateEncodedSVG } from "../../icons/SvgGenerator";
import { useEscapeKey } from "../../hooks/ui/useDomInteractions";
import { useCustomIcons } from "../../stores/topoViewerStore";
import { postCommand } from "../../messaging/extensionMessaging";
import { isBuiltInIcon } from "../../../shared/types/icons";


const AVAILABLE_ICONS: NodeType[] = [
  "pe",
  "dcgw",
  "leaf",
  "switch",
  "bridge",
  "spine",
  "super-spine",
  "server",
  "pon",
  "controller",
  "rgw",
  "ue",
  "cloud",
  "client"
];

const ICON_LABELS: Record<string, string> = {
  pe: "PE Router",
  dcgw: "DC Gateway",
  leaf: "Leaf",
  switch: "Switch",
  bridge: "Bridge",
  spine: "Spine",
  "super-spine": "Super Spine",
  server: "Server",
  pon: "PON",
  controller: "Controller",
  rgw: "RGW",
  ue: "User Equipment",
  cloud: "Cloud",
  client: "Client"
};

const DEFAULT_COLOR = "#1a73e8";
const MAX_RADIUS = 40;
const COLOR_DEBOUNCE_MS = 50;

const IconsGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
      gap: 0.5,
      borderRadius: 0.5,
      border: 1,
      p: 1
    }}
  >
    {children}
  </Box>
);

/**
 * Get icon source - for built-in icons applies color, for custom icons returns as-is
 */
function getIconSrc(icon: string, color: string, customIconDataUri?: string): string {
  // Custom icons render as-is (no color tinting)
  if (customIconDataUri) {
    return customIconDataUri;
  }
  // Built-in icons with color
  try {
    return generateEncodedSVG(icon as NodeType, color);
  } catch {
    return generateEncodedSVG("pe", color);
  }
}

/**
 * Hook to debounce a value - returns debounced value that updates after delay
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

interface UseIconSelectorStateReturn {
  icon: string;
  setIcon: (icon: string) => void;
  color: string;
  setColor: (color: string) => void;
  radius: number;
  setRadius: (radius: number) => void;
  useColor: boolean;
  setUseColor: (useColor: boolean) => void;
  displayColor: string;
  resultColor: string | null;
}

/**
 * Hook to manage icon selector form state
 */
function useIconSelectorState(
  isOpen: boolean,
  initialIcon: string,
  initialColor: string | null,
  initialCornerRadius: number
): UseIconSelectorStateReturn {
  const [icon, setIcon] = useState(initialIcon);
  const [color, setColor] = useState(initialColor || DEFAULT_COLOR);
  const [radius, setRadius] = useState(initialCornerRadius);
  const [useColor, setUseColor] = useState(!!initialColor);

  useEffect(() => {
    if (isOpen) {
      setIcon(initialIcon);
      setColor(initialColor || DEFAULT_COLOR);
      setRadius(initialCornerRadius);
      setUseColor(!!initialColor);
    }
  }, [isOpen, initialIcon, initialColor, initialCornerRadius]);

  const displayColor = useColor ? color : DEFAULT_COLOR;
  const resultColor = useColor && color !== DEFAULT_COLOR ? color : null;

  return {
    icon,
    setIcon,
    color,
    setColor,
    radius,
    setRadius,
    useColor,
    setUseColor,
    displayColor,
    resultColor
  };
}

interface IconSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (icon: string, color: string | null, cornerRadius: number) => void;
  initialIcon?: string;
  initialColor?: string | null;
  initialCornerRadius?: number;
}

interface IconButtonProps {
  icon: string;
  isSelected: boolean;
  iconSrc: string;
  cornerRadius: number;
  onClick: () => void;
  onDelete?: () => void;
  isCustom?: boolean;
  source?: "workspace" | "global";
}

const IconButton = React.memo<IconButtonProps>(function IconButton({
  icon,
  isSelected,
  iconSrc,
  cornerRadius,
  onClick,
  onDelete,
  isCustom,
  source
}) {
  return (
    <Box sx={{ position: "relative", minWidth: 0, "&:hover .icon-delete-btn": { opacity: 1 } }}>
      <Box
        component="button"
        type="button"
        onClick={onClick}
        title={(ICON_LABELS[icon] || icon) + (source ? " (" + source + ")" : "")}
        sx={{
          display: "flex",
          width: "100%",
          flexDirection: "column",
          alignItems: "center",
          gap: 0.25,
          borderRadius: 0.5,
          p: 0.75,
          overflow: "hidden",
          transition: "background-color 0.15s",
          border: "none",
          cursor: "pointer",
          color: "inherit"
        }}
      >
        <img
          src={iconSrc}
          alt={icon}
          style={{ width: 36, height: 36, borderRadius: `${(cornerRadius / 48) * 36}px` }}
        />
        <Box
          component="span"
          sx={{
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: "10px"
          }}
        >
          {ICON_LABELS[icon] || icon}
        </Box>
      </Box>
      {/* Delete button for global custom icons */}
      {isCustom && source === "global" && onDelete && (
        <MuiIconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title={`Delete ${icon}`}
          sx={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 16,
            height: 16,
            bgcolor: "error.main",
            color: "white",
            opacity: 0,
            "&:hover": { bgcolor: "error.dark" }
          }}
          className="icon-delete-btn"
        >
          <CloseIcon sx={{ fontSize: 12 }} />
        </MuiIconButton>
      )}
    </Box>
  );
});

const ColorPicker: React.FC<{
  color: string;
  enabled: boolean;
  onColorChange: (c: string) => void;
  onToggle: (e: boolean) => void;
}> = ({ color, enabled, onColorChange, onToggle }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
    <Typography variant="caption" color="text.secondary">
      Icon Color
    </Typography>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
        }
        label=""
        sx={{ m: 0, mr: -0.5 }}
      />
      <Box
        component="input"
        type="color"
        value={color}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          onColorChange(e.target.value);
          onToggle(true);
        }}
        disabled={!enabled}
        sx={{
          height: 28,
          width: 48,
          cursor: "pointer",
          borderRadius: 0.5,
          border: 1,
          borderColor: "divider",
          p: 0.25
        }}
      />
      <TextField
        size="small"
        value={enabled ? color : ""}
        onChange={(e) => {
          if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
            onColorChange(e.target.value);
            onToggle(true);
          }
        }}
        placeholder={DEFAULT_COLOR}
        slotProps={{ htmlInput: { maxLength: 7 } }}
        disabled={!enabled}
        sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: "0.75rem" } }}
      />
    </Box>
  </Box>
);

const RadiusSlider: React.FC<{ value: number; onChange: (v: number) => void }> = ({
  value,
  onChange
}) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
    <Typography variant="caption" color="text.secondary">
      Corner Radius: {value}px
    </Typography>
    <Slider
      size="small"
      min={0}
      max={MAX_RADIUS}
      value={value}
      onChange={(_e, v) => onChange(v as number)}
    />
  </Box>
);

export const IconSelectorModal: React.FC<IconSelectorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialIcon = "pe",
  initialColor = null,
  initialCornerRadius = 0
}) => {
  const customIcons = useCustomIcons();

  const {
    icon,
    setIcon,
    color,
    setColor,
    radius,
    setRadius,
    useColor,
    setUseColor,
    displayColor,
    resultColor
  } = useIconSelectorState(isOpen, initialIcon, initialColor, initialCornerRadius);

  useEscapeKey(isOpen, onClose);

  // Debounce color for icon grid to reduce SVG regeneration during color picker drag
  const debouncedGridColor = useDebouncedValue(displayColor, COLOR_DEBOUNCE_MS);

  // Check if current icon is a custom icon
  const currentCustomIcon = useMemo(() => {
    return customIcons.find((ci) => ci.name === icon);
  }, [customIcons, icon]);

  // Memoize icon sources for built-in icons - only regenerate when debounced color changes
  const iconSources = useMemo(() => {
    const sources: Record<string, string> = {};
    for (const i of AVAILABLE_ICONS) {
      sources[i] = getIconSrc(i, debouncedGridColor);
    }
    return sources;
  }, [debouncedGridColor]);

  // Memoize click handlers to prevent IconButton re-renders
  const iconClickHandlers = useRef<Record<string, () => void>>({});
  useMemo(() => {
    for (const i of AVAILABLE_ICONS) {
      iconClickHandlers.current[i] = () => setIcon(i);
    }
    // Add handlers for custom icons
    for (const ci of customIcons) {
      iconClickHandlers.current[ci.name] = () => setIcon(ci.name);
    }
  }, [setIcon, customIcons]);

  const handleSave = useCallback(() => {
    onSave(icon, resultColor, radius);
    onClose();
  }, [icon, resultColor, radius, onSave, onClose]);

  const handleUploadIcon = useCallback(() => {
    postCommand("icon-upload");
  }, []);

  const handleDeleteIcon = useCallback((iconName: string) => {
    postCommand("icon-delete", { iconName });
  }, []);

  // Get preview icon source
  const previewIconSrc = useMemo(() => {
    if (currentCustomIcon) {
      return currentCustomIcon.dataUri;
    }
    return getIconSrc(icon, displayColor);
  }, [icon, displayColor, currentCustomIcon]);

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5 }}>
        Select Icon
        <MuiIconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </MuiIconButton>
      </DialogTitle>
      <DialogContent dividers>
        {/* Built-in Icons Grid */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            Built-in Icons
          </Typography>
          <IconsGrid>
            {AVAILABLE_ICONS.map((i) => (
              <IconButton
                key={i}
                icon={i}
                isSelected={icon === i}
                iconSrc={iconSources[i]}
                cornerRadius={radius}
                onClick={iconClickHandlers.current[i]}
              />
            ))}
          </IconsGrid>
        </Box>

        {/* Custom Icons Section */}
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Custom Icons
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleUploadIcon}
              sx={{ textTransform: "none", fontSize: "0.7rem", py: 0, minHeight: 24 }}
            >
              + Add
            </Button>
          </Box>
          {customIcons.length > 0 ? (
            <IconsGrid>
              {customIcons.map((ci) => (
                <IconButton
                  key={ci.name}
                  icon={ci.name}
                  isSelected={icon === ci.name}
                  iconSrc={ci.dataUri}
                  cornerRadius={radius}
                  onClick={iconClickHandlers.current[ci.name]}
                  onDelete={() => handleDeleteIcon(ci.name)}
                  isCustom={true}
                  source={ci.source}
                />
              ))}
            </IconsGrid>
          ) : (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontStyle: "italic",
                p: 1,
                textAlign: "center",
                display: "block",
                border: 1,
                borderStyle: "dashed",
                borderColor: "divider",
                borderRadius: 0.5
              }}
            >
              No custom icons. Click &quot;+ Add&quot; to upload.
            </Typography>
          )}
        </Box>

        {/* Color, Radius, and Preview */}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 1.5 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {/* Only show color picker for built-in icons */}
            {isBuiltInIcon(icon) ? (
              <ColorPicker
                color={color}
                enabled={useColor}
                onColorChange={setColor}
                onToggle={setUseColor}
              />
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                Custom icons use their original colors
              </Typography>
            )}
            <RadiusSlider value={radius} onChange={setRadius} />
          </Box>
          <PreviewCustom iconSrc={previewIconSrc} radius={radius} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button variant="outlined" size="small" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" size="small" onClick={handleSave}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Preview component that accepts direct icon source
 */
const PreviewCustom: React.FC<{ iconSrc: string; radius: number }> = ({ iconSrc, radius }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
    <Typography variant="caption" color="text.secondary">
      Preview
    </Typography>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 0.5, border: 1, p: 1.5 }}>
      <img
        src={iconSrc}
        alt="Preview"
        style={{ width: 56, height: 56, borderRadius: `${(radius / 48) * 56}px` }}
      />
    </Box>
  </Box>
);
