/**
 * PalettePanel - Drawer for adding nodes, text/shapes, and groups
 * Based on React Flow drag-and-drop example
 */
import React, { type ReactNode, useCallback, useMemo, useState } from "react";

import type { CustomNodeTemplate } from "../../../shared/types/editors";
import { ROLE_SVG_MAP, DEFAULT_ICON_COLOR } from "../../../shared/types/graph";
import { generateEncodedSVG, type NodeType } from "../../icons/SvgGenerator";
import { useCustomNodes, useTopoViewerStore } from "../../stores/topoViewerStore";
import { TabNavigation, type TabDefinition } from "../ui/editor/TabNavigation";

interface PalettePanelProps {
  isVisible: boolean;
  onClose: () => void;
  /** Edit a custom node template */
  onEditCustomNode?: (nodeName: string) => void;
  /** Delete a custom node template */
  onDeleteCustomNode?: (nodeName: string) => void;
  /** Set a custom node as default */
  onSetDefaultCustomNode?: (nodeName: string) => void;
}

/** Network type definitions for the palette */
interface NetworkTypeDefinition {
  readonly type: string;
  readonly label: string;
  readonly icon: string;
}

const NETWORK_TYPE_DEFINITIONS: readonly NetworkTypeDefinition[] = [
  { type: "host", label: "Host", icon: "fa-server" },
  { type: "mgmt-net", label: "Mgmt Net", icon: "fa-network-wired" },
  { type: "macvlan", label: "Macvlan", icon: "fa-ethernet" },
  { type: "vxlan", label: "VXLAN", icon: "fa-project-diagram" },
  { type: "vxlan-stitch", label: "VXLAN Stitch", icon: "fa-link" },
  { type: "dummy", label: "Dummy", icon: "fa-plug" },
  { type: "bridge", label: "Bridge", icon: "fa-bezier-curve" },
  { type: "ovs-bridge", label: "OVS Bridge", icon: "fa-code-branch" }
];

/** Map role to SVG node type */
function getRoleSvgType(role: string): NodeType {
  const mapped = ROLE_SVG_MAP[role];
  if (mapped) return mapped as NodeType;
  return "pe"; // Default to PE router icon
}

/** Get the SVG icon URL for a template */
function getTemplateIconUrl(template: CustomNodeTemplate): string {
  const role = template.icon || "pe";
  const color = template.iconColor || DEFAULT_ICON_COLOR;
  const svgType = getRoleSvgType(role);
  return generateEncodedSVG(svgType, color);
}

/** Icon size for palette items */
const PALETTE_ICON_SIZE = 28;

const REACTFLOW_NODE_MIME_TYPE = "application/reactflow-node";

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

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit?.(template.name);
    },
    [onEdit, template.name]
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.(template.name);
    },
    [onDelete, template.name]
  );

  const handleSetDefaultClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isDefault) {
        onSetDefault?.(template.name);
      }
    },
    [onSetDefault, template.name, isDefault]
  );

  return (
    <div
      className="node-palette-item"
      draggable
      onDragStart={onDragStart}
      title={`Drag to add ${template.name}`}
    >
      <div
        className="node-palette-icon node-palette-icon-svg"
        style={{
          backgroundImage: `url(${iconUrl})`,
          width: PALETTE_ICON_SIZE,
          height: PALETTE_ICON_SIZE,
          borderRadius: template.iconCornerRadius ? `${template.iconCornerRadius}px` : 0
        }}
      />
      <div className="node-palette-label">
        <span className="node-palette-name">{template.name}</span>
      </div>
      <div className="node-palette-kind">{template.kind}</div>
      <div className="node-palette-actions">
        <button
          className={`node-palette-action-btn${isDefault ? " is-default" : ""}`}
          title={isDefault ? "Default node" : "Set as default node"}
          onClick={handleSetDefaultClick}
        >
          {isDefault ? "★" : "☆"}
        </button>
        <button className="node-palette-action-btn" title="Edit custom node" onClick={handleEditClick}>
          ✎
        </button>
        <button
          className="node-palette-action-btn node-palette-action-btn-danger"
          title="Delete custom node"
          onClick={handleDeleteClick}
        >
          ×
        </button>
      </div>
    </div>
  );
};

/** Draggable network item component */
interface DraggableNetworkProps {
  network: NetworkTypeDefinition;
}

const DraggableNetwork: React.FC<DraggableNetworkProps> = ({ network }) => {
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
    <div
      className="node-palette-item node-palette-network"
      draggable
      onDragStart={onDragStart}
      title={`Drag to add ${network.label}`}
    >
      <div className="node-palette-icon">
        <i className={`fas ${network.icon}`} />
      </div>
      <div className="node-palette-label">{network.label}</div>
      <div className="node-palette-kind">{network.type}</div>
    </div>
  );
};

/** "New custom node" button */
interface NewCustomNodeButtonProps {
  onAddNew: () => void;
}

const NewCustomNodeButton: React.FC<NewCustomNodeButtonProps> = ({ onAddNew }) => {
  const handleClick = useCallback(() => {
    onAddNew();
  }, [onAddNew]);

  return (
    <button className="node-palette-new-btn" onClick={handleClick} title="Create a new custom node template">
      <i className="fas fa-plus" />
      <span>New custom node...</span>
    </button>
  );
};

interface DraggableAnnotationProps {
  label: string;
  kind: string;
  icon: string;
  payload: AnnotationPayload;
  onDragStart: (event: React.DragEvent, payload: AnnotationPayload) => void;
}

const DraggableAnnotation: React.FC<DraggableAnnotationProps> = ({
  label,
  kind,
  icon,
  payload,
  onDragStart
}) => (
  <div
    className="node-palette-item node-palette-annotation"
    draggable
    onDragStart={(event) => onDragStart(event, payload)}
    title="Drag onto the canvas"
  >
    <div className="node-palette-icon">
      <i className={`fas ${icon}`} />
    </div>
    <div className="node-palette-label">{label}</div>
    <div className="node-palette-kind">{kind}</div>
  </div>
);

const TAB_DEFINITIONS: readonly TabDefinition[] = [
  { id: "nodes", label: "Nodes" },
  { id: "annotations", label: "Annotations" }
];

const DRAG_INSTRUCTION_TEXT = "Drag items onto the canvas to add them";

export const PalettePanel: React.FC<PalettePanelProps> = ({
  isVisible,
  onClose,
  onEditCustomNode,
  onDeleteCustomNode,
  onSetDefaultCustomNode
}) => {
  const customNodes = useCustomNodes();
  const defaultNode = useTopoViewerStore((state) => state.defaultNode);
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState("nodes");

  // Filter nodes and networks based on search
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

  const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(e.target.value);
  }, []);

  const handleClearFilter = useCallback(() => {
    setFilter("");
  }, []);

  const handleAddNewNode = useCallback(() => {
    // This triggers the "new custom node" flow
    onEditCustomNode?.("__new__");
  }, [onEditCustomNode]);

  const handleAnnotationDragStart = useCallback(
    (event: React.DragEvent, payload: AnnotationPayload) => {
      event.dataTransfer.setData(
        REACTFLOW_NODE_MIME_TYPE,
        JSON.stringify({ type: "annotation", ...payload })
      );
      event.dataTransfer.effectAllowed = "move";
    },
    []
  );

  return (
    <PaletteDrawer isOpen={isVisible} onClose={onClose} title="Palette">
      <div className="node-palette-tabs">
        <TabNavigation
          tabs={[...TAB_DEFINITIONS]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showArrows={false}
        />
      </div>
      <div className="node-palette-content">
        {activeTab === "nodes" && (
          <>
            {/* Search/Filter */}
            <div className="node-palette-search">
              <i className="fas fa-search node-palette-search-icon" />
              <input
                type="text"
                placeholder="Search nodes..."
                value={filter}
                onChange={handleFilterChange}
                className="node-palette-search-input"
              />
              {filter && (
                <button
                  className="node-palette-search-clear"
                  onClick={handleClearFilter}
                  title="Clear search"
                >
                  <i className="fas fa-times" />
                </button>
              )}
            </div>

            {/* Custom Nodes Section */}
            <section className="node-palette-section">
              <h4 className="node-palette-section-title">
                <i className="fas fa-cube" />
                Node Templates
              </h4>
              <div className="node-palette-grid">
                {filteredNodes.length === 0 && (
                  <div className="node-palette-empty">
                    {filter ? "No matching templates" : "No node templates defined"}
                  </div>
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
              </div>
              {/* New custom node button */}
              {!filter && <NewCustomNodeButton onAddNew={handleAddNewNode} />}
            </section>

            {/* Networks Section */}
            <section className="node-palette-section">
              <h4 className="node-palette-section-title">
                <i className="fas fa-cloud" />
                Networks
              </h4>
              <div className="node-palette-grid">
                {filteredNetworks.length === 0 ? (
                  <div className="node-palette-empty">No matching networks</div>
                ) : (
                  filteredNetworks.map((network) => (
                    <DraggableNetwork key={network.type} network={network} />
                  ))
                )}
              </div>
            </section>

            {/* Instructions */}
            <div className="node-palette-instructions">
              <i className="fas fa-info-circle" />
              <span>{DRAG_INSTRUCTION_TEXT}</span>
            </div>
          </>
        )}

        {activeTab === "annotations" && (
          <>
            <section className="node-palette-section">
              <h4 className="node-palette-section-title">
                <i className="fas fa-font" />
                Text
              </h4>
              <div className="node-palette-grid">
                <DraggableAnnotation
                  label="Text"
                  kind="annotation"
                  icon="fa-font"
                  payload={{ annotationType: "text" }}
                  onDragStart={handleAnnotationDragStart}
                />
              </div>
            </section>

            <section className="node-palette-section">
              <h4 className="node-palette-section-title">
                <i className="fas fa-shapes" />
                Shapes
              </h4>
              <div className="node-palette-grid">
                <DraggableAnnotation
                  label="Rectangle"
                  kind="shape"
                  icon="fa-square"
                  payload={{ annotationType: "shape", shapeType: "rectangle" }}
                  onDragStart={handleAnnotationDragStart}
                />
                <DraggableAnnotation
                  label="Circle"
                  kind="shape"
                  icon="fa-circle"
                  payload={{ annotationType: "shape", shapeType: "circle" }}
                  onDragStart={handleAnnotationDragStart}
                />
                <DraggableAnnotation
                  label="Line"
                  kind="shape"
                  icon="fa-minus"
                  payload={{ annotationType: "shape", shapeType: "line" }}
                  onDragStart={handleAnnotationDragStart}
                />
              </div>
            </section>

            <section className="node-palette-section">
              <h4 className="node-palette-section-title">
                <i className="fas fa-object-group" />
                Groups
              </h4>
              <div className="node-palette-grid">
                <DraggableAnnotation
                  label="Group"
                  kind="annotation"
                  icon="fa-object-group"
                  payload={{ annotationType: "group" }}
                  onDragStart={handleAnnotationDragStart}
                />
              </div>
            </section>
            <div className="node-palette-instructions">
              <i className="fas fa-info-circle" />
              <span>{DRAG_INSTRUCTION_TEXT}</span>
            </div>
          </>
        )}
      </div>
    </PaletteDrawer>
  );
};

interface PaletteDrawerProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

const PaletteDrawer: React.FC<PaletteDrawerProps> = ({ title, isOpen, onClose, children }) => (
  <aside
    className={`node-palette-drawer panel${isOpen ? " is-open" : ""}`}
    aria-hidden={!isOpen}
    data-testid="node-palette-drawer"
  >
    <div className="node-palette-drawer-header panel-heading panel-title-bar">
      <span className="panel-title">{title}</span>
      <button className="panel-close-btn" onClick={onClose} aria-label="Close" title="Close">
        <i className="fas fa-times" />
      </button>
    </div>
    <div className="node-palette-drawer-body">{children}</div>
  </aside>
);
