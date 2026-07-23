export default function Sec5Playbook({ data }) {
  const scenarios = data.scenarios;
  if (!scenarios) return <div className="az-card"><div className="az-card-title">条件情景暂不可用</div><p>需要可用的 Wall 模型观察位或价格支撑/阻力。</p></div>;
  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">下周条件情景</div>
      <div className="wk-playbook-grid">
        {scenarios.up && <div className="wk-play-card wk-play-bull">
          <div className="wk-play-title">向上条件</div>
          <div className="wk-play-row"><span>条件</span><strong>日线收盘站上 ${scenarios.up.trigger}</strong></div>
          <div className="wk-play-row"><span>下一观察位</span><strong>{scenarios.up.target == null ? '--' : `$${scenarios.up.target}`}</strong></div>
          <div className="wk-play-watch">证据：{scenarios.up.evidence}</div>
        </div>}
        {scenarios.down && <div className="wk-play-card wk-play-bear">
          <div className="wk-play-title">向下条件</div>
          <div className="wk-play-row"><span>条件</span><strong>日线收盘跌破 ${scenarios.down.trigger}</strong></div>
          <div className="wk-play-row"><span>下一观察位</span><strong>{scenarios.down.target == null ? '--' : `$${scenarios.down.target}`}</strong></div>
          <div className="wk-play-watch">证据：{scenarios.down.evidence}</div>
        </div>}
      </div>
      <div className="wk-play-disclaimer">条件来自模型 Wall 观察位或价格 S/R；这些情景仅用于研究观察，不构成交易指令或投资建议。</div>
    </div>
  );
}
