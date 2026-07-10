/* global after, describe, it */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Module from "module";

import { expect } from "chai";

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (
  request: string,
  parent: any,
  isMain: boolean,
  options: any
) {
  if (request === "vscode") {
    return path.join(__dirname, "..", "..", "helpers", "vscode-stub.js");
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

import { ApiContainerlabBackend } from "../../../src/backends/api/apiContainerlabBackend";

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

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

function createBackend(storagePath: string): ApiContainerlabBackend {
  return new ApiContainerlabBackend(
    {
      globalStorageUri: { fsPath: storagePath },
      secrets: {
        get: async () => "test-token",
        store: async () => {},
        delete: async () => {}
      },
      workspaceState: new MemoryMemento()
    } as any,
    {
      url: "http://127.0.0.1:8090",
      username: "test",
      allowInsecureHttp: false,
      unverifiedTlsConfirmed: false,
      verifyTls: true,
      pollIntervalMs: 60_000
    }
  );
}

describe("API topology materialization", () => {
  after(() => {
    (Module as any)._resolveFilename = originalResolve;
  });

  it("reads and writes the exact non-canonical inventory path", async () => {
    const storagePath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "vscode-containerlab-materialized-")
    );
    const backend = createBackend(storagePath);
    const reads: string[] = [];
    const writes: Array<{ content: string | Buffer; path: string }> = [];
    backend.operations.readTopologyFile = async (_labName, remotePath) => {
      reads.push(remotePath);
      return "name: vlan\n";
    };
    backend.operations.readTopologyFileIfExists = async (_labName, remotePath) => {
      reads.push(remotePath);
      return "{}";
    };
    backend.operations.readTopologyYaml = async () => {
      throw new Error("canonical topology route must not be used");
    };
    backend.operations.writeTopologyFile = async (_labName, remotePath, content) => {
      writes.push({ content, path: remotePath });
    };
    backend.operations.writeTopologyYaml = async () => {
      throw new Error("canonical topology route must not be used");
    };

    try {
      const materialized = await backend.materializeTopology(
        "srlinux-vlan-handling-lab",
        "vlan.clab.yml"
      );
      expect(reads).to.deep.equal(["vlan.clab.yml", "vlan.clab.yml.annotations.json"]);
      expect(await fs.promises.readFile(materialized.localPath, "utf8")).to.equal("name: vlan\n");
      const sourceRef = backend.resolveLocalSourceRef(materialized.localPath);
      expect(sourceRef).to.deep.equal({
        backendId: backend.id,
        labName: "srlinux-vlan-handling-lab",
        localPath: materialized.localPath,
        remotePath: "vlan.clab.yml",
        sourceLabName: "srlinux-vlan-handling-lab",
        sourcePath: "vlan.clab.yml"
      });
      expect(backend.resolveLabNameForResource({ labRef: sourceRef })).to.equal("vlan");
      expect(
        backend.resolveLabRef("vlan", "/home/test/.clab/srlinux-vlan-handling-lab/vlan.clab.yml")
      ).to.deep.equal({
        backendId: backend.id,
        labName: "vlan",
        localPath: materialized.localPath,
        remotePath: "/home/test/.clab/srlinux-vlan-handling-lab/vlan.clab.yml",
        sourceLabName: "srlinux-vlan-handling-lab",
        sourcePath: "vlan.clab.yml"
      });

      await backend.writeMaterializedTopologyDocument(
        "srlinux-vlan-handling-lab",
        materialized.localPath,
        "yaml",
        "name: changed\n"
      );
      await backend.writeMaterializedTopologyDocument(
        "srlinux-vlan-handling-lab",
        materialized.localPath,
        "annotations",
        "{}"
      );
      expect(writes).to.deep.equal([
        { content: "name: changed\n", path: "vlan.clab.yml" },
        { content: "{}", path: "vlan.clab.yml.annotations.json" }
      ]);
      expect(
        await backend.synchronizeMaterializedDocument(
          materialized.localPath,
          "name: saved-in-editor\n"
        )
      ).to.equal(true);
      expect(writes.at(-1)).to.deep.equal({
        content: "name: saved-in-editor\n",
        path: "vlan.clab.yml"
      });
      expect(
        await backend.synchronizeMaterializedDocument(
          "/home/test/real-workspace/vlan.clab.yml",
          "name: local\n"
        )
      ).to.equal(false);
    } finally {
      backend.dispose();
      await fs.promises.rm(storagePath, { force: true, recursive: true });
    }
  });

  it("keeps the runtime document endpoint for absolute server paths", async () => {
    const storagePath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "vscode-containerlab-runtime-source-")
    );
    const backend = createBackend(storagePath);
    let canonicalReads = 0;
    let canonicalWrites = 0;
    backend.operations.readTopologyYaml = async () => {
      canonicalReads++;
      return "name: running-lab\n";
    };
    backend.operations.readTopologyAnnotations = async () => undefined;
    backend.operations.readTopologyFile = async () => {
      throw new Error("scoped topology route must not be used");
    };
    backend.operations.writeTopologyYaml = async () => {
      canonicalWrites++;
    };
    backend.operations.writeTopologyFile = async () => {
      throw new Error("scoped topology route must not be used");
    };

    try {
      const materialized = await backend.materializeTopology(
        "running-lab",
        "/home/alice/labs/vlan.clab.yml"
      );
      await backend.writeMaterializedTopologyDocument(
        "running-lab",
        materialized.localPath,
        "yaml",
        "name: running-lab\n"
      );
      expect(canonicalReads).to.equal(1);
      expect(canonicalWrites).to.equal(1);
    } finally {
      backend.dispose();
      await fs.promises.rm(storagePath, { force: true, recursive: true });
    }
  });
});
