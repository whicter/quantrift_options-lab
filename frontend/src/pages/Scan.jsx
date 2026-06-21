import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { scanMock, DEFAULT_WATCHLIST } from '../data/mockAnalysis';

const STRATEGY_OPTIONS = [
  'Iron Condor',
  'Short Strangle',
  'Bull Put Spread',
  'Bear Call Spread',
  'Bull Call Spread',
  'Long Straddle',
];

const IVR_COLOR = (ivr) =>
  ivr >= 50 ? 'var(--red)' : ivr >= 30 ? 'var(--yellow)' : 'var(--green)';

const IVR_LABEL = (ivr) =>
  ivr >= 50 ? '高' : ivr >= 30 ? '中' : '低';

const DIR_COLOR = (score) =>
  score > 0.3 ? 'var(--green)' : score < -0.3 ? 'var(--red)' : 'var(--text-dim)';

function IVRBar({ value }) {
  return (
    <div className="scan-ivr-bar-wrap">
      <div className="scan-ivr-bar" style={{ width: `${value}%`, background: IVR_COLOR(value) }} />
      <span style={{ color: IVR_COLOR(value), fontWeight: 700, fontSize: 13 }}>{value}%</span>
      <span className="scan-ivr-tag" style={{ color: IVR_COLOR(value) }}>{IVR_LABEL(value)}</span>
    </div>
  );
}

export default function Scan() {
  const navigate = useNavigate();
  const [minIvr, setMinIvr] = useState(40);
  const [maxIvr, setMaxIvr] = useState(100);
  const [selectedStrategies, setSelectedStrategies] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  function toggleStrategy(s) {
    setSelectedStrategies(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  function handleScan() {
    setLoading(true);
    setTimeout(() => {
      const res = scanMock({ minIvr, maxIvr, strategies: selectedStrategies });
      setResults(res);
      setLoading(false);
    }, 500);
  }

  function handleRowClick(symbol) {
    navigate(`/analyze?symbol=${symbol}`);
  }

  return (
    <div className="scan-page">
      <div className="scan-header">
        <div className="scan-title">扫描器</div>
        <div className="scan-subtitle">系统自动筛选 Watchlist 中符合条件的标的，按 IV Rank 排序</div>
      </div>

      <div className="scan-body">
        {/* 过滤面板 */}
        <div className="scan-filters">
          <div className="scan-filter-section">
            <div className="scan-filter-label">IV Rank 范围</div>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">最低</span>
              <input
                type="number" min={0} max={100}
                className="scan-num-input"
                value={minIvr}
                onChange={e => setMinIvr(Number(e.target.value))}
              />
              <span className="scan-filter-sub">最高</span>
              <input
                type="number" min={0} max={100}
                className="scan-num-input"
                value={maxIvr}
                onChange={e => setMaxIvr(Number(e.target.value))}
              />
            </div>
            <div className="scan-ivr-presets">
              <button className="scan-preset" onClick={() => { setMinIvr(50); setMaxIvr(100); }}>高 IV (&gt;50)</button>
              <button className="scan-preset" onClick={() => { setMinIvr(30); setMaxIvr(50); }}>中 IV (30-50)</button>
              <button className="scan-preset" onClick={() => { setMinIvr(0); setMaxIvr(30); }}>低 IV (&lt;30)</button>
            </div>
          </div>

          <div className="scan-filter-section">
            <div className="scan-filter-label">策略类型（可多选）</div>
            <div className="scan-strategy-chips">
              {STRATEGY_OPTIONS.map(s => (
                <button
                  key={s}
                  className={`scan-chip ${selectedStrategies.includes(s) ? 'active' : ''}`}
                  onClick={() => toggleStrategy(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="scan-filter-section">
            <div className="scan-filter-label">Watchlist（{DEFAULT_WATCHLIST.length} 个标的）</div>
            <div className="scan-watchlist">
              {DEFAULT_WATCHLIST.map(sym => (
                <span key={sym} className="scan-wl-tag">{sym}</span>
              ))}
            </div>
          </div>

          <button className="scan-btn" onClick={handleScan} disabled={loading}>
            {loading ? '扫描中...' : '立即扫描'}
          </button>
        </div>

        {/* 结果列表 */}
        <div className="scan-results">
          {results === null ? (
            <div className="scan-empty">
              <div className="scan-empty-icon">⬆</div>
              <div>设置过滤条件后点击「立即扫描」</div>
            </div>
          ) : results.length === 0 ? (
            <div className="scan-empty">
              <div className="scan-empty-icon">∅</div>
              <div>没有符合条件的标的，请调整过滤条件</div>
            </div>
          ) : (
            <>
              <div className="scan-results-header">
                找到 <strong>{results.length}</strong> 个标的
              </div>
              <div className="scan-table">
                <div className="scan-table-head">
                  <span>标的</span>
                  <span>价格</span>
                  <span>IV Rank</span>
                  <span>IV30 / HV30</span>
                  <span>方向</span>
                  <span>推荐策略</span>
                  <span>POP</span>
                  <span>财报</span>
                </div>
                {results.map(d => (
                  <div
                    key={d.symbol}
                    className="scan-table-row"
                    onClick={() => handleRowClick(d.symbol)}
                    title="点击查看详细分析"
                  >
                    <span className="scan-symbol">{d.symbol}</span>
                    <span>${d.price}</span>
                    <span><IVRBar value={d.ivRank} /></span>
                    <span>
                      <span style={{ color: 'var(--red)' }}>{d.iv30}%</span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
                      <span style={{ color: 'var(--text-dim)' }}>{d.hv30}%</span>
                    </span>
                    <span style={{ color: DIR_COLOR(d.direction.score) }}>{d.direction.label}</span>
                    <span className="scan-strategy">{d.recommendation.strategy}</span>
                    <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                      {d.recommendation.params.pop}%
                    </span>
                    <span style={{ color: d.earnings.warning ? 'var(--yellow)' : 'var(--text-muted)', fontSize: 11 }}>
                      {d.earnings.date ? d.earnings.date.slice(5) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
