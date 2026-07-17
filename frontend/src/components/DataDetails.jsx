function formatDate(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : '--';
}

const STATE_LABELS = {
  fresh: '新鲜快照', delayed: '延迟快照', stale: '过期快照', partial: '部分数据',
  unavailable: '不可用', missing: '不可用', historical: '历史快照',
};

export default function DataDetails({ metadata, compact = false }) {
  if (!metadata) return null;
  const { model = {}, data_state: state = {}, coverage = {}, parameters = {} } = metadata;
  const label = STATE_LABELS[state.status] || '数据状态未知';
  return (
    <details className={`data-details ${compact ? 'data-details-compact' : ''}`} onClick={event => event.stopPropagation()}>
      <summary><span>数据详情</span><small>{label}</small></summary>
      <div className="data-details-grid">
        <div><span>口径</span><strong>{model.version || '未记录'} · {model.unit === 'usd_delta_change_per_1pct_move' ? '标的变动 1%' : model.unit || '--'}</strong></div>
        <div><span>快照</span><strong>{formatDate(state.snapshot_ts)}</strong></div>
        <div><span>覆盖</span><strong>{coverage.contract_count ?? '--'} 份合约 · 完整度 {percent(coverage.completeness_pct)}</strong></div>
        <div><span>到期窗口</span><strong>{coverage.expiry_start || '--'} 至 {coverage.expiry_end || '--'}</strong></div>
        <div><span>定位假设</span><strong>{model.positioning_model || '--'}</strong></div>
        <div><span>计算参数</span><strong>Local ±{parameters.local_gamma_window_pct ?? '--'}% · Flip ±{parameters.gamma_flip_grid_pct ?? '--'}%</strong></div>
      </div>
      {model.positioning_assumption && <p>{model.positioning_assumption}</p>}
    </details>
  );
}
