/**
 * Orphans a given node by removing it from its current parent.
 *
 * If the node's former parent becomes childless as a result of this operation,
 * the former parent node is removed from the Cytoscape instance.
 *
 * @param {Object} node - The Cytoscape node to orphan.
 */
function orphaningNode(node) {

  const currentParentId = node.parent().id();
  const formerParentNode = cy.getElementById(currentParentId);

  node.move({ parent: null }); // Orphan the child node

  if (formerParentNode.isChildless()) {
    console.info("Removing empty parent node");
    formerParentNode.remove(); // Remove the empty parent node
  }
}

/**
 * Creates a new parent node.
 *
 * @param {Object} options
 * @param {Object} [options.position={x:0, y:0}] - Position for the new parent.
 * @param {Object|null} [options.nodeToReparent=null] - A node to move under the new parent.
 * @param {boolean} [options.createDummyChild=false] - Whether to add a dummy child node.
 * @returns {string} newParentId - The unique ID of the newly created parent.
 */
function createNewParent({ nodeToReparent = null, createDummyChild = false } = {}) {
  // Generate a unique parent ID
  let counter = 1;
  let newParentId = `groupName${(cy.nodes().length + counter)}:1`;
  while (cy.getElementById(newParentId).length > 0) {
    counter++;
    newParentId = `groupName${(cy.nodes().length + counter)}:1`;
  }
  console.log("Unique Parent ID:", newParentId);

  // Build the parent node data
  const parentNodeData = {
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
    position: "",
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes: ""
  };

  // Build an array of elements to add
  const nodesToAdd = [parentNodeData];

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
    document.getElementById("panel-node-editor-parent-graph-group-id").textContent = newParentId;
    document.getElementById("panel-node-editor-parent-graph-group").value = newParentId.split(":")[0];
    document.getElementById("panel-node-editor-parent-graph-level").value = newParentId.split(":")[1];
  }

  return newParentId;
}


/**
 * Toggles the panel node editor parent dropdown.
 *
 * This function toggles the dropdown's active state. If the click event listeners
 * on the dropdown items haven't been attached yet, it binds them so that when an item
 * is clicked, its text is used to update the dropdown button and the dropdown is closed.
 */
function panelNodeEditorParentToggleDropdown() {
  // Grab the dropdown container
  const dropdown = document.getElementById('panel-node-editor-parent-label-dropdown');

  // Attach event listeners ONLY once
  // (check a custom data attribute so we don't attach multiple times)
  if (!dropdown.dataset.listenersAttached) {
    // Find all dropdown items
    const items = document.querySelectorAll('#panel-node-editor-parent-label-dropdown-menu .dropdown-item');
    items.forEach(item => {
      item.addEventListener('click', function (event) {
        event.preventDefault();
        // 1. Get the selected text
        const selectedText = this.textContent;

        // 2. Update the button text
        document.getElementById('panel-node-editor-parent-label-dropdown-button-text').textContent = selectedText;

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


async function nodeParentPropertiesUpdate() {
  try {
    // Retrieve required UI elements
    const parentIdEl = document.getElementById("panel-node-editor-parent-graph-group-id");
    const groupInputEl = document.getElementById("panel-node-editor-parent-graph-group");
    const levelInputEl = document.getElementById("panel-node-editor-parent-graph-level");
    const labelPositionEl = document.getElementById("panel-node-editor-parent-label-dropdown-button-text");

    // Validate that the required elements exist
    if (!parentIdEl || !groupInputEl || !levelInputEl || !labelPositionEl) {
      const errorMsg = "One or more required UI elements were not found.";
      acquireVsCodeApi().window.showWarningMessage(errorMsg);
      throw new Error(errorMsg);
    }

    // Get the current parent's id and trim whitespace
    const parentNodeId = parentIdEl.textContent.trim();
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
    let groupLabelPosition = labelPositionEl.textContent.trim().toLowerCase();

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
    const updateLabelPositionClass = (node, labelPos) => {
      // Remove any existing valid label classes from the node
      validLabelClasses.forEach(cls => {
        if (node.hasClass(cls)) {
          node.removeClass(cls);
        }
      });
      // Only add the new class if it's a valid label position
      if (validLabelClasses.includes(labelPos)) {
        node.addClass(labelPos);
        console.log(`Label position '${labelPos}' applied to node: ${node.id()}`);
      }
    };

    // Check if only the label position needs to be updated (i.e., new parent is same as current)
    if (parentNodeId === newParentId) {
      if (groupLabelPosition && groupLabelPosition !== "select position") {
        updateLabelPositionClass(oldParentNode, groupLabelPosition);
      }
      console.log(`No parent node update needed. Parent node remains: ${parentNodeId}`);
      return;
    }

    // For a different new parent id, first ensure a node with this id doesn't already exist
    if (!cy.getElementById(newParentId).empty()) {
      throw new Error(`A node with the new parent ID "${newParentId}" already exists.`);
    }

    // Prepare extra data
    const extraData = {
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
    childNodes.forEach(childNode => {
      childNode.data('parent', newParentId);
      childNode.move({ parent: newParentId });
      console.log('Updated child node data:', childNode.data());
    });

    // Remove the old parent node
    oldParentNode.remove();

    // Update the UI element to display the new parent's identifier
    parentIdEl.textContent = newParentId;

    // Evaluate and apply the label position on the new parent node
    if (groupLabelPosition && groupLabelPosition !== "select position") {
      updateLabelPositionClass(newParentNode, groupLabelPosition);
    }

    console.log(`Parent node updated successfully. New parent ID: ${newParentId}`);
  } catch (error) {
    console.error("Error in nodeParentPropertiesUpdate:", error);
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
 * @returns {boolean} Returns true if the panel was successfully closed, false otherwise.
 */
function nodeParentPropertiesUpdateClose() {
  try {
    const nodeEditorParentPanel = document.getElementById("panel-node-editor-parent");
    if (nodeEditorParentPanel) {
      nodeEditorParentPanel.style.display = "none";
      console.info("Node editor parent panel closed successfully.");
      return true;
    } else {
      console.warn("Node editor parent panel element not found.");
      return false;
    }
  } catch (error) {
    console.error("Error closing node editor parent panel:", error);
    return false;
  }
}



/**
 * Removes a compound (parent) node from the Cytoscape instance while preserving its child nodes.
 *
 * <p>
 * The function performs the following operations:
 * <ol>
 *   <li>Retrieves the parent's ID from a specified DOM element.</li>
 *   <li>Validates the presence of the Cytoscape instance and the parent node.</li>
 *   <li>Reparents all child nodes to the top level (by setting their parent to null).</li>
 *   <li>Removes the parent node from Cytoscape.</li>
 *   <li>Hides the node editor parent panel if it exists.</li>
 * </ol>
 * </p>
 *
 * @returns {boolean} Returns true if the parent node is successfully removed and false if an error occurs.
 *
 * @throws {Error} Throws an error if:
 *  - The Cytoscape instance (`cy`) is not available.
 *  - The parent ID DOM element is not found.
 *  - The parent node ID is empty.
 *  - The parent node is not found in the Cytoscape instance.
 */
function nodeParentRemoval() {
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
    const parentNodeId = parentIdEl.textContent.trim();
    if (!parentNodeId) {
      throw new Error("The parent node ID is empty.");
    }

    // Retrieve the parent node from Cytoscape
    const parentNode = cy.getElementById(parentNodeId);
    if (!parentNode || parentNode.empty()) {
      throw new Error(`No parent node found with id "${parentNodeId}".`);
    }

    // Get all child nodes of the parent
    const children = parentNode.children();
    if (!children) {
      console.warn(`Parent node with id "${parentNodeId}" has no children collection.`);
    }

    // Reparent each child node by setting its parent to null
    children.forEach(child => {
      child.move({ parent: null });
    });

    // Remove the parent node
    parentNode.remove();
    console.info(`Parent node "${parentNodeId}" removed successfully along with reparenting its children.`);

    // Hide the node editor parent panel if it exists
    const nodeEditorParentPanel = document.getElementById("panel-node-editor-parent");
    if (nodeEditorParentPanel) {
      nodeEditorParentPanel.style.display = "none";
    } else {
      console.warn("Node editor parent panel element 'panel-node-editor-parent' not found.");
    }

    return true;
  } catch (error) {
    console.error("Error in nodeParentRemoval:", error);
    return false;
  }
}
