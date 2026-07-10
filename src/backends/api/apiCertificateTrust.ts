import * as fs from "fs";
import * as net from "net";
import * as tls from "tls";

import type * as vscode from "vscode";

import {
  certificateFingerprint256,
  isApiCertificateTrustError,
  normalizedBaseUrl,
  resolveTrustedCaCertificates,
  validatePinnedPeerCertificate
} from "./apiTransport";

const STORAGE_KEY = "containerlab.api.tls.endpointCertificates.v1";
const TLS_PROBE_TIMEOUT_MS = 5_000;

export interface ApiPresentedCertificate {
  certificatePem: string;
  fingerprint256: string;
  issuer: string;
  origin: string;
  serialNumber: string;
  subject: string;
  validFrom: string;
  validTo: string;
}

export interface ApiCertificateTrust extends ApiPresentedCertificate {
  trustedAt: string;
}

interface VerifyTlsOptions {
  caPath?: string;
  trustedCertificate?: string;
  url: string;
}

interface CertificateTrustDependencies {
  inspectCertificate(url: string): Promise<ApiPresentedCertificate>;
  verifyConnection(options: VerifyTlsOptions): Promise<void>;
}

export interface EnsureApiCertificateTrustOptions {
  caPath?: string;
  confirm(
    certificate: ApiPresentedCertificate,
    previous: ApiCertificateTrust | undefined
  ): Promise<boolean>;
  dependencies?: CertificateTrustDependencies;
  store: ApiCertificateTrustStore;
  url: string;
  verifyTls: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function endpointOrigin(raw: string): string {
  return normalizedBaseUrl(raw).origin;
}

function certificateName(value: unknown): string {
  if (!isRecord(value)) return "Unknown";
  const commonName = value.CN;
  if (typeof commonName === "string" && commonName.length > 0) return commonName;
  if (Array.isArray(commonName)) {
    const names = commonName.filter((entry): entry is string => typeof entry === "string");
    if (names.length > 0) return names.join(", ");
  }
  return "Unknown";
}

function pemFromDer(raw: Buffer): string {
  const body =
    raw
      .toString("base64")
      .match(/.{1,64}/gu)
      ?.join("\n") ?? "";
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

function parseStoredTrust(value: unknown): ApiCertificateTrust | null {
  if (
    !isRecord(value) ||
    typeof value.certificatePem !== "string" ||
    typeof value.fingerprint256 !== "string" ||
    typeof value.issuer !== "string" ||
    typeof value.origin !== "string" ||
    typeof value.serialNumber !== "string" ||
    typeof value.subject !== "string" ||
    typeof value.trustedAt !== "string" ||
    typeof value.validFrom !== "string" ||
    typeof value.validTo !== "string"
  ) {
    return null;
  }
  try {
    const origin = endpointOrigin(value.origin);
    if (!origin.startsWith("https://")) return null;
    const fingerprint256 = certificateFingerprint256(value.certificatePem);
    if (fingerprint256 !== value.fingerprint256.toUpperCase()) return null;
    return {
      certificatePem: value.certificatePem,
      fingerprint256,
      issuer: value.issuer,
      origin,
      serialNumber: value.serialNumber,
      subject: value.subject,
      trustedAt: value.trustedAt,
      validFrom: value.validFrom,
      validTo: value.validTo
    };
  } catch {
    return null;
  }
}

function tlsTarget(raw: string): { hostname: string; origin: string; port: number } {
  const url = normalizedBaseUrl(raw);
  if (url.protocol !== "https:") throw new Error("Certificate trust is available only for HTTPS.");
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  return {
    hostname,
    origin: url.origin,
    port: url.port.length > 0 ? Number(url.port) : 443
  };
}

async function openTlsConnection(
  raw: string,
  options: { caPath?: string; rejectUnauthorized: boolean; trustedCertificate?: string }
): Promise<tls.DetailedPeerCertificate> {
  const target = tlsTarget(raw);
  const additionalCa: Array<Buffer | string> = [];
  const caPath = options.caPath?.trim();
  if (caPath !== undefined && caPath.length > 0) additionalCa.push(fs.readFileSync(caPath));
  // An approved leaf is authenticated by hostname, validity, and exact
  // fingerprint after the handshake. This is required because Electron does
  // not treat a non-CA self-signed leaf as a valid CA certificate.
  const validatePin = options.rejectUnauthorized && options.trustedCertificate !== undefined;

  return await new Promise<tls.DetailedPeerCertificate>((resolve, reject) => {
    let settled = false;
    const socket = tls.connect({
      host: target.hostname,
      port: target.port,
      rejectUnauthorized: options.rejectUnauthorized && !validatePin,
      ...(net.isIP(target.hostname) === 0 ? { servername: target.hostname } : {}),
      ...(options.rejectUnauthorized && !validatePin
        ? { ca: resolveTrustedCaCertificates(additionalCa) }
        : {})
    });
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      const error = new Error(`TLS connection to ${target.origin} timed out.`);
      finish(() => reject(error));
      socket.destroy(error);
    }, TLS_PROBE_TIMEOUT_MS);
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate(true);
      finish(() => {
        if (certificate.raw.length === 0) {
          reject(new Error(`${target.origin} did not present a TLS certificate.`));
          return;
        }
        if (validatePin && options.trustedCertificate !== undefined) {
          const validationError = validatePinnedPeerCertificate(
            target.hostname,
            certificate,
            options.trustedCertificate
          );
          if (validationError !== undefined) {
            reject(validationError);
            return;
          }
        }
        resolve(certificate);
      });
      socket.destroy();
    });
    socket.once("error", (error) => finish(() => reject(error)));
  });
}

export async function verifyApiEndpointTls(options: VerifyTlsOptions): Promise<void> {
  await openTlsConnection(options.url, {
    rejectUnauthorized: true,
    ...(options.caPath !== undefined ? { caPath: options.caPath } : {}),
    ...(options.trustedCertificate !== undefined
      ? { trustedCertificate: options.trustedCertificate }
      : {})
  });
}

export async function inspectApiEndpointCertificate(raw: string): Promise<ApiPresentedCertificate> {
  const target = tlsTarget(raw);
  const certificate = await openTlsConnection(raw, { rejectUnauthorized: false });
  const identityError = tls.checkServerIdentity(target.hostname, certificate);
  if (identityError !== undefined) {
    throw new Error(
      `The certificate presented by ${target.origin} is not valid for ${target.hostname}: ${identityError.message}`
    );
  }
  const certificatePem = pemFromDer(certificate.raw);
  return {
    certificatePem,
    fingerprint256: certificateFingerprint256(certificatePem),
    issuer: certificateName(certificate.issuer),
    origin: target.origin,
    serialNumber: certificate.serialNumber,
    subject: certificateName(certificate.subject),
    validFrom: certificate.valid_from,
    validTo: certificate.valid_to
  };
}

export class ApiCertificateTrustStore {
  constructor(private readonly state: Pick<vscode.Memento, "get" | "update">) {}

  get(raw: string): ApiCertificateTrust | undefined {
    const origin = endpointOrigin(raw);
    return this.read().find((trust) => trust.origin === origin);
  }

  async save(certificate: ApiPresentedCertificate): Promise<ApiCertificateTrust> {
    const trust: ApiCertificateTrust = {
      ...certificate,
      origin: endpointOrigin(certificate.origin),
      fingerprint256: certificateFingerprint256(certificate.certificatePem),
      trustedAt: new Date().toISOString()
    };
    const next = this.read().filter((entry) => entry.origin !== trust.origin);
    next.push(trust);
    await this.state.update(STORAGE_KEY, next);
    return { ...trust };
  }

  async remove(raw: string): Promise<void> {
    const origin = endpointOrigin(raw);
    const current = this.read();
    const next = current.filter((trust) => trust.origin !== origin);
    if (next.length !== current.length) await this.state.update(STORAGE_KEY, next);
  }

  private read(): ApiCertificateTrust[] {
    const stored = this.state.get<unknown>(STORAGE_KEY, []);
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((value) => {
      const trust = parseStoredTrust(value);
      return trust === null ? [] : [trust];
    });
  }
}

export async function ensureApiEndpointCertificateTrust(
  options: EnsureApiCertificateTrustOptions
): Promise<ApiCertificateTrust | undefined> {
  const url = normalizedBaseUrl(options.url);
  if (url.protocol !== "https:" || !options.verifyTls) return undefined;

  const dependencies = options.dependencies ?? {
    inspectCertificate: inspectApiEndpointCertificate,
    verifyConnection: verifyApiEndpointTls
  };
  const previous = options.store.get(url.origin);
  let verificationError: unknown;
  try {
    await dependencies.verifyConnection({
      url: url.origin,
      ...(options.caPath !== undefined ? { caPath: options.caPath } : {}),
      ...(previous !== undefined ? { trustedCertificate: previous.certificatePem } : {})
    });
    return previous;
  } catch (error) {
    if (!isApiCertificateTrustError(error)) throw error;
    verificationError = error;
  }

  const presented = await dependencies.inspectCertificate(url.origin);
  if (previous?.fingerprint256 === presented.fingerprint256) {
    const reason =
      verificationError instanceof Error ? verificationError.message : String(verificationError);
    throw new Error(
      `The previously trusted certificate for ${url.origin} was rejected and cannot be re-approved unchanged: ${reason}`
    );
  }
  if (!(await options.confirm(presented, previous))) {
    throw new Error("TLS certificate trust was not approved.");
  }

  await dependencies.verifyConnection({
    url: url.origin,
    ...(options.caPath !== undefined ? { caPath: options.caPath } : {}),
    trustedCertificate: presented.certificatePem
  });
  return await options.store.save(presented);
}
