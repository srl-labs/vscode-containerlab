/* eslint-env mocha, node */
/* global __dirname, global */
import { expect } from 'chai';
import sinon from 'sinon';
import path from 'path';
import { describe, it, afterEach } from 'mocha';
import fs from 'fs';
import vm from 'vm';

describe('logger (webview)', () => {
  const loggerPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'src',
    'topoViewer',
    'webview',
    'platform',
    'logging',
    'logger'
  );
  const originalWindow = (global as any).window;

  afterEach(() => {
    delete require.cache[require.resolve(loggerPath)];
    sinon.restore();
    (global as any).window = originalWindow;
  });

  it('posts messages to VS Code extension host', () => {
    const postMessage = sinon.spy();
    const resolved = `${loggerPath}.js`;
    const code = fs.readFileSync(resolved, 'utf8');
    const shared: any = {};
    const sandbox: any = {
      exports: shared,
      module: { exports: shared },
      require,
      __filename: resolved,
      __dirname: path.dirname(resolved),
      window: { vscode: { postMessage } }
    };
    vm.runInNewContext(code, sandbox, { filename: resolved });

    const { log } = sandbox.exports as typeof import('../../../../src/topoViewer/webview/platform/logging/logger');
    log.error('boom');

    expect(postMessage.calledOnce).to.be.true;
    const arg = postMessage.firstCall.args[0];
    expect(arg.command).to.equal('topoViewerLog');
    expect(arg.level).to.equal('error');
    expect(arg.message).to.equal('boom');
    expect(arg.fileLine).to.be.a('string');
  });

  it('stringifies objects before sending', () => {
    const postMessage = sinon.spy();
    const resolved = `${loggerPath}.js`;
    const code = fs.readFileSync(resolved, 'utf8');
    const shared: any = {};
    const sandbox: any = {
      exports: shared,
      module: { exports: shared },
      require,
      __filename: resolved,
      __dirname: path.dirname(resolved),
      window: { vscode: { postMessage } }
    };
    vm.runInNewContext(code, sandbox, { filename: resolved });

    const { log } = sandbox.exports as typeof import('../../../../src/topoViewer/webview/platform/logging/logger');
    log.info({ a: 1 });

    const arg = postMessage.firstCall.args[0];
    expect(arg.message).to.equal('{"a":1}');
    expect(arg.level).to.equal('info');
  });
});
