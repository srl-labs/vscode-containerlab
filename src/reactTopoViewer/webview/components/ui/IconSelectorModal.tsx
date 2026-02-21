// Icon selector modal.
import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Close as CloseIcon, Replay as ResetIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  Divider,
  IconButton as MuiIconButton,
  Tab,
  Tabs,
  Tooltip,
  Typography
} from "@mui/material";

import type { NodeType } from "../../icons/SvgGenerator";
import { generateEncodedSVG } from "../../icons/SvgGenerator";
import { useEscapeKey } from "../../hooks/ui/useDomInteractions";
import { useCustomIcons } from "../../stores/topoViewerStore";
import { postCommand } from "../../messaging/extensionMessaging";
import { isBuiltInIcon } from "../../../shared/types/icons";

import { DialogCancelSaveActions, DialogTitleWithClose } from "./dialog/DialogChrome";
import { ColorField, IconPreview, InputField } from "./form";

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
const NODE_TYPE_SET: ReadonlySet<string> = new Set(AVAILABLE_ICONS);

function isNodeType(value: string): value is NodeType {
  return NODE_TYPE_SET.has(value);
}

function isIconTab(value: unknown): value is "built-in" | "custom" {
  return value === "built-in" || value === "custom";
}

const IconsGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
      gap: 0.5,
      borderRadius: 0.5,
      border: 1,
      borderColor: "divider",
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
  if (customIconDataUri !== undefined && customIconDataUri.length > 0) {
    return customIconDataUri;
  }
  // Built-in icons with color
  try {
    return generateEncodedSVG(isNodeType(icon) ? icon : "pe", color);
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
  const [color, setColor] = useState(initialColor ?? DEFAULT_COLOR);
  const [radius, setRadius] = useState(initialCornerRadius);

  useEffect(() => {
    if (isOpen) {
      setIcon(initialIcon);
      setColor(initialColor ?? DEFAULT_COLOR);
      setRadius(initialCornerRadius);
    }
  }, [isOpen, initialIcon, initialColor, initialCornerRadius]);

  const resultColor = color !== DEFAULT_COLOR ? color : null;

  return {
    icon,
    setIcon,
    color,
    setColor,
    radius,
    setRadius,
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
  const showDeleteButton = isCustom === true && source === "global" && onDelete !== undefined;
  const handleDelete = onDelete ?? (() => undefined);
  return (
    <Box sx={{ position: "relative", minWidth: 0, "&:hover .icon-delete-btn": { opacity: 1 } }}>
      <Box
        component="button"
        type="button"
        onClick={onClick}
        aria-pressed={isSelected}
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
          transition: (theme) => theme.transitions.create("backgroundColor", { duration: 150 }),
          border: "none",
          cursor: "pointer",
          color: "inherit",
          backgroundColor: isSelected ? "action.selected" : "transparent",
          outline: isSelected ? "2px solid" : "none",
          outlineColor: "primary.main",
          outlineOffset: 1,
          "&:hover": {
            backgroundColor: isSelected ? "action.selected" : "action.hover"
          }
        }}
      >
        <IconPreview src={iconSrc} alt={icon} size={36} cornerRadius={cornerRadius} />
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
      {showDeleteButton && (
        <MuiIconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
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

const RadiusField: React.FC<{ value: number; onChange: (v: number) => void }> = ({
  value,
  onChange
}) => (
  <InputField
    id="icon-corner-radius"
    label="Corner Radius"
    type="number"
    value={String(value)}
    onChange={(v) => {
      const n = parseInt(v, 10);
      if (!isNaN(n)) onChange(Math.max(0, Math.min(MAX_RADIUS, n)));
      else if (v === "") onChange(0);
    }}
    min={0}
    max={MAX_RADIUS}
    step={1}
    suffix="px"
  />
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
    resultColor
  } = useIconSelectorState(isOpen, initialIcon, initialColor, initialCornerRadius);

  useEscapeKey(isOpen, onClose);

  // Debounce color for icon grid to reduce SVG regeneration during color picker drag
  const debouncedGridColor = useDebouncedValue(color, COLOR_DEBOUNCE_MS);

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
    return getIconSrc(icon, color);
  }, [icon, color, currentCustomIcon]);

  const [iconTab, setIconTab] = useState<"built-in" | "custom">("built-in");

  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitleWithClose title="Edit Icons" onClose={onClose} />
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          {/* Icon tabs */}
          <Tabs
            value={iconTab}
            onChange={(_e, v: unknown) => {
              if (isIconTab(v)) {
                setIconTab(v);
              }
            }}
            variant="fullWidth"
          >
            <Tab value="built-in" label="Built-in" />
            <Tab value="custom" label="Custom" />
          </Tabs>
          <Divider />

          {/* Built-in Icons tab content */}
          {iconTab === "built-in" && (
            <Box sx={{ p: 2 }}>
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
          )}

          {/* Custom Icons tab content */}
          {iconTab === "custom" && (
            <Box sx={{ p: 2 }}>
              {customIcons.length > 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
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
                  <Button
                    fullWidth
                    size="small"
                    onClick={handleUploadIcon}
                  >
                    + Add Icon
                  </Button>
                </Box>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, py: 2 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontStyle: "italic" }}
                  >
                    No custom icons uploaded yet.
                  </Typography>
                  <Button
                    fullWidth
                    size="small"
                    onClick={handleUploadIcon}
                  >
                    + Add Icon
                  </Button>
                </Box>
              )}
            </Box>
          )}

          {/* Appearance section */}
          <Divider />
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2">Appearance</Typography>
          </Box>
          <Divider />
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, p: 2 }}>
            <Tooltip
              title={!isBuiltInIcon(icon) ? "Color cannot be modified for custom icons" : ""}
              placement="top"
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box sx={{ flex: 1 }}>
                  <ColorField
                    label="Icon Color"
                    value={color}
                    onChange={(v) => setColor(v)}
                    disabled={!isBuiltInIcon(icon)}
                  />
                </Box>
                <Tooltip title="Reset to default color" placement="top">
                  <span>
                    <MuiIconButton
                      size="small"
                      onClick={() => setColor(DEFAULT_COLOR)}
                      disabled={!isBuiltInIcon(icon) || color === DEFAULT_COLOR}
                    >
                      <ResetIcon fontSize="small" />
                    </MuiIconButton>
                  </span>
                </Tooltip>
              </Box>
            </Tooltip>
            <RadiusField value={radius} onChange={setRadius} />
          </Box>

          {/* Preview section */}
          <Divider />
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2">Preview</Typography>
          </Box>
          <Divider />
          <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
            <IconPreview src={previewIconSrc} alt="Preview" size={56} cornerRadius={radius} />
          </Box>
        </Box>
      </DialogContent>
      <DialogCancelSaveActions onCancel={onClose} onSave={handleSave} />
    </Dialog>
  );
};
