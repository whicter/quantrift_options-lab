import { useRef, useEffect } from 'react';
import { getCompanyInfo } from '../../data/companyInfo';
import { getChartColors } from '../../lib/theme';

function CandleChart({ candles }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.parentElement.getBoundingClientRect().width;
      const H = 100;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const theme = getChartColors();
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);

      const PAD = { top: 10, right: 8, bottom: 20, left: 8 };
      const cW = W - PAD.left - PAD.right;
      const cH = H - PAD.top - PAD.bottom;
      const n = candles.length;
      const gap = cW / n;
      const bW = gap * 0.5;

      const prices = candles.flatMap(c => [c.high, c.low]);
      const minP = Math.min(...prices) * 0.9992;
      const maxP = Math.max(...prices) * 1.0008;
      const sy = v => PAD.top + cH - (v - minP) / (maxP - minP) * cH;

      candles.forEach((c, i) => {
        const x = PAD.left + gap * i + gap / 2;
        const bull = c.close >= c.open;
        const col = bull ? '#22c55e' : '#ef4444';

        // Wick
        ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.moveTo(x, sy(c.high)); ctx.lineTo(x, sy(c.low)); ctx.stroke();

        // Body
        const top = sy(Math.max(c.open, c.close));
        const bot = sy(Math.min(c.open, c.close));
        const bodyH = Math.max(bot - top, 1);
        ctx.fillStyle = col;
        ctx.fillRect(x - bW / 2, top, bW, bodyH);

        // Day label
        ctx.fillStyle = theme.axis; ctx.font = '9px monospace'; ctx.textAlign = 'center';
        ctx.fillText(c.day, x, H - PAD.bottom + 12);
      });
    };
    draw();
    const obs = new ResizeObserver(draw);
    const el = canvasRef.current?.parentElement;
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [candles]);
  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

function CMEGauge({ score }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 180, H = 110;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const theme = getChartColors();
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H - 18, r = 70;
    // Background arc zones
    const zones = [
      { from: 0, to: 30, color: 'rgba(239,68,68,0.5)' },
      { from: 30, to: 50, color: 'rgba(234,179,8,0.4)' },
      { from: 50, to: 70, color: 'rgba(34,197,94,0.3)' },
      { from: 70, to: 100, color: 'rgba(34,197,94,0.55)' },
    ];
    zones.forEach(({ from, to, color }) => {
      const aFrom = Math.PI + (from / 100) * Math.PI;
      const aTo = Math.PI + (to / 100) * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, r, aFrom, aTo);
      ctx.arc(cx, cy, r - 16, aTo, aFrom, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    });

    // Tick marks
    ctx.strokeStyle = theme.bg; ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach(v => {
      const a = Math.PI + (v / 100) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx + (r - 17) * Math.cos(a), cy + (r - 17) * Math.sin(a));
      ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      ctx.stroke();
    });

    // Labels
    ctx.fillStyle = theme.axis; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    [[0, '恐慌'], [50, '中性'], [100, '贪婪']].forEach(([v, label]) => {
      const a = Math.PI + (v / 100) * Math.PI;
      const rr = r + 10;
      ctx.fillText(label, cx + rr * Math.cos(a), cy + rr * Math.sin(a) + 3);
    });

    // Needle
    const needleA = Math.PI + (score / 100) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx + 8 * Math.cos(needleA + Math.PI / 2), cy + 8 * Math.sin(needleA + Math.PI / 2));
    ctx.lineTo(cx + (r - 6) * Math.cos(needleA), cy + (r - 6) * Math.sin(needleA));
    ctx.lineTo(cx + 8 * Math.cos(needleA - Math.PI / 2), cy + 8 * Math.sin(needleA - Math.PI / 2));
    ctx.closePath();
    ctx.fillStyle = theme.text; ctx.fill();

    // Center hub
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#94a3b8'; ctx.fill();

    // Score text
    ctx.fillStyle = theme.text; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
    ctx.fillText(score, cx, cy - r / 2 - 4);
    ctx.fillStyle = theme.axis; ctx.font = '9px monospace';
    ctx.fillText('情绪指数', cx, cy - r / 2 + 10);
  }, [score]);
  return <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto' }} />;
}

export default function Sec1Tone({ data }) {
  const { weekClose, prevClose, weekChange, weekHigh, weekLow, week, tone, cmeScore, candles, symbol, priceMeta } = data;
  const bull = weekChange >= 0;
  const co = getCompanyInfo(symbol);
  const priceStale = Boolean(priceMeta?.isStale || priceMeta?.freshness === 'stale');

  return (
    <div className="wk-section">
      {/* Header row */}
      <div className="wk-tone-header">
        <div className="wk-company-header">
          {co && <img className="wk-company-logo" src={co.logo} alt={co.en} onError={e => { e.target.style.display = 'none'; }} />}
          <div>
            <div className="wk-sym">{symbol}{co && <span className="wk-company-zh"> {co.zh}</span>}</div>
            {co && <div className="wk-company-tagline">{co.tagline}</div>}
            <div className="wk-week">{week}</div>
            <div className={`wk-price-source ${priceMeta ? (priceStale ? 'stale' : 'fresh') : 'missing'}`}>
              {priceMeta
                ? `price_history ${priceStale ? 'stale' : priceMeta.source} ${priceMeta.latestDate}`
                : 'price_history missing · 示例 weekly shell'}
            </div>
          </div>
        </div>
        <div className="wk-price-block">
          <div className="wk-close">${weekClose}</div>
          <div className={`wk-change ${bull ? 'c-green' : 'c-red'}`}>
            {bull ? '+' : ''}{weekChange.toFixed(2)}% 本周
          </div>
        </div>
        <div className="wk-hl">
          <div><span className="wk-hl-label">周高</span><span className="wk-hl-val c-green">${weekHigh}</span></div>
          <div><span className="wk-hl-label">周低</span><span className="wk-hl-val c-red">${weekLow}</span></div>
          <div><span className="wk-hl-label">上周收</span><span className="wk-hl-val">${prevClose}</span></div>
        </div>
      </div>

      {/* Charts row */}
      <div className="wk-tone-charts">
        <div className="az-card wk-candle-wrap" style={{ flex: 2 }}>
          <div className="az-card-title">日K线（本周）</div>
          <CandleChart candles={candles} />
        </div>
        <div className="az-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="az-card-title" style={{ alignSelf: 'flex-start' }}>综合市场状态</div>
          <CMEGauge score={cmeScore} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {cmeScore < 30 ? '弱势' : cmeScore < 50 ? '偏弱' : cmeScore < 70 ? '中性偏强' : '强势'}
          </div>
        </div>
      </div>

      {/* Tone text */}
      <div className="wk-tone-text">{tone}</div>
    </div>
  );
}
