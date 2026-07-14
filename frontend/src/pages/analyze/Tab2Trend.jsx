import React, { useRef, useEffect } from 'react';
import InsightCarousel from '../../components/InsightCarousel';
import { getChartColors } from '../../lib/theme';

function genPrices(symbol, currentPrice, days = 60) {
  let seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 42);
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 4294967295;
  };
  const prices = [];
  let p = currentPrice * (0.91 + rng() * 0.05);
  for (let i = 0; i < days; i++) {
    const pull = (currentPrice - p) * 0.09;
    const noise = (rng() - 0.5) * currentPrice * 0.009;
    p = Math.max(p + pull + noise, currentPrice * 0.78);
    prices.push(p);
  }
  prices[days - 1] = currentPrice;
  return prices;
}

function calcKF(prices, alpha = 0.12) {
  const smooth = [];
  let s = prices[0];
  for (const p of prices) { s = alpha * p + (1 - alpha) * s; smooth.push(s); }
  const bw = 0.016;
  return {
    smooth,
    upper: smooth.map((v, i) => v + prices[i] * bw),
    lower: smooth.map((v, i) => v - prices[i] * bw),
  };
}

function calcSpread(prices) {
  return prices.map((p, i) => {
    const w = prices.slice(Math.max(0, i - 4), i + 1);
    const avg = w.reduce((a, b) => a + b, 0) / w.length;
    return (p - avg) / avg * 100;
  });
}

function TrendCanvas({ prices, dates, kf, spread }) {
  const mainRef = useRef(null);
  const spreadRef = useRef(null);

  useEffect(() => {
    const drawMain = () => {
      const canvas = mainRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.parentElement.getBoundingClientRect().width;
      const H = 180;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const theme = getChartColors();
      const PAD = { top: 16, right: 16, bottom: 24, left: 52 };
      const cW = W - PAD.left - PAD.right;
      const cH = H - PAD.top - PAD.bottom;
      const allY = [...prices, ...kf.upper, ...kf.lower];
      const minP = Math.min(...allY) * 0.9985;
      const maxP = Math.max(...allY) * 1.0015;
      const sy = v => PAD.top + cH - (v - minP) / (maxP - minP) * cH;
      const sx = i => PAD.left + (i / (prices.length - 1)) * cW;

      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);

      // Grid lines
      for (let t = 0; t <= 4; t++) {
        const y = sy(minP + (maxP - minP) * (t / 4));
        ctx.beginPath(); ctx.strokeStyle = theme.grid;
        ctx.lineWidth = 1; ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        ctx.fillStyle = theme.axis; ctx.font = '9px monospace'; ctx.textAlign = 'right';
        ctx.fillText((minP + (maxP - minP) * (t / 4)).toFixed(1), PAD.left - 4, y + 3);
      }

      // KF band fill
      ctx.beginPath();
      ctx.moveTo(sx(0), sy(kf.upper[0]));
      kf.upper.forEach((v, i) => ctx.lineTo(sx(i), sy(v)));
      [...kf.lower].reverse().forEach((v, i) => ctx.lineTo(sx(prices.length - 1 - i), sy(v)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(59,130,246,0.13)'; ctx.fill();

      // KF smooth line
      ctx.beginPath();
      kf.smooth.forEach((v, i) => i === 0 ? ctx.moveTo(sx(0), sy(v)) : ctx.lineTo(sx(i), sy(v)));
      ctx.strokeStyle = 'rgba(96,165,250,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();

      // Price line
      ctx.beginPath();
      prices.forEach((v, i) => i === 0 ? ctx.moveTo(sx(0), sy(v)) : ctx.lineTo(sx(i), sy(v)));
      ctx.strokeStyle = theme.text; ctx.lineWidth = 1.5; ctx.stroke();

      // Last price dot
      ctx.beginPath();
      ctx.arc(sx(prices.length - 1), sy(prices[prices.length - 1]), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = theme.text; ctx.fill();

      // X-axis date labels
      ctx.fillStyle = theme.axis; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      for (let i = 0; i < prices.length; i += 15) {
        const d = dates?.[i] ? new Date(`${dates[i]}T00:00:00`) : new Date(Date.now() - (prices.length - 1 - i) * 864e5);
        ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, sx(i), H - 4);
      }
    };

    const drawSpread = () => {
      const canvas = spreadRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.parentElement.getBoundingClientRect().width;
      const H = 56;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const theme = getChartColors();
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);
      const PAD = { top: 6, right: 16, bottom: 14, left: 52 };
      const cW = W - PAD.left - PAD.right;
      const cH = H - PAD.top - PAD.bottom;
      const maxS = Math.max(...spread.map(Math.abs)) || 1;
      const zero = PAD.top + cH / 2;
      const bW = cW / spread.length;

      spread.forEach((v, i) => {
        const x = PAD.left + i * bW;
        const h = (Math.abs(v) / maxS) * (cH / 2);
        const int = Math.min(Math.abs(v) / maxS, 1);
        if (v >= 0) {
          ctx.fillStyle = `rgba(0,${Math.floor(100 + int * 97)},${Math.floor(50 + int * 30)},0.9)`;
          ctx.fillRect(x, zero - h, bW - 0.5, h);
        } else {
          ctx.fillStyle = `rgba(${Math.floor(140 + int * 99)},40,40,0.9)`;
          ctx.fillRect(x, zero, bW - 0.5, h);
        }
      });

      ctx.beginPath(); ctx.strokeStyle = theme.gridSoft;
      ctx.lineWidth = 1; ctx.moveTo(PAD.left, zero); ctx.lineTo(W - PAD.right, zero); ctx.stroke();
      ctx.fillStyle = theme.axis; ctx.font = '9px monospace'; ctx.textAlign = 'right';
      ctx.fillText('Trend Spread', PAD.left - 2, PAD.top + 10);
    };

    drawMain(); drawSpread();
    const obs = new ResizeObserver(() => { drawMain(); drawSpread(); });
    const el = mainRef.current?.parentElement;
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [prices, dates, kf, spread]);

  return (
    <>
      <div style={{ position: 'relative' }}><canvas ref={mainRef} style={{ display: 'block' }} /></div>
      <div style={{ position: 'relative', marginTop: 4 }}><canvas ref={spreadRef} style={{ display: 'block' }} /></div>
    </>
  );
}

export default function Tab2Trend({ data }) {
  const { trend, price, symbol, pcr, direction } = data;
  const realHistory = Array.isArray(data.priceHistory) && data.priceHistory.length >= 5 ? data.priceHistory : null;
  const prices = realHistory ? realHistory.map(bar => bar.close) : genPrices(symbol, price);
  const dates = realHistory ? realHistory.map(bar => bar.date) : null;
  const kf = calcKF(prices);
  const spread = calcSpread(prices);

  const insights = [
    `趋势格局：${trend.regime}，KF均线${trend.momentum.includes('向上') ? '向上倾斜，多头结构' : trend.momentum.includes('向下') ? '向下倾斜，空头结构' : '横盘整理'}`,
    `动量信号：${trend.momentum}，${trend.signal}`,
    `相对量能 RVol ${trend.rvol.toFixed(2)}×${trend.rvol > 1.3 ? '，成交量明显放大，趋势可信度高' : trend.rvol >= 1.0 ? '，量能正常' : '，缩量，趋势可靠性存疑'}`,
    `期权情绪：PCR ${pcr?.toFixed(2) ?? '--'}，${pcr < 0.6 ? '看多拥挤，逆向需谨慎' : pcr > 1.0 ? '看空拥挤，可能存在反弹机会' : '多空情绪均衡'}`,
  ];

  return (
    <div className="tab-trend">
      <div className="az-card">
        <div className="az-trend-header">
          <div className="az-card-title">趋势走势 · Kalman Filter{realHistory ? ' · price_history' : ' · 示例走势'}</div>
          <span className={`az-mini-badge ${trend.regime.includes('多头') ? 'green' : trend.regime.includes('空头') ? 'red' : 'yellow'}`}>
            {trend.regime}
          </span>
        </div>
        <TrendCanvas prices={prices} dates={dates} kf={kf} spread={spread} />
      </div>

      {/* Output badges */}
      <div className="az-output-badges">
        {[
          { label: '格局', value: trend.regime, fn: v => v.includes('多头') ? 'az-badge-bull' : v.includes('空头') ? 'az-badge-bear' : 'az-badge-neutral' },
          { label: '动量', value: trend.momentum, fn: v => v.includes('向上') ? 'az-badge-bull' : v.includes('向下') ? 'az-badge-bear' : 'az-badge-neutral' },
          { label: '信号', value: trend.signal, fn: v => v.includes('延续') ? 'az-badge-bull' : 'az-badge-warn' },
        ].map(({ label, value, fn }) => (
          <div key={label} className="az-badge-group">
            <div className="az-badge-label">{label}</div>
            <div className={`az-badge ${fn(value)}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Aux 3-grid */}
      <div className="az-aux-grid">
        <div className="az-aux-cell">
          <div className="az-aux-label">趋势格局</div>
          <div className={`az-aux-val ${trend.regime.includes('多头') ? 'c-green' : trend.regime.includes('空头') ? 'c-red' : 'c-gray'}`}>
            {trend.regime.includes('多头') ? '偏强' : trend.regime.includes('空头') ? '偏弱' : '中性'}
          </div>
        </div>
        <div className="az-aux-cell">
          <div className="az-aux-label">期权结构</div>
          <div className="az-aux-val c-gray">
            {pcr < 0.6 ? '看多拥挤' : pcr > 1.0 ? '看空拥挤' : '结构中性'}
          </div>
        </div>
        <div className="az-aux-cell">
          <div className="az-aux-label">相对量能 RVol</div>
          <div className={`az-aux-val ${trend.rvol > 1.3 ? 'c-yellow' : trend.rvol >= 1.0 ? 'c-white' : 'c-gray'}`}>
            {trend.rvol.toFixed(2)}×
          </div>
        </div>
      </div>

      {/* Direction signals */}
      <div className="az-card" style={{ marginTop: 12 }}>
        <div className="az-card-title">技术信号</div>
        <div className="az-signals">
          {direction.signals.map((s, i) => (
            <div key={i} className="az-signal">
              <span className="az-signal-name">{s.name}</span>
              <span className="az-signal-val">{s.value}</span>
              <span className={s.bullish ? 'az-signal-bull' : 'az-signal-bear'}>{s.bullish ? '▲' : '▼'}</span>
            </div>
          ))}
        </div>
      </div>
      <InsightCarousel insights={insights} />
    </div>
  );
}
