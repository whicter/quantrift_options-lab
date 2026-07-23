import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasPngDataUrl, downloadCanvasPng } from './canvasExport.js';

test('canvasPngDataUrl always requests a PNG payload', () => {
  const canvas = { toDataURL: (type) => `data:${type};base64,abc` };
  assert.equal(canvasPngDataUrl(canvas), 'data:image/png;base64,abc');
});

test('downloadCanvasPng creates a named click target', () => {
  const link = { clickCalled: false, click() { this.clickCalled = true; } };
  const documentRef = { createElement: (tag) => { assert.equal(tag, 'a'); return link; } };
  const canvas = { toDataURL: () => 'data:image/png;base64,abc' };

  downloadCanvasPng(canvas, 'bull-call-spread-payoff.png', documentRef);

  assert.equal(link.href, 'data:image/png;base64,abc');
  assert.equal(link.download, 'bull-call-spread-payoff.png');
  assert.equal(link.clickCalled, true);
});

test('canvasPngDataUrl rejects a missing canvas', () => {
  assert.throws(() => canvasPngDataUrl(null), /canvas with toDataURL/);
});
