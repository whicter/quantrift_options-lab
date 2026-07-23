import { buildStrategyComparison } from '../lib/strategyComparison';

const DIRECTION_LABELS = { bullish: 'BULLISH', bearish: 'BEARISH', neutral: 'NEUTRAL', volatile: 'VOLATILE', guide: 'GUIDE' };
const RISK_LABELS = { novice: 'NOVICE', intermediate: 'INTERMEDIATE', advanced: 'ADVANCED' };

export default function StrategyComparison({ strategies, selectedIds, onSelect }) {
  const summaries = selectedIds.map((id) => buildStrategyComparison(strategies.find((strategy) => strategy.id === id)));

  return (
    <section className="comparison-section" aria-label="策略对比">
      <div className="comparison-controls">
        {[0, 1].map((slot) => (
          <label key={slot}>
            <span>策略 {slot + 1}</span>
            <select value={selectedIds[slot]} onChange={(event) => onSelect(slot, event.target.value)}>
              {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name} · {strategy.zh}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="comparison-grid">
        {summaries.map((summary) => (
          <article className="comparison-strategy" key={summary.id}>
            <div className="comparison-heading">
              <div>
                <h2>{summary.name}</h2>
                <p>{summary.zh}</p>
              </div>
              <div className="comparison-badges">
                <span>{DIRECTION_LABELS[summary.direction] || summary.direction}</span>
                <span>{RISK_LABELS[summary.risk] || summary.risk}</span>
              </div>
            </div>
            <dl className="comparison-facts">
              <div><dt>DTE</dt><dd>{summary.dte}</dd></div>
              <div><dt>IV</dt><dd>{summary.iv}</dd></div>
              <div><dt>TP</dt><dd>{summary.takeProfit}</dd></div>
              <div><dt>SL</dt><dd>{summary.stopLoss}</dd></div>
            </dl>
            <div className="comparison-legs">
              {summary.legs.map((leg, index) => (
                <div key={`${leg.action}-${leg.type}-${leg.strike}-${index}`}>
                  <strong className={leg.action === 'LONG' ? 'comparison-long' : 'comparison-short'}>{leg.action}</strong>
                  <span>{leg.type} {leg.strike} · {leg.quantity}x · {leg.dte}d</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
