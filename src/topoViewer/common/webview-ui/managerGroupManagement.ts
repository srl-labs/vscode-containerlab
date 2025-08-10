import cytoscape from 'cytoscape';
import { log } from '../logging/webviewLogger';
import type { ParentNodeData, ParentNodeExtraData } from '../types/topoViewerGraph';

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
  createDummyChild?: boolean;
}

export class ManagerGroupManagement {
  private cy: cytoscape.Core;

  /* eslint-disable no-unused-vars */
  constructor(cy: cytoscape.Core, _mode: 'edit' | 'view' = 'view') {
  /* eslint-enable no-unused-vars */
    this.cy = cy;
    // Mode parameter kept for backwards compatibility but not used currently
  }

  public orphaningNode(node: cytoscape.NodeSingular): void {
    const parent = node.parent()[0] as cytoscape.NodeSingular | undefined;
    if (!parent) {
      return;
    }
    node.move({ parent: null });
    if (parent.isChildless()) {
      log.info('Removing empty parent node');
      parent.remove();
    }
  }

  public createNewParent(options: CreateNewParentOptions = {}): string {
    const { nodeToReparent = null, createDummyChild = false } = options;
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
      classes: ''
    };

    const nodesToAdd: NodeOptions[] = [parentNodeData];
    if (createDummyChild) {
      nodesToAdd.push({
        group: 'nodes',
        data: {
          id: `${newParentId}:dummyChild`,
          parent: newParentId,
          topoViewerRole: 'dummyChild'
        },
        removed: false,
        selected: false,
        selectable: false,
        locked: false,
        position: { x: topCenterX, y: topCenterY },
        grabbed: false,
        grabbable: false,
        classes: 'dummy'
      });
    }

    this.cy.add(nodesToAdd);
    if (nodeToReparent) {
      nodeToReparent.move({ parent: newParentId });
      nodeToReparent.data('parent', newParentId);
    }

    const panel = document.getElementById('panel-node-editor-parent');
    if (panel) {
      panel.style.display = 'block';
      const groupIdEl = document.getElementById('panel-node-editor-parent-graph-group-id');
      const groupEl = document.getElementById('panel-node-editor-parent-graph-group') as HTMLInputElement;
      const levelEl = document.getElementById('panel-node-editor-parent-graph-level') as HTMLInputElement;
      if (groupIdEl) groupIdEl.textContent = newParentId;
      if (groupEl) groupEl.value = newParentId.split(':')[0];
      if (levelEl) levelEl.value = newParentId.split(':')[1];
    }

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

      this.cy.on('dragfree', 'node', (event: cytoscape.EventObject) => {
        const draggedNode = event.target as cytoscape.NodeSingular;

        // Don't process group nodes or dummy children being dragged
        if (draggedNode.data('topoViewerRole') === 'group' ||
            draggedNode.data('topoViewerRole') === 'dummyChild') {
          return;
        }

        let assignedParent: cytoscape.NodeSingular | null = null;

        // Look for group nodes instead of just parent nodes
        // This ensures we find groups even if they only have dummy children
        this.cy.nodes('[topoViewerRole = "group"]').forEach(parent => {
          if (isNodeInsideParent(draggedNode, parent)) {
            assignedParent = parent;
          }
        });

        if (assignedParent !== null) {
          const parentNode = assignedParent as cytoscape.NodeSingular;
          draggedNode.move({ parent: parentNode.id() });
          log.info(`${draggedNode.id()} became a child of ${parentNode.id()}`);

          // Remove dummy child if there are now real children
          const dummyChild = parentNode.children('[topoViewerRole = "dummyChild"]');
          if (dummyChild.length > 0) {
            const realChildren = parentNode.children().not(dummyChild);
            if (realChildren.length > 0) {
              dummyChild.remove();
              log.debug('Dummy child removed');
            }
          }
        }

        // Clean up empty group nodes (those without any children including dummy children)
        const parentNodes = this.cy.nodes('[topoViewerRole = "group"]');
        parentNodes.forEach(parentNode => {
          if (parentNode.children().empty()) {
            parentNode.remove();
            log.debug(`Removed empty group: ${parentNode.id()}`);
          }
        });
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
      if (parentNodeId === newParentId) {
        if (groupLabelPosition && groupLabelPosition !== 'select position') {
          updateLabelPositionClass(oldParentNode, groupLabelPosition);
        }
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
        if (child.data('topoViewerRole') !== 'dummyChild') {
          child.move({ parent: null });
        }
      });
      const dummyChild = parentNode.children('[topoViewerRole = "dummyChild"]');
      parentNode.remove();
      if (dummyChild && !dummyChild.empty()) {
        dummyChild.remove();
      }
      const nodeEditorParentPanel = document.getElementById('panel-node-editor-parent');
      if (nodeEditorParentPanel) {
        nodeEditorParentPanel.style.display = 'none';
      } else {
        log.warn('Node editor parent panel element not found');
      }
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

      // Unparent all children except dummy children
      const children = parentNode.children();
      children.forEach(child => {
        if (child.data('topoViewerRole') !== 'dummyChild') {
          child.move({ parent: null });
        }
      });

      // Remove dummy children
      const dummyChildren = parentNode.children('[topoViewerRole = "dummyChild"]');
      dummyChildren.forEach(dummyChild => {
        dummyChild.remove();
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

      log.info(`Group '${groupId}' removed successfully`);
      return true;
    } catch (error) {
      log.error(`Error in directGroupRemoval: ${error}`);
      return false;
    }
  }

  public viewportButtonsAddGroup(): void {
    this.createNewParent({ createDummyChild: true });
  }
}

/**
 * @deprecated Use {@link ManagerGroupManagement} instead.
 * Retained for backwards compatibility and will be removed in a future release.
 */
export class ManagerGroupManagemetn extends ManagerGroupManagement {
  constructor(...args: ConstructorParameters<typeof ManagerGroupManagement>) {
    // Warn at runtime when deprecated alias is used
    console.warn('ManagerGroupManagemetn is deprecated. Use ManagerGroupManagement instead.');
    super(...args);
  }
}

