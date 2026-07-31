import { Link } from 'react-router-dom';
import { getMarketBriefing } from '../lib/api';
import { buildMarketBriefingView } from '../lib/marketBriefing';
import { formatCompactNumber } from '../lib/formatters';
import useAsyncResource from '../hooks/useAsyncResource';

const TILT_TONE = { 偏多头: 'bull', 偏空头: 'bear', 多空均衡: 'neutral' };

// Daily market briefing (R1.2): a one-glance synthesis of the whole /market page.
// The headline is composed server-side (so it can be materialized/shared later);
// this renders it plus the "what matters today" callouts — earnings ahead and top
// option activity — that aren't in the detail panels below.
export default function MarketBriefing() {
  const { data: b } = useAsyncResource(getMarketBriefing);

  if (!b || b.status !== 'ready') return null;
  const view = buildMarketBriefingView(b);
  const earnings = view.earnings_ahead || [];
  const unusual = view.top_unusual || [];

  return (
    <section className={`brief brief-${TILT_TONE[view.tilt] || 'neutral'}`}>
      <div className="brief-top">
        <span className="brief-kicker">今日市场简报</span>
        <span className="brief-date">{view.date}</span>
      </div>
      <p className="brief-headline">{view.headline}</p>
      {view.summary.length > 0 && (
        <div className="brief-summary">
          {view.summary.map(item => (
            <p key={item.label}>
              <b>{item.label}</b>
              <span>{item.text}</span>
            </p>
          ))}
        </div>
      )}
      <div className="brief-callouts">
        {(view.spy_gamma_label || view.qqq_gamma_label) && (
          <div className="brief-co">
            <span className="brief-co-lbl">指数 Gamma</span>
            <span>SPY {view.spy_gamma_label || '—'} · QQQ {view.qqq_gamma_label || '—'}</span>
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
              {earnings.length > 6 && (
                <Link
                  className="brief-more"
                  to="/earnings"
                  title={`查看其余 ${earnings.length - 6} 只财报`}
                  aria-label={`查看其余 ${earnings.length - 6} 只财报`}
                >
                  +{earnings.length - 6}
                </Link>
              )}
            </span>
          </div>
        )}
        {unusual.length > 0 && (
          <div className="brief-co">
            <span className="brief-co-lbl">期权异动 ΔOI</span>
            <span className="brief-chips">
              {unusual.slice(0, 6).map(u => (
                <Link key={u.symbol} className="brief-chip" to={`/analyze?symbol=${encodeURIComponent(u.symbol)}`}>
                  {u.symbol}<small>{formatCompactNumber(u.abs_oi)}</small>
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
