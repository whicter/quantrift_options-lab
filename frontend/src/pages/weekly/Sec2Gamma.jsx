import { useState } from 'react';

function money(value) {
  if (value == null) return '--';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${value < 0 ? '-' : ''}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${value < 0 ? '-' : ''}$${(abs / 1e6).toFixed(1)}M`;
  return value.toLocaleString();
}

export default function Sec2Gamma({ data }) {
  const history = data.gamma.history;
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, history.length - 1));
  if (!history.length) return <div className="az-card"><div className="az-card-title">Gamma 历史不足</div><p>尚无真实 GEX 快照。</p></div>;
  const snap = history[Math.min(selectedIndex, history.length - 1)];
  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">Gamma 结构迁徙</div>
      <div className="wk-timeline">
        <div className="wk-timeline-track">
          {history.map((item, index) => (
            <button
              key={item.snapshot_ts}
              type="button"
              className={`wk-timeline-node ${index === selectedIndex ? 'active' : ''}`}
              style={{ left: history.length === 1 ? '50%' : `${(index / (history.length - 1)) * 100}%`, border: 0, background: 'transparent' }}
              onClick={() => setSelectedIndex(index)}
              title={item.date}
            >
              <span className="wk-timeline-dot" />
              <span className="wk-timeline-label">{item.day} · {item.date}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="az-card">
        <div className="az-card-title">{snap.date} · {snap.gamma_regime || 'unknown'} Gamma</div>
        <div className="wk-money-summary">
          <div className="wk-money-stat"><span>Global GEX</span><strong>{money(snap.global_gex)}</strong></div>
          <div className="wk-money-stat"><span>Call Wall</span><strong>{snap.call_wall == null ? '--' : `$${snap.call_wall}`}</strong></div>
          <div className="wk-money-stat"><span>Put Wall</span><strong>{snap.put_wall == null ? '--' : `$${snap.put_wall}`}</strong></div>
          <div className="wk-money-stat"><span>Gamma Flip</span><strong>{snap.gamma_flip == null ? '--' : `$${snap.gamma_flip}`}</strong></div>
        </div>
        <div className="wk-migration-table">
          <div className="wk-mig-header"><span>Strike</span><span>Net GEX</span><span>Call / Put OI</span></div>
          {snap.strikes.map(row => (
            <div className="wk-mig-row" key={row.strike}><span>${row.strike}</span><span>{money(row.net_gex)}</span><span>{row.call_oi ?? '--'} / {row.put_oi ?? '--'}</span></div>
          ))}
        </div>
      </div>
      <div className="wk-note">仅展示数据库中实际存在的每日最新 GEX 快照；没有历史快照的日期不会补值。</div>
    </div>
  );
}
