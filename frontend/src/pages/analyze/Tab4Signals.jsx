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

      visible.forEach((d, i) => {
        const y = sy(d.strike);
        const yAbove = i === 0 ? PAD.top : (sy(visible[i - 1].strike) + y) / 2;
        const yBelow = i === visible.length - 1 ? H - PAD.bottom : (y + sy(visible[i + 1].strike)) / 2;
        const barTop = yAbove;
        const barH = Math.max(1, yBelow - yAbove - 0.5);

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

        // Strike label inside bar, near left
        ctx.fillStyle = theme.text;
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
    `观察区间 $${putWall} ~ $${callWall}，当前价 $${price} ${nearerCall ? `距Call Wall仅$${dToCall}（+${pctToCall}%），上方压力明显` : `距Put Wall仅$${dToPut}（-${pctToPut}%），下方支撑关键`}`,
    `多头剧本：突破 $${scenarios.upTrigger} 确认上攻，目标 $${scenarios.upTarget}`,
    `空头剧本：跌破 $${scenarios.downTrigger} 触发加速，目标 $${scenarios.downTarget}`,
    nearerCall
      ? `价格更靠近Call Wall，突破前建议观望，勿追高；突破后注意Gamma加速`
      : `价格更靠近Put Wall，跌破则负Gamma放大波动；守住支撑是多头关键`,
  ];

  return (
    <div className="tab-signals">
      <div className="az-price-range-chip">
        <span className="az-range-label">观察区间</span>
        <span className="az-range-val">${putWall} ~ ${callWall}</span>
      </div>
      {supportResistance && (
        <div className="az-level-strip">
          <span>S/R 来自 {supportResistance.barCount} 根真实日线</span>
          <span>S {supportResistance.support.map(level => `$${Number(level.price).toFixed(2)}`).join(' / ') || '--'}</span>
          <span>R {supportResistance.resistance.map(level => `$${Number(level.price).toFixed(2)}`).join(' / ') || '--'}</span>
        </div>
      )}
      <div className="az-signals-layout">
        <div className="az-chip-ruler-wrap az-card">
          <div className="az-card-title">主力持仓密度 · OI by Strike</div>
          {oiByStrike.length ? (
            <>
              <div className="az-oi-density-meta">
                <span><i className="put" />Put OI</span><span><i className="call" />Call OI</span>
                <span>{oiDensity.expiryCount} 个到期日 · {oiDensity.freshness === 'fresh' ? '新鲜' : '延迟'} · {oiDensity.source}</span>
              </div>
              <ChipRuler oiByStrike={oiByStrike} putWall={putWall} callWall={callWall} price={price} />
            </>
          ) : <div className="az-chart-unavailable">真实 OI snapshot 暂不可用</div>}
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
      <InsightCarousel insights={insights} />
    </div>
  );
}
