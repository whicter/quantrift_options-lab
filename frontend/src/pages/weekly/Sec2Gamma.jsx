import React, { useState, useRef, useEffect } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function GEXDayChart({ gexByStrike, putWall, callWall, price }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.parentElement.getBoundingClientRect().width;
      const H = 200;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0c0e18'; ctx.fillRect(0, 0, W, H);

      const PAD = { top: 24, right: 14, bottom: 34, left: 14 };
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

      ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1; ctx.moveTo(PAD.left, zero); ctx.lineTo(W - PAD.right, zero); ctx.stroke();

      gexByStrike.forEach(({ strike, gex }) => {
        const x = sx(strike);
        const h = sh(gex);
        const pos = gex >= 0;
        if (pos) {
          const g = ctx.createLinearGradient(0, zero - h, 0, zero);
          g.addColorStop(0, 'rgba(34,197,94,0.9)'); g.addColorStop(1, 'rgba(16,100,50,0.5)');
          ctx.fillStyle = g;
          ctx.fillRect(x - barW / 2, zero - h, barW, h);
        } else {
          const g = ctx.createLinearGradient(0, zero, 0, zero + h);
          g.addColorStop(0, 'rgba(100,30,30,0.5)'); g.addColorStop(1, 'rgba(239,68,68,0.9)');
          ctx.fillStyle = g;
          ctx.fillRect(x - barW / 2, zero, barW, h);
        }
        ctx.fillStyle = '#2e3650'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
        ctx.fillText(String(strike), x, H - PAD.bottom + 13);
      });

      // Put Wall
      const pX = sx(putWall);
      ctx.save(); ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(239,68,68,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(pX, PAD.top); ctx.lineTo(pX, H - PAD.bottom); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(239,68,68,0.85)'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`PUT $${putWall}`, pX, PAD.top - 6);

      // Call Wall
      const cX = sx(callWall);
      ctx.save(); ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(34,197,94,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cX, PAD.top); ctx.lineTo(cX, H - PAD.bottom); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(34,197,94,0.85)'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`CALL $${callWall}`, cX, PAD.top - 6);
    };

    draw();
    const obs = new ResizeObserver(draw);
    const el = canvasRef.current?.parentElement;
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [gexByStrike, putWall, callWall]);

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

export default function Sec2Gamma({ data }) {
  const { gammaByDay, gammaMigration, weekClose } = data;
  const [selectedDay, setSelectedDay] = useState('Fri');
  const snap = gammaByDay[selectedDay];

  // Build migration table
  const migration = DAYS.map(d => ({
    day: d,
    callWall: gammaByDay[d].callWall,
    putWall: gammaByDay[d].putWall,
  }));

  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">主力阵地延时摄影</div>

      {/* Day slider */}
      <div className="wk-day-tabs">
        {DAYS.map(d => (
          <button
            key={d}
            className={`wk-day-btn ${selectedDay === d ? 'active' : ''}`}
            onClick={() => setSelectedDay(d)}
          >
            {d}
          </button>
        ))}
      </div>

      {/* GEX chart */}
      <div className="az-card">
        <div className="az-trend-header">
          <div className="az-card-title">Gamma Field — {selectedDay}</div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
            <span style={{ color: 'var(--red)' }}>PUT ${snap.putWall}</span>
            <span style={{ color: 'var(--green)' }}>CALL ${snap.callWall}</span>
          </div>
        </div>
        <GEXDayChart
          gexByStrike={snap.gexByStrike}
          putWall={snap.putWall}
          callWall={snap.callWall}
          price={weekClose}
        />
      </div>

      {/* Migration table */}
      <div className="az-card">
        <div className="az-card-title">Gamma Wall 迁移追踪</div>
        <div className="wk-migration-table">
          <div className="wk-mig-header">
            <span>日期</span><span style={{ color: 'var(--green)' }}>Call Wall</span><span style={{ color: 'var(--red)' }}>Put Wall</span>
          </div>
          {migration.map(({ day, callWall, putWall }) => (
            <div key={day} className={`wk-mig-row ${day === selectedDay ? 'selected' : ''}`}>
              <span className="wk-mig-day">{day}</span>
              <span className="c-green">${callWall}</span>
              <span className="c-red">${putWall}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="wk-note">{gammaMigration}</div>
    </div>
  );
}
