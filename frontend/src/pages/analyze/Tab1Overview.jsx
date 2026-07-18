import InsightCarousel from '../../components/InsightCarousel';
import { compactMoney } from '../../lib/scannerPresentation';
import { buildSynthesis } from '../../lib/synthesis';

function Badge({ label, value, colorFn }) {
  const cls = colorFn(value);
  return (
    <div className="az-badge-group">
      <div className="az-badge-label">{label}</div>
      <div className={`az-badge ${cls}`}>{value}</div>
    </div>
  );
}

export default function Tab1Overview({ data }) {
  const { sector, gexTotal, putWall, callWall, trend, conclusion, scenarios, price, recommendation, recommendationUnavailableReason, earnings,
    ivHvDiff, gammaFlip, localGamma, focusScore, supportResistance, mfi } = data;
  const gexPositive = gexTotal > 0;
  const gexStr = compactMoney(gexTotal);

  // Synthesis layer: core conclusion, cross-signal agreement, GEX environment
  // reading, PCR/IV plain language and volatility attribution. All model
  // readings of public data, never position claims.
  const synth = buildSynthesis(data);

  const insights = [
    `${gexPositive ? '正' : '负'} Gamma 环境（模型估算 ${gexStr}）：短线波动可能${gexPositive ? '较容易收窄' : '较容易放大'}`,
    `格局：${trend.regime}，动量${trend.momentum}，信号：${trend.signal}`,
    `值得关注的点位：上方 Call Wall $${callWall}（+${((callWall / price - 1) * 100).toFixed(1)}%）/ 下方 Put Wall $${putWall}（${((putWall / price - 1) * 100).toFixed(1)}%）。`,
    recommendation ? `策略候选：${recommendation.strategy}${recommendation.params.pop == null ? '' : `，模型估算 POP ${recommendation.params.pop}%`}，DTE ${recommendation.params.dte}天` : null,
  ].filter(Boolean);

  const questions = [
    {
      q: '当前期权结构是正Gamma还是负Gamma？',
      // Prefer the global/local reading (it says whether the current zone
      // damps or amplifies) over a single global-sign sentence.
      a: synth.gexEnv.available
        ? `${synth.gexEnv.text}${synth.pcr.available ? ` ${synth.pcr.text}` : ''} ${synth.gexEnv.note}`
        : gexPositive
          ? `当前模型显示正 Gamma 环境（估算 GEX ${gexStr}）。盘面上，价格靠近关键行权价时，短线波动通常较容易收窄或被拉回。这个结论基于公开 OI 的模型估算，不代表已确认任何参与者的实际仓位。`
          : `当前模型显示负 Gamma 环境（估算 GEX ${gexStr}）。盘面上，价格一旦向上或向下加速，短线波动更可能被放大。这个结论基于公开 OI 的模型估算，不代表已确认任何参与者的实际仓位。`,
      type: gexPositive ? 'bull' : 'bear',
    },
    {
      q: '今天的波动主要来自哪里？',
      // Q2 rewritten as volatility attribution (competitor "波动来源"): a
      // sequence of measurable tests, not a restatement of momentum + PCR.
      a: synth.attribution.available
        ? `${synth.attribution.text} ${synth.attribution.note}`
        : `当前价格历史不足以归因今日波动来源；动量为${trend.momentum}，${gexPositive ? '正' : '负'} Gamma 环境。`,
      type: 'neutral',
    },
    {
      q: '接下来的关键位置是什么？',
      a: `上方 $${callWall}（Call Wall，+${((callWall / price - 1) * 100).toFixed(1)}%）和下方 $${putWall}（Put Wall，${((putWall / price - 1) * 100).toFixed(1)}%）是接下来值得重点关注的价位。它们是期权持仓集中的模型参考位，不是价格一定会触及或反转的位置。${synth.expectedMove.available ? ` ${synth.expectedMove.text}` : ''}`,
      type: 'neutral',
    },
  ];

  return (
    <div className="tab-overview">
      {/* Sector chips */}
      <div className="az-sector-chips">
        {sector.map((s, i) => <span key={i} className="az-chip">{s}</span>)}
      </div>

      {/* Today's core conclusion — one headline the reader should remember,
          plus the cross-signal agreement read. */}
      {synth.core.available && (
        <div className="az-core-conclusion">
          <div className="az-core-conclusion-label">今日核心结论</div>
          <div className="az-core-conclusion-headline">{synth.core.headline}</div>
          {synth.consistency.available && (
            <div className="az-core-conclusion-sub">{synth.consistency.text}</div>
          )}
          <div className="az-core-conclusion-note">{synth.core.note}</div>
        </div>
      )}

      <div className="az-analysis-metrics">
        <div className="az-analysis-metric">
          <span>Focus Score</span>
          <strong>{focusScore?.score ?? '--'}</strong>
          <small>{focusScore?.label || '历史不足'}</small>
        </div>
        <div className="az-analysis-metric">
          <span>MFI · 价量动量</span>
          <strong>{mfi?.value == null ? '--' : mfi.value.toFixed(0)}</strong>
          <small>{mfi?.signal === 'overbought' ? '超买区' : mfi?.signal === 'oversold' ? '超卖区' : mfi?.signal === 'neutral' ? '中性区' : '14日历史不足'}</small>
        </div>
        <div className="az-analysis-metric">
          <span>Vol Risk Premium</span>
          <strong>{ivHvDiff == null ? '--' : `${ivHvDiff > 0 ? '+' : ''}${ivHvDiff.toFixed(1)}pt`}</strong>
          <small>IV30 - HV30</small>
        </div>
        <div className="az-analysis-metric">
          <span>Gamma Flip</span>
          <strong>{gammaFlip == null ? '--' : `$${gammaFlip.toFixed(2)}`}</strong>
          <small>{gammaFlip == null ? '当前快照未得出' : `${((price / gammaFlip - 1) * 100).toFixed(1)}% from spot`}</small>
        </div>
        <div className="az-analysis-metric">
          <span>Local Gamma 局部净 GEX</span>
          <strong>{compactMoney(localGamma)}</strong>
          <small>现价 ±1% 内的模型估算净 GEX</small>
        </div>
      </div>

      <div className="az-gex-explainer">
        <strong>GEX 怎么看</strong>
        <span>GEX 用 Gamma、OI、合约乘数和现价估算标的变动 1% 时的 Delta-dollar 变化。它不是资金流，也不是目标价。</span>
        <span>正/负只用来描述模型下可能较收敛或较放大的波动环境；局部 GEX 只看现价附近 ±1% 的期权结构。公开 OI 无法确认任何参与者的真实仓位。</span>
      </div>

      {supportResistance && (
        <div className="az-level-strip">
          <span>技术支撑 S: {supportResistance.support.map(level => `$${Number(level.price).toFixed(2)}`).join(' / ') || '--'}</span>
          <span>技术阻力 R: {supportResistance.resistance.map(level => `$${Number(level.price).toFixed(2)}`).join(' / ') || '--'}</span>
        </div>
      )}

      {/* 3 Question cards */}
      <div className="az-question-grid">
        {questions.map((item, i) => (
          <div key={i} className={`az-q-card ${item.type === 'bear' ? 'az-q-card-bear' : ''}`}>
            <div className="az-q-num">Q{i + 1}</div>
            <div className="az-q-question">{item.q}</div>
            <div className="az-q-answer">{item.a}</div>
          </div>
        ))}
      </div>

      {/* Conclusion + badges */}
      <div className="az-conclusion-card">
        <div className="az-conclusion-badges">
          <Badge label="格局" value={trend.regime}
            colorFn={v => v.includes('多头') ? 'az-badge-bull' : v.includes('空头') ? 'az-badge-bear' : 'az-badge-neutral'} />
          <Badge label="动量" value={trend.momentum}
            colorFn={v => v.includes('向上') ? 'az-badge-bull' : v.includes('向下') ? 'az-badge-bear' : 'az-badge-neutral'} />
          <Badge label="信号" value={trend.signal}
            colorFn={v => v.includes('延续') ? 'az-badge-bull' : 'az-badge-warn'} />
          <Badge label="GEX环境" value={gexPositive ? '正 Gamma' : '负 Gamma'}
            colorFn={v => v === '正 Gamma' ? 'az-badge-bull' : 'az-badge-bear'} />
        </div>
        <div className="az-conclusion-text">{conclusion}</div>

        {/* Scenario playbook */}
        <div className="az-scenario-row">
          <div className="az-scenario az-scenario-bull">
            <div className="az-scenario-title">上行情景</div>
            <div className="az-scenario-line">条件：日线收盘站上 <strong>${scenarios.upTrigger}</strong></div>
            <div className="az-scenario-line">下一观察位：<strong>${scenarios.upTarget}</strong></div>
            <div className="az-scenario-hint">观察成交量与 Gamma 是否同步变化</div>
          </div>
          <div className="az-scenario az-scenario-bear">
            <div className="az-scenario-title">下行情景</div>
            <div className="az-scenario-line">条件：日线收盘跌破 <strong>${scenarios.downTrigger}</strong></div>
            <div className="az-scenario-line">下一观察位：<strong>${scenarios.downTarget}</strong></div>
            <div className="az-scenario-hint">观察价格与 Gamma 是否同步变化</div>
          </div>
        </div>
      </div>

      {recommendation ? (
        <div className="az-card" style={{ marginTop: 12 }}>
          <div className="az-card-title">策略候选 · 模型筛选结果</div>
          <div className="az-rec-header">
            <div>
              <div className="az-rec-strategy">{recommendation.strategy}</div>
              <div className="az-rec-reason">{recommendation.reason}</div>
            </div>
            <div className="az-rec-pop">
              <div className="az-rec-pop-val">{recommendation.params.pop == null ? '--' : `${recommendation.params.pop}%`}</div>
              <div className="az-rec-pop-label">模型估算 POP</div>
            </div>
          </div>
          <div className="az-rec-params">
            <div className="az-rec-param">
              <span className="az-rec-param-label">DTE</span>
              <span className="az-rec-param-val">{recommendation.params.dte}天</span>
            </div>
            <div className="az-rec-param">
              <span className="az-rec-param-label">Short Δ</span>
              <span className="az-rec-param-val">{recommendation.params.shortDelta}</span>
            </div>
            <div className="az-rec-param">
              <span className="az-rec-param-label">{recommendation.params.premiumLabel}</span>
              <span className="az-rec-param-val" style={{ color: 'var(--green)' }}>{recommendation.params.premium == null ? '--' : `$${recommendation.params.premium}`}</span>
            </div>
            <div className="az-rec-param">
              <span className="az-rec-param-label">Max Loss</span>
              <span className="az-rec-param-val" style={{ color: 'var(--red)' }}>
                {recommendation.params.maxLoss === null ? '无限' : `$${recommendation.params.maxLoss}`}
              </span>
            </div>
          </div>
          {recommendation.directionNote && (
            <div className="az-rec-warning">{recommendation.directionNote}：该候选按流动性/结构分入选，方向上与当前趋势不一致，仅作研究参考</div>
          )}
          {recommendation.params.maxLoss === null && (
            <div className="az-rec-warning">裸卖策略风险无限，建议加保护腿转为 defined-risk</div>
          )}
          {earnings.warning && (
            <div className="az-rec-warning">财报在 {earnings.daysAway} 天内，事件后隐含波动率可能变化</div>
          )}
          <div className="az-rec-legs">
            {recommendation.legs.map((leg, i) => (
              <div key={i} className="az-rec-leg">
                <span className={leg.dir === 1 ? 'az-leg-long' : 'az-leg-short'}>{leg.dir === 1 ? 'LONG' : 'SHORT'}</span>
                <span>{leg.label}</span>
                <span style={{ color: 'var(--text-dim)' }}>Δ {leg.deltaTarget}</span>
                <span style={{ color: 'var(--text-dim)' }}>{leg.dte}d</span>
              </div>
            ))}
          </div>
          <div className="az-data-note">POP 基于当前模型和输入，不是实际胜率保证；未必包含滑点、手续费、提前指派和波动率变化。</div>
        </div>
      ) : (
        <div className="az-card" style={{ marginTop: 12 }}>
          <div className="az-card-title">策略候选 · 模型筛选结果</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {recommendationUnavailableReason || '当前没有满足筛选门槛的真实策略腿。'}
          </div>
        </div>
      )}
      <InsightCarousel insights={insights} />
    </div>
  );
}
