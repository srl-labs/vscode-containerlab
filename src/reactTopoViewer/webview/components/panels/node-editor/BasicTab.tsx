/**
 * Basic Tab for Node Editor
 *
 * Shows different fields depending on whether we're editing:
 * - A regular node: Node Name + Kind/Type/Image/Version/Icon fields
 * - A custom node template: Custom Node Name, Base Name, Interface Pattern, Set as default + Kind/Type/Image/Version/Icon fields
 */
import React, { useState, useMemo, useCallback, useEffect } from "react";

import { FormField, InputField, FilterableDropdown } from "../../ui/form";
import { IconSelectorModal } from "../../ui/IconSelectorModal";
import type { NodeType } from "../../../icons/SvgGenerator";
import { generateEncodedSVG } from "../../../icons/SvgGenerator";
import { useSchema, useDockerImages } from "../../../hooks/editor";
import { useCustomIcons } from "../../../stores/topoViewerStore";
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
 * Calculate border radius based on corner radius setting
 */
function calcBorderRadius(cornerRadius: number | undefined, size: number): string | undefined {
  return cornerRadius ? `${(cornerRadius / 48) * size}px` : undefined;
}

/**
 * Node Name field - shown only for regular nodes
 */
const NodeNameField: React.FC<TabProps> = ({ data, onChange }) => (
  <FormField label="Node Name">
    <InputField
      id="node-name"
      value={data.name || ""}
      onChange={(value) => onChange({ name: value })}
    />
  </FormField>
);

/**
 * Kind field with filterable dropdown - options from schema
 */
interface KindFieldProps extends TabProps {
  kinds: string[];
  onKindChange: (kind: string) => void;
}

const KindField: React.FC<KindFieldProps> = ({
  data,
  onChange,
  kinds,
  onKindChange,
  inheritedProps = []
}) => {
  const kindOptions = useMemo(() => kinds.map((kind) => ({ value: kind, label: kind })), [kinds]);

  const handleKindChange = useCallback(
    (value: string) => {
      onChange({ kind: value });
      onKindChange(value);
    },
    [onChange, onKindChange]
  );

  return (
    <FormField label="Kind" inherited={inheritedProps.includes("kind")}>
      <FilterableDropdown
        id="node-kind"
        options={kindOptions}
        value={data.kind || ""}
        onChange={handleKindChange}
        placeholder="Search or type kind..."
        allowFreeText={true}
      />
    </FormField>
  );
};

/**
 * Type field with filterable dropdown - options depend on selected kind
 */
interface TypeFieldProps extends TabProps {
  availableTypes: string[];
}

const TypeField: React.FC<TypeFieldProps> = ({
  data,
  onChange,
  availableTypes,
  inheritedProps = []
}) => {
  const typeOptions = useMemo(
    () => availableTypes.map((type) => ({ value: type, label: type })),
    [availableTypes]
  );

  return (
    <FormField label="Type" inherited={inheritedProps.includes("type")}>
      <FilterableDropdown
        id="node-type"
        options={typeOptions}
        value={data.type || ""}
        onChange={(value) => onChange({ type: value })}
        placeholder={
          availableTypes.length > 0 ? "Search or type..." : "Type value (no predefined types)"
        }
        allowFreeText={true}
      />
    </FormField>
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
  combineImageVersion,
  inheritedProps = []
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

  const isImageInherited = inheritedProps.includes("image");

  // If we have docker images, show dropdowns
  if (hasImages) {
    return (
      <>
        <FormField label="Image" inherited={isImageInherited}>
          <FilterableDropdown
            id="node-image"
            options={imageOptions}
            value={currentBase}
            onChange={handleBaseChange}
            placeholder="Search for image..."
            allowFreeText={true}
          />
        </FormField>
        <FormField label="Version">
          <FilterableDropdown
            id="node-version"
            options={versionOptions}
            value={localVersion}
            onChange={handleVersionChange}
            placeholder="Select version..."
            allowFreeText={true}
          />
        </FormField>
      </>
    );
  }

  // Fallback to simple text inputs
  return (
    <>
      <FormField label="Image" inherited={isImageInherited}>
        <InputField
          id="node-image"
          value={currentBase}
          onChange={handleBaseChange}
          placeholder="e.g., ghcr.io/nokia/srlinux"
        />
      </FormField>
      <FormField label="Version">
        <InputField
          id="node-version"
          value={localVersion}
          onChange={handleVersionChange}
          placeholder="e.g., latest"
        />
      </FormField>
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
  const customIconMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ci of customIcons) {
      map.set(ci.name, ci.dataUri);
    }
    return map;
  }, [customIcons]);

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
      <div className="flex items-center gap-2">
        <img
          src={getIconSource(option.value, color)}
          alt={option.label}
          className="h-6 w-6 rounded-sm"
          style={{ borderRadius: calcBorderRadius(data.iconCornerRadius, 24) }}
        />
        <span>{option.label}</span>
      </div>
    ),
    [color, data.iconCornerRadius, getIconSource]
  );

  return (
    <>
      <FormField label="Icon">
        <div className="flex gap-2 items-start">
          <img
            src={getIconSource(previewIcon, color)}
            alt="Icon preview"
            className="h-9 w-9 rounded-sm"
            style={{ borderRadius: calcBorderRadius(data.iconCornerRadius, 36) }}
          />
          <div className="flex-1">
            <FilterableDropdown
              id="node-icon"
              options={allIconOptions}
              value={icon}
              onChange={(value) => onChange({ icon: value })}
              placeholder="Select icon..."
              allowFreeText={false}
              renderOption={renderOption}
              menuClassName="max-h-64"
            />
          </div>
          <button
            type="button"
            className="btn btn-small whitespace-nowrap"
            title="Customize icon color and shape"
            onClick={() => setIsModalOpen(true)}
          >
            <i className="fas fa-palette mr-1" />
            Edit
          </button>
        </div>
      </FormField>

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
    <div className="space-y-3">
      {/* Show Node Name for regular nodes, Custom Template fields for custom node templates */}
      {data.isCustomTemplate ? (
        <CustomNodeTemplateFields data={data} onChange={onChange} />
      ) : (
        <NodeNameField data={data} onChange={onChange} />
      )}

      {/* Kind/Type fields - use schema data */}
      <KindField
        data={data}
        onChange={onChange}
        kinds={kinds}
        onKindChange={handleKindChange}
        inheritedProps={inheritedProps}
      />

      {/* Only show Type field for kinds that support it */}
      {showTypeField && (
        <TypeField
          data={data}
          onChange={onChange}
          availableTypes={availableTypes}
          inheritedProps={inheritedProps}
        />
      )}

      {/* Image and Version in 2-column grid */}
      <div className="grid grid-cols-2 gap-2">
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
      </div>

      <IconField data={data} onChange={onChange} />

      {/* Show loading indicator if schema not yet loaded */}
      {!isLoaded && <div className="helper-text opacity-60">Loading schema...</div>}
    </div>
  );
};
