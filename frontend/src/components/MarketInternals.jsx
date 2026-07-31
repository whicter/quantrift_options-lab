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
const intText = (v) => (v == null || !Number.isFinite(v) ? '--' : new Intl.NumberFormat('en-US').format(v));
const signedInt = (v) => {
  if (v == null || !Number.isFinite(v)) return '--';
  return `${v > 0 ? '+' : ''}${intText(v)}`;
};

function BroadMarketModule({ market }) {
  return (
    <div className="mi-broad">
      <div className="mi-top">
        <span className="mi-lbl">全市场涨跌宽度 · US Common Stocks</span>
        <span className="mi-counted">{market.marketDate} 收盘 · 有效 {intText(market.counted)} / {intText(market.universeCount)}</span>
      </div>

      <div
        className="mi-market-split"
        role="img"
        aria-label={`上涨 ${market.advances}，下跌 ${market.declines}，平盘 ${market.unchanged}`}
      >
        <span className="advance" style={{ width: `${market.advancePct || 0}%` }}>
          {(market.advancePct || 0) >= 12 ? `上涨 ${intText(market.advances)}` : ''}
        </span>
        <span className="flat" style={{ width: `${market.unchangedPct || 0}%` }} />
        <span className="decline" style={{ width: `${market.declinePct || 0}%` }}>
          {(market.declinePct || 0) >= 12 ? `下跌 ${intText(market.declines)}` : ''}
        </span>
      </div>
      <div className="mi-market-scale">
        <span className="positive">{pctText(market.advancePct)} 上涨</span>
        <span>{intText(market.unchanged)} 平盘</span>
        <span className="negative">{pctText(market.declinePct)} 下跌</span>
      </div>

      <div className="mi-market-stats">
        <div>
          <span>净上涨家数</span>
          <strong className={market.netAdvances >= 0 ? 'positive' : 'negative'}>{signedInt(market.netAdvances)}</strong>
        </div>
        <div>
          <span>A/D Ratio</span>
          <strong>{fmt(market.adRatio, 2)}</strong>
        </div>
        <div>
          <span>上涨成交量占比</span>
          <strong className={market.advancingVolumePct >= 50 ? 'positive' : 'negative'}>
            {pctText(market.advancingVolumePct)}
          </strong>
        </div>
        <div>
          <span>前收盘覆盖</span>
          <strong>{pctText(market.coveragePct)}</strong>
        </div>
      </div>

      {market.exchanges.length > 0 && (
        <div className="mi-exchanges">
          {market.exchanges.map(exchange => (
            <div key={exchange.code}>
              <b>{exchange.label || exchange.code}</b>
              <span className="positive">涨 {intText(exchange.advances)}</span>
              <span className="negative">跌 {intText(exchange.declines)}</span>
              <small>{pctText(exchange.advance_pct)} 上涨</small>
            </div>
          ))}
        </div>
      )}

      {market.history.length > 0 && (
        <div className="mi-ad-wrap">
          <div className="mi-top">
            <span className="mi-lbl">每日净上涨家数 · A/D History</span>
            <span className="mi-counted">最近 {market.history.length} 个已采集交易日</span>
          </div>
          <div className="mi-ad-chart" role="img" aria-label="每日净上涨家数历史">
            {market.history.map(point => (
              <span
                key={point.market_date}
                className={`mi-ad-point ${point.tone}`}
                title={`${point.market_date} · ${signedInt(point.net_advances)}`}
              >
                <i
                  style={{
                    height: `${point.magnitudePct / 2}%`,
                    [point.net_advances >= 0 ? 'bottom' : 'top']: '50%',
                  }}
                />
              </span>
            ))}
          </div>
          <div className="mi-scale">
            <span>{market.history[0]?.market_date}</span>
            <span>0 轴</span>
            <span>{market.history.at(-1)?.market_date}</span>
          </div>
        </div>
      )}

      <p className="mi-broad-foot">
        Nasdaq、NYSE、NYSE American 当日有成交的普通股；排除 ETF 与 OTC。涨跌按拆股调整后收盘价对比前一交易日。
      </p>
    </div>
  );
}

// Full-market EOD participation breadth plus options-native scan-universe
// internals. Both are persisted snapshots; this component never calls a data
// provider directly.
export default function MarketInternals() {
  const [raw, setRaw] = useState(null);
  useEffect(() => { getMarketBreadth().then(setRaw).catch(() => {}); }, []);

  if (!raw) return null; // loading: stay quiet like the regime strip
  const view = buildBreadthView(raw);
  if (view.status !== 'ready' || view.empty) return null;

  const { broadMarket, gamma, ivRank, pcr, trend } = view;
  const asOf = fmtAsOf(view.gammaAsOf);
  const hasOptionsInternals = gamma || ivRank || pcr || trend;

  return (
    <>
      <section className="mi-panel mi-breadth-panel" aria-label="Full Market Breadth">
        <div className="mi-head">
          <h3>全市场宽度 · Market Breadth</h3>
          <span className="mi-native">{broadMarket ? '收盘数据' : '等待数据'}</span>
          <span className="mi-asof">
            {broadMarket ? `${broadMarket.marketDate} 收盘` : '每日收盘更新'}
          </span>
        </div>
        <p className="mi-sub">NYSE、Nasdaq 与 NYSE American 普通股的日终涨跌参与度；不使用 Quantrift 扫描池代替全市场。</p>

        {broadMarket
          ? <BroadMarketModule market={broadMarket} />
          : (
            <div className="mi-broad-missing">
              <b>等待全市场日终数据</b>
              <span>更新后将显示涨跌家数、A/D Ratio、上涨成交量占比和交易所分项。</span>
            </div>
          )}
      </section>

      {hasOptionsInternals && (
        <section className="mi-panel mi-options-panel" aria-label="Options Market Internals">
          <div className="mi-head">
            <h3>覆盖池期权体征 · Options Internals</h3>
            <span className="mi-native">覆盖池</span>
            <span className="mi-asof">
              {view.universeCount ? `${view.universeCount} 只标的` : ''}{asOf ? ` · 截至 ${asOf}` : ''}
            </span>
          </div>
          <p className="mi-sub">Quantrift 覆盖池的 Dealer Gamma、隐含波动率、Put/Call 持仓与均线参与度。</p>

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
                  <span className="mi-lbl">覆盖池趋势宽度 · % above MA</span>
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
      )}
    </>
  );
}
