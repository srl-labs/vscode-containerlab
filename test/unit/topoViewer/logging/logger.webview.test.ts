/* eslint-env mocha */
/* eslint-disable no-undef */
import { expect } from 'chai';
import sinon from 'sinon';
import path from 'path';
import { describe, it, afterEach } from 'mocha';

describe('logger (webview)', () => {
  const loggerPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'src',
    'topoViewer',
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
    (global as any).window = { vscode: { postMessage } };

    const { log } = require(loggerPath);
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
    (global as any).window = { vscode: { postMessage } };

    const { log } = require(loggerPath);
    log.info({ a: 1 });

    const arg = postMessage.firstCall.args[0];
    expect(JSON.parse(arg.message)).to.deep.equal({ a: 1 });
    expect(arg.level).to.equal('info');
  });

  it('converts errors to plain objects', () => {
    const postMessage = sinon.spy();
    (global as any).window = { vscode: { postMessage } };

    const { log } = require(loggerPath);
    const err = new Error('boom');
    log.error(err);

    const arg = postMessage.firstCall.args[0];
    const parsed = JSON.parse(arg.message);
    expect(parsed).to.include({ name: 'Error', message: 'boom' });
  });

  it('handles circular references safely', () => {
    const postMessage = sinon.spy();
    (global as any).window = { vscode: { postMessage } };

    const { log } = require(loggerPath);
    const obj: any = {};
    obj.self = obj;
    log.info(obj);

    const arg = postMessage.firstCall.args[0];
    const parsed = JSON.parse(arg.message);
    expect(parsed.self).to.equal('[Circular]');
  });
});
