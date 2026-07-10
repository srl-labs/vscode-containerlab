import { createHash } from "crypto";

import type * as vscode from "vscode";

import type { AuthenticatedBackendSession } from "../types";
import { ApiAuthenticationRequiredError, ApiRequestError } from "./apiTransport";
import type { ClabApiTransport } from "./apiTransport";

interface LoginResponse {
  token: string;
}

interface SessionResponse {
  username?: unknown;
  roles?: unknown;
  issuedAt?: unknown;
  expiresAt?: unknown;
}

export function apiSessionSecretKey(baseUrl: string, username: string): string {
  const identity = `${baseUrl.trim().replace(/\/+$/u, "")}\n${username.trim()}`;
  return `containerlab.api.jwt.${createHash("sha256").update(identity).digest("hex")}`;
}

function tokenIsExpired(token: string): boolean {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return false;
    const payload: unknown = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null) return false;
    const exp = Reflect.get(payload, "exp");
    return typeof exp === "number" && Date.now() >= exp * 1000;
  } catch {
    return false;
  }
}

function parseSessionResponse(value: SessionResponse): AuthenticatedBackendSession {
  if (typeof value.username !== "string" || value.username.trim().length === 0) {
    throw new Error("clab-api-server returned an invalid session identity.");
  }
  if (!Array.isArray(value.roles) || !value.roles.every((role) => typeof role === "string")) {
    throw new Error("clab-api-server returned invalid session roles.");
  }
  return {
    username: value.username,
    roles: value.roles,
    ...(typeof value.issuedAt === "string" ? { issuedAt: value.issuedAt } : {}),
    ...(typeof value.expiresAt === "string" ? { expiresAt: value.expiresAt } : {})
  };
}

export class ApiSession {
  private username: string;
  private identity: AuthenticatedBackendSession | undefined;

  constructor(
    private readonly context: Pick<vscode.ExtensionContext, "secrets">,
    private readonly transport: ClabApiTransport,
    username: string
  ) {
    this.username = username.trim();
  }

  getUsername(): string {
    return this.username;
  }

  getIdentity(): AuthenticatedBackendSession | undefined {
    return this.identity;
  }

  async getToken(): Promise<string | undefined> {
    if (!this.username) return undefined;
    return await this.context.secrets.get(
      apiSessionSecretKey(this.transport.getBaseUrl(), this.username)
    );
  }

  async requireToken(): Promise<string> {
    const token = await this.getToken();
    if (!token) throw new ApiAuthenticationRequiredError();
    return token;
  }

  async signIn(username: string, password: string, sessionDuration?: string): Promise<void> {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      throw new Error("API username and password are required.");
    }
    const result = await this.transport.requestJson<LoginResponse | undefined>("POST", "/login", {
      body: JSON.stringify({
        username: normalizedUsername,
        password,
        ...(sessionDuration?.trim() ? { sessionDuration: sessionDuration.trim() } : {})
      }),
      contentType: "application/json"
    });
    if (!result || typeof result.token !== "string" || result.token.length === 0) {
      throw new Error("clab-api-server returned an invalid login response.");
    }
    this.username = normalizedUsername;
    await this.context.secrets.store(
      apiSessionSecretKey(this.transport.getBaseUrl(), normalizedUsername),
      result.token
    );
    this.identity = undefined;
  }

  async signOut(): Promise<void> {
    this.identity = undefined;
    if (this.username) {
      await this.context.secrets.delete(
        apiSessionSecretKey(this.transport.getBaseUrl(), this.username)
      );
    }
  }

  async validate(): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;
    if (tokenIsExpired(token)) {
      await this.signOut();
      return false;
    }
    try {
      const response = await this.transport.requestJson<SessionResponse>("GET", "/api/v1/session", {
        token
      });
      this.identity = parseSessionResponse(response);
      return true;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        // Compatibility with API servers predating the authenticated session endpoint.
        try {
          await this.transport.requestJson<unknown>("GET", "/api/v1/version", { token });
          this.identity = { username: this.username, roles: [] };
          return true;
        } catch (fallbackError) {
          if (fallbackError instanceof ApiRequestError && fallbackError.status === 401) {
            await this.signOut();
            return false;
          }
          throw fallbackError;
        }
      }
      if (error instanceof ApiRequestError && error.status === 401) {
        await this.signOut();
        return false;
      }
      throw error;
    }
  }
}
