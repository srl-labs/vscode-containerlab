// file: managerDynamicEntries.ts

import { log } from "../logging/logger";

// CSS classes
const CLASS_DYNAMIC_ENTRY = "dynamic-entry flex items-center gap-2 mt-2" as const;
const CLASS_INPUT_FIELD = "bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5" as const;
const CLASS_DYNAMIC_DELETE_BTN = "dynamic-delete-btn text-red-400 hover:text-red-300 p-1 rounded hover:bg-gray-700" as const;

// Data attributes
const DATA_ATTR_FIELD = "data-field" as const;
const DATA_ATTR_CONTAINER = "data-container" as const;
const DATA_ATTR_ENTRY_ID = "data-entry-id" as const;

// HTML constants
const HTML_TRASH_ICON = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>` as const;

// Container names
const CN_BINDS = "binds" as const;
const CN_ENV = "env" as const;
const CN_ENV_FILES = "env-files" as const;
const CN_LABELS = "labels" as const;
const CN_EXEC = "exec" as const;
const CN_PORTS = "ports" as const;
const CN_DNS_SERVERS = "dns-servers" as const;
const CN_ALIASES = "network-aliases" as const;
const CN_CAP_ADD = "cap-add" as const;
const CN_SYSCTLS = "sysctls" as const;
const CN_DEVICES = "devices" as const;
const CN_SANS = "sans" as const;

// Placeholder constants
const PH_BIND = "/host/path:/container/path" as const;
const PH_ENV_KEY = "KEY" as const;
const PH_VALUE = "value" as const;
const PH_ENV_FILE = "/path/to/.env" as const;
const PH_LABEL_KEY = "label.key" as const;
const PH_LABEL_VALUE = "label value" as const;
const PH_EXEC = "command to execute" as const;
const PH_PORT = "8080:80" as const;
const PH_DNS_SERVER = "8.8.8.8" as const;
const PH_ALIAS = "alias" as const;
const PH_CAP = "NET_ADMIN" as const;
const PH_SYSCTL_KEY = "net.ipv4.ip_forward" as const;
const PH_DEVICE = "/dev/net/tun" as const;
const PH_SAN = "alt.example.com" as const;

// All container names for clearing
const ALL_CONTAINERS = [
  CN_BINDS,
  CN_ENV,
  CN_ENV_FILES,
  CN_LABELS,
  CN_EXEC,
  CN_PORTS,
  CN_DNS_SERVERS,
  CN_ALIASES,
  CN_CAP_ADD,
  CN_SYSCTLS,
  CN_DEVICES,
  CN_SANS
];

/**
 * Interface for component entry handlers
 */
/* eslint-disable no-unused-vars */
export interface ComponentEntryHandlers {
  addComponentEntry: (prefill?: any, options?: { slotType?: "cpm" | "card" }) => void;
  addIntegratedMdaEntry: () => void;
}
/* eslint-enable no-unused-vars */

/**
 * DynamicEntriesManager handles dynamic form entries:
 * - Adding/removing entries for arrays (binds, ports, etc.)
 * - Adding/removing key-value entries (env, labels, sysctls)
 * - Collecting entries from the DOM
 */
export class DynamicEntriesManager {
  private dynamicEntryCounters: Map<string, number> = new Map();
  private componentHandlers: ComponentEntryHandlers | null = null;

  public setComponentHandlers(handlers: ComponentEntryHandlers): void {
    this.componentHandlers = handlers;
  }

  /**
   * Setup handlers for dynamic entry management (binds, env vars, etc.)
   */
  public setupDynamicEntryHandlers(): void {
    // Expose functions globally for onclick handlers in HTML
    (window as any).addBindEntry = () => this.addDynamicEntry(CN_BINDS, PH_BIND);
    (window as any).addEnvEntry = () => this.addDynamicKeyValueEntry(CN_ENV, PH_ENV_KEY, PH_VALUE);
    (window as any).addEnvFileEntry = () => this.addDynamicEntry(CN_ENV_FILES, PH_ENV_FILE);
    (window as any).addLabelEntry = () =>
      this.addDynamicKeyValueEntry(CN_LABELS, PH_LABEL_KEY, PH_LABEL_VALUE);
    (window as any).addExecEntry = () => this.addDynamicEntry(CN_EXEC, PH_EXEC);
    (window as any).addPortEntry = () => this.addDynamicEntry(CN_PORTS, PH_PORT);
    (window as any).addDnsServerEntry = () => this.addDynamicEntry(CN_DNS_SERVERS, PH_DNS_SERVER);
    (window as any).addAliasEntry = () => this.addDynamicEntry(CN_ALIASES, PH_ALIAS);
    (window as any).addCapabilityEntry = () => this.addDynamicEntry(CN_CAP_ADD, PH_CAP);
    (window as any).addSysctlEntry = () =>
      this.addDynamicKeyValueEntry(CN_SYSCTLS, PH_SYSCTL_KEY, PH_VALUE);
    (window as any).addDeviceEntry = () => this.addDynamicEntry(CN_DEVICES, PH_DEVICE);
    (window as any).addSanEntry = () => this.addDynamicEntry(CN_SANS, PH_SAN);

    this.registerComponentEntryHandlers();

    // Register remove entry function globally
    (window as any).removeEntry = (containerName: string, entryId: number) => {
      log.debug(`Global removeEntry called: ${containerName}, ${entryId}`);
      this.removeEntry(containerName, entryId);
      return false; // Prevent default behavior
    };
  }

  private registerComponentEntryHandlers(): void {
    if (!this.componentHandlers) return;

    (window as any).addComponentEntry = () => {
      this.componentHandlers?.addComponentEntry(undefined, { slotType: "card" });
    };
    (window as any).addCpmComponentEntry = () => {
      this.componentHandlers?.addComponentEntry(undefined, { slotType: "cpm" });
    };
    (window as any).addCardComponentEntry = () => {
      this.componentHandlers?.addComponentEntry(undefined, { slotType: "card" });
    };
    (window as any).addIntegratedMdaEntry = () => {
      this.componentHandlers?.addIntegratedMdaEntry();
    };
  }

  /**
   * Remove a dynamic entry from the DOM (without saving)
   */
  public removeEntry(containerName: string, entryId: number): void {
    log.debug(`Removing entry: ${containerName}-entry-${entryId}`);
    const entry = document.getElementById(`${containerName}-entry-${entryId}`);
    if (entry) {
      entry.remove();
      log.debug(`Entry removed from DOM`);
    } else {
      log.error(`Entry not found: ${containerName}-entry-${entryId}`);
    }
  }

  /**
   * Add a dynamic entry field for array-based properties
   */
  public addDynamicEntry(containerName: string, placeholder: string): void {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return;

    const count = (this.dynamicEntryCounters.get(containerName) || 0) + 1;
    this.dynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement("div");
    entryDiv.className = CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `${containerName}-entry-${count}`;

    const input = document.createElement("input");
    input.type = "text";
    input.className = CLASS_INPUT_FIELD;
    input.placeholder = placeholder;
    input.setAttribute(DATA_ATTR_FIELD, containerName);

    const button = document.createElement("button");
    button.type = "button"; // Prevent form submission
    button.className = CLASS_DYNAMIC_DELETE_BTN;
    button.setAttribute(DATA_ATTR_CONTAINER, containerName);
    button.setAttribute(DATA_ATTR_ENTRY_ID, count.toString());
    button.innerHTML = HTML_TRASH_ICON;

    entryDiv.appendChild(input);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Add a dynamic key-value entry field for object-based properties
   */
  public addDynamicKeyValueEntry(
    containerName: string,
    keyPlaceholder: string,
    valuePlaceholder: string
  ): void {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return;

    const count = (this.dynamicEntryCounters.get(containerName) || 0) + 1;
    this.dynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement("div");
    entryDiv.className = CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `${containerName}-entry-${count}`;

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = CLASS_INPUT_FIELD;
    keyInput.placeholder = keyPlaceholder;
    keyInput.setAttribute(DATA_ATTR_FIELD, `${containerName}-key`);

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = CLASS_INPUT_FIELD;
    valueInput.placeholder = valuePlaceholder;
    valueInput.setAttribute(DATA_ATTR_FIELD, `${containerName}-value`);

    const button = document.createElement("button");
    button.type = "button"; // Prevent form submission
    button.className = CLASS_DYNAMIC_DELETE_BTN;
    button.setAttribute(DATA_ATTR_CONTAINER, containerName);
    button.setAttribute(DATA_ATTR_ENTRY_ID, count.toString());
    button.innerHTML = HTML_TRASH_ICON;

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Add a dynamic entry with a pre-filled value
   */
  public addDynamicEntryWithValue(
    containerName: string,
    value: string,
    placeholder: string
  ): void {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return;

    const count = (this.dynamicEntryCounters.get(containerName) || 0) + 1;
    this.dynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement("div");
    entryDiv.className = CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `${containerName}-entry-${count}`;

    const input = document.createElement("input");
    input.type = "text";
    input.className = CLASS_INPUT_FIELD;
    input.placeholder = placeholder;
    input.value = value;
    input.setAttribute(DATA_ATTR_FIELD, containerName);

    const button = document.createElement("button");
    button.type = "button";
    button.className = CLASS_DYNAMIC_DELETE_BTN;
    button.setAttribute(DATA_ATTR_CONTAINER, containerName);
    button.setAttribute(DATA_ATTR_ENTRY_ID, count.toString());
    button.innerHTML = HTML_TRASH_ICON;

    entryDiv.appendChild(input);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Add a dynamic key-value entry with pre-filled values
   */
  public addDynamicKeyValueEntryWithValue(containerName: string, key: string, value: string): void {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return;

    const count = (this.dynamicEntryCounters.get(containerName) || 0) + 1;
    this.dynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement("div");
    entryDiv.className = CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `${containerName}-entry-${count}`;

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = CLASS_INPUT_FIELD;
    keyInput.value = key;
    keyInput.setAttribute(DATA_ATTR_FIELD, `${containerName}-key`);

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = CLASS_INPUT_FIELD;
    valueInput.value = value;
    valueInput.setAttribute(DATA_ATTR_FIELD, `${containerName}-value`);

    const button = document.createElement("button");
    button.type = "button";
    button.className = CLASS_DYNAMIC_DELETE_BTN;
    button.setAttribute(DATA_ATTR_CONTAINER, containerName);
    button.setAttribute(DATA_ATTR_ENTRY_ID, count.toString());
    button.innerHTML = HTML_TRASH_ICON;

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Clear all dynamic entry containers
   */
  public clearAllDynamicEntries(): void {
    ALL_CONTAINERS.forEach((name) => {
      const container = document.getElementById(`node-${name}-container`);
      if (container) {
        container.innerHTML = "";
      }
    });

    this.dynamicEntryCounters.clear();
  }

  /**
   * Collect dynamic entries from a container
   */
  public collectDynamicEntries(containerName: string): string[] {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return [];

    const entries: string[] = [];
    const inputs = container.querySelectorAll(`input[${DATA_ATTR_FIELD}="${containerName}"]`);
    inputs.forEach((input) => {
      const value = (input as HTMLInputElement).value.trim();
      if (value) {
        entries.push(value);
      }
    });
    return entries;
  }

  /**
   * Collect dynamic key-value entries from a container
   */
  public collectDynamicKeyValueEntries(containerName: string): Record<string, string> {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return {};

    const entries: Record<string, string> = {};
    const entryDivs = container.querySelectorAll(`.dynamic-entry`);
    entryDivs.forEach((entryDiv) => {
      const keyInput = entryDiv.querySelector(
        `input[${DATA_ATTR_FIELD}="${containerName}-key"]`
      ) as HTMLInputElement | null;
      const valueInput = entryDiv.querySelector(
        `input[${DATA_ATTR_FIELD}="${containerName}-value"]`
      ) as HTMLInputElement | null;
      const key = keyInput?.value.trim();
      const value = valueInput?.value.trim();
      if (key) {
        entries[key] = value || "";
      }
    });
    return entries;
  }

  /**
   * Get placeholder for a container type
   */
  public getPlaceholder(containerName: string): string {
    const placeholders: Record<string, string> = {
      [CN_BINDS]: PH_BIND,
      [CN_ENV_FILES]: PH_ENV_FILE,
      [CN_EXEC]: PH_EXEC,
      [CN_PORTS]: PH_PORT,
      [CN_DNS_SERVERS]: PH_DNS_SERVER,
      [CN_ALIASES]: PH_ALIAS,
      [CN_CAP_ADD]: PH_CAP,
      [CN_DEVICES]: PH_DEVICE,
      [CN_SANS]: PH_SAN
    };
    return placeholders[containerName] || "";
  }

  /**
   * Get key/value placeholders for a container type
   */
  public getKeyValuePlaceholders(containerName: string): { key: string; value: string } {
    const placeholders: Record<string, { key: string; value: string }> = {
      [CN_ENV]: { key: PH_ENV_KEY, value: PH_VALUE },
      [CN_LABELS]: { key: PH_LABEL_KEY, value: PH_LABEL_VALUE },
      [CN_SYSCTLS]: { key: PH_SYSCTL_KEY, value: PH_VALUE }
    };
    return placeholders[containerName] || { key: "", value: "" };
  }
}
