import type * as vscode from "vscode";

export const API_TRUST_SETTING_KEYS = ["api.tls.verify", "api.tls.caPath"] as const;

type ApiTrustSettingKey = (typeof API_TRUST_SETTING_KEYS)[number];

function hasWorkspaceValue(
  inspection: ReturnType<vscode.WorkspaceConfiguration["inspect"]>
): boolean {
  if (inspection === undefined) return false;
  return (
    inspection.workspaceValue !== undefined ||
    inspection.workspaceFolderValue !== undefined ||
    inspection.workspaceLanguageValue !== undefined ||
    inspection.workspaceFolderLanguageValue !== undefined
  );
}

/**
 * TLS policy is a machine trust decision. Endpoint origins, accounts, and
 * cleartext approval are held in the endpoint profile store rather than in
 * workspace configuration.
 */
export function findWorkspaceApiTrustOverrides(
  config: Pick<vscode.WorkspaceConfiguration, "inspect">
): ApiTrustSettingKey[] {
  return API_TRUST_SETTING_KEYS.filter((key) => hasWorkspaceValue(config.inspect(key)));
}

export function assertNoWorkspaceApiTrustOverrides(
  config: Pick<vscode.WorkspaceConfiguration, "inspect">
): void {
  const overrides = findWorkspaceApiTrustOverrides(config);
  if (overrides.length === 0) return;
  throw new Error(
    `API trust settings cannot be configured by a workspace or workspace folder: ${overrides
      .map((key) => `containerlab.${key}`)
      .join(", ")}. Move them to User Settings.`
  );
}
