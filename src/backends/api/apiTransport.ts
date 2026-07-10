import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as net from "net";
import { X509Certificate } from "crypto";
import { checkServerIdentity, connect as connectTls, getCACertificates } from "tls";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { IncomingHttpHeaders, IncomingMessage, RequestOptions } from "http";
import type { Duplex } from "stream";
import type { DetailedPeerCertificate, PeerCertificate } from "tls";
import WebSocket, { type ClientOptions as WebSocketClientOptions } from "ws";

export interface ApiTransportOptions {
  baseUrl: string;
  verifyTls: boolean;
  caPath?: string;
  trustedCertificate?: string;
  onUnauthorized?: () => void | Promise<void>;
}

export interface ApiRequestOptions {
  body?: Buffer | string | Readable;
  contentType?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  token?: string;
  /** Socket inactivity timeout. Set to 0 for caller-cancelled streams. */
  timeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const PINNED_TLS_CONNECT_TIMEOUT_MS = 10_000;
export const API_CERTIFICATE_PIN_MISMATCH_CODE = "CLAB_API_CERTIFICATE_PIN_MISMATCH";
const TLS_TRUST_ERROR_CODES = new Set([
  API_CERTIFICATE_PIN_MISMATCH_CODE,
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
]);

function errorCode(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    typeof Reflect.get(error, "code") === "string"
    ? String(Reflect.get(error, "code"))
    : "";
}

export function isApiCertificateTrustError(error: unknown): boolean {
  return TLS_TRUST_ERROR_CODES.has(errorCode(error));
}

type CaCertificateSource = (type: "default" | "system") => readonly string[];
type CaCertificate = Buffer | string;

function additionalCertificates(
  certificates?: CaCertificate | readonly CaCertificate[]
): readonly CaCertificate[] {
  if (certificates === undefined) return [];
  return typeof certificates === "string" || Buffer.isBuffer(certificates)
    ? [certificates]
    : certificates;
}

export function resolveTrustedCaCertificates(
  additionalCertificate?: CaCertificate | readonly CaCertificate[],
  certificateSource: CaCertificateSource = getCACertificates
): CaCertificate[] {
  const certificates: CaCertificate[] = [
    ...new Set([...certificateSource("default"), ...certificateSource("system")])
  ];
  certificates.push(...additionalCertificates(additionalCertificate));
  return certificates;
}

export function certificateFingerprint256(certificate: Buffer | string): string {
  return new X509Certificate(certificate).fingerprint256.toUpperCase();
}

function certificateError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

export function validatePinnedPeerCertificate(
  hostname: string,
  peer: DetailedPeerCertificate | PeerCertificate,
  certificate: Buffer | string,
  now = Date.now()
): Error | undefined {
  const hostnameError = checkServerIdentity(hostname, peer);
  if (hostnameError !== undefined) return hostnameError;

  const validFrom = Date.parse(peer.valid_from);
  const validTo = Date.parse(peer.valid_to);
  if (!Number.isFinite(validFrom) || now < validFrom) {
    return certificateError(
      `The TLS certificate for ${hostname} is not valid yet.`,
      "CERT_NOT_YET_VALID"
    );
  }
  if (!Number.isFinite(validTo) || now > validTo) {
    return certificateError(`The TLS certificate for ${hostname} has expired.`, "CERT_HAS_EXPIRED");
  }

  const expectedFingerprint = certificateFingerprint256(certificate);
  const presentedFingerprint = peer.fingerprint256.toUpperCase();
  if (presentedFingerprint === expectedFingerprint) return undefined;
  return certificateError(
    `The TLS certificate for ${hostname} changed. Expected ${expectedFingerprint}, received ${presentedFingerprint}.`,
    API_CERTIFICATE_PIN_MISMATCH_CODE
  );
}

function tlsHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/gu, "");
}

class PinnedCertificateAgent extends https.Agent {
  private readonly hostname: string;
  private readonly port: number;

  constructor(
    url: URL,
    private readonly certificate: string
  ) {
    super({ keepAlive: false, maxCachedSessions: 0 });
    this.hostname = tlsHostname(url);
    this.port = url.port.length > 0 ? Number(url.port) : 443;
  }

  override createConnection(
    _options: https.RequestOptions,
    callback?: (error: Error | null, stream: Duplex) => void
  ): Duplex | null | undefined {
    if (callback === undefined) {
      throw new Error("Pinned TLS connection callback is required.");
    }
    let completed = false;
    // Electron does not accept the API server's self-signed leaf as a CA. Keep
    // the socket private from the HTTP agent until hostname, validity, and the
    // exact approved leaf fingerprint have all been checked below.
    const socket = connectTls({
      host: this.hostname,
      port: this.port,
      rejectUnauthorized: false,
      ...(net.isIP(this.hostname) === 0 ? { servername: this.hostname } : {})
    });
    const complete = (error: Error | null): void => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      callback(error, socket);
    };
    const timeout = setTimeout(() => {
      const error = new ApiRequestError(
        `TLS connection to ${this.hostname}:${this.port} timed out after ${PINNED_TLS_CONNECT_TIMEOUT_MS} ms`
      );
      complete(error);
      socket.destroy(error);
    }, PINNED_TLS_CONNECT_TIMEOUT_MS);
    socket.once("secureConnect", () => {
      const error = validatePinnedPeerCertificate(
        this.hostname,
        socket.getPeerCertificate(true),
        this.certificate
      );
      complete(error ?? null);
      if (error !== undefined) socket.destroy(error);
    });
    socket.once("error", (error) => complete(error));
    return undefined;
  }
}

export function describeApiConnectionError(error: unknown, origin: string): Error {
  const code = errorCode(error);
  if (TLS_TRUST_ERROR_CODES.has(code)) {
    const guidance =
      code === API_CERTIFICATE_PIN_MISMATCH_CODE
        ? "Open the Containerlab API Endpoints manager to review and explicitly trust the replacement certificate."
        : "Open the Containerlab API Endpoints manager and choose Trust and Connect, install the certificate in the system trust store, or configure containerlab.api.tls.caPath.";
    return Object.assign(
      new Error(
        `TLS certificate verification failed for ${origin}. Node and operating-system trust roots were checked. ${guidance} Disable verification only for an isolated development endpoint.`,
        { cause: error }
      ),
      { code }
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export class ApiAuthenticationRequiredError extends Error {
  constructor(message = "Sign in to clab-api-server before using this command.") {
    super(message);
    this.name = "ApiAuthenticationRequiredError";
  }
}

export class NdjsonLineDecoder {
  private pending = "";

  push(chunk: string): unknown[] {
    this.pending += chunk;
    const lines = this.pending.split(/\r?\n/u);
    this.pending = lines.pop() ?? "";
    return this.parseLines(lines);
  }

  finish(): unknown[] {
    const finalLine = this.pending;
    this.pending = "";
    return this.parseLines([finalLine]);
  }

  private parseLines(lines: string[]): unknown[] {
    const values: unknown[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith(":")) {
        continue;
      }
      values.push(JSON.parse(trimmed) as unknown);
    }
    return values;
  }
}

export function normalizedBaseUrl(raw: string): URL {
  const trimmed = raw.trim().replace(/\/+$/u, "");
  if (!trimmed) {
    throw new Error("A clab-api-server URL is required.");
  }
  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The clab-api-server URL must use http:// or https://.");
  }
  if (url.username || url.password) {
    throw new Error("The clab-api-server URL must not contain a username or password.");
  }
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    throw new Error(
      "The clab-api-server URL must be a server origin without a path, query, or fragment."
    );
  }
  url.pathname = "/";
  return url;
}

export function apiUrlRequiresInsecureCredentialConfirmation(raw: string): boolean {
  const url = normalizedBaseUrl(raw);
  const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  const loopback =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/u.test(hostname);
  return url.protocol === "http:" && !loopback;
}

export function apiUrlRequiresUnverifiedTlsConfirmation(raw: string, verifyTls: boolean): boolean {
  return normalizedBaseUrl(raw).protocol === "https:" && !verifyTls;
}

async function readBody(response: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of response) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function responseErrorMessage(method: string, path: string, status: number, body: string): string {
  let detail = body.trim();
  try {
    const parsed: unknown = JSON.parse(detail);
    if (typeof parsed === "object" && parsed !== null) {
      const error = Reflect.get(parsed, "error");
      if (typeof error === "string" && error.trim().length > 0) {
        detail = error.trim();
      }
    }
  } catch {
    // Preserve a plain-text response.
  }
  const suffix = detail.length > 0 ? `: ${detail}` : "";
  return `${method} ${path} failed (${status})${suffix}`;
}

export class ClabApiTransport {
  private readonly baseUrl: URL;
  private readonly additionalCa: CaCertificate[];
  private readonly pinnedAgent?: PinnedCertificateAgent;

  constructor(private readonly options: ApiTransportOptions) {
    this.baseUrl = normalizedBaseUrl(options.baseUrl);
    this.additionalCa = [];
    const caPath = options.caPath?.trim();
    if (caPath) {
      this.additionalCa.push(fs.readFileSync(caPath));
    }
    if (options.verifyTls && options.trustedCertificate !== undefined) {
      this.pinnedAgent = new PinnedCertificateAgent(this.baseUrl, options.trustedCertificate);
    }
  }

  getBaseUrl(): string {
    return this.baseUrl.toString().replace(/\/$/u, "");
  }

  async requestJson<T>(method: string, path: string, options: ApiRequestOptions = {}): Promise<T> {
    const response = await this.request(method, path, options);
    const body = await readBody(response);
    if (body.length === 0) {
      return undefined as T;
    }
    return JSON.parse(body.toString("utf8")) as T;
  }

  async requestText(
    method: string,
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<string> {
    const response = await this.request(method, path, options);
    return (await readBody(response)).toString("utf8");
  }

  async requestVoid(method: string, path: string, options: ApiRequestOptions = {}): Promise<void> {
    const response = await this.request(method, path, options);
    await readBody(response);
  }

  async streamNdjson(
    method: string,
    path: string,
    onValue: (value: unknown) => void | Promise<void>,
    options: ApiRequestOptions = {}
  ): Promise<void> {
    const response = await this.request(method, path, {
      ...options,
      timeoutMs: options.timeoutMs ?? 0
    });
    const decoder = new NdjsonLineDecoder();
    for await (const chunk of response) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      for (const value of decoder.push(text)) {
        await onValue(value);
      }
    }
    for (const value of decoder.finish()) {
      await onValue(value);
    }
  }

  async openWebSocket(path: string, token: string): Promise<WebSocket> {
    const url = new URL(path, `${this.getBaseUrl()}/`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const options: WebSocketClientOptions = {
      headers: { Authorization: `Bearer ${token}` }
    };
    if (url.protocol === "wss:") {
      if (this.pinnedAgent !== undefined) {
        options.agent = this.pinnedAgent;
      } else {
        options.rejectUnauthorized = this.options.verifyTls;
        if (this.options.verifyTls) {
          options.ca = resolveTrustedCaCertificates(this.additionalCa);
        }
      }
    }

    return await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url, options);
      const handleError = (error: Error) => reject(describeApiConnectionError(error, url.origin));
      socket.once("error", handleError);
      socket.once("open", () => {
        socket.off("error", handleError);
        resolve(socket);
      });
      socket.once("unexpected-response", (_request, response) => {
        if (response.statusCode === 401) void this.options.onUnauthorized?.();
        reject(
          new ApiRequestError(
            `WebSocket ${url.pathname} failed (${response.statusCode ?? 0})`,
            response.statusCode
          )
        );
        response.resume();
      });
    });
  }

  private async request(
    method: string,
    path: string,
    options: ApiRequestOptions
  ): Promise<IncomingMessage> {
    const url = new URL(path, `${this.getBaseUrl()}/`);
    const body = options.body;
    const headers: Record<string, string> = { ...options.headers };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }
    if (options.contentType) {
      headers["Content-Type"] = options.contentType;
    }
    if (typeof body === "string" || Buffer.isBuffer(body)) {
      headers["Content-Length"] = String(Buffer.byteLength(body));
    }

    const requestOptions: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers
    };
    if (url.protocol === "https:") {
      if (this.pinnedAgent !== undefined) {
        requestOptions.agent = this.pinnedAgent;
      } else {
        Object.assign(requestOptions, {
          rejectUnauthorized: this.options.verifyTls,
          ...(this.options.verifyTls ? { ca: resolveTrustedCaCertificates(this.additionalCa) } : {})
        });
      }
    }

    return await new Promise<IncomingMessage>((resolve, reject) => {
      const requestFn = url.protocol === "https:" ? https.request : http.request;
      const timeoutMs = options.timeoutMs ?? (options.signal ? 0 : DEFAULT_REQUEST_TIMEOUT_MS);
      let requestTimeout: ReturnType<typeof setTimeout> | undefined;
      const clearRequestTimeout = () => {
        if (requestTimeout) clearTimeout(requestTimeout);
        requestTimeout = undefined;
      };
      const handleResponse = async (response: IncomingMessage): Promise<void> => {
        response.once("end", clearRequestTimeout);
        response.once("close", clearRequestTimeout);
        const status = response.statusCode ?? 0;
        if (status >= 200 && status < 300) {
          resolve(response);
          return;
        }
        const responseBody = (await readBody(response)).toString("utf8");
        if (status === 401 && options.token) {
          await this.options.onUnauthorized?.();
        }
        reject(
          new ApiRequestError(
            responseErrorMessage(method, url.pathname, status, responseBody),
            status,
            responseBody
          )
        );
      };
      const req = requestFn(requestOptions, (response) => {
        void handleResponse(response).catch(reject);
      });

      const abort = () => {
        const error = new Error("Operation cancelled.");
        error.name = "AbortError";
        req.destroy(error);
      };
      if (options.signal?.aborted) {
        abort();
        return;
      }
      options.signal?.addEventListener("abort", abort, { once: true });
      req.once("close", () => options.signal?.removeEventListener("abort", abort));
      req.once("error", (error) => {
        clearRequestTimeout();
        reject(describeApiConnectionError(error, url.origin));
      });
      if (timeoutMs > 0) {
        req.setTimeout(timeoutMs, () => {
          req.destroy(
            new ApiRequestError(`${method} ${url.pathname} timed out after ${timeoutMs} ms`)
          );
        });
        requestTimeout = setTimeout(() => {
          req.destroy(
            new ApiRequestError(`${method} ${url.pathname} timed out after ${timeoutMs} ms`)
          );
        }, timeoutMs);
      }
      if (body instanceof Readable) {
        void pipeline(body, req).catch((error: unknown) => {
          clearRequestTimeout();
          const streamError = error instanceof Error ? error : new Error(String(error));
          req.destroy(streamError);
          reject(streamError);
        });
      } else {
        if (body !== undefined) req.write(body);
        req.end();
      }
    });
  }
}

export function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
