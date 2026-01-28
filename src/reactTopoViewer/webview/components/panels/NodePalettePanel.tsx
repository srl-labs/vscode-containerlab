/**
 * NodePalettePanel - Drag-and-drop panel for adding nodes to the canvas
 * Based on React Flow drag-and-drop example
 */
import React, { useCallback, useMemo, useState } from "react";

import type { CustomNodeTemplate } from "../../../shared/types/editors";
import { ROLE_SVG_MAP, DEFAULT_ICON_COLOR } from "../../../shared/types/graph";
import { generateEncodedSVG, type NodeType } from "../../icons/SvgGenerator";
import { useCustomNodes, useTopoViewerStore } from "../../stores/topoViewerStore";

import { BasePanel } from "../ui/editor/BasePanel";

interface NodePalettePanelProps {
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
        "application/reactflow-node",
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
        {isDefault && <span className="node-palette-default-badge">default</span>}
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
        "application/reactflow-node",
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

export const NodePalettePanel: React.FC<NodePalettePanelProps> = ({
  isVisible,
  onClose,
  onEditCustomNode,
  onDeleteCustomNode,
  onSetDefaultCustomNode
}) => {
  const customNodes = useCustomNodes();
  const defaultNode = useTopoViewerStore((state) => state.defaultNode);
  const [filter, setFilter] = useState("");

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

  return (
    <BasePanel
      title="Node Palette"
      isVisible={isVisible}
      onClose={onClose}
      initialPosition={{ x: 20, y: 120 }}
      width={280}
      storageKey="node-palette"
      zIndex={25}
      footer={false}
      minWidth={240}
      minHeight={200}
    >
      <div className="node-palette-content">
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
            <button className="node-palette-search-clear" onClick={handleClearFilter} title="Clear search">
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
            {filteredNodes.length === 0 && !filter ? (
              <div className="node-palette-empty">No node templates defined</div>
            ) : filteredNodes.length === 0 ? (
              <div className="node-palette-empty">No matching templates</div>
            ) : (
              filteredNodes.map((template) => (
                <DraggableNode
                  key={template.name}
                  template={template}
                  isDefault={template.name === defaultNode || template.setDefault}
                  onEdit={onEditCustomNode}
                  onDelete={onDeleteCustomNode}
                  onSetDefault={onSetDefaultCustomNode}
                />
              ))
            )}
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
              filteredNetworks.map((network) => <DraggableNetwork key={network.type} network={network} />)
            )}
          </div>
        </section>

        {/* Instructions */}
        <div className="node-palette-instructions">
          <i className="fas fa-info-circle" />
          <span>Drag items onto the canvas to add them</span>
        </div>
      </div>
    </BasePanel>
  );
};
