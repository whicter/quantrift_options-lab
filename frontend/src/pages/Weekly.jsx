import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { getWeeklyMock } from '../data/weeklyMock';
import { getDataStatus, getMetrics } from '../lib/api';
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

function gex(strikes, vals) {
  return strikes.map((strike, i) => ({ strike, gex: vals[i] }));
}

function buildWeeklyFromMetrics(symbol, metrics) {
  const ivRank = Math.round(Number(metrics.iv_rank ?? 0));
  const iv30 = Number(metrics.iv30 ?? 0) * 100;
  const hv30 = Number(metrics.hv30 ?? 0) * 100;
  const ivEdge = Number(metrics.iv_hv_diff ?? 0) * 100;
  const highIv = ivRank >= 50;
  const midIv = ivRank >= 30 && ivRank < 50;
  const basePrice = 100;
  const putWall = highIv ? 95 : 97;
  const callWall = highIv ? 108 : 105;

  return {
    symbol,
    week: `数据截至 ${String(metrics.date).slice(0, 10)}`,
    prevClose: basePrice * 0.99,
    weekClose: basePrice,
    weekChange: 1.0,
    weekHigh: basePrice * 1.02,
    weekLow: basePrice * 0.98,
    tone: `${symbol} 已有真实 IV 数据，但 weekly recap 的价格/GEX/资金流仍在数据化中。当前 IV Rank ${ivRank}%，IV30 ${iv30.toFixed(1)}%，HV30 ${hv30.toFixed(1)}%，${ivEdge >= 0 ? '隐含波动率高于历史波动率' : '隐含波动率低于历史波动率'}。`,
    cmeScore: highIv ? 42 : midIv ? 52 : 62,
    candles: [
      { day: 'Mon', open: 98.8, high: 100.2, low: 98.1, close: 99.4 },
      { day: 'Tue', open: 99.4, high: 100.8, low: 98.9, close: 100.1 },
      { day: 'Wed', open: 100.1, high: 101.2, low: 99.3, close: 100.5 },
      { day: 'Thu', open: 100.5, high: 102.0, low: 99.8, close: 101.1 },
      { day: 'Fri', open: 101.1, high: 101.6, low: 99.6, close: 100.0 },
    ],
    gammaByDay: Object.fromEntries(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => [
      day,
      {
        callWall,
        putWall,
        gexByStrike: gex([92,95,97,100,103,105,108,110], [-900000,-1400000,-600000,240000,720000,1100000,1600000,740000]),
      },
    ])),
    gammaMigration: '真实 option-chain GEX 尚未接入；当前为基于 IV 状态的 weekly 骨架。接入 price_history 与 gex_snapshots 后，此处将展示真实 Gamma Wall 迁徙。',
    maxPain: 100,
    fridayClose: 100,
    pinningNote: 'Max Pain / pinning 需要 option chain OI 数据；当前仅显示占位解释。',
    smartMoney: {
      cumulative: 0,
      divergence: false,
      dailyFlows: [
        { day: 'Mon', flow: 0 },
        { day: 'Tue', flow: 0 },
        { day: 'Wed', flow: 0 },
        { day: 'Thu', flow: 0 },
        { day: 'Fri', flow: 0 },
      ],
      note: '资金流需要成交量、OI delta 或授权 flow 数据；当前尚未接入。',
    },
    scenarios: {
      upTrigger: callWall,
      upTarget: callWall + 5,
      upWatch: highIv ? '高 IV 环境，向上突破也要注意 IV crush 和追高风险。' : 'IV 不高，若趋势确认可关注 debit spread / defined-risk 结构。',
      downTrigger: putWall,
      downTarget: putWall - 5,
      downWatch: '跌破下沿时先看价格历史与成交量确认；真实 price_history 接入后会自动替换。',
    },
  };
}

export default function Weekly() {
  const { symbol } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [quickLinks, setQuickLinks] = useState(['AAPL', 'SPY', 'QQQ']);
  const activeSection = parseInt(searchParams.get('sec') || '0');

  const setSection = s => setSearchParams({ sec: s });

  useEffect(() => {
    getDataStatus()
      .then(status => {
        if (status.expected_symbols?.length) setQuickLinks(status.expected_symbols.slice(0, 12));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!symbol) return;
    const sym = symbol.toUpperCase();
    const d = getWeeklyMock(sym);
    if (d) {
      setData(d);
      setError('');
      return;
    }

    getMetrics([sym])
      .then(metrics => {
        const row = metrics[sym];
        if (row) {
          setData(buildWeeklyFromMetrics(sym, row));
          setError('该标的已有真实 IV 数据；价格/GEX/资金流 weekly 模块仍在接入中。');
        } else {
          setData(null);
          setError(`暂无 ${sym} 的周回顾数据。若该标的在 watchlist 中，需要等 collector 写入后才可生成。`);
        }
      })
      .catch(() => {
        setData(null);
        setError(`无法读取 ${sym} 的真实数据状态，请稍后再试。`);
      });
  }, [symbol]);

  if (!symbol) {
    return (
      <div className="az-page">
        <div className="az-header">
          <div className="az-title">一周深度复盘</div>
          <div className="az-subtitle">从扫描器或分析页跳转至 /weekly/:symbol</div>
        </div>
        <div className="wk-quick-links">
          {quickLinks.map(sym => (
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
          {quickLinks.map(sym => (
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
