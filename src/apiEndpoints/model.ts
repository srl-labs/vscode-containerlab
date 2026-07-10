const SESSION_DURATION_PATTERN =
  /^(?:(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))|(?:\d+(?:\.\d+)?(?:d|w)))+$/iu;
const SESSION_DURATION_COMPONENT_PATTERN = /(\d+(?:\.\d+)?)(?:ns|us|µs|ms|s|m|h|d|w)/giu;

export const DEFAULT_API_SESSION_DURATION = "24h";

export type ApiEndpointStatus = "connected" | "session_expired" | "offline" | "saved";

export interface ApiEndpointProfile {
  id: string;
  label: string;
  url: string;
  username: string;
  sessionDuration: string;
  allowInsecureHttp: boolean;
}

export interface ApiEndpointProfileView extends ApiEndpointProfile {
  registered: boolean;
  certificateFingerprint?: string;
  connected: boolean;
  status: ApiEndpointStatus;
}

export interface ApiEndpointProfileInput {
  id?: string;
  label?: string;
  url: string;
  username: string;
  sessionDuration?: string;
  allowInsecureHttp?: boolean;
}

export function normalizeApiSessionDuration(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : DEFAULT_API_SESSION_DURATION;
}

export function isValidApiSessionDuration(value: string): boolean {
  const normalized = value.trim();
  return (
    SESSION_DURATION_PATTERN.test(normalized) &&
    Array.from(normalized.matchAll(SESSION_DURATION_COMPONENT_PATTERN)).some(
      (match) => Number(match[1]) > 0
    )
  );
}
