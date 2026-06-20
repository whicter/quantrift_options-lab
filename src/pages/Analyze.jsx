import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMockAnalysis } from '../data/mockAnalysis';

function IVGauge({ value }) {
  const color = value >= 50 ? 'var(--red)' : value >= 30 ? 'var(--yellow)' : 'var(--green)';
  const label = value >= 50 ? '高 IV — 卖方有优势' : value >= 30 ? '中等 IV' : '低 IV — 买方有优势';
  return (
    <div className="az-gauge">
      <div className="az-gauge-bar">
        <div className="az-gauge-fill" style={{ width: `${value}%`, background: color }} />
        <div className="az-gauge-marker" style={{ left: `${value}%` }} />
      </div>
      <div className="az-gauge-labels">
        <span>0</span>
        <span style={{ color, fontWeight: 600 }}>IVR {value}%</span>
        <span>100</span>
      </div>
      <div style={{ color, fontSize: 12, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function DirectionBadge({ score, label }) {
  const color = score > 0.3 ? 'var(--green)' : score < -0.3 ? 'var(--red)' : 'var(--yellow)';
  return (
    <span style={{ color, fontWeight: 700, fontSize: 14 }}>{label}</span>
  );
}

function TermStructureChart({ data }) {
  const max = Math.max(...data.map(d => d.iv));
  const min = Math.min(...data.map(d => d.iv));
  const range = max - min || 1;
  return (
    <div className="az-term">
      {data.map((d, i) => {
        const h = ((d.iv - min) / range) * 48 + 12;
        const label = d.expiry.slice(5); // MM-DD
        return (
          <div key={i} className="az-term-col">
            <div className="az-term-val">{d.iv.toFixed(1)}%</div>
            <div className="az-term-bar-wrap">
              <div className="az-term-bar" style={{ height: h }} />
            </div>
            <div className="az-term-label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function RecommendationCard({ rec, earnings }) {
  const hasUndefinedRisk = rec.params.maxLoss === null;
  return (
    <div className="az-rec-card">
      <div className="az-rec-header">
        <div>
          <div className="az-rec-strategy">{rec.strategy}</div>
          <div className="az-rec-reason">{rec.reason}</div>
        </div>
        <div className="az-rec-pop">
          <div className="az-rec-pop-val">{rec.params.pop}%</div>
          <div className="az-rec-pop-label">POP</div>
        </div>
      </div>
      <div className="az-rec-params">
        <div className="az-rec-param">
          <span className="az-rec-param-label">DTE</span>
          <span className="az-rec-param-val">{rec.params.dte}天</span>
        </div>
        <div className="az-rec-param">
          <span className="az-rec-param-label">Short Δ</span>
          <span className="az-rec-param-val">{rec.params.shortDelta}</span>
        </div>
        <div className="az-rec-param">
          <span className="az-rec-param-label">Max Credit</span>
          <span className="az-rec-param-val" style={{ color: 'var(--green)' }}>${rec.params.maxCredit}</span>
        </div>
        <div className="az-rec-param">
          <span className="az-rec-param-label">Max Loss</span>
          <span className="az-rec-param-val" style={{ color: 'var(--red)' }}>
            {hasUndefinedRisk ? '无限' : `$${rec.params.maxLoss}`}
          </span>
        </div>
      </div>
      {hasUndefinedRisk && (
        <div className="az-rec-warning">⚠️ 裸卖策略风险无限，建议加保护腿转为 defined-risk</div>
      )}
      {earnings.warning && (
        <div className="az-rec-warning">⚠️ 财报在 {earnings.daysAway} 天内，注意 IV Crush 风险</div>
      )}
      <div className="az-rec-legs">
        {rec.legs.map((leg, i) => (
          <div key={i} className="az-rec-leg">
            <span className={leg.dir === 1 ? 'az-leg-long' : 'az-leg-short'}>
              {leg.dir === 1 ? 'LONG' : 'SHORT'}
            </span>
            <span>{leg.label}</span>
            <span style={{ color: 'var(--text-dim)' }}>Δ {leg.deltaTarget}</span>
            <span style={{ color: 'var(--text-dim)' }}>{leg.dte}d</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Analyze() {
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 支持从扫描器跳转时带 ?symbol=AAPL
  useEffect(() => {
    const sym = searchParams.get('symbol');
    if (sym) {
      setInput(sym.toUpperCase());
      const data = getMockAnalysis(sym);
      if (data) setResult(data);
    }
  }, []);

  function handleAnalyze() {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setError('');
    setTimeout(() => {
      const data = getMockAnalysis(sym);
      if (data) {
        setResult(data);
      } else {
        setError(`暂无 ${sym} 的数据，试试 AAPL / SPY / QQQ`);
        setResult(null);
      }
      setLoading(false);
    }, 400);
  }

  return (
    <div className="az-page">
      <div className="az-header">
        <div className="az-title">策略分析</div>
        <div className="az-subtitle">输入标的，系统自动分析 IV 状态和方向信号，推荐最优策略</div>
      </div>

      <div className="az-search">
        <input
          className="az-input"
          placeholder="输入股票代码，如 AAPL"
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
        />
        <button className="az-btn" onClick={handleAnalyze} disabled={loading}>
          {loading ? '分析中...' : '分析'}
        </button>
      </div>

      {error && <div className="az-error">{error}</div>}

      {result && (
        <div className="az-result">
          {/* 顶部：标的信息 */}
          <div className="az-symbol-row">
            <div className="az-symbol">{result.symbol}</div>
            <div className="az-price">${result.price}</div>
            {result.earnings.date && (
              <div className={`az-earnings ${result.earnings.warning ? 'az-earnings-warn' : ''}`}>
                📅 财报 {result.earnings.date}
                {result.earnings.daysAway && ` (${result.earnings.daysAway}天后)`}
              </div>
            )}
          </div>

          <div className="az-grid">
            {/* IV 面板 */}
            <div className="az-card">
              <div className="az-card-title">IV 状态</div>
              <IVGauge value={result.ivRank} />
              <div className="az-iv-stats">
                <div className="az-iv-stat">
                  <span className="az-iv-label">IV30</span>
                  <span className="az-iv-val">{result.iv30}%</span>
                </div>
                <div className="az-iv-stat">
                  <span className="az-iv-label">HV30</span>
                  <span className="az-iv-val">{result.hv30}%</span>
                </div>
                <div className="az-iv-stat">
                  <span className="az-iv-label">IV-HV</span>
                  <span className="az-iv-val" style={{ color: result.ivHvDiff > 0 ? 'var(--red)' : 'var(--green)' }}>
                    +{result.ivHvDiff}%
                  </span>
                </div>
                <div className="az-iv-stat">
                  <span className="az-iv-label">IV Pct</span>
                  <span className="az-iv-val">{result.ivPercentile}%</span>
                </div>
              </div>
            </div>

            {/* 方向面板 */}
            <div className="az-card">
              <div className="az-card-title">方向信号</div>
              <div style={{ marginBottom: 12 }}>
                <DirectionBadge score={result.direction.score} label={result.direction.label} />
              </div>
              <div className="az-signals">
                {result.direction.signals.map((s, i) => (
                  <div key={i} className="az-signal">
                    <span className="az-signal-name">{s.name}</span>
                    <span className="az-signal-val">{s.value}</span>
                    <span className={s.bullish ? 'az-signal-bull' : 'az-signal-bear'}>
                      {s.bullish ? '▲' : '▼'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 期限结构 */}
            <div className="az-card">
              <div className="az-card-title">IV 期限结构</div>
              <TermStructureChart data={result.termStructure} />
            </div>
          </div>

          {/* 推荐策略 */}
          <div className="az-card" style={{ marginTop: 16 }}>
            <div className="az-card-title">推荐策略</div>
            <RecommendationCard rec={result.recommendation} earnings={result.earnings} />
          </div>
        </div>
      )}
    </div>
  );
}
