import React, { useRef, useEffect } from 'react';

function GEXChart({ gexByStrike, putWall, callWall, price }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.parentElement.getBoundingClientRect().width;
      const H = 210;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0c0e18'; ctx.fillRect(0, 0, W, H);

      const PAD = { top: 28, right: 16, bottom: 38, left: 16 };
      const cW = W - PAD.left - PAD.right;
      const cH = H - PAD.top - PAD.bottom;
      const strikes = gexByStrike.map(d => d.strike);
      const minS = Math.min(...strikes), maxS = Math.max(...strikes);
      const maxGex = Math.max(...gexByStrike.map(d => Math.abs(d.gex)));
      const n = gexByStrike.length;
      const gap = cW / n;
      const barW = gap * 0.65;
      const zero = PAD.top + cH / 2;
      const sx = s => PAD.left + ((s - minS) / (maxS - minS)) * cW;
      const sh = g => (Math.abs(g) / maxGex) * (cH / 2 - 4);

      // Zero line
      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1; ctx.moveTo(PAD.left, zero); ctx.lineTo(W - PAD.right, zero); ctx.stroke();

      // Bars
      gexByStrike.forEach(({ strike, gex }) => {
        const x = sx(strike);
        const h = sh(gex);
        const pos = gex >= 0;
        if (pos) {
          const g = ctx.createLinearGradient(0, zero - h, 0, zero);
          g.addColorStop(0, 'rgba(34,197,94,0.95)'); g.addColorStop(1, 'rgba(16,100,50,0.6)');
          ctx.fillStyle = g;
          ctx.fillRect(x - barW / 2, zero - h, barW, h);
        } else {
          const g = ctx.createLinearGradient(0, zero, 0, zero + h);
          g.addColorStop(0, 'rgba(100,30,30,0.6)'); g.addColorStop(1, 'rgba(239,68,68,0.95)');
          ctx.fillStyle = g;
          ctx.fillRect(x - barW / 2, zero, barW, h);
        }
        // Value label on taller bars
        if (Math.abs(gex) / maxGex > 0.28) {
          const label = Math.abs(gex) >= 1e6 ? `${(gex / 1e6).toFixed(1)}M` : `${(gex / 1e3).toFixed(0)}K`;
          ctx.fillStyle = 'rgba(200,210,230,0.85)'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
          ctx.fillText(label, x, pos ? zero - h - 4 : zero + h + 9);
        }
        // Strike label
        ctx.fillStyle = '#3a4464'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
        ctx.fillText(String(strike), x, H - PAD.bottom + 13);
      });

      // Put Wall (red dashed vertical)
      const px = sx(putWall);
      ctx.save();
      ctx.setLineDash([5, 3]); ctx.strokeStyle = 'rgba(239,68,68,0.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, PAD.top); ctx.lineTo(px, H - PAD.bottom); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('PUT WALL', px, PAD.top - 10);
      ctx.font = '8px monospace'; ctx.fillText(`$${putWall}`, px, PAD.top - 2);

      // Call Wall (green dashed vertical)
      const cx = sx(callWall);
      ctx.save();
      ctx.setLineDash([5, 3]); ctx.strokeStyle = 'rgba(34,197,94,0.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, H - PAD.bottom); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(34,197,94,0.9)'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('CALL WALL', cx, PAD.top - 10);
      ctx.font = '8px monospace'; ctx.fillText(`$${callWall}`, cx, PAD.top - 2);

      // Current price (blue solid vertical)
      const prx = sx(price);
      if (prx >= PAD.left && prx <= W - PAD.right) {
        ctx.strokeStyle = 'rgba(96,165,250,1)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(prx, PAD.top); ctx.lineTo(prx, H - PAD.bottom); ctx.stroke();
        ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillText(`$${price}`, prx, PAD.top - 10);
        // Arrow marker
        ctx.beginPath();
        ctx.moveTo(prx - 5, PAD.top - 1); ctx.lineTo(prx + 5, PAD.top - 1); ctx.lineTo(prx, PAD.top + 6);
        ctx.closePath(); ctx.fillStyle = '#60a5fa'; ctx.fill();
      }
    };

    draw();
    const obs = new ResizeObserver(draw);
    const el = canvasRef.current?.parentElement;
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [gexByStrike, putWall, callWall, price]);

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

export default function Tab3Options({ data }) {
  const { gexByStrike, gexTotal, putWall, callWall, pcr, price, iv30, unusualActivity, conclusion } = data;
  const gexPositive = gexTotal > 0;
  const gexStr = Math.abs(gexTotal) >= 1e9
    ? `$${(gexTotal / 1e9).toFixed(2)}B`
    : `${gexPositive ? '' : '-'}$${(Math.abs(gexTotal) / 1e6).toFixed(1)}M`;

  return (
    <div className="tab-options">
      <div className="az-card">
        <div className="az-card-title">Gamma Exposure by Strike</div>
        <GEXChart gexByStrike={gexByStrike} putWall={putWall} callWall={callWall} price={price} />
      </div>

      {/* 3 core numbers */}
      <div className="az-gex-numbers">
        <div className="az-gex-num">
          <div className="az-gex-num-label">GEX Total</div>
          <div className={`az-gex-num-val ${gexPositive ? 'c-green' : 'c-red'}`}>{gexStr}</div>
          <div className="az-gex-num-sub">{gexPositive ? '正Gamma环境' : '负Gamma环境'}</div>
        </div>
        <div className="az-gex-num">
          <div className="az-gex-num-label">PCR (OI)</div>
          <div className={`az-gex-num-val ${pcr < 0.6 ? 'c-green' : pcr > 1.1 ? 'c-red' : 'c-yellow'}`}>{pcr.toFixed(2)}</div>
          <div className="az-gex-num-sub">{pcr < 0.6 ? '偏多情绪' : pcr > 1.1 ? '偏空情绪' : '中性情绪'}</div>
        </div>
        <div className="az-gex-num">
          <div className="az-gex-num-label">IV ATM</div>
          <div className={`az-gex-num-val ${iv30 > 40 ? 'c-red' : iv30 > 20 ? 'c-yellow' : 'c-green'}`}>{iv30.toFixed(1)}%</div>
          <div className="az-gex-num-sub">{iv30 > 40 ? 'IV偏高' : iv30 > 20 ? 'IV适中' : 'IV偏低'}</div>
        </div>
      </div>

      {/* Unusual activity */}
      <div className="az-card">
        <div className="az-card-title">期权大单异动</div>
        {unusualActivity && unusualActivity.length > 0 ? (
          <div className="az-unusual-list">
            {unusualActivity.map((item, i) => (
              <div key={i} className="az-unusual-item">
                <span className={`az-unusual-type ${item.type === 'CALL' ? 'c-green' : 'c-red'}`}>{item.type}</span>
                <span className="az-unusual-strike">${item.strike}</span>
                <span className="az-unusual-at">@</span>
                <span className="az-unusual-date">{item.date}</span>
                <span className="az-unusual-vol">Vol: {item.vol.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>暂无异常大单</div>
        )}
      </div>

      {/* Conclusion */}
      <div className="az-options-conclusion">{conclusion}</div>
    </div>
  );
}
