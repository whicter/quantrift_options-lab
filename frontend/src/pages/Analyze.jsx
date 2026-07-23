import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMockAnalysis } from '../data/mockAnalysis';
import Tab1Overview from './analyze/Tab1Overview';
import Tab2Trend from './analyze/Tab2Trend';
import Tab3Options from './analyze/Tab3Options';
import Tab4Signals from './analyze/Tab4Signals';
import TechnicalLevelsPanel from '../components/TechnicalLevelsPanel';
import { getTechnicalLevels } from '../lib/technicalLevels';

const TABS = [
  { id: 0, label: '今日概览' },
  { id: 1, label: '日内变化' },
  { id: 2, label: '数据解读' },
  { id: 3, label: '信号追踪' },
];

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
  const initialSymbol = (searchParams.get('symbol') || '').toUpperCase();
  const [input, setInput] = useState(initialSymbol);
  const [result, setResult] = useState(() => getMockAnalysis(initialSymbol));
  const [technicalData, setTechnicalData] = useState(null);
  const [technicalError, setTechnicalError] = useState('');
  const [technicalLoading, setTechnicalLoading] = useState(Boolean(initialSymbol));
  const [technicalRequest, setTechnicalRequest] = useState(
    () => initialSymbol ? { symbol: initialSymbol, key: 0 } : null,
  );
  const [error, setError] = useState('');
  const activeTab = parseInt(searchParams.get('tab') || '0');

  const setTab = t => {
    const sym = searchParams.get('symbol');
    setSearchParams(sym ? { symbol: sym, tab: t } : { tab: t });
  };

  useEffect(() => {
    if (!technicalRequest) return undefined;
    let cancelled = false;
    getTechnicalLevels(technicalRequest.symbol)
      .then(data => {
        if (!cancelled) setTechnicalData(data);
      })
      .catch(fetchError => {
        if (!cancelled) setTechnicalError(fetchError.message);
      })
      .finally(() => {
        if (!cancelled) setTechnicalLoading(false);
      });
    return () => { cancelled = true; };
  }, [technicalRequest]);

  function handleAnalyze() {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    setTechnicalLoading(true);
    setError('');
    setTechnicalError('');
    setTechnicalData(null);
    setSearchParams({ symbol: sym, tab: activeTab });
    const mockData = getMockAnalysis(sym);
    setResult(mockData);
    if (!mockData) setError(`${sym} 暂无旧版策略 mock；下方仍会加载真实技术结构。`);
    setTechnicalRequest({ symbol: sym, key: Date.now() });
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
        <button className="az-btn" onClick={handleAnalyze} disabled={technicalLoading}>
          {technicalLoading ? '分析中...' : '分析'}
        </button>
      </div>

      {error && <div className="az-error">{error}</div>}

      <TechnicalLevelsPanel
        data={technicalData}
        loading={technicalLoading}
        error={technicalError}
      />

      {result && (
        <>
          {/* Symbol header */}
          <div className="az-symbol-row">
            <div className="az-symbol">{result.symbol}</div>
            <div className="az-price">${result.price}</div>
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
