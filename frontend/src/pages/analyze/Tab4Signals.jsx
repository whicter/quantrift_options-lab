import React, { useRef, useEffect } from 'react';

function ChipRuler({ gexByStrike, putWall, callWall, price }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.parentElement.getBoundingClientRect().width;
      const H = 300;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0c0e18'; ctx.fillRect(0, 0, W, H);

      const PAD = { top: 16, right: 12, bottom: 16, left: 52 };
      const cH = H - PAD.top - PAD.bottom;
      const cW = W - PAD.left - PAD.right;

      const span = (callWall - putWall);
      const minP = putWall - span * 0.32;
      const maxP = callWall + span * 0.32;
      const sy = v => PAD.top + cH - (v - minP) / (maxP - minP) * cH;

      // Wall zone background
      ctx.fillStyle = 'rgba(59,130,246,0.04)';
      ctx.fillRect(PAD.left, sy(callWall), cW, sy(putWall) - sy(callWall));

      // OI density bars (GEX as OI proxy)
      const maxGex = Math.max(...gexByStrike.map(d => Math.abs(d.gex)));
      gexByStrike.forEach(({ strike, gex }) => {
        const y = sy(strike);
        if (y < PAD.top - 4 || y > H - PAD.bottom + 4) return;
        const bLen = (Math.abs(gex) / maxGex) * cW * 0.72;
        ctx.fillStyle = gex >= 0 ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)';
        ctx.fillRect(PAD.left + 2, y - 5, bLen, 10);
        ctx.strokeStyle = gex >= 0 ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(PAD.left + 2, y - 5, bLen, 10);
      });

      // Y-axis price ticks
      ctx.textAlign = 'right'; ctx.font = '9px monospace';
      const step = (maxP - minP) / 7;
      for (let i = 0; i <= 7; i++) {
        const v = minP + step * i;
        const y = sy(v);
        if (y < PAD.top - 2 || y > H - PAD.bottom + 2) continue;
        ctx.fillStyle = '#2e3650';
        ctx.fillText(v.toFixed(v >= 100 ? 0 : 1), PAD.left - 4, y + 3);
        ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1; ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      }

      // Put Wall (green dashed)
      const putY = sy(putWall);
      ctx.save(); ctx.setLineDash([6, 3]);
      ctx.strokeStyle = 'rgba(34,197,94,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(PAD.left, putY); ctx.lineTo(W - PAD.right, putY); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(34,197,94,0.9)'; ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'left'; ctx.fillText(`PUT WALL $${putWall}`, PAD.left + 4, putY - 4);

      // Call Wall (red dashed)
      const callY = sy(callWall);
      ctx.save(); ctx.setLineDash([6, 3]);
      ctx.strokeStyle = 'rgba(239,68,68,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(PAD.left, callY); ctx.lineTo(W - PAD.right, callY); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'left'; ctx.fillText(`CALL WALL $${callWall}`, PAD.left + 4, callY + 11);

      // Current price dot
      const prY = sy(price);
      const dotX = PAD.left + cW * 0.38;
      // Halo
      ctx.beginPath(); ctx.arc(dotX, prY, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(96,165,250,0.12)'; ctx.fill();
      // Dot
      ctx.beginPath(); ctx.arc(dotX, prY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#60a5fa'; ctx.fill();
      // Label
      ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left'; ctx.fillText(`$${price}`, dotX + 12, prY + 4);
    };

    draw();
    const obs = new ResizeObserver(draw);
    const el = canvasRef.current?.parentElement;
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [gexByStrike, putWall, callWall, price]);

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

export default function Tab4Signals({ data }) {
  const { gexByStrike, putWall, callWall, price, scenarios } = data;
  const pctToCall = ((callWall / price - 1) * 100).toFixed(2);
  const pctToPut = ((price / putWall - 1) * 100).toFixed(2);
  const dToCall = (callWall - price).toFixed(2);
  const dToPut = (price - putWall).toFixed(2);
  const nearerCall = Math.abs(callWall - price) < Math.abs(price - putWall);

  return (
    <div className="tab-signals">
      <div className="az-signals-layout">
        <div className="az-chip-ruler-wrap az-card">
          <div className="az-card-title">主力筹码标尺</div>
          <ChipRuler gexByStrike={gexByStrike} putWall={putWall} callWall={callWall} price={price} />
        </div>

        <div className="az-signals-info">
          <div className="az-wall-dist az-wall-dist-call">
            <div className="az-wall-dist-label">上方压力 · Call Wall</div>
            <div className="az-wall-dist-price">${callWall}</div>
            <div className="az-wall-dist-num">+{pctToCall}% / +${dToCall}</div>
          </div>

          <div className="az-wall-dist az-wall-dist-put">
            <div className="az-wall-dist-label">下方支撑 · Put Wall</div>
            <div className="az-wall-dist-price">${putWall}</div>
            <div className="az-wall-dist-num">-{pctToPut}% / -${dToPut}</div>
          </div>

          <div className="az-signals-obs">
            <div className="az-obs-title">观察结论</div>
            <div className="az-obs-text">
              {nearerCall
                ? `现价距Call Wall $${callWall}更近（+${pctToCall}%），上方压力是近期关键测试位，突破确认前谨慎追多`
                : `现价距Put Wall $${putWall}更近（-${pctToPut}%），下方支撑是近期关键测试位，跌破则波动可能加速`}
            </div>
            <div className="az-obs-note">本分析不是操作建议，仅回答一个问题：今天最该观察的风险点在哪里。</div>
          </div>

          <div className="az-scenario-row" style={{ marginTop: 12 }}>
            <div className="az-scenario az-scenario-bull" style={{ flex: 1 }}>
              <div className="az-scenario-title">多头触发</div>
              <div className="az-scenario-line">突破 <strong>${scenarios.upTrigger}</strong></div>
              <div className="az-scenario-line">目标 <strong>${scenarios.upTarget}</strong></div>
            </div>
            <div className="az-scenario az-scenario-bear" style={{ flex: 1 }}>
              <div className="az-scenario-title">空头触发</div>
              <div className="az-scenario-line">跌破 <strong>${scenarios.downTrigger}</strong></div>
              <div className="az-scenario-line">目标 <strong>${scenarios.downTarget}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
