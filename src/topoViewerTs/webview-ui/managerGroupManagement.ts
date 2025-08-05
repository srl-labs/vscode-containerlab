// file: managerGroupManagement.ts

// Import logger for webview
import { log } from './logger';

// Declarations for global variables provided elsewhere in the webview
/* eslint-disable no-unused-vars */
declare const cy: any;
declare function acquireVsCodeApi(): any;
declare function sendMessageToVscodeEndpointPost(_endpoint: string, _data: any): Promise<any>;
/* eslint-enable no-unused-vars */

// Type definitions for better type safety
interface NodeExtraData {
  clabServerUsername: string;
  weight: string;
  name: string;
  topoViewerGroup: string;
  topoViewerGroupLevel: string;
}

interface ParentNodeData {
  id: string;
  name: string;
  weight: string;
  topoViewerRole: string;
  extraData: NodeExtraData;
  parent?: string;
}

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
  nodeToReparent?: any;
  createDummyChild?: boolean;
}

/**
 * Orphans a given node by removing it from its current parent.
 *
 * If the node's former parent becomes childless as a result of this operation,
 * the former parent node is removed from the Cytoscape instance.
 *
 * @param node - The Cytoscape node to orphan.
 */
export function orphaningNode(node: any): void {
  const currentParentId = node.parent().id();
  const formerParentNode = cy.getElementById(currentParentId);

  node.move({ parent: null }); // Orphan the child node

  if (formerParentNode.isChildless()) {
    log.info('Removing empty parent node');
    formerParentNode.remove(); // Remove the empty parent node
  }
}

/**
 * Creates a new parent node.
 *
 * @param options - Configuration options for creating the parent
 * @param options.nodeToReparent - A node to move under the new parent.
 * @param options.createDummyChild - Whether to add a dummy child node.
 * @returns The unique ID of the newly created parent.
 */
export function createNewParent(options: CreateNewParentOptions = {}): string {
  const { nodeToReparent = null, createDummyChild = false } = options;

  // Generate a unique parent ID
  let counter = 1;
  let newParentId = `groupName${(cy.nodes().length + counter)}:1`;
  while (cy.getElementById(newParentId).length > 0) {
    counter++;
    newParentId = `groupName${(cy.nodes().length + counter)}:1`;
  }
  log.debug(`Generated unique parent ID: ${newParentId}`);

  // Get the current viewport bounds in model coordinates
  const ext = cy.extent();

  // Define boundaries for the random offset
  const offsetMin = 10;  // minimum offset from the top edge
  const offsetMax = 50;  // maximum offset from the top edge

  // Generate a random offset between offsetMin and offsetMax
  const randomOffset = Math.random() * (offsetMax - offsetMin) + offsetMin;

  // Calculate the horizontal left of the viewport
  const topCenterX = (ext.x1 + ext.x2 + randomOffset) / 2;

  // Calculate the top center Y position using the random offset
  const topCenterY = ext.y1 + (2 * randomOffset);

  // Build the parent node data
  const parentNodeData: NodeOptions = {
    group: 'nodes',
    data: {
      id: newParentId,
      name: newParentId.split(":")[0],
      weight: "1000",
      topoViewerRole: "group",
      extraData: {
        clabServerUsername: "asad",
        weight: "2",
        name: "",
        topoViewerGroup: newParentId.split(":")[0],
        topoViewerGroupLevel: newParentId.split(":")[1]
      }
    },
    position: {
      x: topCenterX,
      y: topCenterY
    },
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes: ""
  };

  // Build an array of elements to add
  const nodesToAdd: NodeOptions[] = [parentNodeData];

  // Optionally, add a dummy child node
  if (createDummyChild) {
    nodesToAdd.push({
      group: 'nodes',
      data: {
        id: `${newParentId}:dummyChild`,
        parent: newParentId,
        topoViewerRole: "dummyChild"
      },
      removed: false,
      selected: false,
      selectable: false,
      locked: false,
      position: {
        x: topCenterX,
        y: topCenterY
      },
      grabbed: false,
      grabbable: false,
      classes: 'dummy'
    });
  }

  // Add the nodes to the Cytoscape instance
  cy.add(nodesToAdd);

  // If a node was provided to reparent, move it under the new parent
  if (nodeToReparent) {
    nodeToReparent.move({ parent: newParentId });
    nodeToReparent.data('parent', newParentId);
  }

  // Update the node editor panel UI if present
  const nodeEditorParentPanel = document.getElementById("panel-node-editor-parent");
  if (nodeEditorParentPanel) {
    nodeEditorParentPanel.style.display = "block";
    const groupIdEl = document.getElementById("panel-node-editor-parent-graph-group-id");
    const groupEl = document.getElementById("panel-node-editor-parent-graph-group") as HTMLInputElement;
    const levelEl = document.getElementById("panel-node-editor-parent-graph-level") as HTMLInputElement;

    if (groupIdEl) groupIdEl.textContent = newParentId;
    if (groupEl) groupEl.value = newParentId.split(":")[0];
    if (levelEl) levelEl.value = newParentId.split(":")[1];
  }

  return newParentId;
}

/**
 * Enable box selection and additive selection using the mouse wheel.
 * This mirrors the behaviour of the legacy implementation where users could
 * select multiple elements by dragging with the wheel/shift key.
 */
export function initializeWheelSelection(): void {
  try {
    cy.boxSelectionEnabled(true);
    cy.selectionType('additive');
  } catch (error) {
    log.error(`initializeWheelSelection failed: ${error}`);
  }
}

/**
 * Register handlers related to group management such as dragging nodes into
 * groups and removing empty groups.
 */
export function initializeGroupManagement(): void {
  try {
    const isNodeInsideParent = (node: any, parent: any): boolean => {
      const parentBox = parent.boundingBox();
      const nodePos = node.position();
      return (
        nodePos.x >= parentBox.x1 &&
        nodePos.x <= parentBox.x2 &&
        nodePos.y >= parentBox.y1 &&
        nodePos.y <= parentBox.y2
      );
    };

    cy.on('dragfree', 'node', (event: any) => {
      const draggedNode = event.target;

      let assignedParent: any = null;
      cy.nodes(':parent').forEach((parent: any) => {
        if (isNodeInsideParent(draggedNode, parent)) {
          assignedParent = parent;
        }
      });

      if (assignedParent) {
        draggedNode.move({ parent: assignedParent.id() });
        log.info(`${draggedNode.id()} became a child of ${assignedParent.id()}`);

        const dummyChild = assignedParent.children('[topoViewerRole = "dummyChild"]');
        if (dummyChild && dummyChild.length > 0) {
          const realChildren = assignedParent.children().not(dummyChild);
          if (realChildren.length > 0) {
            dummyChild.remove();
            log.debug('Dummy child removed');
          }
        }
      }

      const parentNodes = cy.nodes('[topoViewerRole = "group"]');
      parentNodes.forEach((parentNode: any) => {
        if (parentNode.children().empty()) {
          parentNode.remove();
        }
      });
    });
  } catch (error) {
    log.error(`initializeGroupManagement failed: ${error}`);
  }
}

/**
 * Display the parent properties panel for a given group node.
 * @param node - Cytoscape node representing the group
 */
export function showPanelGroupEditor(node: any): void {
  try {
    const panel = document.getElementById('panel-node-editor-parent');
    if (!panel) {
      log.warn('Group editor panel element not found');
      return;
    }

    panel.style.display = 'block';

    const currentParentId = node.id();
    const groupIdEl = document.getElementById('panel-node-editor-parent-graph-group-id');
    const groupEl = document.getElementById('panel-node-editor-parent-graph-group') as HTMLInputElement;
    const levelEl = document.getElementById('panel-node-editor-parent-graph-level') as HTMLInputElement;

    if (groupIdEl) {
      groupIdEl.textContent = currentParentId;
    }
    if (groupEl) {
      groupEl.value = currentParentId.split(':')[0];
    }
    if (levelEl) {
      levelEl.value = currentParentId.split(':')[1];
    }
  } catch (error) {
    log.error(`showPanelGroupEditor failed: ${error}`);
  }
}

/**
 * Toggles the panel node editor parent dropdown.
 *
 * This function toggles the dropdown's active state. If the click event listeners
 * on the dropdown items haven't been attached yet, it binds them so that when an item
 * is clicked, its text is used to update the dropdown button and the dropdown is closed.
 */
export function panelNodeEditorParentToggleDropdown(): void {
  // Grab the dropdown container
  const dropdown = document.getElementById('panel-node-editor-parent-label-dropdown') as HTMLElement & { dataset: DOMStringMap };

  if (!dropdown) {
    log.error('Dropdown element not found');
    return;
  }

  // Attach event listeners ONLY once
  // (check a custom data attribute so we don't attach multiple times)
  if (!dropdown.dataset.listenersAttached) {
    // Find all dropdown items
    const items = document.querySelectorAll('#panel-node-editor-parent-label-dropdown-menu .dropdown-item');
    items.forEach(item => {
      item.addEventListener('click', function (this: HTMLElement, event: Event) {
        event.preventDefault();
        // 1. Get the selected text
        const selectedText = (this as HTMLElement).textContent || '';

        // 2. Update the button text
        const buttonTextEl = document.getElementById('panel-node-editor-parent-label-dropdown-button-text');
        if (buttonTextEl) {
          buttonTextEl.textContent = selectedText;
        }

        // 3. Close the dropdown
        dropdown.classList.remove('is-active');
      });
    });

    // Mark that we've attached listeners so we don't do it again
    dropdown.dataset.listenersAttached = 'true';
  }

  // Finally, toggle the dropdown open/closed
  dropdown.classList.toggle('is-active');
}

/**
 * Updates the properties of a parent node based on user input.
 * This includes changing the group name, level, and label position.
 */
export async function nodeParentPropertiesUpdate(): Promise<void> {
  try {
    // Retrieve required UI elements
    const parentIdEl = document.getElementById("panel-node-editor-parent-graph-group-id");
    const groupInputEl = document.getElementById("panel-node-editor-parent-graph-group") as HTMLInputElement;
    const levelInputEl = document.getElementById("panel-node-editor-parent-graph-level") as HTMLInputElement;
    const labelPositionEl = document.getElementById("panel-node-editor-parent-label-dropdown-button-text");

    // Validate that the required elements exist
    if (!parentIdEl || !groupInputEl || !levelInputEl || !labelPositionEl) {
      const errorMsg = "One or more required UI elements were not found.";
      acquireVsCodeApi().window.showWarningMessage(errorMsg);
      throw new Error(errorMsg);
    }

    // Get the current parent's id and trim whitespace
    const parentNodeId = parentIdEl.textContent?.trim() || '';
    if (!parentNodeId) {
      throw new Error("The parent node ID is empty.");
    }

    // Retrieve the current parent node from Cytoscape
    const oldParentNode = cy.getElementById(parentNodeId);
    if (oldParentNode.empty()) {
      throw new Error(`Parent node with ID "${parentNodeId}" not found in the Cytoscape instance.`);
    }

    // Get new group and level values
    const graphGroup = groupInputEl.value.trim();
    const graphLevel = levelInputEl.value.trim();
    if (!graphGroup || !graphLevel) {
      await sendMessageToVscodeEndpointPost('clab-show-vscode-message', {
        type: 'warning',
        message: 'Graph group or graph level input is empty.'
      });
      throw new Error("Graph group or graph level input is empty.");
    }

    // Construct the new parent id (e.g., "group:level")
    const newParentId = `${graphGroup}:${graphLevel}`;

    // Get and normalize the label position from the UI
    const groupLabelPosition = labelPositionEl.textContent?.trim().toLowerCase() || '';

    // Define the list of valid label position classes (adjust if needed)
    const validLabelClasses = [
      "top-center",
      "top-left",
      "top-right",
      "bottom-center",
      "bottom-left",
      "bottom-right"
    ];

    // Helper function to update the label class on a node
    const updateLabelPositionClass = (node: any, labelPos: string): void => {
      // Remove any existing valid label classes from the node
      validLabelClasses.forEach(cls => {
        if (node.hasClass(cls)) {
          node.removeClass(cls);
        }
      });
      // Only add the new class if it's a valid label position
      if (validLabelClasses.includes(labelPos)) {
        node.addClass(labelPos);
        log.debug(`Applied label position '${labelPos}' to node: ${node.id()}`);
      }
    };

    // Check if only the label position needs to be updated (i.e., new parent is same as current)
    if (parentNodeId === newParentId) {
      if (groupLabelPosition && groupLabelPosition !== "select position") {
        updateLabelPositionClass(oldParentNode, groupLabelPosition);
      }
      log.debug(`No parent node update needed. Parent remains: ${parentNodeId}`);
      return;
    }

    // For a different new parent id, first ensure a node with this id doesn't already exist
    if (!cy.getElementById(newParentId).empty()) {
      throw new Error(`A node with the new parent ID "${newParentId}" already exists.`);
    }

    // Prepare extra data
    const extraData: NodeExtraData = {
      clabServerUsername: "asad",
      weight: "2",
      name: "",
      topoViewerGroup: graphGroup,
      topoViewerGroupLevel: graphLevel
    };

    // Create a new parent node with the new custom identifier
    cy.add({
      group: 'nodes',
      data: {
        id: newParentId,
        name: graphGroup,
        topoViewerRole: "group",
        extraData: extraData
      }
    });

    // Retrieve the newly created parent node
    const newParentNode = cy.getElementById(newParentId);
    if (newParentNode.empty()) {
      throw new Error(`New parent node with ID "${newParentId}" could not be created.`);
    }

    // Reassign all child nodes from the old parent node to the new parent node
    const childNodes = oldParentNode.children();
    childNodes.forEach((childNode: any) => {
      childNode.data('parent', newParentId);
      childNode.move({ parent: newParentId });
      log.debug(`Updated child node: ${childNode.id()}`);
    });

    // Remove the old parent node
    oldParentNode.remove();

    // Update the UI element to display the new parent's identifier
    parentIdEl.textContent = newParentId;

    // Evaluate and apply the label position on the new parent node
    if (groupLabelPosition && groupLabelPosition !== "select position") {
      updateLabelPositionClass(newParentNode, groupLabelPosition);
    }

    log.info(`Parent node updated successfully. New parent ID: ${newParentId}`);
  } catch (error) {
    log.error(`Error in nodeParentPropertiesUpdate: ${error}`);
    // Optionally: display an error notification to the user here.
  }
}

/**
 * Closes the parent properties panel by hiding its UI element.
 *
 * This function attempts to find the DOM element representing the node editor parent panel
 * (with the ID "panel-node-editor-parent"). If found, it sets the element's display style to "none",
 * effectively closing the panel. If the element is not found or an error occurs, it logs an appropriate
 * message to the console.
 *
 * @returns Returns true if the panel was successfully closed, false otherwise.
 */
export function nodeParentPropertiesUpdateClose(): boolean {
  try {
    const nodeEditorParentPanel = document.getElementById("panel-node-editor-parent");
    if (nodeEditorParentPanel) {
      nodeEditorParentPanel.style.display = "none";
      log.info('Node editor parent panel closed successfully');
      return true;
    } else {
      log.warn('Node editor parent panel element not found');
      return false;
    }
  } catch (error) {
    log.error(`Error closing node editor parent panel: ${error}`);
    return false;
  }
}

/**
 * Removes a compound (parent) node from the Cytoscape instance while preserving its child nodes.
 *
 * The function performs the following operations:
 * - Retrieves the parent's ID from a specified DOM element.
 * - Validates the presence of the Cytoscape instance and the parent node.
 * - Reparents all child nodes to the top level (by setting their parent to null).
 * - Removes the parent node from Cytoscape.
 * - Hides the node editor parent panel if it exists.
 *
 * @returns Returns true if the parent node is successfully removed and false if an error occurs.
 *
 * @throws Throws an error if:
 *  - The Cytoscape instance (`cy`) is not available.
 *  - The parent ID DOM element is not found.
 *  - The parent node ID is empty.
 *  - The parent node is not found in the Cytoscape instance.
 */
export function nodeParentRemoval(): boolean {
  try {
    // Verify that the Cytoscape instance is available
    if (typeof cy === "undefined" || typeof cy.getElementById !== "function") {
      throw new Error("Cytoscape instance 'cy' is not available.");
    }

    // Retrieve the UI element containing the parent's ID
    const parentIdEl = document.getElementById("panel-node-editor-parent-graph-group-id");
    if (!parentIdEl) {
      throw new Error("Parent ID element 'panel-node-editor-parent-graph-group-id' not found.");
    }

    // Get the parent's ID and trim any whitespace
    const parentNodeId = parentIdEl.textContent?.trim() || '';
    if (!parentNodeId) {
      throw new Error("The parent node ID is empty.");
    }

    // Retrieve the parent node from Cytoscape
    const parentNode = cy.getElementById(parentNodeId);
    if (!parentNode || parentNode.empty()) {
      throw new Error(`No parent node found with id "${parentNodeId}".`);
    }

    const dummyChild = parentNode.children('[topoViewerRole = "dummyChild"]');
    if (!dummyChild || dummyChild.empty()) {
      throw new Error(`No dummyChild node found with id "${dummyChild}".`);
    }

    // Get all child nodes of the parent
    const children = parentNode.children();
    if (!children) {
      log.warn(`Parent node with id "${parentNodeId}" has no children collection`);
    }

    // Reparent each child node by setting its parent to null
    children.forEach((child: any) => {
      child.move({ parent: null });
    });

    // Remove the parent node and its dummy child
    parentNode.remove();
    dummyChild.remove();
    log.info(`Parent node '${parentNodeId}' removed successfully along with reparenting its children`);

    // Hide the node editor parent panel if it exists
    const nodeEditorParentPanel = document.getElementById("panel-node-editor-parent");
    if (nodeEditorParentPanel) {
      nodeEditorParentPanel.style.display = "none";
    } else {
      log.warn('Node editor parent panel element not found');
    }

    return true;
  } catch (error) {
    log.error(`Error in nodeParentRemoval: ${error}`);
    return false;
  }
}

/**
 * Add a new group to the topology.
 */
export function viewportButtonsAddGroup(): void {
  createNewParent({ createDummyChild: true });
}

// Expose global handlers for HTML usage
(globalThis as any).orphaningNode = orphaningNode;
(globalThis as any).createNewParent = createNewParent;
(globalThis as any).panelNodeEditorParentToggleDropdown = panelNodeEditorParentToggleDropdown;
(globalThis as any).nodeParentPropertiesUpdate = nodeParentPropertiesUpdate;
(globalThis as any).nodeParentPropertiesUpdateClose = nodeParentPropertiesUpdateClose;
(globalThis as any).nodeParentRemoval = nodeParentRemoval;
(globalThis as any).viewportButtonsAddGroup = viewportButtonsAddGroup;
(globalThis as any).showPanelGroupEditor = showPanelGroupEditor;