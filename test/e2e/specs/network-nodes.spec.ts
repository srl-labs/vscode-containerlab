import * as fs from "fs";
import * as path from "path";

import type { Page } from "@playwright/test";
import Ajv from "ajv";
import * as YAML from "yaml";

import { test, expect } from "../fixtures/topoviewer";
import { openNetworkEditor } from "../helpers/react-flow-helpers";

const EMPTY_FILE = "empty.clab.yml";
const SIMPLE_FILE = "simple.clab.yml";
const KIND_NOKIA_SRLINUX = "nokia_srlinux";

const SEL_APPLY_BTN = '[data-testid="panel-apply-btn"]';

// Load schema for validation
const schemaPath = path.join(__dirname, "../../../schema/clab.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv({ strict: false, allErrors: true });
const validateSchema = ajv.compile(schema);

function unknownErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

function validateYamlAgainstSchema(yamlContent: string): { valid: boolean; errors: string[] } {
  try {
    const parsed = YAML.parse(yamlContent);
    const valid = validateSchema(parsed);
    if (!valid) {
      const errors = validateSchema.errors?.map((e) => `${e.instancePath}: ${e.message}`) ?? [];
      return { valid: false, errors };
    }
    return { valid: true, errors: [] };
  } catch (error: unknown) {
    return { valid: false, errors: [`YAML parse error: ${unknownErrorMessage(error)}`] };
  }
}

const SINGLE_ENDPOINT_NETWORK_TYPES = ["host", "mgmt-net", "macvlan", "vxlan", "vxlan-stitch", "dummy"] as const;
const BRIDGE_TYPES = ["bridge", "ovs-bridge"] as const;
const ALL_NETWORK_TYPES = [...SINGLE_ENDPOINT_NETWORK_TYPES, ...BRIDGE_TYPES] as const;

const SRL_POSITIONS = {
  srl1: { x: 200, y: 300 },
  srl2: { x: 600, y: 300 }
} as const;

async function setupEmptyTopology(topoViewerPage: any): Promise<void> {
  await topoViewerPage.resetFiles();
  await topoViewerPage.gotoFile(EMPTY_FILE);
  await topoViewerPage.waitForCanvasReady();
  await topoViewerPage.setEditMode();
  await topoViewerPage.unlock();
}

async function createBaseNodes(page: Page, topoViewerPage: any): Promise<void> {
  await topoViewerPage.createNode("srl1", SRL_POSITIONS.srl1, KIND_NOKIA_SRLINUX);
  await topoViewerPage.createNode("srl2", SRL_POSITIONS.srl2, KIND_NOKIA_SRLINUX);
  await page.waitForTimeout(500);
  expect(await topoViewerPage.getNodeCount()).toBe(2);
}

function networkPositionForIndex(i: number, targetNode: "srl1" | "srl2") {
  const xOffset = (i % 4) * 100 - 150;
  const yOffset = i < 4 ? -150 : 150;
  const base = targetNode === "srl1" ? SRL_POSITIONS.srl1 : SRL_POSITIONS.srl2;
  return { x: base.x + xOffset, y: base.y + yOffset };
}

async function createNetworksAndLinks(page: Page, topoViewerPage: any) {
  const createdNetworkIds: string[] = [];
  const createdBridgeIds: string[] = [];
  const createdLinkBased: Array<{ id: string; type: string }> = [];

  let interfaceCounter = 1;
  for (let i = 0; i < ALL_NETWORK_TYPES.length; i++) {
    const networkType = ALL_NETWORK_TYPES[i];
    const targetNode = i < 4 ? "srl1" : "srl2";
    const position = networkPositionForIndex(i, targetNode);

    const networkId = await topoViewerPage.createNetwork(position, networkType);
    expect(networkId).not.toBeNull();
    createdNetworkIds.push(networkId);

    const isBridge = (BRIDGE_TYPES as readonly string[]).includes(networkType);
    if (isBridge) {
      createdBridgeIds.push(networkId);
      // Bridges require interfaces on both ends.
      await topoViewerPage.createLink(networkId, targetNode, `eth${interfaceCounter}`, `e1-${interfaceCounter}`);
    } else {
      createdLinkBased.push({ id: networkId!, type: networkType });
      // Link-based networks: real node interface to network eth0.
      await topoViewerPage.createLink(targetNode, networkId, `e1-${interfaceCounter}`, "eth0");
    }

    interfaceCounter++;
    await page.waitForTimeout(350);
  }

  return { createdNetworkIds, createdBridgeIds, createdLinkBased };
}

function assertCreatedIdsAreUsed(
  createdNetworkIds: string[],
  createdBridgeIds: string[],
  createdLinkBased: Array<{ id: string; type: string }>
): void {
  expect(createdNetworkIds).toHaveLength(ALL_NETWORK_TYPES.length);
  for (const id of createdBridgeIds) {
    expect(createdNetworkIds).toContain(id);
  }
  for (const { id } of createdLinkBased) {
    expect(createdNetworkIds).toContain(id);
  }
}

function assertYamlContainsNetworkNodes(
  yaml: string,
  parsedYaml: unknown,
  createdBridgeIds: string[],
  createdLinkBased: Array<{ id: string; type: string }>
): void {
  // YAML should contain bridges as nodes.
  for (const bridgeId of createdBridgeIds) {
    expect(yaml).toContain(`${bridgeId}:`);
  }
  for (const bridgeType of BRIDGE_TYPES) {
    if (createdBridgeIds.some((id) => id.startsWith(bridgeType))) {
      expect(yaml).toContain(`kind: ${bridgeType}`);
    }
  }

  // YAML should contain links and have one link for each link-based network type.
  expect(yaml).toContain("links:");
  for (const { type } of createdLinkBased) {
    expect(findLinkByType(parsedYaml, type), `Missing link type ${type} in YAML`).toBeDefined();
  }
}

function assertYamlContainsNetworkDefaults(yaml: string): void {
  // VXLAN family links should have default fields present when type is used.
  if (yaml.includes("type: vxlan") || yaml.includes("type: vxlan-stitch")) {
    expect(yaml).toContain("remote:");
    expect(yaml).toContain("vni:");
    expect(yaml).toContain("dst-port:");
  }

  // Dummy links should use the extended single endpoint format in our YAML.
  if (yaml.includes("type: dummy")) {
    expect(yaml).toContain("endpoint:");
    expect(yaml).toContain("node:");
    expect(yaml).toContain("interface:");
  }
}

function assertAnnotationsContainNetworkNodes(
  annotations: any,
  createdBridgeIds: string[],
  createdLinkBased: Array<{ id: string; type: string }>
): void {
  // Bridges use nodeAnnotations, others use networkNodeAnnotations.
  for (const bridgeId of createdBridgeIds) {
    const ann = annotations.nodeAnnotations?.find((n: any) => n.id === bridgeId);
    expect(ann).toBeDefined();
    expect(ann?.position).toBeDefined();
  }
  for (const { id: networkId, type } of createdLinkBased) {
    const ann = annotations.networkNodeAnnotations?.find((n: any) => n.id === networkId);
    expect(ann).toBeDefined();
    expect(ann?.type).toBe(type);
    expect(ann?.position).toBeDefined();
  }
}

test.describe("Network Nodes E2E Tests", () => {
  test.setTimeout(180000);

  test("comprehensive network nodes workflow with schema validation", async ({ page, topoViewerPage }) => {
    await setupEmptyTopology(topoViewerPage);
    expect(await topoViewerPage.getNodeCount()).toBe(0);

    await createBaseNodes(page, topoViewerPage);
    const { createdNetworkIds, createdBridgeIds, createdLinkBased } = await createNetworksAndLinks(
      page,
      topoViewerPage
    );
    assertCreatedIdsAreUsed(createdNetworkIds, createdBridgeIds, createdLinkBased);

    // Each created network is connected by exactly one edge.
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(
      ALL_NETWORK_TYPES.length
    );

    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const validation = validateYamlAgainstSchema(yaml);
    expect(validation.valid).toBe(true);

    const parsedYaml = YAML.parse(yaml);

    assertYamlContainsNetworkNodes(yaml, parsedYaml, createdBridgeIds, createdLinkBased);
    assertYamlContainsNetworkDefaults(yaml);

    // Validate annotations for all created networks.
    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    expect(annotations).toBeDefined();

    assertAnnotationsContainNetworkNodes(annotations, createdBridgeIds, createdLinkBased);

    // Verify graph state includes the created nodes.
    const networkNodeIds = await topoViewerPage.getNetworkNodeIds();
    expect(networkNodeIds).toEqual(expect.arrayContaining(createdLinkBased.map((x) => x.id)));
    const allNodeIds = await topoViewerPage.getNodeIds();
    expect(allNodeIds).toEqual(expect.arrayContaining(["srl1", "srl2", ...createdBridgeIds]));

    // Reload and ensure ids remain stable and do not duplicate.
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    const afterReloadNetworkIds = await topoViewerPage.getNetworkNodeIds();
    expect(afterReloadNetworkIds).toEqual(expect.arrayContaining(createdLinkBased.map((x) => x.id)));
    for (const { id } of createdLinkBased) {
      expect(afterReloadNetworkIds.filter((x: string) => x === id).length).toBe(1);
    }

    const afterReloadNodeIds = await topoViewerPage.getNodeIds();
    expect(afterReloadNodeIds).toEqual(expect.arrayContaining(["srl1", "srl2", ...createdBridgeIds]));
    for (const id of createdBridgeIds) {
      expect(afterReloadNodeIds.filter((x: string) => x === id).length).toBe(1);
    }
  });
});

interface EndpointObj {
  node?: unknown;
  interface?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEndpointObj(value: unknown): value is EndpointObj {
  return isRecord(value);
}

function getTopologyLinks(parsed: unknown): Array<Record<string, unknown>> {
  if (!isRecord(parsed)) return [];
  const topology = parsed.topology;
  if (!isRecord(topology)) return [];
  const links = topology.links;
  if (!Array.isArray(links)) return [];
  return links.filter((link): link is Record<string, unknown> => isRecord(link));
}

function endpointObjToString(epObj: EndpointObj): string | null {
  if (typeof epObj.node !== "string") return null;
  const iface = typeof epObj.interface === "string" ? epObj.interface : "";
  return iface.length > 0 ? `${epObj.node}:${iface}` : epObj.node;
}

function processEndpoint(ep: unknown): string | null {
  if (typeof ep === "string") return ep;
  if (isEndpointObj(ep)) return endpointObjToString(ep);
  return null;
}

function processEndpointsArray(endpointsField: unknown): string[] {
  if (!Array.isArray(endpointsField)) return [];
  return endpointsField.map(processEndpoint).filter((s): s is string => s !== null);
}

function processSingularEndpoint(endpointField: unknown): string | null {
  if (typeof endpointField === "string") return endpointField;
  if (isEndpointObj(endpointField)) {
    return endpointObjToString(endpointField);
  }
  return null;
}

function collectLinkEndpointStrings(parsed: unknown): string[] {
  const links = getTopologyLinks(parsed);
  const endpoints: string[] = [];

  for (const link of links) {
    endpoints.push(...processEndpointsArray(link.endpoints));
    const singular = processSingularEndpoint(link.endpoint);
    if (singular !== null) endpoints.push(singular);
  }

  return endpoints;
}

function linkTypeFromLink(link: Record<string, unknown>): string | undefined {
  const type = (link as { type?: unknown }).type;
  return typeof type === "string" ? type : undefined;
}

function findLinkByType(parsed: unknown, linkType: string): Record<string, unknown> | undefined {
  const links = getTopologyLinks(parsed);
  return links.find((link) => linkTypeFromLink(link) === linkType);
}

function endpointMatchesNetworkId(endpoint: string, networkId: string): boolean {
  return endpoint === networkId || endpoint.startsWith(`${networkId}:`);
}

function linkReferencesNetwork(link: Record<string, unknown>, networkId: string, networkType: string): boolean {
  const type = linkTypeFromLink(link);
  if (type === networkType) return true;
  const endpoints = processEndpointsArray(link.endpoints);
  const singular = processSingularEndpoint(link.endpoint);
  if (singular !== null) endpoints.push(singular);
  return endpoints.some((ep) => endpointMatchesNetworkId(ep, networkId));
}

function networkLinkExists(parsed: unknown, networkId: string, networkType: string): boolean {
  const links = getTopologyLinks(parsed);
  return links.some((link) => linkReferencesNetwork(link, networkId, networkType));
}

async function expectNetworkEditorOpen(page: Page): Promise<void> {
  await expect(page.getByText("Network Editor", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#network-type")).toBeVisible({ timeout: 5000 });
}

/**
 * Network Nodes E2E Tests (MUI version)
 *
 * Tests network node creation, schema validation, position persistence,
 * and deletion using fixture methods.
 */
test.describe("Network YAML Schema Validation", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("host link YAML passes schema validation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const hostId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "host");
    expect(hostId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", hostId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const validation = validateYamlAgainstSchema(yaml);
    expect(validation.valid).toBe(true);
  });

  test("dummy link YAML passes schema validation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const dummyId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "dummy");
    expect(dummyId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", dummyId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const validation = validateYamlAgainstSchema(yaml);
    expect(validation.valid).toBe(true);
  });

  test("bridge node YAML passes schema validation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const bridgeId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "bridge");
    expect(bridgeId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink(bridgeId!, "router1", "eth0", "e1-1");
    await page.waitForTimeout(500);

    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const validation = validateYamlAgainstSchema(yaml);
    expect(validation.valid).toBe(true);
  });

  test("vxlan link YAML passes schema validation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const vxlanId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "vxlan");
    expect(vxlanId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", vxlanId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const validation = validateYamlAgainstSchema(yaml);
    expect(validation.valid).toBe(true);
  });
});

test.describe("Network Node Position Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("host network position persists after reload", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const hostId = await topoViewerPage.createNetwork({ x: 100, y: 150 }, "host");
    expect(hostId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", hostId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    const posBefore = await topoViewerPage.getNodePosition(hostId!);

    // Reload
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    const networkIds = await topoViewerPage.getNetworkNodeIds();
    expect(networkIds).toContain(hostId);

    const posAfter = await topoViewerPage.getNodePosition(hostId!);
    expect(Math.abs(posAfter.x - posBefore.x)).toBeLessThan(50);
    expect(Math.abs(posAfter.y - posBefore.y)).toBeLessThan(50);
  });

  test("bridge node position persists after reload", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const bridgeId = await topoViewerPage.createNetwork({ x: 100, y: 150 }, "bridge");
    expect(bridgeId).not.toBeNull();
    await page.waitForTimeout(300);

    // Connect bridge (ensures it is rendered deterministically)
    await topoViewerPage.createLink(bridgeId!, "router1", "eth0", "e1-1");
    await page.waitForTimeout(500);

    const posBefore = await topoViewerPage.getNodePosition(bridgeId!);

    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain(bridgeId);

    const posAfter = await topoViewerPage.getNodePosition(bridgeId!);
    expect(Math.abs(posAfter.x - posBefore.x)).toBeLessThan(50);
    expect(Math.abs(posAfter.y - posBefore.y)).toBeLessThan(50);
  });
});

test.describe("Network Node Deletion", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("deleting host network removes from annotations", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const hostId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "host");
    expect(hostId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", hostId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    let networkIds = await topoViewerPage.getNetworkNodeIds();
    expect(networkIds).toContain(hostId);

    await topoViewerPage.deleteNode(hostId!);
    await page.waitForTimeout(500);

    networkIds = await topoViewerPage.getNetworkNodeIds();
    expect(networkIds).not.toContain(hostId);

    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const netAnn = annotations.networkNodeAnnotations?.find((n: { id: string }) => n.id === hostId);
    expect(netAnn).toBeUndefined();
  });

  test("deleting bridge removes from YAML and annotations", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const bridgeId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "bridge");
    expect(bridgeId).not.toBeNull();
    await page.waitForTimeout(500);

    let yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain(`${bridgeId}:`);

    await topoViewerPage.deleteNode(bridgeId!);
    await page.waitForTimeout(500);

    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).not.toContain(`${bridgeId}:`);

    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const nodeAnn = annotations.nodeAnnotations?.find((n: { id: string }) => n.id === bridgeId);
    expect(nodeAnn).toBeUndefined();
  });

  test("deleting connected network removes the link from YAML", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const mgmtNetId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "mgmt-net");
    expect(mgmtNetId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", mgmtNetId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    let yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(true);

    await topoViewerPage.deleteNode(mgmtNetId!);

    await expect
      .poll(async () => {
        yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        return networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net");
      }, { timeout: 5000 })
      .toBe(false);
  });
});

test.describe("Network Type Specific Tests", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("bridge nodes are saved to YAML nodes section", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const bridgeId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "bridge");
    expect(bridgeId).not.toBeNull();
    await page.waitForTimeout(500);

    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain(`${bridgeId}:`);
    expect(yaml).toContain("kind: bridge");
  });

  test("host links extract host-interface from network ID", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const hostId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "host");
    expect(hostId).not.toBeNull();
    expect(hostId).toMatch(/^host:eth\d+$/);
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", hostId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const validation = validateYamlAgainstSchema(yaml);
    expect(validation.valid).toBe(true);
  });

  test("dummy links use extended single endpoint format", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const dummyId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "dummy");
    expect(dummyId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", dummyId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const parsedYaml = YAML.parse(yaml);

    expect(networkLinkExists(parsedYaml, dummyId!, "dummy")).toBe(true);
    expect(yaml).toContain("type: dummy");
    // Extended single-endpoint format uses an `endpoint` object with node/interface fields.
    expect(yaml).toContain("endpoint:");
    expect(yaml).toContain("node:");
    expect(yaml).toContain("interface:");

    const validation = validateYamlAgainstSchema(yaml);
    expect(validation.valid).toBe(true);
  });

  test("vxlan links have required properties with defaults", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const vxlanId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "vxlan");
    expect(vxlanId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", vxlanId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const parsedYaml = YAML.parse(yaml);
    expect(networkLinkExists(parsedYaml, vxlanId!, "vxlan")).toBe(true);
    if (yaml.includes("type: vxlan")) {
      expect(yaml).toContain("remote:");
      expect(yaml).toContain("vni:");
      expect(yaml).toContain("dst-port:");
    }

    const validation = validateYamlAgainstSchema(yaml);
    expect(validation.valid).toBe(true);
  });
});

test.describe("Network Node Modification", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("editing vxlan properties updates YAML", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const vxlanId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "vxlan");
    expect(vxlanId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", vxlanId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    await openNetworkEditor(page, vxlanId!);
    await expectNetworkEditorOpen(page);

    await page.locator("#vxlan-remote").fill("10.0.0.1");
    await page.locator("#vxlan-vni").fill("500");
    await page.locator("#vxlan-dst-port").fill("4789");
    await page.locator("#vxlan-src-port").fill("4790");
    await page.locator("#network-mtu").fill("9000");

    await page.locator(SEL_APPLY_BTN).click();

    // Poll until the persisted YAML reflects the edits (avoids false negatives due to async host saves).
    await expect
      .poll(async () => {
        const parsed = YAML.parse(await topoViewerPage.getYamlFromFile(EMPTY_FILE));
        const link = findLinkByType(parsed, "vxlan");
        return {
          remote: link?.remote,
          vni: link?.vni,
          dst: link?.["dst-port"],
          src: link?.["src-port"],
          mtu: link?.mtu
        };
      }, { timeout: 15000 })
      .toEqual({ remote: "10.0.0.1", vni: 500, dst: 4789, src: 4790, mtu: 9000 });

    const yamlAfter = await topoViewerPage.getYamlFromFile(EMPTY_FILE);

    const validation = validateYamlAgainstSchema(yamlAfter);
    expect(validation.valid).toBe(true);

  });

  test("editing host interface updates YAML and node id", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const hostId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "host");
    expect(hostId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", hostId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    await openNetworkEditor(page, hostId!);
    await expectNetworkEditorOpen(page);

    await page.locator("#network-interface").fill("eth1");
    await page.locator(SEL_APPLY_BTN).click();

    const newHostId = "host:eth1";

    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        const parsed = YAML.parse(yaml);
        const link = findLinkByType(parsed, "host");
        return link?.["host-interface"] === "eth1";
      }, { timeout: 15000 })
      .toBe(true);

    await expect
      .poll(async () => await topoViewerPage.getNetworkNodeIds(), { timeout: 15000 })
      .toEqual(expect.arrayContaining([newHostId]));
    const networkIds = await topoViewerPage.getNetworkNodeIds();
    expect(networkIds).not.toContain(hostId);

    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    expect(annotations.networkNodeAnnotations?.some((n: any) => n.id === newHostId)).toBe(true);
    expect(annotations.networkNodeAnnotations?.some((n: any) => n.id === hostId)).toBe(false);

  });

  test("editing bridge label persists to annotations", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const bridgeId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "bridge");
    expect(bridgeId).not.toBeNull();
    await page.waitForTimeout(300);

    await topoViewerPage.createLink(bridgeId!, "router1", "eth0", "e1-1");
    await page.waitForTimeout(500);

    await openNetworkEditor(page, bridgeId!);
    await expectNetworkEditorOpen(page);

    await page.locator("#network-label").fill("LAN A");
    await page.locator(SEL_APPLY_BTN).click();

    await expect
      .poll(async () => {
        const ann = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        const nodeAnn = ann.nodeAnnotations?.find((n: any) => n.id === bridgeId);
        return nodeAnn?.label;
      }, { timeout: 5000 })
      .toBe("LAN A");

  });
});

test.describe("Bridge Rename Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  for (const bridgeType of BRIDGE_TYPES) {
    test(`renaming ${bridgeType} updates YAML endpoints and delete cleans YAML`, async ({
      page,
      topoViewerPage
    }) => {
      const routerId = "router1";
      const newBridgeId = bridgeType === "bridge" ? "br-main" : "ovs-br-main";

      await topoViewerPage.createNode(routerId, { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
      await page.waitForTimeout(300);

      const bridgeId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, bridgeType);
      expect(bridgeId).not.toBeNull();
      await page.waitForTimeout(300);

      await topoViewerPage.createLink(bridgeId!, routerId, "eth0", "e1-1");
      await page.waitForTimeout(500);

      await openNetworkEditor(page, bridgeId!);
      await expectNetworkEditorOpen(page);

      await page.locator("#network-interface").fill(newBridgeId);
      await page.locator(SEL_APPLY_BTN).click();

      await expect
        .poll(async () => {
          const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
          const parsed = YAML.parse(yaml);
          return Object.keys((parsed)?.topology?.nodes ?? {});
        }, { timeout: 5000 })
        .toContain(newBridgeId);

      const yamlAfterRename = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
      const parsedAfterRename = YAML.parse(yamlAfterRename);
      const nodeIdsAfterRename = Object.keys((parsedAfterRename)?.topology?.nodes ?? {});
      expect(nodeIdsAfterRename).toContain(newBridgeId);
      expect(nodeIdsAfterRename).not.toContain(bridgeId);

      const endpointsAfterRename = collectLinkEndpointStrings(parsedAfterRename);
      expect(endpointsAfterRename.some((ep) => ep.startsWith(`${newBridgeId}:`))).toBe(true);
      expect(endpointsAfterRename.some((ep) => ep.startsWith(`${bridgeId}:`))).toBe(false);

      const graphNodeIds = await topoViewerPage.getNodeIds();
      expect(graphNodeIds).toContain(newBridgeId);
      expect(graphNodeIds).not.toContain(bridgeId);

      await topoViewerPage.deleteNode(newBridgeId);

      await expect
        .poll(async () => {
          const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
          const parsed = YAML.parse(yaml);
          return Object.keys((parsed)?.topology?.nodes ?? {}).includes(newBridgeId);
        }, { timeout: 5000 })
        .toBe(false);

      const yamlAfterDelete = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
      const parsedAfterDelete = YAML.parse(yamlAfterDelete);
      const endpointsAfterDelete = collectLinkEndpointStrings(parsedAfterDelete);
      expect(endpointsAfterDelete.some((ep) => ep.startsWith(`${newBridgeId}:`))).toBe(false);
    });
  }
});

test.describe("Network Node Undo/Redo", () => {
  test.setTimeout(120000);

  test("mgmt-net link undo/redo with node move in between", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBeGreaterThanOrEqual(1);

    const mgmtNetId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "mgmt-net");
    expect(mgmtNetId).not.toBeNull();
    expect(mgmtNetId!).toMatch(/^mgmt-net:/);
    await page.waitForTimeout(500);

    // Move network node (adds a move entry to undo stack)
    await topoViewerPage.dragNode(mgmtNetId!, { x: 150, y: 250 });
    await page.waitForTimeout(500);

    // Create link
    await topoViewerPage.createLink(mgmtNetId!, "srl2", "eth0", "e1-2");
    await page.waitForTimeout(500);

    let yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(true);
    expect(await topoViewerPage.getEdgeCount()).toBe(initialEdgeCount + 1);

    // Undo link, move, create
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();

    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 5000 }).toBe(initialEdgeCount);
    yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(false);

    // Redo create, move, link
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();

    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 5000 }).toBe(initialEdgeCount + 1);
    yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(true);
  });

  test("mgmt-net link undo/redo with existing topology", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    expect(await topoViewerPage.getNodeCount()).toBe(2);
    const initialEdgeCount = await topoViewerPage.getEdgeCount();
    expect(initialEdgeCount).toBe(1);

    const mgmtNetId = await topoViewerPage.createNetwork({ x: 120, y: 260 }, "mgmt-net");
    expect(mgmtNetId).not.toBeNull();
    expect(mgmtNetId!).toMatch(/^mgmt-net:/);
    await page.waitForTimeout(500);

    await topoViewerPage.createLink("srl2", mgmtNetId!, "e1-2", "eth0");
    await page.waitForTimeout(500);

    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(initialEdgeCount + 1);
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
        return networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net");
      }, { timeout: 15000 })
      .toBe(true);

    // Undo link then undo network creation.
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(initialEdgeCount);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await expect.poll(async () => (await topoViewerPage.getNodeIds()).includes(mgmtNetId!), { timeout: 15000 }).toBe(false);

    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
        return networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net");
      }, { timeout: 15000 })
      .toBe(false);

    // Redo network then redo link.
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();
    await expect.poll(async () => (await topoViewerPage.getNodeIds()).includes(mgmtNetId!), { timeout: 15000 }).toBe(true);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(initialEdgeCount + 1);

    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
        return networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net");
      }, { timeout: 15000 })
      .toBe(true);
  });

  test("mgmt-net network deletion and undo restores link", async ({ page, topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    const initialEdgeCount = await topoViewerPage.getEdgeCount();

    const mgmtNetId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "mgmt-net");
    expect(mgmtNetId).not.toBeNull();
    await page.waitForTimeout(500);

    await topoViewerPage.createLink("srl2", mgmtNetId!, "e1-2", "eth0");
    await page.waitForTimeout(500);

    let yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(true);
    expect(await topoViewerPage.getEdgeCount()).toBe(initialEdgeCount + 1);

    // Delete network node: link should be removed too.
    await topoViewerPage.deleteNode(mgmtNetId!);

    await expect
      .poll(async () => {
        const currentYaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
        return networkLinkExists(YAML.parse(currentYaml), mgmtNetId!, "mgmt-net");
      }, { timeout: 5000 })
      .toBe(false);

    // Undo should restore both node and link.
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();

    await expect
      .poll(async () => {
        const currentYaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
        return networkLinkExists(YAML.parse(currentYaml), mgmtNetId!, "mgmt-net");
      }, { timeout: 5000 })
      .toBe(true);

    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 5000 }).toBe(initialEdgeCount + 1);
  });

  test("comprehensive undo/redo workflow for network nodes and links", async ({
    page,
    topoViewerPage
  }) => {
    test.setTimeout(180000);

    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Step 1: Create router node
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);
    expect(await topoViewerPage.getNodeCount()).toBe(1);

    // Step 2: Create host network and undo/redo creation
    const hostId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "host");
    expect(hostId).not.toBeNull();
    await page.waitForTimeout(300);
    expect(await topoViewerPage.getNodeCount()).toBe(2);

    await expect
      .poll(async () => {
        const ann = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        return ann.networkNodeAnnotations?.some((n: any) => n.id === hostId && n.type === "host") ?? false;
      }, { timeout: 15000 })
      .toBe(true);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.getNodeCount(), { timeout: 15000 }).toBe(1);
    await expect
      .poll(async () => {
        const ann = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        return ann.networkNodeAnnotations?.some((n: any) => n.id === hostId) ?? false;
      }, { timeout: 15000 })
      .toBe(false);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();
    await expect.poll(() => topoViewerPage.getNodeCount(), { timeout: 15000 }).toBe(2);
    await expect
      .poll(async () => {
        const ann = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        return ann.networkNodeAnnotations?.some((n: any) => n.id === hostId && n.type === "host") ?? false;
      }, { timeout: 15000 })
      .toBe(true);

    // Step 3: Create link between router and host
    await topoViewerPage.createLink("router1", hostId!, "e1-1", "eth0");
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(1);

    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        return networkLinkExists(YAML.parse(yaml), hostId!, "host");
      }, { timeout: 15000 })
      .toBe(true);

    // Step 4: Undo/redo of link creation
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(0);
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        return networkLinkExists(YAML.parse(yaml), hostId!, "host");
      }, { timeout: 15000 })
      .toBe(false);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(1);
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        return networkLinkExists(YAML.parse(yaml), hostId!, "host");
      }, { timeout: 15000 })
      .toBe(true);

    // Step 5: Delete link and test undo/redo
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBe(1);
    const edgeToDelete = edgeIds[0];
    await topoViewerPage.deleteEdge(edgeToDelete);

    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(0);
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        return networkLinkExists(YAML.parse(yaml), hostId!, "host");
      }, { timeout: 15000 })
      .toBe(false);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(1);
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        return networkLinkExists(YAML.parse(yaml), hostId!, "host");
      }, { timeout: 15000 })
      .toBe(true);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(0);
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        return networkLinkExists(YAML.parse(yaml), hostId!, "host");
      }, { timeout: 15000 })
      .toBe(false);

    // Undo once to restore link for the next step.
    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(1);

    // Step 6: Delete network node with connected link and test undo/redo
    await topoViewerPage.deleteNode(hostId!);
    await expect
      .poll(async () => (await topoViewerPage.getNodeIds()).includes(hostId!), { timeout: 15000 })
      .toBe(false);
    await expect
      .poll(async () => {
        const ann = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        return ann.networkNodeAnnotations?.some((n: any) => n.id === hostId) ?? false;
      }, { timeout: 15000 })
      .toBe(false);
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        return networkLinkExists(YAML.parse(yaml), hostId!, "host");
      }, { timeout: 15000 })
      .toBe(false);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await expect
      .poll(async () => (await topoViewerPage.getNodeIds()).includes(hostId!), { timeout: 15000 })
      .toBe(true);
    await expect.poll(() => topoViewerPage.getEdgeCount(), { timeout: 15000 }).toBe(1);
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        return networkLinkExists(YAML.parse(yaml), hostId!, "host");
      }, { timeout: 15000 })
      .toBe(true);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();
    await expect
      .poll(async () => (await topoViewerPage.getNodeIds()).includes(hostId!), { timeout: 15000 })
      .toBe(false);
    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        return networkLinkExists(YAML.parse(yaml), hostId!, "host");
      }, { timeout: 15000 })
      .toBe(false);

    // Step 7: Bridge (YAML node) undo/redo
    const bridgeId = await topoViewerPage.createNetwork({ x: 150, y: 200 }, "bridge");
    expect(bridgeId).not.toBeNull();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(EMPTY_FILE), { timeout: 15000 })
      .toContain(`${bridgeId}:`);
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(EMPTY_FILE), { timeout: 15000 })
      .toContain("kind: bridge");

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(EMPTY_FILE), { timeout: 15000 })
      .not.toContain(`${bridgeId}:`);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.redo();
    await expect
      .poll(async () => topoViewerPage.getYamlFromFile(EMPTY_FILE), { timeout: 15000 })
      .toContain(`${bridgeId}:`);

    // Step 8: VXLAN create undo (annotations should appear/disappear)
    const vxlanId = await topoViewerPage.createNetwork({ x: 200, y: 200 }, "vxlan");
    expect(vxlanId).not.toBeNull();

    await expect
      .poll(async () => {
        const ann = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        return ann.networkNodeAnnotations?.some((n: any) => n.id === vxlanId && n.type === "vxlan") ?? false;
      }, { timeout: 15000 })
      .toBe(true);

    await topoViewerPage.getCanvas().click();
    await topoViewerPage.undo();
    await expect
      .poll(async () => {
        const ann = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        return ann.networkNodeAnnotations?.some((n: any) => n.id === vxlanId) ?? false;
      }, { timeout: 15000 })
      .toBe(false);
  });
});

test.describe("VXLAN Node Reload", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("vxlan node does not duplicate after reload", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const vxlanId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "vxlan");
    expect(vxlanId).not.toBeNull();
    expect(vxlanId!).toMatch(/^vxlan:/);
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", vxlanId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    const before = (await topoViewerPage.getNetworkNodeIds()).filter((id: string) => id.startsWith("vxlan:"));
    expect(before).toContain(vxlanId);
    expect(before.filter((id: string) => id === vxlanId).length).toBe(1);

    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    const after = (await topoViewerPage.getNetworkNodeIds()).filter((id: string) => id.startsWith("vxlan:"));
    expect(after).toContain(vxlanId);
    expect(after.filter((id: string) => id === vxlanId).length).toBe(1);
    expect(after.length).toBe(before.length);
  });

  test("vxlan-stitch node does not duplicate after reload", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const vxlanStitchId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "vxlan-stitch");
    expect(vxlanStitchId).not.toBeNull();
    expect(vxlanStitchId!).toMatch(/^vxlan-stitch:/);
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", vxlanStitchId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    const before = (await topoViewerPage.getNetworkNodeIds()).filter((id: string) => id.startsWith("vxlan-stitch:"));
    expect(before).toContain(vxlanStitchId);
    expect(before.filter((id: string) => id === vxlanStitchId).length).toBe(1);

    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    const after = (await topoViewerPage.getNetworkNodeIds()).filter((id: string) => id.startsWith("vxlan-stitch:"));
    expect(after).toContain(vxlanStitchId);
    expect(after.filter((id: string) => id === vxlanStitchId).length).toBe(1);
    expect(after.length).toBe(before.length);
  });

  test("multiple vxlan nodes maintain unique IDs after reload", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 200, y: 200 }, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode("router2", { x: 400, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const vxlan1 = await topoViewerPage.createNetwork({ x: 100, y: 100 }, "vxlan");
    const vxlan2 = await topoViewerPage.createNetwork({ x: 100, y: 300 }, "vxlan");
    expect(vxlan1).not.toBeNull();
    expect(vxlan2).not.toBeNull();
    expect(vxlan1).not.toBe(vxlan2);
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", vxlan1!, "e1-1", "eth0");
    await topoViewerPage.createLink("router2", vxlan2!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    const before = (await topoViewerPage.getNetworkNodeIds()).filter((id: string) => id.startsWith("vxlan:"));
    expect(before).toEqual(expect.arrayContaining([vxlan1, vxlan2]));
    expect(new Set(before).size).toBe(before.length);

    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    const after = (await topoViewerPage.getNetworkNodeIds()).filter((id: string) => id.startsWith("vxlan:"));
    expect(after).toEqual(expect.arrayContaining([vxlan1, vxlan2]));
    expect(new Set(after).size).toBe(after.length);
    expect(after.length).toBe(before.length);
  });
});
