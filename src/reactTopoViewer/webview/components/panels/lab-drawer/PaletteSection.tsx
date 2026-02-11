/**
 * PaletteSection - Node and annotation palette for the Lab Drawer
 * Uses MUI components with drag-and-drop functionality
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccountTree as AccountTreeIcon,
  Add as AddIcon,
  Cable as CableIcon,
  CircleOutlined as CircleOutlinedIcon,
  Clear as ClearIcon,
  Cloud as CloudIcon,
  CropSquare as CropSquareIcon,
  Delete as DeleteIcon,
  DeviceHub as DeviceHubIcon,
  Dns as DnsIcon,
  Edit as EditIcon,
  Hub as HubIcon,
  Lan as LanIcon,
  Power as PowerIcon,
  Remove as RemoveIcon,
  Search as SearchIcon,
  SelectAll as SelectAllIcon,
  Star as StarIcon,
  StarOutline as StarOutlineIcon,
  TextFields as TextFieldsIcon,
  ViewInAr as ViewInArIcon
} from "@mui/icons-material";
import { Box, Button, Card, IconButton, InputAdornment, TextField, Tooltip, Typography } from "@mui/material";

import type { CustomNodeTemplate } from "../../../../shared/types/editors";
import { ROLE_SVG_MAP, DEFAULT_ICON_COLOR } from "../../../../shared/types/graph";
import { generateEncodedSVG, type NodeType } from "../../../icons/SvgGenerator";
import { useCustomNodes, useTopoViewerStore } from "../../../stores/topoViewerStore";
import type { TabDefinition } from "../../ui/editor";
import { TabNavigation } from "../../ui/editor/TabNavigation";
import { MonacoCodeEditor } from "../../monaco/MonacoCodeEditor";
import clabSchema from "../../../../../../schema/clab.schema.json";

interface PaletteSectionProps {
  mode?: "edit" | "view";
  isLocked?: boolean;
  requestedTab?: { tab: number };
  onEditCustomNode?: (nodeName: string) => void;
  onDeleteCustomNode?: (nodeName: string) => void;
  onSetDefaultCustomNode?: (nodeName: string) => void;
}

/** Network type definitions for the palette */
interface NetworkTypeDefinition {
  readonly type: string;
  readonly label: string;
  readonly icon: React.ReactNode;
}

const NETWORK_TYPE_DEFINITIONS: readonly NetworkTypeDefinition[] = [
  { type: "host", label: "Host", icon: <DnsIcon fontSize="small" /> },
  { type: "mgmt-net", label: "Mgmt Net", icon: <LanIcon fontSize="small" /> },
  { type: "macvlan", label: "Macvlan", icon: <CableIcon fontSize="small" /> },
  { type: "vxlan", label: "VXLAN", icon: <DeviceHubIcon fontSize="small" /> },
  { type: "vxlan-stitch", label: "VXLAN Stitch", icon: <CableIcon fontSize="small" /> },
  { type: "dummy", label: "Dummy", icon: <PowerIcon fontSize="small" /> },
  { type: "bridge", label: "Bridge", icon: <AccountTreeIcon fontSize="small" /> },
  { type: "ovs-bridge", label: "OVS Bridge", icon: <HubIcon fontSize="small" /> }
];

/** Map role to SVG node type */
function getRoleSvgType(role: string): NodeType {
  const mapped = ROLE_SVG_MAP[role];
  if (mapped) return mapped as NodeType;
  return "pe";
}

/** Get the SVG icon URL for a template */
function getTemplateIconUrl(template: CustomNodeTemplate): string {
  const role = template.icon || "pe";
  const color = template.iconColor || DEFAULT_ICON_COLOR;
  const svgType = getRoleSvgType(role);
  return generateEncodedSVG(svgType, color);
}

const PALETTE_ICON_SIZE = 28;
const REACTFLOW_NODE_MIME_TYPE = "application/reactflow-node";
const ACTION_HOVER_BG = "action.hover";
const TEXT_SECONDARY = "text.secondary";

/** Full-size Monaco source editor tab. */
const SourceEditorTab: React.FC<{
  readOnly: boolean;
  error: string | null;
  language: "yaml" | "json";
  value: string;
  jsonSchema?: object;
  onChange: (next: string) => void;
}> = ({ readOnly, error, language, value, jsonSchema, onChange }) => (
  <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
    {error && (
      <Typography variant="caption" color="error" sx={{ px: 2, py: 0.5 }}>
        {error}
      </Typography>
    )}
    <Box sx={{ flex: 1, minHeight: 0 }}>
      <MonacoCodeEditor
        language={language}
        value={value}
        readOnly={readOnly}
        jsonSchema={jsonSchema}
        onChange={readOnly ? undefined : onChange}
      />
    </Box>
  </Box>
);

const PaletteDraggableCard: React.FC<{
  onDragStart: (event: React.DragEvent) => void;
  children: React.ReactNode;
}> = ({ onDragStart, children }) => (
  <Tooltip title="Drag to canvas" placement="top" enterDelay={500} slotProps={{ popper: { modifiers: [{ name: "offset", options: { offset: [-20, -20] } }] } }}>
    <Card
      variant="outlined"
      draggable
      onDragStart={onDragStart}
      sx={{
        p: 1,
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        gap: 1,
        "&:hover": { bgcolor: ACTION_HOVER_BG },
        "&:active": { cursor: "grabbing" }
      }}
    >
      {children}
    </Card>
  </Tooltip>
);

const PaletteSectionTitle: React.FC<{ icon: React.ReactNode; title: string; mt?: number }> = ({
  icon,
  title,
  mt
}) => (
  <Typography
    variant="subtitle2"
    sx={{
      mb: 1,
      ...(typeof mt === "number" ? { mt } : null),
      display: "flex",
      alignItems: "center",
      gap: 1
    }}
  >
    {icon}
    {title}
  </Typography>
);

const PaletteList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>{children}</Box>
);



type AnnotationPayload = {
  annotationType: "text" | "shape" | "group";
  shapeType?: string;
};

/** Draggable node item component */
interface DraggableNodeProps {
  template: CustomNodeTemplate;
  isDefault?: boolean;
  onEdit?: (name: string) => void;
  onDelete?: (name: string) => void;
  onSetDefault?: (name: string) => void;
}

const DraggableNode: React.FC<DraggableNodeProps> = ({
  template,
  isDefault,
  onEdit,
  onDelete,
  onSetDefault
}) => {
  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData(
        REACTFLOW_NODE_MIME_TYPE,
        JSON.stringify({
          type: "node",
          templateName: template.name
        })
      );
      event.dataTransfer.effectAllowed = "move";
    },
    [template.name]
  );

  const iconUrl = useMemo(() => getTemplateIconUrl(template), [template]);

  return (
    <PaletteDraggableCard onDragStart={onDragStart}>
      <Box
        sx={{
          width: PALETTE_ICON_SIZE,
          height: PALETTE_ICON_SIZE,
          backgroundImage: `url(${iconUrl})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          borderRadius: template.iconCornerRadius ? `${template.iconCornerRadius}px` : 0,
          flexShrink: 0
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap fontWeight={500}>
          {template.name}
        </Typography>
        <Typography variant="caption" color={TEXT_SECONDARY} noWrap>
          {template.kind}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 0.25 }}>
        <Tooltip title={isDefault ? "Default node" : "Set as default"}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              if (!isDefault) onSetDefault?.(template.name);
            }}
            sx={{ color: isDefault ? "warning.main" : TEXT_SECONDARY }}
          >
            {isDefault ? <StarIcon fontSize="small" /> : <StarOutlineIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(template.name);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(template.name);
            }}
            sx={{ "&:hover": { color: "error.main" } }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </PaletteDraggableCard>
  );
};

/** Draggable network item component */
const DraggableNetwork: React.FC<{ network: NetworkTypeDefinition }> = ({ network }) => {
  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData(
        REACTFLOW_NODE_MIME_TYPE,
        JSON.stringify({
          type: "network",
          networkType: network.type
        })
      );
      event.dataTransfer.effectAllowed = "move";
    },
    [network.type]
  );

  return (
    <PaletteDraggableCard onDragStart={onDragStart}>
      <Box sx={{ color: TEXT_SECONDARY }}>{network.icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap fontWeight={500}>
          {network.label}
        </Typography>
        <Typography variant="caption" color={TEXT_SECONDARY} noWrap>
          {network.type}
        </Typography>
      </Box>
    </PaletteDraggableCard>
  );
};

/** Draggable annotation item */
interface DraggableAnnotationProps {
  label: string;
  kind: string;
  icon: React.ReactNode;
  payload: AnnotationPayload;
}

const DraggableAnnotation: React.FC<DraggableAnnotationProps> = ({
  label,
  kind,
  icon,
  payload
}) => {
  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData(
        REACTFLOW_NODE_MIME_TYPE,
        JSON.stringify({ type: "annotation", ...payload })
      );
      event.dataTransfer.effectAllowed = "move";
    },
    [payload]
  );

  return (
    <PaletteDraggableCard onDragStart={onDragStart}>
      <Box sx={{ color: TEXT_SECONDARY }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap fontWeight={500}>
          {label}
        </Typography>
        <Typography variant="caption" color={TEXT_SECONDARY} noWrap>
          {kind}
        </Typography>
      </Box>
    </PaletteDraggableCard>
  );
};

const PALETTE_TABS: TabDefinition[] = [
  { id: "nodes", label: "Nodes" },
  { id: "annotations", label: "Annotations" },
  { id: "yml", label: "YML" },
  { id: "json", label: "JSON" }
];

// This is a UI composition component with lots of conditional rendering and filtering.
// Breaking it up further doesn't materially improve readability, but it does increase file churn.
/* eslint-disable complexity */
export const PaletteSection: React.FC<PaletteSectionProps> = ({
  mode = "edit",
  isLocked = false,
  requestedTab,
  onEditCustomNode,
  onDeleteCustomNode,
  onSetDefaultCustomNode
}) => {
  const customNodes = useCustomNodes();
  const defaultNode = useTopoViewerStore((state) => state.defaultNode);
  const yamlFileName = useTopoViewerStore((state) => state.yamlFileName);
  const annotationsFileName = useTopoViewerStore((state) => state.annotationsFileName);
  const yamlContent = useTopoViewerStore((state) => state.yamlContent);
  const annotationsContent = useTopoViewerStore((state) => state.annotationsContent);
  const [filter, setFilter] = useState("");
  const isViewMode = mode === "view";
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = window.sessionStorage.getItem("paletteActiveTab");
      if (stored && PALETTE_TABS.some((t) => t.id === stored)) return stored;
    } catch { /* ignore */ }
    return "nodes";
  });

  // Allow parent to steer the active tab (e.g. split-view button → YML tab).
  // Uses an object reference so each request triggers the effect even for the same tab.
  useEffect(() => {
    if (requestedTab) setActiveTab(PALETTE_TABS[requestedTab.tab]?.id ?? "nodes");
  }, [requestedTab]);

  const [yamlError, setYamlError] = useState<string | null>(null);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);
  const [yamlDraft, setYamlDraft] = useState<string>(yamlContent);
  const [annotationsDraft, setAnnotationsDraft] = useState<string>(annotationsContent);
  const [yamlDirty, setYamlDirty] = useState(false);
  const [annotationsDirty, setAnnotationsDirty] = useState(false);
  const isSourceReadOnly = isLocked || isViewMode;

  // Keep drafts in sync with host updates as long as the user hasn't modified the draft.
  useEffect(() => {
    if (!yamlDirty) {
      setYamlDraft(yamlContent);
    }
  }, [yamlContent, yamlDirty]);

  useEffect(() => {
    if (!annotationsDirty) {
      setAnnotationsDraft(annotationsContent);
    }
  }, [annotationsContent, annotationsDirty]);

  // Reset dirty state when files change (loading a new topology in dev, or switching documents).
  useEffect(() => {
    setYamlDirty(false);
    setYamlError(null);
  }, [yamlFileName]);

  useEffect(() => {
    setAnnotationsDirty(false);
    setAnnotationsError(null);
  }, [annotationsFileName]);

  const filteredNodes = useMemo(() => {
    if (!filter) return customNodes;
    const search = filter.toLowerCase();
    return customNodes.filter(
      (node) =>
        node.name.toLowerCase().includes(search) ||
        node.kind.toLowerCase().includes(search) ||
        (node.icon && node.icon.toLowerCase().includes(search))
    );
  }, [customNodes, filter]);

  const filteredNetworks = useMemo(() => {
    if (!filter) return NETWORK_TYPE_DEFINITIONS;
    const search = filter.toLowerCase();
    return NETWORK_TYPE_DEFINITIONS.filter(
      (net) => net.label.toLowerCase().includes(search) || net.type.toLowerCase().includes(search)
    );
  }, [filter]);

  const handleAddNewNode = useCallback(() => {
    onEditCustomNode?.("__new__");
  }, [onEditCustomNode]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TabNavigation
        tabs={PALETTE_TABS}
        activeTab={activeTab}
        onTabChange={(id) => {
          setActiveTab(id);
          try { window.sessionStorage.setItem("paletteActiveTab", id); } catch { /* ignore */ }
        }}
      />
      {(activeTab === "nodes" || activeTab === "annotations") && (
      <Box sx={{ p: 2, flex: 1, overflow: "auto", minHeight: 0 }}>
        {/* Nodes Tab */}
        {activeTab === "nodes" && (
          <Box sx={{ ...((isLocked || isViewMode) ? { pointerEvents: "none", opacity: 0.6 } : undefined) }}>
            {/* Search */}
            <TextField
              fullWidth
              size="small"
              placeholder="Search nodes..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: filter ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setFilter("")}>
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined
                }
              }}
              sx={{ mb: 2 }}
            />

            {/* Node Templates */}
            <PaletteSectionTitle icon={<ViewInArIcon fontSize="small" />} title="Node Templates" />
            <PaletteList>
              {filteredNodes.length === 0 && (
                <Typography variant="body2" color={TEXT_SECONDARY} sx={{ py: 2 }}>
                  {filter ? "No matching templates" : "No node templates defined"}
                </Typography>
              )}
              {filteredNodes.map((template) => (
                <DraggableNode
                  key={template.name}
                  template={template}
                  isDefault={template.name === defaultNode || template.setDefault}
                  onEdit={onEditCustomNode}
                  onDelete={onDeleteCustomNode}
                  onSetDefault={onSetDefaultCustomNode}
                />
              ))}
            </PaletteList>
            {!filter && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={handleAddNewNode}
                sx={{ mt: 1, mb: 2 }}
              >
                New custom node
              </Button>
            )}

            {/* Networks */}
            <PaletteSectionTitle icon={<CloudIcon fontSize="small" />} title="Networks" mt={2} />
            <PaletteList>
              {filteredNetworks.length === 0 ? (
                <Typography variant="body2" color={TEXT_SECONDARY} sx={{ py: 2 }}>
                  No matching networks
                </Typography>
              ) : (
                filteredNetworks.map((network) => (
                  <DraggableNetwork key={network.type} network={network} />
                ))
              )}
            </PaletteList>

          </Box>
        )}

        {/* Add annotations (palette) Tab */}
        {activeTab === "annotations" && (
          <Box sx={{ ...(isLocked ? { pointerEvents: "none" } : undefined) }}>
            <PaletteSectionTitle icon={<TextFieldsIcon fontSize="small" />} title="Text" />
            <PaletteList>
              <DraggableAnnotation
                label="Text"
                kind="annotation"
                icon={<TextFieldsIcon fontSize="small" />}
                payload={{ annotationType: "text" }}
              />
            </PaletteList>

            <PaletteSectionTitle icon={<CropSquareIcon fontSize="small" />} title="Shapes" mt={2} />
            <PaletteList>
              <DraggableAnnotation
                label="Rectangle"
                kind="shape"
                icon={<CropSquareIcon fontSize="small" />}
                payload={{ annotationType: "shape", shapeType: "rectangle" }}
              />
              <DraggableAnnotation
                label="Circle"
                kind="shape"
                icon={<CircleOutlinedIcon fontSize="small" />}
                payload={{ annotationType: "shape", shapeType: "circle" }}
              />
              <DraggableAnnotation
                label="Line"
                kind="shape"
                icon={<RemoveIcon fontSize="small" />}
                payload={{ annotationType: "shape", shapeType: "line" }}
              />
            </PaletteList>

            <PaletteSectionTitle icon={<SelectAllIcon fontSize="small" />} title="Groups" mt={2} />
            <PaletteList>
              <DraggableAnnotation
                label="Group"
                kind="annotation"
                icon={<SelectAllIcon fontSize="small" />}
                payload={{ annotationType: "group" }}
              />
            </PaletteList>

          </Box>
        )}

      </Box>
      )}

      {/* YML Tab — full-size Monaco, no padding */}
      {activeTab === "yml" && (
        <SourceEditorTab
          readOnly={isSourceReadOnly}
          error={yamlError}
          language="yaml"
          value={yamlDraft}
          jsonSchema={clabSchema}
          onChange={(next) => { setYamlDraft(next); setYamlDirty(true); }}
        />
      )}

      {/* JSON Tab — full-size Monaco, no padding */}
      {activeTab === "json" && (
        <SourceEditorTab
          readOnly={isSourceReadOnly}
          error={annotationsError}
          language="json"
          value={annotationsDraft}
          onChange={(next) => { setAnnotationsDraft(next); setAnnotationsDirty(true); }}
        />
      )}
    </Box>
  );
};
/* eslint-enable complexity */
