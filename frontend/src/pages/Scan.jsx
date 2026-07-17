import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDataStatus, getMarketRegime, getScan } from '../lib/api';
import ScannerAlerts from '../components/ScannerAlerts';
import { communityHeatLabel, normalizeCommunityTrend } from '../lib/communityTrend';
import { gammaRegimeLabel, gammaSummary, wallSummary } from '../lib/scannerPresentation';
import { OPPORTUNITY_PRESETS } from '../lib/scannerPresets';
import { dedupeScannerRows, nextScannerSort, scanCandidateId, sortScannerRows } from '../lib/scannerResults';
import DataDetails from '../components/DataDetails';

const STRATEGY_OPTIONS = [
  'Iron Condor', 'Bull Put Spread', 'Bear Call Spread', 'Long Straddle',
  'Short Strangle', 'Iron Butterfly', 'Calendar Spread', 'Diagonal Spread',
  'Long Call', 'Long Put', 'Jade Lizard', 'Short Put', 'Short Call',
];
const ADVANCED_RISK_STRATEGIES = ['Short Strangle', 'Short Put', 'Short Call'];

const STRATEGY_PARAMETER_PRESETS = {
  none: {
    label: '不限',
    desc: '枚举当前快照全部达标候选',
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
    label: '较低 Delta',
    desc: '更远 Delta，更严流动性；不代表整体风险等级',
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
    label: '平衡参数',
    desc: '平衡 Delta、到期日与流动性；不代表胜率或收益',
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
    label: '较高 Delta',
    desc: '更靠近现价，通常权利金更高，同时被触及与亏损风险也更高',
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
  { key: 'ivRank', label: '波动', title: 'IV Rank：当前 IV 在过去一年隐含波动率区间中的位置。下方同时显示 IV30 / HV30。' },
  { key: 'direction', label: '方向', title: '由价格历史派生的趋势标签。' },
  { key: 'gex', label: '期权定位', title: 'GEX、最近 Wall 与 OI 异动。GEX 未采集时不会据此作结论。' },
  { key: 'strategy', label: '策略候选', title: '基于已采集 bid/ask 快照的合约组成具体策略腿；不保证可按显示价格成交。Calendar / Diagonal 可以跨到期日。' },
  { key: 'score', label: '筛选匹配分', title: '根据 DTE、Delta、bid/ask spread、OI、Volume 和收益风险的启发式综合评分，用于排序，不代表胜率、预期收益或投资建议。' },
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

function strategyAction(strategy) {
  if (strategy === 'Bear Call Spread') return '卖出较低行权价 Call，买入更高行权价 Call，收取 credit。';
  if (strategy === 'Bull Put Spread') return '卖出较高行权价 Put，买入更低行权价 Put，收取 credit。';
  if (strategy === 'Iron Condor') return '同时做 Bear Call Spread + Bull Put Spread，押注区间震荡。';
  if (strategy === 'Long Straddle') return '买入同一到期 ATM Call + Put；实际波动需足以覆盖支付的权利金与波动率变化。';
  if (strategy === 'Short Strangle') return '卖出 OTM Call + OTM Put；上行损失理论上无限，下行损失可能很大，并存在保证金与提前指派风险。';
  if (strategy === 'Iron Butterfly') return '卖出同一 ATM Call + Put，并买入对称 wings 限定风险。';
  if (strategy === 'Calendar Spread') return '卖出近月并买入同 strike 远月期权，交易时间价值差。';
  if (strategy === 'Diagonal Spread') return '卖出近月 OTM 腿并买入更靠近现价的远月腿。';
  if (strategy === 'Long Call') return '买入 OTM Call，最大亏损为 debit。';
  if (strategy === 'Long Put') return '买入 OTM Put，最大亏损为 debit。';
  if (strategy === 'Jade Lizard') return '卖出 OTM Put + Bear Call Spread；若净信用不少于 Call spread 宽度，到期损益图上没有上行亏损，仍存在执行、指派、流动性和下行风险。';
  if (strategy === 'Short Put') return '卖出 OTM Put；需要承担较大的下行及保证金风险。';
  if (strategy === 'Short Call') return '卖出 OTM Call；上行风险无上限。';
  return '点击进入分析页查看结构。';
}

function economicsSummary(setup) {
  if (setup.returnOnRisk != null) return `RoR ${(setup.returnOnRisk * 100).toFixed(1)}%`;
  if (setup.debit != null) return `Debit $${Math.round(setup.debit * 100).toLocaleString('en-US')}`;
  if (setup.credit != null) return `Credit $${Math.round(setup.credit * 100).toLocaleString('en-US')} · 风险未限定`;
  return '--';
}

function researchModelSummary(setup) {
  const move = setup.expected_move;
  const pop = setup.pop;
  const expectedMove = move?.status === 'available' && Number.isFinite(Number(move.expected_move))
    ? `EM ±$${Number(move.expected_move).toFixed(2)}`
    : 'EM 不可用';
  const probability = pop?.status === 'available' && Number.isFinite(Number(pop.probability))
    ? `POP ${(Number(pop.probability) * 100).toFixed(0)}%`
    : 'POP 不可用';
  return `${expectedMove} · ${probability}`;
}

function oiDeltaSummary(unusual) {
  if (unusual.status === 'confirmed') {
    const maxDelta = unusual.maxDelta == null ? '--' : Math.round(unusual.maxDelta).toLocaleString('en-US');
    return `ΔOI 最大 ${maxDelta} · 异动 ${unusual.count}`;
  }
  if (unusual.status === 'baseline') return 'ΔOI 待下一交易日';
  if (unusual.status === 'stale') return 'ΔOI 基线过期';
  return 'ΔOI 未采集';
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

function toScanRow(row, concreteSetup) {
  const recommendation = { strategy: concreteSetup.strategy };
  const nearestWall = wallDistance(row);
  const earningsDays = daysUntil(row.earnings_date);
  const trendScore = num(row.trend_score);
  const trendLabel = row.trend_label || (trendScore == null ? '趋势数据不足' : '等待确认');
  return {
    id: scanCandidateId(row.symbol, concreteSetup),
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
    community: normalizeCommunityTrend(row),
    recommendation,
    concreteSetup,
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
    gexMetadata: row.gex_metadata || null,
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
  const [marketCapMin, setMarketCapMin] = useState('');
  const [marketCapMax, setMarketCapMax] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [minUnderlyingVolume, setMinUnderlyingVolume] = useState('');
  const [minDollarVolume, setMinDollarVolume] = useState('');
  const [optionable, setOptionable] = useState('all');
  const [sector, setSector] = useState('');
  const [earningsMode, setEarningsMode] = useState('all');
  const [unusualOnly, setUnusualOnly] = useState(false);
  const [sort, setSort] = useState('ivr');
  const [selectedStrategies, setSelectedStrategies] = useState([]);
  const [allowUndefinedRisk, setAllowUndefinedRisk] = useState(false);
  const [results, setResults] = useState(null);
  const [tableSort, setTableSort] = useState({ key: 'score', direction: 'desc' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dataStatus, setDataStatus] = useState(null);
  const [marketRegime, setMarketRegime] = useState(null);
  const [opportunityPreset, setOpportunityPreset] = useState('');

  useEffect(() => {
    getDataStatus().then(setDataStatus).catch(() => {});
    getMarketRegime().then(setMarketRegime).catch(() => {});
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
    const preset = OPPORTUNITY_PRESETS[kind];
    if (!preset) return;
    const values = preset.values;
    setOpportunityPreset(kind);
    setMinIvr(values.minIvr);
    setMaxIvr(values.maxIvr);
    setGammaRegime(values.gammaRegime);
    setWall(values.wall);
    setNearWallPct(values.nearWallPct);
    setUnusualOnly(values.unusualOnly);
    setSort(values.sort);
    if ('minUnusualOi' in values) setMinUnusualOi(values.minUnusualOi);
    handleScan(values);
  }

  async function handleScan(overrides = {}) {
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
        marketCapMin: marketCapMin === '' ? '' : Number(marketCapMin) * 1e9,
        marketCapMax: marketCapMax === '' ? '' : Number(marketCapMax) * 1e9,
        priceMin,
        priceMax,
        minUnderlyingVolume,
        minDollarVolume: minDollarVolume === '' ? '' : Number(minDollarVolume) * 1e6,
        optionable,
        sector,
        earningsMode,
        earningsDays: 14,
        unusualOnly,
        allowUndefinedRisk,
        strategies: selectedStrategies,
        sort,
        limit: 100,
        ...overrides,
      });
      const liveRows = rows.map(row => toScanRow(row, row.concrete_setup));
      setResults(dedupeScannerRows(liveRows));
    } catch {
      setResults([]);
      setError('扫描 API 暂时不可用。');
    } finally {
      setLoading(false);
    }
  }

  function handleRowClick(symbol) {
    navigate(`/analyze?symbol=${symbol}&tab=0`);
  }

  const watchlist = dataStatus?.expected_symbols || [];
  const universeCount = dataStatus?.universe?.scan_enabled_count || watchlist.length;
  const displayedResults = results ? sortScannerRows(results, tableSort) : null;

  function toggleTableSort(key) {
    setTableSort(prev => nextScannerSort(prev, key));
  }

  return (
    <div className="scan-page">
      <div className="scan-header">
        <div className="scan-title">扫描器</div>
        <div className="scan-subtitle">扫描已采集的报价快照，输出到期日、策略腿候选与模型收益风险</div>
      </div>

      {marketRegime?.regime?.status === 'ready' && (
        <div className="scan-market-regime">
          <div>
            <span className="scan-market-label">Market Regime</span>
            <strong>{marketRegime.regime.label}</strong>
            <span>综合 {marketRegime.regime.score}</span>
          </div>
          {marketRegime.instruments.map(item => (
            <div key={item.symbol} className="scan-market-symbol">
              <strong>{item.symbol}</strong>
              <span>{item.momentum.status === 'ready' ? `动量 ${item.momentum.score}` : '动量不足'}</span>
              <span>{item.gex ? `${item.gex.gamma_regime} Gamma` : 'GEX --'}</span>
              <span className={item.momentum.breakout_30m?.confirmed ? 'active' : ''}>
                {item.momentum.breakout_30m?.confirmed
                  ? `30M ${item.momentum.breakout_30m.direction === 'up' ? 'Breakout' : 'Breakdown'}`
                  : '30M 无确认突破'}
              </span>
            </div>
          ))}
        </div>
      )}

      <ScannerAlerts minIvr={minIvr} gammaRegime={gammaRegime} unusualOnly={unusualOnly} />

      <div className={`scan-body${results === null ? ' scan-body-idle' : ''}`}>
        {/* 过滤面板 */}
        <div className="scan-filters">
          <div className="scan-filter-section">
            <div className="scan-filter-label">机会类型</div>
            <div className="scan-filter-help">不知道参数怎么填时，从这里开始。</div>
            <div className="scan-opportunity-grid">
              {Object.entries(OPPORTUNITY_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  className={`scan-preset${opportunityPreset === key ? ' active' : ''}`}
                  aria-pressed={opportunityPreset === key}
                  onClick={() => applyOpportunityPreset(key)}
                >
                  {preset.label}
                </button>
              ))}
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
              <button className="scan-preset" onClick={() => { setMinIvr(50); setMaxIvr(100); }}>高 IV Rank (&gt;50)</button>
              <button className="scan-preset" onClick={() => { setMinIvr(30); setMaxIvr(50); }}>中 IV Rank (30-50)</button>
              <button className="scan-preset" onClick={() => { setMinIvr(0); setMaxIvr(30); }}>低 IV Rank (&lt;30)</button>
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
              <div className="scan-filter-label">Universe / 标的池</div>
              <div className="scan-filter-help">市值单位为十亿美元，最低日成交额单位为百万美元。元数据缺失时，填写对应条件会将该标的排除。</div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub">Market Cap ($B)</span>
                <input type="number" min={0} className="scan-num-input" placeholder="min" value={marketCapMin} onChange={e => setMarketCapMin(e.target.value)} />
                <input type="number" min={0} className="scan-num-input" placeholder="max" value={marketCapMax} onChange={e => setMarketCapMax(e.target.value)} />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub">Stock Price</span>
                <input type="number" min={0} className="scan-num-input" placeholder="min" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
                <input type="number" min={0} className="scan-num-input" placeholder="max" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub">Share Volume</span>
                <input type="number" min={0} className="scan-wide-input" placeholder="最低日成交股数" value={minUnderlyingVolume} onChange={e => setMinUnderlyingVolume(e.target.value)} />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub">最低日成交额（百万美元）</span>
                <input type="number" min={0} className="scan-wide-input" placeholder="最低" value={minDollarVolume} onChange={e => setMinDollarVolume(e.target.value)} />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub">Optionable</span>
                <select className="scan-select" value={optionable} onChange={e => setOptionable(e.target.value)}>
                  <option value="all">不限（允许元数据缺失）</option>
                  <option value="true">仅已确认可交易期权</option>
                  <option value="false">仅不可交易期权</option>
                </select>
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub">Sector</span>
                <input className="scan-wide-input" placeholder="精确 sector 名称" value={sector} onChange={e => setSector(e.target.value)} />
              </div>
              <div className="scan-filter-row">
                <span className="scan-filter-sub">Earnings 14D</span>
                <select className="scan-select" value={earningsMode} onChange={e => setEarningsMode(e.target.value)}>
                  <option value="all">不限</option>
                  <option value="exclude">排除未来 14 天财报</option>
                  <option value="only">仅未来 14 天财报</option>
                </select>
              </div>
            </div>
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
              <div className="scan-filter-help">Gamma 描述 Delta 对标的价格变化的敏感度。这里显示的是基于 OI 和模型假设的定位代理，不是确定的价格预测。</div>
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
              <div className="scan-filter-help">OI Delta 比较连续快照中的未平仓量变化；Put/Call Ratio 是相对比例，不直接代表市场情绪或方向。</div>
              <label className="scan-toggle">
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
            <div className="scan-filter-help">默认只枚举定义风险结构。Short Strangle / Short Put / Short Call 需要显式开启高级风险。</div>
            <label className="scan-toggle">
              <input
                type="checkbox"
                checked={allowUndefinedRisk}
                onChange={event => setAllowUndefinedRisk(event.target.checked)}
              />
              <span>启用高级裸卖风险策略</span>
            </label>
            <div className="scan-strategy-chips">
              {STRATEGY_OPTIONS.map(s => (
                <button
                  key={s}
                  className={`scan-chip ${selectedStrategies.includes(s) ? 'active' : ''} ${ADVANCED_RISK_STRATEGIES.includes(s) ? 'advanced' : ''}`}
                  onClick={() => toggleStrategy(s)}
                  title={ADVANCED_RISK_STRATEGIES.includes(s) ? '需要启用高级裸卖风险策略' : strategyAction(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="scan-filter-section">
            <div className="scan-filter-label">扫描池</div>
            <div className="scan-universe-card">
              <strong>{universeCount || '...'}</strong>
              <span>个已接入数据的标的</span>
            </div>
            <div className="scan-filter-help">扫描池会按需扩展；只有已生成的数据快照中具备所需字段的标的会通过筛选。</div>
          </div>

          <button className="scan-btn" onClick={handleScan} disabled={loading}>
            {loading ? '扫描中...' : '立即扫描'}
          </button>
        </div>

        {/* 结果列表 */}
        <div className="scan-results">
          {error && <div className="az-error">{error}</div>}
          {results === null ? (
            <div className="scan-empty scan-empty-idle">
              <div className="scan-empty-icon">+</div>
              <div>
                <strong>尚未开始扫描</strong>
                <span>选择机会类型或调整参数后，点击「立即扫描」</span>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="scan-empty">
              <div className="scan-empty-icon">∅</div>
              <div>当前没有能用已采集报价快照组成的完整候选结构，请调整机会类型或参数</div>
            </div>
          ) : (
            <>
              <div className="scan-results-header">
                找到 <strong>{results.length}</strong> 个基于报价快照生成的候选结构
              </div>
              <div className="scan-table" key={`${tableSort.key}:${tableSort.direction}`}>
                <div className="scan-table-head">
                  {SORTABLE_COLUMNS.map(col => (
                    <button
                      key={col.key}
                      className="scan-sort-head"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleTableSort(col.key);
                      }}
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
                    key={d.id}
                    className="scan-table-row"
                    onClick={() => handleRowClick(d.symbol)}
                    title="点击查看详细分析"
                  >
                    <span className="scan-identity">
                      <strong className="scan-symbol">{d.symbol}</strong>
                      <small>{d.price == null ? '现价 --' : `$${d.price}`}</small>
                    </span>
                    <span className="scan-volatility">
                      <IVRBar value={d.ivRank} />
                      <small><em>{d.iv30}%</em> / {d.hv30}%</small>
                    </span>
                    <span className="scan-direction" style={{ color: DIR_COLOR(d.direction.score) }} title={d.direction.change5d == null ? '' : `5日 ${d.direction.change5d.toFixed(1)}%`}>
                      {d.direction.label}
                    </span>
                    <span className="scan-positioning" title={d.community.status === 'missing' ? '社区样本热度尚未采集' : `${d.community.windowHours} 小时社区样本：${d.community.mentions} 帖提及，互动分 ${d.community.score.toFixed(1)}；不代表整体市场情绪。`}>
                      <span className={`scan-gex-pill ${d.gex.regime}`}>
                        {gammaRegimeLabel(d.gex.regime)}
                      </span>
                      <small>{gammaSummary(d.gex)}</small>
                      <small>{wallSummary(d.gex, d.price)}</small>
                      <small>{oiDeltaSummary(d.unusual)} · 社区样本 {communityHeatLabel(d.community)}</small>
                      <DataDetails metadata={d.gexMetadata} compact />
                    </span>
                    <span className={`scan-candidate ${d.concreteSetup.status}`} title={[strategyAction(d.recommendation.strategy), ...d.concreteSetup.legLabels].join('\n')}>
                      <strong>{d.recommendation.strategy}</strong>
                      <small>{d.concreteSetup.expiry.slice(5)} · {d.concreteSetup.dte} DTE · OI ≥ {d.concreteSetup.minOpenInterest} · Spr {d.concreteSetup.avgSpreadPct.toFixed(1)}%</small>
                      <small>{d.concreteSetup.structure} · {d.concreteSetup.pricing} · {economicsSummary(d.concreteSetup)}</small>
                      <small title="Expected Move 使用同到期、最接近现价的 Call/Put IV 均值与日历日；POP 仅在期末盈亏平衡点明确且 IV 输入完整时按对数正态模型计算。">{researchModelSummary(d.concreteSetup)}</small>
                    </span>
                    <span className="scan-opportunity-score" title="DTE、Delta、spread、OI、Volume 和收益风险的启发式综合评分，仅用于排序，不代表胜率、预期收益或投资建议。">
                      {d.concreteSetup.score}
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
