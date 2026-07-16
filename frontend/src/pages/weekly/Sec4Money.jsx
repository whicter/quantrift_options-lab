export default function Sec4Money({ data }) {
  const positioning = data.positioning;
  if (positioning.status !== 'ready') return <div className="az-card"><div className="az-card-title">ΔOI 历史不足</div><p>需要至少两次可比较的 Open Interest 快照。</p></div>;
  return (
    <div className="wk-section">
      <div className="wk-section-subtitle">期权仓位变化</div>
      <div className="wk-money-summary">
        <div className="wk-money-stat"><div className="wk-money-label">本周合计 ΔOI</div><div className="wk-money-val">{positioning.total_oi_delta.toLocaleString()}</div></div>
      </div>
      <div className="az-card">
        <div className="wk-migration-table">
          <div className="wk-mig-header"><span>日期</span><span>ΔOI</span><span>异动合约</span></div>
          {positioning.history.map(row => (
            <div className="wk-mig-row" key={row.date}><span>{row.date}</span><span>{row.oi_delta.toLocaleString()}</span><span>{row.unusual_count}</span></div>
          ))}
        </div>
      </div>
      <div className="wk-note">这是连续快照的 Open Interest 变化，不是资金净流入，也不推断机构买卖方向。</div>
    </div>
  );
}
