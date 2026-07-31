import { useState } from 'react';
import { compactMoney } from '../../lib/scannerPresentation';

export default function Sec2Gamma({ data }) {
  const history = data.gamma.history;
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, history.length - 1));
  if (!history.length) return <div className="az-card"><div className="az-card-title">Gamma 历史不足</div><p>尚无可用 GEX 数据。</p></div>;
  const snap = history[Math.min(selectedIndex, history.length - 1)];
  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">{history.length > 1 ? 'Gamma 结构变化' : '最新 Gamma 结构'}</div>
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
          <div className="wk-money-stat"><span>总 GEX</span><strong>{compactMoney(snap.global_gex)}</strong></div>
          <div className="wk-money-stat"><span>Call Wall</span><strong>{snap.call_wall == null ? '--' : `$${snap.call_wall}`}</strong></div>
          <div className="wk-money-stat"><span>Put Wall</span><strong>{snap.put_wall == null ? '--' : `$${snap.put_wall}`}</strong></div>
          <div className="wk-money-stat"><span>Gamma Flip</span><strong>{snap.gamma_flip == null ? '--' : `$${snap.gamma_flip}`}</strong></div>
        </div>
        <div className="wk-migration-table">
          <div className="wk-mig-header"><span>Strike</span><span>Net GEX</span><span>Call / Put OI</span></div>
          {snap.strikes.map(row => (
            <div className="wk-mig-row" key={row.strike}><span>${row.strike}</span><span>{compactMoney(row.net_gex)}</span><span>{row.call_oi ?? '--'} / {row.put_oi ?? '--'}</span></div>
          ))}
        </div>
      </div>
      <div className="wk-note">GEX、Wall 与 Flip 仅用于观察波动环境和关键价位，不构成价格预测。</div>
    </div>
  );
}
