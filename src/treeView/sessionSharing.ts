import type { ContainerlabBackend } from "../backends/types";
import { backendHasCapability } from "../backends/types";

export interface LabSessionSharingLinks {
  sshxLink?: string;
  gottyLink?: string;
}

/**
 * SSHX and GoTTY sessions are local-runtime state. Keep their process-global
 * caches from crossing a live backend switch into an API-backed lab.
 */
export function resolveLabSessionSharingLinks(
  backend: ContainerlabBackend,
  labName: string,
  sshxSessions: ReadonlyMap<string, string>,
  gottySessions: ReadonlyMap<string, string>
): LabSessionSharingLinks {
  if (!backendHasCapability(backend, "local-runtime")) return {};
  return {
    sshxLink: sshxSessions.get(labName),
    gottyLink: gottySessions.get(labName)
  };
}
