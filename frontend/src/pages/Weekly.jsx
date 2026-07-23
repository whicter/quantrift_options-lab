import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { getDataStatus, getWeekly } from '../lib/api';
import { normalizeTickerInput, sanitizeTickerForSubmit } from '../lib/symbolInput';
import Sec1Tone from './weekly/Sec1Tone';
import Sec2Gamma from './weekly/Sec2Gamma';
import Sec3Pinning from './weekly/Sec3Pinning';
import Sec4Money from './weekly/Sec4Money';
import Sec5Playbook from './weekly/Sec5Playbook';

const SECTIONS = [
  { id: 0, num: '01', label: '本周定调' },
  { id: 1, num: '02', label: 'Gamma结构' },
  { id: 2, num: '03', label: 'Max Pain距离' },
  { id: 3, num: '04', label: '未平仓量变化' },
  { id: 4, num: '05', label: '下周条件情景' },
];

const COMMON_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMZN', 'META', 'MSFT'];

function toViewModel(result) {
  return {
    symbol: result.symbol,
    week: `${result.period.start} - ${result.period.end}`,
    prevClose: result.price.previous_close,
    weekClose: result.price.close,
    weekChange: result.price.change_pct,
    weekHigh: result.price.high,
    weekLow: result.price.low,
    candles: result.price.candles,
    priceMeta: { source: result.price.source, latestDate: result.period.end, freshness: 'fresh', isStale: false },
    tone: result.tone,
    modelScore: result.score,
    gamma: result.gamma,
    pinning: result.pinning,
    positioning: result.positioning,
    scenarios: result.scenarios,
  };
}

export default function Weekly() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [quickLinks, setQuickLinks] = useState(COMMON_SYMBOLS);
  const selectedSymbol = normalizeTickerInput(symbol || 'SPY');
  const [symbolInput, setSymbolInput] = useState(selectedSymbol);
  const activeSection = Math.max(0, Math.min(4, Number(searchParams.get('sec') || 0)));
  const setSection = section => setSearchParams({ sec: section });

  function selectSymbol(value) {
    const nextSymbol = sanitizeTickerForSubmit(value);
    if (!nextSymbol) return;
    setSymbolInput(nextSymbol);
    navigate(`/weekly/${nextSymbol}?sec=0`);
  }

  useEffect(() => {
    getDataStatus().then(status => {
      const symbols = status.universe?.symbols || status.expected_symbols;
      if (symbols?.length) setQuickLinks([...new Set([...COMMON_SYMBOLS, ...symbols])].slice(0, 12));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    getWeekly(selectedSymbol)
      .then(result => {
        if (cancelled) return;
        if (result.status !== 'ready') {
          setData(null);
          setError(`${selectedSymbol} 至少需要 6 个有效交易日的价格历史，才能计算本周与前一收盘的比较。`);
          return;
        }
        setData(toViewModel(result));
        setError('');
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setError(`暂时无法生成 ${selectedSymbol} 的周度快照。请查看数据状态或稍后重试。`);
      });
    return () => { cancelled = true; };
  }, [selectedSymbol]);

  return (
    <div className="az-page">
      <div className="wk-page-header">
        <div>
          <div className="wk-page-title">周度市场快照</div>
          {data && <div className="wk-page-meta">{data.symbol} · {data.week}</div>}
        </div>
        <div className="wk-symbol-controls">
          <form className="wk-symbol-search" onSubmit={event => { event.preventDefault(); selectSymbol(symbolInput); }}>
            <input
              value={symbolInput}
              onChange={event => setSymbolInput(normalizeTickerInput(event.target.value))}
              placeholder="输入代码"
              aria-label="输入复盘标的"
            />
            <button type="submit">查看</button>
          </form>
          <div className="wk-sym-links">
            {quickLinks.map(item => (
              <Link key={item} to={`/weekly/${item}?sec=0`} onClick={() => setSymbolInput(item)} className={`wk-sym-link ${selectedSymbol === item ? 'active' : ''}`}>{item}</Link>
            ))}
          </div>
        </div>
      </div>
      {error && <div className="az-error">{error}</div>}
      {data && (
        <>
          <div className="wk-section-nav">
            {SECTIONS.map(section => (
              <button key={section.id} className={`wk-sec-btn ${activeSection === section.id ? 'active' : ''}`} onClick={() => setSection(section.id)}>
                <span className="wk-sec-num">{section.num}</span><span className="wk-sec-label">{section.label}</span>
              </button>
            ))}
            <div className="wk-sec-progress">{String(activeSection + 1).padStart(2, '0')} / 05</div>
          </div>
          <div className="wk-content">
            {activeSection === 0 && <Sec1Tone data={data} />}
            {activeSection === 1 && <Sec2Gamma data={data} />}
            {activeSection === 2 && <Sec3Pinning data={data} />}
            {activeSection === 3 && <Sec4Money data={data} />}
            {activeSection === 4 && <Sec5Playbook data={data} />}
          </div>
          <div className="wk-nav-row">
            <button className="wk-nav-btn" disabled={activeSection === 0} onClick={() => setSection(activeSection - 1)}>
              {activeSection > 0 ? `← ${SECTIONS[activeSection - 1].label}` : ''}
            </button>
            <button className="wk-nav-btn wk-nav-btn-next" disabled={activeSection === 4} onClick={() => setSection(activeSection + 1)}>
              {activeSection < 4 ? `${SECTIONS[activeSection + 1].label} →` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
