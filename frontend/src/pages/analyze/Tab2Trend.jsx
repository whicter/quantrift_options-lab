import { useRef, useEffect } from 'react';
import InsightCarousel from '../../components/InsightCarousel';
import { getChartColors } from '../../lib/theme';

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

function TrendCanvas({ prices, dates, kf, spread, levels }) {
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

      levels.forEach(level => {
        if (level.price < minP || level.price > maxP) return;
        const y = sy(level.price);
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = level.type === 'support' ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)';
        ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = level.type === 'support' ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)';
        ctx.font = '8px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`${level.type === 'support' ? 'S' : 'R'} $${level.price.toFixed(2)}`, PAD.left + 4, y - 3);
      });

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
      // Left-align inside the plot area; right-aligning at PAD.left-2 pushed the
      // label off the left edge so it rendered as "nd Spread".
      ctx.fillStyle = theme.axis; ctx.font = '9px monospace'; ctx.textAlign = 'left';
      ctx.fillText('Trend Spread', PAD.left + 2, PAD.top + 8);
    };

    drawMain(); drawSpread();
    const obs = new ResizeObserver(() => { drawMain(); drawSpread(); });
    const el = mainRef.current?.parentElement;
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [prices, dates, kf, spread, levels]);

  return (
    <>
      <div style={{ position: 'relative' }}><canvas ref={mainRef} style={{ display: 'block' }} /></div>
      <div style={{ position: 'relative', marginTop: 4 }}><canvas ref={spreadRef} style={{ display: 'block' }} /></div>
    </>
  );
}

function formatVolume(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return String(Math.round(value));
}

function VolumeProfile({ profile, spot }) {
  if (!profile?.nodes?.length) return null;
  const nodes = [...profile.nodes].sort((a, b) => b.price - a.price);
  const maxVolume = Math.max(...nodes.map(node => Number(node.volume) || 0), 1);
  return (
    <div className="az-card az-volume-profile-card">
      <div className="az-trend-header">
        <div>
          <div className="az-card-title">Volume Profile · 价位成交分布</div>
          <div className="az-data-note">近 {profile.days} 天，{profile.barCount} 根常规交易时段 30 分钟K线；横条越长，成交越密集。</div>
        </div>
        <span className="az-mini-badge yellow">{profile.highVolumeNodes.length} 个高量节点</span>
      </div>
      <div className="az-volume-profile">
        {nodes.map(node => {
          const distance = spot ? ((Number(node.price) / spot - 1) * 100) : null;
          return (
            <div className="az-vp-row" key={node.price}>
              <span className="az-vp-price">${Number(node.price).toFixed(2)}</span>
              <div className="az-vp-bar-track">
                <div className="az-vp-bar" style={{ width: `${Math.max(2, (Number(node.volume) / maxVolume) * 100)}%` }} />
              </div>
              <span className="az-vp-volume">{formatVolume(Number(node.volume))}</span>
              <span className="az-vp-distance">{distance == null ? '--' : `${distance >= 0 ? '+' : ''}${distance.toFixed(1)}%`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ObvCanvas({ series }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || series.length < 2) return undefined;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.parentElement.getBoundingClientRect().width;
      const H = 90;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const theme = getChartColors();
      const PAD = { top: 10, right: 12, bottom: 16, left: 12 };
      const values = series.map(point => Number(point.value));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      const sx = index => PAD.left + (index / (values.length - 1)) * (W - PAD.left - PAD.right);
      const sy = value => PAD.top + (H - PAD.top - PAD.bottom) - ((value - min) / range) * (H - PAD.top - PAD.bottom);
      ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);
      ctx.beginPath();
      values.forEach((value, index) => index === 0 ? ctx.moveTo(sx(index), sy(value)) : ctx.lineTo(sx(index), sy(value)));
      ctx.strokeStyle = values.at(-1) >= values[0] ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)';
      ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = theme.axis; ctx.font = '9px monospace'; ctx.textAlign = 'left';
      ctx.fillText('OBV', PAD.left, H - 3);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [series]);
  return <canvas ref={ref} style={{ display: 'block' }} />;
}

function ObvPanel({ obv }) {
  if (!obv?.series?.length) return null;
  const label = obv.trend === 'inflow' ? 'OBV 上行' : obv.trend === 'outflow' ? 'OBV 下行' : 'OBV 横向';
  const tone = obv.trend === 'inflow' ? 'green' : obv.trend === 'outflow' ? 'red' : 'yellow';
  return (
    <div className="az-card az-obv-card">
      <div className="az-trend-header">
        <div>
          <div className="az-card-title">OBV · On-Balance Volume</div>
          <div className="az-data-note">上涨日累加成交量、下跌日扣减成交量；用于观察价格方向是否有量能确认。</div>
        </div>
        <span className={`az-mini-badge ${tone}`}>{label}</span>
      </div>
      <ObvCanvas series={obv.series} />
    </div>
  );
}

export default function Tab2Trend({ data }) {
  const { trend, pcr, direction } = data;
  const composite = data.compositeMomentum;
  const priceOnly = data.partialData?.type === 'price_only';
  const realHistory = Array.isArray(data.priceHistory) && data.priceHistory.length >= 5 ? data.priceHistory : null;
  const stale = Boolean(data.priceMeta?.isStale || data.priceMeta?.freshness === 'stale');
  if (!realHistory) {
    return (
      <div className="az-card az-unavailable-panel">
        <div className="az-card-title">价格走势暂不可用</div>
        <div className="az-unavailable-text">当前没有足够的 OHLCV 价格历史，不生成示例走势或技术信号。</div>
      </div>
    );
  }
  const prices = realHistory.map(bar => bar.close);
  const dates = realHistory.map(bar => bar.date);
  const kf = calcKF(prices);
  const spread = calcSpread(prices);
  const levels = [
    ...(data.supportResistance?.support || []).map(level => ({ ...level, type: 'support' })),
    ...(data.supportResistance?.resistance || []).map(level => ({ ...level, type: 'resistance' })),
  ];
  const volumeProfile = data.volumeProfile;

  const insights = [
    `趋势格局：${trend.regime}，KF均线${trend.momentum.includes('向上') ? '向上倾斜，多头结构' : trend.momentum.includes('向下') ? '向下倾斜，空头结构' : '横盘整理'}`,
    `动量信号：${trend.momentum}，${trend.signal}`,
    `相对量能 RVol ${trend.rvol.toFixed(2)}×${trend.rvol > 1.3 ? '，成交量高于参考水平；需结合价格方向和后续延续性判断' : trend.rvol >= 1.0 ? '，量能接近参考水平' : '，成交量低于参考水平'}`,
    priceOnly
      ? '期权持仓比例：暂不可用，当前没有可用的 IV、期权链或 GEX 快照'
      : `期权持仓比例：PCR(OI) ${pcr?.toFixed(2) ?? '--'}；Put/Call 比例不单独预测方向，也不识别买卖方开仓意图`,
  ];

  return (
    <div className="tab-trend">
      <div className="az-card">
        <div className="az-trend-header">
          <div className="az-card-title">
            模型平滑趋势 · Kalman Filter
            {stale ? ' · 价格历史已延迟' : ''}
          </div>
          <span className={`az-mini-badge ${trend.regime.includes('多头') ? 'green' : trend.regime.includes('空头') ? 'red' : 'yellow'}`}>
            {trend.regime}
          </span>
        </div>
        <TrendCanvas prices={prices} dates={dates} kf={kf} spread={spread} levels={levels} />
      </div>

      <VolumeProfile profile={volumeProfile} spot={data.price} />
      <ObvPanel obv={data.obv} />

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

      <div className="az-card az-momentum-card">
        <div className="az-trend-header">
          <div className="az-card-title">Composite Momentum · 多周期动量</div>
          <span className={`az-mini-badge ${composite?.status === 'ready' ? (composite.score >= 55 ? 'green' : composite.score < 45 ? 'red' : 'yellow') : 'yellow'}`}>
            {composite?.status === 'ready' ? `${composite.score} · ${composite.label}` : composite?.status === 'stale' ? 'Stale · 30M落后' : '历史不足'}
          </span>
        </div>
        {composite?.timeframes ? (
          <div className="az-momentum-grid">
            {[
              ['30M', composite.timeframes['30m'], '30%'],
              ['1D', composite.timeframes['1d'], '40%'],
              ['1W', composite.timeframes['1w'], '30%'],
            ].map(([label, timeframe, weight]) => (
              <div className="az-momentum-cell" key={label}>
                <span>{label}</span>
                <strong>{timeframe.score}</strong>
                <small>权重 {weight}</small>
              </div>
            ))}
          </div>
        ) : <div className="az-empty-copy">需要至少 60 根日线、12 个周线观察与 26 根常规交易时段 30 分钟 K 线。</div>}
        {composite?.status === 'stale' && (
          <div className="az-data-note">日线 {composite.latest_daily_date} · 30M {composite.latest_intraday_market_date}，不作为当前多周期确认。</div>
        )}
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
          <div className="az-aux-label">{priceOnly ? '数据范围' : '期权结构'}</div>
          <div className="az-aux-val c-gray">
            {priceOnly ? '仅价格' : pcr < 0.6 ? 'Call OI 相对较多' : pcr > 1.0 ? 'Put OI 相对较多' : 'OI 比例居中'}
          </div>
        </div>
        <div className="az-aux-cell">
          <div className="az-aux-label">相对量能 RVol</div>
          <div className={`az-aux-val ${trend.rvol > 1.3 ? 'c-yellow' : trend.rvol >= 1.0 ? 'c-white' : 'c-gray'}`}>
            {trend.rvol.toFixed(2)}×
          </div>
        </div>
      </div>

      {/* Direction signals — skip the card entirely when there are no signals,
          rather than rendering an empty titled shell. */}
      {direction.signals.length > 0 && (
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
      )}
      <InsightCarousel insights={insights} />
    </div>
  );
}
