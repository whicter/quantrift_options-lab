export default function Sec3Pinning({ data }) {
  const { maxPain, fridayClose, pinningNote } = data;
  const deviation = ((fridayClose / maxPain - 1) * 100).toFixed(2);
  const above = fridayClose >= maxPain;
  const absDev = Math.abs(deviation);
  const barMax = Math.max(Math.abs(maxPain), Math.abs(fridayClose)) * 1.02;
  const barMin = Math.min(Math.abs(maxPain), Math.abs(fridayClose)) * 0.98;

  // Build visual bar positions
  const range = barMax - barMin || 1;
  const painPct = ((maxPain - barMin) / range) * 100;
  const closePct = ((fridayClose - barMin) / range) * 100;

  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">期权引力锚定</div>

      <div className="az-card wk-pin-card">
        <div className="wk-pin-numbers">
          <div className="wk-pin-num">
            <div className="wk-pin-num-label">Max Pain</div>
            <div className="wk-pin-num-val" style={{ color: 'var(--yellow)' }}>${maxPain}</div>
          </div>
          <div className="wk-pin-arrow" style={{ color: above ? 'var(--green)' : 'var(--red)' }}>
            {above ? '↑' : '↓'}<br />
            <span style={{ fontSize: 13 }}>{above ? '+' : ''}{deviation}%</span>
          </div>
          <div className="wk-pin-num">
            <div className="wk-pin-num-label">Fri Close</div>
            <div className="wk-pin-num-val" style={{ color: above ? 'var(--green)' : 'var(--red)' }}>${fridayClose}</div>
          </div>
        </div>

        {/* Comparison bar */}
        <div className="wk-pin-bar-wrap">
          <div className="wk-pin-bar-track">
            {/* Max Pain marker */}
            <div className="wk-pin-marker wk-pin-marker-pain" style={{ left: `${painPct}%` }}>
              <div className="wk-pin-marker-line" />
              <div className="wk-pin-marker-label">Max Pain<br />${maxPain}</div>
            </div>
            {/* Close marker */}
            <div className="wk-pin-marker wk-pin-marker-close" style={{ left: `${closePct}%` }}>
              <div className="wk-pin-marker-line wk-pin-marker-line-close" />
              <div className="wk-pin-marker-label wk-pin-marker-label-close">Fri Close<br />${fridayClose}</div>
            </div>
            {/* Fill between */}
            <div
              className="wk-pin-fill"
              style={{
                left: `${Math.min(painPct, closePct)}%`,
                width: `${Math.abs(closePct - painPct)}%`,
                background: above ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
              }}
            />
          </div>
          <div className="wk-pin-bar-labels">
            <span>${(barMin).toFixed(0)}</span>
            <span>${(barMax).toFixed(0)}</span>
          </div>
        </div>

        {/* Deviation badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div className={`az-badge ${absDev < 1 ? 'az-badge-neutral' : absDev < 3 ? 'az-badge-warn' : 'az-badge-bear'}`}>
            偏离 {above ? '+' : ''}{deviation}%
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {absDev < 1 ? '引力强，几乎锚定' : absDev < 3 ? '轻微偏离，有回归压力' : '偏离较大，下周可能向Max Pain修正'}
          </span>
        </div>
      </div>

      <div className="wk-note">{pinningNote}</div>
    </div>
  );
}
