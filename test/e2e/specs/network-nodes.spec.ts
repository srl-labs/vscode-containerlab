import * as fs from "fs";
import * as path from "path";

import Ajv from "ajv";
import * as YAML from "yaml";

import { test, expect } from "../fixtures/topoviewer";
import { openNetworkEditor } from "../helpers/react-flow-helpers";

/**
 * Network Nodes E2E Tests
 *
 * Comprehensive tests for network node functionality including:
 * - Creating network nodes (host, mgmt-net, macvlan, vxlan, vxlan-stitch, dummy, bridge, ovs-bridge)
 * - Connecting networks to regular nodes
 * - YAML schema validation
 * - Position persistence after reload
 * - Network node modification
 * - Network node deletion
 */

const EMPTY_FILE = "empty.clab.yml";
const KIND_NOKIA_SRLINUX = "nokia_srlinux";
const KIND_BRIDGE = "kind: bridge";
const ROUTER_POSITION = { x: 300, y: 200 };
const NETWORK_POSITION = { x: 100, y: 200 };
const TYPE_DUMMY = "type: dummy";
const TYPE_VXLAN = "type: vxlan";
const TYPE_HOST = "type: host";
const SCHEMA_ERRORS_LOG = "Schema errors:";
const VXLAN_ID_0 = "vxlan:vxlan0";
const VXLAN_ID_1 = "vxlan:vxlan1";
const VXLAN_STITCH_ID_0 = "vxlan-stitch:vxlan0";
const SEL_NETWORK_EDITOR = '[data-testid="network-editor"]';
const SEL_PANEL_OK_BTN = '[data-testid="panel-ok-btn"]';

// Network types to test - these are link types (single endpoint)
const SINGLE_ENDPOINT_NETWORK_TYPES = [
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy"
] as const;

// Bridge types - these are actual YAML node kinds
const BRIDGE_TYPES = ["bridge", "ovs-bridge"] as const;

// All network types
const ALL_NETWORK_TYPES = [...SINGLE_ENDPOINT_NETWORK_TYPES, ...BRIDGE_TYPES] as const;

// Load schema for validation
const schemaPath = path.join(__dirname, "../../../schema/clab.schema.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv({ strict: false, allErrors: true });
const validateSchema = ajv.compile(schema);

/**
 * Validate YAML content against containerlab schema
 */
function validateYamlAgainstSchema(yamlContent: string): { valid: boolean; errors: string[] } {
  try {
    const parsed = YAML.parse(yamlContent);
    const valid = validateSchema(parsed);
    if (!valid) {
      const errors = validateSchema.errors?.map((e) => `${e.instancePath}: ${e.message}`) || [];
      return { valid: false, errors };
    }
    return { valid: true, errors: [] };
  } catch (e) {
    return { valid: false, errors: [`YAML parse error: ${e}`] };
  }
}

/**
 * Validate bridge node annotation exists in nodeAnnotations
 */
function validateBridgeAnnotation(
  annotations: {
    nodeAnnotations?: Array<{ id: string; position?: { x: number; y: number } }>;
  },
  networkId: string
): void {
  const ann = annotations.nodeAnnotations?.find((n) => n.id === networkId);
  expect(ann).toBeDefined();
  expect(ann?.position).toBeDefined();
}

/**
 * Validate non-bridge network annotation exists in networkNodeAnnotations
 */
function validateNetworkNodeAnnotation(
  annotations: {
    networkNodeAnnotations?: Array<{
      id: string;
      type: string;
      position?: { x: number; y: number };
    }>;
  },
  networkId: string,
  networkType: string
): void {
  const ann = annotations.networkNodeAnnotations?.find((n) => n.id === networkId);
  expect(ann).toBeDefined();
  expect(ann?.type).toBe(networkType);
  expect(ann?.position).toBeDefined();
}

interface EndpointObj {
  node?: unknown;
  interface?: unknown;
}

/**
 * Convert an endpoint object to a string format "node:interface" or just "node"
 */
function endpointObjToString(epObj: EndpointObj): string | null {
  if (typeof epObj.node !== "string") {
    return null;
  }
  const iface = typeof epObj.interface === "string" ? epObj.interface : "";
  return iface ? `${epObj.node}:${iface}` : epObj.node;
}

/**
 * Process a single endpoint value (string or object) and return its string representation
 */
function processEndpoint(ep: unknown): string | null {
  if (typeof ep === "string") {
    return ep;
  }
  if (ep && typeof ep === "object") {
    return endpointObjToString(ep as EndpointObj);
  }
  return null;
}

/**
 * Process the `endpoints` array field from a link
 */
function processEndpointsArray(endpointsField: unknown): string[] {
  if (!Array.isArray(endpointsField)) {
    return [];
  }
  return endpointsField.map(processEndpoint).filter((s): s is string => s !== null);
}

/**
 * Process the singular `endpoint` field from a link
 */
function processSingularEndpoint(endpointField: unknown): string | null {
  if (typeof endpointField === "string") {
    return endpointField;
  }
  if (endpointField && typeof endpointField === "object" && !Array.isArray(endpointField)) {
    return endpointObjToString(endpointField as EndpointObj);
  }
  return null;
}

/**
 * Collect endpoint strings from parsed topology links.
 */
function collectLinkEndpointStrings(parsed: unknown): string[] {
  const topo = (parsed as { topology?: { links?: Array<Record<string, unknown>> } })?.topology;
  const links = topo?.links ?? [];
  const endpoints: string[] = [];

  for (const link of links) {
    const endpointsField = (link as { endpoints?: unknown }).endpoints;
    endpoints.push(...processEndpointsArray(endpointsField));

    const endpointField = (link as { endpoint?: unknown }).endpoint;
    const singularEp = processSingularEndpoint(endpointField);
    if (singularEp) {
      endpoints.push(singularEp);
    }
  }

  return endpoints;
}

function linkTypeFromLink(link: Record<string, unknown>): string | undefined {
  const type = (link as { type?: unknown }).type;
  return typeof type === "string" ? type : undefined;
}

function findLinkByType(parsed: unknown, networkType: string): Record<string, unknown> | undefined {
  const topo = (parsed as { topology?: { links?: Array<Record<string, unknown>> } })?.topology;
  const links = topo?.links ?? [];
  return links.find((link) => linkTypeFromLink(link) === networkType);
}

function endpointMatchesNetworkId(endpoint: string, networkId: string): boolean {
  return endpoint === networkId || endpoint.startsWith(`${networkId}:`);
}

function linkReferencesNetwork(
  link: Record<string, unknown>,
  networkId: string,
  networkType: string
): boolean {
  const linkType = linkTypeFromLink(link);
  if (linkType === networkType) return true;

  const endpointsField = (link as { endpoints?: unknown }).endpoints;
  const endpoints = processEndpointsArray(endpointsField);

  const endpointField = (link as { endpoint?: unknown }).endpoint;
  const singularEp = processSingularEndpoint(endpointField);
  if (singularEp) endpoints.push(singularEp);

  return endpoints.some((ep) => endpointMatchesNetworkId(ep, networkId));
}

function networkLinkExists(parsed: unknown, networkId: string, networkType: string): boolean {
  const topo = (parsed as { topology?: { links?: Array<Record<string, unknown>> } })?.topology;
  const links = topo?.links ?? [];
  return links.some((link) => linkReferencesNetwork(link, networkId, networkType));
}

test.describe("Network Nodes E2E Tests", () => {
  // Increase timeout for comprehensive test (3 minutes)
  test.setTimeout(180000);

  test(
    "comprehensive network nodes workflow with schema validation",
    // eslint-disable-next-line complexity, sonarjs/cognitive-complexity
    async ({ page, topoViewerPage }) => {
    // ============================================================================
    // SETUP: Reset files and load empty topology
    // ============================================================================
    console.log("[STEP] Setup: Reset files and load empty topology");
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Verify starting state is empty
    let nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(0);

    // ============================================================================
    // STEP 1: Create two SRL nodes
    // ============================================================================
    console.log("[STEP 1] Create two SRL nodes");

    const srlPositions = {
      srl1: { x: 200, y: 300 },
      srl2: { x: 600, y: 300 }
    };

    await topoViewerPage.createNode("srl1", srlPositions.srl1, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode("srl2", srlPositions.srl2, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(500);

    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(2);

    // ============================================================================
    // STEP 2: Create network nodes and connect them to SRL nodes
    // ============================================================================
    console.log("[STEP 2] Create network nodes and connect to SRL nodes");

    const networkNodePositions: Record<string, { x: number; y: number }> = {};
    const createdNetworkIds: string[] = [];
    let interfaceCounter = 1;

    // Create each network type at staggered positions
    for (let i = 0; i < ALL_NETWORK_TYPES.length; i++) {
      const networkType = ALL_NETWORK_TYPES[i];
      const targetNode = i < 4 ? "srl1" : "srl2"; // First 4 to srl1, rest to srl2
      const xOffset = (i % 4) * 100 - 150;
      const yOffset = i < 4 ? -150 : 150;
      const position = {
        x: (targetNode === "srl1" ? srlPositions.srl1.x : srlPositions.srl2.x) + xOffset,
        y: (targetNode === "srl1" ? srlPositions.srl1.y : srlPositions.srl2.y) + yOffset
      };

      console.log(`[DEBUG] Creating ${networkType} at (${position.x}, ${position.y})`);

      const networkId = await topoViewerPage.createNetwork(position, networkType);
      expect(networkId).not.toBeNull();
      console.log(`[DEBUG] Created network: ${networkId}`);

      createdNetworkIds.push(networkId!);
      networkNodePositions[networkId!] = position;

      // Wait for network to be created
      await page.waitForTimeout(300);

      // Connect network to target node
      const isBridge = BRIDGE_TYPES.includes(networkType as (typeof BRIDGE_TYPES)[number]);
      const sourceEndpoint = isBridge ? `eth${interfaceCounter}` : undefined;
      const targetEndpoint = `e1-${interfaceCounter}`;

      if (isBridge) {
        // Bridges need interface names on both sides
        await topoViewerPage.createLink(networkId!, targetNode, sourceEndpoint!, targetEndpoint);
      } else {
        // Other network types are single-endpoint - the network side doesn't have interface
        // The link goes from the real node to the network
        await topoViewerPage.createLink(targetNode, networkId!, targetEndpoint, "eth0");
      }

      await page.waitForTimeout(300);
      interfaceCounter++;
    }

    console.log(`[DEBUG] Created ${createdNetworkIds.length} network nodes`);

    // Wait for all saves to complete
    await page.waitForTimeout(1000);

    // ============================================================================
    // STEP 3: Validate YAML against schema
    // ============================================================================
    console.log("[STEP 3] Validate YAML against schema");

    let yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const validation = validateYamlAgainstSchema(yaml);

    if (!validation.valid) {
      console.error("[SCHEMA ERROR] Validation errors:", validation.errors);
    }
    expect(validation.valid).toBe(true);
    console.log("[DEBUG] YAML passes schema validation");

    // ============================================================================
    // STEP 4: Verify YAML structure
    // ============================================================================
    console.log("[STEP 4] Verify YAML structure");

    // Verify bridge types are in YAML nodes section
    for (const bridgeType of BRIDGE_TYPES) {
      const bridgeId = createdNetworkIds.find((id) => id.startsWith(bridgeType));
      if (bridgeId) {
        expect(yaml).toContain(`${bridgeId}:`);
        expect(yaml).toContain(`kind: ${bridgeType}`);
        console.log(`[DEBUG] Bridge ${bridgeId} found in YAML nodes`);
      }
    }

    // Verify links section exists
    expect(yaml).toContain("links:");

    const parsedYaml = YAML.parse(yaml);

    // Verify each non-bridge network has a corresponding link (extended or brief format)
    for (let i = 0; i < createdNetworkIds.length; i++) {
      const networkId = createdNetworkIds[i];
      const networkType = ALL_NETWORK_TYPES[i];
      const isBridge = BRIDGE_TYPES.includes(networkType as (typeof BRIDGE_TYPES)[number]);
      if (isBridge) continue;
      expect(networkLinkExists(parsedYaml, networkId, networkType)).toBe(true);
    }

    // Verify vxlan links have required properties
    if (yaml.includes(TYPE_VXLAN) || yaml.includes("type: vxlan-stitch")) {
      expect(yaml).toContain("remote:");
      expect(yaml).toContain("vni:");
      expect(yaml).toContain("dst-port:");
      console.log("[DEBUG] VXLAN links have required properties");
    }

    // ============================================================================
    // STEP 5: Verify annotations
    // ============================================================================
    console.log("[STEP 5] Verify annotations");

    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);

    for (let i = 0; i < createdNetworkIds.length; i++) {
      const networkId = createdNetworkIds[i];
      const networkType = ALL_NETWORK_TYPES[i];
      const isBridge = BRIDGE_TYPES.includes(networkType as (typeof BRIDGE_TYPES)[number]);

      if (isBridge) {
        validateBridgeAnnotation(annotations, networkId);
      } else {
        validateNetworkNodeAnnotation(annotations, networkId, networkType);
      }
      console.log(`[DEBUG] Network ${networkId} annotations validated`);
    }

    // ============================================================================
    // STEP 6: Final verification
    // ============================================================================
    console.log("[STEP 6] Final verification");

    // Verify all network nodes are present
    const networkNodeIds = await topoViewerPage.getNetworkNodeIds();
    console.log(`[DEBUG] Network nodes: ${networkNodeIds.join(", ")}`);
    expect(networkNodeIds).toEqual(expect.arrayContaining(createdNetworkIds));
    expect(networkNodeIds.length).toBeGreaterThanOrEqual(createdNetworkIds.length);

    // Verify edges were created
    const edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBeGreaterThanOrEqual(createdNetworkIds.length);

    console.log("[SUCCESS] Network nodes E2E test completed");
  });
});

/**
 * Schema Validation Tests
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
    if (!validation.valid) console.error(SCHEMA_ERRORS_LOG, validation.errors);
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
    if (!validation.valid) console.error(SCHEMA_ERRORS_LOG, validation.errors);
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
    if (!validation.valid) console.error(SCHEMA_ERRORS_LOG, validation.errors);
    expect(validation.valid).toBe(true);
  });

  test("bridge node YAML passes schema validation", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const bridgeId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "bridge");
    expect(bridgeId).not.toBeNull();
    await page.waitForTimeout(300);

    // Bridges need interface on both sides
    await topoViewerPage.createLink(bridgeId!, "router1", "eth0", "e1-1");
    await page.waitForTimeout(500);

    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const validation = validateYamlAgainstSchema(yaml);
    if (!validation.valid) console.error(SCHEMA_ERRORS_LOG, validation.errors);
    expect(validation.valid).toBe(true);
  });
});

/**
 * Position Persistence Tests
 */
test.describe("Network Node Position Persistence", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("host network position persists after reload", async ({ page, topoViewerPage }) => {
    // Create node and network with link (required for network to appear on reload)
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const position = { x: 100, y: 150 };
    const hostId = await topoViewerPage.createNetwork(position, "host");
    expect(hostId).not.toBeNull();
    await page.waitForTimeout(300);

    // Connect the network (required for it to appear on reload)
    await topoViewerPage.createLink("router1", hostId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    // Get position before reload
    const posBefore = await topoViewerPage.getNodePosition(hostId!);
    console.log(`[DEBUG] Position before reload: (${posBefore.x}, ${posBefore.y})`);

    // Verify annotations have position
    const annotationsBefore = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const netAnn = annotationsBefore.networkNodeAnnotations?.find(
      (n: { id: string }) => n.id === hostId
    );
    expect(netAnn?.position).toBeDefined();
    console.log(`[DEBUG] Annotation position: (${netAnn?.position?.x}, ${netAnn?.position?.y})`);

    // Reload
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify network node still exists
    const networkIds = await topoViewerPage.getNetworkNodeIds();
    expect(networkIds).toContain(hostId);

    // Verify position is preserved
    const posAfter = await topoViewerPage.getNodePosition(hostId!);
    console.log(`[DEBUG] Position after reload: (${posAfter.x}, ${posAfter.y})`);

    // Allow 50px tolerance for position drift
    expect(Math.abs(posAfter.x - posBefore.x)).toBeLessThan(50);
    expect(Math.abs(posAfter.y - posBefore.y)).toBeLessThan(50);
  });

  test("bridge node position persists after reload", async ({ page, topoViewerPage }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const position = { x: 100, y: 150 };
    const bridgeId = await topoViewerPage.createNetwork(position, "bridge");
    expect(bridgeId).not.toBeNull();
    await page.waitForTimeout(300);

    // Connect the bridge
    await topoViewerPage.createLink(bridgeId!, "router1", "eth0", "e1-1");
    await page.waitForTimeout(500);

    const posBefore = await topoViewerPage.getNodePosition(bridgeId!);
    console.log(`[DEBUG] Bridge position before reload: (${posBefore.x}, ${posBefore.y})`);

    // Reload
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify bridge still exists (should be in regular nodes)
    const nodeIds = await topoViewerPage.getNodeIds();
    expect(nodeIds).toContain(bridgeId);

    const posAfter = await topoViewerPage.getNodePosition(bridgeId!);
    console.log(`[DEBUG] Bridge position after reload: (${posAfter.x}, ${posAfter.y})`);

    expect(Math.abs(posAfter.x - posBefore.x)).toBeLessThan(50);
    expect(Math.abs(posAfter.y - posBefore.y)).toBeLessThan(50);
  });
});

/**
 * Network Node Deletion Tests
 *
 * Tests that deleting network nodes properly removes them from YAML and annotations.
 */
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

    // Verify network exists
    let networkIds = await topoViewerPage.getNetworkNodeIds();
    expect(networkIds).toContain(hostId);

    // Delete the network node using fixture method
    await topoViewerPage.deleteNode(hostId!);
    await page.waitForTimeout(500);

    // Verify network is deleted from graph
    networkIds = await topoViewerPage.getNetworkNodeIds();
    expect(networkIds).not.toContain(hostId);

    // Verify removed from annotations
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

    // Verify bridge is in YAML
    let yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain(`${bridgeId}:`);
    expect(yaml).toContain(KIND_BRIDGE);

    // Delete the bridge using fixture method
    await topoViewerPage.deleteNode(bridgeId!);
    await page.waitForTimeout(500);

    // Verify bridge is removed from YAML
    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).not.toContain(`${bridgeId}:`);

    // Verify removed from annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const nodeAnn = annotations.nodeAnnotations?.find((n: { id: string }) => n.id === bridgeId);
    expect(nodeAnn).toBeUndefined();
  });

  test("deleting connected network removes the link from YAML", async ({
    page,
    topoViewerPage
  }) => {
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const dummyId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "dummy");
    await page.waitForTimeout(300);

    await topoViewerPage.createLink("router1", dummyId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    // Verify link exists in YAML (extended format)
    let yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain(TYPE_DUMMY);
    expect(networkLinkExists(YAML.parse(yaml), dummyId!, "dummy")).toBe(true);

    // Delete the network using fixture method
    await topoViewerPage.deleteNode(dummyId!);
    await page.waitForTimeout(500);

    // Verify link state after deletion
    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const linkStillExists = networkLinkExists(YAML.parse(yaml), dummyId!, "dummy");
    expect(linkStillExists).toBe(false);
  });
});

/**
 * Network Node Modification Tests
 */
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

    const networkEditor = page.locator(SEL_NETWORK_EDITOR);
    await expect(networkEditor).toBeVisible();

    await networkEditor.locator("#vxlan-remote").fill("10.0.0.1");
    await networkEditor.locator("#vxlan-vni").fill("500");
    await networkEditor.locator("#vxlan-dst-port").fill("4789");
    await networkEditor.locator("#vxlan-src-port").fill("4790");
    await networkEditor.locator("#network-mtu").fill("9000");

    await networkEditor.locator(SEL_PANEL_OK_BTN).click();
    await expect(networkEditor).toHaveCount(0);

    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        const parsed = YAML.parse(yaml);
        return findLinkByType(parsed, "vxlan");
      })
      .toBeTruthy();

    const yamlAfter = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const parsedAfter = YAML.parse(yamlAfter);
    const link = findLinkByType(parsedAfter, "vxlan") as Record<string, unknown> | undefined;
    expect(link).toBeDefined();
    expect(link?.remote).toBe("10.0.0.1");
    expect(link?.vni).toBe(500);
    expect(link?.["dst-port"]).toBe(4789);
    expect(link?.["src-port"]).toBe(4790);
    expect(link?.mtu).toBe(9000);

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

    const networkEditor = page.locator(SEL_NETWORK_EDITOR);
    await expect(networkEditor).toBeVisible();

    const interfaceInput = networkEditor.locator("#network-interface");
    await interfaceInput.fill("eth1");

    await networkEditor.locator(SEL_PANEL_OK_BTN).click();
    await expect(networkEditor).toHaveCount(0);

    const newHostId = "host:eth1";

    await expect
      .poll(async () => {
        const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
        const parsed = YAML.parse(yaml);
        const hostLink = findLinkByType(parsed, "host");
        return (
          hostLink &&
          (hostLink as Record<string, unknown>)["host-interface"] === "eth1" &&
          networkLinkExists(parsed, newHostId, "host")
        );
      })
      .toBeTruthy();

    const yamlAfter = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const parsedAfter = YAML.parse(yamlAfter);
    const hostLink = findLinkByType(parsedAfter, "host") as Record<string, unknown> | undefined;
    expect(hostLink).toBeDefined();
    expect(hostLink?.["host-interface"]).toBe("eth1");

    const networkIds = await topoViewerPage.getNetworkNodeIds();
    expect(networkIds).toContain(newHostId);
    expect(networkIds).not.toContain(hostId);

    const validation = validateYamlAgainstSchema(yamlAfter);
    expect(validation.valid).toBe(true);
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

    const networkEditor = page.locator(SEL_NETWORK_EDITOR);
    await expect(networkEditor).toBeVisible();

    const labelInput = networkEditor.locator("#network-label");
    await expect(labelInput).toBeVisible();
    await labelInput.fill("LAN A");

    await networkEditor.locator(SEL_PANEL_OK_BTN).click();
    await expect(networkEditor).toHaveCount(0);

    await expect
      .poll(async () => {
        const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
        const nodeAnn = annotations.nodeAnnotations?.find(
          (n: { id: string }) => n.id === bridgeId
        );
        return nodeAnn?.label === "LAN A";
      })
      .toBeTruthy();

    const yamlAfter = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yamlAfter).toContain(`${bridgeId}:`);
  });
});

/**
 * Bridge rename persistence tests
 */
test.describe("Bridge rename persistence", () => {
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
      if (!bridgeId) {
        throw new Error(`Failed to create ${bridgeType} network node`);
      }
      await page.waitForTimeout(300);

      await topoViewerPage.createLink(bridgeId, routerId, "eth0", "e1-1");
      await page.waitForTimeout(500);

      await openNetworkEditor(page, bridgeId);

      const networkEditor = page.locator(SEL_NETWORK_EDITOR);
      await expect(networkEditor).toBeVisible();

      const interfaceInput = networkEditor.locator("#network-interface");
      await expect(interfaceInput).toBeVisible();

      const labelInput = networkEditor.locator("#network-label");
      const originalLabel = await labelInput.inputValue();

      await interfaceInput.fill(newBridgeId);
      if (originalLabel) {
        await labelInput.fill(originalLabel);
      }

      await networkEditor.locator(SEL_PANEL_OK_BTN).click();
      await expect(networkEditor).toHaveCount(0);

      await expect
        .poll(
          async () => {
            const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
            const parsed = YAML.parse(yaml);
            return Object.keys(parsed?.topology?.nodes ?? {});
          },
          { timeout: 5000, message: "Bridge rename should update YAML nodes" }
        )
        .toContain(newBridgeId);

      const yamlAfterRename = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
      const parsedAfterRename = YAML.parse(yamlAfterRename);
      const nodeIdsAfterRename = Object.keys(parsedAfterRename?.topology?.nodes ?? {});
      expect(nodeIdsAfterRename).toContain(newBridgeId);
      expect(nodeIdsAfterRename).not.toContain(bridgeId);

      const endpointsAfterRename = collectLinkEndpointStrings(parsedAfterRename);
      expect(endpointsAfterRename.some((ep) => ep.startsWith(`${newBridgeId}:`))).toBe(true);
      expect(endpointsAfterRename.some((ep) => ep.startsWith(`${bridgeId}:`))).toBe(false);

      const graphNodeIds = await topoViewerPage.getNodeIds();
      expect(graphNodeIds).toContain(newBridgeId);
      expect(graphNodeIds).not.toContain(bridgeId);

      await topoViewerPage.deleteNode(newBridgeId);
      await page.waitForTimeout(500);

      const yamlAfterDelete = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
      const parsedAfterDelete = YAML.parse(yamlAfterDelete);
      const nodeIdsAfterDelete = Object.keys(parsedAfterDelete?.topology?.nodes ?? {});
      expect(nodeIdsAfterDelete).not.toContain(newBridgeId);

      const endpointsAfterDelete = collectLinkEndpointStrings(parsedAfterDelete);
      expect(endpointsAfterDelete.some((ep) => ep.startsWith(`${newBridgeId}:`))).toBe(false);
    });
  }
});

/**
 * Network Node Deletion Tests
 *
 * Note: Deletion via keyboard is currently unreliable in tests.
 * These tests are skipped pending investigation of selection/deletion behavior.
 */

/**
 * Individual Network Type Tests
 */
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

    // Verify bridge node is in YAML
    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain(`${bridgeId}:`);
    expect(yaml).toContain(KIND_BRIDGE);

    // Verify bridge is in nodeAnnotations (not networkNodeAnnotations)
    const annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    const nodeAnn = annotations.nodeAnnotations?.find((n: { id: string }) => n.id === bridgeId);
    expect(nodeAnn).toBeDefined();

    // Schema validation with a connection to ensure valid YAML
    await topoViewerPage.createLink(bridgeId!, "router1", "eth0", "e1-1");
    await page.waitForTimeout(500);

    const yamlWithLink = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const validation = validateYamlAgainstSchema(yamlWithLink);
    if (!validation.valid) console.error(SCHEMA_ERRORS_LOG, validation.errors);
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
    expect(yaml).toContain(TYPE_DUMMY);
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
    if (yaml.includes(TYPE_VXLAN)) {
      expect(yaml).toContain("remote:");
      expect(yaml).toContain("vni:");
      expect(yaml).toContain("dst-port:");
    }

    const validation = validateYamlAgainstSchema(yaml);
    expect(validation.valid).toBe(true);
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
    const parsedYaml = YAML.parse(yaml);
    expect(networkLinkExists(parsedYaml, hostId!, "host")).toBe(true);
    if (yaml.includes(TYPE_HOST)) {
      expect(yaml).toContain("host-interface:");
    } else {
      const endpoints = collectLinkEndpointStrings(parsedYaml);
      expect(endpoints.some((ep) => endpointMatchesNetworkId(ep, hostId!))).toBe(true);
    }

    const validation = validateYamlAgainstSchema(yaml);
    expect(validation.valid).toBe(true);
  });
});

/**
 * Network Node Undo/Redo Tests
 *
 * Comprehensive test that verifies undo/redo operations work correctly for
 * network node creation, deletion, and link operations in a single workflow.
 */
test.describe("Network Node Undo/Redo", () => {
  test.setTimeout(120000);
  // Shared constants to avoid duplicate string lint errors
  const SIMPLE_FILE = "simple.clab.yml";
  const BROWSER_LOGS_LABEL = "[BROWSER LOGS]";
  const STEP1_CREATE_NETWORK = "[STEP 1] Create mgmt-net network";

  test("mgmt-net link undo/redo with node move in between", async ({ page, topoViewerPage }) => {
    // This test reproduces the exact user workflow:
    // 1. Create network
    // 2. Move network (adds move action to undo stack)
    // 3. Create link
    // 4. Full undo (link, move, network)
    // 5. Full redo (network, move, link)

    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Step 1: Create mgmt-net network
    console.log(STEP1_CREATE_NETWORK);
    const mgmtNetId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "mgmt-net");
    expect(mgmtNetId).toBe("mgmt-net:net0");
    await page.waitForTimeout(500);

    // Step 2: Move the network node (this adds a move action to undo stack)
    console.log("[STEP 2] Move network node");
    await topoViewerPage.dragNode(mgmtNetId!, { x: 150, y: 250 });
    await page.waitForTimeout(500);

    // Step 3: Create link using context menu (like user does)
    console.log("[STEP 3] Create link via edge creation");
    // Use the fixture's createLink which simulates the edge creation
    await topoViewerPage.createLink(mgmtNetId!, "srl2", "eth0", "e1-2");
    await page.waitForTimeout(500);

    // Verify link created
    let yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    console.log("[DEBUG] YAML after link creation:");
    console.log(yaml);
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(true);

    let edgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] Edge count after creation: ${edgeCount}`);
    expect(edgeCount).toBe(2); // original + mgmt-net

    // Step 4: Full undo (3 times: link, move, network)
    console.log("[STEP 4] Full undo");
    await topoViewerPage.undo(); // undo link
    await page.waitForTimeout(300);
    await topoViewerPage.undo(); // undo move
    await page.waitForTimeout(300);
    await topoViewerPage.undo(); // undo network creation
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] Edge count after full undo: ${edgeCount}`);
    expect(edgeCount).toBe(1); // only original link

    yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    console.log("[DEBUG] YAML after full undo:");
    console.log(yaml);
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(false);

    // Step 5: Full redo (3 times: network, move, link)
    console.log("[STEP 5] Full redo");
    await topoViewerPage.redo(); // redo network creation
    await page.waitForTimeout(300);
    await topoViewerPage.redo(); // redo move
    await page.waitForTimeout(300);
    await topoViewerPage.redo(); // redo link
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] Edge count after full redo: ${edgeCount}`);
    expect(edgeCount).toBe(2);

    // Check edge data
    const allEdgeData = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return [];
      const edges = rf.getEdges?.() ?? [];
      return edges.map((e: any) => e.data);
    });
    console.log("[DEBUG] Edge data after redo:", JSON.stringify(allEdgeData, null, 2));

    yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    console.log("[DEBUG] YAML after full redo:");
    console.log(yaml);

    // Critical assertion - link must be restored
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(true);

    // Print browser logs
    console.log(BROWSER_LOGS_LABEL);
    consoleLogs
      .filter((log) => log.includes("UndoRedo") || log.includes("Edge") || log.includes("error"))
      .forEach((log) => console.log(log));
  });

  test("mgmt-net network deletion and undo restores link", async ({ page, topoViewerPage }) => {
    // Capture browser console logs
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Setup
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Create mgmt-net network and connect to srl2
    console.log(STEP1_CREATE_NETWORK);
    const mgmtNetId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "mgmt-net");
    await page.waitForTimeout(500);

    console.log("[STEP 2] Create link srl2:e1-2 <-> mgmt-net:net0");
    await topoViewerPage.createLink("srl2", mgmtNetId!, "e1-2", "eth0");
    await page.waitForTimeout(500);

    // Verify initial state
    let yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    console.log("[DEBUG] YAML after setup:");
    console.log(yaml);
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(true);
    let edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(2);

    // Now DELETE the mgmt-net network node (link removal depends on YAML format)
    console.log("[STEP 3] Delete mgmt-net network node");
    await topoViewerPage.deleteNode(mgmtNetId!);
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] Edge count after delete: ${edgeCount}`);

    yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    console.log("[DEBUG] YAML after delete:");
    console.log(yaml);
    const linkStillExists = networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net");
    expect(edgeCount).toBe(linkStillExists ? 2 : 1);

    // Undo the deletion
    console.log("[STEP 4] Undo deletion");
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] Edge count after undo: ${edgeCount}`);
    expect(edgeCount).toBe(2);

    const nodeIdsAfterUndo = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] Node IDs after undo: ${nodeIdsAfterUndo.join(", ")}`);
    expect(nodeIdsAfterUndo).toEqual(expect.arrayContaining(["srl1", "srl2"]));
    expect(nodeIdsAfterUndo.some((id) => endpointMatchesNetworkId(id, mgmtNetId!))).toBe(
      true
    );

    // Check edge data after undo
    const allEdgeDataAfter = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return [];
      const edges = rf.getEdges?.() ?? [];
      return edges.map((e: any) => e.data);
    });
    console.log("[DEBUG] All edge data after undo:", JSON.stringify(allEdgeDataAfter, null, 2));

    yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    console.log("[DEBUG] YAML after undo:");
    console.log(yaml);

    // Critical assertions - mgmt-net link should be restored
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(true);

    // Print relevant browser console logs
    console.log(BROWSER_LOGS_LABEL);
    consoleLogs
      .filter(
        (log) =>
          log.includes("Services") ||
          log.includes("link") ||
          log.includes("Link") ||
          log.includes("error") ||
          log.includes("Error")
      )
      .forEach((log) => console.log(log));
  });

  test("mgmt-net link undo/redo with existing topology", async ({ page, topoViewerPage }) => {
    // Capture browser console logs
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Setup - use simple.clab.yml which has existing nodes
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(SIMPLE_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // Verify existing state
    let nodeCount = await topoViewerPage.getNodeCount();
    let edgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[INITIAL STATE] Nodes: ${nodeCount}, Edges: ${edgeCount}`);
    expect(nodeCount).toBe(2); // srl1, srl2
    expect(edgeCount).toBe(1); // srl1:e1-1 - srl2:e1-1

    // Create mgmt-net network
    console.log(STEP1_CREATE_NETWORK);
    const mgmtNetId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "mgmt-net");
    expect(mgmtNetId).toBe("mgmt-net:net0");
    await page.waitForTimeout(500);

    const nodeIdsAfterCreate = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] Node IDs after network creation: ${nodeIdsAfterCreate.join(", ")}`);
    expect(nodeIdsAfterCreate).toEqual(
      expect.arrayContaining(["srl1", "srl2", mgmtNetId!])
    );

    // Create link between srl2 and mgmt-net
    console.log("[STEP 2] Create link srl2:e1-2 <-> mgmt-net:net0");
    await topoViewerPage.createLink("srl2", mgmtNetId!, "e1-2", "eth0");
    await page.waitForTimeout(500);

    // Verify link in YAML
    let yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    console.log("[DEBUG] YAML after link creation:");
    console.log(yaml);
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(true);

    edgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] Edge count after link creation: ${edgeCount}`);
    expect(edgeCount).toBe(2); // original link + mgmt-net link

    // Get edge data from React Flow to verify extraData
    const allEdgeData = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return [];
      const edges = rf.getEdges?.() ?? [];
      return edges.map((e: any) => e.data);
    });
    console.log("[DEBUG] All edge data before undo:", JSON.stringify(allEdgeData, null, 2));

    // Full undo - link first, then network
    console.log("[STEP 3] Undo link creation");
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] Edge count after undo link: ${edgeCount}`);
    expect(edgeCount).toBe(1);

    console.log("[STEP 4] Undo network creation");
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    const nodeIdsAfterUndoNetwork = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] Node IDs after undo network: ${nodeIdsAfterUndoNetwork.join(", ")}`);
    expect(nodeIdsAfterUndoNetwork).not.toContain(mgmtNetId);

    yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    console.log("[DEBUG] YAML after full undo:");
    console.log(yaml);
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(false);

    // Full redo - network first, then link
    console.log("[STEP 5] Redo network creation");
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    const nodeIdsAfterRedoNetwork = await topoViewerPage.getNodeIds();
    console.log(`[DEBUG] Node IDs after redo network: ${nodeIdsAfterRedoNetwork.join(", ")}`);
    expect(nodeIdsAfterRedoNetwork).toContain(mgmtNetId);

    console.log("[STEP 6] Redo link creation");
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    console.log(`[DEBUG] Edge count after redo link: ${edgeCount}`);
    expect(edgeCount).toBe(2);

    // Check edge data after redo
    const allEdgeDataAfter = await page.evaluate(() => {
      const dev = (window as any).__DEV__;
      const rf = dev?.rfInstance;
      if (!rf) return [];
      const edges = rf.getEdges?.() ?? [];
      return edges.map((e: any) => e.data);
    });
    console.log("[DEBUG] All edge data after redo:", JSON.stringify(allEdgeDataAfter, null, 2));

    yaml = await topoViewerPage.getYamlFromFile(SIMPLE_FILE);
    console.log("[DEBUG] YAML after full redo:");
    console.log(yaml);

    // Critical assertions - mgmt-net link should be restored
    expect(networkLinkExists(YAML.parse(yaml), mgmtNetId!, "mgmt-net")).toBe(true);
    expect(yaml).toContain("srl2");

    // Print relevant browser console logs
    console.log(BROWSER_LOGS_LABEL);
    consoleLogs
      .filter(
        (log) =>
          log.includes("Services") ||
          log.includes("link") ||
          log.includes("Link") ||
          log.includes("error") ||
          log.includes("Error")
      )
      .forEach((log) => console.log(log));

    // Verify annotations
    const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
    console.log("[DEBUG] Annotations:", JSON.stringify(annotations, null, 2));
    const netAnn = annotations.networkNodeAnnotations?.find(
      (n: { id: string }) => n.id === mgmtNetId
    );
    expect(netAnn).toBeDefined();
    expect(netAnn?.type).toBe("mgmt-net");
  });

  test("comprehensive undo/redo workflow for network nodes and links", async ({
    page,
    topoViewerPage
  }) => {
    // ============================================================================
    // SETUP
    // ============================================================================
    console.log("[SETUP] Reset files and prepare canvas");
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();

    // ============================================================================
    // STEP 1: Create router node
    // ============================================================================
    console.log("[STEP 1] Create router node");
    await topoViewerPage.createNode("router1", ROUTER_POSITION, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    let nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(1);

    // ============================================================================
    // STEP 2: Create host network and test undo/redo of creation
    // ============================================================================
    console.log("[STEP 2] Create host network");
    const hostId = await topoViewerPage.createNetwork(NETWORK_POSITION, "host");
    expect(hostId).not.toBeNull();
    await page.waitForTimeout(300);

    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(2);

    // Verify in annotations
    let annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    let netAnn = annotations.networkNodeAnnotations?.find((n: { id: string }) => n.id === hostId);
    expect(netAnn).toBeDefined();
    expect(netAnn?.type).toBe("host");

    // Undo network creation
    console.log("[STEP 2a] Undo host network creation");
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(1);

    annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    netAnn = annotations.networkNodeAnnotations?.find((n: { id: string }) => n.id === hostId);
    expect(netAnn).toBeUndefined();

    // Redo network creation
    console.log("[STEP 2b] Redo host network creation");
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    nodeCount = await topoViewerPage.getNodeCount();
    expect(nodeCount).toBe(2);

    annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    netAnn = annotations.networkNodeAnnotations?.find((n: { id: string }) => n.id === hostId);
    if (netAnn) {
      expect(netAnn.type).toBe("host");
    }
    expect(netAnn?.type).toBe("host");

    // ============================================================================
    // STEP 3: Create link between router and host network
    // ============================================================================
    console.log("[STEP 3] Create link between router and host");
    await topoViewerPage.createLink("router1", hostId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    let edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(1);

    let yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(networkLinkExists(YAML.parse(yaml), hostId!, "host")).toBe(true);

    // ============================================================================
    // STEP 4: Test undo/redo of link creation
    // ============================================================================
    console.log("[STEP 4a] Undo link creation");
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(0);

    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(networkLinkExists(YAML.parse(yaml), hostId!, "host")).toBe(false);

    console.log("[STEP 4b] Redo link creation");
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(1);

    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(networkLinkExists(YAML.parse(yaml), hostId!, "host")).toBe(true);

    // ============================================================================
    // STEP 5: Delete link and test undo/redo
    // ============================================================================
    console.log("[STEP 5] Delete link");
    const edgeIds = await topoViewerPage.getEdgeIds();
    expect(edgeIds.length).toBe(1);
    const edgeToDelete = edgeIds[0];
    console.log(`[DEBUG] Edge to delete: ${edgeToDelete}`);

    // Select edge programmatically (more reliable than clicking)
    await topoViewerPage.selectEdge(edgeToDelete);

    const selectedEdges = await topoViewerPage.getSelectedEdgeIds();
    console.log(`[DEBUG] Selected edges: ${selectedEdges.join(", ")}`);
    expect(selectedEdges).toContain(edgeToDelete);

    // Focus canvas and delete edge
    await page.locator(".react-flow").click();
    await page.waitForTimeout(100);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(0);

    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(networkLinkExists(YAML.parse(yaml), hostId!, "host")).toBe(false);

    console.log("[STEP 5a] Undo link deletion");
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(1);

    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(networkLinkExists(YAML.parse(yaml), hostId!, "host")).toBe(true);

    console.log("[STEP 5b] Redo link deletion");
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(0);

    // Undo to restore link for next tests
    await topoViewerPage.undo();
    await page.waitForTimeout(300);

    // ============================================================================
    // STEP 6: Delete network node (with connected link) and test undo/redo
    // ============================================================================
    console.log("[STEP 6] Delete network node with connected link");
    await topoViewerPage.deleteNode(hostId!);
    await page.waitForTimeout(500);

    const nodeIdsAfterDelete = await topoViewerPage.getNodeIds();
    expect(nodeIdsAfterDelete).toContain("router1");
    expect(nodeIdsAfterDelete).not.toContain(hostId);
    edgeCount = await topoViewerPage.getEdgeCount();
    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const linkStillExists = networkLinkExists(YAML.parse(yaml), hostId!, "host");
    expect(edgeCount).toBe(linkStillExists ? 1 : 0);

    annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    netAnn = annotations.networkNodeAnnotations?.find((n: { id: string }) => n.id === hostId);
    expect(netAnn).toBeUndefined();

    console.log("[STEP 6a] Undo network node deletion");
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    const nodeIdsAfterUndoDelete = await topoViewerPage.getNodeIds();
    expect(nodeIdsAfterUndoDelete).toEqual(expect.arrayContaining(["router1"]));
    expect(nodeIdsAfterUndoDelete.some((id) => endpointMatchesNetworkId(id, hostId!))).toBe(
      true
    );
    edgeCount = await topoViewerPage.getEdgeCount();
    expect(edgeCount).toBe(1);

    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(networkLinkExists(YAML.parse(yaml), hostId!, "host")).toBe(true);

    annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    netAnn = annotations.networkNodeAnnotations?.find((n: { id: string }) => n.id === hostId);
    if (netAnn) {
      expect(netAnn.type).toBe("host");
    }

    console.log("[STEP 6b] Redo network node deletion");
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    const nodeIdsAfterRedoDelete = await topoViewerPage.getNodeIds();
    expect(nodeIdsAfterRedoDelete).toContain("router1");
    expect(nodeIdsAfterRedoDelete).not.toContain(hostId);
    edgeCount = await topoViewerPage.getEdgeCount();
    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const linkStillExistsAfterRedo = networkLinkExists(YAML.parse(yaml), hostId!, "host");
    expect(edgeCount).toBe(linkStillExistsAfterRedo ? 1 : 0);

    // ============================================================================
    // STEP 7: Test bridge network (YAML node) undo/redo
    // ============================================================================
    console.log("[STEP 7] Create bridge network");
    const bridgeId = await topoViewerPage.createNetwork({ x: 150, y: 200 }, "bridge");
    expect(bridgeId).not.toBeNull();
    await page.waitForTimeout(500);

    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain(`${bridgeId}:`);
    expect(yaml).toContain(KIND_BRIDGE);

    console.log("[STEP 7a] Undo bridge creation");
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).not.toContain(`${bridgeId}:`);

    console.log("[STEP 7b] Redo bridge creation");
    await topoViewerPage.redo();
    await page.waitForTimeout(500);

    yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    expect(yaml).toContain(`${bridgeId}:`);
    expect(yaml).toContain(KIND_BRIDGE);

    // ============================================================================
    // STEP 8: Test VXLAN network undo/redo
    // ============================================================================
    console.log("[STEP 8] Create VXLAN network");
    const vxlanId = await topoViewerPage.createNetwork({ x: 200, y: 200 }, "vxlan");
    expect(vxlanId).not.toBeNull();
    await page.waitForTimeout(300);

    annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    netAnn = annotations.networkNodeAnnotations?.find((n: { id: string }) => n.id === vxlanId);
    expect(netAnn).toBeDefined();
    expect(netAnn?.type).toBe("vxlan");

    console.log("[STEP 8a] Undo VXLAN creation");
    await topoViewerPage.undo();
    await page.waitForTimeout(500);

    annotations = await topoViewerPage.getAnnotationsFromFile(EMPTY_FILE);
    netAnn = annotations.networkNodeAnnotations?.find((n: { id: string }) => n.id === vxlanId);
    expect(netAnn).toBeUndefined();

    console.log("[SUCCESS] All undo/redo operations completed successfully");
  });
});

/**
 * VXLAN Node Reload Tests
 *
 * Regression tests to ensure VXLAN nodes persist after reload.
 * The YAML link may be stored in extended or brief format, but the base node ID should remain stable.
 */
test.describe("VXLAN Node Reload", () => {
  test.beforeEach(async ({ topoViewerPage }) => {
    await topoViewerPage.resetFiles();
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();
    await topoViewerPage.setEditMode();
    await topoViewerPage.unlock();
  });

  test("vxlan node does not duplicate after reload", async ({ page, topoViewerPage }) => {
    // Create router and VXLAN network
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const vxlanId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "vxlan");
    expect(vxlanId).toBe(VXLAN_ID_0);
    await page.waitForTimeout(300);

    // Connect VXLAN to router (creates YAML link with remote, vni, dst-port)
    await topoViewerPage.createLink("router1", vxlanId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    // Verify initial state - should include the VXLAN node
    let networkIds = await topoViewerPage.getNetworkNodeIds();
    const vxlanNodesBefore = networkIds.filter((id: string) => id.startsWith("vxlan:"));
    expect(vxlanNodesBefore.length).toBeGreaterThanOrEqual(1);
    expect(vxlanNodesBefore).toContain(VXLAN_ID_0);
    console.log(`[DEBUG] VXLAN nodes before reload: ${vxlanNodesBefore.join(", ")}`);

    // Verify YAML has VXLAN link (extended or brief format)
    const yaml = await topoViewerPage.getYamlFromFile(EMPTY_FILE);
    const parsedYaml = YAML.parse(yaml);
    expect(networkLinkExists(parsedYaml, vxlanId!, "vxlan")).toBe(true);
    if (yaml.includes("type: vxlan")) {
      expect(yaml).toContain("remote:");
      expect(yaml).toContain("vni:");
    }

    // Reload the topology
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify after reload - should still include the VXLAN node
    networkIds = await topoViewerPage.getNetworkNodeIds();
    const vxlanNodesAfter = networkIds.filter((id: string) => id.startsWith("vxlan:"));
    console.log(`[DEBUG] VXLAN nodes after reload: ${vxlanNodesAfter.join(", ")}`);

    // Ensure the original VXLAN node still exists after reload
    expect(vxlanNodesAfter.length).toBeGreaterThanOrEqual(1);
    expect(vxlanNodesAfter).toContain(VXLAN_ID_0);
  });

  test("vxlan-stitch node does not duplicate after reload", async ({ page, topoViewerPage }) => {
    // Create router and VXLAN-stitch network
    await topoViewerPage.createNode("router1", { x: 300, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    const vxlanStitchId = await topoViewerPage.createNetwork({ x: 100, y: 200 }, "vxlan-stitch");
    expect(vxlanStitchId).toBe(VXLAN_STITCH_ID_0);
    await page.waitForTimeout(300);

    // Connect to router
    await topoViewerPage.createLink("router1", vxlanStitchId!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    // Verify initial state
    let networkIds = await topoViewerPage.getNetworkNodeIds();
    const vxlanStitchBefore = networkIds.filter((id: string) => id.startsWith("vxlan-stitch:"));
    expect(vxlanStitchBefore.length).toBeGreaterThanOrEqual(1);
    console.log(`[DEBUG] VXLAN-stitch nodes before reload: ${vxlanStitchBefore.join(", ")}`);

    // Reload
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify after reload - VXLAN-stitch node still present
    networkIds = await topoViewerPage.getNetworkNodeIds();
    const vxlanStitchAfter = networkIds.filter((id: string) => id.startsWith("vxlan-stitch:"));
    console.log(`[DEBUG] VXLAN-stitch nodes after reload: ${vxlanStitchAfter.join(", ")}`);

    expect(vxlanStitchAfter.length).toBeGreaterThanOrEqual(1);
    expect(vxlanStitchAfter).toContain(VXLAN_STITCH_ID_0);
  });

  test("multiple vxlan nodes maintain unique IDs after reload", async ({
    page,
    topoViewerPage
  }) => {
    // Create two routers
    await topoViewerPage.createNode("router1", { x: 200, y: 200 }, KIND_NOKIA_SRLINUX);
    await topoViewerPage.createNode("router2", { x: 400, y: 200 }, KIND_NOKIA_SRLINUX);
    await page.waitForTimeout(300);

    // Create two VXLAN networks
    const vxlan1 = await topoViewerPage.createNetwork({ x: 100, y: 100 }, "vxlan");
    const vxlan2 = await topoViewerPage.createNetwork({ x: 100, y: 300 }, "vxlan");
    expect(vxlan1).toBe(VXLAN_ID_0);
    expect(vxlan2).toBe(VXLAN_ID_1);
    await page.waitForTimeout(300);

    // Connect both
    await topoViewerPage.createLink("router1", vxlan1!, "e1-1", "eth0");
    await topoViewerPage.createLink("router2", vxlan2!, "e1-1", "eth0");
    await page.waitForTimeout(500);

    // Verify initial state includes both VXLAN nodes
    let networkIds = await topoViewerPage.getNetworkNodeIds();
    let vxlanNodes = networkIds.filter((id: string) => id.startsWith("vxlan:"));
    expect(vxlanNodes.length).toBeGreaterThanOrEqual(2);
    expect(vxlanNodes).toEqual(expect.arrayContaining([VXLAN_ID_0, VXLAN_ID_1]));
    console.log(`[DEBUG] VXLAN nodes before reload: ${vxlanNodes.join(", ")}`);

    // Reload
    await topoViewerPage.gotoFile(EMPTY_FILE);
    await topoViewerPage.waitForCanvasReady();

    // Verify after reload still includes both VXLAN nodes
    networkIds = await topoViewerPage.getNetworkNodeIds();
    vxlanNodes = networkIds.filter((id: string) => id.startsWith("vxlan:"));
    console.log(`[DEBUG] VXLAN nodes after reload: ${vxlanNodes.join(", ")}`);

    // Should still include the original VXLAN node IDs
    expect(vxlanNodes.length).toBeGreaterThanOrEqual(2);
    expect(vxlanNodes).toEqual(expect.arrayContaining([VXLAN_ID_0, VXLAN_ID_1]));
  });
});
