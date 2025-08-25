import cytoscape from 'cytoscape';
import { log } from '../logging/logger';
import type { ParentNodeData, ParentNodeExtraData } from '../types/topoViewerGraph';
import type { ManagerGroupStyle } from './managerGroupStyle';

// Declarations for globals provided elsewhere
/* eslint-disable no-unused-vars */
declare function acquireVsCodeApi(): any;
declare function sendMessageToVscodeEndpointPost(endpoint: string, data: any): Promise<any>;
/* eslint-enable no-unused-vars */


interface NodeOptions {
  group: 'nodes';
  data: ParentNodeData | any;
  position: { x: number; y: number };
  removed: boolean;
  selected: boolean;
  selectable: boolean;
  locked: boolean;
  grabbed: boolean;
  grabbable: boolean;
  classes: string;
}

interface CreateNewParentOptions {
  nodeToReparent?: cytoscape.NodeSingular | null;
}

export class ManagerGroupManagement {
  private cy: cytoscape.Core;
  private groupStyleManager: ManagerGroupStyle;

  /* eslint-disable no-unused-vars */
  constructor(cy: cytoscape.Core, groupStyleManager: ManagerGroupStyle, _mode: 'edit' | 'view' = 'view') {
    /* eslint-enable no-unused-vars */
    this.cy = cy;
    this.groupStyleManager = groupStyleManager;
    // Mode parameter kept for backwards compatibility but not used currently
  }

  /**
   * Updates the visual state of a group based on whether it has children.
   * Adds 'empty-group' class if childless, otherwise removes it.
   * @param group The group node to update.
   */
  private updateGroupEmptyStatus(group: cytoscape.NodeSingular): void {
    if (!group || group.removed() || group.data('topoViewerRole') !== 'group') {
      return;
    }
    if (group.children().length === 0) {
      group.addClass('empty-group');
    } else {
      group.removeClass('empty-group');
    }
  }

  public orphaningNode(node: cytoscape.NodeSingular): void {
    const parent = node.parent()[0] as cytoscape.NodeSingular | undefined;
    if (!parent) {
      return;
    }
    node.move({ parent: null });

    // Update the parent's state now that it has one less child
    this.updateGroupEmptyStatus(parent);

    if (parent.isChildless()) {
      log.info('Removing empty parent node');
      parent.remove();
    }
  }

  public createNewParent(options: CreateNewParentOptions = {}): string {
    const { nodeToReparent = null } = options;
    let counter = 1;
    let newParentId = `groupName${this.cy.nodes().length + counter}:1`;
    while (this.cy.getElementById(newParentId).length > 0) {
      counter++;
      newParentId = `groupName${this.cy.nodes().length + counter}:1`;
    }
    log.debug(`Generated unique parent ID: ${newParentId}`);

    const ext = this.cy.extent();
    const offsetMin = 10;
    const offsetMax = 50;
    const randomOffset = Math.random() * (offsetMax - offsetMin) + offsetMin;
    const topCenterX = (ext.x1 + ext.x2 + randomOffset) / 2;
    const topCenterY = ext.y1 + 2 * randomOffset;

    const parentNodeData: NodeOptions = {
      group: 'nodes',
      data: {
        id: newParentId,
        name: newParentId.split(':')[0],
        weight: '1000',
        topoViewerRole: 'group',
        extraData: {
          clabServerUsername: 'asad',
          weight: '2',
          name: '',
          topoViewerGroup: newParentId.split(':')[0],
          topoViewerGroupLevel: newParentId.split(':')[1]
        }
      },
      position: { x: topCenterX, y: topCenterY },
      removed: false,
      selected: false,
      selectable: true,
      locked: false,
      grabbed: false,
      grabbable: true,
      classes: 'empty-group' // Start as empty
    };

    const newParent = this.cy.add(parentNodeData);

    if (nodeToReparent) {
      nodeToReparent.move({ parent: newParentId });
      nodeToReparent.data('parent', newParentId);
      this.updateGroupEmptyStatus(newParent); // Update status after adding child
    }

    // Save default style for the new group
    const defaultStyle = {
      id: newParentId,
      backgroundColor: '#d9d9d9',
      backgroundOpacity: 20,
      borderColor: '#dddddd',
      borderWidth: 0.5,
      borderStyle: 'solid' as 'solid',
      borderRadius: 0,
      color: '#ebecf0'
    };
    this.groupStyleManager.updateGroupStyle(newParentId, defaultStyle);

    this.showGroupEditor(newParentId);

    return newParentId;
  }

  public initializeWheelSelection(): void {
    try {
      this.cy.boxSelectionEnabled(true);
      this.cy.selectionType('additive');
    } catch (error) {
      log.error(`initializeWheelSelection failed: ${error}`);
    }
  }

  public initializeGroupManagement(): void {
    try {
      // Store the parent before a node is grabbed to correctly update its status on move/remove
      this.cy.on('grab', 'node', (event) => {
        event.target.scratch('_oldParent', event.target.parent());
      });

      // After a node is moved, update both the old and new parent's empty status
      this.cy.on('move', 'node', (event) => {
        const oldParent = event.target.scratch('_oldParent');
        const newParent = event.target.parent();

        if (oldParent) {
          this.updateGroupEmptyStatus(oldParent);
        }
        if (newParent.nonempty()) {
          this.updateGroupEmptyStatus(newParent);
        }
      });

      // After a node is removed, update its former parent's empty status
      this.cy.on('remove', 'node', (event) => {
        const oldParent = event.target.scratch('_oldParent');
        if (oldParent) {
          this.updateGroupEmptyStatus(oldParent);
        }
      });

      const isNodeInsideParent = (
        node: cytoscape.NodeSingular,
        parent: cytoscape.NodeSingular,
      ): boolean => {
        const parentBox = parent.boundingBox();
        const nodePos = node.position();
        return (
          nodePos.x >= parentBox.x1 &&
          nodePos.x <= parentBox.x2 &&
          nodePos.y >= parentBox.y1 &&
          nodePos.y <= parentBox.y2
        );
      };

      // Prevent groups from becoming children of other groups during any operation
      this.cy.on('add', 'node', (event: cytoscape.EventObject) => {
        const node = event.target as cytoscape.NodeSingular;
        // If a group node somehow gets a parent, remove that parent relationship
        if (node.data('topoViewerRole') === 'group' && node.parent().nonempty()) {
          log.warn(`Preventing group ${node.id()} from being child of ${node.parent().first().id()}`);
          node.move({ parent: null });
        }
      });

      // Monitor parent changes and prevent groups from becoming children
      this.cy.on('data', 'node', (event: cytoscape.EventObject) => {
        const node = event.target as cytoscape.NodeSingular;
        if (node.data('topoViewerRole') === 'group' && node.data('parent')) {
          log.warn(`Preventing group ${node.id()} from having parent ${node.data('parent')}`);
          node.data('parent', null);
          node.move({ parent: null });
        }
      });

      this.cy.on('dragfree', 'node', (event: cytoscape.EventObject) => {
        const draggedNode = event.target as cytoscape.NodeSingular;

        // Don't process free text nodes being dragged
        if (draggedNode.data('topoViewerRole') === 'freeText') {
          return;
        }

        // CRITICAL: Never reassign children when ANY group is being dragged
        const anyGroupBeingDragged = this.cy.nodes('[topoViewerRole = "group"]').some(group => (group as cytoscape.NodeSingular).grabbed());
        if (anyGroupBeingDragged) {
          log.debug('Skipping all reparenting because a group is being dragged');
          return;
        }

        // Groups cannot be dragged into other groups - ensure they have no parent
        if (draggedNode.data('topoViewerRole') === 'group' || draggedNode.isParent()) {
          if (draggedNode.parent().nonempty()) {
            log.warn(`Group ${draggedNode.id()} incorrectly has parent, removing`);
            draggedNode.move({ parent: null });
          }
          // Don't do any cleanup when groups are involved
          return;
        }

        // If this node already has a parent, check if the parent is being dragged
        // If so, don't reassign this node to a different parent
        if (draggedNode.parent().nonempty()) {
          const currentParent = draggedNode.parent().first();
          if (currentParent.grabbed() || currentParent.data('topoViewerRole') === 'group') {
            log.debug(`Skipping reparenting of ${draggedNode.id()} because its parent ${currentParent.id()} is a group or being dragged`);
            return;
          }
        }

        let assignedParent: cytoscape.NodeSingular | null = null;

        this.cy.nodes('[topoViewerRole = "group"]').forEach(parent => {
          // Skip if trying to parent to itself
          if (parent.id() === draggedNode.id()) {
            return;
          }

          // Never allow a group/parent node to become a child of another group
          if (draggedNode.isParent() || draggedNode.data('topoViewerRole') === 'group') {
            return;
          }

          // Skip if this potential parent is currently being dragged
          if (parent.grabbed()) {
            return;
          }

          // Don't steal children from a group that's being dragged
          if (draggedNode.parent().nonempty() && draggedNode.parent().first().grabbed()) {
            return;
          }

          if (isNodeInsideParent(draggedNode, parent)) {
            assignedParent = parent;
          }
        });

        if (assignedParent !== null) {
          const parentNode = assignedParent as cytoscape.NodeSingular;

          // Final check: never parent a group to another node
          if (draggedNode.data('topoViewerRole') === 'group' || draggedNode.isParent()) {
            log.warn(`Prevented group ${draggedNode.id()} from becoming child of ${parentNode.id()}`);
            return;
          }

          draggedNode.move({ parent: parentNode.id() });
          log.info(`${draggedNode.id()} became a child of ${parentNode.id()}`);
        }
      });

    } catch (error) {
      log.error(`initializeGroupManagement failed: ${error}`);
    }
  }

  public showGroupEditor(nodeOrId: cytoscape.NodeSingular | string): void {
    try {
      const panel = document.getElementById('panel-node-editor-parent');
      if (!panel) {
        log.warn('Group editor panel element not found');
        return;
      }
      panel.style.display = 'block';

      const node = typeof nodeOrId === 'string' ? this.cy.getElementById(nodeOrId) : nodeOrId;
      if (node.empty()) {
        log.warn('Group node not found');
        return;
      }

      const currentParentId = node.id();
      const groupIdEl = document.getElementById('panel-node-editor-parent-graph-group-id');
      const groupEl = document.getElementById('panel-node-editor-parent-graph-group') as HTMLInputElement;
      const levelEl = document.getElementById('panel-node-editor-parent-graph-level') as HTMLInputElement;
      const labelButtonEl = document.getElementById('panel-node-editor-parent-label-dropdown-button-text');
      const bgColorEl = document.getElementById('panel-node-editor-parent-bg-color') as HTMLInputElement;
      const bgOpacityEl = document.getElementById('panel-node-editor-parent-bg-opacity') as HTMLInputElement;
      const borderColorEl = document.getElementById('panel-node-editor-parent-border-color') as HTMLInputElement;
      const borderWidthEl = document.getElementById('panel-node-editor-parent-border-width') as HTMLInputElement;
      const borderStyleEl = document.getElementById('panel-node-editor-parent-border-style') as HTMLSelectElement;
      const borderRadiusEl = document.getElementById('panel-node-editor-parent-border-radius') as HTMLInputElement;
      const textColorEl = document.getElementById('panel-node-editor-parent-text-color') as HTMLInputElement;

      if (groupIdEl) groupIdEl.textContent = currentParentId;
      if (groupEl) groupEl.value = currentParentId.split(':')[0];
      if (levelEl) levelEl.value = currentParentId.split(':')[1];
      if (labelButtonEl) {
        const labelClasses = [
          'top-center',
          'top-left',
          'top-right',
          'bottom-center',
          'bottom-left',
          'bottom-right'
        ];
        const currentClass = labelClasses.find(cls => node.hasClass(cls));
        labelButtonEl.textContent = currentClass || 'Select Position';
      }

      const style = this.groupStyleManager.getStyle(currentParentId);

      if (bgColorEl) bgColorEl.value = style?.backgroundColor || '#d9d9d9';
      if (bgOpacityEl) {
        const opacity = style?.backgroundOpacity ?? 20;
        bgOpacityEl.value = opacity.toString();
        const opacityValueEl = document.getElementById('panel-node-editor-parent-bg-opacity-value');
        if (opacityValueEl) opacityValueEl.textContent = opacity + '%';
      }
      if (borderColorEl) borderColorEl.value = style?.borderColor || '#dddddd';
      if (borderWidthEl) borderWidthEl.value = style?.borderWidth?.toString() || '0.5';
      if (borderStyleEl) borderStyleEl.value = style?.borderStyle || 'solid';
      if (borderRadiusEl) {
        const radius = style?.borderRadius ?? 0;
        borderRadiusEl.value = radius.toString();
        const radiusValueEl = document.getElementById('panel-node-editor-parent-border-radius-value');
        if (radiusValueEl) radiusValueEl.textContent = radius + 'px';
      }
      if (textColorEl) textColorEl.value = style?.color || '#ebecf0';

      // Attach event listeners for auto-update
      const autoUpdateGroup = () => this.nodeParentPropertiesUpdate();

      // Format range display values
      const formatRangeValue = (el: HTMLInputElement, value: string) => {
        if (el.id.includes('opacity')) return value + '%';
        if (el.dataset.unit) return value + el.dataset.unit;
        return value + 'px';
      };

      // Attach listeners to all relevant inputs
      panel.querySelectorAll('input[type="range"], input[type="number"], input[type="color"], input[type="text"][id$="-hex"], select').forEach(el => {
        const inputEl = el as HTMLInputElement | HTMLSelectElement;
        const isRange = inputEl instanceof HTMLInputElement && inputEl.type === 'range';
        const isColor = inputEl instanceof HTMLInputElement && inputEl.type === 'color';
        const isHex = inputEl instanceof HTMLInputElement && inputEl.type === 'text' && inputEl.id.endsWith('-hex');
        const eventType = isRange || isColor || isHex ? 'input' : 'change';

        const onChange = () => {
          if (isRange) {
            const valueEl = panel.querySelector('#' + inputEl.id + '-value') as HTMLElement;
            if (valueEl) valueEl.textContent = formatRangeValue(inputEl, inputEl.value);
          } else if (isColor) {
            const hexId = inputEl.id.replace('-color', '-color-hex');
            const hex = document.getElementById(hexId) as HTMLInputElement;
            if (hex) hex.value = inputEl.value;
          } else if (isHex) {
            const val = inputEl.value.toUpperCase();
            if (/^#[0-9A-F]{6}$/.test(val)) {
              const colorId = inputEl.id.replace('-hex', '');
              const color = document.getElementById(colorId) as HTMLInputElement;
              if (color) color.value = val;
            }
          }
          autoUpdateGroup();
        };

        inputEl.addEventListener(eventType, onChange);
        if (isRange || isColor) onChange(); // Initial update
      });

      // Attach button click handlers
      const deleteButton = document.getElementById('panel-node-editor-parent-delete-button');
      if (deleteButton) deleteButton.addEventListener('click', () => this.nodeParentRemoval());

      const closeButton = document.getElementById('panel-node-editor-parent-close-button');
      if (closeButton) closeButton.addEventListener('click', () => this.nodeParentPropertiesUpdateClose());

      const updateButton = panel.querySelector('.btn-primary') as HTMLButtonElement;
      if (updateButton) updateButton.addEventListener('click', () => autoUpdateGroup());

      // Attach dropdown toggle
      const dropdownButton = panel.querySelector('#panel-node-editor-parent-label-dropdown button');
      if (dropdownButton) dropdownButton.addEventListener('click', () => this.panelNodeEditorParentToggleDropdown());

    } catch (error) {
      log.error(`showGroupEditor failed: ${error}`);
    }
  }

  public panelNodeEditorParentToggleDropdown(): void {
    const menu = document.getElementById('panel-node-editor-parent-label-dropdown-menu') as (HTMLElement & {
      dataset: DOMStringMap;
    }) | null;
    if (!menu) {
      log.error('Dropdown menu element not found');
      return;
    }
    if (!menu.dataset.listenersAttached) {
      const items = menu.querySelectorAll('.dropdown-item');
      items.forEach(item => {
        item.addEventListener('click', function (this: HTMLElement, event: Event) {
          event.preventDefault();
          const selectedText = this.textContent || '';
          const buttonTextEl = document.getElementById('panel-node-editor-parent-label-dropdown-button-text');
          if (buttonTextEl) {
            buttonTextEl.textContent = selectedText;
          }
          menu.classList.add('hidden');
        });
      });
      menu.dataset.listenersAttached = 'true';
    }
    menu.classList.toggle('hidden');
  }

  public async nodeParentPropertiesUpdate(): Promise<void> {
    try {
      const parentIdEl = document.getElementById('panel-node-editor-parent-graph-group-id');
      const groupInputEl = document.getElementById('panel-node-editor-parent-graph-group') as HTMLInputElement;
      const levelInputEl = document.getElementById('panel-node-editor-parent-graph-level') as HTMLInputElement;
      const labelPositionEl = document.getElementById('panel-node-editor-parent-label-dropdown-button-text');
      const bgColorEl = document.getElementById('panel-node-editor-parent-bg-color') as HTMLInputElement;
      const bgOpacityEl = document.getElementById('panel-node-editor-parent-bg-opacity') as HTMLInputElement;
      const borderColorEl = document.getElementById('panel-node-editor-parent-border-color') as HTMLInputElement;
      const borderWidthEl = document.getElementById('panel-node-editor-parent-border-width') as HTMLInputElement;
      const borderStyleEl = document.getElementById('panel-node-editor-parent-border-style') as HTMLSelectElement;
      const borderRadiusEl = document.getElementById('panel-node-editor-parent-border-radius') as HTMLInputElement;
      const textColorEl = document.getElementById('panel-node-editor-parent-text-color') as HTMLInputElement;
      if (!parentIdEl || !groupInputEl || !levelInputEl || !labelPositionEl) {
        const errorMsg = 'One or more required UI elements were not found.';
        acquireVsCodeApi().window.showWarningMessage(errorMsg);
        throw new Error(errorMsg);
      }
      const parentNodeId = parentIdEl.textContent?.trim() || '';
      if (!parentNodeId) {
        throw new Error('The parent node ID is empty.');
      }
      const oldParentNode = this.cy.getElementById(parentNodeId);
      if (oldParentNode.empty()) {
        throw new Error(`Parent node with ID "${parentNodeId}" not found in the Cytoscape instance.`);
      }
      const graphGroup = groupInputEl.value.trim();
      const graphLevel = levelInputEl.value.trim();
      if (!graphGroup || !graphLevel) {
        await sendMessageToVscodeEndpointPost('clab-show-vscode-message', {
          type: 'warning',
          message: 'Graph group or graph level input is empty.'
        });
        throw new Error('Graph group or graph level input is empty.');
      }
      const newParentId = `${graphGroup}:${graphLevel}`;
      const groupLabelPosition = labelPositionEl.textContent?.trim().toLowerCase() || '';
      const validLabelClasses = [
        'top-center',
        'top-left',
        'top-right',
        'bottom-center',
        'bottom-left',
        'bottom-right'
      ];
      const updateLabelPositionClass = (node: cytoscape.NodeSingular, labelPos: string): void => {
        validLabelClasses.forEach(cls => {
          if (node.hasClass(cls)) {
            node.removeClass(cls);
          }
        });
        if (validLabelClasses.includes(labelPos)) {
          node.addClass(labelPos);
          log.debug(`Applied label position '${labelPos}' to node: ${node.id()}`);
        }
      };
      const style = {
        id: newParentId,
        backgroundColor: bgColorEl?.value,
        backgroundOpacity: bgOpacityEl?.value ? parseFloat(bgOpacityEl.value) : undefined,
        borderColor: borderColorEl?.value,
        borderWidth: borderWidthEl?.value ? parseFloat(borderWidthEl.value) : undefined,
        borderStyle: borderStyleEl?.value as 'solid' | 'dotted' | 'dashed' | 'double' | undefined,
        borderRadius: borderRadiusEl?.value ? parseFloat(borderRadiusEl.value) : undefined,
        color: textColorEl?.value
      };

      if (parentNodeId === newParentId) {
        if (groupLabelPosition && groupLabelPosition !== 'select position') {
          updateLabelPositionClass(oldParentNode, groupLabelPosition);
        }
        this.groupStyleManager.updateGroupStyle(parentNodeId, style);
        log.debug(`No parent node update needed. Parent remains: ${parentNodeId}`);
        return;
      }
      if (!this.cy.getElementById(newParentId).empty()) {
        throw new Error(`A node with the new parent ID "${newParentId}" already exists.`);
      }
      const extraData: ParentNodeExtraData = {
        clabServerUsername: 'asad',
        weight: '2',
        name: '',
        topoViewerGroup: graphGroup,
        topoViewerGroupLevel: graphLevel
      };
      this.cy.add({
        group: 'nodes',
        data: { id: newParentId, name: graphGroup, topoViewerRole: 'group', extraData }
      });
      const newParentNode = this.cy.getElementById(newParentId);
      if (newParentNode.empty()) {
        throw new Error(`New parent node with ID "${newParentId}" could not be created.`);
      }
      const childNodes = oldParentNode.children();
      childNodes.forEach(childNode => {
        childNode.data('parent', newParentId);
        childNode.move({ parent: newParentId });
        log.debug(`Updated child node: ${childNode.id()}`);
      });
      oldParentNode.remove();
      parentIdEl.textContent = newParentId;
      if (groupLabelPosition && groupLabelPosition !== 'select position') {
        updateLabelPositionClass(newParentNode, groupLabelPosition);
      }
      this.groupStyleManager.updateGroupStyle(newParentId, style);
      if (parentNodeId !== newParentId) {
        this.groupStyleManager.removeGroupStyle(parentNodeId);
      }
      log.info(`Parent node updated successfully. New parent ID: ${newParentId}`);
    } catch (error) {
      log.error(`Error in nodeParentPropertiesUpdate: ${error}`);
    }
  }

  public nodeParentPropertiesUpdateClose(): boolean {
    try {
      const panel = document.getElementById('panel-node-editor-parent');
      if (panel) {
        panel.style.display = 'none';
        log.info('Node editor parent panel closed successfully');
        return true;
      }
      log.warn('Node editor parent panel element not found');
      return false;
    } catch (error) {
      log.error(`Error closing node editor parent panel: ${error}`);
      return false;
    }
  }

  public nodeParentRemoval(): boolean {
    try {
      const parentIdEl = document.getElementById('panel-node-editor-parent-graph-group-id');
      if (!parentIdEl) {
        throw new Error("Parent ID element 'panel-node-editor-parent-graph-group-id' not found.");
      }
      const parentNodeId = parentIdEl.textContent?.trim() || '';
      if (!parentNodeId) {
        throw new Error('The parent node ID is empty.');
      }
      const parentNode = this.cy.getElementById(parentNodeId);
      if (!parentNode || parentNode.empty()) {
        throw new Error(`No parent node found with id "${parentNodeId}".`);
      }
      const children = parentNode.children();
      children.forEach(child => {
        child.move({ parent: null });
      });
      parentNode.remove();
      const nodeEditorParentPanel = document.getElementById('panel-node-editor-parent');
      if (nodeEditorParentPanel) {
        nodeEditorParentPanel.style.display = 'none';
      } else {
        log.warn('Node editor parent panel element not found');
      }
      this.groupStyleManager.removeGroupStyle(parentNodeId);
      log.info(`Parent node '${parentNodeId}' removed successfully along with reparenting its children`);
      return true;
    } catch (error) {
      log.error(`Error in nodeParentRemoval: ${error}`);
      return false;
    }
  }

  public directGroupRemoval(groupId: string): boolean {
    try {
      const parentNode = this.cy.getElementById(groupId);
      if (!parentNode || parentNode.empty()) {
        log.error(`No group node found with id "${groupId}".`);
        return false;
      }

      // Unparent all children
      const children = parentNode.children();
      children.forEach(child => {
        child.move({ parent: null });
      });

      // Remove the parent node itself
      parentNode.remove();

      // Close the panel if it's showing this group
      const parentIdEl = document.getElementById('panel-node-editor-parent-graph-group-id');
      if (parentIdEl && parentIdEl.textContent?.trim() === groupId) {
        const nodeEditorParentPanel = document.getElementById('panel-node-editor-parent');
        if (nodeEditorParentPanel) {
          nodeEditorParentPanel.style.display = 'none';
        }
      }

      // Remove the group style from annotations
      this.groupStyleManager.removeGroupStyle(groupId);

      log.info(`Group '${groupId}' removed successfully`);
      return true;
    } catch (error) {
      log.error(`Error in directGroupRemoval: ${error}`);
      return false;
    }
  }

  public viewportButtonsAddGroup(): void {
    const selectedNodes = this.getGroupableSelectedNodes();
    if (selectedNodes.length > 0) {
      this.createGroupFromSelectedNodes(selectedNodes);
    } else {
      this.createEmptyGroup();
    }
  }

  private getGroupableSelectedNodes(): cytoscape.NodeSingular[] {
    return this.cy.nodes(':selected').filter(node =>
      node.isNode() &&
      node.data('topoViewerRole') !== 'freeText' &&
      node.data('topoViewerRole') !== 'group'
    ).toArray() as cytoscape.NodeSingular[];
  }

  private createGroupFromSelectedNodes(nodes: cytoscape.NodeSingular[]): void {
    // Create empty group first
    const groupId = this.createNewParent();
    const newParent = this.cy.getElementById(groupId);

    // Then manually add all nodes to the group
    nodes.forEach(node => {
      node.move({ parent: groupId });
      node.data('parent', groupId);
    });

    this.updateGroupEmptyStatus(newParent);

    this.cy.nodes().unselect();
    log.info(`Created group ${groupId} from ${nodes.length} selected nodes`);
  }

  private createEmptyGroup(): void {
    const groupId = this.createNewParent();
    log.info(`Created empty group ${groupId}`);
  }
}

/**
 * @deprecated Use {@link ManagerGroupManagement} instead.
 * Retained for backwards compatibility and will be removed in a future release.
 */
export class ManagerGroupManagemetn extends ManagerGroupManagement {
  constructor(...args: ConstructorParameters<typeof ManagerGroupManagement>) {
    // Warn at runtime when deprecated alias is used
    log.warn('ManagerGroupManagemetn is deprecated. Use ManagerGroupManagement instead.');
    super(...args);
  }
}
