import { useRef, useEffect } from 'react';
import InsightCarousel from '../../components/InsightCarousel';
import { getChartColors } from '../../lib/theme';

function ChipRuler({ oiByStrike, putWall, callWall, price }) {
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
      const theme = getChartColors();
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);

      const PAD = { top: 16, right: 12, bottom: 16, left: 52 };
      const cH = H - PAD.top - PAD.bottom;
      const cW = W - PAD.left - PAD.right;

      const wallLow = Math.min(putWall, callWall, price);
      const wallHigh = Math.max(putWall, callWall, price);
      const span = Math.max(wallHigh - wallLow, Math.abs(price) * 0.06, 1);
      const minP = wallLow - span * 0.32;
      const maxP = wallHigh + span * 0.32;
      const sy = v => PAD.top + cH - (v - minP) / (maxP - minP) * cH;

      // Wall zone background
      ctx.fillStyle = 'rgba(59,130,246,0.04)';
      ctx.fillRect(PAD.left, sy(callWall), cW, sy(putWall) - sy(callWall));

      // OI density bars — call and put OI aggregated across nonexpired expiries.
      const sorted = [...oiByStrike].sort((a, b) => b.strike - a.strike);
      const visible = sorted.filter(d => {
        const y = sy(d.strike);
        return y >= PAD.top && y <= H - PAD.bottom;
      });
      const maxOi = Math.max(...visible.map(d => Number(d.total_oi || 0))) || 1;

      // Clip all bar drawing to chart area — prevents any overflow
      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.left, PAD.top, cW, cH);
      ctx.clip();

      // Cap each bar's thickness at the spacing to its neighbours (never the
      // full chart edge). The first/last strike used to stretch to PAD.top /
      // chart bottom, which painted one huge block above the top strike.
      const MAX_BAR_H = 14;
      visible.forEach((d, i) => {
        const y = sy(d.strike);
        const gapAbove = i === 0 ? Infinity : (y - sy(visible[i - 1].strike)) / 2;
        const gapBelow = i === visible.length - 1 ? Infinity : (sy(visible[i + 1].strike) - y) / 2;
        const half = Math.min(MAX_BAR_H / 2, gapAbove, gapBelow);
        const barTop = y - half;
        const barH = Math.max(1, half * 2 - 0.5);

        const totalOi = Number(d.total_oi || 0);
        const callOi = Number(d.call_oi || 0);
        const putOi = Number(d.put_oi || 0);
        const ratio = totalOi / maxOi;
        const bLen = Math.max(2, ratio * cW * 0.85);
        const putLen = totalOi > 0 ? bLen * putOi / totalOi : 0;
        const callLen = totalOi > 0 ? bLen * callOi / totalOi : 0;
        ctx.fillStyle = `rgba(34,197,94,${0.18 + ratio * 0.5})`;
        ctx.fillRect(PAD.left, barTop, putLen, barH);
        ctx.fillStyle = `rgba(239,68,68,${0.18 + ratio * 0.5})`;
        ctx.fillRect(PAD.left + putLen, barTop, callLen, barH);

        // Left accent line
        ctx.fillStyle = putOi >= callOi
          ? `rgba(34,197,94,${0.55 + ratio * 0.45})`
          : `rgba(239,68,68,${0.55 + ratio * 0.45})`;
        ctx.fillRect(PAD.left, barTop, 3, barH);
      });

      // Strike labels: one per ~14px of vertical room so they never stack into
      // an unreadable wall. Walls and the current price get their own labels
      // below, so this is only the ambient grid of strike prices.
      const labelStepPx = 14;
      let lastLabelY = -Infinity;
      visible.forEach(d => {
        const y = sy(d.strike);
        if (y - lastLabelY < labelStepPx) return;
        lastLabelY = y;
        ctx.fillStyle = theme.axis;
        ctx.font = '8px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`$${d.strike}`, PAD.left + 6, y + 3);
      });

      ctx.restore();

      // Y-axis price ticks
      ctx.textAlign = 'right'; ctx.font = '9px monospace';
      const step = (maxP - minP) / 7;
      for (let i = 0; i <= 7; i++) {
        const v = minP + step * i;
        const y = sy(v);
        if (y < PAD.top - 2 || y > H - PAD.bottom + 2) continue;
        ctx.fillStyle = theme.axis;
        ctx.fillText(v.toFixed(v >= 100 ? 0 : 1), PAD.left - 4, y + 3);
        ctx.beginPath(); ctx.strokeStyle = theme.grid;
        ctx.lineWidth = 1; ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      }

      // Put Wall (green dashed)
      const putY = sy(putWall);
      ctx.save(); ctx.setLineDash([6, 3]);
      ctx.strokeStyle = 'rgba(34,197,94,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(PAD.left, putY); ctx.lineTo(W - PAD.right, putY); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(34,197,94,0.9)'; ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'left'; ctx.fillText(`PUT WALL 观察位 $${putWall}`, PAD.left + 4, putY - 4);

      // Call Wall (red dashed)
      const callY = sy(callWall);
      ctx.save(); ctx.setLineDash([6, 3]);
      ctx.strokeStyle = 'rgba(239,68,68,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(PAD.left, callY); ctx.lineTo(W - PAD.right, callY); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'left'; ctx.fillText(`CALL WALL 观察位 $${callWall}`, PAD.left + 4, callY + 11);

      // Current price dot
      const prY = sy(price);
      const dotX = PAD.left + cW * 0.38;
      // Halo
      ctx.beginPath(); ctx.arc(dotX, prY, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(96,165,250,0.12)'; ctx.fill();
      // Dot
      ctx.beginPath(); ctx.arc(dotX, prY, 5, 0, Math.PI * 2);
      ctx.fillStyle = theme.spot; ctx.fill();
      // Label
      ctx.fillStyle = theme.spot; ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left'; ctx.fillText(`$${price}`, dotX + 12, prY + 4);
    };

    draw();
    const obs = new ResizeObserver(draw);
    const el = canvasRef.current?.parentElement;
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [oiByStrike, putWall, callWall, price]);

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

export default function Tab4Signals({ data }) {
  const { putWall, callWall, price, scenarios, supportResistance, chainStats } = data;
  const oiDensity = chainStats?.oiDensity;
  const oiByStrike = oiDensity?.points || [];
  const pctToCall = ((callWall / price - 1) * 100).toFixed(2);
  const pctToPut = ((price / putWall - 1) * 100).toFixed(2);
  const dToCall = (callWall - price).toFixed(2);
  const dToPut = (price - putWall).toFixed(2);
  const nearerCall = Math.abs(callWall - price) < Math.abs(price - putWall);

  const insights = [
    `模型观察区间 $${putWall} ~ $${callWall}，当前价 $${price} ${nearerCall ? `距 Call Wall $${dToCall}（+${pctToCall}%）` : `距 Put Wall $${dToPut}（-${pctToPut}%）`}；距离不代表价格一定触及。`,
    `上行情景：若日线收盘站上 $${scenarios.upTrigger}，观察下一价位 $${scenarios.upTarget}`,
    `下行情景：若日线收盘跌破 $${scenarios.downTrigger}，观察下一价位 $${scenarios.downTarget}`,
    'Call Wall 与 Put Wall 是按当前 OI/GEX 模型得出的观察位，不是确定支撑、阻力或交易指令。',
  ];

  return (
    <div className="tab-signals">
      <div className="az-price-range-chip">
        <span className="az-range-label">观察区间</span>
        <span className="az-range-val">${putWall} ~ ${callWall}</span>
      </div>
      {supportResistance && (
        <div className="az-level-strip">
          <span>S/R 基于 {supportResistance.barCount} 根价格日线</span>
          <span>S {supportResistance.support.map(level => `$${Number(level.price).toFixed(2)}`).join(' / ') || '--'}</span>
          <span>R {supportResistance.resistance.map(level => `$${Number(level.price).toFixed(2)}`).join(' / ') || '--'}</span>
        </div>
      )}
      <div className="az-signals-layout">
        <div className="az-chip-ruler-wrap az-card">
          <div className="az-card-title">未平仓量分布 · OI by Strike</div>
          {oiByStrike.length ? (
            <>
              <div className="az-oi-density-meta">
                <span><i className="put" />Put OI</span><span><i className="call" />Call OI</span>
                <span>{oiDensity.expiryCount} 个到期日 · {oiDensity.freshness === 'fresh' ? '数据较新' : '数据延迟'} · 数据截至 {String(oiDensity.snapshotTs || '').slice(0, 16).replace('T', ' ') || '--'}</span>
              </div>
              <ChipRuler oiByStrike={oiByStrike} putWall={putWall} callWall={callWall} price={price} />
            </>
          ) : <div className="az-chart-unavailable">期权 OI 快照暂不可用</div>}
        </div>

        <div className="az-signals-info">
          <div className="az-wall-dist az-wall-dist-call">
            <div className="az-wall-dist-label">Call Wall 模型观察位</div>
            <div className="az-wall-dist-price">${callWall}</div>
            <div className="az-wall-dist-num">+{pctToCall}% / +${dToCall}</div>
          </div>

          <div className="az-wall-dist az-wall-dist-put">
            <div className="az-wall-dist-label">Put Wall 模型观察位</div>
            <div className="az-wall-dist-price">${putWall}</div>
            <div className="az-wall-dist-num">-{pctToPut}% / -${dToPut}</div>
          </div>

          <div className="az-signals-obs">
            <div className="az-obs-title">观察结论</div>
            <div className="az-obs-text">
              {nearerCall
                ? `现价距 Call Wall $${callWall} 更近（+${pctToCall}%）。这是当前快照中的模型观察位，距离本身不代表价格一定触及或反转。`
                : `现价距 Put Wall $${putWall} 更近（-${pctToPut}%）。这是当前快照中的模型观察位，距离本身不代表价格一定触及或反转。`}
            </div>
            <div className="az-obs-note">这些观察位仅用于研究，不构成交易指令或投资建议。</div>
          </div>

          <div className="az-scenario-row" style={{ marginTop: 12 }}>
            <div className="az-scenario az-scenario-bull" style={{ flex: 1 }}>
              <div className="az-scenario-title">上行情景</div>
              <div className="az-scenario-line">日线收盘站上 <strong>${scenarios.upTrigger}</strong></div>
              <div className="az-scenario-line">下一观察位 <strong>${scenarios.upTarget}</strong></div>
            </div>
            <div className="az-scenario az-scenario-bear" style={{ flex: 1 }}>
              <div className="az-scenario-title">下行情景</div>
              <div className="az-scenario-line">日线收盘跌破 <strong>${scenarios.downTrigger}</strong></div>
              <div className="az-scenario-line">下一观察位 <strong>${scenarios.downTarget}</strong></div>
            </div>
          </div>
        </div>
      </div>
      <InsightCarousel insights={insights} />
    </div>
  );
}
