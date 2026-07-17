export default function Sec3Pinning({ data }) {
  const pinning = data.pinning;
  if (pinning.status !== 'ready') return <div className="az-card"><div className="az-card-title">Max Pain 暂不可用</div><p>当前期权 OI 快照不足以计算 Max Pain。</p></div>;
  const deviation = Number(pinning.deviation_pct);
  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">最新收盘价与 Max Pain 的距离</div>
      <div className="az-card wk-pin-card">
        <div className="wk-pin-numbers">
          <div className="wk-pin-num"><div className="wk-pin-num-label">Max Pain</div><div className="wk-pin-num-val">${pinning.max_pain}</div></div>
          <div className="wk-pin-arrow">{deviation >= 0 ? '↑' : '↓'}<br /><span>{deviation.toFixed(2)}%</span></div>
          <div className="wk-pin-num"><div className="wk-pin-num-label">最新收盘价</div><div className="wk-pin-num-val">${pinning.close}</div></div>
        </div>
      </div>
      <div className="wk-note">Max Pain 是基于当前 OI 快照、使简化到期内在价值合计最小的行权价；距离仅作结构参考，不代表到期价格预测。</div>
    </div>
  );
}
