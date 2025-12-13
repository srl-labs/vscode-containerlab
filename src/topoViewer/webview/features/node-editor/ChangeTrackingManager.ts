// ChangeTrackingManager.ts - Handles change tracking for the Apply button

import { ID_PANEL_EDITOR_APPLY, CLASS_HAS_CHANGES } from "./NodeEditorConstants";

export class ChangeTrackingManager {
  private panel: HTMLElement | null = null;
  private initialValues: string | null = null;

  public setPanel(panel: HTMLElement | null): void {
    this.panel = panel;
  }

  /**
   * Captures a serialized snapshot of all form inputs in the node editor panel.
   */
  public captureValues(): string {
    if (!this.panel) return "";
    const inputs = this.panel.querySelectorAll("input, select, textarea");
    const values: Record<string, string> = {};
    inputs.forEach((el, idx) => {
      const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const key = input.id || input.name || `input-${idx}`;
      if (input.type === "checkbox") {
        values[key] = String((input as HTMLInputElement).checked);
      } else {
        values[key] = input.value || "";
      }
    });
    return JSON.stringify(values);
  }

  /**
   * Checks if there are unsaved changes in the node editor.
   */
  public hasChanges(): boolean {
    if (!this.initialValues) return false;
    const current = this.captureValues();
    return this.initialValues !== current;
  }

  /**
   * Updates the node editor Apply button visual state.
   */
  public updateApplyButtonState(): void {
    const applyBtn = document.getElementById(ID_PANEL_EDITOR_APPLY);
    if (!applyBtn) return;
    const hasChanges = this.hasChanges();
    applyBtn.classList.toggle(CLASS_HAS_CHANGES, hasChanges);
  }

  /**
   * Resets initial values after applying changes.
   */
  public resetInitialValues(): void {
    this.initialValues = this.captureValues();
    this.updateApplyButtonState();
  }

  /**
   * Sets up change tracking on all form inputs in the node editor.
   */
  public setupChangeTracking(): void {
    if (!this.panel) return;
    const inputs = this.panel.querySelectorAll("input, select, textarea");
    inputs.forEach((el) => {
      el.addEventListener("input", () => this.updateApplyButtonState());
      el.addEventListener("change", () => this.updateApplyButtonState());
    });
  }

  /**
   * Initialize change tracking after panel opens.
   * Should be called after a delay to ensure all fields are populated.
   */
  public initializeTracking(): void {
    this.initialValues = this.captureValues();
    this.updateApplyButtonState();
    this.setupChangeTracking();
  }
}
