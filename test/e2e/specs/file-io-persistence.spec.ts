import { test, expect } from '../fixtures/topoviewer';
import { drag } from '../helpers/cytoscape-helpers';

// Test file names
const SPINE_LEAF_FILE = 'spine-leaf.clab.yml';
const DATACENTER_FILE = 'datacenter.clab.yml';
const SIMPLE_FILE = 'simple.clab.yml';
const NETWORK_FILE = 'network.clab.yml';

// File modification tests must run serially to avoid conflicts
// Use test.describe.serial to run all tests in this file sequentially
test.describe.serial('File I/O Persistence', () => {

  test.describe('Node Position Persistence', () => {
    test('moving node updates annotations file with new position', async ({ page, topoViewerPage }) => {
      // Reset files to ensure clean state
      await topoViewerPage.resetFiles();

      // Load file-based topology
      await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Get initial annotations from file
      const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
      const spine1Initial = initialAnnotations.nodeAnnotations?.find(n => n.id === 'spine1');
      expect(spine1Initial).toBeDefined();
      expect(spine1Initial?.position).toBeDefined();

      const initialX = spine1Initial!.position!.x;
      const initialY = spine1Initial!.position!.y;

      // Get node bounding box for dragging
      const nodeBox = await topoViewerPage.getNodeBoundingBox('spine1');
      expect(nodeBox).not.toBeNull();

      const startX = nodeBox!.x + nodeBox!.width / 2;
      const startY = nodeBox!.y + nodeBox!.height / 2;

      // Drag the node by 80px (larger distance for more reliable detection)
      const dragDistance = 80;
      await drag(
        page,
        { x: startX, y: startY },
        { x: startX + dragDistance, y: startY + dragDistance },
        { steps: 15 }
      );

      // Wait longer for drag end event and save to complete
      await page.waitForTimeout(1000);

      // Read annotations from file again
      const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
      const spine1Updated = updatedAnnotations.nodeAnnotations?.find(n => n.id === 'spine1');
      expect(spine1Updated).toBeDefined();
      expect(spine1Updated?.position).toBeDefined();

      // Position should have changed significantly (at least 20px difference)
      const deltaX = Math.abs(spine1Updated!.position!.x - initialX);
      const deltaY = Math.abs(spine1Updated!.position!.y - initialY);

      // At least one axis should have moved significantly
      expect(deltaX + deltaY).toBeGreaterThan(20);
    });

    test('moving multiple nodes updates all positions in file', async ({ page, topoViewerPage }) => {
      await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Get initial positions from Cytoscape
      const spine1InitialCy = await topoViewerPage.getNodePosition('spine1');
      const spine2InitialCy = await topoViewerPage.getNodePosition('spine2');

      // Drag spine1
      const box1 = await topoViewerPage.getNodeBoundingBox('spine1');
      expect(box1).not.toBeNull();
      await drag(
        page,
        { x: box1!.x + box1!.width / 2, y: box1!.y + box1!.height / 2 },
        { x: box1!.x + box1!.width / 2 + 30, y: box1!.y + box1!.height / 2 },
        { steps: 5 }
      );
      await page.waitForTimeout(500);

      // Verify spine1 moved in Cytoscape memory
      const spine1AfterDrag1 = await topoViewerPage.getNodePosition('spine1');
      expect(spine1AfterDrag1.x).not.toBe(spine1InitialCy.x);

      // Drag spine2
      const box2 = await topoViewerPage.getNodeBoundingBox('spine2');
      expect(box2).not.toBeNull();
      await drag(
        page,
        { x: box2!.x + box2!.width / 2, y: box2!.y + box2!.height / 2 },
        { x: box2!.x + box2!.width / 2 - 30, y: box2!.y + box2!.height / 2 },
        { steps: 5 }
      );
      await page.waitForTimeout(500);

      // Verify spine2 moved in Cytoscape memory
      const spine2AfterDrag2 = await topoViewerPage.getNodePosition('spine2');
      expect(spine2AfterDrag2.x).not.toBe(spine2InitialCy.x);

      // Wait for file saves to complete
      await page.waitForTimeout(1000);

      // Read updated annotations from file
      const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
      const spine1Updated = updatedAnnotations.nodeAnnotations?.find(n => n.id === 'spine1');
      const spine2Updated = updatedAnnotations.nodeAnnotations?.find(n => n.id === 'spine2');

      // Both positions in file should match Cytoscape positions (with some tolerance)
      expect(Math.abs(spine1Updated!.position!.x - spine1AfterDrag1.x)).toBeLessThan(5);
      expect(Math.abs(spine2Updated!.position!.x - spine2AfterDrag2.x)).toBeLessThan(5);
    });
  });

  test.describe('Node Deletion Persistence', () => {
    test('deleting node removes it from YAML file', async ({ page, topoViewerPage }) => {
      // Reset files to ensure clean state
      await topoViewerPage.resetFiles();

      await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Get initial YAML
      const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);
      expect(initialYaml).toContain('client1');
      expect(initialYaml).toContain('client2');

      // Get initial node count
      const initialNodeCount = await topoViewerPage.getNodeCount();

      // Select and delete client2
      await topoViewerPage.selectNode('client2');
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);

      // Verify node was removed from UI
      const newNodeCount = await topoViewerPage.getNodeCount();
      expect(newNodeCount).toBe(initialNodeCount - 1);

      // Read YAML from file
      const updatedYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);

      // client2 should be removed from YAML
      expect(updatedYaml).toContain('client1');
      expect(updatedYaml).not.toContain('client2:');
    });

    test('deleting node removes it from annotations file', async ({ page, topoViewerPage }) => {
      await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Get initial annotations
      const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
      const client1Exists = initialAnnotations.nodeAnnotations?.some(n => n.id === 'client1');
      expect(client1Exists).toBe(true);

      // Delete client1
      await topoViewerPage.selectNode('client1');
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);

      // Read annotations from file
      const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(SPINE_LEAF_FILE);
      const client1StillExists = updatedAnnotations.nodeAnnotations?.some(n => n.id === 'client1');

      // client1 should be removed from annotations
      expect(client1StillExists).toBe(false);
    });

    test('deleting node also removes connected links from YAML', async ({ page, topoViewerPage }) => {
      await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Get initial YAML
      const initialYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);

      // Count endpoints referencing leaf1
      const leaf1LinksInitial = (initialYaml.match(/leaf1:/g) || []).length;
      expect(leaf1LinksInitial).toBeGreaterThan(0);

      // Delete leaf1
      await topoViewerPage.selectNode('leaf1');
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);

      // Read updated YAML
      const updatedYaml = await topoViewerPage.getYamlFromFile(SPINE_LEAF_FILE);

      // leaf1 node definition should be gone
      expect(updatedYaml).not.toContain('leaf1:');

      // Links referencing leaf1 should also be reduced/gone
      const leaf1LinksUpdated = (updatedYaml.match(/"leaf1:/g) || []).length;
      expect(leaf1LinksUpdated).toBe(0);
    });
  });

  test.describe('Annotations Persistence', () => {
    test('datacenter topology preserves groups, text, and shapes', async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile(DATACENTER_FILE);
      await topoViewerPage.waitForCanvasReady();

      // Read annotations from file
      const annotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);

      // Should have groups
      expect(annotations.groupStyleAnnotations?.length).toBeGreaterThan(0);
      const groupNames = annotations.groupStyleAnnotations?.map(g => g.name);
      expect(groupNames).toContain('Border');
      expect(groupNames).toContain('Spine');

      // Should have text annotations
      expect(annotations.freeTextAnnotations?.length).toBeGreaterThan(0);
      const textLabels = annotations.freeTextAnnotations?.map(t => t.text);
      expect(textLabels).toContain('Data Center West');
      expect(textLabels).toContain('Border Layer');

      // Should have shape annotations
      expect(annotations.freeShapeAnnotations?.length).toBeGreaterThan(0);

      // Should have node annotations with group membership
      const nodesWithGroups = annotations.nodeAnnotations?.filter(n => n.group);
      expect(nodesWithGroups?.length).toBeGreaterThan(0);
    });

    test('network topology preserves network node annotations', async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile(NETWORK_FILE);
      await topoViewerPage.waitForCanvasReady();

      // Read annotations from file
      const annotations = await topoViewerPage.getAnnotationsFromFile(NETWORK_FILE);

      // Should have network node annotations
      expect(annotations.networkNodeAnnotations?.length).toBeGreaterThan(0);

      // Check for different network types
      const types = annotations.networkNodeAnnotations?.map(n => n.type);
      expect(types).toContain('host');
      expect(types).toContain('bridge');
    });

    test('moving node in datacenter preserves other annotations', async ({ page, topoViewerPage }) => {
      await topoViewerPage.gotoFile(DATACENTER_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Get initial annotations
      const initialAnnotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);
      const initialGroupCount = initialAnnotations.groupStyleAnnotations?.length || 0;
      const initialTextCount = initialAnnotations.freeTextAnnotations?.length || 0;
      const initialShapeCount = initialAnnotations.freeShapeAnnotations?.length || 0;

      // Move a node
      const box = await topoViewerPage.getNodeBoundingBox('spine1');
      expect(box).not.toBeNull();

      await drag(
        page,
        { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
        { x: box!.x + box!.width / 2 + 20, y: box!.y + box!.height / 2 + 20 },
        { steps: 5 }
      );
      await page.waitForTimeout(500);

      // Read updated annotations
      const updatedAnnotations = await topoViewerPage.getAnnotationsFromFile(DATACENTER_FILE);

      // All other annotations should be preserved
      expect(updatedAnnotations.groupStyleAnnotations?.length).toBe(initialGroupCount);
      expect(updatedAnnotations.freeTextAnnotations?.length).toBe(initialTextCount);
      expect(updatedAnnotations.freeShapeAnnotations?.length).toBe(initialShapeCount);
    });
  });

  test.describe('File Loading', () => {
    test('lists available topology files', async ({ topoViewerPage }) => {
      await topoViewerPage.goto();
      await topoViewerPage.waitForCanvasReady();

      const files = await topoViewerPage.listTopologyFiles();

      expect(files.length).toBeGreaterThan(0);

      const filenames = files.map(f => f.filename);
      expect(filenames).toContain(SIMPLE_FILE);
      expect(filenames).toContain(SPINE_LEAF_FILE);
      expect(filenames).toContain(DATACENTER_FILE);
    });

    test('tracks which files have annotations', async ({ topoViewerPage }) => {
      await topoViewerPage.goto();
      await topoViewerPage.waitForCanvasReady();

      const files = await topoViewerPage.listTopologyFiles();

      // spine-leaf should have annotations
      const spineLeaf = files.find(f => f.filename === SPINE_LEAF_FILE);
      expect(spineLeaf?.hasAnnotations).toBe(true);

      // datacenter should have annotations
      const datacenter = files.find(f => f.filename === DATACENTER_FILE);
      expect(datacenter?.hasAnnotations).toBe(true);
    });

    test('loading file updates current file path', async ({ topoViewerPage }) => {
      await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
      await topoViewerPage.waitForCanvasReady();

      const currentFile = await topoViewerPage.getCurrentFile();
      expect(currentFile).toBe(SPINE_LEAF_FILE);
    });

    test('switching between files works correctly', async ({ topoViewerPage }) => {
      // Reset files to ensure clean state
      await topoViewerPage.resetFiles();

      // Load first file
      await topoViewerPage.gotoFile(SIMPLE_FILE);
      await topoViewerPage.waitForCanvasReady();

      const simpleNodeCount = await topoViewerPage.getNodeCount();
      expect(simpleNodeCount).toBe(2); // simple has 2 nodes (srl1, srl2)

      // Load second file (need to navigate fresh)
      await topoViewerPage.gotoFile(SPINE_LEAF_FILE);
      await topoViewerPage.waitForCanvasReady();

      const spineLeafNodeCount = await topoViewerPage.getNodeCount();
      expect(spineLeafNodeCount).toBe(6); // spine-leaf has 6 nodes

      const currentFile = await topoViewerPage.getCurrentFile();
      expect(currentFile).toBe(SPINE_LEAF_FILE);
    });
  });

  test.describe('Empty Topology', () => {
    test('simple topology without annotations creates annotations on move', async ({ page, topoViewerPage }) => {
      await topoViewerPage.gotoFile(SIMPLE_FILE);
      await topoViewerPage.waitForCanvasReady();
      await topoViewerPage.setEditMode();
      await topoViewerPage.unlock();

      // Initially simple.clab.yml has no annotations file
      // Get node and move it
      const box = await topoViewerPage.getNodeBoundingBox('srl1');
      expect(box).not.toBeNull();

      await drag(
        page,
        { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
        { x: box!.x + box!.width / 2 + 50, y: box!.y + box!.height / 2 + 50 },
        { steps: 5 }
      );
      await page.waitForTimeout(500);

      // Annotations file should now exist with positions
      const annotations = await topoViewerPage.getAnnotationsFromFile(SIMPLE_FILE);
      expect(annotations.nodeAnnotations?.length).toBeGreaterThan(0);

      const srl1Annotation = annotations.nodeAnnotations?.find(n => n.id === 'srl1');
      expect(srl1Annotation).toBeDefined();
      expect(srl1Annotation?.position).toBeDefined();
    });
  });
});
