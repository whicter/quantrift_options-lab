import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDataStatus, getScan } from '../lib/api';

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

function pct(value) {
  if (value == null) return null;
  return Number(value) * 100;
}

function num(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactMoney(value) {
  const n = num(value);
  if (n == null) return '--';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${n < 0 ? '-' : ''}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${n < 0 ? '-' : ''}$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${n < 0 ? '-' : ''}$${(abs / 1e3).toFixed(0)}K`;
  return `${n < 0 ? '-' : ''}$${abs.toFixed(0)}`;
}

function wallDistance(row) {
  const call = num(row.call_wall_distance_pct);
  const put = num(row.put_wall_distance_pct);
  if (call == null && put == null) return null;
  if (call != null && (put == null || call <= put)) return { side: 'Call', pct: call };
  return { side: 'Put', pct: put };
}

function daysUntil(dateText) {
  if (!dateText) return null;
  const date = new Date(`${String(dateText).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.ceil((date.getTime() - todayUtc) / 86400000);
}

function recommendFromIv(row) {
  const ivRank = Number(row.iv_rank ?? 0);
  const ivHvDiff = pct(row.iv_hv_diff) ?? 0;
  const regime = row.gamma_regime;
  const trendScore = num(row.trend_score) ?? 0;

  if (ivRank >= 50) {
    if (trendScore >= 3) {
      return {
        strategy: 'Bull Put Spread',
        reason: `IV Rank ${Math.round(ivRank)}%，趋势偏多；优先考虑定义风险的卖 Put 结构。`,
        params: { pop: 64 },
      };
    }
    if (trendScore <= -3) {
      return {
        strategy: 'Bear Call Spread',
        reason: `IV Rank ${Math.round(ivRank)}%，趋势偏空；优先考虑定义风险的卖 Call 结构。`,
        params: { pop: 64 },
      };
    }
    return {
      strategy: 'Iron Condor',
      reason: `IV Rank ${Math.round(ivRank)}%，IV-HV ${ivHvDiff.toFixed(1)}pt；${regime ? `Gamma ${regime}` : 'GEX 未覆盖'}。`,
      params: { pop: 66 },
    };
  }

  if (ivRank >= 30) {
    return {
      strategy: 'Iron Condor',
      reason: `IV Rank ${Math.round(ivRank)}%，波动率中等；方向未确认前偏向小仓位定义风险结构。`,
      params: { pop: 62 },
    };
  }

  return {
    strategy: 'Long Straddle',
    reason: `IV Rank ${Math.round(ivRank)}%，低 IV 环境；若有催化或预期波动扩张，可考虑买方波动结构。`,
    params: { pop: 42 },
  };
}

function toScanRow(row) {
  const recommendation = recommendFromIv(row);
  const nearestWall = wallDistance(row);
  const earningsDays = daysUntil(row.earnings_date);
  const trendScore = num(row.trend_score);
  const trendLabel = row.trend_label || (trendScore == null ? '趋势数据不足' : '等待确认');
  return {
    symbol: row.symbol,
    price: row.price_close == null ? null : Number(row.price_close).toFixed(2),
    ivRank: Math.round(Number(row.iv_rank ?? 0)),
    iv30: pct(row.iv30)?.toFixed(1) ?? '--',
    hv30: pct(row.hv30)?.toFixed(1) ?? '--',
    direction: {
      score: trendScore ?? 0,
      label: trendLabel,
      signal: row.trend_signal || 'missing',
      change5d: num(row.trend_change_5d),
      rsi14: num(row.trend_rsi14),
    },
    recommendation,
    earnings: {
      date: row.earnings_date ? String(row.earnings_date).slice(0, 10) : null,
      daysAway: earningsDays,
      warning: earningsDays != null && earningsDays >= 0 && earningsDays <= 14,
    },
    gex: {
      status: row.gex_status || 'missing',
      regime: row.gamma_regime || 'missing',
      total: num(row.global_gex),
      localGamma: num(row.local_gamma),
      nearestWall,
      callWall: num(row.call_wall),
      putWall: num(row.put_wall),
      pcrOi: num(row.pcr_oi),
      pcrVolume: num(row.pcr_volume),
      totalOi: num(row.total_oi),
      totalVolume: num(row.total_volume),
      volumeOiRatio: num(row.volume_oi_ratio),
      score: Math.round(num(row.signal_score) ?? 0),
    },
    unusual: {
      count: num(row.unusual_oi_count) ?? 0,
      maxDelta: num(row.max_oi_delta),
      maxVolumeOiRatio: num(row.max_volume_oi_ratio),
      status: row.unusual_status || 'missing',
    },
    dataMeta: {
      source: row.source,
      date: row.date ? String(row.date).slice(0, 10) : null,
      priceSource: row.price_source,
      priceDate: row.price_date ? String(row.price_date).slice(0, 10) : null,
      priceStatus: row.price_status || 'missing',
    },
  };
}

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
  const [gammaRegime, setGammaRegime] = useState('all');
  const [wall, setWall] = useState('all');
  const [nearWallPct, setNearWallPct] = useState('');
  const [minLocalGamma, setMinLocalGamma] = useState('');
  const [minTotalOi, setMinTotalOi] = useState('');
  const [minTotalVolume, setMinTotalVolume] = useState('');
  const [minVolumeOiRatio, setMinVolumeOiRatio] = useState('');
  const [minUnusualOi, setMinUnusualOi] = useState('');
  const [minOiDelta, setMinOiDelta] = useState('');
  const [pcrMin, setPcrMin] = useState('');
  const [pcrMax, setPcrMax] = useState('');
  const [unusualOnly, setUnusualOnly] = useState(false);
  const [sort, setSort] = useState('ivr');
  const [selectedStrategies, setSelectedStrategies] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dataStatus, setDataStatus] = useState(null);

  useEffect(() => {
    getDataStatus().then(setDataStatus).catch(() => {});
  }, []);

  function toggleStrategy(s) {
    setSelectedStrategies(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  async function handleScan() {
    setLoading(true);
    setError('');

    try {
      const rows = await getScan({
        minIvr,
        maxIvr,
        gammaRegime,
        wall,
        nearWallPct,
        minLocalGamma,
        minTotalOi,
        minTotalVolume,
        minVolumeOiRatio,
        minUnusualOi,
        minOiDelta,
        pcrMin,
        pcrMax,
        unusualOnly,
        sort,
        limit: 100,
      });
      const liveRows = rows
        .map(toScanRow)
        .filter(d => selectedStrategies.length === 0 || selectedStrategies.includes(d.recommendation.strategy));
      setResults(liveRows);
    } catch {
      setResults([]);
      setError('真实 scanner API 暂时不可用。');
    } finally {
      setLoading(false);
    }
  }

  function handleRowClick(symbol) {
    navigate(`/analyze?symbol=${symbol}&tab=0`);
  }

  function priceStatus(symbol) {
    const row = results?.find(item => item.symbol === symbol);
    if (row?.dataMeta?.priceStatus) return row.dataMeta.priceStatus;
    const statusRow = dataStatus?.symbols?.find(item => item.symbol === symbol);
    return statusRow?.price?.status || 'missing';
  }

  const watchlist = dataStatus?.expected_symbols || [];

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
            <div className="scan-filter-label">GEX / Wall 过滤</div>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">Gamma</span>
              <select className="scan-select" value={gammaRegime} onChange={e => setGammaRegime(e.target.value)}>
                <option value="all">全部</option>
                <option value="positive">正Gamma</option>
                <option value="negative">负Gamma</option>
                <option value="neutral">近零</option>
              </select>
            </div>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">Wall</span>
              <select className="scan-select" value={wall} onChange={e => setWall(e.target.value)}>
                <option value="all">不限</option>
                <option value="either">靠近任一</option>
                <option value="call">靠近Call</option>
                <option value="put">靠近Put</option>
              </select>
              <input
                type="number" min={0} step={0.5}
                className="scan-num-input"
                placeholder="%"
                value={nearWallPct}
                onChange={e => setNearWallPct(e.target.value)}
              />
            </div>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">Local Γ</span>
              <input
                type="number" min={0}
                className="scan-wide-input"
                placeholder="最低"
                value={minLocalGamma}
                onChange={e => setMinLocalGamma(e.target.value)}
              />
            </div>
          </div>

          <div className="scan-filter-section">
            <div className="scan-filter-label">OI / Volume</div>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">OI</span>
              <input
                type="number" min={0}
                className="scan-wide-input"
                placeholder="最低"
                value={minTotalOi}
                onChange={e => setMinTotalOi(e.target.value)}
              />
            </div>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">Vol</span>
              <input
                type="number" min={0}
                className="scan-wide-input"
                placeholder="最低"
                value={minTotalVolume}
                onChange={e => setMinTotalVolume(e.target.value)}
              />
            </div>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">Vol/OI</span>
              <input
                type="number" min={0} step={0.01}
                className="scan-wide-input"
                placeholder="最低"
                value={minVolumeOiRatio}
                onChange={e => setMinVolumeOiRatio(e.target.value)}
              />
            </div>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">排序</span>
              <select className="scan-select" value={sort} onChange={e => setSort(e.target.value)}>
                <option value="ivr">IV Rank</option>
                <option value="combined">IV + GEX</option>
              </select>
            </div>
          </div>

          <div className="scan-filter-section">
            <div className="scan-filter-label">Unusual / PCR</div>
            <label className="scan-check-row">
              <input
                type="checkbox"
                checked={unusualOnly}
                onChange={e => setUnusualOnly(e.target.checked)}
              />
              <span>仅 OI 异动</span>
            </label>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">Count</span>
              <input
                type="number" min={0}
                className="scan-wide-input"
                placeholder="最低"
                value={minUnusualOi}
                onChange={e => setMinUnusualOi(e.target.value)}
              />
            </div>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">ΔOI</span>
              <input
                type="number" min={0}
                className="scan-wide-input"
                placeholder="最低"
                value={minOiDelta}
                onChange={e => setMinOiDelta(e.target.value)}
              />
            </div>
            <div className="scan-filter-row">
              <span className="scan-filter-sub">PCR</span>
              <input
                type="number" min={0} step={0.1}
                className="scan-num-input"
                placeholder="min"
                value={pcrMin}
                onChange={e => setPcrMin(e.target.value)}
              />
              <input
                type="number" min={0} step={0.1}
                className="scan-num-input"
                placeholder="max"
                value={pcrMax}
                onChange={e => setPcrMax(e.target.value)}
              />
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
            <div className="scan-filter-label">Watchlist（{watchlist.length || '...'} 个标的）</div>
            <div className="scan-watchlist">
              {watchlist.slice(0, 24).map(sym => (
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
          {error && <div className="az-error">{error}</div>}
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
                  <span>GEX</span>
                  <span>Wall</span>
                  <span>OI Δ</span>
                  <span>推荐策略</span>
                  <span>POP</span>
                  <span>价格</span>
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
                    <span>{d.price == null ? '--' : `$${d.price}`}</span>
                    <span><IVRBar value={d.ivRank} /></span>
                    <span>
                      <span style={{ color: 'var(--red)' }}>{d.iv30}%</span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>
                      <span style={{ color: 'var(--text-dim)' }}>{d.hv30}%</span>
                    </span>
                    <span style={{ color: DIR_COLOR(d.direction.score) }} title={d.direction.change5d == null ? '' : `5日 ${d.direction.change5d.toFixed(1)}%`}>
                      {d.direction.label}
                    </span>
                    <span>
                      <span className={`scan-gex-pill ${d.gex.regime}`}>
                        {d.gex.status === 'fresh' ? d.gex.regime : d.gex.status}
                      </span>
                      <span className="scan-gex-value">{compactMoney(d.gex.total)}</span>
                    </span>
                    <span className="scan-wall-cell">
                      {d.gex.nearestWall
                        ? `${d.gex.nearestWall.side} ${d.gex.nearestWall.pct.toFixed(1)}%`
                        : '--'}
                    </span>
                    <span className="scan-wall-cell">
                      {d.unusual.status === 'confirmed'
                        ? `${d.unusual.count} / ${d.unusual.maxDelta ?? '--'}`
                        : d.unusual.status}
                    </span>
                    <span className="scan-strategy">{d.recommendation.strategy}</span>
                    <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                      {d.recommendation.params.pop}%
                    </span>
                    <span className={`scan-price-status ${priceStatus(d.symbol)}`}>
                      {priceStatus(d.symbol) === 'covered' ? 'price' : priceStatus(d.symbol)}
                    </span>
                    <span style={{ color: d.earnings.warning ? 'var(--yellow)' : 'var(--text-muted)', fontSize: 11 }}>
                      {d.earnings.date
                        ? `${d.earnings.date.slice(5)}${d.earnings.warning ? ` (${d.earnings.daysAway}天)` : ''}`
                        : '—'}
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
