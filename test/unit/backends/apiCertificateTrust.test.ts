/* global describe, it */
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import { once } from "events";

import { expect } from "chai";

import {
  ApiCertificateTrustStore,
  ensureApiEndpointCertificateTrust,
  inspectApiEndpointCertificate,
  verifyApiEndpointTls,
  type ApiPresentedCertificate
} from "../../../src/backends/api/apiCertificateTrust";
import {
  API_CERTIFICATE_PIN_MISMATCH_CODE,
  ClabApiTransport,
  certificateFingerprint256,
  isApiCertificateTrustError
} from "../../../src/backends/api/apiTransport";

const CERTIFICATE = fs.readFileSync(
  path.join(process.cwd(), "test", "fixtures", "tls", "localhost-cert.pem"),
  "utf8"
);
const PRIVATE_KEY = fs.readFileSync(
  path.join(process.cwd(), "test", "fixtures", "tls", "localhost-key.pem"),
  "utf8"
);
const REPLACEMENT_CERTIFICATE = fs.readFileSync(
  path.join(process.cwd(), "test", "fixtures", "tls", "replacement-cert.pem"),
  "utf8"
);

class MemoryMemento {
  readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as T | undefined;
  }

  update(key: string, value: unknown): Thenable<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function presented(
  certificatePem: string,
  origin = "https://localhost:8090"
): ApiPresentedCertificate {
  return {
    certificatePem,
    fingerprint256: certificateFingerprint256(certificatePem),
    issuer: "localhost",
    origin,
    serialNumber: "01",
    subject: "localhost",
    validFrom: "Jul 9 00:00:00 2026 GMT",
    validTo: "Jul 6 00:00:00 2036 GMT"
  };
}

function trustError(code = "DEPTH_ZERO_SELF_SIGNED_CERT"): Error {
  return Object.assign(new Error("certificate is not trusted"), { code });
}

async function capturedError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected the operation to fail");
}

describe("API endpoint certificate trust", () => {
  it("stores a validated certificate per normalized endpoint origin", async () => {
    const state = new MemoryMemento();
    const store = new ApiCertificateTrustStore(state);
    const saved = await store.save(presented(CERTIFICATE, "https://localhost:8090/"));

    expect(saved.origin).to.equal("https://localhost:8090");
    expect(store.get("https://localhost:8090/")?.fingerprint256).to.equal(
      certificateFingerprint256(CERTIFICATE)
    );
    expect(store.get("https://localhost:9443")).to.equal(undefined);

    await store.remove("https://localhost:8090");
    expect(store.get("https://localhost:8090")).to.equal(undefined);
  });

  it("prompts once, verifies the selected leaf, and persists the pin", async () => {
    const store = new ApiCertificateTrustStore(new MemoryMemento());
    const candidate = presented(CERTIFICATE);
    const trustedCertificates: Array<string | undefined> = [];
    let confirmations = 0;

    const trust = await ensureApiEndpointCertificateTrust({
      url: candidate.origin,
      verifyTls: true,
      store,
      confirm: async (presentedCertificate, previous) => {
        confirmations++;
        expect(presentedCertificate.fingerprint256).to.equal(candidate.fingerprint256);
        expect(previous).to.equal(undefined);
        return true;
      },
      dependencies: {
        inspectCertificate: async () => candidate,
        verifyConnection: async (options) => {
          trustedCertificates.push(options.trustedCertificate);
          if (options.trustedCertificate === undefined) throw trustError();
        }
      }
    });

    expect(confirmations).to.equal(1);
    expect(trustedCertificates).to.deep.equal([undefined, CERTIFICATE]);
    expect(trust?.fingerprint256).to.equal(candidate.fingerprint256);
    expect(store.get(candidate.origin)?.certificatePem).to.equal(CERTIFICATE);
  });

  it("requires approval before replacing a changed pin", async () => {
    const store = new ApiCertificateTrustStore(new MemoryMemento());
    const previous = await store.save(presented(CERTIFICATE));
    const replacement = presented(REPLACEMENT_CERTIFICATE);
    let confirmedPreviousFingerprint = "";

    const trust = await ensureApiEndpointCertificateTrust({
      url: replacement.origin,
      verifyTls: true,
      store,
      confirm: async (_certificate, current) => {
        confirmedPreviousFingerprint = current?.fingerprint256 ?? "";
        return true;
      },
      dependencies: {
        inspectCertificate: async () => replacement,
        verifyConnection: async (options) => {
          if (options.trustedCertificate === CERTIFICATE) {
            throw trustError(API_CERTIFICATE_PIN_MISMATCH_CODE);
          }
        }
      }
    });

    expect(confirmedPreviousFingerprint).to.equal(previous.fingerprint256);
    expect(trust?.fingerprint256).to.equal(replacement.fingerprint256);
    expect(store.get(replacement.origin)?.fingerprint256).to.equal(replacement.fingerprint256);
  });

  it("does not offer to re-approve an unchanged certificate that fails validation", async () => {
    const store = new ApiCertificateTrustStore(new MemoryMemento());
    const candidate = presented(CERTIFICATE);
    await store.save(candidate);
    let confirmationCalled = false;

    const error = await capturedError(
      ensureApiEndpointCertificateTrust({
        url: candidate.origin,
        verifyTls: true,
        store,
        confirm: async () => {
          confirmationCalled = true;
          return true;
        },
        dependencies: {
          inspectCertificate: async () => candidate,
          verifyConnection: async () => {
            throw trustError();
          }
        }
      })
    );

    expect(confirmationCalled).to.equal(false);
    expect(error.message).to.include("previously trusted certificate");
  });

  it("verifies a real self-signed server after pinning without changing system trust", async () => {
    let requestCount = 0;
    const server = https.createServer(
      { cert: CERTIFICATE, key: PRIVATE_KEY },
      (_request, response) => {
        requestCount++;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end('{"status":"healthy"}');
      }
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("No test server address");
    const url = `https://127.0.0.1:${address.port}`;

    try {
      const initialError = await capturedError(verifyApiEndpointTls({ url }));
      expect(isApiCertificateTrustError(initialError)).to.equal(true);

      const certificate = await inspectApiEndpointCertificate(url);
      expect(certificate.subject).to.equal("localhost");
      await verifyApiEndpointTls({ url, trustedCertificate: certificate.certificatePem });

      const transport = new ClabApiTransport({
        baseUrl: url,
        verifyTls: true,
        trustedCertificate: certificate.certificatePem
      });
      expect(await transport.requestJson("GET", "/health")).to.deep.equal({ status: "healthy" });
      expect(requestCount).to.equal(1);

      const stalePin = new ClabApiTransport({
        baseUrl: url,
        verifyTls: true,
        trustedCertificate: REPLACEMENT_CERTIFICATE
      });
      expect(
        isApiCertificateTrustError(await capturedError(stalePin.requestJson("GET", "/health")))
      ).to.equal(true);
      expect(requestCount).to.equal(1);
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    }
  });
});
