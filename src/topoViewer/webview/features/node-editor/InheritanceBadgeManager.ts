// file: managerInheritanceBadge.ts

// Constants
const SELECTOR_FORM_GROUP = ".form-group" as const;

// Element IDs
const ID_NODE_CERT_KEYSIZE_DROPDOWN = "node-cert-key-size-dropdown-container" as const;
const ID_NODE_CERT_VALIDITY = "node-cert-validity" as const;
const ID_NODE_SANS_CONTAINER = "node-sans-container" as const;
const ID_NODE_CERT_ISSUE = "node-cert-issue" as const;
const ID_HC_TEST = "node-healthcheck-test" as const;
const ID_HC_START = "node-healthcheck-start-period" as const;
const ID_HC_INTERVAL = "node-healthcheck-interval" as const;
const ID_HC_TIMEOUT = "node-healthcheck-timeout" as const;
const ID_HC_RETRIES = "node-healthcheck-retries" as const;

// Property names
const PROP_HEALTHCHECK = "healthcheck" as const;

/**
 * Field mapping for inheritance tracking
 */
export interface FieldMapping {
  id: string;
  prop: string;
  badgeId?: string;
}

/**
 * Interface for node data access
 */
export interface NodeDataAccessor {
  getCurrentNodeData: () => any;
  setCurrentNodeData: (extraData: any) => void;
}
/**
 * InheritanceBadgeManager handles inheritance badges in the UI:
 * - Marking fields as inherited
 * - Updating badges based on inheritance
 * - Clearing inherited flags when fields are edited
 */
export class InheritanceBadgeManager {
  private nodeDataAccessor: NodeDataAccessor | null = null;

  public setNodeDataAccessor(accessor: NodeDataAccessor): void {
    this.nodeDataAccessor = accessor;
  }

  /**
   * Mark a form field as inherited or remove the indication
   */
  public markFieldInheritance(fieldId: string, inherited: boolean): void {
    const el = document.getElementById(fieldId) as HTMLElement | null;
    const formGroup = el?.closest(SELECTOR_FORM_GROUP) as HTMLElement | null;
    if (!formGroup) return;
    let badge = formGroup.querySelector(".inherited-badge") as HTMLElement | null;
    if (inherited) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className =
          "inherited-badge ml-2 px-1 py-0.5 text-xs bg-gray-200 text-gray-700 rounded";
        badge.textContent = "inherited";
        const label = formGroup.querySelector("label");
        label?.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  }

  /**
   * Update all inherited badges in the UI based on the current inherited properties
   */
  public updateInheritedBadges(inheritedProps: string[], fieldMappingsBase: FieldMapping[]): void {
    // Properties that should never show inherited badge
    const neverInherited = ["kind", "name", "group"];

    fieldMappingsBase.forEach(({ id, prop }) => {
      const isInherited = !neverInherited.includes(prop) && inheritedProps.includes(prop);
      this.markFieldInheritance(id, isInherited);
    });
  }

  /**
   * Remove inherited flag for a property when the field is edited
   */
  public clearInherited(prop: string, fieldId: string): void {
    if (!this.nodeDataAccessor) return;
    const data = this.nodeDataAccessor.getCurrentNodeData();
    if (!data?.extraData?.inherited) return;
    const arr = data.extraData.inherited as string[];
    const idx = arr.indexOf(prop);
    if (idx !== -1) {
      arr.splice(idx, 1);
      this.nodeDataAccessor.setCurrentNodeData(data.extraData);
      this.markFieldInheritance(fieldId, false);
    }
  }

  /**
   * Set up listeners to update inheritance indicators when fields change
   */
  public setupInheritanceChangeListeners(fieldMappingsBase: FieldMapping[]): void {
    const extraMappings: FieldMapping[] = [
      { id: ID_NODE_CERT_KEYSIZE_DROPDOWN, prop: "certificate", badgeId: ID_NODE_CERT_ISSUE },
      { id: ID_NODE_CERT_VALIDITY, prop: "certificate", badgeId: ID_NODE_CERT_ISSUE },
      { id: ID_NODE_SANS_CONTAINER, prop: "certificate", badgeId: ID_NODE_CERT_ISSUE },
      { id: ID_HC_START, prop: PROP_HEALTHCHECK, badgeId: ID_HC_TEST },
      { id: ID_HC_INTERVAL, prop: PROP_HEALTHCHECK, badgeId: ID_HC_TEST },
      { id: ID_HC_TIMEOUT, prop: PROP_HEALTHCHECK, badgeId: ID_HC_TEST },
      { id: ID_HC_RETRIES, prop: PROP_HEALTHCHECK, badgeId: ID_HC_TEST }
    ];
    const mappings: FieldMapping[] = [...fieldMappingsBase, ...extraMappings];

    mappings.forEach(({ id, prop, badgeId }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => this.clearInherited(prop, badgeId || id));
      el.addEventListener("change", () => this.clearInherited(prop, badgeId || id));
    });
  }
}
