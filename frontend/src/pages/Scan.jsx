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

const STRATEGY_PARAMETER_PRESETS = {
  none: {
    label: '不限',
    desc: '不按合约参数过滤',
    values: {
      dteMin: '',
      dteMax: '',
      deltaMin: '',
      deltaMax: '',
      maxSpreadPct: '',
      minContractOi: '',
      minContractVolume: '',
    },
  },
  conservative: {
    label: '保守',
    desc: '更远 Delta，更严流动性',
    values: {
      dteMin: '30',
      dteMax: '60',
      deltaMin: '0.10',
      deltaMax: '0.20',
      maxSpreadPct: '10',
      minContractOi: '500',
      minContractVolume: '50',
    },
  },
  standard: {
    label: '标准',
    desc: '平衡胜率、收益和成交',
    values: {
      dteMin: '30',
      dteMax: '60',
      deltaMin: '0.16',
      deltaMax: '0.30',
      maxSpreadPct: '15',
      minContractOi: '100',
      minContractVolume: '10',
    },
  },
  aggressive: {
    label: '进取',
    desc: '更靠近现价，收益更高',
    values: {
      dteMin: '7',
      dteMax: '45',
      deltaMin: '0.25',
      deltaMax: '0.40',
      maxSpreadPct: '20',
      minContractOi: '50',
      minContractVolume: '5',
    },
  },
  shortTerm: {
    label: '短线',
    desc: '偏周权和短 DTE',
    values: {
      dteMin: '1',
      dteMax: '14',
      deltaMin: '0.20',
      deltaMax: '0.40',
      maxSpreadPct: '20',
      minContractOi: '100',
      minContractVolume: '20',
    },
  },
  liquidity: {
    label: '流动性优先',
    desc: '只看更容易成交的链',
    values: {
      dteMin: '7',
      dteMax: '60',
      deltaMin: '0.05',
      deltaMax: '0.50',
      maxSpreadPct: '8',
      minContractOi: '1000',
      minContractVolume: '100',
    },
  },
};

const IVR_COLOR = (ivr) =>
  ivr >= 50 ? 'var(--red)' : ivr >= 30 ? 'var(--yellow)' : 'var(--green)';

const IVR_LABEL = (ivr) =>
  ivr >= 50 ? '高' : ivr >= 30 ? '中' : '低';

const DIR_COLOR = (score) =>
  score > 0.3 ? 'var(--green)' : score < -0.3 ? 'var(--red)' : 'var(--text-dim)';

const SORTABLE_COLUMNS = [
  { key: 'symbol', label: '标的', title: '股票或 ETF 代码' },
  { key: 'price', label: '现价', title: '标的最新收盘价 / 最新缓存价格' },
  { key: 'ivRank', label: 'IV Rank', title: '当前 IV 在过去一年隐含波动率区间中的位置。越高代表期权相对越贵。' },
  { key: 'iv30', label: 'IV30 / HV30', title: 'IV30 是 30 天隐含波动率，HV30 是 30 天历史波动率。' },
  { key: 'direction', label: '方向', title: '由 price history 派生的趋势标签。' },
  { key: 'gex', label: 'GEX', title: 'Gamma Exposure。missing/未采集表示当前没有该标的 GEX 快照。' },
  { key: 'wall', label: 'Wall', title: '离最近 Call Wall / Put Wall 的距离。没有 GEX 快照时为空。' },
  { key: 'doi', label: 'ΔOI', title: 'Open Interest 变化。missing/未采集表示没有连续 OI 快照。' },
  { key: 'contract', label: '合约', title: '当前 option snapshot 的 DTE、Delta 和 bid/ask spread 摘要。' },
  { key: 'strategy', label: '推荐策略', title: '基于 IV Rank、趋势和已有期权结构的策略建议；点行进入分析页。' },
  { key: 'pop', label: 'POP', title: 'Probability of Profit 的规则估计值，目前用于策略排序参考。' },
  { key: 'data', label: '数据', title: '价格数据覆盖状态。' },
  { key: 'earnings', label: '财报', title: '下一次财报日期；括号内是距离今天的天数。' },
];

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

function formatDeltaRange(minValue, maxValue) {
  if (minValue == null && maxValue == null) return '--';
  if (minValue != null && maxValue != null) return `${minValue.toFixed(2)}-${maxValue.toFixed(2)}`;
  return (minValue ?? maxValue).toFixed(2);
}

function strategyAction(strategy) {
  if (strategy === 'Bear Call Spread') return '卖出较低行权价 Call，买入更高行权价 Call，收取 credit。';
  if (strategy === 'Bull Put Spread') return '卖出较高行权价 Put，买入更低行权价 Put，收取 credit。';
  if (strategy === 'Iron Condor') return '同时做 Bear Call Spread + Bull Put Spread，押注区间震荡。';
  if (strategy === 'Long Straddle') return '买入同一到期 ATM Call + Put，押注大幅波动。';
  if (strategy === 'Short Strangle') return '卖出 OTM Call + OTM Put，押注区间内震荡。';
  if (strategy === 'Bull Call Spread') return '买入较低行权价 Call，卖出更高行权价 Call，做多且限制成本。';
  return '点击进入分析页查看结构。';
}

function missingLabel(value) {
  return value === 'missing' ? '未采集' : value;
}

function sortValue(row, key) {
  if (key === 'symbol') return row.symbol;
  if (key === 'price') return Number(row.price ?? -Infinity);
  if (key === 'ivRank') return row.ivRank;
  if (key === 'iv30') return num(row.iv30) ?? -Infinity;
  if (key === 'direction') return row.direction.score;
  if (key === 'gex') return row.gex.score;
  if (key === 'wall') return row.gex.nearestWall?.pct ?? Infinity;
  if (key === 'doi') return Math.abs(row.unusual.maxDelta ?? -Infinity);
  if (key === 'contract') return row.contractQuality.contractCount;
  if (key === 'strategy') return row.recommendation.strategy;
  if (key === 'pop') return row.recommendation.params.pop;
  if (key === 'data') return row.dataMeta.priceStatus;
  if (key === 'earnings') return row.earnings.daysAway ?? Infinity;
  return 0;
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
    contractQuality: {
      contractCount: num(row.contract_count) ?? 0,
      greeksCount: num(row.greeks_contract_count) ?? 0,
      quotedCount: num(row.quoted_contract_count) ?? 0,
      minDte: num(row.min_dte),
      maxDte: num(row.max_dte),
      minAbsDelta: num(row.min_abs_delta),
      maxAbsDelta: num(row.max_abs_delta),
      avgSpreadPct: num(row.avg_spread_pct),
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
  const [strategyProfile, setStrategyProfile] = useState('none');
  const [dteMin, setDteMin] = useState(STRATEGY_PARAMETER_PRESETS.none.values.dteMin);
  const [dteMax, setDteMax] = useState(STRATEGY_PARAMETER_PRESETS.none.values.dteMax);
  const [deltaMin, setDeltaMin] = useState(STRATEGY_PARAMETER_PRESETS.none.values.deltaMin);
  const [deltaMax, setDeltaMax] = useState(STRATEGY_PARAMETER_PRESETS.none.values.deltaMax);
  const [maxSpreadPct, setMaxSpreadPct] = useState(STRATEGY_PARAMETER_PRESETS.none.values.maxSpreadPct);
  const [minContractOi, setMinContractOi] = useState(STRATEGY_PARAMETER_PRESETS.none.values.minContractOi);
  const [minContractVolume, setMinContractVolume] = useState(STRATEGY_PARAMETER_PRESETS.none.values.minContractVolume);
  const [unusualOnly, setUnusualOnly] = useState(false);
  const [sort, setSort] = useState('ivr');
  const [selectedStrategies, setSelectedStrategies] = useState([]);
  const [results, setResults] = useState(null);
  const [tableSort, setTableSort] = useState({ key: 'ivRank', direction: 'desc' });
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

  function applyStrategyProfile(profile) {
    const preset = STRATEGY_PARAMETER_PRESETS[profile];
    if (!preset) return;
    setStrategyProfile(profile);
    setDteMin(preset.values.dteMin);
    setDteMax(preset.values.dteMax);
    setDeltaMin(preset.values.deltaMin);
    setDeltaMax(preset.values.deltaMax);
    setMaxSpreadPct(preset.values.maxSpreadPct);
    setMinContractOi(preset.values.minContractOi);
    setMinContractVolume(preset.values.minContractVolume);
  }

  function markCustomProfile() {
    setStrategyProfile('custom');
  }

  function applyOpportunityPreset(kind) {
    if (kind === 'income') {
      setMinIvr(50);
      setMaxIvr(100);
      setGammaRegime('all');
      setWall('all');
      setNearWallPct('');
      setUnusualOnly(false);
      setSort('ivr');
    }
    if (kind === 'wall') {
      setMinIvr(30);
      setMaxIvr(100);
      setWall('either');
      setNearWallPct('3');
      setUnusualOnly(false);
      setSort('combined');
    }
    if (kind === 'activity') {
      setMinIvr(0);
      setMaxIvr(100);
      setUnusualOnly(true);
      setMinUnusualOi('1');
      setSort('combined');
    }
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
        dteMin,
        dteMax,
        deltaMin,
        deltaMax,
        maxSpreadPct,
        minContractOi,
        minContractVolume,
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
  const displayedResults = results ? [...results].sort((a, b) => {
    const av = sortValue(a, tableSort.key);
    const bv = sortValue(b, tableSort.key);
    if (typeof av === 'string' || typeof bv === 'string') {
      return tableSort.direction === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    }
    const diff = (av ?? 0) - (bv ?? 0);
    return tableSort.direction === 'asc' ? diff : -diff;
  }) : null;

  function toggleTableSort(key) {
    setTableSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  return (
    <div className="scan-page">
      <div className="scan-header">
        <div className="scan-title">扫描器</div>
        <div className="scan-subtitle">先选择机会类型；高级期权数据可用于进一步收窄结果</div>
      </div>

      <div className="scan-body">
        {/* 过滤面板 */}
        <div className="scan-filters">
          <div className="scan-filter-section">
            <div className="scan-filter-label">机会类型</div>
            <div className="scan-filter-help">不知道参数怎么填时，从这里开始。</div>
            <div className="scan-opportunity-grid">
              <button className="scan-preset" onClick={() => applyOpportunityPreset('income')}>高 IV 收租</button>
              <button className="scan-preset" onClick={() => applyOpportunityPreset('wall')}>靠近压力/支撑</button>
              <button className="scan-preset" onClick={() => applyOpportunityPreset('activity')}>期权持仓异动</button>
            </div>
          </div>

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
            <div className="scan-filter-label">策略参数</div>
            <div className="scan-filter-help">系统会把风格自动转换成 DTE、Delta、bid/ask spread 和流动性条件。</div>
            <div className="scan-profile-grid">
              {Object.entries(STRATEGY_PARAMETER_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  className={`scan-profile-card ${strategyProfile === key ? 'active' : ''}`}
                  onClick={() => applyStrategyProfile(key)}
                  type="button"
                >
                  <span>{preset.label}</span>
                  <small>{preset.desc}</small>
                </button>
              ))}
            </div>
            {strategyProfile === 'custom' && (
              <div className="scan-filter-help">当前使用自定义高级参数。</div>
            )}
          </div>

          <details className="scan-advanced">
            <summary>高级期权数据过滤</summary>
            <div className="scan-filter-section">
              <div className="scan-filter-label">Strategy Contract Filters</div>
              <div className="scan-filter-help">DTE 是 Days To Expiration，到期剩余天数。Delta 常用来选 short leg，例如 0.16-0.30。Bid/Ask Spread 越窄，合约越容易成交。</div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="Days To Expiration，到期剩余天数。">DTE</span>
                <input
                  type="number" min={0}
                  className="scan-num-input"
                  placeholder="min"
                  value={dteMin}
                  onChange={e => { markCustomProfile(); setDteMin(e.target.value); }}
                />
                <input
                  type="number" min={0}
                  className="scan-num-input"
                  placeholder="max"
                  value={dteMax}
                  onChange={e => { markCustomProfile(); setDteMax(e.target.value); }}
                />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="Absolute Delta，按绝对值过滤，例如 short premium 常看 0.10 到 0.30。">Abs Delta</span>
                <input
                  type="number" min={0} max={1} step={0.01}
                  className="scan-num-input"
                  placeholder="min"
                  value={deltaMin}
                  onChange={e => { markCustomProfile(); setDeltaMin(e.target.value); }}
                />
                <input
                  type="number" min={0} max={1} step={0.01}
                  className="scan-num-input"
                  placeholder="max"
                  value={deltaMax}
                  onChange={e => { markCustomProfile(); setDeltaMax(e.target.value); }}
                />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="Bid/Ask Spread 百分比，按 (ask-bid)/mid 计算。">Max Spread</span>
                <input
                  type="number" min={0} step={0.5}
                  className="scan-wide-input"
                  placeholder="%"
                  value={maxSpreadPct}
                  onChange={e => { markCustomProfile(); setMaxSpreadPct(e.target.value); }}
                />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="单个合约最低 Open Interest。">Contract OI</span>
                <input
                  type="number" min={0}
                  className="scan-wide-input"
                  placeholder="最低"
                  value={minContractOi}
                  onChange={e => { markCustomProfile(); setMinContractOi(e.target.value); }}
                />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="单个合约最低成交量。">Contract Vol</span>
                <input
                  type="number" min={0}
                  className="scan-wide-input"
                  placeholder="最低"
                  value={minContractVolume}
                  onChange={e => { markCustomProfile(); setMinContractVolume(e.target.value); }}
                />
              </div>
            </div>

            <div className="scan-filter-section">
              <div className="scan-filter-label">Gamma / Wall</div>
              <div className="scan-filter-help">Gamma 是期权仓位对标的价格变化的敏感度。这里用它判断价格附近是否容易被压住或放大波动。</div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="Gamma Regime，全局 Gamma 环境。正 Gamma 往往压制波动，负 Gamma 往往放大波动。">Gamma Regime</span>
                <select className="scan-select" value={gammaRegime} onChange={e => setGammaRegime(e.target.value)}>
                  <option value="all">全部</option>
                  <option value="positive">Positive</option>
                  <option value="negative">Negative</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="Wall Proximity，筛选价格靠近 Call Wall 或 Put Wall 的标的。">Wall</span>
                <select className="scan-select" value={wall} onChange={e => setWall(e.target.value)}>
                  <option value="all">不限</option>
                  <option value="either">靠近任一</option>
                  <option value="call">靠近 Call</option>
                  <option value="put">靠近 Put</option>
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
                <span className="scan-filter-sub" title="Local Gamma，当前价格附近的 Gamma 强度；不是用户手工输入的数据，由系统从期权链计算。">Local Gamma</span>
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
              <div className="scan-filter-label">Open Interest / Volume</div>
              <div className="scan-filter-help">这些值来自期权链快照。用户不需要自己知道，通常用于排除流动性差的标的。</div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="Open Interest，未平仓合约数量。">Total OI</span>
                <input
                  type="number" min={0}
                  className="scan-wide-input"
                  placeholder="最低"
                  value={minTotalOi}
                  onChange={e => setMinTotalOi(e.target.value)}
                />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="Option Volume，期权成交量。">Option Volume</span>
                <input
                  type="number" min={0}
                  className="scan-wide-input"
                  placeholder="最低"
                  value={minTotalVolume}
                  onChange={e => setMinTotalVolume(e.target.value)}
                />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="Volume / Open Interest，用于观察今天交易是否相对异常活跃。">Volume / OI</span>
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
              <div className="scan-filter-label">Unusual OI / Put-Call Ratio</div>
              <div className="scan-filter-help">OI Delta 比较连续快照的持仓变化；Put/Call Ratio 用来粗看期权情绪。</div>
              <label className="scan-check-row">
                <input
                  type="checkbox"
                  checked={unusualOnly}
                  onChange={e => setUnusualOnly(e.target.checked)}
                />
                <span>仅显示 Unusual OI</span>
              </label>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="Unusual Count，命中 OI Delta 阈值的合约数量。">Unusual Count</span>
                <input
                  type="number" min={0}
                  className="scan-wide-input"
                  placeholder="最低"
                  value={minUnusualOi}
                  onChange={e => setMinUnusualOi(e.target.value)}
                />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="OI Delta，当前快照相对上一快照的 Open Interest 变化量。">OI Delta</span>
                <input
                  type="number" min={0}
                  className="scan-wide-input"
                  placeholder="最低"
                  value={minOiDelta}
                  onChange={e => setMinOiDelta(e.target.value)}
                />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub" title="Put/Call Ratio。大于 1 表示 Put 相对更多，小于 1 表示 Call 相对更多。">Put/Call Ratio</span>
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
          </details>

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
            <div className="scan-filter-label">扫描池</div>
            <div className="scan-universe-card">
              <strong>{watchlist.length || '...'}</strong>
              <span>个已接入数据的标的</span>
            </div>
            <div className="scan-filter-help">当前是过渡数据池；正式版会扩展为全市场 universe，并支持市值、价格、成交量、期权流动性等过滤。</div>
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
              <div>没有符合条件的标的，请切回「不限」或放宽 IV / DTE / Delta / spread 条件</div>
            </div>
          ) : (
            <>
              <div className="scan-results-header">
                找到 <strong>{results.length}</strong> 个标的
              </div>
              <div className="scan-table">
                <div className="scan-table-head">
                  {SORTABLE_COLUMNS.map(col => (
                    <button
                      key={col.key}
                      className="scan-sort-head"
                      onClick={() => toggleTableSort(col.key)}
                      title={col.title}
                      type="button"
                    >
                      <span>{col.label}</span>
                      {tableSort.key === col.key && <small>{tableSort.direction === 'desc' ? '↓' : '↑'}</small>}
                    </button>
                  ))}
                </div>
                {displayedResults.map(d => (
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
                        {d.gex.status === 'fresh' ? d.gex.regime : missingLabel(d.gex.status)}
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
                        : missingLabel(d.unusual.status)}
                    </span>
                    <span className="scan-contract-cell" title={`${d.contractQuality.contractCount} contracts · ${d.contractQuality.quotedCount} quoted · ${d.contractQuality.greeksCount} Greeks`}>
                      {d.contractQuality.contractCount > 0 ? (
                        <>
                          <span>DTE {d.contractQuality.minDte === d.contractQuality.maxDte ? d.contractQuality.minDte : `${d.contractQuality.minDte ?? '--'}-${d.contractQuality.maxDte ?? '--'}`}</span>
                          <span>Δ {formatDeltaRange(d.contractQuality.minAbsDelta, d.contractQuality.maxAbsDelta)}</span>
                          <span>Spr {d.contractQuality.avgSpreadPct == null ? '--' : `${d.contractQuality.avgSpreadPct.toFixed(1)}%`}</span>
                        </>
                      ) : (
                        <span>--</span>
                      )}
                    </span>
                    <span className="scan-strategy" title={strategyAction(d.recommendation.strategy)}>
                      <strong>{d.recommendation.strategy}</strong>
                      <small>{strategyAction(d.recommendation.strategy)}</small>
                    </span>
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
