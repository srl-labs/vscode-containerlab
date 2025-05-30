// file: managerGroupManager.ts
import cytoscape from 'cytoscape';

/**
 * Toggles the visibility of the node editor panel.
 *
 * This method checks if the node editor panel is currently visible and toggles its display state.
 * If the panel is visible, it hides it; if hidden, it shows the panel.
 *
 */
export class ManagerGroupManager {
  public panelGroupToggle(newParentId: string): void {
    const panel = document.getElementById("panel-node-editor-parent");
    if (!panel) return;

    panel.style.display = "block";

    const [group, level] = newParentId.split(":");
    const groupIdLabel = document.getElementById("panel-node-editor-parent-graph-group-id");
    const groupInput = document.getElementById("panel-node-editor-parent-graph-group") as HTMLInputElement | null;
    const levelInput = document.getElementById("panel-node-editor-parent-graph-level") as HTMLInputElement | null;

    if (groupIdLabel) groupIdLabel.textContent = newParentId;
    if (groupInput) groupInput.value = group;
    if (levelInput) levelInput.value = level;
  }

  public orphaningNode(cy: cytoscape.Core, node: cytoscape.NodeSingular): void {
    const parentCollection = node.parent();
    const currentParentId = parentCollection.nonempty() ? parentCollection[0].id() : "";
    const formerParentNode = cy.getElementById(currentParentId);
    node.move({ parent: null });
    if (formerParentNode.isChildless()) {
      formerParentNode.remove();
    }
  }

  public createNewParent(
    cy: cytoscape.Core,
    options: { nodeToReparent?: cytoscape.NodeSingular | null; createDummyChild?: boolean } = {}
  ): string {
    const { nodeToReparent = null, createDummyChild = false } = options;

    let counter = 1;
    let newParentId = `groupName${cy.nodes().length + counter}:1`;
    while (cy.getElementById(newParentId).length > 0) {
      counter++;
      newParentId = `groupName${cy.nodes().length + counter}:1`;
    }

    const ext = cy.extent();
    const offset = Math.random() * 40 + 10;
    const position = { x: (ext.x1 + ext.x2 + offset) / 2, y: ext.y1 + 2 * offset };
    const [groupName, groupLevel] = newParentId.split(":");

    const nodes: cytoscape.ElementDefinition[] = [{
      group: 'nodes',
      data: {
        id: newParentId,
        name: groupName,
        weight: "1000",
        topoViewerRole: "group",
        extraData: {
          clabServerUsername: "asad",
          weight: "2",
          name: "",
          topoViewerGroup: groupName,
          topoViewerGroupLevel: groupLevel
        }
      },
      position,
      selectable: true,
      grabbable: true
    }];

    if (createDummyChild) {
      nodes.push({
        group: 'nodes',
        data: {
          id: `${newParentId}:dummyChild`,
          parent: newParentId,
          topoViewerRole: "dummyChild"
        },
        position,
        selectable: false,
        grabbable: false,
        classes: 'dummy'
      });
    }

    cy.add(nodes);
    if (nodeToReparent) nodeToReparent.move({ parent: newParentId });

    this.panelGroupToggle(newParentId);
    return newParentId;
  }

  public panelNodeEditorParentToggleDropdown(): void {
    const dropdown = document.getElementById('panel-node-editor-parent-label-dropdown');
    if (!dropdown) return;

    const items = document.querySelectorAll('#panel-node-editor-parent-label-dropdown-menu .dropdown-item');
    items.forEach(item => {
      item.addEventListener('click', function (this: HTMLElement, event) {
        event.preventDefault();
        const selectedText = this.textContent || "";
        const btnText = document.getElementById('panel-node-editor-parent-label-dropdown-button-text');
        if (btnText) btnText.textContent = selectedText;
        dropdown.classList.remove('is-active');
      });
    });

    dropdown.dataset.listenersAttached = 'true';
    dropdown.classList.toggle('is-active');
  }

  public async nodeParentPropertiesUpdate(cy: cytoscape.Core): Promise<void> {
    const getInput = (id: string): HTMLInputElement =>
      document.getElementById(id) as HTMLInputElement;

    try {
      const parentId = document.getElementById("panel-node-editor-parent-graph-group-id")?.textContent?.trim();
      if (!parentId) throw new Error("Parent ID is empty");

      const group = getInput("panel-node-editor-parent-graph-group").value.trim();
      const level = getInput("panel-node-editor-parent-graph-level").value.trim();
      const pos = document.getElementById("panel-node-editor-parent-label-dropdown-button-text")?.textContent?.trim().toLowerCase();

      const oldNode = cy.getElementById(parentId);
      if (oldNode.empty()) throw new Error(`Parent "${parentId}" not found`);

      const newId = `${group}:${level}`;
      const valid = ["top-center", "top-left", "top-right", "bottom-center", "bottom-left", "bottom-right"];

      if (parentId === newId) {
        if (pos && valid.includes(pos)) valid.forEach(cls => oldNode.removeClass(cls)), oldNode.addClass(pos);
        return;
      }

      if (!cy.getElementById(newId).empty()) throw new Error(`ID "${newId}" exists`);

      cy.add({
        group: 'nodes',
        data: {
          id: newId,
          name: group,
          topoViewerRole: "group",
          extraData: {
            clabServerUsername: "asad",
            weight: "2",
            name: "",
            topoViewerGroup: group,
            topoViewerGroupLevel: level
          }
        }
      });

      const newNode = cy.getElementById(newId);

      // Move all children of the old node to the newly created node
      oldNode.children().forEach(child => {
        child.data('parent', newId);
        child.move({ parent: newId });
      });

      // Remove the old parent group
      oldNode.remove();

      document.getElementById("panel-node-editor-parent-graph-group-id")!.textContent = newId;
      if (pos && valid.includes(pos)) valid.forEach(cls => newNode.removeClass(cls)), newNode.addClass(pos);

    } catch (error) {
      console.error("Update failed:", error);
    }
  }

  public nodeParentPropertiesClose(): boolean {
    const panel = document.getElementById("panel-node-editor-parent");
    if (panel) {
      panel.style.display = "none";
      return true;
    }
    return false;
  }

  public nodeParentRemoval(cy: cytoscape.Core): boolean {
    try {
      const parentIdEl = document.getElementById("panel-node-editor-parent-graph-group-id");
      const parentNodeId = parentIdEl?.textContent?.trim();

      console.log("Removing parent node with ID:", parentNodeId);

      if (!parentNodeId) throw new Error("Empty parent ID");

      const parentNode = cy.getElementById(parentNodeId);
      if (parentNode.empty()) throw new Error(`Parent node "${parentNodeId}" not found.`);

      const dummyChild = parentNode.children('[topoViewerRole = "dummyChild"]');
      const children = parentNode.children();

      children.forEach((child: cytoscape.NodeSingular) => {
        child.move({ parent: null });
      });
      parentNode.remove();
      dummyChild.remove();

      const panel = document.getElementById("panel-node-editor-parent");
      if (panel) panel.style.display = "none";

      return true;
    } catch (err) {
      console.error("Error in nodeParentRemoval:", err);
      return false;
    }
  }
}
