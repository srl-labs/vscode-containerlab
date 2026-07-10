/* global describe, it, beforeEach, afterEach */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Readable } from "stream";
import { gunzipSync } from "zlib";

import { expect } from "chai";

import {
  MAX_ARCHIVE_ENTRY_COUNT,
  assertLabArchiveLimits,
  createLabArchiveMultipartBody,
  createLabArchiveStream,
  hasBundledLabFiles,
  inspectLabArchive
} from "../../../src/backends/api/labArchive";

async function collectStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function tarFiles(tar: Buffer): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, length: number) => {
      const value = header.subarray(start, start + length).toString("utf8");
      const terminator = value.indexOf(String.fromCharCode(0));
      return terminator >= 0 ? value.slice(0, terminator) : value;
    };
    const name = field(0, 100);
    const prefix = field(345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(field(124, 12).trim() || "0", 8);
    const type = header[156];
    offset += 512;
    if (type === 0x30) result.set(fullName, tar.subarray(offset, offset + size));
    offset += Math.ceil(size / 512) * 512;
  }
  return result;
}

describe("lab archive inventory", () => {
  let root: string;
  let topology: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-clab-archive-"));
    topology = path.join(root, "demo.clab.yml");
    fs.writeFileSync(topology, "name: demo\n");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("excludes generated directories and symlinks", async () => {
    for (const directory of [".git", "node_modules", "dist", "out"]) {
      fs.mkdirSync(path.join(root, directory));
      fs.writeFileSync(path.join(root, directory, "secret"), "not uploaded");
    }
    fs.writeFileSync(path.join(root, "startup.cfg"), "configuration");
    fs.symlinkSync(path.join(root, "startup.cfg"), path.join(root, "linked.cfg"));

    const inventory = await inspectLabArchive(topology);
    expect(inventory.includedFiles).to.have.members(["demo.clab.yml", "startup.cfg"]);
    expect(hasBundledLabFiles(inventory)).to.equal(true);
  });

  it("does not treat the clab-ui annotations sidecar as deploy drift", async () => {
    fs.writeFileSync(`${topology}.annotations.json`, "{}");
    let inventory = await inspectLabArchive(topology);
    expect(hasBundledLabFiles(inventory)).to.equal(false);

    fs.writeFileSync(path.join(root, "startup.cfg"), "configuration");
    inventory = await inspectLabArchive(topology);
    expect(hasBundledLabFiles(inventory)).to.equal(true);
  });

  it("rejects inventory larger than 256 MiB before reading it", async () => {
    const oversized = path.join(root, "oversized.img");
    fs.closeSync(fs.openSync(oversized, "w"));
    fs.truncateSync(oversized, 257 * 1024 * 1024);
    try {
      await inspectLabArchive(topology);
      throw new Error("Expected inventory to be rejected");
    } catch (error) {
      expect((error as Error).message).to.include("maximum 256 MiB");
    }
  });

  it("streams a valid tar.gz without buffering an aggregate archive", async () => {
    fs.writeFileSync(path.join(root, "startup.cfg"), "configuration");
    const inventory = await inspectLabArchive(topology);
    const archive = await collectStream(await createLabArchiveStream(topology, inventory));
    const files = tarFiles(gunzipSync(archive));

    expect(files.get("demo.clab.yml")?.toString("utf8")).to.equal("name: demo\n");
    expect(files.get("startup.cfg")?.toString("utf8")).to.equal("configuration");
  });

  it("streams multipart framing around the tar.gz body", async () => {
    const body = await collectStream(
      await createLabArchiveMultipartBody(topology, "test-boundary")
    );
    const start = Buffer.from("--test-boundary\r\n");
    const end = Buffer.from("\r\n--test-boundary--\r\n");
    expect(body.subarray(0, start.length).equals(start)).to.equal(true);
    expect(body.subarray(body.length - end.length).equals(end)).to.equal(true);
  });

  it("rejects a file swapped to a symlink after upload confirmation", async () => {
    const startup = path.join(root, "startup.cfg");
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-clab-outside-"));
    const outside = path.join(outsideRoot, "secret");
    fs.writeFileSync(startup, "safe");
    fs.writeFileSync(outside, "outside secret");
    const inventory = await inspectLabArchive(topology);
    fs.unlinkSync(startup);
    fs.symlinkSync(outside, startup);

    try {
      await collectStream(await createLabArchiveStream(topology, inventory));
      throw new Error("Expected the swapped entry to be rejected");
    } catch (error) {
      expect((error as Error).message).to.match(/changed|symbolic|ELOOP/iu);
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("rejects an intermediate directory swapped outside the confirmed root", async () => {
    const configs = path.join(root, "configs");
    fs.mkdirSync(configs);
    fs.writeFileSync(path.join(configs, "startup.cfg"), "safe");
    const inventory = await inspectLabArchive(topology);
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-clab-outside-"));
    fs.writeFileSync(path.join(outsideRoot, "startup.cfg"), "outside secret");
    fs.renameSync(configs, `${configs}-old`);
    fs.symlinkSync(outsideRoot, configs);

    try {
      await collectStream(await createLabArchiveStream(topology, inventory));
      throw new Error("Expected the swapped directory to be rejected");
    } catch (error) {
      expect((error as Error).message).to.match(/changed|escaped|symbolic/iu);
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("enforces the server-compatible entry-count limit", () => {
    expect(() => assertLabArchiveLimits(MAX_ARCHIVE_ENTRY_COUNT + 1, 0)).to.throw(
      "too many archive entries"
    );
  });
});
