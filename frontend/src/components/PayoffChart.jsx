import { useEffect, useRef, useMemo } from 'react';
import useStrategyStore from '../store/useStrategyStore';
import { bsPrice } from '../lib/blackscholes';
import { getChartColors } from '../lib/theme';

const COLORS = {
  expiry: '#10d984',
  scenario: '#3b82f6',
  bep: '#f5a623',
};

function drawChart(canvas, data) {
  const { prices, expiryPL, scenarioPL, beps, spot, minPL, maxPL } = data;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const theme = getChartColors();

  const PAD = { top: 16, right: 14, bottom: 30, left: 52 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const minS = prices[0], maxS = prices[prices.length - 1];
  const pad = (maxPL - minPL) * 0.08 || 10;
  const yLo = minPL - pad, yHi = maxPL + pad;

  const xMap = (s) => PAD.left + ((s - minS) / (maxS - minS)) * cW;
  const yMap = (v) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * cH;

  // Background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const v = yLo + ((yHi - yLo) / ySteps) * i;
    const y = yMap(v);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    // Y label
    ctx.fillStyle = theme.axis;
    ctx.font = `10px -apple-system, sans-serif`;
    ctx.textAlign = 'right';
    const label = v >= 1000 ? `${(v/1000).toFixed(1)}k` : v <= -1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0);
    ctx.fillText(label, PAD.left - 4, y + 3.5);
  }

  // X axis labels
  const xSteps = 5;
  ctx.textAlign = 'center';
  for (let i = 0; i <= xSteps; i++) {
    const s = minS + ((maxS - minS) / xSteps) * i;
    const x = xMap(s);
    ctx.fillStyle = theme.axis;
    ctx.fillText(s.toFixed(0), x, H - PAD.bottom + 14);
    ctx.strokeStyle = theme.grid;
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke();
  }

  // Zero line
  if (yLo < 0 && yHi > 0) {
    const y0 = yMap(0);
    ctx.strokeStyle = theme.gridSoft;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PAD.left, y0); ctx.lineTo(W - PAD.right, y0); ctx.stroke();
  }

  // Spot vertical line
  const xSpot = xMap(spot);
  ctx.strokeStyle = theme.gridSoft;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(xSpot, PAD.top); ctx.lineTo(xSpot, H - PAD.bottom); ctx.stroke();
  ctx.setLineDash([]);

  // BEP lines
  beps.forEach((bep) => {
    if (bep < minS || bep > maxS) return;
    const x = xMap(bep);
    ctx.strokeStyle = COLORS.bep;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.bep;
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(bep.toFixed(1), x, PAD.top - 2);
  });

  // Scenario P/L line (dashed blue)
  if (scenarioPL) {
    ctx.strokeStyle = COLORS.scenario;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    scenarioPL.forEach((v, i) => {
      const x = xMap(prices[i]), y = yMap(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Expiry P/L line (solid green) with fill
  // Fill above/below zero
  const path = new Path2D();
  expiryPL.forEach((v, i) => {
    const x = xMap(prices[i]), y = yMap(v);
    i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
  });

  // Green fill above zero
  ctx.save();
  const clipAbove = new Path2D(path);
  const y0 = yMap(0);
  clipAbove.lineTo(xMap(prices[prices.length - 1]), y0);
  clipAbove.lineTo(xMap(prices[0]), y0);
  clipAbove.closePath();
  ctx.clip(clipAbove);
  ctx.fillStyle = 'rgba(16,217,132,0.07)';
  ctx.fillRect(PAD.left, PAD.top, cW, cH);
  ctx.restore();

  // Red fill below zero
  ctx.save();
  const clipBelow = new Path2D(path);
  clipBelow.lineTo(xMap(prices[prices.length - 1]), yMap(yLo));
  clipBelow.lineTo(xMap(prices[0]), yMap(yLo));
  clipBelow.closePath();
  ctx.clip(clipBelow);
  ctx.fillStyle = 'rgba(242,86,86,0.07)';
  ctx.fillRect(PAD.left, PAD.top, cW, cH);
  ctx.restore();

  // Draw expiry line
  ctx.strokeStyle = COLORS.expiry;
  ctx.lineWidth = 2;
  ctx.beginPath();
  expiryPL.forEach((v, i) => {
    const x = xMap(prices[i]), y = yMap(v);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Spot price dot on expiry line
  const spotIdx = Math.round((prices.length - 1) / 2);
  const spotY = yMap(expiryPL[spotIdx]);
  ctx.fillStyle = COLORS.expiry;
  ctx.beginPath(); ctx.arc(xSpot, spotY, 3.5, 0, Math.PI * 2); ctx.fill();
}

export default function PayoffChart() {
  const canvasRef = useRef(null);
  const { legs, spot, ivShift, rate, div, range, contracts } = useStrategyStore();

  const { prices, expiryPL, scenarioPL, beps, minPL, maxPL } = useMemo(() => {
    if (!legs.length) return { prices: [], expiryPL: [], scenarioPL: [], beps: [], minPL: -100, maxPL: 100 };

    const r = rate / 100;
    const q = div / 100;
    const ivS = ivShift / 100;
    const N = 200;
    const lo = spot * (1 - range / 100);
    const hi = spot * (1 + range / 100);

    // Net premium at entry (at spot, original IV)
    let netPremium = 0;
    for (const leg of legs) {
      const T = leg.dte / 365;
      const p = bsPrice(spot, leg.K, T, r, q, leg.iv, leg.type);
      netPremium += leg.dir * leg.qty * p;
    }

    const prices = Array.from({ length: N }, (_, i) => lo + (hi - lo) * (i / (N - 1)));

    const expiryPL = prices.map((S) => {
      let val = 0;
      for (const leg of legs) {
        const intrinsic = leg.type === 'call' ? Math.max(0, S - leg.K) : Math.max(0, leg.K - S);
        val += leg.dir * leg.qty * intrinsic;
      }
      return (val - netPremium) * contracts;
    });

    const scenarioPL = prices.map((S) => {
      let val = 0;
      for (const leg of legs) {
        const T = Math.max(0.001, leg.dte / 365);
        const v = Math.max(0.001, leg.iv + ivS);
        val += leg.dir * leg.qty * bsPrice(S, leg.K, T, r, q, v, leg.type);
      }
      return (val - netPremium) * contracts;
    });

    // Find breakevens
    const beps = [];
    for (let i = 1; i < expiryPL.length; i++) {
      if (Math.sign(expiryPL[i]) !== Math.sign(expiryPL[i - 1])) {
        beps.push((prices[i - 1] + prices[i]) / 2);
      }
    }

    const allPL = [...expiryPL, ...scenarioPL];
    return {
      prices, expiryPL, scenarioPL, beps,
      minPL: Math.min(...allPL),
      maxPL: Math.max(...allPL),
    };
  }, [legs, spot, ivShift, rate, div, range, contracts]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !prices.length) return;
    const obs = new ResizeObserver(() => {
      drawChart(canvas, { prices, expiryPL, scenarioPL, beps, spot, minPL, maxPL });
    });
    obs.observe(canvas.parentElement);
    drawChart(canvas, { prices, expiryPL, scenarioPL, beps, spot, minPL, maxPL });
    return () => obs.disconnect();
  }, [prices, expiryPL, scenarioPL, beps, spot, minPL, maxPL]);

  return (
    <div className="section-card">
      <div className="section-header">
        <div>
          <div className="section-label">Payoff</div>
          <div className="section-title">主损益图</div>
        </div>
      </div>
      <div className="payoff-canvas-wrap">
        <canvas ref={canvasRef} className="payoff-chart" />
      </div>
      <div className="payoff-legend">
        <div className="legend-item">
          <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="#10d984" strokeWidth="2"/></svg>
          <span>到期线 Expiry</span>
        </div>
        <div className="legend-item">
          <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,3"/></svg>
          <span>当前情景 Scenario</span>
        </div>
        <div className="legend-item">
          <svg width="22" height="4"><line x1="0" y1="2" x2="22" y2="2" stroke="#f5a623" strokeWidth="1.5" strokeDasharray="3,4"/></svg>
          <span>盈亏平衡 BEP</span>
        </div>
      </div>
    </div>
  );
}
