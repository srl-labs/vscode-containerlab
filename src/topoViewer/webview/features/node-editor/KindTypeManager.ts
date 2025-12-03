// KindTypeManager.ts - Handles kind and type dropdown logic

import { log } from "../../platform/logging/logger";
import { createFilterableDropdown } from "../../ui/FilterableDropdown";
import {
  ID_NODE_KIND_DROPDOWN,
  ID_NODE_KIND_FILTER_INPUT,
  ID_NODE_TYPE,
  ID_NODE_TYPE_DROPDOWN,
  ID_NODE_TYPE_FILTER_INPUT,
  ID_NODE_TYPE_WARNING,
  SELECTOR_FORM_GROUP,
  PH_SEARCH_KIND,
  PH_SEARCH_TYPE,
  TYPE_UNSUPPORTED_WARNING_TEXT
} from "./NodeEditorConstants";

/* eslint-disable no-unused-vars */
export interface KindTypeUtilities {
  getInputValue: (id: string) => string;
  setInputValue: (id: string, value: string | number) => void;
  onKindChanged: (kind: string) => void;
  updateComponentMode: (reload?: boolean) => void;
  getExistingNodeTypeValue: () => string | undefined;
}
/* eslint-enable no-unused-vars */

export interface KindTypeCallbacks {
  onSchemaLoaded?: () => void;
}

export class KindTypeManager {
  private schemaKinds: string[] = [];
  private kindsLoaded = false;
  private nodeTypeOptions: Map<string, string[]> = new Map();
  private typeSchemaLoaded = false;
  private kindsWithTypeSupport: Set<string> = new Set();
  private utilities: KindTypeUtilities;
  private callbacks: KindTypeCallbacks = {};

  constructor(utilities: KindTypeUtilities) {
    this.utilities = utilities;
  }

  public setCallbacks(callbacks: KindTypeCallbacks): void {
    this.callbacks = callbacks;
  }

  public isKindsLoaded(): boolean {
    return this.kindsLoaded;
  }

  public getSchemaKinds(): string[] {
    return this.schemaKinds;
  }

  public handleKindChange(selectedKind: string): void {
    const typeFormGroup = document
      .getElementById(ID_NODE_TYPE)
      ?.closest(SELECTOR_FORM_GROUP) as HTMLElement;
    const typeDropdownContainer = document.getElementById(ID_NODE_TYPE_DROPDOWN);
    const typeInput = document.getElementById(ID_NODE_TYPE) as HTMLInputElement;

    if (!typeFormGroup) return;

    const typeOptions = this.getTypeOptionsForKind(selectedKind);
    if (typeOptions.length > 0) {
      this.showTypeDropdown(
        typeFormGroup,
        typeDropdownContainer,
        typeInput,
        typeOptions,
        selectedKind
      );
    } else {
      this.toggleTypeInputForKind(selectedKind, typeFormGroup, typeDropdownContainer, typeInput);
    }

    this.utilities.onKindChanged(selectedKind);

    log.debug(
      `Kind changed to ${selectedKind}, type field visibility: ${typeFormGroup?.style.display}`
    );
  }

  private showTypeDropdown(
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null,
    typeOptions: string[],
    selectedKind: string
  ): void {
    typeFormGroup.style.display = "block";
    if (!typeDropdownContainer || !typeInput) return;
    typeDropdownContainer.style.display = "block";
    typeInput.style.display = "none";

    const typeOptionsWithEmpty = ["", ...typeOptions];
    const currentType = typeInput.value || "";
    const typeToSelect = typeOptionsWithEmpty.includes(currentType) ? currentType : "";
    this.setTypeWarningVisibility(false);

    createFilterableDropdown(
      ID_NODE_TYPE_DROPDOWN,
      typeOptionsWithEmpty,
      typeToSelect,
      (selectedType: string) => {
        if (typeInput) typeInput.value = selectedType;
        log.debug(`Type ${selectedType || "(empty)"} selected for kind ${selectedKind}`);
        this.onTypeFieldChanged();
      },
      PH_SEARCH_TYPE,
      true
    );

    const filterInput = document.getElementById(
      ID_NODE_TYPE_FILTER_INPUT
    ) as HTMLInputElement | null;
    if (filterInput) {
      const syncTypeValue = () => {
        if (typeInput) typeInput.value = filterInput.value;
        this.onTypeFieldChanged();
      };
      filterInput.oninput = syncTypeValue;
      if (typeInput) typeInput.value = filterInput.value;
    }
  }

  private toggleTypeInputForKind(
    selectedKind: string,
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null
  ): void {
    const schemaReady = this.typeSchemaLoaded;
    const hasTypeSupport = schemaReady ? this.kindSupportsType(selectedKind) : false;
    const existingTypeValue = this.utilities.getExistingNodeTypeValue();
    const hasExistingTypeValue =
      typeof existingTypeValue === "string" && existingTypeValue.trim().length > 0;
    if (!hasExistingTypeValue) {
      this.utilities.setInputValue(ID_NODE_TYPE, "");
      const filterInput = document.getElementById(
        ID_NODE_TYPE_FILTER_INPUT
      ) as HTMLInputElement | null;
      if (filterInput) filterInput.value = "";
    }

    const hasTypeValue = this.hasTypeFieldValue();
    const shouldShowFreeformType =
      !schemaReady || hasTypeSupport || hasTypeValue || hasExistingTypeValue;

    if (shouldShowFreeformType) {
      this.displayFreeformTypeField(typeFormGroup, typeDropdownContainer, typeInput);
      const shouldWarn = schemaReady && (hasTypeValue || hasExistingTypeValue) && !hasTypeSupport;
      this.setTypeWarningVisibility(shouldWarn);
      return;
    }

    this.hideTypeField(
      typeFormGroup,
      typeDropdownContainer,
      typeInput,
      hasTypeValue || hasExistingTypeValue
    );
  }

  private displayFreeformTypeField(
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null
  ): void {
    typeFormGroup.style.display = "block";
    if (typeDropdownContainer && typeInput) {
      typeDropdownContainer.style.display = "none";
      typeInput.style.display = "block";
    }
    if (typeInput) {
      typeInput.oninput = () => this.onTypeFieldChanged();
    }
  }

  private hideTypeField(
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null,
    hasTypeValue: boolean
  ): void {
    typeFormGroup.style.display = "none";
    this.setTypeWarningVisibility(false);
    if (typeInput) {
      typeInput.style.display = "none";
      if (!hasTypeValue) typeInput.value = "";
    }
    if (typeDropdownContainer) typeDropdownContainer.style.display = "none";
  }

  private onTypeFieldChanged(): void {
    this.utilities.updateComponentMode();
  }

  public getCurrentKindValue(): string {
    const input = document.getElementById(ID_NODE_KIND_FILTER_INPUT) as HTMLInputElement | null;
    return input?.value?.trim() ?? "";
  }

  private setTypeWarningVisibility(visible: boolean): void {
    const warning = document.getElementById(ID_NODE_TYPE_WARNING);
    if (!warning) return;
    warning.style.display = visible ? "block" : "none";
    if (visible) {
      warning.textContent = TYPE_UNSUPPORTED_WARNING_TEXT;
    }
  }

  private getSchemaUrl(): string | undefined {
    const url = (window as any).schemaUrl as string | undefined;
    if (!url) {
      log.warn("Schema URL is undefined; keeping existing Kind options");
    }
    return url;
  }

  private async fetchSchema(url: string): Promise<any> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private getSortedKinds(schema: any): string[] {
    const kinds: string[] = schema?.definitions?.["node-config"]?.properties?.kind?.enum || [];
    const nokiaKinds = kinds
      .filter((k) => k.startsWith("nokia_"))
      .sort((a, b) => a.localeCompare(b));
    const otherKinds = kinds
      .filter((k) => !k.startsWith("nokia_"))
      .sort((a, b) => a.localeCompare(b));
    return [...nokiaKinds, ...otherKinds];
  }

  public determineInitialKind(desired: string): string {
    if (desired && this.schemaKinds.includes(desired)) {
      return desired;
    }
    const def = (window as any).defaultKind;
    if (def && this.schemaKinds.includes(def)) {
      return def;
    }
    return this.schemaKinds[0] || "";
  }


  public async populateKindsFromSchema(
    onSchemaExtracted?: (schema: any) => void // eslint-disable-line no-unused-vars
  ): Promise<void> {
    try {
      const url = this.getSchemaUrl();
      if (!url) return;

      const json = await this.fetchSchema(url);
      this.extractTypeOptionsFromSchema(json);

      if (onSchemaExtracted) {
        onSchemaExtracted(json);
      }

      const kinds = this.getSortedKinds(json);
      if (kinds.length === 0) {
        log.warn("No kind enum found in schema; keeping existing Kind options");
        return;
      }
      this.schemaKinds = kinds;
      this.kindsLoaded = true;
      log.debug(`Loaded ${this.schemaKinds.length} kinds from schema`);

      if (this.callbacks.onSchemaLoaded) {
        this.callbacks.onSchemaLoaded();
      }
    } catch (e) {
      log.error(`populateKindsFromSchema error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  public createKindDropdown(initialKind: string): void {
    createFilterableDropdown(
      ID_NODE_KIND_DROPDOWN,
      this.schemaKinds,
      initialKind,
      (selectedKind: string) => this.handleKindChange(selectedKind),
      PH_SEARCH_KIND
    );
  }

  private extractTypeOptionsFromSchema(schema: any): void {
    this.typeSchemaLoaded = false;
    this.nodeTypeOptions.clear();
    this.kindsWithTypeSupport.clear();
    const allOf = schema?.definitions?.["node-config"]?.allOf;
    if (!allOf) {
      this.typeSchemaLoaded = true;
      this.refreshTypeFieldVisibility();
      return;
    }

    for (const condition of allOf) {
      const kind = this.getKindFromCondition(condition);
      if (!kind) continue;
      const typeProp = condition?.then?.properties?.type;
      if (!typeProp) continue;
      this.kindsWithTypeSupport.add(kind);
      const typeOptions = this.extractTypeOptions(typeProp);
      if (typeOptions.length > 0) {
        this.nodeTypeOptions.set(kind, typeOptions);
        log.debug(`Extracted ${typeOptions.length} type options for kind ${kind}`);
      }
    }
    this.typeSchemaLoaded = true;
    this.refreshTypeFieldVisibility();
  }

  public refreshTypeFieldVisibility(): void {
    const typeFormGroup = document
      .getElementById(ID_NODE_TYPE)
      ?.closest(SELECTOR_FORM_GROUP) as HTMLElement | null;
    if (!typeFormGroup) return;
    const typeDropdownContainer = document.getElementById(ID_NODE_TYPE_DROPDOWN);
    const typeInput = document.getElementById(ID_NODE_TYPE) as HTMLInputElement | null;
    if (!typeDropdownContainer || !typeInput) return;
    const currentKind = this.getCurrentKindValue();
    if (!currentKind) return;

    const typeOptions = this.getTypeOptionsForKind(currentKind);
    if (typeOptions.length > 0) {
      this.showTypeDropdown(
        typeFormGroup,
        typeDropdownContainer,
        typeInput,
        typeOptions,
        currentKind
      );
    } else {
      this.toggleTypeInputForKind(currentKind, typeFormGroup, typeDropdownContainer, typeInput);
    }
  }

  private getKindFromCondition(condition: any): string | null {
    const pattern = condition?.if?.properties?.kind?.pattern as string | undefined;
    if (!pattern) return null;
    const start = pattern.indexOf("(");
    const end = start >= 0 ? pattern.indexOf(")", start + 1) : -1;
    if (start < 0 || end <= start) return null;
    return pattern.slice(start + 1, end);
  }

  private extractTypeOptions(typeProp: any): string[] {
    if (typeProp.enum) return typeProp.enum;
    if (Array.isArray(typeProp.anyOf)) {
      return typeProp.anyOf.flatMap((sub: any) => (sub.enum ? sub.enum : []));
    }
    return [];
  }

  private kindSupportsType(kind: string): boolean {
    return this.kindsWithTypeSupport.has(kind);
  }

  public getTypeOptionsForKind(kind: string): string[] {
    return this.nodeTypeOptions.get(kind) || [];
  }

  public getTypeFieldValue(): string {
    return this.utilities.getInputValue(ID_NODE_TYPE);
  }

  private hasTypeFieldValue(): boolean {
    return this.getTypeFieldValue().trim().length > 0;
  }


  public setupKindAndTypeFields(
    extraData: Record<string, any>,
    actualInherited: string[],
    markFieldInheritance: (fieldId: string, inherited: boolean) => void // eslint-disable-line no-unused-vars
  ): void {
    const desiredKind = extraData.kind || (window as any).defaultKind || "nokia_srlinux";
    const kindInitial =
      this.schemaKinds.length > 0 && this.schemaKinds.includes(desiredKind)
        ? desiredKind
        : this.schemaKinds[0] || desiredKind;

    this.createKindDropdown(kindInitial);
    markFieldInheritance(ID_NODE_KIND_DROPDOWN, actualInherited.includes("kind"));

    const typeValue = extraData.type || "";
    this.utilities.setInputValue(ID_NODE_TYPE, typeValue);
    markFieldInheritance(ID_NODE_TYPE, actualInherited.includes("type"));
    this.handleKindChange(kindInitial);
    if (typeValue) {
      const typeInput = document.getElementById(ID_NODE_TYPE) as HTMLInputElement;
      if (typeInput) {
        typeInput.value = typeValue;
      }
    }
  }

  public alignKindSelection(nodeExtraData: any): void {
    try {
      const input = document.getElementById(ID_NODE_KIND_FILTER_INPUT) as HTMLInputElement | null;
      const desired = (nodeExtraData?.kind as string) || (window as any).defaultKind || "";
      if (!input || !desired || !this.kindsLoaded || this.schemaKinds.length === 0) {
        return;
      }
      input.value = this.determineInitialKind(desired);
    } catch (e) {
      log.warn(`Kind selection alignment warning: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
