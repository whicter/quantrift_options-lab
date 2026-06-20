import { useMemo } from 'react';
import useStrategyStore from '../store/useStrategyStore';
import { bsPrice, bsGreeks, calcNetPremium, findBreakevens, probOfProfit } from '../lib/blackscholes';

function fmt(v, prefix = '$') {
  if (!isFinite(v)) return '∞';
  if (Math.abs(v) >= 1000) return `${prefix}${(v / 1000).toFixed(1)}k`;
  return `${prefix}${v.toFixed(2)}`;
}
function fmtG(v, dec = 3) {
  if (!isFinite(v)) return '—';
  return v.toFixed(dec);
}

export default function RightPanel() {
  const {
    strategy, legs, spot, ivShift, rate, div, range, contracts,
    setSpot, setIvShift, setRate, setDiv, setRange, setContracts,
    updateLeg, addLeg, removeLeg, resetLegs,
  } = useStrategyStore();

  const metrics = useMemo(() => {
    if (!legs.length) return null;
    const r = rate / 100;
    const q = div / 100;
    const ivS = ivShift / 100;

    const netPremium = calcNetPremium(legs, spot, r, q);
    const beps = findBreakevens(legs, netPremium);

    // Current Greeks at spot
    let delta = 0, gamma = 0, theta = 0, vega = 0, rho = 0;
    for (const leg of legs) {
      const T = Math.max(0.001, leg.dte / 365);
      const v = Math.max(0.001, leg.iv + ivS);
      const g = bsGreeks(spot, leg.K, T, r, q, v, leg.type);
      const sign = leg.dir * leg.qty;
      delta += sign * g.delta;
      gamma += sign * g.gamma;
      theta += sign * g.theta;
      vega  += sign * g.vega;
      rho   += sign * g.rho;
    }

    // Max profit / loss — scan wide range; check for unlimited
    const N = 600;
    const lo = spot * 0.01, hi = spot * 4.0;
    let maxP = -Infinity, maxL = Infinity;
    let prevPL = null;
    let increasing = false, decreasing = false;
    for (let i = 0; i <= N; i++) {
      const S = lo + (hi - lo) * (i / N);
      let val = 0;
      for (const leg of legs) {
        const intrinsic = leg.type === 'call' ? Math.max(0, S - leg.K) : Math.max(0, leg.K - S);
        val += leg.dir * leg.qty * intrinsic;
      }
      const pl = val - netPremium;
      if (prevPL !== null) {
        if (pl > prevPL + 0.01) increasing = true;
        if (pl < prevPL - 0.01) decreasing = true;
      }
      if (pl > maxP) maxP = pl;
      if (pl < maxL) maxL = pl;
      prevPL = pl;
    }
    // Check if still increasing at the boundary → unlimited profit
    if (increasing && prevPL > maxP * 0.95) maxP = Infinity;
    // Check if still decreasing at low boundary → unlimited loss
    const firstPL = (() => {
      let v = 0;
      for (const leg of legs) {
        const intrinsic = leg.type === 'call' ? 0 : Math.max(0, leg.K - lo);
        v += leg.dir * leg.qty * intrinsic;
      }
      return v - netPremium;
    })();
    if (decreasing && firstPL < maxL * 0.95) maxL = -Infinity;

    const pop = probOfProfit(spot, legs, netPremium, r, q, Math.max(...legs.map((l) => l.dte)));

    // Current P/L (hypothetical: value if entered and measured now)
    let currentVal = 0;
    for (const leg of legs) {
      const T = Math.max(0.001, leg.dte / 365);
      const v = Math.max(0.001, leg.iv + ivS);
      currentVal += leg.dir * leg.qty * bsPrice(spot, leg.K, T, r, q, v, leg.type);
    }

    return {
      netPremium: netPremium * contracts,
      currentPL: (currentVal - netPremium) * contracts,
      maxP: maxP === Infinity ? Infinity : maxP * contracts,
      maxL: maxL === -Infinity ? -Infinity : maxL * contracts,
      beps,
      delta: delta * contracts,
      gamma: gamma * contracts,
      theta: theta * contracts,
      vega:  vega  * contracts,
      rho:   rho   * contracts,
      pop,
    };
  }, [legs, spot, ivShift, rate, div, contracts]);

  const maxDte = Math.max(...legs.map((l) => l.dte), 1);

  return (
    <aside className="right-panel">
      {/* Scenario Parameters */}
      <div className="panel-section">
        <div className="panel-title">Scenario</div>
        <div className="panel-subtitle">情景参数</div>
        <div className="param-grid">
          <div className="param-field">
            <div className="param-label">当前正股价</div>
            <input type="number" value={spot} step={0.5} onChange={(e) => setSpot(e.target.value)} />
          </div>
          <div className="param-field">
            <div className="param-label">IV Shift (%)</div>
            <input type="number" value={ivShift} step={1} onChange={(e) => setIvShift(e.target.value)} />
          </div>
          <div className="param-field">
            <div className="param-label">利率 (%)</div>
            <input type="number" value={rate} step={0.1} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="param-field">
            <div className="param-label">股息率 (%)</div>
            <input type="number" value={div} step={0.1} onChange={(e) => setDiv(e.target.value)} />
          </div>
          <div className="param-field">
            <div className="param-label">价格区间 ±(%)</div>
            <input type="number" value={range} step={5} min={10} max={100} onChange={(e) => setRange(e.target.value)} />
          </div>
          <div className="param-field">
            <div className="param-label">合约乘数</div>
            <input type="number" value={contracts} step={1} min={1} onChange={(e) => setContracts(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Risk Metrics */}
      {metrics && (
        <div className="panel-section">
          <div className="panel-title">Risk</div>
          <div className="panel-subtitle">风险指标</div>
          <div className="metrics-grid">
            <div className="metric-item">
              <div className="metric-label">当前 P/L</div>
              <div className={`metric-value ${metrics.currentPL > 0 ? 'pos' : metrics.currentPL < 0 ? 'neg' : 'neu'}`}>
                {fmt(metrics.currentPL)}
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">净成本/信用</div>
              <div className={`metric-value ${metrics.netPremium < 0 ? 'pos' : 'neg'}`}>
                {fmt(metrics.netPremium)}
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">Max Profit</div>
              <div className="metric-value pos">
                {metrics.maxP === Infinity || metrics.maxP > 99999 ? 'Unlimited' : fmt(metrics.maxP)}
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">Max Loss</div>
              <div className="metric-value neg">
                {metrics.maxL === -Infinity || metrics.maxL < -99999 ? 'Unlimited' : fmt(metrics.maxL)}
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">Breakeven</div>
              <div className="metric-value neu" style={{ fontSize: 13 }}>
                {metrics.beps.length ? metrics.beps.map((b) => b.toFixed(2)).join(' / ') : '—'}
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">POP</div>
              <div className={`metric-value ${metrics.pop > 0.5 ? 'pos' : 'neg'}`}>
                {(metrics.pop * 100).toFixed(0)}%
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">Delta</div>
              <div className={`metric-value ${metrics.delta > 0 ? 'pos' : metrics.delta < 0 ? 'neg' : 'neu'}`}>
                {fmtG(metrics.delta, 2)}
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">Theta / day</div>
              <div className={`metric-value ${metrics.theta > 0 ? 'pos' : 'neg'}`}>
                {fmtG(metrics.theta, 2)}
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">Vega / 1%</div>
              <div className={`metric-value ${metrics.vega > 0 ? 'pos' : 'neg'}`}>
                {fmtG(metrics.vega, 2)}
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">Gamma</div>
              <div className={`metric-value ${metrics.gamma > 0 ? 'pos' : metrics.gamma < 0 ? 'neg' : 'neu'}`}>
                {fmtG(metrics.gamma, 4)}
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">Rho / 1%</div>
              <div className={`metric-value ${metrics.rho > 0 ? 'pos' : metrics.rho < 0 ? 'neg' : 'neu'}`}>
                {fmtG(metrics.rho, 2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leg Editor */}
      <div className="panel-section">
        <div className="panel-title">Legs</div>
        <div className="panel-subtitle">腿组合</div>
        <div className="leg-list">
          {legs.map((leg, i) => (
            <div key={i} className="leg-card">
              <div className="leg-card-header">
                <span className="leg-card-title">
                  {leg.dir === 1 ? 'Long' : 'Short'} {leg.qty} {leg.type.toUpperCase()} @ {leg.K}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`type-badge type-${leg.type}`}>{leg.type.toUpperCase()}</span>
                  {legs.length > 1 && (
                    <button className="btn-remove" onClick={() => removeLeg(i)}>×</button>
                  )}
                </div>
              </div>
              <div className="leg-grid">
                <div className="leg-field">
                  <label>方向</label>
                  <div className="dir-toggle">
                    <button
                      className={leg.dir === 1 ? 'al' : ''}
                      onClick={() => updateLeg(i, 'dir', 1)}
                    >Long</button>
                    <button
                      className={leg.dir === -1 ? 'as' : ''}
                      onClick={() => updateLeg(i, 'dir', -1)}
                    >Short</button>
                  </div>
                </div>
                <div className="leg-field">
                  <label>类型</label>
                  <select
                    value={leg.type}
                    onChange={(e) => updateLeg(i, 'type', e.target.value)}
                  >
                    <option value="call">Call</option>
                    <option value="put">Put</option>
                  </select>
                </div>
                <div className="leg-field">
                  <label>数量</label>
                  <input
                    type="number"
                    value={leg.qty}
                    min={1}
                    step={1}
                    onChange={(e) => updateLeg(i, 'qty', Number(e.target.value))}
                  />
                </div>
                <div className="leg-field">
                  <label>行权价</label>
                  <input
                    type="number"
                    value={leg.K}
                    step={0.5}
                    onChange={(e) => updateLeg(i, 'K', Number(e.target.value))}
                  />
                </div>
                <div className="leg-field">
                  <label>DTE (天)</label>
                  <input
                    type="number"
                    value={leg.dte}
                    step={1}
                    min={1}
                    onChange={(e) => updateLeg(i, 'dte', Number(e.target.value))}
                  />
                </div>
                <div className="leg-field">
                  <label>IV (%)</label>
                  <input
                    type="number"
                    value={(leg.iv * 100).toFixed(0)}
                    step={1}
                    min={1}
                    max={300}
                    onChange={(e) => updateLeg(i, 'iv', Number(e.target.value) / 100)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="leg-actions">
          <button className="btn-add" onClick={addLeg}>+ 添加腿</button>
          <button className="btn-reset" onClick={resetLegs}>重置</button>
        </div>
      </div>
    </aside>
  );
}
