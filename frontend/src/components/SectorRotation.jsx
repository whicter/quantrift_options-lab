import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSectorRotation } from '../lib/api';
import { buildRotationView } from '../lib/sectorRotation';

const signed = (v, d = 1) => (v == null || !Number.isFinite(Number(v)) ? '--' : `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(d)}`);

// Sector/theme ETF rotation (RRG-lite): a scatter that carries the flow picture,
// with a linked quadrant list that stays legible at any dot density. Hovering a
// dot or a chip highlights its twin — a chart library is not needed.
export default function SectorRotation() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState(null);
  useEffect(() => { getSectorRotation().then(setRaw).catch(() => setError(true)); }, []);

  if (!raw && !error) return <div className="market-loading">加载板块轮动…</div>;
  const view = buildRotationView(raw);
  if (error || view.status !== 'ready' || view.empty) {
    return <div className="market-loading">板块轮动暂不可用。</div>;
  }

  const hot = view.dots.find(d => d.symbol === hovered);

  return (
    <section className="rrg-section">
      <div className="rrg-headline">
        <h2>板块轮动 · Sector Rotation</h2>
        <span>简版 RRG · 26 板块/主题 ETF vs {view.benchmark}（20 日 {signed(view.benchmarkRet20)}%）</span>
      </div>
      <div className="rrg-qc">
        {view.groups.map(g => (
          <span key={g.id}><i className={`rrg-tone-${g.tone}`} />{g.label} {g.count}</span>
        ))}
      </div>

      <div className="rrg-layout">
        <div>
          <div className="rrg-plot">
            <div className="rrg-quad rrg-tr">领先 · 强且加速</div>
            <div className="rrg-quad rrg-br">走弱 · 强但减速</div>
            <div className="rrg-quad rrg-tl">改善 · 弱但加速</div>
            <div className="rrg-quad rrg-bl">落后 · 弱且减速</div>
            <div className="rrg-axis-x" />
            <div className="rrg-axis-y" />
            {view.dots.map(d => (
              <Link
                key={d.symbol}
                to={`/analyze?symbol=${encodeURIComponent(d.symbol)}`}
                className={`rrg-dot${d.symbol === hovered ? ' hot' : ''}`}
                style={{ left: `${d.x}%`, top: `${d.y}%` }}
                onMouseEnter={() => setHovered(d.symbol)}
                onMouseLeave={() => setHovered(null)}
              >
                <b className={`rrg-tone-${d.tone}`} />
                <span>{d.symbol}</span>
              </Link>
            ))}
            {hot && (
              <div className="rrg-tip" style={{ left: `${hot.x}%`, top: `${hot.y}%` }}>
                <b>{hot.symbol} · {hot.label}</b>
                <small>{view.groups.find(g => g.id === hot.quadrant)?.label} · rs {signed(hot.rs)} · 动量 {signed(hot.momentum)}</small>
                <small>20日 {signed(hot.ret20)}%{hot.iv_rank != null ? ` · IVR ${Math.round(hot.iv_rank)}` : ''}</small>
              </div>
            )}
          </div>
          <div className="rrg-axlbl"><span>← 相对弱</span><span>相对强 →</span></div>
        </div>

        <div className="rrg-list">
          {view.groups.map(g => (
            <div className={`rrg-card rrg-c-${g.tone}`} key={g.id}>
              <div className="rrg-card-head">
                <b>{g.label} {g.en}</b><em>{g.desc}</em><small>{g.count}</small>
              </div>
              <div className="rrg-chips">
                {g.sectors.map(s => (
                  <Link
                    key={s.symbol}
                    to={`/analyze?symbol=${encodeURIComponent(s.symbol)}`}
                    className={`rrg-chip${s.symbol === hovered ? ' hot' : ''}`}
                    onMouseEnter={() => setHovered(s.symbol)}
                    onMouseLeave={() => setHovered(null)}
                    title={`${s.label} · rs ${signed(s.rs)} · 动量 ${signed(s.momentum)}`}
                  >
                    {s.symbol} {s.label}<small>{signed(s.rs)}</small>
                  </Link>
                ))}
                {g.count === 0 && <span className="rrg-empty">今日无</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="rrg-foot">横轴=相对 {view.benchmark} 的 20 日强弱，纵轴=相对动量（强弱是否加速）。点标的→分析页；描述状态，非买卖建议。</p>
    </section>
  );
}
