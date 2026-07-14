import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMockAnalysis } from '../data/mockAnalysis';
import { getCompanyInfo } from '../data/companyInfo';
import { getDataStatus, getMetrics, getPrices } from '../lib/api';
import Tab1Overview from './analyze/Tab1Overview';
import Tab2Trend from './analyze/Tab2Trend';
import Tab3Options from './analyze/Tab3Options';
import Tab4Signals from './analyze/Tab4Signals';

const TABS = [
  { id: 0, label: '今日概览' },
  { id: 1, label: '日内变化' },
  { id: 2, label: '数据解读' },
  { id: 3, label: '信号追踪' },
];

function applyMetrics(data, metrics) {
  if (!data || !metrics) return data;
  const iv30 = metrics.iv30 == null ? data.iv30 : Number(metrics.iv30) * 100;
  const hv30 = metrics.hv30 == null ? data.hv30 : Number(metrics.hv30) * 100;
  const hv60 = metrics.hv60 == null ? data.hv60 : Number(metrics.hv60) * 100;
  const ivHvDiff = metrics.iv_hv_diff == null ? data.ivHvDiff : Number(metrics.iv_hv_diff) * 100;
  const earningsDate = metrics.earnings_date ? String(metrics.earnings_date).slice(0, 10) : data.earnings?.date;

  return {
    ...data,
    ivRank: metrics.iv_rank == null ? data.ivRank : Math.round(Number(metrics.iv_rank)),
    ivPercentile: metrics.iv_percentile == null ? data.ivPercentile : Math.round(Number(metrics.iv_percentile)),
    iv30: Number(iv30.toFixed(1)),
    hv30: Number(hv30.toFixed(1)),
    hv60: Number(hv60.toFixed(1)),
    ivHvDiff: Number(ivHvDiff.toFixed(1)),
    dataMeta: {
      date: metrics.date ? String(metrics.date).slice(0, 10) : null,
      source: metrics.source,
    },
    earnings: {
      ...data.earnings,
      date: earningsDate,
    },
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

function applyPriceHistory(data, priceData) {
  const priceHistory = normalizePriceHistory(priceData);
  if (priceHistory.length === 0) return data;

  const latest = priceHistory[priceHistory.length - 1];
  const rvol = calcRVol(priceHistory);

  return {
    ...data,
    price: Number(latest.close.toFixed(2)),
    priceHistory,
    priceMeta: {
      source: priceData.source,
      latestDate: String(priceData.latest_date || latest.date).slice(0, 10),
      count: priceData.count,
    },
    trend: {
      ...data.trend,
      rvol: rvol == null ? data.trend.rvol : Number(rvol.toFixed(2)),
    },
  };
}

function buildMissingMessage(symbol, status) {
  if (!status) {
    return `暂无 ${symbol} 的真实数据。数据覆盖状态暂时不可用，请稍后再试。`;
  }
  if (status.expected_symbols?.includes(symbol)) {
    return `暂无 ${symbol} 的真实数据：该标的已在 watchlist 中，但 collector 尚未写入最新记录。下次收盘采集后会自动可用。`;
  }
  return `暂无 ${symbol} 的真实数据：该标的还不在 collector watchlist 中。加入 watchlist 后，下一次收盘采集完成才会显示。`;
}

function IVGauge({ value }) {
  const color = value >= 50 ? 'var(--red)' : value >= 30 ? 'var(--yellow)' : 'var(--green)';
  const label = value >= 50 ? '高IV — 卖方有优势' : value >= 30 ? '中等IV' : '低IV — 买方有优势';
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
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataStatus, setDataStatus] = useState(null);
  const activeTab = parseInt(searchParams.get('tab') || '0');

  const setTab = t => {
    const sym = searchParams.get('symbol');
    setSearchParams(sym ? { symbol: sym, tab: t } : { tab: t });
  };

  useEffect(() => {
    const sym = searchParams.get('symbol');
    if (sym) {
      setInput(sym.toUpperCase());
      handleAnalyze(sym);
    }
    getDataStatus().then(setDataStatus).catch(() => {});
  }, []);

  async function handleAnalyze(forcedSymbol) {
    const sym = (forcedSymbol || input).trim().toUpperCase();
    if (!sym) return;
    setLoading(true); setError('');

    try {
      const [metricsBySymbol, status, priceData] = await Promise.all([
        getMetrics([sym]),
        dataStatus ? Promise.resolve(dataStatus) : getDataStatus().catch(() => null),
        getPrices(sym, 60).catch(() => null),
      ]);
      if (status && !dataStatus) setDataStatus(status);

      const metrics = metricsBySymbol[sym];
      if (!metrics) {
        setError(buildMissingMessage(sym, status));
        setResult(null);
        return;
      }

      const mock = getMockAnalysis(sym) || getMockAnalysis('SPY');
      const data = applyPriceHistory(applyMetrics({ ...mock, symbol: sym }, metrics), priceData);
      setResult(data);
      setSearchParams({ symbol: sym, tab: activeTab });
    } catch {
      const fallback = getMockAnalysis(sym);
      if (fallback) {
        setResult(fallback);
        setSearchParams({ symbol: sym, tab: activeTab });
        setError('真实数据 API 暂时不可用，当前显示本地示例结构。');
      } else {
        setResult(null);
        setError(`真实数据 API 暂时不可用，无法确认 ${sym} 是否已采集。`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="az-page">
      <div className="az-header">
        <div className="az-title">盘中即时分析</div>
        <div className="az-subtitle">输入标的，查看 GEX 结构、趋势格局、期权信号与筹码位置</div>
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
            {result.dataMeta && (
              <div className="az-data-meta">
                {result.dataMeta.source} · {result.dataMeta.date}
                {result.priceMeta && ` · price ${result.priceMeta.source} ${result.priceMeta.latestDate}`}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <div style={{ minWidth: 200 }}>
              <IVGauge value={result.ivRank} />
            </div>
            {result.earnings.date && (
              <div className={`az-earnings ${result.earnings.warning ? 'az-earnings-warn' : ''}`}>
                财报 {result.earnings.date}
                {result.earnings.daysAway && ` (${result.earnings.daysAway}天后)`}
              </div>
            )}
          </div>

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
            {activeTab === 0 && <Tab1Overview data={result} />}
            {activeTab === 1 && <Tab2Trend data={result} />}
            {activeTab === 2 && <Tab3Options data={result} />}
            {activeTab === 3 && <Tab4Signals data={result} />}
          </div>
        </>
      )}
    </div>
  );
}
