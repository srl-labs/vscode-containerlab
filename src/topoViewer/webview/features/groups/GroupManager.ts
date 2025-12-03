import cytoscape from 'cytoscape';
import { log } from '../../platform/logging/logger';

// Common group editor DOM identifiers and classes
const PANEL_PARENT_ID = 'panel-node-editor-parent' as const;
const PANEL_EL_PREFIX = 'panel-node-editor-parent-' as const;
const LABEL_BUTTON_TEXT_ID = `${PANEL_EL_PREFIX}label-dropdown-button-text` as const;
const CLASS_EMPTY_GROUP = 'empty-group' as const;
const DEFAULT_LABEL_POS = 'top-center' as const;
import type { ParentNodeData, ParentNodeExtraData, GroupStyleAnnotation } from '../../../shared/types/topoViewerGraph';
import type { ManagerGroupStyle } from './GroupStyleManager';
import { GROUP_LABEL_POSITIONS } from './LabelPositions';

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

// CSS class for Apply button with pending changes
const CLASS_HAS_CHANGES = 'btn-has-changes' as const;

export class ManagerGroupManagement {
  private cy: cytoscape.Core;
  private groupStyleManager: ManagerGroupStyle;
  private initialValues: Record<string, string> | null = null;

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
      group.addClass(CLASS_EMPTY_GROUP);
    } else {
      group.removeClass(CLASS_EMPTY_GROUP);
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
      this.groupStyleManager.removeGroupStyle(parent.id());
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
    const offsetBase = 20;
    const topCenterX = (ext.x1 + ext.x2 + offsetBase) / 2;
    const topCenterY = ext.y1 + 2 * offsetBase;

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

    // Determine style for the new group using the last style if available
    const lastStyle = this.groupStyleManager.getGroupStyles().slice(-1)[0];
    const style: GroupStyleAnnotation = lastStyle
      ? { ...lastStyle, id: newParentId }
      : {
        id: newParentId,
        backgroundColor: '#d9d9d9',
        backgroundOpacity: 20,
        borderColor: '#dddddd',
        borderWidth: 0.5,
        borderStyle: 'solid' as 'solid',
        borderRadius: 0,
        color: '#ebecf0',
        labelPosition: DEFAULT_LABEL_POS
      };

    if (!style.labelPosition) {
      style.labelPosition = DEFAULT_LABEL_POS;
    }

    this.updateLabelPositionClass(newParent, style.labelPosition);
    this.groupStyleManager.updateGroupStyle(newParentId, style);

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
      this.cy.on('grab', 'node', this.handleNodeGrab);
      this.cy.on('move', 'node', this.handleNodeMove);
      this.cy.on('remove', 'node', this.handleNodeRemove);
      this.cy.on('add', 'node', this.preventGroupChild);
      this.cy.on('data', 'node', this.preventGroupParentData);
      this.cy.on('dragfree', 'node', this.handleNodeDragfree);
    } catch (error) {
      log.error(`initializeGroupManagement failed: ${error}`);
    }
  }

  private handleNodeGrab = (event: cytoscape.EventObject): void => {
    event.target.scratch('_oldParent', event.target.parent());
  };

  private handleNodeMove = (event: cytoscape.EventObject): void => {
    const oldParent = event.target.scratch('_oldParent');
    const newParent = event.target.parent();
    if (oldParent) this.updateGroupEmptyStatus(oldParent);
    if (newParent.nonempty()) this.updateGroupEmptyStatus(newParent);
  };

  private handleNodeRemove = (event: cytoscape.EventObject): void => {
    const oldParent = event.target.scratch('_oldParent');
    if (oldParent) this.updateGroupEmptyStatus(oldParent);
  };

  private preventGroupChild = (event: cytoscape.EventObject): void => {
    const node = event.target as cytoscape.NodeSingular;
    if (node.data('topoViewerRole') === 'group' && node.parent().nonempty()) {
      log.warn(`Preventing group ${node.id()} from being child of ${node.parent().first().id()}`);
      node.move({ parent: null });
    }
  };

  private preventGroupParentData = (event: cytoscape.EventObject): void => {
    const node = event.target as cytoscape.NodeSingular;
    if (node.data('topoViewerRole') === 'group' && node.data('parent')) {
      log.warn(`Preventing group ${node.id()} from having parent ${node.data('parent')}`);
      node.data('parent', null);
      node.move({ parent: null });
    }
  };

  private handleNodeDragfree = (event: cytoscape.EventObject): void => {
    const draggedNode = event.target as cytoscape.NodeSingular;
    if (this.shouldSkipDragfree(draggedNode)) return;
    const assignedParent = this.findAssignedParent(draggedNode);
    if (!assignedParent) return;
    if (draggedNode.data('topoViewerRole') === 'group' || draggedNode.isParent()) {
      log.warn(`Prevented group ${draggedNode.id()} from becoming child of ${assignedParent.id()}`);
      return;
    }
    draggedNode.move({ parent: assignedParent.id() });
    log.info(`${draggedNode.id()} became a child of ${assignedParent.id()}`);
  };

  private shouldSkipDragfree(draggedNode: cytoscape.NodeSingular): boolean {
    if (draggedNode.data('topoViewerRole') === 'freeText' ||
        draggedNode.data('topoViewerRole') === 'freeShape') {
      return true;
    }
    if (this.cy.nodes('[topoViewerRole = "group"]').some(group => (group as cytoscape.NodeSingular).grabbed())) {
      log.debug('Skipping all reparenting because a group is being dragged');
      return true;
    }
    if (draggedNode.data('topoViewerRole') === 'group' || draggedNode.isParent()) {
      if (draggedNode.parent().nonempty()) {
        log.warn(`Group ${draggedNode.id()} incorrectly has parent, removing`);
        draggedNode.move({ parent: null });
      }
      return true;
    }
    if (draggedNode.parent().nonempty()) {
      const currentParent = draggedNode.parent().first();
      if (currentParent.grabbed() || currentParent.data('topoViewerRole') === 'group') {
        log.debug(`Skipping reparenting of ${draggedNode.id()} because its parent ${currentParent.id()} is a group or being dragged`);
        return true;
      }
    }
    return false;
  }

  private findAssignedParent(draggedNode: cytoscape.NodeSingular): cytoscape.NodeSingular | null {
    let assignedParent: cytoscape.NodeSingular | null = null;
    this.cy.nodes('[topoViewerRole = "group"]').forEach(parent => {
      if (parent.id() === draggedNode.id()) return;
      if (parent.grabbed()) return;
      if (draggedNode.parent().nonempty() && draggedNode.parent().first().grabbed()) return;
      if (this.isNodeInsideParent(draggedNode, parent as cytoscape.NodeSingular)) {
        assignedParent = parent as cytoscape.NodeSingular;
      }
    });
    return assignedParent;
  }

  private isNodeInsideParent(node: cytoscape.NodeSingular, parent: cytoscape.NodeSingular): boolean {
    const parentBox = parent.boundingBox();
    const nodePos = node.position();
    return (
      nodePos.x >= parentBox.x1 &&
      nodePos.x <= parentBox.x2 &&
      nodePos.y >= parentBox.y1 &&
      nodePos.y <= parentBox.y2
    );
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
    const panel = document.getElementById(PANEL_PARENT_ID);
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
      groupIdEl: document.getElementById(`${PANEL_EL_PREFIX}graph-group-id`),
      groupEl: document.getElementById(`${PANEL_EL_PREFIX}graph-group`) as HTMLInputElement,
      levelEl: document.getElementById(`${PANEL_EL_PREFIX}graph-level`) as HTMLInputElement,
      labelButtonEl: document.getElementById(LABEL_BUTTON_TEXT_ID),
      bgColorEl: document.getElementById(`${PANEL_EL_PREFIX}bg-color`) as HTMLInputElement,
      bgOpacityEl: document.getElementById(`${PANEL_EL_PREFIX}bg-opacity`) as HTMLInputElement,
      borderColorEl: document.getElementById(`${PANEL_EL_PREFIX}border-color`) as HTMLInputElement,
      borderWidthEl: document.getElementById(`${PANEL_EL_PREFIX}border-width`) as HTMLInputElement,
      borderStyleEl: document.getElementById(`${PANEL_EL_PREFIX}border-style`) as HTMLSelectElement,
      borderRadiusEl: document.getElementById(`${PANEL_EL_PREFIX}border-radius`) as HTMLInputElement,
      textColorEl: document.getElementById(`${PANEL_EL_PREFIX}text-color`) as HTMLInputElement
    };
  }

  private setText(el: HTMLElement | null, text: string): void {
    if (el) el.textContent = text;
  }

  private setValue(el: HTMLInputElement | HTMLSelectElement | null, value: string): void {
    if (el) el.value = value;
  }

  /**
   * Gets the value of an input element or empty string if null.
   */
  private getInputValue(el: HTMLInputElement | HTMLSelectElement | null): string {
    return el?.value || '';
  }

  /**
   * Captures current values from all group editor inputs for change tracking.
   */
  private captureCurrentValues(): Record<string, string> {
    const el = this.getGroupEditorElements();
    const labelButton = document.getElementById(LABEL_BUTTON_TEXT_ID);
    return {
      group: this.getInputValue(el.groupEl),
      level: this.getInputValue(el.levelEl),
      labelPos: labelButton?.textContent || '',
      bgColor: this.getInputValue(el.bgColorEl),
      bgOpacity: this.getInputValue(el.bgOpacityEl),
      borderColor: this.getInputValue(el.borderColorEl),
      borderWidth: this.getInputValue(el.borderWidthEl),
      borderStyle: this.getInputValue(el.borderStyleEl),
      borderRadius: this.getInputValue(el.borderRadiusEl),
      textColor: this.getInputValue(el.textColorEl)
    };
  }

  /**
   * Checks if there are unsaved changes by comparing current values to initial values.
   */
  private hasUnsavedChanges(): boolean {
    if (!this.initialValues) return false;
    const current = this.captureCurrentValues();
    return Object.keys(this.initialValues).some(
      key => this.initialValues![key] !== current[key]
    );
  }

  /**
   * Updates the Apply button's visual state based on whether there are unsaved changes.
   */
  private updateApplyButtonState(): void {
    const applyButton = document.getElementById(`${PANEL_EL_PREFIX}apply-button`);
    if (!applyButton) return;
    const hasChanges = this.hasUnsavedChanges();
    applyButton.classList.toggle(CLASS_HAS_CHANGES, hasChanges);
  }

  /**
   * Resets initial values to current values after applying changes.
   */
  private resetInitialValues(): void {
    this.initialValues = this.captureCurrentValues();
    this.updateApplyButtonState();
  }

  private setLabelButton(node: cytoscape.NodeSingular, labelButtonEl: HTMLElement | null): void {
    if (!labelButtonEl) return;
    const currentClass = GROUP_LABEL_POSITIONS.find(cls => node.hasClass(cls));
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
      const opacityValueEl = document.getElementById(`${PANEL_EL_PREFIX}bg-opacity-value`);
      this.setText(opacityValueEl, `${style.backgroundOpacity}%`);
    }

    this.setValue(ui.borderColorEl, style.borderColor);
    this.setValue(ui.borderWidthEl, style.borderWidth.toString());
    if (ui.borderStyleEl) ui.borderStyleEl.value = style.borderStyle;

    if (ui.borderRadiusEl) {
      ui.borderRadiusEl.value = style.borderRadius.toString();
      const radiusValueEl = document.getElementById(`${PANEL_EL_PREFIX}border-radius-value`);
      this.setText(radiusValueEl, `${style.borderRadius}px`);
    }

    this.setValue(ui.textColorEl, style.color);

    // Capture initial values for change tracking after a small delay to ensure DOM is updated
    setTimeout(() => {
      this.initialValues = this.captureCurrentValues();
      this.updateApplyButtonState();
    }, 0);
  }

  private attachGroupEditorListeners(panel: HTMLElement, autoUpdateGroup: () => void): void {
    // Wrap autoUpdateGroup to also update Apply button state
    const autoUpdateWithChangeTracking = () => {
      autoUpdateGroup();
      this.updateApplyButtonState();
    };

    this.attachInputListeners(panel, autoUpdateWithChangeTracking);

    const deleteButton = document.getElementById(`${PANEL_EL_PREFIX}delete-button`);
    if (deleteButton) deleteButton.addEventListener('click', () => this.nodeParentRemoval());

    // OK button: save and close
    const okButton = document.getElementById(`${PANEL_EL_PREFIX}ok-button`);
    if (okButton) {
      okButton.addEventListener('click', () => {
        autoUpdateGroup();
        this.nodeParentPropertiesUpdateClose();
      });
    }

    // Apply button: save without closing and reset initial values
    const applyButton = document.getElementById(`${PANEL_EL_PREFIX}apply-button`);
    if (applyButton) {
      applyButton.addEventListener('click', () => {
        autoUpdateGroup();
        this.resetInitialValues();
      });
    }

    this.initializeLabelDropdown(autoUpdateWithChangeTracking);
  }

  private initializeLabelDropdown(autoUpdateGroup: () => void): void {
    const menu = document.getElementById(`${PANEL_EL_PREFIX}label-dropdown-menu`) as (HTMLElement & {
      dataset: DOMStringMap;
    }) | null;
    const button = document.querySelector('#panel-node-editor-parent-label-dropdown button') as HTMLButtonElement | null;
    const buttonTextEl = document.getElementById(LABEL_BUTTON_TEXT_ID);
    if (!menu || !button || !buttonTextEl) {
      log.error('Label dropdown elements not found');
      return;
    }
    if (!menu.dataset.listenersAttached) {
      const items = menu.querySelectorAll('.dropdown-item');
      items.forEach(item => {
        item.addEventListener('click', event => {
          event.preventDefault();
          const selectedText = item.textContent || '';
          buttonTextEl.textContent = selectedText;
          menu.classList.add('hidden');
          autoUpdateGroup();
        });
      });
      button.addEventListener('click', () => menu.classList.toggle('hidden'));
      menu.dataset.listenersAttached = 'true';
    }
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
    const menu = document.getElementById(`${PANEL_EL_PREFIX}label-dropdown-menu`);
    if (!menu) {
      log.error('Dropdown menu element not found');
      return;
    }
    this.initializeLabelDropdown(() => this.nodeParentPropertiesUpdate());
    menu.classList.toggle('hidden');
  }

  private getParentEditorInputs(): ParentEditorInputs {
    const parentIdEl = document.getElementById(`${PANEL_EL_PREFIX}graph-group-id`);
    const groupInputEl = document.getElementById(`${PANEL_EL_PREFIX}graph-group`) as HTMLInputElement | null;
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
      color: inputs.textColorEl?.value,
      labelPosition: inputs.labelPositionEl.textContent?.trim().toLowerCase()
    };
  }

  private updateLabelPositionClass(node: cytoscape.NodeSingular, labelPos: string): void {
    GROUP_LABEL_POSITIONS.forEach(cls => node.removeClass(cls));
    if (GROUP_LABEL_POSITIONS.includes(labelPos as any)) {
      node.addClass(labelPos);
      node.data('groupLabelPos', labelPos);
      log.debug(`Applied label position '${labelPos}' to node: ${node.id()}`);
    } else {
      node.removeData('groupLabelPos');
    }
  }

  private ensureUniqueParentId(newParentId: string): string {
    const [group, levelStr] = newParentId.split(':');
    let level = parseInt(levelStr, 10);
    if (!level || isNaN(level)) level = 1;
    let candidate = `${group}:${level}`;
    while (!this.cy.getElementById(candidate).empty()) {
      level++;
      candidate = `${group}:${level}`;
    }
    if (candidate !== newParentId) {
      log.debug(`Adjusted parent ID to ensure uniqueness: ${candidate}`);
    }
    return candidate;
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

      let newParentId = `${graphGroup}:${graphLevel}`;
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

      newParentId = this.ensureUniqueParentId(newParentId);
      this.replaceParentNode(oldParentNode, parentNodeId, newParentId, graphGroup, graphLevel, style, labelPos);
      inputs.parentIdEl.textContent = newParentId;
      log.info(`Parent node updated successfully. New parent ID: ${newParentId}`);
    } catch (error) {
      log.error(`Error in nodeParentPropertiesUpdate: ${error}`);
    }
  }

  public nodeParentPropertiesUpdateClose(): boolean {
    try {
      const panel = document.getElementById(PANEL_PARENT_ID);
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
      const parentIdEl = document.getElementById(`${PANEL_EL_PREFIX}graph-group-id`);
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
        const nodeEditorParentPanel = document.getElementById(PANEL_PARENT_ID);
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
