import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMarketBriefing } from '../lib/api';

const compactOi = (v) => {
  if (v == null || !Number.isFinite(Number(v))) return '';
  const n = Number(v);
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`;
};

const TILT_TONE = { 偏多头: 'bull', 偏空头: 'bear', 多空均衡: 'neutral' };

// Daily market briefing (R1.2): a one-glance synthesis of the whole /market page.
// The headline is composed server-side (so it can be materialized/shared later);
// this renders it plus the "what matters today" callouts — earnings ahead and top
// option activity — that aren't in the detail panels below.
export default function MarketBriefing() {
  const [b, setB] = useState(null);
  useEffect(() => { getMarketBriefing().then(setB).catch(() => {}); }, []);

  if (!b || b.status !== 'ready') return null;
  const earnings = b.earnings_ahead || [];
  const unusual = b.top_unusual || [];

  return (
    <section className={`brief brief-${TILT_TONE[b.tilt] || 'neutral'}`}>
      <div className="brief-top">
        <span className="brief-kicker">今日市场简报</span>
        <span className="brief-date">{b.date}</span>
      </div>
      <p className="brief-headline">{b.headline}</p>
      <div className="brief-callouts">
        {(b.spy_gamma_label || b.qqq_gamma_label) && (
          <div className="brief-co">
            <span className="brief-co-lbl">指数 Gamma</span>
            <span>SPY {b.spy_gamma_label || '—'} · QQQ {b.qqq_gamma_label || '—'}</span>
          </div>
        )}
        {earnings.length > 0 && (
          <div className="brief-co">
            <span className="brief-co-lbl">本周财报 {earnings.length}</span>
            <span className="brief-chips">
              {earnings.slice(0, 6).map(e => (
                <Link key={e.symbol} className="brief-chip" to={`/analyze?symbol=${encodeURIComponent(e.symbol)}`} title={e.date}>
                  {e.symbol}<small>{String(e.date).slice(5)}</small>
                </Link>
              ))}
              {earnings.length > 6 && <span className="brief-more">+{earnings.length - 6}</span>}
            </span>
          </div>
        )}
        {unusual.length > 0 && (
          <div className="brief-co">
            <span className="brief-co-lbl">期权异动 ΔOI</span>
            <span className="brief-chips">
              {unusual.slice(0, 6).map(u => (
                <Link key={u.symbol} className="brief-chip" to={`/analyze?symbol=${encodeURIComponent(u.symbol)}`}>
                  {u.symbol}<small>{compactOi(u.abs_oi)}</small>
                </Link>
              ))}
            </span>
          </div>
        )}
      </div>
      <p className="brief-foot">市场级综述，描述状态、非买卖建议。</p>
    </section>
  );
}
