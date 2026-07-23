export default function Sec5Playbook({ data }) {
  const { scenarios } = data;

  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">下周条件剧本（PLAYBOOK）</div>
      <div className="wk-section-note" style={{ marginBottom: 16 }}>
        只按关键价位触发，不提前替市场下结论
      </div>

      <div className="wk-playbook-grid">
        {/* Bull scenario */}
        <div className="wk-play-card wk-play-bull">
          <div className="wk-play-header">
            <span className="wk-play-icon">▲</span>
            <span className="wk-play-title">多头剧本</span>
          </div>
          <div className="wk-play-row">
            <span className="wk-play-label">触发条件</span>
            <span className="wk-play-val c-green">突破 ${scenarios.upTrigger}</span>
          </div>
          <div className="wk-play-row">
            <span className="wk-play-label">价格目标</span>
            <span className="wk-play-val c-green">${scenarios.upTarget}</span>
          </div>
          <div className="wk-play-divider" />
          <div className="wk-play-watch-label">观察重点</div>
          <div className="wk-play-watch">{scenarios.upWatch}</div>
        </div>

        {/* Bear scenario */}
        <div className="wk-play-card wk-play-bear">
          <div className="wk-play-header">
            <span className="wk-play-icon">▼</span>
            <span className="wk-play-title">空头剧本</span>
          </div>
          <div className="wk-play-row">
            <span className="wk-play-label">触发条件</span>
            <span className="wk-play-val c-red">跌破 ${scenarios.downTrigger}</span>
          </div>
          <div className="wk-play-row">
            <span className="wk-play-label">价格目标</span>
            <span className="wk-play-val c-red">${scenarios.downTarget}</span>
          </div>
          <div className="wk-play-divider" />
          <div className="wk-play-watch-label">观察重点</div>
          <div className="wk-play-watch">{scenarios.downWatch}</div>
        </div>
      </div>

      <div className="wk-play-disclaimer">
        以上剧本基于当前Gamma墙位置自动生成，价格突破/跌破触发条件后方生效。
        本分析不构成交易建议，实际操作需结合成交量、Greeks及风险管理。
      </div>
    </div>
  );
}
