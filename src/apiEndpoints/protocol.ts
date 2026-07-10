import type { ApiEndpointProfileView } from "./model";

export interface ApiEndpointManagerState {
  configurationError?: string;
  defaultApiUrl: string;
  endpoints: ApiEndpointProfileView[];
  tlsCaPath?: string;
  tlsVerify: boolean;
}

export type ApiEndpointManagerRequest =
  | { type: "api-endpoints:request"; requestId: string; action: "refresh" }
  | {
      type: "api-endpoints:request";
      requestId: string;
      action: "add";
      input: {
        label?: string;
        password: string;
        sessionDuration: string;
        url: string;
        username: string;
      };
    }
  | {
      type: "api-endpoints:request";
      requestId: string;
      action: "reconnect";
      input: { endpointId: string; password: string };
    }
  | {
      type: "api-endpoints:request";
      requestId: string;
      action: "connect" | "remove";
      endpointId: string;
    }
  | {
      type: "api-endpoints:request";
      requestId: string;
      action: "update";
      input: { endpointId: string; label: string; sessionDuration: string };
    }
  | { type: "api-endpoints:request"; requestId: string; action: "openTlsSettings" };

export interface ApiEndpointManagerResponse {
  type: "api-endpoints:response";
  requestId: string;
  success: boolean;
  state: ApiEndpointManagerState;
  error?: string;
}

export interface ApiEndpointManagerStateMessage {
  type: "api-endpoints:state";
  state: ApiEndpointManagerState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRequestEnvelope(value: unknown): value is Record<string, unknown> & {
  type: "api-endpoints:request";
  requestId: string;
  action: string;
} {
  return (
    isRecord(value) &&
    value.type === "api-endpoints:request" &&
    typeof value.requestId === "string" &&
    typeof value.action === "string"
  );
}

function isEndpointIdRequest(value: Record<string, unknown>): boolean {
  return typeof value.endpointId === "string" && value.endpointId.trim().length > 0;
}

function isAddInput(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.label === undefined || typeof value.label === "string") &&
    typeof value.password === "string" &&
    typeof value.sessionDuration === "string" &&
    typeof value.url === "string" &&
    typeof value.username === "string"
  );
}

function isReconnectInput(value: unknown): boolean {
  return (
    isRecord(value) && typeof value.endpointId === "string" && typeof value.password === "string"
  );
}

function isUpdateInput(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.endpointId === "string" &&
    typeof value.label === "string" &&
    typeof value.sessionDuration === "string"
  );
}

export function isApiEndpointManagerRequest(value: unknown): value is ApiEndpointManagerRequest {
  if (!hasRequestEnvelope(value)) return false;
  switch (value.action) {
    case "refresh":
    case "openTlsSettings":
      return true;
    case "connect":
    case "remove":
      return isEndpointIdRequest(value);
    case "add":
      return isAddInput(value.input);
    case "reconnect":
      return isReconnectInput(value.input);
    case "update":
      return isUpdateInput(value.input);
    default:
      return false;
  }
}
