import type { NetemState } from "../../shared/parsing";

import { normalizeNetemPercentage, normalizeNetemValue } from "./netemNormalization";

export const PENDING_NETEM_KEY = "clabPendingNetem";
const PENDING_NETEM_TTL_MS = 10000;

export interface PendingNetemOverride {
  source?: NetemState;
  target?: NetemState;
  appliedAt: number;
}

export function createPendingNetemOverride(
  source?: NetemState,
  target?: NetemState
): PendingNetemOverride {
  return {
    source,
    target,
    appliedAt: Date.now(),
  };
}

export function isPendingNetemFresh(pending?: PendingNetemOverride): boolean {
  if (!pending) return false;
  return Date.now() - pending.appliedAt <= PENDING_NETEM_TTL_MS;
}

function normalizeNetemForCompare(netem?: NetemState): Record<keyof NetemState, string> {
  return {
    delay: normalizeNetemValue(netem?.delay),
    jitter: normalizeNetemValue(netem?.jitter),
    loss: normalizeNetemPercentage(netem?.loss),
    rate: normalizeNetemValue(netem?.rate),
    corruption: normalizeNetemPercentage(netem?.corruption),
  };
}

export function areNetemEquivalent(a?: NetemState, b?: NetemState): boolean {
  const normalizedA = normalizeNetemForCompare(a);
  const normalizedB = normalizeNetemForCompare(b);
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}
