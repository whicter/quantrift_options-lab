import useStrategyStore from '../store/useStrategyStore';

const NOTE_FIELDS = [
  { key: 'build',  label: '策略构成',       en: 'Construction' },
  { key: 'when',   label: '适用场景',       en: 'When to Use' },
  { key: 'strike', label: '行权价选择',     en: 'Strike Selection' },
  { key: 'iv',     label: 'IV 条件',        en: 'IV Conditions' },
  { key: 'dte',    label: 'DTE 选择',       en: 'DTE Selection' },
  { key: 'delta',  label: 'Delta 特性',     en: 'Delta Profile' },
  { key: 'tp',     label: '止盈方式',       en: 'Take Profit' },
  { key: 'sl',     label: '止损方式',       en: 'Stop Loss' },
  { key: 'adj',    label: '跟踪调整计划',   en: 'Adjustment Plan' },
];

export default function StrategyNotes() {
  const { strategy } = useStrategyStore();
  const notes = strategy?.notes || {};

  return (
    <div className="section-card">
      <div className="section-header">
        <div>
          <div className="section-label">Notes</div>
          <div className="section-title">策略说明与管理口径</div>
        </div>
      </div>
      <div className="notes-grid">
        {NOTE_FIELDS.map(({ key, label, en }) => (
          <div key={key} className="note-card">
            <div className="note-label">{en} · {label}</div>
            <div className="note-body">{notes[key] || '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
