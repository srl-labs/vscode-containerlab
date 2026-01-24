/**
 * Graph Click Helpers
 * Utilities for handling modified click events (Alt+Click, Shift+Click)
 *
 * NOTE: These helpers are disabled during ReactFlow migration.
 * Click handling should be done through ReactFlow callbacks.
 */

type ModifierKey = "alt" | "shift";

const ANNOTATION_ROLES = new Set(["freeText", "freeShape", "group"]);

/**
 * Get the target element from a modifier+tap event.
 * Returns null if conditions aren't met or if target is an annotation.
 *
 * NOTE: This function is disabled - always returns null.
 * Use ReactFlow's onClick handlers instead.
 */
export function getModifierTapTarget<T>(
  _evt: unknown,
  _cyCompat: null,
  options: { mode: "edit" | "view"; isLocked: boolean; modifier: ModifierKey }
): T | null {
  // Disabled during ReactFlow migration
  void options;
  void ANNOTATION_ROLES;
  return null;
}
