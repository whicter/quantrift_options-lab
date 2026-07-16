export default function Sec5Playbook({ data }) {
  const scenarios = data.scenarios;
  if (!scenarios) return <div className="az-card"><div className="az-card-title">条件剧本暂不可用</div><p>需要真实 Wall 或价格支撑/阻力。</p></div>;
  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">下周条件剧本</div>
      <div className="wk-playbook-grid">
        {scenarios.up && <div className="wk-play-card wk-play-bull">
          <div className="wk-play-title">向上条件</div>
          <div className="wk-play-row"><span>触发</span><strong>突破 ${scenarios.up.trigger}</strong></div>
          <div className="wk-play-row"><span>下一观察位</span><strong>{scenarios.up.target == null ? '--' : `$${scenarios.up.target}`}</strong></div>
          <div className="wk-play-watch">证据：{scenarios.up.evidence}</div>
        </div>}
        {scenarios.down && <div className="wk-play-card wk-play-bear">
          <div className="wk-play-title">向下条件</div>
          <div className="wk-play-row"><span>触发</span><strong>跌破 ${scenarios.down.trigger}</strong></div>
          <div className="wk-play-row"><span>下一观察位</span><strong>{scenarios.down.target == null ? '--' : `$${scenarios.down.target}`}</strong></div>
          <div className="wk-play-watch">证据：{scenarios.down.evidence}</div>
        </div>}
      </div>
      <div className="wk-play-disclaimer">条件来自真实 Wall 或价格 S/R；只有触发后才进入观察，不构成订单。</div>
    </div>
  );
}
