/* global describe, it, beforeEach, afterEach */
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { expect } from "chai";
import * as YAML from "yaml";

import { TopologyHostCore } from "../../../src/reactTopoViewer/shared/host/TopologyHostCore";
import { NodeFsAdapter } from "../../../src/reactTopoViewer/shared/io/NodeFsAdapter";
import { TopologyParser } from "../../../src/reactTopoViewer/shared/parsing/TopologyParser";

describe("TopologyParser empty YAML handling", () => {
  it("parses empty YAML content without throwing", () => {
    const result = TopologyParser.parseToReactFlow("");
    expect(result.labName).to.equal("topology");
    expect(result.topology.nodes).to.deep.equal([]);
    expect(result.topology.edges).to.deep.equal([]);
  });
});

describe("TopologyHostCore empty YAML fallback lab name", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "topology-host-empty-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("uses the topology filename as lab name when YAML has no name", async () => {
    const yamlPath = path.join(tempDir, "atest.clab.yml");
    await fs.writeFile(yamlPath, "", "utf8");

    const host = new TopologyHostCore({
      fs: new NodeFsAdapter(),
      yamlFilePath: yamlPath,
      mode: "edit",
      deploymentState: "unknown"
    });

    const snapshot = await host.getSnapshot();
    expect(snapshot.labName).to.equal("atest");
    expect(snapshot.nodes).to.deep.equal([]);
    expect(snapshot.edges).to.deep.equal([]);
  });

  it("persists addNode into an empty YAML file", async () => {
    const yamlPath = path.join(tempDir, "atest.clab.yml");
    await fs.writeFile(yamlPath, "", "utf8");

    const host = new TopologyHostCore({
      fs: new NodeFsAdapter(),
      yamlFilePath: yamlPath,
      mode: "edit",
      deploymentState: "unknown"
    });

    const initialSnapshot = await host.getSnapshot();
    const response = await host.applyCommand(
      {
        command: "addNode",
        payload: { id: "n1", name: "n1", extraData: { kind: "linux" } }
      },
      initialSnapshot.revision
    );

    expect(response.type).to.equal("topology-host:ack");

    const written = await fs.readFile(yamlPath, "utf8");
    const parsed = YAML.parse(written) as {
      topology?: { nodes?: Record<string, Record<string, unknown>>; links?: unknown[] };
    };

    expect(parsed.topology?.nodes?.n1).to.deep.include({ kind: "linux" });
    expect(parsed.topology?.links ?? []).to.deep.equal([]);
  });
});
