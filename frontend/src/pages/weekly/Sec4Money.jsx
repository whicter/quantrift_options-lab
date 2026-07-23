import { useRef, useEffect } from 'react';

function FlowChart({ dailyFlows }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.parentElement.getBoundingClientRect().width;
      const H = 130;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0c0e18'; ctx.fillRect(0, 0, W, H);

      const PAD = { top: 10, right: 80, bottom: 20, left: 14 };
      const cW = W - PAD.left - PAD.right;
      const cH = H - PAD.top - PAD.bottom;
      const n = dailyFlows.length;
      const gap = cH / n;
      const maxFlow = Math.max(...dailyFlows.map(d => Math.abs(d.flow)));
      // Zero line
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1; ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, H - PAD.bottom); ctx.stroke();

      dailyFlows.forEach(({ day, flow }, i) => {
        const y = PAD.top + gap * i + gap * 0.15;
        const barH = gap * 0.7;
        const bLen = (Math.abs(flow) / maxFlow) * cW * 0.85;
        const pos = flow >= 0;

        // Bar
        if (pos) {
          const g = ctx.createLinearGradient(PAD.left, 0, PAD.left + bLen, 0);
          g.addColorStop(0, 'rgba(22,100,50,0.7)'); g.addColorStop(1, 'rgba(34,197,94,0.9)');
          ctx.fillStyle = g;
        } else {
          const g = ctx.createLinearGradient(PAD.left, 0, PAD.left + bLen, 0);
          g.addColorStop(0, 'rgba(100,30,30,0.7)'); g.addColorStop(1, 'rgba(239,68,68,0.9)');
          ctx.fillStyle = g;
        }
        ctx.fillRect(PAD.left, y, bLen, barH);

        // Day label (left)
        ctx.fillStyle = '#3a4464'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
        ctx.fillText(day, PAD.left - 4, y + barH / 2 + 4);

        // Value label (right of bar)
        const valStr = (pos ? '+' : '-') + '$' + (Math.abs(flow) / 1e6).toFixed(1) + 'M';
        ctx.fillStyle = pos ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)';
        ctx.font = '10px monospace'; ctx.textAlign = 'left';
        ctx.fillText(valStr, PAD.left + bLen + 6, y + barH / 2 + 4);
      });
    };

    draw();
    const obs = new ResizeObserver(draw);
    const el = canvasRef.current?.parentElement;
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [dailyFlows]);

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

export default function Sec4Money({ data }) {
  const { smartMoney } = data;
  const { cumulative, divergence, dailyFlows, note } = smartMoney;
  const cumPos = cumulative >= 0;
  const cumStr = (cumPos ? '+' : '-') + '$' + (Math.abs(cumulative) / 1e6).toFixed(1) + 'M';

  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">主力资金透视</div>

      {/* Summary row */}
      <div className="wk-money-summary">
        <div className="wk-money-stat">
          <div className="wk-money-label">累计净流向</div>
          <div className={`wk-money-val ${cumPos ? 'c-green' : 'c-red'}`}>{cumStr}</div>
        </div>
        <div className="wk-money-stat">
          <div className="wk-money-label">价格背离</div>
          <div className={`az-badge ${divergence ? 'az-badge-bear' : 'az-badge-bull'}`} style={{ fontSize: 14, padding: '4px 14px' }}>
            {divergence ? '⚠ YES' : '✓ NO'}
          </div>
          {divergence && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>价格创高但资金流出</div>}
        </div>
      </div>

      {/* Flow bar chart */}
      <div className="az-card">
        <div className="az-card-title">每日净流向（Mon–Fri）</div>
        <FlowChart dailyFlows={dailyFlows} />
      </div>

      <div className="wk-note">{note}</div>
    </div>
  );
}
