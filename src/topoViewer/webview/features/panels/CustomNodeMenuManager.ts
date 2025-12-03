import cytoscape from 'cytoscape';
import { log } from '../../platform/logging/logger';
import { VscodeMessageSender } from '../../platform/messaging/VscodeMessaging';
import { ManagerNodeEditor } from '../node-editor/NodeEditorManager';

// Constants for custom node editor
const TEMP_CUSTOM_ID = 'temp-custom-node' as const;
const EDIT_CUSTOM_ID = 'edit-custom-node' as const;
const DEFAULT_ROLE_PE = 'pe' as const;
const DEFAULT_KIND_SR = 'nokia_srlinux' as const;

/**
 * Callbacks for UI updates that the parent component can provide
 */
export interface CustomNodeMenuCallbacks {
  // eslint-disable-next-line no-unused-vars
  showError: (message: string) => Promise<void>;
  refreshAddNodeMenu: () => void;
}

/**
 * CustomNodeMenuManager handles custom node dropdown menu interactions:
 * - Creating new custom node templates
 * - Editing existing custom node templates
 * - Deleting custom node templates
 * - Setting default custom node
 * - Building custom node menu items
 */
export class CustomNodeMenuManager {
  private messageSender: VscodeMessageSender;
  private callbacks: CustomNodeMenuCallbacks;
  private nodeEditor: ManagerNodeEditor | null = null;

  constructor(
    messageSender: VscodeMessageSender,
    callbacks: CustomNodeMenuCallbacks,
    nodeEditor?: ManagerNodeEditor
  ) {
    this.messageSender = messageSender;
    this.callbacks = callbacks;
    this.nodeEditor = nodeEditor || null;
  }

  /**
   * Set the node editor reference
   */
  public setNodeEditor(nodeEditor: ManagerNodeEditor | null): void {
    this.nodeEditor = nodeEditor;
  }

  /**
   * Handle adding a node from a template
   */
  public handleAddNodeTemplate(
    template: any,
    // eslint-disable-next-line no-unused-vars
    addNodeAtCenter: (template?: any) => void
  ): void {
    addNodeAtCenter(template);
  }

  /**
   * Handle creating a new custom node template
   */
  public handleCreateCustomNode(): void {
    if (!this.nodeEditor) {
      log.error('NodeEditor not available for custom node creation');
      return;
    }

    // Create a temporary node data for the form
    const tempNodeData = {
      id: TEMP_CUSTOM_ID,
      name: TEMP_CUSTOM_ID,
      topoViewerRole: (window as any).defaultKind === DEFAULT_KIND_SR ? 'router' : DEFAULT_ROLE_PE,
      iconColor: undefined,
      iconCornerRadius: undefined,
      extraData: {
        kind: (window as any).defaultKind || DEFAULT_KIND_SR,
        type: (window as any).defaultType || '',
        image: ''
      }
    };

    // Create a mock node object for the editor
    const mockNode = this.createMockNodeForEditor(tempNodeData);

    void this.nodeEditor.open(mockNode as any);

    // Focus on the custom node name field after a short delay
    setTimeout(() => {
      const input = document.getElementById('node-custom-name') as HTMLInputElement | null;
      input?.focus();
    }, 150);
  }

  /**
   * Handle editing an existing custom node template
   */
  public async handleEditCustomNode(customNode: any): Promise<void> {
    if (!this.nodeEditor) {
      log.error('NodeEditor not available for custom node editing');
      return;
    }

    // Create a temporary node data with the custom node's properties
    const tempNodeData = {
      id: EDIT_CUSTOM_ID,
      name: EDIT_CUSTOM_ID,
      topoViewerRole: customNode.icon || DEFAULT_ROLE_PE,
      iconColor: customNode.iconColor,
      iconCornerRadius: customNode.iconCornerRadius,
      extraData: {
        kind: customNode.kind,
        type: customNode.type,
        image: customNode.image,
        icon: customNode.icon || DEFAULT_ROLE_PE,
        iconColor: customNode.iconColor,
        iconCornerRadius: customNode.iconCornerRadius,
        // Include any other properties from the custom node
        ...Object.fromEntries(
          Object.entries(customNode).filter(([key]) =>
            !['name', 'kind', 'type', 'image', 'setDefault', 'icon', 'iconColor', 'iconCornerRadius'].includes(key)
          )
        ),
        // Mark this as editing an existing custom node
        editingCustomNodeName: customNode.name
      }
    };

    // Create a mock node object for the editor
    const mockNode = this.createMockNodeForEditor(tempNodeData);

    try {
      await this.nodeEditor.open(mockNode as any);
      this.populateCustomNodeEditorFields(customNode);
    } catch (err) {
      log.error(`Failed to open custom node editor: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Handle deleting a custom node template
   */
  public async handleDeleteCustomNode(nodeName: string): Promise<void> {
    try {
      const payload = { name: nodeName };
      const resp = await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-delete-custom-node',
        payload
      );

      if (resp?.customNodes) {
        (window as any).customNodes = resp.customNodes;
      }
      if (resp?.defaultNode !== undefined) {
        (window as any).defaultNode = resp.defaultNode;
      }

      this.callbacks.refreshAddNodeMenu();
      log.info(`Deleted custom node: ${nodeName}`);
    } catch (err) {
      log.error(`Failed to delete custom node: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Handle setting a custom node as default
   */
  public async handleSetDefaultCustomNode(
    nodeName: string,
    onSuccess: () => void
  ): Promise<void> {
    try {
      const resp = await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-set-default-custom-node',
        { name: nodeName }
      );

      if (resp?.customNodes) {
        (window as any).customNodes = resp.customNodes;
      }
      if (resp?.defaultNode !== undefined) {
        (window as any).defaultNode = resp.defaultNode;
      }

      onSuccess();
      log.info(`Set default custom node: ${nodeName}`);
    } catch (err) {
      log.error(`Failed to set default custom node: ${err instanceof Error ? err.message : String(err)}`);
      await this.callbacks.showError('Failed to set default custom node');
    }
  }

  /**
   * Create a custom node menu item element
   */
  public createCustomNodeMenuItem(
    menu: HTMLElement,
    allItems: { element: HTMLElement; label: string; isDefault?: boolean }[],
    node: any,
    instance: any,
    // eslint-disable-next-line no-unused-vars
    onAddNodeTemplate: (node: any) => void,
    // eslint-disable-next-line no-unused-vars
    refocusFilterInput: (instance: any) => void
  ): void {
    const item = document.createElement('div');
    item.className = 'add-node-menu-item filterable-item';

    const isDefault = node.setDefault === true;
    const labelText = isDefault ? `${node.name} (default)` : node.name;

    const btn = document.createElement('button');
    btn.textContent = labelText;
    btn.className = 'flex-1 text-left bg-transparent border-none cursor-pointer';
    btn.style.color = 'inherit';
    btn.style.fontFamily = 'inherit';
    btn.style.fontSize = 'inherit';
    if (isDefault) {
      btn.style.fontWeight = '600';
    }
    btn.addEventListener('click', () => {
      onAddNodeTemplate(node);
      refocusFilterInput(instance);
    });

    const defaultBtn = document.createElement('button');
    defaultBtn.innerHTML = isDefault ? '★' : '☆';
    defaultBtn.className = 'add-node-default-btn';
    if (isDefault) {
      defaultBtn.classList.add('is-default');
      defaultBtn.title = 'Default node';
      defaultBtn.setAttribute('aria-pressed', 'true');
    } else {
      defaultBtn.title = 'Set as default node';
      defaultBtn.setAttribute('aria-pressed', 'false');
    }
    defaultBtn.type = 'button';
    defaultBtn.setAttribute('aria-label', isDefault ? 'Default node' : 'Set as default node');
    defaultBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isDefault) {
        return;
      }
      await this.handleSetDefaultCustomNode(node.name, () => {
        // Rebuild menu content on success
        instance.setContent(instance._buildMenuContent?.(instance) || '');
      });
    });

    const editBtn = document.createElement('button');
    editBtn.innerHTML = '✎';
    editBtn.className = 'add-node-edit-btn';
    editBtn.title = 'Edit custom node';
    editBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.handleEditCustomNode(node);
      instance.hide();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '×';
    deleteBtn.className = 'add-node-delete-btn';
    deleteBtn.title = 'Delete custom node';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.handleDeleteCustomNode(node.name);
      instance.setContent(instance._buildMenuContent?.(instance) || '');
    });

    item.appendChild(btn);
    item.appendChild(defaultBtn);
    item.appendChild(editBtn);
    item.appendChild(deleteBtn);
    menu.appendChild(item);
    allItems.push({ element: item, label: labelText.toLowerCase() });
  }

  /**
   * Populate the custom node editor fields when editing
   */
  private populateCustomNodeEditorFields(customNode: any): void {
    this.setInputValueIfPresent('node-custom-name', customNode.name, true);
    this.setInputValueIfPresent('node-base-name', customNode.baseName, false);
    this.setInputValueIfPresent('node-interface-pattern', customNode.interfacePattern ?? '', true);
    this.setCheckboxIfPresent('node-custom-default', Boolean(customNode.setDefault));
  }

  private setInputValueIfPresent(elementId: string, value: string | undefined, always: boolean): void {
    const el = document.getElementById(elementId) as HTMLInputElement | null;
    if (!el) return;
    if (value !== undefined || always) {
      el.value = value ?? '';
    }
  }

  private setCheckboxIfPresent(elementId: string, checked: boolean): void {
    const el = document.getElementById(elementId) as HTMLInputElement | null;
    if (!el) return;
    el.checked = checked;
  }

  /**
   * Create a mock node for the editor
   */
  private createMockNodeForEditor(initialData: any): cytoscape.NodeSingular {
    const store = initialData;
    const resolveId = (): string => {
      if (typeof store.id === 'string' && store.id) return store.id;
      if (typeof store.name === 'string' && store.name) return store.name;
      return '';
    };
    const emptyCollection = { nonempty: () => false } as unknown as cytoscape.NodeCollection;

    const mock: Partial<cytoscape.NodeSingular> = {
      id: () => resolveId(),
      data: (field?: any, value?: any) => {
        if (typeof field === 'undefined') {
          return store;
        }
        if (typeof field === 'string') {
          if (typeof value === 'undefined') {
            return store[field];
          }
          store[field] = value;
          return value;
        }
        if (field && typeof field === 'object') {
          Object.assign(store, field);
          return store;
        }
        return store;
      },
      parent: () => emptyCollection
    };
    return mock as cytoscape.NodeSingular;
  }
}
