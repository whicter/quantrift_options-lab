import React from 'react';
import InsightCarousel from '../../components/InsightCarousel';

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
  const { sector, gexTotal, putWall, callWall, pcr, trend, conclusion, scenarios, price, recommendation, earnings, iv30 } = data;
  const gexPositive = gexTotal > 0;
  const gexStr = Math.abs(gexTotal) >= 1e9
    ? `$${(gexTotal / 1e9).toFixed(2)}B`
    : `$${(Math.abs(gexTotal) / 1e6).toFixed(1)}M`;

  const insights = [
    `${gexPositive ? '正Gamma' : '负Gamma'}环境（GEX ${gexStr}），做市商${gexPositive ? '减震对冲，价格倾向震荡' : '跟随对冲，波动可能放大'}`,
    `格局：${trend.regime}，动量${trend.momentum}，信号：${trend.signal}`,
    `关键区间：上方压力 $${callWall}（+${((callWall / price - 1) * 100).toFixed(1)}%）/ 下方支撑 $${putWall}（${((putWall / price - 1) * 100).toFixed(1)}%）`,
    recommendation ? `推荐策略：${recommendation.strategy}，POP ${recommendation.params.pop}%，DTE ${recommendation.params.dte}天` : null,
  ].filter(Boolean);

  const questions = [
    {
      q: '当前期权结构是正Gamma还是负Gamma？',
      a: gexPositive
        ? `正Gamma环境（GEX ${gexStr}），做市商持有long gamma，有减震效应，价格倾向于在Call Wall $${callWall}和Put Wall $${putWall}间震荡`
        : `负Gamma环境（GEX -${gexStr}），做市商持有short gamma，需跟随价格对冲，可能放大波动`,
      type: gexPositive ? 'bull' : 'bear',
    },
    {
      q: '上涨/下跌来自趋势修复，还是期权结构推动？',
      a: trend.momentum === '向上增强'
        ? `趋势主导：${trend.regime}，动量${trend.momentum}，技术面是主要驱动力，${gexPositive ? 'Gamma减震辅助' : '注意负Gamma放大效应'}`
        : trend.momentum === '向下减弱'
        ? `技术面走弱：动量${trend.momentum}，当前走势可能主要来自${gexPositive ? 'Gamma壁效应' : '负Gamma放大效应'}`
        : `技术与期权共同作用：动量${trend.momentum}，${gexPositive ? 'Gamma减震' : 'Gamma放大'}是主要结构特征`,
      type: 'neutral',
    },
    {
      q: '接下来的关键位置是什么？',
      a: `上方 Call Wall $${callWall}（+${((callWall / price - 1) * 100).toFixed(1)}%），下方 Put Wall $${putWall}（${((putWall / price - 1) * 100).toFixed(1)}%）。谁离现价更近，就更容易先被测试`,
      type: 'neutral',
    },
  ];

  return (
    <div className="tab-overview">
      {/* Sector chips */}
      <div className="az-sector-chips">
        {sector.map((s, i) => <span key={i} className="az-chip">{s}</span>)}
      </div>

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
          <Badge label="GEX环境" value={gexPositive ? '正Gamma' : '负Gamma'}
            colorFn={v => v === '正Gamma' ? 'az-badge-bull' : 'az-badge-bear'} />
        </div>
        <div className="az-conclusion-text">{conclusion}</div>

        {/* Scenario playbook */}
        <div className="az-scenario-row">
          <div className="az-scenario az-scenario-bull">
            <div className="az-scenario-title">多头剧本</div>
            <div className="az-scenario-line">触发：突破 <strong>${scenarios.upTrigger}</strong></div>
            <div className="az-scenario-line">目标：<strong>${scenarios.upTarget}</strong></div>
            <div className="az-scenario-hint">观察成交量与Gamma是否同步扩张</div>
          </div>
          <div className="az-scenario az-scenario-bear">
            <div className="az-scenario-title">空头剧本</div>
            <div className="az-scenario-line">触发：跌破 <strong>${scenarios.downTrigger}</strong></div>
            <div className="az-scenario-line">目标：<strong>${scenarios.downTarget}</strong></div>
            <div className="az-scenario-hint">观察跌破后是否出现负Gamma放大</div>
          </div>
        </div>
      </div>

      {recommendation ? (
        <div className="az-card" style={{ marginTop: 12 }}>
          <div className="az-card-title">策略推荐</div>
          <div className="az-rec-header">
            <div>
              <div className="az-rec-strategy">{recommendation.strategy}</div>
              <div className="az-rec-reason">{recommendation.reason}</div>
            </div>
            <div className="az-rec-pop">
              <div className="az-rec-pop-val">{recommendation.params.pop}%</div>
              <div className="az-rec-pop-label">POP</div>
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
              <span className="az-rec-param-label">Max Credit</span>
              <span className="az-rec-param-val" style={{ color: 'var(--green)' }}>${recommendation.params.maxCredit}</span>
            </div>
            <div className="az-rec-param">
              <span className="az-rec-param-label">Max Loss</span>
              <span className="az-rec-param-val" style={{ color: 'var(--red)' }}>
                {recommendation.params.maxLoss === null ? '无限' : `$${recommendation.params.maxLoss}`}
              </span>
            </div>
          </div>
          {recommendation.params.maxLoss === null && (
            <div className="az-rec-warning">裸卖策略风险无限，建议加保护腿转为 defined-risk</div>
          )}
          {earnings.warning && (
            <div className="az-rec-warning">财报在 {earnings.daysAway} 天内，注意 IV Crush 风险</div>
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
        </div>
      ) : (
        <div className="az-card" style={{ marginTop: 12 }}>
          <div className="az-card-title">策略推荐</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            当前仅展示真实价格与 GEX 结构；缺少完整 IV metrics / liquidity / POP 输入，不生成策略腿推荐。
          </div>
        </div>
      )}
      <InsightCarousel insights={insights} />
    </div>
  );
}
