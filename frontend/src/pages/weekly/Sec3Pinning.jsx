export default function Sec3Pinning({ data }) {
  const pinning = data.pinning;
  if (pinning.status !== 'ready') return <div className="az-card"><div className="az-card-title">Max Pain 暂不可用</div><p>最新真实 GEX 快照没有 Max Pain。</p></div>;
  const deviation = Number(pinning.deviation_pct);
  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">期权交割偏离</div>
      <div className="az-card wk-pin-card">
        <div className="wk-pin-numbers">
          <div className="wk-pin-num"><div className="wk-pin-num-label">Max Pain</div><div className="wk-pin-num-val">${pinning.max_pain}</div></div>
          <div className="wk-pin-arrow">{deviation >= 0 ? '↑' : '↓'}<br /><span>{deviation.toFixed(2)}%</span></div>
          <div className="wk-pin-num"><div className="wk-pin-num-label">Latest Close</div><div className="wk-pin-num-val">${pinning.close}</div></div>
        </div>
      </div>
      <div className="wk-note">偏离仅描述价格与最新真实 Max Pain 的距离，不单独构成回归预测。</div>
    </div>
  );
}
