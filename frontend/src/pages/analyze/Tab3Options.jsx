import { useRef, useEffect } from 'react';
import InsightCarousel from '../../components/InsightCarousel';
import { getChartColors } from '../../lib/theme';
import { compactMoney } from '../../lib/scannerPresentation';
import { gexEnvironmentConclusion, pcrConclusion, expectedMoveConclusion } from '../../lib/synthesis';

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
      const theme = getChartColors();
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);

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
      ctx.beginPath(); ctx.strokeStyle = theme.gridSoft;
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
          const label = compactMoney(gex).replace('$', '');
          ctx.fillStyle = theme.text; ctx.font = '8px monospace'; ctx.textAlign = 'center';
          ctx.fillText(label, x, pos ? zero - h - 4 : zero + h + 9);
        }
        // Strike label
        ctx.fillStyle = theme.axis; ctx.font = '8px monospace'; ctx.textAlign = 'center';
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
        ctx.strokeStyle = theme.spot; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(prx, PAD.top); ctx.lineTo(prx, H - PAD.bottom); ctx.stroke();
        ctx.fillStyle = theme.spot; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillText(`$${price}`, prx, PAD.top - 10);
        // Arrow marker
        ctx.beginPath();
        ctx.moveTo(prx - 5, PAD.top - 1); ctx.lineTo(prx + 5, PAD.top - 1); ctx.lineTo(prx, PAD.top + 6);
        ctx.closePath(); ctx.fillStyle = theme.spot; ctx.fill();
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

function money(value) {
  return compactMoney(value);
}

export default function Tab3Options({ data }) {
  const { gexByStrike, gexTotal, putWall, callWall, pcr, pcrVol, price, iv30, ivRank, localGamma, gammaFlip, unusualActivity, unusualMeta, externalFlow, conclusion, chainStats } = data;
  const gexPositive = gexTotal > 0;
  const gexStr = compactMoney(gexTotal);

  // Synthesis reads reused on the options tab: global/local GEX, PCR plain
  // language, and IV-to-expected-move.
  const gexEnv = gexEnvironmentConclusion({ globalGex: gexTotal, localGamma, gammaFlip, price });
  const pcrRead = pcrConclusion({ pcrOi: pcr, pcrVol });
  const expMove = expectedMoveConclusion({ iv30Pct: iv30, price, ivRank });

  const insights = [
    gexEnv.available
      ? `${gexEnv.text} ${gexEnv.note}`
      : `${gexPositive ? '正' : '负'} Gamma 环境（模型估算 ${gexStr}），短线波动可能${gexPositive ? '较容易收窄' : '较容易放大'}`,
    pcrRead.available
      ? pcrRead.text
      : `PCR(OI) ${pcr?.toFixed(2) ?? '--'}，表示 Put/Call 未平仓量比例；它不单独代表看多或看空`,
    expMove.available
      ? expMove.text
      : `IV ATM ${iv30?.toFixed(1) ?? '--'}%${iv30 > 40 ? '，绝对水平较高；需结合自身历史、实现波动率和事件风险判断' : iv30 > 20 ? '，处于中间区间' : '，绝对水平较低；不等于期权被低估'}`,
    unusualActivity?.length
      ? unusualActivity[0].status === 'confirmed'
        ? `OI异动：${unusualActivity[0].type} $${unusualActivity[0].strike} ΔOI ${unusualActivity[0].oiDelta?.toLocaleString() ?? '--'}，需要结合价格与成交确认`
        : `OI状态：${unusualActivity[0].status}，当前只能作为基线/活跃度观察`
      : '当前没有达到异动阈值的合约，或相关快照尚未采集',
  ];

  return (
    <div className="tab-options">
      <div className="az-card">
        <div className="az-card-title">Gamma Exposure by Strike</div>
        <GEXChart gexByStrike={gexByStrike} putWall={putWall} callWall={callWall} price={price} />
      </div>

      {/* 4 core numbers */}
      <div className="az-gex-numbers az-gex-numbers-4">
        <div className="az-gex-num">
          <div className="az-gex-num-label">GEX Total · 1% Move</div>
          <div className={`az-gex-num-val ${gexPositive ? 'c-green' : 'c-red'}`}>{gexStr}</div>
          <div className="az-gex-num-sub">{gexPositive ? '正 Gamma 环境' : '负 Gamma 环境'} · 模型估算，非现金流</div>
        </div>
        <div className="az-gex-num">
          <div className="az-gex-num-label">PCR (OI)</div>
          <div className={`az-gex-num-val ${pcr < 0.6 ? 'c-green' : pcr > 1.1 ? 'c-red' : 'c-yellow'}`}>{pcr?.toFixed(2) ?? '--'}</div>
          <div className="az-gex-num-sub">Put/Call OI 相对比例，不代表净方向</div>
        </div>
        <div className="az-gex-num">
          <div className="az-gex-num-label">PCR (Vol)</div>
          <div className={`az-gex-num-val ${!pcrVol ? 'c-gray' : pcrVol < 0.6 ? 'c-green' : pcrVol > 1.1 ? 'c-red' : 'c-yellow'}`}>
            {pcrVol?.toFixed(2) ?? '--'}
          </div>
          <div className="az-gex-num-sub">{!pcrVol ? '暂无数据' : 'Put/Call 成交量相对比例，不代表净方向'}</div>
        </div>
        <div className="az-gex-num">
          <div className="az-gex-num-label">IV ATM</div>
          <div className={`az-gex-num-val ${iv30 > 40 ? 'c-red' : iv30 > 20 ? 'c-yellow' : 'c-green'}`}>{iv30?.toFixed(1) ?? '--'}%</div>
          <div className="az-gex-num-sub">{iv30 > 40 ? 'IV偏高' : iv30 > 20 ? 'IV适中' : 'IV偏低'}</div>
        </div>
      </div>

      <div className="az-chain-stats-grid">
        <div className="az-card">
          <div className="az-card-title">IV Term Structure · 期限结构</div>
          {chainStats?.termStructure?.length ? (
            <div className="az-chain-table">
              {chainStats.termStructure.slice(0, 8).map(point => (
                <div key={point.expiry} className="az-chain-row">
                  <span>{point.expiry}</span>
                  <strong>{(Number(point.atm_iv) * 100).toFixed(1)}%</strong>
                  <small>ATM ${Number(point.atm_strike).toFixed(2)}</small>
                </div>
              ))}
            </div>
          ) : <div className="az-empty-copy">当前期权快照没有可用 ATM IV 期限结构。</div>}
        </div>
        <div className="az-card">
          <div className="az-card-title">IV Skew · {chainStats?.skew?.expiry || '偏斜'}</div>
          {chainStats?.skew?.points?.length ? (
            <div className="az-chain-table">
              {chainStats.skew.points.slice(0, 12).map(point => (
                <div key={point.strike} className="az-chain-row">
                  <span>${Number(point.strike).toFixed(2)}</span>
                  <strong>P {point.put_iv == null ? '--' : `${(Number(point.put_iv) * 100).toFixed(1)}%`}</strong>
                  <small>C {point.call_iv == null ? '--' : `${(Number(point.call_iv) * 100).toFixed(1)}%`}</small>
                </div>
              ))}
            </div>
          ) : <div className="az-empty-copy">当前期权快照没有可用 strike IV skew。</div>}
        </div>
      </div>

      {/* Unusual activity */}
      <div className="az-card">
        <div className="az-card-title">期权成交与 OI 异动</div>
        {unusualMeta && (
          <div className="az-unusual-meta">
            {unusualMeta.status || unusualMeta.freshness}
            {unusualMeta.snapshotTs ? ` · ${String(unusualMeta.snapshotTs).slice(0, 16).replace('T', ' ')}` : ''}
          </div>
        )}
        {unusualActivity && unusualActivity.length > 0 ? (
          <div className="az-unusual-list">
            {unusualActivity.map((item, i) => (
              <div key={i} className="az-unusual-item">
                <span className={`az-unusual-type ${item.type === 'CALL' ? 'c-green' : 'c-red'}`}>{item.type}</span>
                <span className="az-unusual-strike">${item.strike}</span>
                <span className="az-unusual-at">@</span>
                <span className="az-unusual-date">{item.date}</span>
                <span className="az-unusual-vol">Vol: {item.vol.toLocaleString()}</span>
                <span className="az-unusual-vol">
                  ΔOI: {item.oiDelta == null ? item.status : item.oiDelta.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>暂无达到当前筛选阈值的合约，或相关数据尚未采集。</div>
        )}
      </div>

      <div className="az-card">
        <div className="az-card-title">Sweep / Dark Pool · 外部事件流</div>
        <div className="az-flow-meta">
          <span className={`az-mini-badge ${externalFlow?.freshness === 'fresh' ? 'green' : 'yellow'}`}>
            {externalFlow?.status === 'active' ? '有事件' : externalFlow?.status === 'quiet' ? '当前安静' : externalFlow?.status === 'stale' ? '数据延迟' : '待接入'}
          </span>
          {externalFlow?.providerLastMessageAt && <span>数据截至 {String(externalFlow.providerLastMessageAt).slice(0, 16).replace('T', ' ')}</span>}
        </div>
        {externalFlow?.freshness === 'fresh' ? (
          <>
            <div className="az-flow-summary">
              <span>Option Flow <strong>{externalFlow.summary.optionFlowCount}</strong></span>
              <span>Sweep <strong>{externalFlow.summary.sweepCount}</strong></span>
              <span>匹配事件名义金额 <strong>{money(externalFlow.summary.optionPremium)}</strong></span>
              <span>Dark Pool 匹配名义金额 <strong>{money(externalFlow.summary.darkPoolNotional)}</strong></span>
            </div>
            <div className="az-flow-list">
              {externalFlow.items.slice(0, 10).map(item => (
                <div className="az-flow-row" key={`${item.type}-${item.id}`}>
                  <strong>{item.type === 'dark_pool' ? 'DARK' : item.hasSweep ? 'SWEEP' : 'FLOW'}</strong>
                  <span>{item.type === 'dark_pool' ? `${item.size.toLocaleString()} 股 @ $${item.price?.toFixed(2) ?? '--'}` : `${item.right || '--'} $${item.strike ?? '--'} · ${item.expiry || '--'}`}</span>
                  <span>{money(item.premium)}</span>
                  {item.allOpeningTrades && <small>opening confirmed</small>}
                </div>
              ))}
              {externalFlow.items.length === 0 && <div className="az-empty-copy">过去 {externalFlow.windowHours || 24} 小时该标的没有匹配事件。</div>}
            </div>
          </>
        ) : <div className="az-empty-copy">外部事件流尚未形成可用的数据快照，不展示推断值。</div>}
      </div>

      {/* Conclusion */}
      <div className="az-options-conclusion">{conclusion}</div>

      <InsightCarousel insights={insights} />
    </div>
  );
}
