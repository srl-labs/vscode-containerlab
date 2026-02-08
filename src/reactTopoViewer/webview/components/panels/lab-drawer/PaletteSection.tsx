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
  Info as InfoIcon,
  Lan as LanIcon,
  Lock as LockIcon,
  Power as PowerIcon,
  Remove as RemoveIcon,
  Search as SearchIcon,
  SelectAll as SelectAllIcon,
  Star as StarIcon,
  StarOutline as StarOutlineIcon,
  TextFields as TextFieldsIcon,
  ViewInAr as ViewInArIcon
} from "@mui/icons-material";
import { Box, Button, Card, IconButton, InputAdornment, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";

import type { CustomNodeTemplate } from "../../../../shared/types/editors";
import { ROLE_SVG_MAP, DEFAULT_ICON_COLOR } from "../../../../shared/types/graph";
import { generateEncodedSVG, type NodeType } from "../../../icons/SvgGenerator";
import { executeTopologyCommand } from "../../../services/topologyHostCommands";
import { useCustomNodes, useTopoViewerStore } from "../../../stores/topoViewerStore";
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

/** Reusable source-editor tab (YML / JSON) with dirty indicator and save button. */
const SourceEditorTab: React.FC<{
  fileName: string;
  dirty: boolean;
  saving: boolean;
  readOnly: boolean;
  error: string | null;
  language: "yaml" | "json";
  value: string;
  jsonSchema?: object;
  onSave: () => void;
  onChange: (next: string) => void;
}> = ({ fileName, dirty, saving, readOnly, error, language, value, jsonSchema, onSave, onChange }) => (
  <Box sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 1 }}>
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Typography variant="caption" color={TEXT_SECONDARY} sx={{ flex: 1, minWidth: 0 }} noWrap>
        {fileName}{dirty ? " ●" : ""}
      </Typography>
      <Button
        size="small"
        variant="contained"
        disabled={readOnly || !dirty || saving}
        onClick={onSave}
      >
        Save
      </Button>
    </Box>
    {error && (
      <Typography variant="caption" color="error">
        {error}
      </Typography>
    )}
    <Box sx={{ flex: 1, minHeight: 0, border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
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

const PaletteDragHint: React.FC = () => (
  <Typography
    variant="caption"
    color={TEXT_SECONDARY}
    sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 2 }}
  >
    <InfoIcon sx={{ fontSize: 14 }} />
    Drag items onto the canvas to add them
  </Typography>
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
  // In view mode, force the add-annotations tab (nodes can't be added to deployed labs)
  const [activeTab, setActiveTab] = useState(isViewMode ? 1 : 0);

  // Allow parent to steer the active tab (e.g. split-view button → YML tab).
  // Uses an object reference so each request triggers the effect even for the same tab.
  useEffect(() => {
    if (requestedTab) setActiveTab(requestedTab.tab);
  }, [requestedTab]);

  const [yamlError, setYamlError] = useState<string | null>(null);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);
  const [yamlDraft, setYamlDraft] = useState<string>(yamlContent);
  const [annotationsDraft, setAnnotationsDraft] = useState<string>(annotationsContent);
  const [yamlDirty, setYamlDirty] = useState(false);
  const [annotationsDirty, setAnnotationsDirty] = useState(false);
  const [yamlSaving, setYamlSaving] = useState(false);
  const [annotationsSaving, setAnnotationsSaving] = useState(false);

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

  const saveYaml = useCallback(async () => {
    if (isSourceReadOnly) return;
    setYamlSaving(true);
    setYamlError(null);
    const content = yamlDraft;
    try {
      const res = await executeTopologyCommand(
        { command: "setYamlContent", payload: { content } },
        { applySnapshot: true }
      );
      if (res.type === "topology-host:reject") {
        await executeTopologyCommand({ command: "setYamlContent", payload: { content } }, { applySnapshot: true });
      }
      setYamlDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setYamlError(msg);
    } finally {
      setYamlSaving(false);
    }
  }, [isSourceReadOnly, yamlDraft]);

  const saveAnnotations = useCallback(async () => {
    if (isSourceReadOnly) return;
    setAnnotationsSaving(true);
    setAnnotationsError(null);
    const content = annotationsDraft;
    try {
      const res = await executeTopologyCommand(
        { command: "setAnnotationsContent", payload: { content } },
        { applySnapshot: true }
      );
      if (res.type === "topology-host:reject") {
        await executeTopologyCommand(
          { command: "setAnnotationsContent", payload: { content } },
          { applySnapshot: true }
        );
      }
      setAnnotationsDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAnnotationsError(msg);
    } finally {
      setAnnotationsSaving(false);
    }
  }, [isSourceReadOnly, annotationsDraft]);

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
    <Box sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Lock banner */}
      {isLocked && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
	            px: 1.5,
	            py: 0.5,
	            mb: 1.5,
	            bgcolor: ACTION_HOVER_BG,
	            borderRadius: 0.5,
	            border: 1,
	            borderColor: "divider"
	          }}
	        >
	          <LockIcon sx={{ fontSize: 14, color: TEXT_SECONDARY }} />
	          <Typography variant="caption" color={TEXT_SECONDARY}>
	            Unlock to drag items onto canvas
	          </Typography>
	        </Box>
	      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_e, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          mb: 2,
          // Pull the tab strip flush with the panel edge while keeping the
          // rest of the palette content padded.
          mx: -2,
          px: 2,
          // When MUI disables scroll buttons, it leaves them in the layout.
          // Hide disabled buttons so tabs start flush-left.
          "& .MuiTabs-scrollButtons.Mui-disabled": {
            display: "none"
          }
        }}
      >
        <Tab label="Nodes" disabled={isViewMode} />
        <Tab label="Annotations" />
        <Tab label="YML" />
        <Tab label="JSON" />
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0 }}>
      {/* Nodes Tab (hidden in view mode) */}
      {!isViewMode && activeTab === 0 && (
        <Box sx={{ height: "100%", overflow: "auto", ...(isLocked ? { pointerEvents: "none", opacity: 0.5 } : undefined) }}>
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
          <PaletteDragHint />
        </Box>
      )}

      {/* Add annotations (palette) Tab */}
      {activeTab === 1 && (
        <Box sx={{ height: "100%", overflow: "auto", ...(isLocked ? { pointerEvents: "none", opacity: 0.5 } : undefined) }}>
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
          <PaletteDragHint />
        </Box>
      )}

      {/* YML Tab */}
      {activeTab === 2 && (
        <SourceEditorTab
          fileName={yamlFileName}
          dirty={yamlDirty}
          saving={yamlSaving}
          readOnly={isSourceReadOnly}
          error={yamlError}
          language="yaml"
          value={yamlDraft}
          jsonSchema={clabSchema}
          onSave={() => void saveYaml()}
          onChange={(next) => { setYamlDraft(next); setYamlDirty(true); }}
        />
      )}

      {/* JSON Tab */}
      {activeTab === 3 && (
        <SourceEditorTab
          fileName={annotationsFileName}
          dirty={annotationsDirty}
          saving={annotationsSaving}
          readOnly={isSourceReadOnly}
          error={annotationsError}
          language="json"
          value={annotationsDraft}
          onSave={() => void saveAnnotations()}
          onChange={(next) => { setAnnotationsDraft(next); setAnnotationsDirty(true); }}
        />
      )}
      </Box>
    </Box>
  );
};
/* eslint-enable complexity */
