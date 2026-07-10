/* global describe, it */
import * as http from "http";
import { once } from "events";
import { Readable } from "stream";

import { expect } from "chai";

import {
  apiUrlRequiresInsecureCredentialConfirmation,
  apiUrlRequiresUnverifiedTlsConfirmation,
  ApiRequestError,
  ClabApiTransport,
  describeApiConnectionError,
  NdjsonLineDecoder,
  resolveTrustedCaCertificates
} from "../../../src/backends/api/apiTransport";

describe("ClabApiTransport", () => {
  it("combines Node defaults, the operating-system trust store, and an optional CA", () => {
    const source = (type: "default" | "system"): readonly string[] =>
      type === "default" ? ["bundled", "shared"] : ["system", "shared"];
    expect(resolveTrustedCaCertificates("custom", source)).to.deep.equal([
      "bundled",
      "shared",
      "system",
      "custom"
    ]);
  });

  it("turns certificate-chain failures into actionable trust guidance", () => {
    const error = describeApiConnectionError(
      { code: "DEPTH_ZERO_SELF_SIGNED_CERT" },
      "https://localhost:8090"
    );
    expect(error.message).to.include("operating-system trust roots were checked");
    expect(error.message).to.include("containerlab.api.tls.caPath");
  });

  it("canonicalizes a credential-free server origin", () => {
    const transport = new ClabApiTransport({
      baseUrl: "https://api.example.test/",
      verifyTls: true
    });
    expect(transport.getBaseUrl()).to.equal("https://api.example.test");
    expect(
      () =>
        new ClabApiTransport({
          baseUrl: "https://alice:secret@api.example.test",
          verifyTls: true
        })
    ).to.throw("must not contain");
    expect(
      () =>
        new ClabApiTransport({
          baseUrl: "https://api.example.test/base/path",
          verifyTls: true
        })
    ).to.throw("server origin");
    expect(apiUrlRequiresInsecureCredentialConfirmation("http://127.0.0.1:8090")).to.equal(false);
    expect(apiUrlRequiresInsecureCredentialConfirmation("http://[::1]:8090")).to.equal(false);
    expect(apiUrlRequiresInsecureCredentialConfirmation("http://api.example.test:8090")).to.equal(
      true
    );
    expect(apiUrlRequiresUnverifiedTlsConfirmation("https://api.example.test", false)).to.equal(
      true
    );
    expect(apiUrlRequiresUnverifiedTlsConfirmation("https://api.example.test", true)).to.equal(
      false
    );
    expect(apiUrlRequiresUnverifiedTlsConfirmation("http://api.example.test", false)).to.equal(
      false
    );
  });

  it("decodes NDJSON split across arbitrary chunks and ignores heartbeats", () => {
    const decoder = new NdjsonLineDecoder();
    expect(decoder.push('{"type":"log","li')).to.deep.equal([]);
    expect(decoder.push('ne":"one"}\n\n:{"heartbeat":true}\n{"type":"do')).to.deep.equal([
      { type: "log", line: "one" }
    ]);
    expect(decoder.push('ne","message":"ok"}\n')).to.deep.equal([{ type: "done", message: "ok" }]);
    expect(decoder.finish()).to.deep.equal([]);
  });

  it("surfaces typed HTTP errors without including authorization values", async () => {
    let unauthorizedCount = 0;
    const server = http.createServer((_request, response) => {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end('{"error":"expired session"}');
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    const transport = new ClabApiTransport({
      baseUrl: `http://127.0.0.1:${address.port}`,
      verifyTls: true,
      onUnauthorized: () => {
        unauthorizedCount++;
      }
    });

    try {
      await transport.requestJson("GET", "/api/v1/version", { token: "jwt-never-log" });
      throw new Error("Expected request to fail");
    } catch (error) {
      expect(error).to.be.instanceOf(ApiRequestError);
      expect((error as ApiRequestError).status).to.equal(401);
      expect((error as Error).message).to.include("expired session");
      expect((error as Error).message).not.to.include("jwt-never-log");
      expect(unauthorizedCount).to.equal(1);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("times out bounded non-streaming requests", async () => {
    const server = http.createServer(() => {
      // Deliberately leave the request unanswered.
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    const transport = new ClabApiTransport({
      baseUrl: `http://127.0.0.1:${address.port}`,
      verifyTls: true
    });

    try {
      await transport.requestJson("GET", "/slow", { timeoutMs: 30 });
      throw new Error("Expected request to time out");
    } catch (error) {
      expect(error).to.be.instanceOf(ApiRequestError);
      expect((error as Error).message).to.include("timed out after 30 ms");
    } finally {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    }
  });

  it("streams request bodies with chunked transfer and backpressure", async () => {
    let contentLength: string | undefined;
    let transferEncoding: string | undefined;
    const server = http.createServer((request, response) => {
      void (async () => {
        contentLength = request.headers["content-length"];
        transferEncoding = request.headers["transfer-encoding"];
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ body: Buffer.concat(chunks).toString("utf8") }));
      })();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    const transport = new ClabApiTransport({
      baseUrl: `http://127.0.0.1:${address.port}`,
      verifyTls: true
    });

    try {
      const result = await transport.requestJson<{ body: string }>("POST", "/upload", {
        body: Readable.from([Buffer.from("streamed "), Buffer.from("body")]),
        contentType: "application/octet-stream"
      });
      expect(result.body).to.equal("streamed body");
      expect(contentLength).to.equal(undefined);
      expect(transferEncoding).to.equal("chunked");
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
