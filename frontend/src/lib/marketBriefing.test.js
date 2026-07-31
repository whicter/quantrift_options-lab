import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMarketBriefingView } from './marketBriefing.js';

test('replaces the legacy machine headline with a human-readable briefing', () => {
  const view = buildMarketBriefingView({
    status: 'ready',
    tilt: '偏多头',
    headline: '2026-07-30 市场偏多头，字段一，字段二。',
    callouts: {
      regime: { positive_gamma_pct: 56.6 },
      breadth: { iv_median: 56.56 },
      states: { S1: 56, S2: 68, S5: 41, S0: 27 },
      rotation: {
        leaders: [{ label: '能源' }, { label: '保险' }],
        laggards: [{ label: '可选消费' }, { label: '运输' }],
      },
    },
    earnings_ahead: Array.from({ length: 18 }, (_, index) => ({ symbol: `T${index}` })),
  });

  assert.equal(view.headline, '市场整体略偏强，但上涨并不全面。');
  assert.deepEqual(view.summary, [
    { label: '趋势', text: '强势上行 56 只，多于空头 41 只；另有 68 只处于上涨后的回调阶段。' },
    { label: '期权', text: '正 Gamma 略占优势，波动环境相对稳定（56.6% 为正 Gamma）；IV Rank 中位数为 57，处于中等区间；27 只标的处于高波动或事件驱动状态。' },
    { label: '关注', text: '能源和保险相对领先；可选消费和运输偏弱；未来一周有 18 只标的公布财报。' },
  ]);
});

test('uses the server summary unchanged after the backend upgrade', () => {
  const summary = [{ label: '趋势', text: '服务端摘要。' }];
  const view = buildMarketBriefingView({
    status: 'ready',
    tilt: '偏空头',
    headline: '服务端标题。',
    summary,
  });
  assert.equal(view.headline, '服务端标题。');
  assert.equal(view.summary, summary);
});
