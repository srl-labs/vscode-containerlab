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

interface GroupEditorElements {
  groupIdEl: HTMLElement | null;
  groupEl: HTMLInputElement | null;
  levelEl: HTMLInputElement | null;
  labelButtonEl: HTMLElement | null;
  bgColorEl: HTMLInputElement | null;
  bgOpacityEl: HTMLInputElement | null;
  borderColorEl: HTMLInputElement | null;
  borderWidthEl: HTMLInputElement | null;
  borderStyleEl: HTMLSelectElement | null;
  borderRadiusEl: HTMLInputElement | null;
  textColorEl: HTMLInputElement | null;
}

interface ParentEditorInputs {
  parentIdEl: HTMLElement;
  groupInputEl: HTMLInputElement;
  levelInputEl: HTMLInputElement;
  labelPositionEl: HTMLElement;
  bgColorEl: HTMLInputElement | null;
  bgOpacityEl: HTMLInputElement | null;
  borderColorEl: HTMLInputElement | null;
  borderWidthEl: HTMLInputElement | null;
  borderStyleEl: HTMLSelectElement | null;
  borderRadiusEl: HTMLInputElement | null;
  textColorEl: HTMLInputElement | null;
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
      const panel = this.getGroupEditorPanel();
      const node = this.resolveGroupNode(nodeOrId);
      if (!panel || !node) return;
      const elements = this.getGroupEditorElements();
      this.populateGroupEditorFields(node, elements);
      this.attachGroupEditorListeners(panel, () => this.nodeParentPropertiesUpdate());
    } catch (error) {
      log.error(`showGroupEditor failed: ${error}`);
    }
  }

  private getGroupEditorPanel(): HTMLElement | null {
    const panel = document.getElementById('panel-node-editor-parent');
    if (!panel) {
      log.warn('Group editor panel element not found');
      return null;
    }
    panel.style.display = 'block';
    return panel;
  }

  private resolveGroupNode(nodeOrId: cytoscape.NodeSingular | string): cytoscape.NodeSingular | null {
    const node = typeof nodeOrId === 'string' ? this.cy.getElementById(nodeOrId) : nodeOrId;
    if (node.empty()) {
      log.warn('Group node not found');
      return null;
    }
    return node;
  }

  private getGroupEditorElements(): GroupEditorElements {
    return {
      groupIdEl: document.getElementById('panel-node-editor-parent-graph-group-id'),
      groupEl: document.getElementById('panel-node-editor-parent-graph-group') as HTMLInputElement,
      levelEl: document.getElementById('panel-node-editor-parent-graph-level') as HTMLInputElement,
      labelButtonEl: document.getElementById('panel-node-editor-parent-label-dropdown-button-text'),
      bgColorEl: document.getElementById('panel-node-editor-parent-bg-color') as HTMLInputElement,
      bgOpacityEl: document.getElementById('panel-node-editor-parent-bg-opacity') as HTMLInputElement,
      borderColorEl: document.getElementById('panel-node-editor-parent-border-color') as HTMLInputElement,
      borderWidthEl: document.getElementById('panel-node-editor-parent-border-width') as HTMLInputElement,
      borderStyleEl: document.getElementById('panel-node-editor-parent-border-style') as HTMLSelectElement,
      borderRadiusEl: document.getElementById('panel-node-editor-parent-border-radius') as HTMLInputElement,
      textColorEl: document.getElementById('panel-node-editor-parent-text-color') as HTMLInputElement
    };
  }

  private setText(el: HTMLElement | null, text: string): void {
    if (el) el.textContent = text;
  }

  private setValue(el: HTMLInputElement | HTMLSelectElement | null, value: string): void {
    if (el) el.value = value;
  }

  private setLabelButton(node: cytoscape.NodeSingular, labelButtonEl: HTMLElement | null): void {
    if (!labelButtonEl) return;
    const labelClasses = ['top-center', 'top-left', 'top-right', 'bottom-center', 'bottom-left', 'bottom-right'];
    const currentClass = labelClasses.find(cls => node.hasClass(cls));
    labelButtonEl.textContent = currentClass || 'Select Position';
  }

  private populateGroupEditorFields(node: cytoscape.NodeSingular, ui: GroupEditorElements): void {
    const currentParentId = node.id();
    const [group, level] = currentParentId.split(':');
    this.setText(ui.groupIdEl, currentParentId);
    this.setValue(ui.groupEl, group);
    this.setValue(ui.levelEl, level);

    this.setLabelButton(node, ui.labelButtonEl);

    const styleDefaults = {
      backgroundColor: '#d9d9d9',
      backgroundOpacity: 20,
      borderColor: '#dddddd',
      borderWidth: 0.5,
      borderStyle: 'solid' as const,
      borderRadius: 0,
      color: '#ebecf0'
    };
    const style = { ...styleDefaults, ...this.groupStyleManager.getStyle(currentParentId) };

    this.setValue(ui.bgColorEl, style.backgroundColor);

    if (ui.bgOpacityEl) {
      ui.bgOpacityEl.value = style.backgroundOpacity.toString();
      const opacityValueEl = document.getElementById('panel-node-editor-parent-bg-opacity-value');
      this.setText(opacityValueEl, `${style.backgroundOpacity}%`);
    }

    this.setValue(ui.borderColorEl, style.borderColor);
    this.setValue(ui.borderWidthEl, style.borderWidth.toString());
    if (ui.borderStyleEl) ui.borderStyleEl.value = style.borderStyle;

    if (ui.borderRadiusEl) {
      ui.borderRadiusEl.value = style.borderRadius.toString();
      const radiusValueEl = document.getElementById('panel-node-editor-parent-border-radius-value');
      this.setText(radiusValueEl, `${style.borderRadius}px`);
    }

    this.setValue(ui.textColorEl, style.color);
  }

  private attachGroupEditorListeners(panel: HTMLElement, autoUpdateGroup: () => void): void {
    this.attachInputListeners(panel, autoUpdateGroup);

    const deleteButton = document.getElementById('panel-node-editor-parent-delete-button');
    if (deleteButton) deleteButton.addEventListener('click', () => this.nodeParentRemoval());

    const closeButton = document.getElementById('panel-node-editor-parent-close-button');
    if (closeButton) closeButton.addEventListener('click', () => this.nodeParentPropertiesUpdateClose());

    const updateButton = panel.querySelector('.btn-primary') as HTMLButtonElement | null;
    if (updateButton) updateButton.addEventListener('click', autoUpdateGroup);

    const dropdownButton = panel.querySelector('#panel-node-editor-parent-label-dropdown button');
    if (dropdownButton) dropdownButton.addEventListener('click', () => this.panelNodeEditorParentToggleDropdown());
  }

  private attachInputListeners(panel: HTMLElement, autoUpdateGroup: () => void): void {
    const inputs = panel.querySelectorAll(
      'input[type="range"], input[type="number"], input[type="color"], input[type="text"][id$="-hex"], select'
    );
    inputs.forEach(el => {
      const inputEl = el as HTMLInputElement | HTMLSelectElement;
      const eventType = this.getInputEventType(inputEl);
      const onChange = () => {
        this.updateInputValue(inputEl, panel);
        autoUpdateGroup();
      };
      inputEl.addEventListener(eventType, onChange);
      if (eventType === 'input') onChange();
    });
  }

  private getInputEventType(inputEl: HTMLInputElement | HTMLSelectElement): 'input' | 'change' {
    const isRange = inputEl instanceof HTMLInputElement && inputEl.type === 'range';
    const isColor = inputEl instanceof HTMLInputElement && inputEl.type === 'color';
    const isHex = inputEl instanceof HTMLInputElement && inputEl.type === 'text' && inputEl.id.endsWith('-hex');
    return isRange || isColor || isHex ? 'input' : 'change';
  }

  private updateInputValue(inputEl: HTMLInputElement | HTMLSelectElement, panel: HTMLElement): void {
    if (inputEl instanceof HTMLInputElement && inputEl.type === 'range') {
      const valueEl = panel.querySelector('#' + inputEl.id + '-value') as HTMLElement;
      this.setText(valueEl, this.formatRangeValue(inputEl));
    } else if (inputEl instanceof HTMLInputElement && inputEl.type === 'color') {
      const hex = document.getElementById(inputEl.id.replace('-color', '-color-hex')) as HTMLInputElement | null;
      if (hex) hex.value = inputEl.value;
    } else if (inputEl instanceof HTMLInputElement && inputEl.type === 'text' && inputEl.id.endsWith('-hex')) {
      const val = inputEl.value.toUpperCase();
      if (/^#[0-9A-F]{6}$/.test(val)) {
        const color = document.getElementById(inputEl.id.replace('-hex', '')) as HTMLInputElement | null;
        if (color) color.value = val;
      }
    }
  }

  private formatRangeValue(el: HTMLInputElement): string {
    if (el.id.includes('opacity')) return el.value + '%';
    if (el.dataset.unit) return el.value + el.dataset.unit;
    return el.value + 'px';
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

  private getParentEditorInputs(): ParentEditorInputs {
    const parentIdEl = document.getElementById('panel-node-editor-parent-graph-group-id');
    const groupInputEl = document.getElementById('panel-node-editor-parent-graph-group') as HTMLInputElement | null;
    const levelInputEl = document.getElementById('panel-node-editor-parent-graph-level') as HTMLInputElement | null;
    const labelPositionEl = document.getElementById('panel-node-editor-parent-label-dropdown-button-text');
    if (!parentIdEl || !groupInputEl || !levelInputEl || !labelPositionEl) {
      const errorMsg = 'One or more required UI elements were not found.';
      acquireVsCodeApi().window.showWarningMessage(errorMsg);
      throw new Error(errorMsg);
    }
    return {
      parentIdEl,
      groupInputEl,
      levelInputEl,
      labelPositionEl,
      bgColorEl: document.getElementById('panel-node-editor-parent-bg-color') as HTMLInputElement | null,
      bgOpacityEl: document.getElementById('panel-node-editor-parent-bg-opacity') as HTMLInputElement | null,
      borderColorEl: document.getElementById('panel-node-editor-parent-border-color') as HTMLInputElement | null,
      borderWidthEl: document.getElementById('panel-node-editor-parent-border-width') as HTMLInputElement | null,
      borderStyleEl: document.getElementById('panel-node-editor-parent-border-style') as HTMLSelectElement | null,
      borderRadiusEl: document.getElementById('panel-node-editor-parent-border-radius') as HTMLInputElement | null,
      textColorEl: document.getElementById('panel-node-editor-parent-text-color') as HTMLInputElement | null
    };
  }

  private getNumericValue(el: HTMLInputElement | null): number | undefined {
    if (!el || !el.value) return undefined;
    return parseFloat(el.value);
  }

  private buildParentStyle(id: string, inputs: ParentEditorInputs) {
    return {
      id,
      backgroundColor: inputs.bgColorEl?.value,
      backgroundOpacity: this.getNumericValue(inputs.bgOpacityEl),
      borderColor: inputs.borderColorEl?.value,
      borderWidth: this.getNumericValue(inputs.borderWidthEl),
      borderStyle: inputs.borderStyleEl?.value as 'solid' | 'dotted' | 'dashed' | 'double' | undefined,
      borderRadius: this.getNumericValue(inputs.borderRadiusEl),
      color: inputs.textColorEl?.value
    };
  }

  private updateLabelPositionClass(node: cytoscape.NodeSingular, labelPos: string): void {
    const validLabelClasses = ['top-center', 'top-left', 'top-right', 'bottom-center', 'bottom-left', 'bottom-right'];
    validLabelClasses.forEach(cls => node.removeClass(cls));
    if (validLabelClasses.includes(labelPos)) {
      node.addClass(labelPos);
      log.debug(`Applied label position '${labelPos}' to node: ${node.id()}`);
    }
  }

  private ensureUniqueParentId(newParentId: string): void {
    if (!this.cy.getElementById(newParentId).empty()) {
      throw new Error(`A node with the new parent ID "${newParentId}" already exists.`);
    }
  }

  private replaceParentNode(
    oldParentNode: cytoscape.NodeSingular,
    oldParentId: string,
    newParentId: string,
    graphGroup: string,
    graphLevel: string,
    style: any,
    labelPos: string
  ): void {
    const extraData: ParentNodeExtraData = {
      clabServerUsername: 'asad',
      weight: '2',
      name: '',
      topoViewerGroup: graphGroup,
      topoViewerGroupLevel: graphLevel
    };
    const oldPosition = oldParentNode.position();
    const oldClasses = oldParentNode.classes();
    this.cy.add({
      group: 'nodes',
      data: { id: newParentId, name: graphGroup, topoViewerRole: 'group', extraData },
      position: { x: oldPosition.x, y: oldPosition.y },
      classes: oldClasses
    });
    const newParentNode = this.cy.getElementById(newParentId);
    const childNodes = oldParentNode.children();
    childNodes.forEach(childNode => {
      childNode.data('parent', newParentId);
      childNode.move({ parent: newParentId });
      log.debug(`Updated child node: ${childNode.id()}`);
    });
    oldParentNode.remove();
    if (labelPos && labelPos !== 'select position') {
      this.updateLabelPositionClass(newParentNode, labelPos);
    }
    this.groupStyleManager.updateGroupStyle(newParentId, style);
    this.groupStyleManager.removeGroupStyle(oldParentId);
  }

  public async nodeParentPropertiesUpdate(): Promise<void> {
    try {
      const inputs = this.getParentEditorInputs();
      const parentNodeId = inputs.parentIdEl.textContent?.trim() || '';
      if (!parentNodeId) throw new Error('The parent node ID is empty.');
      const oldParentNode = this.cy.getElementById(parentNodeId);
      if (oldParentNode.empty()) {
        throw new Error(`Parent node with ID "${parentNodeId}" not found in the Cytoscape instance.`);
      }

      const graphGroup = inputs.groupInputEl.value.trim();
      const graphLevel = inputs.levelInputEl.value.trim();
      if (!graphGroup || !graphLevel) {
        await sendMessageToVscodeEndpointPost('clab-show-vscode-message', {
          type: 'warning',
          message: 'Graph group or graph level input is empty.'
        });
        throw new Error('Graph group or graph level input is empty.');
      }

      const newParentId = `${graphGroup}:${graphLevel}`;
      const labelPos = inputs.labelPositionEl.textContent?.trim().toLowerCase() || '';
      const style = this.buildParentStyle(newParentId, inputs);

      if (parentNodeId === newParentId) {
        if (labelPos && labelPos !== 'select position') {
          this.updateLabelPositionClass(oldParentNode, labelPos);
        }
        this.groupStyleManager.updateGroupStyle(parentNodeId, style);
        log.debug(`No parent node update needed. Parent remains: ${parentNodeId}`);
        return;
      }

      this.ensureUniqueParentId(newParentId);
      this.replaceParentNode(oldParentNode, parentNodeId, newParentId, graphGroup, graphLevel, style, labelPos);
      inputs.parentIdEl.textContent = newParentId;
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
