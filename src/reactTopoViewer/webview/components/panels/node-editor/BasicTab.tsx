// Basic tab for node editor.
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Box, Button, Typography } from "@mui/material";
import {
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
  SwapHoriz as SwapHorizIcon,
  SyncAlt as SyncAltIcon
} from "@mui/icons-material";

import {
  InputField,
  FilterableDropdown,
  IconPreview,
  PanelSection,
  SelectField,
  ColorField,
  CheckboxField
} from "../../ui/form";
import { IconSelectorModal } from "../../ui/IconSelectorModal";
import type { NodeType } from "../../../icons/SvgGenerator";
import { generateEncodedSVG } from "../../../icons/SvgGenerator";
import { useSchema, useDockerImages } from "../../../hooks/editor";
import { useCustomIcons } from "../../../stores/topoViewerStore";
import { buildCustomIconMap } from "../../../utils/iconUtils";
import { DEFAULT_ICON_COLOR } from "../../canvas/types";

import type { TabProps } from "./types";
import { CustomNodeTemplateFields } from "./CustomNodeTemplateFields";

// Icon options for dropdown (static, defined outside component)
const ICON_OPTIONS = [
  { value: "pe", label: "PE Router" },
  { value: "dcgw", label: "DC Gateway" },
  { value: "leaf", label: "Leaf" },
  { value: "switch", label: "Switch" },
  { value: "bridge", label: "Bridge" },
  { value: "spine", label: "Spine" },
  { value: "super-spine", label: "Super Spine" },
  { value: "server", label: "Server" },
  { value: "pon", label: "PON" },
  { value: "controller", label: "Controller" },
  { value: "rgw", label: "RGW" },
  { value: "ue", label: "User Equipment" },
  { value: "cloud", label: "Cloud" },
  { value: "client", label: "Client" }
];

const NODE_LABEL_POSITION_OPTIONS = [
  { value: "bottom", label: "Bottom" },
  { value: "top", label: "Top" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" }
];

const NODE_DIRECTION_OPTIONS = [
  { value: "right", label: "Horizontal", icon: <SwapHorizIcon fontSize="small" /> },
  { value: "down", label: "Rotate text 90deg", icon: <RotateRightIcon fontSize="small" /> },
  { value: "left", label: "Rotate text 180deg", icon: <SyncAltIcon fontSize="small" /> },
  { value: "up", label: "Rotate text 270deg", icon: <RotateLeftIcon fontSize="small" /> }
];

/**
 * Get icon SVG source with fallback
 */
function getIconSrc(icon: string, color: string): string {
  try {
    return generateEncodedSVG(icon as NodeType, color);
  } catch {
    return generateEncodedSVG("pe", color);
  }
}

/**
 * Node Name field - shown only for regular nodes
 */
const NodeNameField: React.FC<TabProps> = ({ data, onChange }) => (
  <InputField
    id="node-name"
    label="Node Name"
    value={data.name || ""}
    onChange={(value) => onChange({ name: value })}
  />
);

/**
 * Kind field with filterable dropdown - options from schema
 */
interface KindFieldProps extends TabProps {
  kinds: string[];
  onKindChange: (kind: string) => void;
}

const KindField: React.FC<KindFieldProps> = ({ data, onChange, kinds, onKindChange }) => {
  const kindOptions = useMemo(() => kinds.map((kind) => ({ value: kind, label: kind })), [kinds]);

  const handleKindChange = useCallback(
    (value: string) => {
      onChange({ kind: value });
      onKindChange(value);
    },
    [onChange, onKindChange]
  );

  return (
    <FilterableDropdown
      id="node-kind"
      label="Kind"
      options={kindOptions}
      value={data.kind || ""}
      onChange={handleKindChange}
      placeholder="Search or type kind..."
      allowFreeText={true}
    />
  );
};

/**
 * Type field with filterable dropdown - options depend on selected kind
 */
interface TypeFieldProps extends TabProps {
  availableTypes: string[];
}

const TypeField: React.FC<TypeFieldProps> = ({ data, onChange, availableTypes }) => {
  const typeOptions = useMemo(
    () => availableTypes.map((type) => ({ value: type, label: type })),
    [availableTypes]
  );

  return (
    <FilterableDropdown
      id="node-type"
      label="Type"
      options={typeOptions}
      value={data.type || ""}
      onChange={(value) => onChange({ type: value })}
      placeholder={
        availableTypes.length > 0 ? "Search or type..." : "Type value (no predefined types)"
      }
      allowFreeText={true}
    />
  );
};

/**
 * Image/Version fields with docker images support
 * When docker images are available, shows filterable dropdowns
 * Otherwise falls back to simple text inputs
 */
interface ImageVersionFieldsProps extends TabProps {
  baseImages: string[];
  hasImages: boolean;
  getVersionsForImage: (base: string) => string[];
  parseImageString: (full: string) => { base: string; version: string };
  combineImageVersion: (base: string, version: string) => string;
}

const ImageVersionFields: React.FC<ImageVersionFieldsProps> = ({
  data,
  onChange,
  baseImages,
  hasImages,
  getVersionsForImage,
  parseImageString,
  combineImageVersion
}) => {
  // Parse the current image into base and version
  const { base: currentBase, version: currentVersion } = useMemo(() => {
    return parseImageString(data.image || "");
  }, [data.image, parseImageString]);

  // Track version separately for better UX when changing base image
  const [localVersion, setLocalVersion] = useState(currentVersion);

  // Sync local version when image changes externally
  useEffect(() => {
    setLocalVersion(currentVersion);
  }, [currentVersion]);

  // Get available versions for current base image
  const availableVersions = useMemo(() => {
    return getVersionsForImage(currentBase);
  }, [currentBase, getVersionsForImage]);

  // Build options for base image dropdown
  const imageOptions = useMemo(
    () => baseImages.map((img) => ({ value: img, label: img })),
    [baseImages]
  );

  // Build options for version dropdown
  const versionOptions = useMemo(
    () => availableVersions.map((v) => ({ value: v, label: v })),
    [availableVersions]
  );

  // Handle base image change
  const handleBaseChange = useCallback(
    (newBase: string) => {
      // Get first available version for the new base, or keep current if custom
      const versions = getVersionsForImage(newBase);
      const newVersion = versions.length > 0 ? versions[0] : localVersion;
      setLocalVersion(newVersion);
      onChange({ image: combineImageVersion(newBase, newVersion) });
    },
    [getVersionsForImage, localVersion, onChange, combineImageVersion]
  );

  // Handle version change
  const handleVersionChange = useCallback(
    (newVersion: string) => {
      setLocalVersion(newVersion);
      onChange({ image: combineImageVersion(currentBase, newVersion) });
    },
    [currentBase, onChange, combineImageVersion]
  );

  // If we have docker images, show dropdowns
  if (hasImages) {
    return (
      <>
        <FilterableDropdown
          id="node-image"
          label="Image"
          options={imageOptions}
          value={currentBase}
          onChange={handleBaseChange}
          placeholder="Search for image..."
          allowFreeText={true}
        />
        <FilterableDropdown
          id="node-version"
          label="Version"
          options={versionOptions}
          value={localVersion}
          onChange={handleVersionChange}
          placeholder="Select version..."
          allowFreeText={true}
        />
      </>
    );
  }

  // Fallback to simple text inputs
  return (
    <>
      <InputField
        id="node-image"
        label="Image"
        value={currentBase}
        onChange={handleBaseChange}
        placeholder="e.g., ghcr.io/nokia/srlinux"
      />
      <InputField
        id="node-version"
        label="Version"
        value={localVersion}
        onChange={handleVersionChange}
        placeholder="e.g., latest"
      />
    </>
  );
};

/**
 * Icon field with preview, filterable dropdown, and edit modal
 * Supports both built-in icons and custom icons from context
 */
const IconField: React.FC<TabProps> = ({ data, onChange }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const customIcons = useCustomIcons();

  const color = data.iconColor || DEFAULT_ICON_COLOR;
  // Don't apply default for dropdown value - show actual value (or empty)
  // Only use fallback for preview image rendering
  const icon = data.icon || "";
  const previewIcon = icon || "pe";

  // Build custom icon map for efficient lookup
  const customIconMap = useMemo(() => buildCustomIconMap(customIcons), [customIcons]);

  // Build combined icon options (built-in + custom)
  const allIconOptions = useMemo(() => {
    const customOptions = customIcons.map((ci) => ({
      value: ci.name,
      label: ci.name + " (custom)"
    }));
    return [...ICON_OPTIONS, ...customOptions];
  }, [customIcons]);

  // Get icon source - check custom icons first, then built-in
  const getIconSource = useCallback(
    (iconName: string, iconColor: string): string => {
      const customDataUri = customIconMap.get(iconName);
      if (customDataUri) {
        return customDataUri;
      }
      return getIconSrc(iconName, iconColor);
    },
    [customIconMap]
  );

  const handleIconSave = useCallback(
    (newIcon: string, newColor: string | null, cornerRadius: number) => {
      onChange({
        icon: newIcon,
        iconColor: newColor ?? undefined,
        iconCornerRadius: cornerRadius
      });
    },
    [onChange]
  );

  // Render icon option with preview
  const renderOption = useCallback(
    (option: { value: string; label: string }) => (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconPreview
          src={getIconSource(option.value, color)}
          alt={option.label}
          size={24}
          cornerRadius={data.iconCornerRadius}
        />
        <span>{option.label}</span>
      </Box>
    ),
    [color, data.iconCornerRadius, getIconSource]
  );

  return (
    <>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        <Box sx={{ flexShrink: 0 }}>
          <IconPreview
            src={getIconSource(previewIcon, color)}
            alt="Icon preview"
            size={32}
            cornerRadius={data.iconCornerRadius}
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <FilterableDropdown
            id="node-icon"
            label="Icon"
            options={allIconOptions}
            value={icon}
            onChange={(value) => onChange({ icon: value })}
            placeholder="Select icon..."
            allowFreeText={false}
            renderOption={renderOption}
          />
        </Box>
        <Button
          size="small"
          onClick={() => setIsModalOpen(true)}
          sx={{ whiteSpace: "nowrap", alignSelf: "stretch" }}
        >
          Edit
        </Button>
      </Box>

      <IconSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleIconSave}
        initialIcon={previewIcon}
        initialColor={data.iconColor}
        initialCornerRadius={data.iconCornerRadius || 0}
      />
    </>
  );
};

const LabelAndDirectionFields: React.FC<TabProps> = ({ data, onChange }) => {
  const isTransparent = data.labelBackgroundColor?.trim().toLowerCase() === "transparent";
  const pickerColor = !isTransparent && data.labelBackgroundColor ? data.labelBackgroundColor : "#000000";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <SelectField
          id="node-label-position"
          label="Label Position"
          value={data.labelPosition ?? "bottom"}
          onChange={(value) => onChange({ labelPosition: value })}
          options={NODE_LABEL_POSITION_OPTIONS}
        />
      <SelectField
        id="node-direction"
        label="Label Text Direction"
        value={data.direction ?? "right"}
        onChange={(value) => onChange({ direction: value })}
        options={NODE_DIRECTION_OPTIONS}
      />
      </Box>
      <ColorField
        id="node-label-bg-color"
        label="Label Background"
        value={pickerColor}
        onChange={(value) => onChange({ labelBackgroundColor: value })}
        disabled={isTransparent}
      />
      <CheckboxField
        id="node-label-bg-transparent"
        label="Transparent"
        checked={isTransparent}
        onChange={(checked) => onChange({ labelBackgroundColor: checked ? "transparent" : "" })}
      />
    </Box>
  );
};

export const BasicTab: React.FC<TabProps> = ({ data, onChange, inheritedProps = [] }) => {
  // Get schema data (kinds and types)
  const { kinds, getTypesForKind, kindSupportsType, isLoaded } = useSchema();

  // Get docker images data
  const { baseImages, hasImages, getVersionsForImage, parseImageString, combineImageVersion } =
    useDockerImages();

  // Track available types based on selected kind
  const availableTypes = useMemo(() => {
    return getTypesForKind(data.kind || "");
  }, [data.kind, getTypesForKind]);

  // Check if the current kind supports the type field
  const showTypeField = useMemo(() => {
    return kindSupportsType(data.kind || "");
  }, [data.kind, kindSupportsType]);

  // Handler for kind changes - always clear type since different kinds have different type options
  const handleKindChange = useCallback(
    (_newKind: string) => {
      // Always clear type when kind changes - types are kind-specific
      if (data.type) {
        onChange({ type: undefined });
      }
    },
    [data.type, onChange]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {data.isCustomTemplate && (
        <PanelSection title="Template" withTopDivider={false}>
          <CustomNodeTemplateFields data={data} onChange={onChange} />
        </PanelSection>
      )}

      <PanelSection title="Node Parameters">
        {!data.isCustomTemplate && <NodeNameField data={data} onChange={onChange} />}

        <KindField
          data={data}
          onChange={onChange}
          kinds={kinds}
          onKindChange={handleKindChange}
          inheritedProps={inheritedProps}
        />

        {showTypeField && (
          <TypeField
            data={data}
            onChange={onChange}
            availableTypes={availableTypes}
            inheritedProps={inheritedProps}
          />
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <ImageVersionFields
            data={data}
            onChange={onChange}
            baseImages={baseImages}
            hasImages={hasImages}
            getVersionsForImage={getVersionsForImage}
            parseImageString={parseImageString}
            combineImageVersion={combineImageVersion}
            inheritedProps={inheritedProps}
          />
        </Box>

        {!isLoaded && (
          <Typography variant="caption" color="text.secondary">
            Loading schema...
          </Typography>
        )}
      </PanelSection>

      <PanelSection title="Icon" bodySx={{ p: 2 }}>
        <IconField data={data} onChange={onChange} />
      </PanelSection>

      {!data.isCustomTemplate && (
        <PanelSection title="Label & Direction" bodySx={{ p: 2 }}>
          <LabelAndDirectionFields data={data} onChange={onChange} />
        </PanelSection>
      )}
    </Box>
  );
};
