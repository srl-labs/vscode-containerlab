import * as vscode from "vscode";

import {
  ApiContainerlabBackend,
  apiContainerlabBackendId,
  readApiBackendTransportPolicy
} from "../backends/api/apiContainerlabBackend";
import {
  isValidApiSessionDuration,
  type ApiEndpointProfile,
  type ApiEndpointProfileView
} from "./model";
import { ApiEndpointProfileStore } from "./profileStore";
import { ApiSession, apiSessionSecretKey } from "../backends/api/apiSession";
import {
  ClabApiTransport,
  apiUrlRequiresInsecureCredentialConfirmation,
  apiUrlRequiresUnverifiedTlsConfirmation,
  normalizedBaseUrl
} from "../backends/api/apiTransport";
import { assertNoWorkspaceApiTrustOverrides } from "../backends/api/apiConfigurationTrust";
import {
  ApiCertificateTrustStore,
  ensureApiEndpointCertificateTrust,
  type ApiCertificateTrust,
  type ApiPresentedCertificate
} from "../backends/api/apiCertificateTrust";
import { getBackendById, registerBackend, unregisterBackend } from "../backends/manager";
import type { ApiEndpointManagerState } from "./protocol";

interface ApiEndpointControllerOptions {
  providersReady: () => boolean;
  refreshProviders: () => Promise<void>;
}

interface AddEndpointInput {
  label?: string;
  password: string;
  sessionDuration: string;
  url: string;
  username: string;
}

interface ReconnectEndpointInput {
  endpointId: string;
  password: string;
}

interface UpdateEndpointInput {
  endpointId: string;
  label: string;
  sessionDuration: string;
}

interface TransportApproval {
  allowInsecureHttp: boolean;
  trustedCertificate?: string;
  unverifiedTlsConfirmed: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ApiEndpointController {
  private readonly certificates: ApiCertificateTrustStore;
  private readonly profiles: ApiEndpointProfileStore;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly options: ApiEndpointControllerOptions
  ) {
    this.certificates = new ApiCertificateTrustStore(context.globalState);
    this.profiles = new ApiEndpointProfileStore(context.globalState);
  }

  async getState(probe = true): Promise<ApiEndpointManagerState> {
    const config = vscode.workspace.getConfiguration("containerlab");
    let configurationError: string | undefined;
    try {
      assertNoWorkspaceApiTrustOverrides(config);
    } catch (error) {
      configurationError = errorMessage(error);
    }
    const profiles = this.profiles.list();
    const views = await Promise.all(
      profiles.map(
        async (profile) =>
          await this.profileView(profile, config, probe && configurationError === undefined)
      )
    );
    views.sort((left, right) => {
      if (left.registered !== right.registered) return left.registered ? -1 : 1;
      return left.label.localeCompare(right.label);
    });
    const tlsCaPath = config.get<string>("api.tls.caPath", "").trim();
    return {
      defaultApiUrl: "https://localhost:8090",
      endpoints: views,
      tlsVerify: config.get<boolean>("api.tls.verify", true),
      ...(configurationError !== undefined ? { configurationError } : {}),
      ...(tlsCaPath.length > 0 ? { tlsCaPath } : {})
    };
  }

  async restoreSavedEndpoints(): Promise<void> {
    const config = vscode.workspace.getConfiguration("containerlab");
    assertNoWorkspaceApiTrustOverrides(config);
    const apiConfig = readApiBackendTransportPolicy(config);

    await Promise.all(
      this.profiles.list().map(async (profile) => {
        if (this.isRegisteredProfile(profile)) return;
        if (
          apiUrlRequiresInsecureCredentialConfirmation(profile.url) &&
          !profile.allowInsecureHttp
        ) {
          return;
        }
        if (apiUrlRequiresUnverifiedTlsConfirmation(profile.url, apiConfig.verifyTls)) return;

        let candidate: ApiContainerlabBackend | undefined;
        try {
          const certificate = this.certificates.get(profile.url);
          candidate = this.createBackend(profile, {
            allowInsecureHttp: profile.allowInsecureHttp,
            ...(certificate !== undefined
              ? { trustedCertificate: certificate.certificatePem }
              : {}),
            unverifiedTlsConfirmed: false
          });
          const initialized = await candidate.initialize();
          if (initialized.authenticated) {
            registerBackend(candidate);
          } else {
            candidate.dispose();
          }
        } catch {
          candidate?.dispose();
        }
      })
    );
  }

  async addEndpoint(input: AddEndpointInput): Promise<void> {
    this.assertSessionDuration(input.sessionDuration);
    const url = normalizedBaseUrl(input.url).toString().replace(/\/$/u, "");
    const username = input.username.trim();
    if (username.length === 0 || input.password.length === 0) {
      throw new Error("Username and password are required.");
    }
    const existing = this.profiles.findByIdentity(url, username);
    const approval = await this.approveTransport(url, existing?.allowInsecureHttp === true);
    const requestedLabel = input.label?.trim() ?? "";
    const profile: ApiEndpointProfile = {
      id: existing?.id ?? "",
      label:
        requestedLabel.length > 0
          ? requestedLabel
          : (existing?.label ?? normalizedBaseUrl(url).host),
      url,
      username,
      sessionDuration: input.sessionDuration.trim(),
      allowInsecureHttp: approval.allowInsecureHttp
    };
    const candidate = this.createBackend(profile, approval);
    const secretKey = apiSessionSecretKey(profile.url, profile.username);
    const previousToken = await this.context.secrets.get(secretKey);
    let profileSaved = false;
    try {
      await candidate.signIn(username, input.password, profile.sessionDuration);
      await this.profiles.save(profile);
      profileSaved = true;
      await this.connectCandidate(candidate);
    } catch (error) {
      if (!profileSaved) await this.restoreToken(secretKey, previousToken);
      candidate.dispose();
      throw error;
    }
  }

  async reconnectEndpoint(input: ReconnectEndpointInput): Promise<void> {
    const existing = this.requireProfile(input.endpointId);
    if (input.password.length === 0) throw new Error("Password is required.");
    const approval = await this.approveTransport(existing.url, existing.allowInsecureHttp);
    const next = { ...existing, allowInsecureHttp: approval.allowInsecureHttp };
    const candidate = this.createBackend(next, approval);
    const secretKey = apiSessionSecretKey(next.url, next.username);
    const previousToken = await this.context.secrets.get(secretKey);
    let profileSaved = false;
    try {
      await candidate.signIn(next.username, input.password, next.sessionDuration);
      await this.profiles.save(next);
      profileSaved = true;
      await this.connectCandidate(candidate);
    } catch (error) {
      if (!profileSaved) await this.restoreToken(secretKey, previousToken);
      candidate.dispose();
      throw error;
    }
  }

  async connectEndpoint(endpointId: string): Promise<void> {
    const profile = this.requireProfile(endpointId);
    const approval = await this.approveTransport(profile.url, profile.allowInsecureHttp);
    const candidate = this.createBackend(profile, approval);
    try {
      const initialized = await candidate.initialize();
      if (!initialized.authenticated) {
        throw new Error(initialized.message ?? "Reconnect this endpoint before connecting it.");
      }
      await this.connectCandidate(candidate);
    } catch (error) {
      candidate.dispose();
      throw error;
    }
  }

  async updateEndpoint(input: UpdateEndpointInput): Promise<void> {
    this.assertSessionDuration(input.sessionDuration);
    const existing = this.requireProfile(input.endpointId);
    const label = input.label.trim();
    if (label.length === 0) throw new Error("Endpoint label is required.");
    await this.profiles.save({
      ...existing,
      label,
      sessionDuration: input.sessionDuration.trim()
    });
  }

  async removeEndpoint(endpointId: string): Promise<void> {
    const profile = this.requireProfile(endpointId);
    const backendId = apiContainerlabBackendId(profile.url, profile.username);
    const backend = getBackendById(backendId);
    try {
      await backend?.signOut?.();
    } finally {
      unregisterBackend(backendId);
      await this.context.secrets.delete(apiSessionSecretKey(profile.url, profile.username));
    }
    await this.profiles.remove(endpointId);
    const origin = normalizedBaseUrl(profile.url).origin;
    const originStillUsed = this.profiles
      .list()
      .some((remaining) => normalizedBaseUrl(remaining.url).origin === origin);
    if (!originStillUsed) await this.certificates.remove(profile.url);
    if (this.options.providersReady()) await this.options.refreshProviders();
  }

  async openTlsSettings(): Promise<void> {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "@ext:srl-labs.vscode-containerlab containerlab.api.tls"
    );
  }

  private requireProfile(endpointId: string): ApiEndpointProfile {
    const profile = this.profiles.get(endpointId);
    if (!profile) throw new Error("API endpoint profile was not found.");
    return profile;
  }

  private assertSessionDuration(duration: string): void {
    if (!isValidApiSessionDuration(duration)) {
      throw new Error("Invalid session duration. Use values like 24h, 36h, 7d, or 1h30m.");
    }
  }

  private async profileView(
    profile: ApiEndpointProfile,
    config: vscode.WorkspaceConfiguration,
    probe: boolean
  ): Promise<ApiEndpointProfileView> {
    const registeredBackend = getBackendById(
      apiContainerlabBackendId(profile.url, profile.username)
    );
    const registered = registeredBackend !== undefined;
    const certificate = this.certificates.get(profile.url);
    const certificateView =
      certificate === undefined ? {} : { certificateFingerprint: certificate.fingerprint256 };
    if (registeredBackend instanceof ApiContainerlabBackend) {
      const status = registeredBackend.getConnectionState();
      return {
        ...profile,
        ...certificateView,
        registered,
        connected: status === "connected",
        status
      };
    }
    if (!probe) {
      return { ...profile, ...certificateView, registered, connected: false, status: "saved" };
    }
    if (apiUrlRequiresInsecureCredentialConfirmation(profile.url) && !profile.allowInsecureHttp) {
      return { ...profile, ...certificateView, registered, connected: false, status: "saved" };
    }
    const apiConfig = readApiBackendTransportPolicy(config);
    if (apiUrlRequiresUnverifiedTlsConfirmation(profile.url, apiConfig.verifyTls)) {
      return { ...profile, ...certificateView, registered, connected: false, status: "saved" };
    }
    try {
      const transport = new ClabApiTransport({
        baseUrl: profile.url,
        verifyTls: apiConfig.verifyTls,
        caPath: apiConfig.caPath,
        ...(certificate !== undefined ? { trustedCertificate: certificate.certificatePem } : {})
      });
      const session = new ApiSession(this.context, transport, profile.username);
      if ((await session.getToken()) === undefined) {
        return { ...profile, registered, connected: false, status: "saved" };
      }
      const valid = await session.validate();
      return {
        ...profile,
        ...certificateView,
        registered,
        connected: valid,
        status: valid ? "connected" : "session_expired"
      };
    } catch {
      return { ...profile, ...certificateView, registered, connected: false, status: "offline" };
    }
  }

  private isRegisteredProfile(profile: ApiEndpointProfile): boolean {
    return getBackendById(apiContainerlabBackendId(profile.url, profile.username)) !== undefined;
  }

  private async approveTransport(
    url: string,
    alreadyAllowsInsecureHttp: boolean
  ): Promise<TransportApproval> {
    const config = vscode.workspace.getConfiguration("containerlab");
    assertNoWorkspaceApiTrustOverrides(config);
    const insecureHttp = apiUrlRequiresInsecureCredentialConfirmation(url);
    if (insecureHttp && !alreadyAllowsInsecureHttp) {
      const choice = await vscode.window.showWarningMessage(
        "This remote clab-api-server uses cleartext HTTP. Your Linux password and JWT can be intercepted in transit. Use HTTPS unless this is an isolated development network.",
        { modal: true },
        "Continue insecurely"
      );
      if (choice !== "Continue insecurely") throw new Error("Insecure HTTP connection cancelled.");
    }
    const apiConfig = readApiBackendTransportPolicy(config);
    const certificateTrust = await ensureApiEndpointCertificateTrust({
      url,
      verifyTls: apiConfig.verifyTls,
      caPath: apiConfig.caPath,
      store: this.certificates,
      confirm: async (certificate, previous) =>
        await this.confirmCertificateTrust(certificate, previous)
    });
    const unverifiedTls = apiUrlRequiresUnverifiedTlsConfirmation(url, apiConfig.verifyTls);
    if (unverifiedTls) {
      const choice = await vscode.window.showWarningMessage(
        `TLS certificate verification is disabled for ${url}. Your Linux password and JWT could be intercepted by an impersonating server. Configure a trusted CA instead unless this is an isolated development system.`,
        { modal: true },
        "Continue without verification"
      );
      if (choice !== "Continue without verification") {
        throw new Error("Unverified TLS connection cancelled.");
      }
    }
    return {
      allowInsecureHttp: insecureHttp || alreadyAllowsInsecureHttp,
      ...(certificateTrust !== undefined
        ? { trustedCertificate: certificateTrust.certificatePem }
        : {}),
      unverifiedTlsConfirmed: unverifiedTls
    };
  }

  private createBackend(
    profile: ApiEndpointProfile,
    approval: TransportApproval
  ): ApiContainerlabBackend {
    const config = vscode.workspace.getConfiguration("containerlab");
    return new ApiContainerlabBackend(this.context, {
      ...readApiBackendTransportPolicy(config),
      url: profile.url,
      username: profile.username,
      allowInsecureHttp: profile.allowInsecureHttp,
      trustedCertificate: approval.trustedCertificate,
      unverifiedTlsConfirmed: approval.unverifiedTlsConfirmed
    });
  }

  private async confirmCertificateTrust(
    certificate: ApiPresentedCertificate,
    previous: ApiCertificateTrust | undefined
  ): Promise<boolean> {
    const changed = previous !== undefined;
    const action = changed ? "Trust New Certificate" : "Trust and Connect";
    const detail = [
      `Endpoint: ${certificate.origin}`,
      `Subject: ${certificate.subject}`,
      `Issuer: ${certificate.issuer}`,
      `Valid until: ${certificate.validTo}`,
      `SHA-256: ${certificate.fingerprint256}`,
      ...(previous !== undefined ? [`Previously trusted SHA-256: ${previous.fingerprint256}`] : []),
      "",
      "Only continue if this is the clab-api-server you intended to reach. The certificate will be pinned to this endpoint and any later change will require approval."
    ].join("\n");
    const choice = await vscode.window.showWarningMessage(
      changed
        ? `The TLS certificate for ${certificate.origin} changed.`
        : `${certificate.origin} uses a TLS certificate that is not yet trusted.`,
      { modal: true, detail },
      action
    );
    return choice === action;
  }

  private async restoreToken(key: string, token: string | undefined): Promise<void> {
    if (token === undefined) {
      await this.context.secrets.delete(key);
      return;
    }
    await this.context.secrets.store(key, token);
  }

  private async connectCandidate(candidate: ApiContainerlabBackend): Promise<void> {
    registerBackend(candidate);
    if (this.options.providersReady()) await this.options.refreshProviders();
  }
}
