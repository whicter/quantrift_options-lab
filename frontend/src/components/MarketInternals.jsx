import { useEffect, useState } from 'react';
import { getMarketBreadth } from '../lib/api';
import { buildBreadthView } from '../lib/marketBreadth';

function fmtAsOf(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleString('en-US', {
    timeZone: 'America/New_York', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })} ET`;
}

const fmt = (v, digits = 1) => (v == null || !Number.isFinite(v) ? '--' : v.toFixed(digits));
const pctText = (v) => (v == null || !Number.isFinite(v) ? '--' : `${v}%`);

// Options-native market breadth: dealer gamma split, IV-rank and PCR quartile
// tracks, plus % above MA. The gamma/IV/PCR planes are the differentiator; % of
// stocks above their MA is the familiar price-breadth companion.
export default function MarketInternals() {
  const [raw, setRaw] = useState(null);
  useEffect(() => { getMarketBreadth().then(setRaw).catch(() => {}); }, []);

  if (!raw) return null; // loading: stay quiet like the regime strip
  const view = buildBreadthView(raw);
  if (view.status !== 'ready' || view.empty) return null;

  const { gamma, ivRank, pcr, trend } = view;
  const asOf = fmtAsOf(view.gammaAsOf);

  return (
    <section className="mi-panel" aria-label="Market Internals">
      <div className="mi-head">
        <h3>市场内参 · Market Internals</h3>
        <span className="mi-native">期权原生</span>
        <span className="mi-asof">
          {view.universeCount ? `${view.universeCount} 只 universe` : ''}{asOf ? ` · 截至 ${asOf}` : ''}
        </span>
      </div>
      <p className="mi-sub">整个 scan universe 的持仓与波动体征聚合，不只是价格宽度。</p>

      <div className="mi-grid">
        {gamma && (
          <div className="mi-module mi-gamma">
            <div className="mi-top">
              <span className="mi-lbl">Dealer Gamma 环境</span>
              <span className="mi-counted">{gamma.counted} 只有 GEX</span>
            </div>
            <div className="mi-gsplit">
              <span className="p" style={{ width: `${gamma.positivePct}%` }}>正 Gamma {pctText(gamma.positivePct)}</span>
              <span className="n" style={{ width: `${gamma.negativePct}%` }}>负 {pctText(gamma.negativePct)}</span>
            </div>
            <div className="mi-cap">
              {gamma.positivePct >= 50
                ? '多数标的做市商处于正 Gamma（倾向抑制波动）。'
                : '多数标的做市商处于负 Gamma（倾向放大波动）。'}
            </div>
          </div>
        )}

        {ivRank && (
          <div className="mi-module">
            <div className="mi-top">
              <span className="mi-lead"><span className="mi-big">{fmt(ivRank.median)}</span><span className="mi-lbl">IV Rank 中位</span></span>
              <span className="mi-counted">{ivRank.counted} 只 ready</span>
            </div>
            <div className="mi-track">
              <span className="mi-tick" style={{ left: '25%' }} />
              <span className="mi-tick" style={{ left: '50%' }} />
              <span className="mi-tick" style={{ left: '75%' }} />
              {ivRank.left != null && ivRank.right != null && (
                <span className="mi-band" style={{ left: `${ivRank.left}%`, right: `${ivRank.right}%` }} />
              )}
              {ivRank.medianPos != null && <span className="mi-med" style={{ left: `${ivRank.medianPos}%` }} />}
            </div>
            <div className="mi-scale">
              <span>0</span>
              <span>p25 {fmt(ivRank.p25)} — p75 {fmt(ivRank.p75)}</span>
              <span>100</span>
            </div>
            <div className="mi-cap">{pctText(ivRank.elevatedPct)} 标的 IV Rank ≥ 50。</div>
          </div>
        )}

        {pcr && (
          <div className="mi-module">
            <div className="mi-top">
              <span className="mi-lead"><span className="mi-big">{fmt(pcr.median, 2)}</span><span className="mi-lbl">PCR 中位 (OI)</span></span>
              <span className="mi-counted">{pcr.counted} 只</span>
            </div>
            <div className="mi-track mi-pcr">
              {pcr.parityPos != null && <span className="mi-parity" style={{ left: `${pcr.parityPos}%` }} />}
              {pcr.left != null && pcr.right != null && (
                <span className="mi-band" style={{ left: `${pcr.left}%`, right: `${pcr.right}%` }} />
              )}
              {pcr.medianPos != null && <span className="mi-med" style={{ left: `${pcr.medianPos}%` }} />}
            </div>
            <div className="mi-scale">
              <span>{fmt(pcr.domain[0], 1)}</span>
              <span>平衡 1.0</span>
              <span>{fmt(pcr.domain[1], 1)}</span>
            </div>
            <div className="mi-cap">
              {pcr.median > 1.05 ? 'Put 持仓偏多。' : pcr.median < 0.95 ? 'Call 持仓偏多。' : 'Put/Call 持仓大体均衡。'}
            </div>
          </div>
        )}

        {trend && (
          <div className="mi-module mi-trend">
            <div className="mi-top">
              <span className="mi-lbl">趋势宽度 · % above MA</span>
              <span className="mi-counted">{trend.counted} 只有足够历史</span>
            </div>
            <div className="mi-mabars">
              <div className="mi-marow">
                <span className="mi-mlbl">&gt; MA50</span>
                <span className="mi-mtrack"><i style={{ width: `${trend.aboveMa50Pct ?? 0}%` }} /></span>
                <span className="mi-mval">{pctText(trend.aboveMa50Pct)}</span>
              </div>
              <div className="mi-marow">
                <span className="mi-mlbl">&gt; MA200</span>
                <span className="mi-mtrack"><i style={{ width: `${trend.aboveMa200Pct ?? 0}%` }} /></span>
                <span className="mi-mval">{pctText(trend.aboveMa200Pct)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
