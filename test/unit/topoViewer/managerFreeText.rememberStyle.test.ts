/* eslint-env mocha */
import { describe, it } from 'mocha';
import { expect } from 'chai';
import cytoscape from 'cytoscape';
import { FreeTextManager } from '../../../src/topoViewer/webview/features/annotations/FreeTextManager';

// ensure window is available
(globalThis as any).window = globalThis;

describe('ManagerFreeText remember style', () => {
  it('applies last used style to new free text', async () => {
    const cy = cytoscape({ headless: true });
    const messageSender = { sendMessageToVscodeEndpointPost: async () => ({}) } as any;
    const mgr = new FreeTextManager(cy, messageSender);

    mgr.addFreeTextAnnotation({
      id: 'freeText_1',
      text: 'First',
      position: { x: 0, y: 0 },
      fontSize: 18,
      fontColor: '#ff0000',
      backgroundColor: '#00ff00',
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'underline',
      fontFamily: 'serif'
    });

    const mgrAny = mgr as any;
    const modal = mgrAny.modalController as any;
    let passedAnnotation: any;
    modal.promptForTextWithFormatting = async (_title: string, annotation: any) => {
      passedAnnotation = annotation;
      return { ...annotation, text: 'Second' };
    };

    await mgrAny.addFreeTextAtPosition({ x: 10, y: 20 });

    expect(passedAnnotation).to.include({
      fontSize: 18,
      fontColor: '#ff0000',
      backgroundColor: '#00ff00',
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'underline',
      fontFamily: 'serif'
    });

    const annotations = mgr.getAnnotations();
    const second = annotations.find(a => a.id !== 'freeText_1');
    expect(second).to.include({
      fontSize: 18,
      fontColor: '#ff0000',
      backgroundColor: '#00ff00',
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'underline',
      fontFamily: 'serif'
    });
  });
});
