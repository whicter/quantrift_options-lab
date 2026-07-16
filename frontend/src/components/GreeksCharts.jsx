import { useEffect, useRef, useMemo } from 'react';
import useStrategyStore from '../store/useStrategyStore';
import { bsPrice, bsGreeks } from '../lib/blackscholes';
import { getChartColors } from '../lib/theme';

const GREEK_COLORS = ['#10d984', '#3b82f6', '#f5a623', '#9b6ef3'];

function calcGreekProfile(legs, prices, dteMultiplier, r, q, ivShift, greek) {
  return prices.map((S) => {
    let total = 0;
    for (const leg of legs) {
      const T = Math.max(0.001, (leg.dte * dteMultiplier) / 365);
      const v = Math.max(0.001, leg.iv + ivShift / 100);
      if (greek === 'price') {
        total += leg.dir * leg.qty * bsPrice(S, leg.K, T, r, q, v, leg.type);
      } else {
        const g = bsGreeks(S, leg.K, T, r, q, v, leg.type);
        total += leg.dir * leg.qty * g[greek];
      }
    }
    return total;
  });
}

function drawGreekChart(canvas, data) {
  const { prices, lines, spot } = data;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  if (W === 0 || H === 0) return;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const theme = getChartColors();

  const PAD = { top: 6, right: 6, bottom: 16, left: 34 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const allVals = lines.flatMap((l) => l);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad = (rawMax - rawMin) * 0.15 || 0.5;
  const yLo = rawMin - pad, yHi = rawMax + pad;

  const minS = prices[0], maxS = prices[prices.length - 1];
  const xMap = (s) => PAD.left + ((s - minS) / (maxS - minS)) * cW;
  const yMap = (v) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * cH;

  // BG
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach((t) => {
    const y = PAD.top + t * cH;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
  });

  // Y axis labels
  ctx.fillStyle = theme.axis;
  ctx.font = `9px -apple-system, sans-serif`;
  ctx.textAlign = 'right';
  [yLo, (yLo + yHi) / 2, yHi].forEach((v) => {
    const y = yMap(v);
    const label = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(3);
    ctx.fillText(label, PAD.left - 2, y + 3.5);
  });

  // X axis labels
  ctx.textAlign = 'center';
  [minS, spot, maxS].forEach((s) => {
    ctx.fillStyle = theme.axis;
    ctx.fillText(s.toFixed(0), xMap(s), H - PAD.bottom + 11);
  });

  // Zero line
  if (yLo < 0 && yHi > 0) {
    ctx.strokeStyle = theme.gridSoft;
    ctx.lineWidth = 1.5;
    const y0 = yMap(0);
    ctx.beginPath(); ctx.moveTo(PAD.left, y0); ctx.lineTo(W - PAD.right, y0); ctx.stroke();
  }

  // Spot line
  ctx.strokeStyle = theme.gridSoft;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  const xs = xMap(spot);
  ctx.beginPath(); ctx.moveTo(xs, PAD.top); ctx.lineTo(xs, H - PAD.bottom); ctx.stroke();
  ctx.setLineDash([]);

  // Greek lines
  const dashes = [[], [4, 3], [2, 4], [1, 3]];
  lines.forEach((vals, li) => {
    ctx.strokeStyle = GREEK_COLORS[li % GREEK_COLORS.length];
    ctx.lineWidth = li === 0 ? 1.8 : 1.2;
    ctx.globalAlpha = li === 0 ? 1 : 0.55;
    ctx.setLineDash(dashes[li]);
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = xMap(prices[i]), y = yMap(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

const GREEKS_CONFIG = [
  { key: 'price', label: 'Risk', desc: '价格风险曲线：随标的价格变化的持仓价值（含时间价值）。' },
  { key: 'theta', label: 'Theta', desc: '时间衰减：每日时间价值损耗。负值为买方，正值为卖方。' },
  { key: 'delta', label: 'Delta', desc: '方向敏感性：正股上涨 1 美元时的盈亏变化量。' },
  { key: 'vega',  label: 'Vega',  desc: 'IV 敏感性：隐含波动率变化 1% 时的盈亏变化。' },
  { key: 'gamma', label: 'Gamma', desc: 'Delta 变化速率：正 Gamma 有利于大幅移动，负 Gamma 相反。' },
  { key: 'rho',   label: 'Rho',   desc: '利率敏感性：利率变化 1% 时的盈亏变化（通常影响较小）。' },
];

export default function GreeksCharts() {
  const canvasRefs = useRef({});
  const { legs, spot, ivShift, rate, div, range, dteSlider, setDteSlider } = useStrategyStore();

  const maxDte = useMemo(() => Math.max(...legs.map((l) => l.dte), 1), [legs]);
  const currentDte = dteSlider ?? maxDte;

  const { prices, allLines } = useMemo(() => {
    const r = rate / 100;
    const q = div / 100;
    const N = 150;
    const lo = spot * (1 - range / 100);
    const hi = spot * (1 + range / 100);
    const prices = Array.from({ length: N }, (_, i) => lo + (hi - lo) * (i / (N - 1)));

    const dteFracs = [1.0, 0.5, 0.25, 0.0];
    const allLines = GREEKS_CONFIG.map(({ key }) =>
      dteFracs.map((f) => {
        const dte = currentDte * f;
        return calcGreekProfile(
          legs.map((l) => ({ ...l, dte: Math.max(0.1, l.dte * (dte / maxDte)) })),
          prices, 1, r, q, ivShift, key
        );
      })
    );

    return { prices, allLines };
  }, [legs, spot, ivShift, rate, div, range, currentDte, maxDte]);

  useEffect(() => {
    GREEKS_CONFIG.forEach(({ key }, gi) => {
      const canvas = canvasRefs.current[key];
      if (!canvas || !prices.length) return;
      drawGreekChart(canvas, { prices, lines: allLines[gi], spot });
    });
  }, [prices, allLines, spot]);

  useEffect(() => {
    const handleResize = () => {
      GREEKS_CONFIG.forEach(({ key }, gi) => {
        const canvas = canvasRefs.current[key];
        if (!canvas || !prices.length) return;
        drawGreekChart(canvas, { prices, lines: allLines[gi], spot });
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [prices, allLines, spot]);

  return (
    <div className="section-card">
      <div className="section-header">
        <div>
          <div className="section-label">The Greeks</div>
          <div className="section-title">Risk / Greeks 六联图</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim)' }}>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{currentDte}d</span>
          <input
            type="range"
            min={0}
            max={maxDte}
            value={currentDte}
            onChange={(e) => setDteSlider(Number(e.target.value))}
            style={{ width: 90 }}
          />
          <span>/{maxDte}d</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, padding: '6px 14px 4px', fontSize: 10, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
        {[
          { color: '#10d984', label: `${currentDte}d remaining`, da: '' },
          { color: '#3b82f6', label: `${Math.round(currentDte * 0.5)}d remaining`, da: '4,3' },
          { color: '#f5a623', label: `${Math.round(currentDte * 0.25)}d remaining`, da: '2,4' },
          { color: '#9b6ef3', label: 'Expiration', da: '1,3' },
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="18" height="4" style={{ flexShrink: 0 }}>
              <line x1="0" y1="2" x2="18" y2="2" stroke={item.color} strokeWidth={item.da ? 1.5 : 2} strokeDasharray={item.da} opacity={item.da ? 0.7 : 1} />
            </svg>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="greeks-grid">
        {GREEKS_CONFIG.map(({ key, label, desc }) => (
          <div key={key} className="greek-cell">
            <div className="greek-title">{label}</div>
            <canvas
              ref={(el) => (canvasRefs.current[key] = el)}
              className="greek-chart"
            />
            <div className="greek-desc">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
