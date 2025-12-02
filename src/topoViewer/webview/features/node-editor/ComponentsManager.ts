// ComponentsManager.ts
// Handles Nokia SRSIM component management (CPM, Card, SFM, MDA, XIOM)

import cytoscape from "cytoscape";
import { createFilterableDropdown } from "../../ui/FilterableDropdown";

// CSS classes and DOM element IDs
const CLASS_HIDDEN = "hidden" as const;
const CLASS_COMPONENT_ENTRY = "component-entry" as const;
const CLASS_COMPONENT_SFM_ENTRY = "component-sfm-entry" as const;
const CLASS_COMPONENT_MDA_ENTRY = "component-mda-entry" as const;
const CLASS_COMPONENT_XIOM_ENTRY = "component-xiom-entry" as const;
const CLASS_COMPONENT_XIOM_MDA_ENTRY = "component-xiom-mda-entry" as const;
const CLASS_INTEGRATED_MDA_ENTRY = "integrated-mda-entry" as const;
const CLASS_TAB_ACTIVE = "tab-active" as const;
const SELECTOR_COMPONENT_BODY = '[data-role="component-body"]' as const;
const SELECTOR_COMPONENT_CARET = '[data-role="component-caret"]' as const;
const SELECTOR_FORM_GROUP = ".form-group" as const;
const SELECTOR_SFM_VALUE = '[data-role="sfm-value"]' as const;
const SELECTOR_SFM_DROPDOWN = '[data-role="sfm-dropdown"]' as const;
const ICON_CHEVRON_RIGHT = "fa-chevron-right" as const;
const ICON_CHEVRON_DOWN = "fa-chevron-down" as const;
const ATTR_ARIA_HIDDEN = "aria-hidden" as const;

const ID_TAB_COMPONENTS_BUTTON = "tab-components-button" as const;
const ID_TAB_COMPONENTS_CONTENT = "tab-components" as const;
const ID_NODE_COMPONENTS_CONTAINER = "node-components-container" as const;
const ID_NODE_COMPONENTS_CPM_CONTAINER = "node-components-cpm-container" as const;
const ID_NODE_COMPONENTS_CARD_CONTAINER = "node-components-card-container" as const;
const ID_NODE_COMPONENTS_SFM_CONTAINER = "node-components-sfm-container" as const;
const ID_NODE_COMPONENTS_ACTIONS_DISTRIBUTED = "node-components-actions-distributed" as const;
const ID_NODE_COMPONENTS_ACTIONS_INTEGRATED = "node-components-actions-integrated" as const;
const ID_NODE_COMPONENTS_INTEGRATED_SECTION = "node-components-integrated-section" as const;
const ID_NODE_INTEGRATED_MDA_CONTAINER = "node-integrated-mda-container" as const;
const ID_ADD_INTEGRATED_MDA_BUTTON = "btn-add-integrated-mda" as const;
const ID_ADD_CPM_BUTTON = "btn-add-cpm" as const;
const ID_ADD_CARD_BUTTON = "btn-add-card" as const;
const SFM_ENTRY_ID_PREFIX = "sfm-entry-" as const;

const PH_SEARCH_TYPE = "Search for type..." as const;

/**
 * Interface for input/output utility functions needed by ComponentsManager
 */
/* eslint-disable no-unused-vars */
export interface ComponentsManagerUtilities {
  getInputValue: (id: string) => string;
  setInputValue: (id: string, value: string | number) => void;
  extractIndex: (id: string, re: RegExp) => number | null;
  switchToTab: (name: string) => void;
}
/* eslint-enable no-unused-vars */

/**
 * ComponentsManager handles all Nokia SRSIM component functionality:
 * - CPM (Control Processing Module) slots A/B
 * - Card (line card) slots 1-n
 * - SFM (Switch Fabric Module)
 * - MDA (Media Dependent Adapter)
 * - XIOM (Extension I/O Module)
 */
export class ComponentsManager {
  private currentNode: cytoscape.NodeSingular | null = null;
  private utilities: ComponentsManagerUtilities;

  // Component kinds that support the components tab
  private componentKinds: Set<string> = new Set(["nokia_srsim"]);

  // Counters for dynamic entries
  private componentEntryCounter: number = 0;
  private componentMdaCounters: Map<number, number> = new Map();
  private componentXiomCounters: Map<number, number> = new Map();
  private xiomMdaCounters: Map<string, number> = new Map();
  private integratedMdaCounter = 0;

  // Schema-loaded enums
  private srosSfmTypes: string[] = [];
  private srosXiomTypes: string[] = [];
  private srosCpmTypes: string[] = [];
  private srosCardTypes: string[] = [];
  private srosXiomMdaTypes: string[] = [];
  private srosMdaTypes: string[] = [];

  // Integrated mode for simpler Nokia types
  private integratedSrosTypes: Set<string> = new Set(
    ["sr-1", "sr-1s", "ixr-r6", "ixr-ec", "ixr-e2", "ixr-e2c"].map((t) => t.toLowerCase())
  );
  private integratedMode = false;

  // Track expanded slots across refreshes
  private pendingExpandedComponentSlots: Set<string> | undefined;

  constructor(utilities: ComponentsManagerUtilities) {
    this.utilities = utilities;
  }

  public setCurrentNode(node: cytoscape.NodeSingular | null): void {
    this.currentNode = node;
  }

  public isComponentKind(kind: string): boolean {
    return this.componentKinds.has(kind);
  }

  public isIntegratedMode(): boolean {
    return this.integratedMode;
  }

  /**
   * Load component enum values from schema
   */
  public extractComponentEnumsFromSchema(schema: any): void {
    const defs = schema?.definitions || {};
    this.srosSfmTypes = defs["sros-sfm-types"]?.enum || [];
    this.srosXiomTypes = defs["sros-xiom-types"]?.enum || [];
    this.srosCpmTypes = defs["sros-cpm-types"]?.enum || [];
    this.srosCardTypes = defs["sros-card-types"]?.enum || [];
    this.srosXiomMdaTypes = defs["sros-xiom-mda-types"]?.enum || [];
    this.srosMdaTypes = defs["sros-mda-types"]?.enum || [];
  }

  /**
   * Refresh dropdowns with updated enum values after schema load
   */
  public refreshComponentsDropdowns(): void {
    this.refreshComponentEntryDropdowns();
    this.refreshSfmDropdown();
    this.refreshIntegratedMdaDropdowns();
  }

  private refreshComponentEntryDropdowns(): void {
    const containers = this.getComponentContainers();
    if (!containers) return;

    const allEntries = [
      ...Array.from(containers.cpmContainer.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`)),
      ...Array.from(containers.cardContainer.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`))
    ] as HTMLElement[];

    for (const entry of allEntries) {
      const idx = this.utilities.extractIndex(entry.id, /component-entry-(\d+)/);
      if (idx !== null) {
        this.refreshSingleComponentEntry(idx);
      }
    }
  }

  private refreshSingleComponentEntry(idx: number): void {
    this.initComponentTypeDropdown(idx);
    this.refreshMdaDropdownsForComponent(idx);
    this.refreshXiomDropdownsForComponent(idx);
  }

  private refreshMdaDropdownsForComponent(idx: number): void {
    const mdaContainer = document.getElementById(`component-${idx}-mda-container`);
    if (!mdaContainer) return;

    const mdaRows = Array.from(
      mdaContainer.querySelectorAll(`.${CLASS_COMPONENT_MDA_ENTRY}`)
    ) as HTMLElement[];

    for (const row of mdaRows) {
      const mdaId = this.utilities.extractIndex(row.id, /component-\d+-mda-entry-(\d+)/);
      if (mdaId !== null) this.initMdaTypeDropdown(idx, mdaId);
    }
  }

  private refreshXiomDropdownsForComponent(idx: number): void {
    const xiomContainer = document.getElementById(`component-${idx}-xiom-container`);
    if (!xiomContainer) return;

    const xiomRows = Array.from(
      xiomContainer.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)
    ) as HTMLElement[];

    for (const row of xiomRows) {
      const xiomId = this.utilities.extractIndex(row.id, /component-\d+-xiom-entry-(\d+)/);
      if (xiomId !== null) {
        this.initXiomTypeDropdown(idx, xiomId);
        this.refreshXiomMdaDropdowns(idx, xiomId);
      }
    }
  }

  private refreshXiomMdaDropdowns(idx: number, xiomId: number): void {
    const xiomMdaContainer = document.getElementById(
      `component-${idx}-xiom-${xiomId}-mda-container`
    );
    if (!xiomMdaContainer) return;

    const xiomMdaRows = Array.from(
      xiomMdaContainer.querySelectorAll(`.${CLASS_COMPONENT_XIOM_MDA_ENTRY}`)
    ) as HTMLElement[];

    for (const xmRow of xiomMdaRows) {
      const xmId = this.utilities.extractIndex(
        xmRow.id,
        /component-\d+-xiom-\d+-mda-entry-(\d+)/
      );
      if (xmId !== null) this.initXiomMdaTypeDropdown(idx, xiomId, xmId);
    }
  }

  /**
   * Update visibility of Components tab based on kind
   */
  public updateComponentsTabVisibility(kind: string): void {
    const btn = document.getElementById(ID_TAB_COMPONENTS_BUTTON) as HTMLElement | null;
    const content = document.getElementById(ID_TAB_COMPONENTS_CONTENT) as HTMLElement | null;
    if (!btn || !content) return;

    if (this.componentKinds.has(kind)) {
      this.showComponentsTab(btn, content);
      this.updateComponentMode();
      return;
    }
    this.hideComponentsTab(btn, content);
    this.updateComponentMode(false);
  }

  private showComponentsTab(btn: HTMLElement, content: HTMLElement): void {
    btn.classList.remove(CLASS_HIDDEN);
    if (btn.classList.contains(CLASS_TAB_ACTIVE)) {
      content.classList.remove(CLASS_HIDDEN);
    } else {
      content.classList.add(CLASS_HIDDEN);
    }
  }

  private hideComponentsTab(btn: HTMLElement, content: HTMLElement): void {
    if (btn.classList.contains(CLASS_TAB_ACTIVE)) {
      this.utilities.switchToTab("basic");
    }
    btn.classList.add(CLASS_HIDDEN);
    content.classList.add(CLASS_HIDDEN);
  }

  /**
   * Check if the current node type is an integrated SROS type
   */
  public isIntegratedSrosType(kind: string | undefined, type: string | undefined): boolean {
    if (!kind || kind !== "nokia_srsim") return false;
    if (!type) return false;
    return this.integratedSrosTypes.has(type.toLowerCase());
  }

  /**
   * Update component mode based on node type (distributed vs integrated)
   */
  public updateComponentMode(reload = true): void {
    if (!this.currentNode) {
      this.integratedMode = false;
      this.configureComponentSectionsForMode(false, false);
      return;
    }
    const extra = this.currentNode.data("extraData") || {};
    const kind = extra.kind as string | undefined;
    const type = extra.type as string | undefined;
    const integrated = this.isIntegratedSrosType(kind, type);
    const showComponents = this.componentKinds.has(kind ?? "");
    this.integratedMode = integrated;
    this.configureComponentSectionsForMode(showComponents, integrated);
    if (reload) this.loadComponentsFromNode();
  }

  private configureComponentSectionsForMode(showComponents: boolean, integrated: boolean): void {
    const distributedActions = document.getElementById(ID_NODE_COMPONENTS_ACTIONS_DISTRIBUTED);
    const integratedActions = document.getElementById(ID_NODE_COMPONENTS_ACTIONS_INTEGRATED);
    const integratedSection = document.getElementById(ID_NODE_COMPONENTS_INTEGRATED_SECTION);
    const { cpmContainer, cardContainer, sfmContainer } = this.getComponentContainers() || {};

    [distributedActions, cpmContainer, cardContainer, sfmContainer].forEach((el) =>
      el?.classList.toggle(CLASS_HIDDEN, !showComponents || integrated)
    );
    integratedActions?.classList.toggle(CLASS_HIDDEN, !showComponents || !integrated);
    integratedSection?.classList.toggle(CLASS_HIDDEN, !showComponents || !integrated);
  }

  private getComponentContainers(): {
    cpmContainer: HTMLElement;
    cardContainer: HTMLElement;
    sfmContainer: HTMLElement;
  } | null {
    const cpmContainer = document.getElementById(
      ID_NODE_COMPONENTS_CPM_CONTAINER
    ) as HTMLElement | null;
    const cardContainer = document.getElementById(
      ID_NODE_COMPONENTS_CARD_CONTAINER
    ) as HTMLElement | null;
    const sfmContainer = document.getElementById(
      ID_NODE_COMPONENTS_SFM_CONTAINER
    ) as HTMLElement | null;
    if (!cpmContainer || !cardContainer || !sfmContainer) return null;
    return { cpmContainer, cardContainer, sfmContainer };
  }

  /**
   * Load components from the current node's extraData
   */
  public loadComponentsFromNode(expandedSlots?: Set<string>): void {
    if (this.integratedMode) {
      this.resetIntegratedMdaContainer();
      if (!this.currentNode) {
        this.updateIntegratedAddButtonState();
        return;
      }
      const mdas = this.getIntegratedMdasForCurrentNode();
      mdas.forEach((mda) => this.addIntegratedMdaEntry(mda));
      this.updateIntegratedAddButtonState();
      return;
    }

    if (!this.currentNode) return;
    const containers = this.getComponentContainers();
    if (!containers) return;
    this.resetComponentContainers(containers);

    const components = this.getComponentsForCurrentNode();
    this.ensureSfmEntry(components);
    if (components.length === 0) {
      this.updateComponentAddButtonStates();
      return;
    }

    const expandSet = this.resolveExpandedComponentSlots(expandedSlots);
    this.renderComponentEntries(components, expandSet);

    this.updateComponentAddButtonStates();
  }

  private resetComponentContainers(containers: {
    cpmContainer: HTMLElement;
    cardContainer: HTMLElement;
    sfmContainer: HTMLElement;
  }): void {
    const { cpmContainer, cardContainer, sfmContainer } = containers;
    cpmContainer.innerHTML = "";
    cardContainer.innerHTML = "";
    sfmContainer.innerHTML = "";
    this.componentEntryCounter = 0;
    this.componentMdaCounters.clear();
    this.componentXiomCounters.clear();
    this.xiomMdaCounters.clear();
  }

  private resetIntegratedMdaContainer(): void {
    const container = document.getElementById(ID_NODE_INTEGRATED_MDA_CONTAINER);
    if (container) container.innerHTML = "";
    this.integratedMdaCounter = 0;
  }

  private getComponentsForCurrentNode(): any[] {
    if (!this.currentNode) return [];
    const extra = this.currentNode.data("extraData") || {};
    return Array.isArray(extra.components) ? extra.components : [];
  }

  private getIntegratedMdasForCurrentNode(): any[] {
    const components = this.getComponentsForCurrentNode();
    for (const comp of components) {
      if (!comp || typeof comp !== "object") continue;
      if (Array.isArray(comp.mda) && (comp.slot == null || String(comp.slot).trim() === "")) {
        return comp.mda;
      }
    }
    return [];
  }

  // ==================== INTEGRATED MODE ====================

  public addIntegratedMdaEntry(prefill?: any): number {
    const container = document.getElementById(ID_NODE_INTEGRATED_MDA_CONTAINER);
    const tpl = document.getElementById("tpl-integrated-mda-entry") as HTMLTemplateElement | null;
    if (!container || !tpl) return -1;

    const next = this.integratedMdaCounter + 1;
    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const row = frag.querySelector(`.${CLASS_INTEGRATED_MDA_ENTRY}`) as HTMLElement | null;
    if (!row) return -1;

    this.integratedMdaCounter = next;

    row.id = `integrated-mda-entry-${next}`;

    const slot = row.querySelector('[data-role="integrated-mda-slot"]') as HTMLInputElement | null;
    const hiddenType = row.querySelector(
      '[data-role="integrated-mda-type-value"]'
    ) as HTMLInputElement | null;
    const typeDropdown = row.querySelector(
      '[data-role="integrated-mda-type-dropdown"]'
    ) as HTMLElement | null;
    const delBtn = row.querySelector(
      '[data-action="remove-integrated-mda"]'
    ) as HTMLButtonElement | null;

    if (slot) {
      slot.id = `integrated-mda-${next}-slot`;
      slot.value = prefill?.slot != null ? String(prefill.slot) : String(next);
    }

    if (hiddenType) {
      hiddenType.id = `integrated-mda-${next}-type`;
      hiddenType.value = prefill?.type != null ? String(prefill.type) : "";
    }

    if (typeDropdown) {
      typeDropdown.id = `integrated-mda-${next}-type-dropdown`;
    }

    if (delBtn) {
      delBtn.onclick = () => this.removeIntegratedMdaEntry(next);
    }

    container.appendChild(frag);

    this.initIntegratedMdaTypeDropdown(next);
    this.updateIntegratedAddButtonState();
    return next;
  }

  private removeIntegratedMdaEntry(mdaId: number): void {
    const row = document.getElementById(`integrated-mda-entry-${mdaId}`);
    row?.remove();
    this.updateIntegratedAddButtonState();
  }

  private initIntegratedMdaTypeDropdown(mdaId: number): void {
    const initial = this.utilities.getInputValue(`integrated-mda-${mdaId}-type`);
    createFilterableDropdown(
      `integrated-mda-${mdaId}-type-dropdown`,
      this.srosMdaTypes,
      initial,
      (selected: string) => this.utilities.setInputValue(`integrated-mda-${mdaId}-type`, selected),
      PH_SEARCH_TYPE,
      true
    );
  }

  private updateIntegratedAddButtonState(): void {
    const addBtn = document.getElementById(
      ID_ADD_INTEGRATED_MDA_BUTTON
    ) as HTMLButtonElement | null;
    if (!addBtn) return;
    addBtn.disabled = false;
    addBtn.title = "Add an MDA slot";
  }

  public collectIntegratedMdas(): any[] {
    const container = document.getElementById(ID_NODE_INTEGRATED_MDA_CONTAINER);
    if (!container) return [];
    const rows = Array.from(
      container.querySelectorAll(`.${CLASS_INTEGRATED_MDA_ENTRY}`)
    ) as HTMLElement[];
    const list: any[] = [];
    for (const row of rows) {
      const mdaId = this.utilities.extractIndex(row.id, /integrated-mda-entry-(\d+)/);
      if (mdaId === null) continue;
      const slotRaw = this.utilities.getInputValue(`integrated-mda-${mdaId}-slot`).trim();
      const typeVal = this.utilities.getInputValue(`integrated-mda-${mdaId}-type`).trim();
      const mda: any = {};
      if (/^\d+$/.test(slotRaw)) mda.slot = parseInt(slotRaw, 10);
      if (typeVal) mda.type = typeVal;
      if (mda.slot != null && mda.type) list.push(mda);
    }
    return list;
  }

  public commitIntegratedMdaDropdowns(): void {
    const container = document.getElementById(ID_NODE_INTEGRATED_MDA_CONTAINER);
    if (!container) return;
    const rows = Array.from(
      container.querySelectorAll(`.${CLASS_INTEGRATED_MDA_ENTRY}`)
    ) as HTMLElement[];
    for (const row of rows) {
      const mdaId = this.utilities.extractIndex(row.id, /integrated-mda-entry-(\d+)/);
      if (mdaId === null) continue;
      const filter = document.getElementById(
        `integrated-mda-${mdaId}-type-dropdown-filter-input`
      ) as HTMLInputElement | null;
      const hidden = document.getElementById(
        `integrated-mda-${mdaId}-type`
      ) as HTMLInputElement | null;
      if (filter && hidden) hidden.value = filter.value;
    }
  }

  private refreshIntegratedMdaDropdowns(): void {
    const container = document.getElementById(ID_NODE_INTEGRATED_MDA_CONTAINER);
    if (!container) return;
    const rows = Array.from(
      container.querySelectorAll(`.${CLASS_INTEGRATED_MDA_ENTRY}`)
    ) as HTMLElement[];
    rows.forEach((row) => {
      const mdaId = this.utilities.extractIndex(row.id, /integrated-mda-entry-(\d+)/);
      if (mdaId !== null) this.initIntegratedMdaTypeDropdown(mdaId);
    });
  }

  // ==================== DISTRIBUTED MODE (CPM/Card) ====================

  private ensureSfmEntry(components: any[]): void {
    const initialSfm = this.extractSharedSfmValue(components);
    this.addSfmEntry(initialSfm);
  }

  private resolveExpandedComponentSlots(expandedSlots?: Set<string>): Set<string> | undefined {
    const resolved = expandedSlots ?? this.pendingExpandedComponentSlots;
    this.pendingExpandedComponentSlots = undefined;
    return resolved;
  }

  private renderComponentEntries(components: any[], expandSet?: Set<string>): void {
    const sorted = [...components].sort((a, b) => this.compareComponentSlots(a?.slot, b?.slot));
    sorted.forEach((comp) => {
      const slotVal = String(comp?.slot ?? "");
      const slotType = this.isCpmSlot(slotVal) ? "cpm" : "card";
      const prefill = this.createComponentPrefill(comp);
      const idx = this.addComponentEntry(prefill, { slotType });
      if (idx > 0 && expandSet) {
        const key = this.normalizeComponentSlot(slotVal);
        if (key && expandSet.has(key)) this.expandComponentEntry(idx);
      }
    });
  }

  private createComponentPrefill(comp: any): any {
    if (!comp || typeof comp !== "object") return {};
    const prefill = { ...comp } as any;
    delete prefill.sfm;
    return prefill;
  }

  private extractSharedSfmValue(components: any[]): string | undefined {
    if (!Array.isArray(components) || components.length === 0) return undefined;
    for (const comp of components) {
      const sfmVal = typeof comp?.sfm === "string" ? comp.sfm.trim() : "";
      if (sfmVal) return sfmVal;
    }
    return undefined;
  }

  private compareComponentSlots(a: unknown, b: unknown): number {
    const rank = (v: unknown): [number, number] => {
      if (typeof v === "string") {
        const t = v.trim().toUpperCase();
        if (t === "A") return [0, 0];
        if (t === "B") return [1, 0];
        const n = parseInt(t, 10);
        if (!Number.isNaN(n)) return [2, n];
      } else if (typeof v === "number" && Number.isFinite(v)) {
        return [2, v];
      }
      return [3, Number.POSITIVE_INFINITY];
    };
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] !== rb[0] ? ra[0] - rb[0] : ra[1] - rb[1];
  }

  public addComponentEntry(prefill?: any, options?: { slotType?: "cpm" | "card" }): number {
    const tpl = document.getElementById("tpl-component-entry") as HTMLTemplateElement | null;
    if (!tpl) return -1;

    const prefillSlot = prefill?.slot;
    const defaultType = this.isCpmSlot(String(prefillSlot ?? "")) ? "cpm" : "card";
    const slotType = options?.slotType ?? defaultType;
    const containerId =
      slotType === "cpm" ? ID_NODE_COMPONENTS_CPM_CONTAINER : ID_NODE_COMPONENTS_CARD_CONTAINER;
    const container = document.getElementById(containerId);
    if (!container) return -1;

    const suggestedSlot = this.findNextAvailableSlot(slotType);
    const idx = ++this.componentEntryCounter;
    this.componentMdaCounters.set(idx, 0);

    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const entry = frag.querySelector(`.${CLASS_COMPONENT_ENTRY}`) as HTMLElement;
    entry.id = `component-entry-${idx}`;
    this.initializeComponentEntry(entry, idx, prefill);

    container.appendChild(frag);

    this.autofillComponentSlotIfNeeded(idx, prefill, suggestedSlot);
    this.initComponentDropdownsAndValidators(idx);
    this.prefillSubcomponents(idx, prefill);

    if (!prefill) {
      this.expandComponentEntry(idx);
    }

    this.updateComponentAddButtonStates();

    return idx;
  }

  private autofillComponentSlotIfNeeded(idx: number, prefill: any, suggestedSlot: string): void {
    if (prefill && prefill.slot != null && String(prefill.slot).trim() !== "") return;
    const slot = document.getElementById(`component-${idx}-slot`) as HTMLInputElement | null;
    if (slot && suggestedSlot) slot.value = suggestedSlot;
  }

  private initComponentDropdownsAndValidators(idx: number): void {
    this.initComponentTypeDropdown(idx);
    this.enforceComponentSlotPattern(`component-${idx}-slot`);
    this.updateXiomSectionVisibility(idx);
    this.updateMdaSectionVisibility(idx);
  }

  private prefillSubcomponents(idx: number, prefill: any): void {
    const slotVal =
      (document.getElementById(`component-${idx}-slot`) as HTMLInputElement | null)?.value || "";
    const isCpm = this.isCpmSlot(slotVal);
    if (!isCpm && Array.isArray(prefill?.mda))
      prefill.mda.forEach((m: any) => this.addMdaEntry(idx, m));
    if (isCpm) return;
    if (Array.isArray(prefill?.xiom)) prefill.xiom.forEach((x: any) => this.addXiomEntry(idx, x));
    else if (typeof prefill?.xiom === "string" && prefill.xiom)
      this.addXiomEntry(idx, { slot: 1, type: String(prefill.xiom) });
  }

  private normalizeComponentSlot(v: string): string {
    const t = (v || "").trim();
    if (t.toUpperCase() === "A") return "A";
    if (t.toUpperCase() === "B") return "B";
    if (/^[1-9]\d*$/.test(t)) return String(parseInt(t, 10));
    return "";
  }

  private collectUsedComponentSlots(excludeIdx?: number): Set<string> {
    const container = document.getElementById(ID_NODE_COMPONENTS_CONTAINER);
    const used = new Set<string>();
    if (!container) return used;
    const entries = Array.from(
      container.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`)
    ) as HTMLElement[];
    entries.forEach((entry) => {
      const idx = this.utilities.extractIndex(entry.id, /component-entry-(\d+)/);
      if (excludeIdx != null && idx === excludeIdx) return;
      const input = entry.querySelector('[data-role="component-slot"]') as HTMLInputElement | null;
      const norm = this.normalizeComponentSlot(input?.value || "");
      if (norm) used.add(norm);
    });
    return used;
  }

  private sequenceValueByIndex(i: number): string {
    if (i <= 0) return "A";
    if (i === 1) return "B";
    return String(i - 1);
  }

  private sequenceIndexOf(val: string): number {
    const v = this.normalizeComponentSlot(val);
    if (v === "A") return 0;
    if (v === "B") return 1;
    if (/^[1-9]\d*$/.test(v)) return parseInt(v, 10) + 1;
    return 0;
  }

  private findNextAvailableSlot(slotType: "cpm" | "card"): string {
    const used = this.collectUsedComponentSlots();
    if (slotType === "cpm") {
      if (!used.has("A")) return "A";
      if (!used.has("B")) return "B";
      return "";
    }

    const nums: number[] = [];
    used.forEach((v) => {
      if (/^[1-9]\d*$/.test(v)) nums.push(parseInt(v, 10));
    });
    if (nums.length === 0) return "1";
    const next = Math.max(...nums) + 1;
    return String(next);
  }

  private stepComponentSlot(current: string, direction: 1 | -1, excludeIdx?: number): string {
    const used = this.collectUsedComponentSlots(excludeIdx);
    let idx = this.sequenceIndexOf(current);
    for (let guard = 0; guard < 1000; guard++) {
      idx = Math.max(0, idx + direction);
      const candidate = this.sequenceValueByIndex(idx);
      if (!used.has(candidate)) return candidate;
      if (direction === -1 && idx === 0) break;
    }
    return current;
  }

  public updateComponentAddButtonStates(): void {
    if (this.integratedMode) {
      this.updateIntegratedAddButtonState();
      return;
    }
    const addCpmBtn = document.getElementById(ID_ADD_CPM_BUTTON) as HTMLButtonElement | null;
    const addCardBtn = document.getElementById(ID_ADD_CARD_BUTTON) as HTMLButtonElement | null;
    const used = this.collectUsedComponentSlots();
    const cpmSlots: Array<"A" | "B"> = ["A", "B"];
    const cpmCount = cpmSlots.filter((slot) => used.has(slot)).length;

    if (addCpmBtn) {
      const maxCpms = cpmSlots.length;
      addCpmBtn.disabled = cpmCount >= maxCpms;
      addCpmBtn.title = addCpmBtn.disabled
        ? "CPM slots A and B are already defined"
        : "Add a CPM slot (A or B)";
    }

    if (addCardBtn) {
      addCardBtn.disabled = false;
      addCardBtn.title = "Add a line card slot";
    }
  }

  // ==================== SFM (Switch Fabric Module) ====================

  private addSfmEntry(prefill?: string): number {
    const container = document.getElementById(
      ID_NODE_COMPONENTS_SFM_CONTAINER
    ) as HTMLElement | null;
    const tpl = document.getElementById("tpl-sfm-entry") as HTMLTemplateElement | null;
    if (!container || !tpl) return -1;

    let entry = container.querySelector(`.${CLASS_COMPONENT_SFM_ENTRY}`) as HTMLElement | null;
    if (!entry) {
      const frag = tpl.content.cloneNode(true) as DocumentFragment;
      entry = frag.querySelector(`.${CLASS_COMPONENT_SFM_ENTRY}`) as HTMLElement | null;
      if (!entry) return -1;
      entry.id = `${SFM_ENTRY_ID_PREFIX}1`;

      const hidden = entry.querySelector(SELECTOR_SFM_VALUE) as HTMLInputElement | null;
      const dropdown = entry.querySelector(SELECTOR_SFM_DROPDOWN) as HTMLElement | null;
      if (hidden) hidden.id = `${SFM_ENTRY_ID_PREFIX}1-value`;
      if (dropdown) dropdown.id = `${SFM_ENTRY_ID_PREFIX}1-dropdown`;

      container.appendChild(frag);
      this.initSfmEntryDropdown(1);
      entry = container.querySelector(`.${CLASS_COMPONENT_SFM_ENTRY}`) as HTMLElement | null;
    }

    const hidden = entry?.querySelector(SELECTOR_SFM_VALUE) as HTMLInputElement | null;
    if (hidden) hidden.value = prefill ?? "";
    this.refreshSfmDropdown();
    this.updateComponentAddButtonStates();
    return 1;
  }

  private initSfmEntryDropdown(entryId: number): void {
    const hiddenId = `${SFM_ENTRY_ID_PREFIX}${entryId}-value`;
    const dropdownId = `${SFM_ENTRY_ID_PREFIX}${entryId}-dropdown`;
    const initial = this.utilities.getInputValue(hiddenId);
    createFilterableDropdown(
      dropdownId,
      this.srosSfmTypes,
      initial,
      (selected: string) => this.utilities.setInputValue(hiddenId, selected),
      PH_SEARCH_TYPE,
      true
    );
  }

  private refreshSfmDropdown(): void {
    const container = document.getElementById(ID_NODE_COMPONENTS_SFM_CONTAINER);
    if (!container) return;
    const entry = container.querySelector(`.${CLASS_COMPONENT_SFM_ENTRY}`) as HTMLElement | null;
    if (!entry) return;
    this.initSfmEntryDropdown(1);
  }

  public commitSfmDropdown(): void {
    const container = document.getElementById(ID_NODE_COMPONENTS_SFM_CONTAINER);
    if (!container) return;
    const entry = container.querySelector(`.${CLASS_COMPONENT_SFM_ENTRY}`) as HTMLElement | null;
    if (!entry) return;
    const hidden = document.getElementById(
      `${SFM_ENTRY_ID_PREFIX}1-value`
    ) as HTMLInputElement | null;
    const filter = document.getElementById(
      `${SFM_ENTRY_ID_PREFIX}1-dropdown-filter-input`
    ) as HTMLInputElement | null;
    if (hidden && filter) hidden.value = filter.value;
  }

  public getSfmValue(): string {
    const container = document.getElementById(ID_NODE_COMPONENTS_SFM_CONTAINER);
    if (!container) return "";
    const hidden = container.querySelector(SELECTOR_SFM_VALUE) as HTMLInputElement | null;
    return hidden?.value?.trim() ?? "";
  }

  public applySfmToComponents(components: any[], sfmVal: string): void {
    const normalized = (sfmVal || "").trim();
    components.forEach((comp) => {
      if (!comp || typeof comp !== "object") return;
      if (!normalized) {
        if ("sfm" in comp) delete comp.sfm;
        return;
      }
      comp.sfm = normalized;
    });
  }

  // ==================== Component Entry Management ====================

  private relocateComponentEntryIfNeeded(idx: number): void {
    const entry = document.getElementById(`component-entry-${idx}`);
    if (!entry) return;
    const slotVal = this.utilities.getInputValue(`component-${idx}-slot`).trim();
    const targetContainerId = this.isCpmSlot(slotVal)
      ? ID_NODE_COMPONENTS_CPM_CONTAINER
      : ID_NODE_COMPONENTS_CARD_CONTAINER;
    const targetContainer = document.getElementById(targetContainerId);
    if (!targetContainer || entry.parentElement === targetContainer) return;
    targetContainer.appendChild(entry);
  }

  private initializeComponentEntry(entry: HTMLElement, idx: number, prefill?: any): void {
    const slotInput = entry.querySelector('[data-role="component-slot"]') as HTMLInputElement;
    const typeHidden = entry.querySelector(
      '[data-role="component-type-value"]'
    ) as HTMLInputElement;
    const typeDropdown = entry.querySelector(
      '[data-role="component-type-dropdown"]'
    ) as HTMLElement;
    const xiomList = entry.querySelector('[data-role="xiom-list"]') as HTMLElement;
    const addXiomBtn = entry.querySelector('[data-action="add-xiom"]') as HTMLButtonElement;
    const mdaList = entry.querySelector('[data-role="mda-list"]') as HTMLElement;
    const addMdaBtn = entry.querySelector('[data-action="add-mda"]') as HTMLButtonElement;
    const removeComponentBtn = entry.querySelector(
      '[data-action="remove-component"]'
    ) as HTMLButtonElement;
    const header = entry.querySelector('[data-action="toggle-component"]') as HTMLElement | null;
    const caret = entry.querySelector(SELECTOR_COMPONENT_CARET) as HTMLElement | null;
    const body = entry.querySelector(SELECTOR_COMPONENT_BODY) as HTMLElement | null;

    slotInput.id = `component-${idx}-slot`;
    typeHidden.id = `component-${idx}-type`;
    typeDropdown.id = `component-${idx}-type-dropdown`;
    xiomList.id = `component-${idx}-xiom-container`;
    mdaList.id = `component-${idx}-mda-container`;

    slotInput.value = String(prefill?.slot ?? "");
    typeHidden.value = String(prefill?.type ?? "");

    this.wireComponentActions(idx, addMdaBtn, addXiomBtn, removeComponentBtn);
    if (slotInput) {
      const stop = (e: Event) => e.stopPropagation();
      slotInput.addEventListener("click", stop, true);
      slotInput.addEventListener("mousedown", stop, true);
      slotInput.addEventListener("pointerdown", stop, true);
      slotInput.addEventListener("focus", stop, true);
      slotInput.addEventListener("click", stop);
      slotInput.addEventListener("mousedown", stop);
      slotInput.addEventListener("pointerdown", stop);
      slotInput.addEventListener("focus", stop);
      slotInput.addEventListener("keydown", stop);
      slotInput.addEventListener("keyup", stop);
    }
    this.wireComponentSlotIncDec(idx, entry);
    this.attachAccordion(header, body, caret);
    this.updateMdaCardSlotLabels(idx);
    this.updateMdaSectionVisibility(idx);
  }

  private wireComponentSlotIncDec(idx: number, entry: HTMLElement): void {
    const slotInput = document.getElementById(`component-${idx}-slot`) as HTMLInputElement | null;
    const decBtn = entry.querySelector(
      '[data-action="component-slot-dec"]'
    ) as HTMLButtonElement | null;
    const incBtn = entry.querySelector(
      '[data-action="component-slot-inc"]'
    ) as HTMLButtonElement | null;

    if (!slotInput) return;
    slotInput.addEventListener("click", (e) => e.stopPropagation());
    slotInput.addEventListener("mousedown", (e) => e.stopPropagation());
    slotInput.addEventListener("pointerdown", (e) => e.stopPropagation());
    decBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = this.stepComponentSlot(slotInput.value, -1, idx);
      slotInput.value = next;
      this.initComponentTypeDropdown(idx);
      this.updateMdaCardSlotLabels(idx);
      this.updateXiomSectionVisibility(idx);
      this.updateMdaSectionVisibility(idx);
      this.relocateComponentEntryIfNeeded(idx);
      this.updateComponentAddButtonStates();
    });
    incBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = this.stepComponentSlot(slotInput.value, 1, idx);
      slotInput.value = next;
      this.initComponentTypeDropdown(idx);
      this.updateMdaCardSlotLabels(idx);
      this.updateXiomSectionVisibility(idx);
      this.updateMdaSectionVisibility(idx);
      this.relocateComponentEntryIfNeeded(idx);
      this.updateComponentAddButtonStates();
    });

    let lastValid = this.normalizeComponentSlot(slotInput.value);
    slotInput.addEventListener("input", () => {
      const norm = this.normalizeComponentSlot(slotInput.value);
      if (!norm) {
        lastValid = "";
        this.updateComponentAddButtonStates();
        return;
      }
      const used = this.collectUsedComponentSlots(idx);
      if (used.has(norm)) {
        slotInput.value = lastValid;
      } else {
        lastValid = norm;
        slotInput.value = norm;
      }
      this.initComponentTypeDropdown(idx);
      this.updateMdaCardSlotLabels(idx);
      this.updateXiomSectionVisibility(idx);
      this.updateMdaSectionVisibility(idx);
      this.relocateComponentEntryIfNeeded(idx);
      this.updateComponentAddButtonStates();
    });
  }

  private updateMdaCardSlotLabels(componentIdx: number): void {
    const container = document.getElementById(`component-${componentIdx}-mda-container`);
    if (!container) return;
    const rawSlot = this.utilities.getInputValue(`component-${componentIdx}-slot`).trim();
    const hasSlot = rawSlot.length > 0;
    const slotPrefix = hasSlot ? `${rawSlot}/` : "--";
    container.querySelectorAll('[data-role="mda-card-slot"]').forEach((el) => {
      (el as HTMLElement).textContent = slotPrefix;
    });
    const xiomContainer = document.getElementById(`component-${componentIdx}-xiom-container`);
    if (xiomContainer) {
      const xiomRows = Array.from(
        xiomContainer.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)
      ) as HTMLElement[];
      xiomRows.forEach((row) => {
        const xiomId = this.utilities.extractIndex(row.id, /component-\d+-xiom-entry-(\d+)/);
        if (xiomId == null) return;
        const xiomSlotLabel = row.querySelector(
          '[data-role="xiom-card-slot"]'
        ) as HTMLElement | null;
        if (xiomSlotLabel) xiomSlotLabel.textContent = slotPrefix;
        const xiomSlotRaw = this.utilities.getInputValue(
          `component-${componentIdx}-xiom-${xiomId}-slot`
        ).trim();
        const xiomDisplay = xiomSlotRaw ? `x${xiomSlotRaw}` : "";
        let xiomPrefix = "--";
        if (hasSlot) {
          xiomPrefix = `${rawSlot}/`;
          if (xiomDisplay) {
            xiomPrefix = `${rawSlot}/${xiomDisplay}`;
          }
        }
        row.querySelectorAll('[data-role="xiom-mda-card-slot"]').forEach((el) => {
          (el as HTMLElement).textContent = xiomPrefix;
        });
      });
    }
  }

  public isCpmSlot(v: string): boolean {
    return /^[aAbB]$/.test((v || "").trim());
  }

  private updateXiomSectionVisibility(componentIdx: number): void {
    const slotVal = this.utilities.getInputValue(`component-${componentIdx}-slot`).trim();
    const container = document.getElementById(`component-${componentIdx}-xiom-container`);
    if (!container) return;
    const group = (container.closest(SELECTOR_FORM_GROUP) as HTMLElement | null) || container;
    const isCpm = this.isCpmSlot(slotVal);
    if (isCpm) {
      group.classList.add(CLASS_HIDDEN);
      const rows = Array.from(
        container.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)
      ) as HTMLElement[];
      rows.forEach((r) => r.remove());
      this.componentXiomCounters.set(componentIdx, 0);
      Array.from(this.xiomMdaCounters.keys()).forEach((k) => {
        if (k.startsWith(`${componentIdx}:`)) this.xiomMdaCounters.delete(k);
      });
    } else {
      group.classList.remove(CLASS_HIDDEN);
    }
    this.updateXiomAddButtonState(componentIdx);
  }

  private updateMdaSectionVisibility(componentIdx: number): void {
    const slotVal = this.utilities.getInputValue(`component-${componentIdx}-slot`).trim();
    const entry = document.getElementById(`component-entry-${componentIdx}`);
    if (!entry) return;
    const group = entry.querySelector('[data-role="component-mda-group"]') as HTMLElement | null;
    const list = document.getElementById(`component-${componentIdx}-mda-container`);
    const addBtn = entry.querySelector('[data-action="add-mda"]') as HTMLButtonElement | null;
    if (!group || !list) return;
    const isCpm = this.isCpmSlot(slotVal);
    if (isCpm) {
      group.classList.add(CLASS_HIDDEN);
      group.setAttribute(ATTR_ARIA_HIDDEN, "true");
      Array.from(list.querySelectorAll(`.${CLASS_COMPONENT_MDA_ENTRY}`)).forEach((el) =>
        el.remove()
      );
      this.componentMdaCounters.set(componentIdx, 0);
    } else {
      group.classList.remove(CLASS_HIDDEN);
      group.setAttribute(ATTR_ARIA_HIDDEN, "false");
    }
    if (addBtn) addBtn.disabled = isCpm;
  }

  private wireComponentActions(
    idx: number,
    addMdaBtn: HTMLButtonElement,
    addXiomBtn: HTMLButtonElement,
    removeComponentBtn: HTMLButtonElement
  ): void {
    addMdaBtn.onclick = () => this.addMdaEntry(idx);
    addXiomBtn.onclick = () => this.addXiomEntry(idx);
    if (removeComponentBtn) {
      removeComponentBtn.onclick = (e) => {
        e.stopPropagation();
        this.removeComponentEntry(idx);
      };
    }
  }

  private attachAccordion(
    header: HTMLElement | null,
    body: HTMLElement | null,
    caret: HTMLElement | null
  ): void {
    if (!header || !body) return;
    header.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-action="remove-component"]')) return;
      if (
        target.closest('input, textarea, select, [contenteditable], [data-role="component-slot"]')
      )
        return;
      const isHidden = body.classList.contains(CLASS_HIDDEN);
      if (isHidden) {
        body.classList.remove(CLASS_HIDDEN);
        if (caret) {
          caret.classList.remove(ICON_CHEVRON_RIGHT);
          caret.classList.add(ICON_CHEVRON_DOWN);
        }
      } else {
        body.classList.add(CLASS_HIDDEN);
        if (caret) {
          caret.classList.remove(ICON_CHEVRON_DOWN);
          caret.classList.add(ICON_CHEVRON_RIGHT);
        }
      }
    });
  }

  public expandComponentEntry(idx: number): void {
    const entry = document.getElementById(`component-entry-${idx}`);
    if (!entry) return;
    const body = entry.querySelector(SELECTOR_COMPONENT_BODY) as HTMLElement | null;
    const caret = entry.querySelector(SELECTOR_COMPONENT_CARET) as HTMLElement | null;
    if (body && body.classList.contains(CLASS_HIDDEN)) body.classList.remove(CLASS_HIDDEN);
    if (caret) {
      caret.classList.remove(ICON_CHEVRON_RIGHT);
      caret.classList.add(ICON_CHEVRON_DOWN);
    }
  }

  public collectExpandedComponentSlots(): Set<string> {
    const set = new Set<string>();
    const container = document.getElementById(ID_NODE_COMPONENTS_CONTAINER);
    if (!container) return set;
    const entries = Array.from(
      container.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`)
    ) as HTMLElement[];
    entries.forEach((entry) => {
      const idx = this.utilities.extractIndex(entry.id, /component-entry-(\d+)/);
      if (idx == null) return;
      const body = entry.querySelector(SELECTOR_COMPONENT_BODY) as HTMLElement | null;
      const slotInput = document.getElementById(`component-${idx}-slot`) as HTMLInputElement | null;
      const raw = slotInput?.value ?? "";
      const key = this.normalizeComponentSlot(raw);
      if (key && body && !body.classList.contains(CLASS_HIDDEN)) set.add(key);
    });
    return set;
  }

  public removeComponentEntry(idx: number): void {
    const entry = document.getElementById(`component-entry-${idx}`);
    entry?.remove();
    this.componentMdaCounters.delete(idx);
    this.componentXiomCounters.delete(idx);
    Array.from(this.xiomMdaCounters.keys()).forEach((k) => {
      if (k.startsWith(`${idx}:`)) this.xiomMdaCounters.delete(k);
    });
    this.updateComponentAddButtonStates();
  }

  // ==================== MDA (Media Dependent Adapter) ====================

  public addMdaEntry(componentIdx: number, prefill?: any): void {
    const list = document.getElementById(`component-${componentIdx}-mda-container`);
    const tpl = document.getElementById("tpl-mda-entry") as HTMLTemplateElement | null;
    if (!list || !tpl) return;
    const next = (this.componentMdaCounters.get(componentIdx) || 0) + 1;
    this.componentMdaCounters.set(componentIdx, next);
    const mdaId = next;

    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const row = frag.querySelector(".component-mda-entry") as HTMLElement;
    row.id = `component-${componentIdx}-mda-entry-${mdaId}`;
    const slot = row.querySelector('[data-role="mda-slot"]') as HTMLInputElement;
    const hiddenType = row.querySelector('[data-role="mda-type-value"]') as HTMLInputElement;
    const typeDropdown = row.querySelector('[data-role="mda-type-dropdown"]') as HTMLElement;
    const delBtn = row.querySelector('[data-action="remove-mda"]') as HTMLButtonElement;

    slot.id = `component-${componentIdx}-mda-${mdaId}-slot`;
    slot.value = prefill?.slot != null ? String(prefill.slot) : String(mdaId);
    hiddenType.id = `component-${componentIdx}-mda-${mdaId}-type`;
    hiddenType.value = prefill?.type != null ? String(prefill.type) : "";
    typeDropdown.id = `component-${componentIdx}-mda-${mdaId}-type-dropdown`;
    delBtn.onclick = () => this.removeMdaEntry(componentIdx, mdaId);

    list.appendChild(frag);

    this.initMdaTypeDropdown(componentIdx, mdaId);
    this.updateMdaCardSlotLabels(componentIdx);
  }

  private removeMdaEntry(componentIdx: number, mdaId: number): void {
    const row = document.getElementById(`component-${componentIdx}-mda-entry-${mdaId}`);
    row?.remove();
  }

  private enforceComponentSlotPattern(inputId: string): void {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    let lastValid = input.value || "";
    const re = /^([aAbB]|[1-9]\d*)?$/;
    input.addEventListener("input", () => {
      const v = input.value;
      if (re.test(v)) {
        lastValid = v;
      } else {
        input.value = lastValid;
      }
    });
  }

  private initComponentTypeDropdown(componentIdx: number): void {
    const slotVal = this.utilities.getInputValue(`component-${componentIdx}-slot`).trim();
    const isCpm = /^[aAbB]$/.test(slotVal);
    const options = isCpm ? this.srosCpmTypes : this.srosCardTypes;
    const initial = this.utilities.getInputValue(`component-${componentIdx}-type`);
    createFilterableDropdown(
      `component-${componentIdx}-type-dropdown`,
      options,
      initial,
      (selected: string) =>
        this.utilities.setInputValue(`component-${componentIdx}-type`, selected),
      PH_SEARCH_TYPE,
      true
    );
    const slotInput = document.getElementById(
      `component-${componentIdx}-slot`
    ) as HTMLInputElement | null;
    slotInput?.addEventListener("input", () => this.initComponentTypeDropdown(componentIdx));
  }

  private initMdaTypeDropdown(componentIdx: number, mdaId: number): void {
    const initial = this.utilities.getInputValue(`component-${componentIdx}-mda-${mdaId}-type`);
    createFilterableDropdown(
      `component-${componentIdx}-mda-${mdaId}-type-dropdown`,
      this.srosMdaTypes,
      initial,
      (selected: string) =>
        this.utilities.setInputValue(`component-${componentIdx}-mda-${mdaId}-type`, selected),
      PH_SEARCH_TYPE,
      true
    );
  }

  // ==================== XIOM (Extension I/O Module) ====================

  public addXiomEntry(componentIdx: number, prefill?: any): void {
    const list = document.getElementById(`component-${componentIdx}-xiom-container`);
    const tpl = document.getElementById("tpl-xiom-entry") as HTMLTemplateElement | null;
    if (!list || !tpl) return;
    if (this.shouldBlockAddXiom(componentIdx)) return;
    const next = (this.componentXiomCounters.get(componentIdx) || 0) + 1;
    this.componentXiomCounters.set(componentIdx, next);
    const xiomId = next;

    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const row = frag.querySelector(`.${CLASS_COMPONENT_XIOM_ENTRY}`) as HTMLElement;
    row.id = `component-${componentIdx}-xiom-entry-${xiomId}`;
    const slotHidden = row.querySelector('[data-role="xiom-slot-value"]') as HTMLInputElement;
    const slotDropdown = row.querySelector('[data-role="xiom-slot-dropdown"]') as HTMLElement;
    const hiddenType = row.querySelector('[data-role="xiom-type-value"]') as HTMLInputElement;
    const typeDropdown = row.querySelector('[data-role="xiom-type-dropdown"]') as HTMLElement;
    const delBtn = row.querySelector('[data-action="remove-xiom"]') as HTMLButtonElement;
    const xiomMdaList = row.querySelector('[data-role="xiom-mda-list"]') as HTMLElement;
    const addXiomMdaBtn = row.querySelector('[data-action="add-xiom-mda"]') as HTMLButtonElement;

    slotHidden.id = `component-${componentIdx}-xiom-${xiomId}-slot`;
    slotHidden.value = String(this.computeInitialXiomSlot(componentIdx, prefill));
    hiddenType.id = `component-${componentIdx}-xiom-${xiomId}-type`;
    hiddenType.value = prefill?.type != null ? String(prefill.type) : "";
    typeDropdown.id = `component-${componentIdx}-xiom-${xiomId}-type-dropdown`;
    xiomMdaList.id = `component-${componentIdx}-xiom-${xiomId}-mda-container`;
    delBtn.onclick = () => this.removeXiomEntry(componentIdx, xiomId);
    addXiomMdaBtn.onclick = () => this.addXiomMdaEntry(componentIdx, xiomId);

    this.setXiomSlotDropdownId(componentIdx, xiomId, slotDropdown);
    list.appendChild(frag);

    this.initXiomTypeDropdown(componentIdx, xiomId);
    this.initXiomSlotDropdown(componentIdx, xiomId);
    this.maybePrefillXiomMdas(componentIdx, xiomId, prefill);
    this.updateMdaCardSlotLabels(componentIdx);
    this.updateXiomAddButtonState(componentIdx);
  }

  private shouldBlockAddXiom(componentIdx: number): boolean {
    const slotVal = this.utilities.getInputValue(`component-${componentIdx}-slot`).trim();
    if (this.isCpmSlot(slotVal)) return true;
    return this.countXioms(componentIdx) >= 2;
  }

  private computeInitialXiomSlot(componentIdx: number, prefill?: any): number {
    const desired =
      (prefill?.slot != null
        ? Number(prefill.slot)
        : this.findNextAvailableXiomSlot(componentIdx)) || 1;
    return desired === 2 ? 2 : 1;
  }

  private maybePrefillXiomMdas(componentIdx: number, xiomId: number, prefill?: any): void {
    if (Array.isArray(prefill?.mda))
      prefill.mda.forEach((m: any) => this.addXiomMdaEntry(componentIdx, xiomId, m));
  }

  private setXiomSlotDropdownId(
    componentIdx: number,
    xiomId: number,
    el: HTMLElement | null
  ): void {
    if (el) el.id = `component-${componentIdx}-xiom-${xiomId}-slot-dropdown`;
  }

  private removeXiomEntry(componentIdx: number, xiomId: number): void {
    const row = document.getElementById(`component-${componentIdx}-xiom-entry-${xiomId}`);
    row?.remove();
    this.xiomMdaCounters.delete(`${componentIdx}:${xiomId}`);
    this.updateMdaCardSlotLabels(componentIdx);
    this.updateXiomAddButtonState(componentIdx);
  }

  private initXiomTypeDropdown(componentIdx: number, xiomId: number): void {
    const initial = this.utilities.getInputValue(`component-${componentIdx}-xiom-${xiomId}-type`);
    createFilterableDropdown(
      `component-${componentIdx}-xiom-${xiomId}-type-dropdown`,
      this.srosXiomTypes,
      initial,
      (selected: string) =>
        this.utilities.setInputValue(`component-${componentIdx}-xiom-${xiomId}-type`, selected),
      PH_SEARCH_TYPE,
      true
    );
  }

  // ==================== XIOM MDA ====================

  public addXiomMdaEntry(componentIdx: number, xiomId: number, prefill?: any): void {
    const list = document.getElementById(`component-${componentIdx}-xiom-${xiomId}-mda-container`);
    const tpl = document.getElementById("tpl-xiom-mda-entry") as HTMLTemplateElement | null;
    if (!list || !tpl) return;
    const key = `${componentIdx}:${xiomId}`;
    const next = (this.xiomMdaCounters.get(key) || 0) + 1;
    this.xiomMdaCounters.set(key, next);
    const mdaId = next;

    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const row = frag.querySelector(`.${CLASS_COMPONENT_XIOM_MDA_ENTRY}`) as HTMLElement;
    row.id = `component-${componentIdx}-xiom-${xiomId}-mda-entry-${mdaId}`;
    const slot = row.querySelector('[data-role="xiom-mda-slot"]') as HTMLInputElement;
    const hiddenType = row.querySelector('[data-role="xiom-mda-type-value"]') as HTMLInputElement;
    const typeDropdown = row.querySelector('[data-role="xiom-mda-type-dropdown"]') as HTMLElement;
    const delBtn = row.querySelector('[data-action="remove-xiom-mda"]') as HTMLButtonElement;

    slot.id = `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-slot`;
    slot.value = prefill?.slot != null ? String(prefill.slot) : String(mdaId);
    hiddenType.id = `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type`;
    hiddenType.value = prefill?.type != null ? String(prefill.type) : "";
    typeDropdown.id = `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type-dropdown`;
    delBtn.onclick = () => this.removeXiomMdaEntry(componentIdx, xiomId, mdaId);

    list.appendChild(frag);

    this.initXiomMdaTypeDropdown(componentIdx, xiomId, mdaId);
    this.updateMdaCardSlotLabels(componentIdx);
  }

  private removeXiomMdaEntry(componentIdx: number, xiomId: number, mdaId: number): void {
    const row = document.getElementById(
      `component-${componentIdx}-xiom-${xiomId}-mda-entry-${mdaId}`
    );
    row?.remove();
  }

  private initXiomMdaTypeDropdown(componentIdx: number, xiomId: number, mdaId: number): void {
    const initial = this.utilities.getInputValue(
      `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type`
    );
    createFilterableDropdown(
      `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type-dropdown`,
      this.srosXiomMdaTypes,
      initial,
      (selected: string) =>
        this.utilities.setInputValue(
          `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type`,
          selected
        ),
      PH_SEARCH_TYPE,
      true
    );
  }

  private countXioms(componentIdx: number): number {
    const container = document.getElementById(`component-${componentIdx}-xiom-container`);
    if (!container) return 0;
    return container.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`).length;
  }

  private getUsedXiomSlots(componentIdx: number, excludeXiomId?: number): Set<number> {
    const used = new Set<number>();
    const container = document.getElementById(`component-${componentIdx}-xiom-container`);
    if (!container) return used;
    const rows = Array.from(
      container.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)
    ) as HTMLElement[];
    rows.forEach((row) => {
      const xiomId = this.utilities.extractIndex(row.id, /component-\d+-xiom-entry-(\d+)/);
      if (excludeXiomId != null && xiomId === excludeXiomId) return;
      const v = this.utilities.getInputValue(`component-${componentIdx}-xiom-${xiomId}-slot`).trim();
      const n = parseInt(v, 10);
      if (n === 1 || n === 2) used.add(n);
    });
    return used;
  }

  private findNextAvailableXiomSlot(componentIdx: number): number {
    const used = this.getUsedXiomSlots(componentIdx);
    if (!used.has(1)) return 1;
    if (!used.has(2)) return 2;
    return 1;
  }

  private initXiomSlotDropdown(componentIdx: number, xiomId: number): void {
    const hidden = document.getElementById(
      `component-${componentIdx}-xiom-${xiomId}-slot`
    ) as HTMLInputElement | null;
    if (!hidden) return;
    const initialDigit = hidden.value === "2" ? "2" : "1";
    const options = ["x1", "x2"];
    const initialDisplay = `x${initialDigit}`;
    createFilterableDropdown(
      `component-${componentIdx}-xiom-${xiomId}-slot-dropdown`,
      options,
      initialDisplay,
      (selected: string) => {
        const digit = selected.replace(/^x/, "");
        hidden.value = digit;
        this.updateMdaCardSlotLabels(componentIdx);
      },
      "Select XIOM slot...",
      false
    );
  }

  private updateXiomAddButtonState(componentIdx: number): void {
    const entry = document.getElementById(`component-entry-${componentIdx}`);
    if (!entry) return;
    const addBtn = entry.querySelector('[data-action="add-xiom"]') as HTMLButtonElement | null;
    if (!addBtn) return;
    const count = this.countXioms(componentIdx);
    addBtn.disabled = count >= 2;
    addBtn.title = count >= 2 ? "Maximum 2 XIOMsper component" : "Add XIOM";
  }

  // ==================== Commit Dropdowns ====================

  public commitComponentDropdowns(): void {
    const containers = this.getComponentContainers();
    if (!containers) return;
    const allEntries = [
      ...Array.from(containers.cpmContainer.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`)),
      ...Array.from(containers.cardContainer.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`))
    ] as HTMLElement[];

    for (const entry of allEntries) {
      const idx = this.utilities.extractIndex(entry.id, /component-entry-(\d+)/);
      if (idx === null) continue;
      this.commitComponentBaseDropdowns(idx);
      this.commitXiomDropdowns(idx);
      this.commitMdaDropdowns(idx);
    }
    this.commitSfmDropdown();
  }

  private commitComponentBaseDropdowns(idx: number): void {
    const typeFilter = document.getElementById(
      `component-${idx}-type-dropdown-filter-input`
    ) as HTMLInputElement | null;
    const typeHidden = document.getElementById(`component-${idx}-type`) as HTMLInputElement | null;
    if (typeFilter && typeHidden) typeHidden.value = typeFilter.value;
  }

  private commitXiomDropdowns(idx: number): void {
    const xiomContainer = document.getElementById(`component-${idx}-xiom-container`);
    if (!xiomContainer) return;
    const xiomRows = Array.from(
      xiomContainer.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)
    ) as HTMLElement[];
    for (const row of xiomRows) {
      const xiomId = this.utilities.extractIndex(row.id, /component-\d+-xiom-entry-(\d+)/);
      if (xiomId === null) continue;
      const xiomTypeFilter = document.getElementById(
        `component-${idx}-xiom-${xiomId}-type-dropdown-filter-input`
      ) as HTMLInputElement | null;
      const xiomTypeHidden = document.getElementById(
        `component-${idx}-xiom-${xiomId}-type`
      ) as HTMLInputElement | null;
      if (xiomTypeFilter && xiomTypeHidden) xiomTypeHidden.value = xiomTypeFilter.value;
      this.commitXiomMdaDropdowns(idx, xiomId, row);
    }
  }

  private commitXiomMdaDropdowns(idx: number, xiomId: number, xiomRow: HTMLElement): void {
    const mdaContainer = xiomRow.querySelector(
      `[id="component-${idx}-xiom-${xiomId}-mda-container"]`
    );
    if (!mdaContainer) return;
    const mdaRows = Array.from(
      mdaContainer.querySelectorAll(`.${CLASS_COMPONENT_XIOM_MDA_ENTRY}`)
    ) as HTMLElement[];
    for (const mdaRow of mdaRows) {
      const mdaId = this.utilities.extractIndex(
        mdaRow.id,
        /component-\d+-xiom-\d+-mda-entry-(\d+)/
      );
      if (mdaId === null) continue;
      const filter = document.getElementById(
        `component-${idx}-xiom-${xiomId}-mda-${mdaId}-type-dropdown-filter-input`
      ) as HTMLInputElement | null;
      const hidden = document.getElementById(
        `component-${idx}-xiom-${xiomId}-mda-${mdaId}-type`
      ) as HTMLInputElement | null;
      if (filter && hidden) hidden.value = filter.value;
    }
  }

  private commitMdaDropdowns(idx: number): void {
    const mdaContainer = document.getElementById(`component-${idx}-mda-container`);
    if (!mdaContainer) return;
    const mdaRows = Array.from(
      mdaContainer.querySelectorAll(`.${CLASS_COMPONENT_MDA_ENTRY}`)
    ) as HTMLElement[];
    for (const row of mdaRows) {
      const mdaId = this.utilities.extractIndex(row.id, /component-\d+-mda-entry-(\d+)/);
      if (mdaId === null) continue;
      const filter = document.getElementById(
        `component-${idx}-mda-${mdaId}-type-dropdown-filter-input`
      ) as HTMLInputElement | null;
      const hidden = document.getElementById(
        `component-${idx}-mda-${mdaId}-type`
      ) as HTMLInputElement | null;
      if (filter && hidden) hidden.value = filter.value;
    }
  }

  // ==================== Collect Components Data ====================

  /**
   * Build a component object from a single DOM entry
   */
  public buildComponentFromEntry(entryEl: HTMLElement): any | null {
    const idx = this.utilities.extractIndex(entryEl.id, /component-entry-(\d+)/);
    if (idx === null) return null;
    const slotRaw = this.utilities.getInputValue(`component-${idx}-slot`).trim();
    const typeVal = this.utilities.getInputValue(`component-${idx}-type`).trim();
    const parsed = this.parseComponentSlot(slotRaw);
    if (!parsed) return null;
    const comp: any = {};
    if (parsed.value !== undefined) comp.slot = parsed.value;
    if (typeVal) comp.type = typeVal;
    if (!this.isCpmSlot(slotRaw)) {
      const mdas = this.collectMdas(idx);
      if (mdas.length > 0) comp.mda = mdas;
      const xioms = this.collectXioms(idx);
      if (xioms.length > 0) comp.xiom = xioms;
    }
    return comp;
  }

  public parseComponentSlot(value: string): { value?: string | number } | null {
    const v = value.trim();
    if (!v) return null;
    if (/^[aAbB]$/.test(v)) return { value: v.toUpperCase() };
    if (/^[1-9]\d*$/.test(v)) return { value: parseInt(v, 10) };
    return null;
  }

  public collectMdas(componentIdx: number): any[] {
    const list: any[] = [];
    const container = document.getElementById(`component-${componentIdx}-mda-container`);
    if (!container) return list;
    const rows = Array.from(
      container.querySelectorAll(`.${CLASS_COMPONENT_MDA_ENTRY}`)
    ) as HTMLElement[];
    for (const row of rows) {
      const mdaId = this.utilities.extractIndex(row.id, /component-\d+-mda-entry-(\d+)/);
      if (mdaId === null) continue;
      const slotRaw = this.utilities.getInputValue(`component-${componentIdx}-mda-${mdaId}-slot`).trim();
      const typeVal = this.utilities.getInputValue(`component-${componentIdx}-mda-${mdaId}-type`).trim();
      const mda: any = {};
      if (/^\d+$/.test(slotRaw)) mda.slot = parseInt(slotRaw, 10);
      if (typeVal) mda.type = typeVal;
      if (mda.slot != null && mda.type) list.push(mda);
    }
    return list;
  }

  public collectXioms(componentIdx: number): any[] {
    const list: any[] = [];
    const container = document.getElementById(`component-${componentIdx}-xiom-container`);
    if (!container) return list;
    const rows = Array.from(
      container.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)
    ) as HTMLElement[];
    for (const row of rows) {
      const xiomId = this.utilities.extractIndex(row.id, /component-\d+-xiom-entry-(\d+)/);
      if (xiomId === null) continue;
      const slotRaw = this.utilities.getInputValue(`component-${componentIdx}-xiom-${xiomId}-slot`).trim();
      const typeVal = this.utilities.getInputValue(`component-${componentIdx}-xiom-${xiomId}-type`).trim();
      const xiom: any = {};
      const slotNum = parseInt(slotRaw, 10);
      if (slotNum === 1 || slotNum === 2) xiom.slot = slotNum;
      if (typeVal) xiom.type = typeVal;
      const mdas = this.collectXiomMdas(componentIdx, xiomId);
      if (mdas.length > 0) xiom.mda = mdas;
      if ((xiom.slot != null || xiom.type) && Object.keys(xiom).length > 0) list.push(xiom);
    }
    return list;
  }

  public collectXiomMdas(componentIdx: number, xiomId: number): any[] {
    const list: any[] = [];
    const container = document.getElementById(
      `component-${componentIdx}-xiom-${xiomId}-mda-container`
    );
    if (!container) return list;
    const rows = Array.from(
      container.querySelectorAll(`.${CLASS_COMPONENT_XIOM_MDA_ENTRY}`)
    ) as HTMLElement[];
    for (const row of rows) {
      const mdaId = this.utilities.extractIndex(
        row.id,
        /component-\d+-xiom-\d+-mda-entry-(\d+)/
      );
      if (mdaId === null) continue;
      const slotRaw = this.utilities.getInputValue(
        `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-slot`
      ).trim();
      const typeVal = this.utilities.getInputValue(
        `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type`
      ).trim();
      const mda: any = {};
      if (/^\d+$/.test(slotRaw)) mda.slot = parseInt(slotRaw, 10);
      if (typeVal) mda.type = typeVal;
      if (mda.slot != null && mda.type) list.push(mda);
    }
    return list;
  }

  /**
   * Get all component entries from CPM and Card containers
   */
  public getAllComponentEntries(): HTMLElement[] {
    const containers = this.getComponentContainers();
    if (!containers) return [];
    return [
      ...Array.from(containers.cpmContainer.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`)),
      ...Array.from(containers.cardContainer.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`))
    ] as HTMLElement[];
  }

  /**
   * Store expanded slots for restoration after refresh
   */
  public setPendingExpandedSlots(slots: Set<string> | undefined): void {
    this.pendingExpandedComponentSlots = slots;
  }
}
