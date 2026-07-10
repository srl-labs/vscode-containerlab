import { randomUUID } from "crypto";

import type * as vscode from "vscode";

import { normalizedBaseUrl } from "../backends/api/apiTransport";
import {
  isValidApiSessionDuration,
  normalizeApiSessionDuration,
  type ApiEndpointProfile,
  type ApiEndpointProfileInput
} from "./model";

export {
  DEFAULT_API_SESSION_DURATION,
  isValidApiSessionDuration,
  normalizeApiSessionDuration,
  type ApiEndpointProfile,
  type ApiEndpointProfileInput,
  type ApiEndpointProfileView,
  type ApiEndpointStatus
} from "./model";

const STORAGE_KEY = "containerlab.api.endpointProfiles.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function apiEndpointIdentity(url: string, username: string): string {
  return `${normalizedBaseUrl(url).toString().replace(/\/$/u, "")}\u0000${username.trim()}`;
}

function defaultEndpointLabel(url: string): string {
  return normalizedBaseUrl(url).host;
}

function normalizeProfile(input: ApiEndpointProfileInput): ApiEndpointProfile {
  const url = normalizedBaseUrl(input.url).toString().replace(/\/$/u, "");
  const username = input.username.trim();
  if (username.length === 0) {
    throw new Error("API endpoint username is required.");
  }
  const requestedId = input.id?.trim() ?? "";
  const requestedLabel = input.label?.trim() ?? "";
  const sessionDuration = normalizeApiSessionDuration(input.sessionDuration);
  if (!isValidApiSessionDuration(sessionDuration)) {
    throw new Error("Invalid session duration. Use values like 24h, 36h, 7d, or 1h30m.");
  }
  return {
    id:
      requestedId.length > 0
        ? requestedId
        : `endpoint-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    label: requestedLabel.length > 0 ? requestedLabel : defaultEndpointLabel(url),
    url,
    username,
    sessionDuration,
    allowInsecureHttp: input.allowInsecureHttp === true
  };
}

function parseStoredProfile(value: unknown): ApiEndpointProfile | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.label !== "string" ||
    typeof value.url !== "string" ||
    typeof value.username !== "string" ||
    typeof value.sessionDuration !== "string" ||
    typeof value.allowInsecureHttp !== "boolean"
  ) {
    return null;
  }
  try {
    return normalizeProfile({
      id: value.id,
      label: value.label,
      url: value.url,
      username: value.username,
      sessionDuration: value.sessionDuration,
      allowInsecureHttp: value.allowInsecureHttp
    });
  } catch {
    return null;
  }
}

export class ApiEndpointProfileStore {
  private profiles = new Map<string, ApiEndpointProfile>();

  constructor(private readonly state: Pick<vscode.Memento, "get" | "update">) {
    const stored = state.get<unknown>(STORAGE_KEY, []);
    if (!Array.isArray(stored)) return;
    for (const value of stored) {
      const profile = parseStoredProfile(value);
      if (profile !== null) this.profiles.set(profile.id, profile);
    }
  }

  list(): ApiEndpointProfile[] {
    return Array.from(this.profiles.values(), (profile) => ({ ...profile }));
  }

  get(id: string): ApiEndpointProfile | undefined {
    const profile = this.profiles.get(id);
    return profile ? { ...profile } : undefined;
  }

  findByIdentity(url: string, username: string): ApiEndpointProfile | undefined {
    const identity = apiEndpointIdentity(url, username);
    return this.list().find(
      (profile) => apiEndpointIdentity(profile.url, profile.username) === identity
    );
  }

  async save(input: ApiEndpointProfileInput): Promise<ApiEndpointProfile> {
    const normalized = normalizeProfile(input);
    const duplicate = this.findByIdentity(normalized.url, normalized.username);
    const requestedId = input.id?.trim();
    if (
      requestedId !== undefined &&
      requestedId.length > 0 &&
      duplicate !== undefined &&
      duplicate.id !== normalized.id
    ) {
      throw new Error("An API endpoint profile already exists for this URL and username.");
    }
    const profile = duplicate !== undefined ? { ...normalized, id: duplicate.id } : normalized;
    const next = new Map(this.profiles);
    next.set(profile.id, profile);
    await this.persist(next);
    this.profiles = next;
    return { ...profile };
  }

  async remove(id: string): Promise<ApiEndpointProfile | undefined> {
    const existing = this.profiles.get(id);
    if (!existing) return undefined;
    const next = new Map(this.profiles);
    next.delete(id);
    await this.persist(next);
    this.profiles = next;
    return { ...existing };
  }

  async ensureConfiguredProfile(input: ApiEndpointProfileInput): Promise<ApiEndpointProfile> {
    const existing = this.findByIdentity(input.url, input.username);
    if (existing) return existing;
    return await this.save(input);
  }

  private async persist(profiles: Map<string, ApiEndpointProfile>): Promise<void> {
    await this.state.update(
      STORAGE_KEY,
      Array.from(profiles.values(), (profile) => ({ ...profile }))
    );
  }
}
