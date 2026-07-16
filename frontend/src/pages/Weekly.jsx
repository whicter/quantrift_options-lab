import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { getDataStatus, getWeekly } from '../lib/api';
import Sec1Tone from './weekly/Sec1Tone';
import Sec2Gamma from './weekly/Sec2Gamma';
import Sec3Pinning from './weekly/Sec3Pinning';
import Sec4Money from './weekly/Sec4Money';
import Sec5Playbook from './weekly/Sec5Playbook';

const SECTIONS = [
  { id: 0, num: '01', label: '本周定调' },
  { id: 1, num: '02', label: 'Gamma迁徙' },
  { id: 2, num: '03', label: '交割偏离' },
  { id: 3, num: '04', label: '仓位变化' },
  { id: 4, num: '05', label: '下周分叉' },
];

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
    cmeScore: result.score,
    gamma: result.gamma,
    pinning: result.pinning,
    positioning: result.positioning,
    scenarios: result.scenarios,
  };
}

export default function Weekly() {
  const { symbol } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [quickLinks, setQuickLinks] = useState(['AAPL', 'SPY', 'QQQ']);
  const activeSection = Math.max(0, Math.min(4, Number(searchParams.get('sec') || 0)));
  const setSection = section => setSearchParams({ sec: section });

  useEffect(() => {
    getDataStatus().then(status => {
      const symbols = status.universe?.symbols || status.expected_symbols;
      if (symbols?.length) setQuickLinks(symbols.slice(0, 12));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    getWeekly(symbol)
      .then(result => {
        if (cancelled) return;
        if (result.status !== 'ready') {
          setData(null);
          setError(`${symbol.toUpperCase()} 至少需要 6 根真实日线才能生成周复盘。`);
          return;
        }
        setData(toViewModel(result));
        setError('');
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setError(`无法读取 ${symbol.toUpperCase()} 的真实周复盘数据。`);
      });
    return () => { cancelled = true; };
  }, [symbol]);

  if (!symbol) {
    return (
      <div className="az-page">
        <div className="az-header">
          <div className="az-title">一周深度复盘</div>
          <div className="az-subtitle">选择标的，读取真实周 K、Gamma、Max Pain 与 ΔOI</div>
        </div>
        <div className="wk-quick-links">
          {quickLinks.map(item => <Link key={item} to={`/weekly/${item}`} className="wk-quick-link">{item}</Link>)}
        </div>
      </div>
    );
  }

  return (
    <div className="az-page">
      <div className="wk-page-header">
        <div>
          <div className="wk-page-title">一周深度复盘</div>
          {data && <div className="wk-page-meta">{data.symbol} · {data.week}</div>}
        </div>
        <div className="wk-sym-links">
          {quickLinks.map(item => (
            <Link key={item} to={`/weekly/${item}?sec=0`} className={`wk-sym-link ${symbol.toUpperCase() === item ? 'active' : ''}`}>{item}</Link>
          ))}
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
