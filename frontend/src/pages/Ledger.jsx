import { useEffect, useState } from 'react';
import { getScannerLedger } from '../lib/api';

const FAMILY_ZH = {
  credit_vertical: '信用价差', iron: '铁鹰/铁蝶', single_leg: '单腿',
  straddle_strangle: '跨式/宽跨', combo: '组合', time_spread: '日历/对角',
};

const pctText = (v) => (v == null || !Number.isFinite(Number(v)) ? '--' : `${v}%`);

// Candidate result ledger (R2.1): an honest track record of past scanner
// candidates scored at expiry. It starts empty and fills as candidates expire —
// model validation, never a trade signal.
export default function Ledger() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { getScannerLedger().then(setD).catch(() => setError(true)); }, []);

  return (
    <main className="ledger-page">
      <header className="ledger-head">
        <div className="ledger-kicker">信任层 · 模型记录</div>
        <h1>候选结果台账</h1>
        <p>
          扫描器过去给出的候选，到期后用真实标的收盘价逐个结算，统计按策略族的胜率与 POP 校准。
          这是模型验证，不是跟单信号；随候选陆续到期而积累。
        </p>
      </header>

      {error && <div className="ledger-loading">台账暂不可用。</div>}
      {!error && !d && <div className="ledger-loading">加载中…</div>}

      {d && d.status === 'ready' && (
        <>
          <div className="ledger-stats">
            <div className="ledger-stat"><span>追踪中</span><strong>{d.tracked.toLocaleString()}</strong><small>候选已入账</small></div>
            <div className="ledger-stat"><span>已结算</span><strong>{d.resolved.toLocaleString()}</strong><small>到期已评估</small></div>
            <div className="ledger-stat"><span>总胜率</span><strong>{pctText(d.overall_win_rate)}</strong><small>win / (win+loss)</small></div>
            <div className="ledger-stat"><span>待到期</span><strong>{(d.pending || 0).toLocaleString()}</strong><small>{d.next_expiry ? `最早 ${d.next_expiry}` : '—'}</small></div>
          </div>

          {d.resolved === 0 ? (
            <div className="ledger-empty">
              <b>积累中。</b>还没有候选到期结算——最早到期 {d.next_expiry || '—'}。到期后这里会按策略族给出真实胜率与 POP 校准。
              <div className="ledger-cov">已入账 {d.tracked.toLocaleString()} 个候选；其中日历/对角结构到期需重定价、将标注为"不可评估"，不计入胜率。</div>
            </div>
          ) : (
            <>
              <section className="ledger-section">
                <h2>按策略族胜率</h2>
                <div className="ledger-table">
                  <div className="ledger-tr ledger-th"><span>策略族</span><span>已结算</span><span>胜率</span><span>平均 ROR</span></div>
                  {d.by_family.map(f => (
                    <div className="ledger-tr" key={f.strategy_family}>
                      <span>{FAMILY_ZH[f.strategy_family] || f.strategy_family}</span>
                      <span>{f.resolved}</span>
                      <span className={f.win_rate != null && f.win_rate >= 50 ? 'ledger-pos' : 'ledger-neg'}>{pctText(f.win_rate)}</span>
                      <span>{f.avg_return_on_risk == null ? '--' : `${(f.avg_return_on_risk * 100).toFixed(0)}%`}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="ledger-section">
                <h2>POP 校准 <small>预测概率 vs 实际胜率</small></h2>
                <div className="ledger-table">
                  <div className="ledger-tr ledger-th"><span>预测 POP</span><span>样本</span><span>实际胜率</span></div>
                  {d.calibration.map(c => (
                    <div className="ledger-tr" key={c.bucket}>
                      <span>{c.bucket}%（中值 {c.predicted_mid}）</span>
                      <span>{c.resolved}</span>
                      <span>{pctText(c.actual_win_rate)}</span>
                    </div>
                  ))}
                </div>
                <p className="ledger-foot">校准良好 = 每桶实际胜率 ≈ 预测概率。当前部分策略无静态 breakeven 模型、POP 暂缺，样本以有效 POP 为准。</p>
              </section>
            </>
          )}
          {(d.not_evaluable > 0 || d.no_price > 0) && (
            <p className="ledger-foot">另有 {d.not_evaluable} 个多到期结构不可在单到期评估、{d.no_price} 个缺到期收盘价，均不计入胜率（诚实披露，不臆测）。</p>
          )}
        </>
      )}
    </main>
  );
}
