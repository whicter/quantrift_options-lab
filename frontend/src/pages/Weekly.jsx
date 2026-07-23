import { useParams, useSearchParams, Link } from 'react-router-dom';
import { getWeeklyMock } from '../data/weeklyMock';
import Sec1Tone from './weekly/Sec1Tone';
import Sec2Gamma from './weekly/Sec2Gamma';
import Sec3Pinning from './weekly/Sec3Pinning';
import Sec4Money from './weekly/Sec4Money';
import Sec5Playbook from './weekly/Sec5Playbook';

const SECTIONS = [
  { id: 0, num: '01', label: '本周定调' },
  { id: 1, num: '02', label: 'Gamma迁徙' },
  { id: 2, num: '03', label: '交割偏离' },
  { id: 3, num: '04', label: '资金暗线' },
  { id: 4, num: '05', label: '下周分叉' },
];

export default function Weekly() {
  const { symbol } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = parseInt(searchParams.get('sec') || '0');
  const data = symbol ? getWeeklyMock(symbol) : null;
  const error = symbol && !data
    ? `暂无 ${symbol.toUpperCase()} 的周回顾数据，试试 AAPL / SPY / QQQ`
    : '';

  const setSection = s => setSearchParams({ sec: s });

  if (!symbol) {
    return (
      <div className="az-page">
        <div className="az-header">
          <div className="az-title">一周深度复盘</div>
          <div className="az-subtitle">从扫描器或分析页跳转至 /weekly/:symbol</div>
        </div>
        <div className="wk-quick-links">
          {['AAPL', 'SPY', 'QQQ'].map(sym => (
            <Link key={sym} to={`/weekly/${sym}`} className="wk-quick-link">{sym}</Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="az-page">
      {/* Header */}
      <div className="wk-page-header">
        <div>
          <div className="wk-page-title">一周深度复盘</div>
          {data && <div className="wk-page-meta">{symbol.toUpperCase()} · {data.week}</div>}
        </div>
        <div className="wk-sym-links">
          {['AAPL', 'SPY', 'QQQ'].map(sym => (
            <Link
              key={sym}
              to={`/weekly/${sym}?sec=0`}
              className={`wk-sym-link ${symbol?.toUpperCase() === sym ? 'active' : ''}`}
            >
              {sym}
            </Link>
          ))}
        </div>
      </div>

      {error && <div className="az-error">{error}</div>}

      {data && (
        <>
          {/* Section nav */}
          <div className="wk-section-nav">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                className={`wk-sec-btn ${activeSection === s.id ? 'active' : ''}`}
                onClick={() => setSection(s.id)}
              >
                <span className="wk-sec-num">{s.num}</span>
                <span className="wk-sec-label">{s.label}</span>
              </button>
            ))}
            <div className="wk-sec-progress">
              {String(activeSection + 1).padStart(2, '0')} / 05
            </div>
          </div>

          {/* Section content */}
          <div className="wk-content">
            {activeSection === 0 && <Sec1Tone data={data} />}
            {activeSection === 1 && <Sec2Gamma data={data} />}
            {activeSection === 2 && <Sec3Pinning data={data} />}
            {activeSection === 3 && <Sec4Money data={data} />}
            {activeSection === 4 && <Sec5Playbook data={data} />}
          </div>

          {/* Prev / Next nav */}
          <div className="wk-nav-row">
            <button
              className="wk-nav-btn"
              disabled={activeSection === 0}
              onClick={() => setSection(activeSection - 1)}
            >
              ← {activeSection > 0 ? SECTIONS[activeSection - 1].label : ''}
            </button>
            <button
              className="wk-nav-btn wk-nav-btn-next"
              disabled={activeSection === SECTIONS.length - 1}
              onClick={() => setSection(activeSection + 1)}
            >
              {activeSection < SECTIONS.length - 1 ? SECTIONS[activeSection + 1].label : ''} →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
