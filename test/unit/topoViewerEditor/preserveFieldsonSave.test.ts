import { expect } from 'chai';
import sinon from 'sinon';
import Module from 'module';
import path from 'path';
import * as fs from 'fs';
import * as YAML from 'yaml';
import { TopoViewerEditor } from '../../../src/topoViewerEditor/backend/topoViewerEditorWebUiFacade';
const vscodeStub = require('../../helpers/vscode-stub');

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
	if (request === 'vscode') {
		return path.join(__dirname, '..', '..', 'helpers', 'vscode-stub.js');
	}
	if (request.endsWith('commands/index')) {
		return path.join(__dirname, '..', '..', '..', 'src', 'commands', 'index.js');
	}
	return originalResolve.call(this, request, parent, isMain, options);
};

const sampleYaml = `\nname: test\ntopology:\n  nodes:\n    leaf1:\n      kind: nokia_srlinux\n      startup-config: configs/leaf1.partial.txt\n`;

describe('TopoViewerEditor preserve fields on save', () => {
	after(() => {
		(Module as any)._resolveFilename = originalResolve;
	});

	beforeEach(() => {
		sinon.restore();
		vscodeStub.workspace.createFileSystemWatcher = () => ({
			onDidChange: () => { },
			dispose: () => { },
		});
		vscodeStub.workspace.onDidSaveTextDocument = () => ({ dispose: () => { } });
	});

	it('should keep existing node attributes when saving', async () => {
		sinon.stub(fs.promises, 'readFile').resolves(sampleYaml as any);
		sinon.stub(fs.promises, 'mkdir').resolves();

		let writtenYaml = '';
		sinon.stub(fs.promises, 'writeFile').callsFake(async (_p, data) => {
			writtenYaml = data as string;
		});

		let messageHandler: any = null;
		const panelStub = {
			webview: {
				asWebviewUri: (u: any) => u,
				html: '',
				postMessage: sinon.spy(),
				onDidReceiveMessage: (cb: any) => { messageHandler = cb; },
			},
			onDidDispose: () => { },
			reveal: () => { },
		};
		sinon.stub(vscodeStub.window, 'createWebviewPanel').returns(panelStub as any);

		const context = { extensionUri: vscodeStub.Uri.file('/ext'), subscriptions: [] } as any;
		const editor = new TopoViewerEditor(context);
		editor.lastYamlFilePath = '/tmp/test.clab.yml';

		sinon.stub((editor as any).adaptor, 'clabYamlToCytoscapeElements').returns([]);
		sinon.stub((editor as any).adaptor, 'generateStaticAssetUris').returns({ css: '', js: '', images: '' });
		sinon.stub((editor as any).adaptor, 'createFolderAndWriteJson').callsFake(async (...args: any[]) => {
			const yamlStr = args[3] as string;
			(editor as any).adaptor.currentClabDoc = YAML.parseDocument(yamlStr);
			return [] as any;
		});
		sinon.stub(editor as any, 'validateYaml').resolves(true);

		await editor.createWebviewPanel(context, vscodeStub.Uri.file('/tmp/test.clab.yml'), 'test');

		const payload = JSON.stringify([{ group: 'nodes', data: { id: 'leaf1', name: 'leaf1', topoViewerRole: 'router', extraData: {}, }, position: { x: 5, y: 5 } }]);
		if (messageHandler) {
			await messageHandler({ type: 'POST', requestId: '1', endpointName: 'topo-editor-viewport-save', payload });
		}

		expect(writtenYaml).to.contain('startup-config: configs/leaf1.partial.txt');
	});
});