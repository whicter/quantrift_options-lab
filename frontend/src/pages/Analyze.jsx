import { useState, useEffect, useEffectEvent, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCompanyInfo } from '../data/companyInfo';
import { getAnalyzeCandidate, getAnalyzeStatus, getChainStats, getDataStatus, getExternalFlow, getGex, getMetrics, getPrices, getSupportResistance, getTechnicalLevels, getUnusual, getVolumeProfile } from '../lib/api';
import { applyDerivedAnalysis, applyGex, isUsableGex, toNumber } from '../lib/analyzeData';
import { toAnalyzeRecommendation } from '../lib/analyzeRecommendation';
import { applyExternalFlow } from '../lib/externalFlow';
import { normalizeTickerInput, sanitizeTickerForSubmit } from '../lib/symbolInput';
import Tab1Overview from './analyze/Tab1Overview';
import Tab2Trend from './analyze/Tab2Trend';
import Tab3Options from './analyze/Tab3Options';
import Tab4Signals from './analyze/Tab4Signals';
import DataDetails from '../components/DataDetails';
import TechnicalLevelsPanel from '../components/TechnicalLevelsPanel';

const TABS = [
  { id: 0, label: '最新概览' },
  { id: 1, label: '价格与动量' },
  { id: 2, label: '期权结构' },
  { id: 3, label: '关键价位与情景' },
];

function daysUntilEarnings(dateText) {
  if (!dateText) return null;
  const date = new Date(`${String(dateText).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.ceil((date.getTime() - todayUtc) / 86400000);
}

function earningsTimingLabel(daysAway) {
  if (daysAway === 0) return '今日财报';
  if (daysAway != null && daysAway > 0) return `${daysAway} 天后`;
  return '财报已公布';
}

function applyMetrics(data, metrics) {
  if (!data || !metrics) return data;
  const asPercent = (value, fallback) => {
    if (value == null) return fallback;
    const number = Number(value) * 100;
    return Number.isFinite(number) ? Number(number.toFixed(1)) : fallback;
  };
  const iv30 = asPercent(metrics.iv30, data.iv30);
  const hv30 = asPercent(metrics.hv30, data.hv30);
  const hv60 = asPercent(metrics.hv60, data.hv60);
  const ivHvDiff = asPercent(metrics.iv_hv_diff, data.ivHvDiff);
  const earningsDate = metrics.earnings_date ? String(metrics.earnings_date).slice(0, 10) : data.earnings?.date;
  const earningsDaysAway = daysUntilEarnings(earningsDate);

  return {
    ...data,
    ivRank: metrics.iv_rank == null ? data.ivRank : Math.round(Number(metrics.iv_rank)),
    ivPercentile: metrics.iv_percentile == null ? data.ivPercentile : Math.round(Number(metrics.iv_percentile)),
    iv30,
    hv30,
    hv60,
    ivHvDiff,
    dataMeta: {
      date: metrics.date ? String(metrics.date).slice(0, 10) : null,
      source: metrics.source,
    },
    earnings: {
      ...data.earnings,
      date: earningsDate,
      daysAway: earningsDaysAway,
      warning: earningsDaysAway != null && earningsDaysAway >= 0 && earningsDaysAway <= 14,
    },
  };
}

// This is the only analysis seed used in production. Every displayed market
// value is subsequently supplied by a real API response or remains null.
function createRealAnalysis(symbol, priceData) {
  const priceHistory = normalizePriceHistory(priceData);
  const latest = priceHistory.at(-1);
  const rvol = calcRVol(priceHistory);

  return {
    symbol,
    price: latest ? Number(latest.close.toFixed(2)) : null,
    priceHistory,
    priceMeta: latest ? {
      source: priceData?.source,
      latestDate: String(priceData?.latest_date || latest.date).slice(0, 10),
      count: priceData?.count,
      freshness: priceData?.freshness,
      isStale: Boolean(priceData?.is_stale),
    } : null,
    dataMeta: null,
    ivRank: null,
    ivPercentile: null,
    iv30: null,
    hv30: null,
    hv60: null,
    ivHvDiff: null,
    earnings: { date: null, daysAway: null, warning: false },
    sector: [],
    trend: {
      regime: '历史不足',
      momentum: '历史不足',
      signal: '等待数据',
      score: 0,
      rvol: rvol == null ? null : Number(rvol.toFixed(2)),
      indicators: null,
    },
    direction: { score: 0, label: '已采集数据', signals: [] },
    gexTotal: null,
    gexByStrike: [],
    putWall: null,
    callWall: null,
    pcr: null,
    pcrVol: null,
    maxPain: null,
    gammaFlip: null,
    localGamma: null,
    gammaRegime: null,
    scenarios: null,
    conclusion: '等待已采集的期权快照。',
    recommendation: null,
  };
}

function normalizePriceHistory(priceData) {
  return (priceData?.prices || [])
    .map(bar => ({
      date: String(bar.date).slice(0, 10),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume || 0),
    }))
    .filter(bar => Number.isFinite(bar.close));
}

function calcRVol(bars) {
  if (!bars || bars.length < 2) return null;
  const latest = bars[bars.length - 1];
  const prior = bars.slice(Math.max(0, bars.length - 21), -1).filter(bar => bar.volume > 0);
  if (!latest.volume || prior.length === 0) return null;
  const avg = prior.reduce((sum, bar) => sum + bar.volume, 0) / prior.length;
  if (!avg) return null;
  return latest.volume / avg;
}

function applyUnusual(data, unusualData) {
  if (!data || !unusualData || unusualData.freshness === 'missing') {
    return {
      ...data,
      unusualMeta: unusualData ? {
        freshness: unusualData.freshness,
        status: unusualData.status,
        snapshotTs: unusualData.snapshot_ts,
      } : null,
    };
  }

  const items = (unusualData.items || []).map(item => ({
    type: item.right === 'C' ? 'CALL' : 'PUT',
    strike: toNumber(item.strike),
    date: item.expiry ? String(item.expiry).slice(0, 10) : '--',
    vol: Number(item.volume || 0),
    oi: toNumber(item.open_interest),
    previousOi: toNumber(item.previous_open_interest),
    oiDelta: toNumber(item.oi_delta),
    oiDeltaPct: toNumber(item.oi_delta_pct),
    volumeOiRatio: toNumber(item.volume_oi_ratio),
    status: item.status,
    isUnusual: Boolean(item.is_unusual),
    contract: item.contract_symbol || item.provider_contract_id,
  })).filter(item => item.strike != null);

  return {
    ...data,
    unusualActivity: items,
    unusualMeta: {
      freshness: unusualData.freshness,
      status: unusualData.status,
      snapshotTs: unusualData.snapshot_ts,
      unusualCount: unusualData.unusual_count || 0,
    },
  };
}

function deriveTrendFromPriceHistory(priceHistory, fallbackTrend = {}) {
  if (!priceHistory || priceHistory.length < 5) return fallbackTrend;

  const closes = priceHistory.map(bar => bar.close);
  const latest = closes[closes.length - 1];
  const prev = closes[Math.max(0, closes.length - 6)];
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const macdData = macd(closes);
  const change5d = prev ? ((latest / prev) - 1) * 100 : 0;
  const above20 = ma20 != null ? latest >= ma20 : true;
  const above50 = ma50 != null ? latest >= ma50 : above20;
  const macdBullish = macdData ? macdData.histogram >= 0 : change5d >= 0;
  const rsiBullish = rsi14 == null ? true : rsi14 >= 50 && rsi14 <= 75;
  const score = [
    above20 ? 1 : -1,
    above50 ? 1 : -1,
    macdBullish ? 1 : -1,
    rsiBullish ? 1 : rsi14 > 75 ? 0 : -1,
    change5d > 1 ? 1 : change5d < -1 ? -1 : 0,
  ].reduce((sum, value) => sum + value, 0);

  return {
    ...fallbackTrend,
    regime: score >= 3 ? '多头趋势' : score <= -3 ? '空头趋势' : above20 ? '震荡偏强' : '震荡偏弱',
    momentum: change5d > 1 ? '向上增强' : change5d < -1 ? '向下减弱' : '横盘整理',
    signal: score >= 3 ? '趋势延续' : score <= -3 ? '下行风险' : '等待确认',
    score,
    indicators: {
      ma20,
      ma50,
      ma200,
      rsi14,
      macd: macdData,
      change5d,
    },
  };
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const output = [];
  let prev = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output.push(prev);
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    output.push(prev);
  }
  return output;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function macd(values) {
  const ema12 = emaSeries(values, 12);
  const ema26 = emaSeries(values, 26);
  if (!ema12.length || !ema26.length) return null;
  const offset = ema12.length - ema26.length;
  const line = ema26.map((value, idx) => ema12[idx + offset] - value);
  const signal = emaSeries(line, 9);
  if (!signal.length) return null;
  const macdLine = line[line.length - 1];
  const signalLine = signal[signal.length - 1];
  return {
    line: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine,
  };
}

function buildPriceOnlyAnalysis(symbol, priceData) {
  const priceHistory = normalizePriceHistory(priceData);
  const data = createRealAnalysis(symbol, priceData);

  return {
    ...data,
    dataMeta: null,
    partialData: {
      type: 'price_only',
      title: '期权指标暂不可用',
      message: `${symbol} 已有价格数据，但 IV Rank / GEX / Call Wall / Put Wall 等期权数据尚未写入；当前只展示价格趋势，不生成策略候选。`,
    },
    trend: deriveTrendFromPriceHistory(priceHistory, data.trend),
    direction: {
      score: 0,
      label: 'Price-only',
      signals: [
        { name: 'Price History', value: '已采集', bullish: true },
        { name: 'Options Metrics', value: '待接入', bullish: false },
        { name: 'GEX / Walls', value: '待接入', bullish: false },
      ],
    },
    recommendation: null,
  };
}

function buildGexOnlyAnalysis(symbol, priceData, gexData) {
  const priceHistory = normalizePriceHistory(priceData);
  const base = createRealAnalysis(symbol, priceData);

  return {
    ...applyGex(base, gexData),
    trend: deriveTrendFromPriceHistory(priceHistory, base.trend),
    direction: {
      score: 0,
      label: 'GEX + Price',
      signals: [
        { name: 'Price History', value: priceHistory.length > 0 ? '已采集' : '待接入', bullish: priceHistory.length > 0 },
        { name: 'GEX / Walls', value: '已采集', bullish: true },
        { name: 'IV Metrics', value: '待接入', bullish: false },
      ],
    },
  };
}

function PartialDataNotice({ partialData }) {
  if (!partialData) return null;
  return (
    <div className="az-partial-notice">
      <div className="az-partial-title">{partialData.title}</div>
      <div className="az-partial-text">{partialData.message}</div>
    </div>
  );
}

function UnavailableOptionsPanel({ symbol }) {
  return (
    <div className="az-card az-unavailable-panel">
      <div className="az-card-title">期权分析暂不可用</div>
      <div className="az-unavailable-text">
        {symbol} 当前缺少可用的 IV Rank、GEX、Call Wall、Put Wall、PCR、期权腿或 POP 输入。
        为避免把不完整数据当成完整分析，这些模块暂不展示。
      </div>
    </div>
  );
}

function buildMissingMessage(symbol, status, onDemand) {
  if (onDemand?.status === 'queued') {
    return `${symbol} 正在补齐价格与期权数据。页面会自动检查更新；等待时间取决于数据源与队列${onDemand.estimated_wait ? `（当前估计 ${onDemand.estimated_wait}，仅供参考）` : ''}。`;
  }
  if (!status) {
    return `暂无 ${symbol} 的可用数据快照。数据覆盖状态暂时不可用，请稍后再试。`;
  }
  if (status.expected_symbols?.includes(symbol)) {
    return `暂无 ${symbol} 的可用数据快照：该标的已在数据覆盖列表中，但尚未写入最新记录。数据补齐后会自动可用。`;
  }
  return `暂无 ${symbol} 的可用数据快照：该标的还不在数据覆盖列表中。加入覆盖列表并完成采集后才会显示。`;
}

function IVGauge({ value }) {
  const color = value >= 50 ? 'var(--red)' : value >= 30 ? 'var(--yellow)' : 'var(--green)';
  const label = value >= 50 ? 'IV Rank 较高 · 相对自身历史区间' : value >= 30 ? 'IV Rank 中等 · 相对自身历史区间' : 'IV Rank 较低 · 相对自身历史区间';
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
      <div style={{ color, fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function Analyze() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSymbol = useRef(normalizeTickerInput(searchParams.get('symbol') || 'SPY'));
  const [input, setInput] = useState(() => normalizeTickerInput(searchParams.get('symbol') || 'SPY'));
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [technicalData, setTechnicalData] = useState(null);
  const [technicalError, setTechnicalError] = useState('');
  const [technicalLoading, setTechnicalLoading] = useState(false);
  const [dataStatus, setDataStatus] = useState(null);
  const [onDemandStatus, setOnDemandStatus] = useState(null);
  const [isComposing, setIsComposing] = useState(false);
  const activeTab = parseInt(searchParams.get('tab') || '0');
  const analyzeInitialSymbol = useEffectEvent(handleAnalyze);
  const pollQueuedAnalysis = useEffectEvent(async (symbol) => {
    try {
      const nextStatus = await getAnalyzeStatus(symbol);
      setOnDemandStatus(nextStatus);
      if (nextStatus?.status !== 'queued') handleAnalyze(symbol);
    } catch {
      // Keep the current queued state visible and retry on the next interval.
    }
  });

  function syncSearchParams(next, options = {}) {
    const normalized = new URLSearchParams(next);
    if (normalized.toString() === searchParams.toString()) return;
    setSearchParams(next, options);
  }

  const setTab = t => {
    const sym = searchParams.get('symbol');
    syncSearchParams(sym ? { symbol: sym, tab: t } : { tab: t });
  };

  async function handleAnalyze(forcedSymbol) {
    const rawSymbol = typeof forcedSymbol === 'string' ? forcedSymbol : input;
    const sym = sanitizeTickerForSubmit(rawSymbol);
    if (!sym) {
      setError('请输入有效股票代码，例如 AAPL / TSLA / QQQ。');
      setResult(null);
      setTechnicalData(null);
      setTechnicalError('');
      return;
    }
    setLoading(true); setError('');
    setTechnicalLoading(true);
    setTechnicalData(null);
    setTechnicalError('');

    try {
      const [onDemandStatus, metricsBySymbol, status, priceData, gexData, unusualData, supportResistance, chainStats, flowData, volumeProfile, candidateResponse, technicalResult] = await Promise.all([
        getAnalyzeStatus(sym).catch(() => null),
        getMetrics([sym]),
        dataStatus ? Promise.resolve(dataStatus) : getDataStatus().catch(() => null),
        getPrices(sym, 60).catch(() => null),
        getGex(sym).catch(() => null),
        getUnusual(sym, 20).catch(() => null),
        getSupportResistance(sym).catch(() => null),
        getChainStats(sym).catch(() => null),
        getExternalFlow(sym, 30).catch(() => null),
        getVolumeProfile(sym).catch(() => null),
        getAnalyzeCandidate(sym).catch(() => null),
        getTechnicalLevels(sym)
          .then(data => ({ data, error: '' }))
          .catch(fetchError => ({ data: null, error: fetchError.message })),
      ]);
      setTechnicalData(technicalResult.data);
      setTechnicalError(technicalResult.error);
      if (status && !dataStatus) setDataStatus(status);
      setOnDemandStatus(onDemandStatus);

      const metrics = metricsBySymbol[sym];
      if (!metrics) {
        if (isUsableGex(gexData)) {
          setResult({ ...applyExternalFlow(applyDerivedAnalysis(applyUnusual(buildGexOnlyAnalysis(sym, priceData, gexData), unusualData), supportResistance, chainStats, volumeProfile), flowData), onDemandStatus });
          syncSearchParams({ symbol: sym, tab: activeTab }, { replace: true });
          setError('');
          return;
        }
        const priceHistory = normalizePriceHistory(priceData);
        if (priceHistory.length > 0) {
          setResult({ ...applyExternalFlow(applyDerivedAnalysis(applyUnusual(buildPriceOnlyAnalysis(sym, priceData), unusualData), supportResistance, chainStats, volumeProfile), flowData), onDemandStatus });
          syncSearchParams({ symbol: sym, tab: 1 }, { replace: true });
          setError('');
        } else {
          setError(buildMissingMessage(sym, status, onDemandStatus));
          setResult(null);
        }
        return;
      }

      const withPrice = applyMetrics(createRealAnalysis(sym, priceData), metrics);
      const dataWithSignals = applyUnusual(applyGex({
        ...withPrice,
        trend: deriveTrendFromPriceHistory(withPrice.priceHistory, withPrice.trend),
      }, gexData), unusualData);
      const candidateState = toAnalyzeRecommendation(candidateResponse);
      const data = applyExternalFlow(applyDerivedAnalysis({
        ...dataWithSignals,
        recommendation: candidateState.recommendation,
        recommendationUnavailableReason: candidateState.unavailableReason,
        onDemandStatus,
      }, supportResistance, chainStats, volumeProfile), flowData);
      setResult(data);
      syncSearchParams({ symbol: sym, tab: activeTab }, { replace: true });
    } catch {
      setResult(null);
      setError(`数据 API 暂时不可用，无法确认 ${sym} 的期权结构。`);
    } finally {
      setLoading(false);
      setTechnicalLoading(false);
    }
  }

  useEffect(() => {
    analyzeInitialSymbol(initialSymbol.current);
    getDataStatus().then(setDataStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (onDemandStatus?.status !== 'queued' || !onDemandStatus.symbol) return undefined;
    const interval = window.setInterval(() => pollQueuedAnalysis(onDemandStatus.symbol), 5000);
    return () => window.clearInterval(interval);
  }, [onDemandStatus?.status, onDemandStatus?.symbol]);

  return (
    <div className="az-page">
      <div className="az-header">
        <div className="az-title">标的快照分析</div>
        <div className="az-subtitle">输入标的，查看 GEX 估算、价格趋势、期权链指标与关键价位</div>
      </div>

      <div className="az-search">
        <input
          className="az-input"
          placeholder="输入股票代码，如 AAPL"
          value={input}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={e => {
            setIsComposing(false);
            setInput(normalizeTickerInput(e.currentTarget.value));
          }}
          onChange={e => {
            const value = e.target.value;
            setInput(isComposing || e.nativeEvent?.isComposing ? value : normalizeTickerInput(value));
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !isComposing && !e.nativeEvent?.isComposing) handleAnalyze();
          }}
        />
        <button className="az-btn" onClick={() => handleAnalyze()} disabled={loading}>
          {loading ? '分析中...' : '分析'}
        </button>
      </div>

      {onDemandStatus?.status === 'queued' && !result ? (
        <div className="az-collecting" role="status">
          <strong>正在准备 {onDemandStatus.symbol} 的分析</strong>
          <span>数据写入后会自动检查更新；等待时间取决于数据源与队列{onDemandStatus.estimated_wait ? `（当前估计 ${onDemandStatus.estimated_wait}，仅供参考）` : ''}。</span>
        </div>
      ) : error && <div className="az-error">{error}</div>}

      <TechnicalLevelsPanel
        data={technicalData}
        loading={technicalLoading}
        error={technicalError}
      />

      {result && (
        <>
          {/* Symbol header */}
          <div className="az-symbol-row">
            {(() => {
              const co = getCompanyInfo(result.symbol);
              return co ? (
                <div className="az-company-info">
                  <img className="az-company-logo" src={co.logo} alt={co.en} onError={e => { e.target.style.display = 'none'; }} />
                  <div className="az-company-text">
                    <div className="az-symbol">{result.symbol} <span className="az-company-zh">{co.zh}</span></div>
                    <div className="az-company-tagline">{co.tagline}</div>
                  </div>
                </div>
              ) : (
                <div className="az-symbol">{result.symbol}</div>
              );
            })()}
            <div className="az-price">${result.price}</div>
            <div style={{ flex: 1 }} />
            <div style={{ minWidth: 200 }}>
              {result.dataMeta ? <IVGauge value={result.ivRank} /> : (
                <div className="az-iv-unavailable">IV Rank 暂不可用</div>
              )}
            </div>
            {result.earnings.date && (
              <div className={`az-earnings ${result.earnings.warning ? 'az-earnings-warn' : ''}`}>
                <span className="az-earnings-label">财报事件</span>
                <strong>{earningsTimingLabel(result.earnings.daysAway)}</strong>
                <small>{result.earnings.date}</small>
              </div>
            )}
          </div>

          <PartialDataNotice partialData={result.partialData} />
          <PartialDataNotice partialData={result.gexNotice} />
          <DataDetails metadata={result.gexMeta?.metadata} />
          {result.onDemandStatus?.status === 'queued' && (
            <PartialDataNotice partialData={{
              title: '后台数据补全中',
              message: `${result.symbol} 正在补齐价格与期权数据。页面会自动检查更新；当前继续展示已存在的数据${result.onDemandStatus.estimated_wait ? `（当前等待估计 ${result.onDemandStatus.estimated_wait}，仅供参考）` : ''}。`,
            }} />
          )}
          {result.onDemandStatus?.blockers?.length > 0 && (
            <PartialDataNotice partialData={{
              title: '部分字段暂未补全',
              message: `价格与期权结构继续可用；${result.onDemandStatus.blockers.map(item => item.field).join(' / ')} 当前被数据任务阻断，系统不会重复排队。`,
            }} />
          )}

          {/* Tab nav */}
          <div className="az-tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`az-tab-btn ${activeTab === t.id ? 'az-tab-btn-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="az-tab-content">
            {result.partialData && activeTab !== 1 && <UnavailableOptionsPanel symbol={result.symbol} />}
            {!result.partialData && activeTab === 0 && <Tab1Overview data={result} />}
            {activeTab === 1 && <Tab2Trend data={result} />}
            {!result.partialData && activeTab === 2 && <Tab3Options data={result} />}
            {!result.partialData && activeTab === 3 && <Tab4Signals data={result} />}
          </div>
        </>
      )}
    </div>
  );
}
