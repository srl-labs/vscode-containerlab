// Node and annotation palette for the context panel.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccountTree as AccountTreeIcon,
  Add as AddIcon,
  Cable as CableIcon,
  CircleOutlined as CircleOutlinedIcon,
  Clear as ClearIcon,
  CropSquare as CropSquareIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
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
  TextFields as TextFieldsIcon
} from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  Divider,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";

import type { CustomNodeTemplate } from "../../../../shared/types/editors";
import { ROLE_SVG_MAP, DEFAULT_ICON_COLOR } from "../../../../shared/types/graph";
import { generateEncodedSVG, type NodeType } from "../../../icons/SvgGenerator";
import { useCustomNodes, useTopoViewerStore } from "../../../stores/topoViewerStore";
import type { TabDefinition } from "../../ui/editor";
import { TabNavigation } from "../../ui/editor/TabNavigation";
import { IconPreview } from "../../ui/form";
import { MonacoCodeEditor } from "../../monaco/MonacoCodeEditor";
import { executeTopologyCommand } from "../../../services/topologyHostCommands";
import clabSchema from "../../../../../../schema/clab.schema.json";

interface PaletteSectionProps {
  mode?: "edit" | "view";
  isLocked?: boolean;
  requestedTab?: { tabId: string };
  onEditCustomNode?: (nodeName: string) => void;
  onDeleteCustomNode?: (nodeName: string) => void;
  onSetDefaultCustomNode?: (nodeName: string) => void;
  editTabContent?: React.ReactNode;
  showEditTab?: boolean;
  editTabTitle?: string;
  onEditDelete?: () => void;
  onEditTabLeave?: () => void;
  infoTabContent?: React.ReactNode;
  showInfoTab?: boolean;
  infoTabTitle?: string;
}

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

function getRoleSvgType(role: string): NodeType {
  const mapped = ROLE_SVG_MAP[role];
  if (mapped) return mapped as NodeType;
  return "pe";
}

function getTemplateIconUrl(template: CustomNodeTemplate): string {
  const role = template.icon || "pe";
  const color = template.iconColor || DEFAULT_ICON_COLOR;
  const svgType = getRoleSvgType(role);
  return generateEncodedSVG(svgType, color);
}

const REACTFLOW_NODE_MIME_TYPE = "application/reactflow-node";
const ACTION_HOVER_BG = "action.hover";
const TEXT_SECONDARY = "text.secondary";

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
  <Tooltip
    title="Drag to canvas"
    placement="top"
    enterDelay={500}
    slotProps={{ popper: { modifiers: [{ name: "offset", options: { offset: [-20, -20] } }] } }}
  >
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

const SectionHeader: React.FC<{ title: string; action?: React.ReactNode }> = ({
  title,
  action
}) => (
  <>
    <Divider />
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1 }}>
      <Typography variant="subtitle2">{title}</Typography>
      {action}
    </Box>
    <Divider />
  </>
);

type AnnotationPayload = {
  annotationType: "text" | "shape" | "group";
  shapeType?: string;
};

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
      <Box sx={{ flexShrink: 0 }}>
        <IconPreview src={iconUrl} size={28} cornerRadius={template.iconCornerRadius} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{ fontWeight: (theme) => theme.typography.fontWeightMedium }}
        >
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

interface DraggableAnnotationProps {
  label: string;
  kind: string;
  icon: React.ReactNode;
  payload: AnnotationPayload;
}

interface PaletteSimpleDraggableProps {
  dragPayload: Record<string, unknown>;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
}

const PaletteSimpleDraggable: React.FC<PaletteSimpleDraggableProps> = ({
  dragPayload,
  icon,
  label,
  subtitle
}) => {
  const onDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData(REACTFLOW_NODE_MIME_TYPE, JSON.stringify(dragPayload));
      event.dataTransfer.effectAllowed = "move";
    },
    [dragPayload]
  );

  return (
    <PaletteDraggableCard onDragStart={onDragStart}>
      <Box sx={{ color: TEXT_SECONDARY }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{ fontWeight: (theme) => theme.typography.fontWeightMedium }}
        >
          {label}
        </Typography>
        <Typography variant="caption" color={TEXT_SECONDARY} noWrap>
          {subtitle}
        </Typography>
      </Box>
    </PaletteDraggableCard>
  );
};

const DraggableNetwork: React.FC<{ network: NetworkTypeDefinition }> = ({ network }) => (
  <PaletteSimpleDraggable
    dragPayload={{ type: "network", networkType: network.type }}
    icon={network.icon}
    label={network.label}
    subtitle={network.type}
  />
);

const DraggableAnnotation: React.FC<DraggableAnnotationProps> = ({ label, kind, icon, payload }) => (
  <PaletteSimpleDraggable
    dragPayload={{ type: "annotation", ...payload }}
    icon={icon}
    label={label}
    subtitle={kind}
  />
);

export const PALETTE_TABS: TabDefinition[] = [
  { id: "info", label: "Info" },
  { id: "edit", label: "Edit" },
  { id: "nodes", label: "Nodes" },
  { id: "annotations", label: "Annotations" },
  { id: "yaml", label: "YAML" },
  { id: "json", label: "JSON" }
];

/* eslint-disable complexity */
export const PaletteSection: React.FC<PaletteSectionProps> = ({
  mode = "edit",
  isLocked = false,
  requestedTab,
  onEditCustomNode,
  onDeleteCustomNode,
  onSetDefaultCustomNode,
  editTabContent,
  showEditTab = false,
  editTabTitle,
  onEditDelete,
  onEditTabLeave,
  infoTabContent,
  showInfoTab = false,
  infoTabTitle
}) => {
  const customNodes = useCustomNodes();
  const defaultNode = useTopoViewerStore((state) => state.defaultNode);
  const yamlFileName = useTopoViewerStore((state) => state.yamlFileName);
  const annotationsFileName = useTopoViewerStore((state) => state.annotationsFileName);
  const yamlContent = useTopoViewerStore((state) => state.yamlContent);
  const annotationsContent = useTopoViewerStore((state) => state.annotationsContent);
  const [filter, setFilter] = useState("");
  const isViewMode = mode === "view";

  const visibleTabs = useMemo(
    () =>
      PALETTE_TABS.filter((t) => {
        if (t.id === "info" && !showInfoTab) return false;
        if (t.id === "edit" && !showEditTab) return false;
        return true;
      }),
    [showInfoTab, showEditTab]
  );

  const [userTab, setUserTab] = useState("nodes");

  useEffect(() => {
    if (requestedTab?.tabId && visibleTabs.some((t) => t.id === requestedTab.tabId)) {
      setUserTab(requestedTab.tabId);
    }
  }, [requestedTab, visibleTabs]);

  // Auto-switch when edit/info tab appears (one-time, not forced)
  useEffect(() => {
    if (showEditTab) setUserTab("edit");
  }, [showEditTab]);

  useEffect(() => {
    if (showInfoTab && !showEditTab) setUserTab("info");
  }, [showInfoTab, showEditTab]);

  // Fall back to "nodes" when current tab is no longer visible
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === userTab)) {
      setUserTab("nodes");
    }
  }, [visibleTabs, userTab]);

  const activeTab = userTab;

  const [yamlError, setYamlError] = useState<string | null>(null);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);
  const [yamlDraft, setYamlDraft] = useState<string>(yamlContent);
  const [annotationsDraft, setAnnotationsDraft] = useState<string>(annotationsContent);
  const [yamlDirty, setYamlDirty] = useState(false);
  const [annotationsDirty, setAnnotationsDirty] = useState(false);
  const isSourceReadOnly = isLocked || isViewMode;

  // Sync drafts with host unless user has local edits
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

  const drawerTitle = useMemo(() => {
    if (activeTab === "info") return infoTabTitle || "Properties";
    if (activeTab === "edit") return editTabTitle || "Editor";
    if (activeTab === "nodes" || activeTab === "annotations") return "Palette";
    if (activeTab === "yaml") return yamlFileName || "Topology";
    if (activeTab === "json") return annotationsFileName || "Annotations";
    return "";
  }, [activeTab, yamlFileName, annotationsFileName, editTabTitle, infoTabTitle]);

  const handleSaveYaml = useCallback(async () => {
    try {
      await executeTopologyCommand({ command: "setYamlContent", payload: { content: yamlDraft } });
      setYamlDirty(false);
      setYamlError(null);
    } catch (err) {
      setYamlError(err instanceof Error ? err.message : String(err));
    }
  }, [yamlDraft]);

  const handleSaveAnnotations = useCallback(async () => {
    try {
      await executeTopologyCommand({
        command: "setAnnotationsContent",
        payload: { content: annotationsDraft }
      });
      setAnnotationsDirty(false);
      setAnnotationsError(null);
    } catch (err) {
      setAnnotationsError(err instanceof Error ? err.message : String(err));
    }
  }, [annotationsDraft]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          height: 40,
          flexShrink: 0
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: (theme) => theme.typography.fontWeightBold }}
        >
          {drawerTitle}
        </Typography>
        {activeTab === "edit" && onEditDelete && (
          <IconButton size="small" onClick={onEditDelete} color="error" title="Delete">
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
        {activeTab === "yaml" && !isSourceReadOnly && (
          <IconButton
            size="small"
            onClick={() => {
              handleSaveYaml().catch(() => undefined);
            }}
            disabled={!yamlDirty}
            title="Save"
          >
            <SaveIcon fontSize="small" />
          </IconButton>
        )}
        {activeTab === "json" && !isSourceReadOnly && (
          <IconButton
            size="small"
            onClick={() => {
              handleSaveAnnotations().catch(() => undefined);
            }}
            disabled={!annotationsDirty}
            title="Save"
          >
            <SaveIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Divider />
      <TabNavigation
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={(id) => {
          if (activeTab === "edit" && id !== "edit") {
            onEditTabLeave?.();
          }
          setUserTab(id);
        }}
      />
      {(activeTab === "nodes" || activeTab === "annotations") && (
        <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {activeTab === "nodes" && (
            <Box
              sx={{
                ...(isLocked || isViewMode ? { pointerEvents: "none", opacity: 0.6 } : undefined)
              }}
            >
              <Box sx={{ p: 2 }}>
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
                />
              </Box>

              <SectionHeader
                title="Node Templates"
                action={
                  !filter ? (
                    <Button variant="text" size="small" startIcon={<AddIcon />} onClick={handleAddNewNode} sx={{ py: 0 }}>
                      Add
                    </Button>
                  ) : undefined
                }
              />
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2 }}>
                {filteredNodes.length === 0 && (
                  <Typography variant="body2" color={TEXT_SECONDARY}>
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
              </Box>

              <SectionHeader title="Networks" />
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, p: 2 }}>
                {filteredNetworks.length === 0 ? (
                  <Typography variant="body2" color={TEXT_SECONDARY}>
                    No matching networks
                  </Typography>
                ) : (
                  filteredNetworks.map((network) => (
                    <DraggableNetwork key={network.type} network={network} />
                  ))
                )}
              </Box>
            </Box>
          )}

          {activeTab === "annotations" && (
            <Box sx={{ ...(isLocked ? { pointerEvents: "none" } : undefined) }}>
              <SectionHeader title="Text" />
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2 }}>
                <DraggableAnnotation
                  label="Text"
                  kind="annotation"
                  icon={<TextFieldsIcon fontSize="small" />}
                  payload={{ annotationType: "text" }}
                />
              </Box>

              <SectionHeader title="Shapes" />
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2 }}>
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
              </Box>

              <SectionHeader title="Groups" />
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2 }}>
                <DraggableAnnotation
                  label="Group"
                  kind="annotation"
                  icon={<SelectAllIcon fontSize="small" />}
                  payload={{ annotationType: "group" }}
                />
              </Box>
            </Box>
          )}
        </Box>
      )}

      {activeTab === "yaml" && (
        <SourceEditorTab
          readOnly={isSourceReadOnly}
          error={yamlError}
          language="yaml"
          value={yamlDraft}
          jsonSchema={clabSchema}
          onChange={(next) => {
            setYamlDraft(next);
            setYamlDirty(true);
          }}
        />
      )}

      {activeTab === "json" && (
        <SourceEditorTab
          readOnly={isSourceReadOnly}
          error={annotationsError}
          language="json"
          value={annotationsDraft}
          onChange={(next) => {
            setAnnotationsDraft(next);
            setAnnotationsDirty(true);
          }}
        />
      )}

      {activeTab === "info" && (
        <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>{infoTabContent}</Box>
      )}

      {activeTab === "edit" && (
        <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>{editTabContent}</Box>
      )}
    </Box>
  );
};
/* eslint-enable complexity */
