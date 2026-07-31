const PRICE_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const STRENGTH_LABELS = {
  very_high: '极强',
  high: '强',
  medium: '中等',
  low: '弱',
};

function formatPrice(value) {
  return Number.isFinite(value) ? `$${PRICE_FORMAT.format(value)}` : '—';
}

function formatDistance(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function Indicator({ label, value, detail }) {
  return (
    <div className="tl-indicator">
      <span>{label}</span>
      <strong>{formatPrice(value)}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function StatusBadge({ status, children }) {
  const normalized = status === 'ready' || status === 'fresh' ? 'ready'
    : status === 'stale' ? 'stale'
      : 'missing';
  return <span className={`tl-status tl-status-${normalized}`}>{children}</span>;
}

function ZoneCard({ zone, label }) {
  const isSupport = zone.side === 'support';
  return (
    <article className={`tl-zone tl-zone-${zone.side}`}>
      <div className="tl-zone-head">
        <div>
          <span className="tl-zone-label">{label}</span>
          <strong>{formatPrice(zone.center)}</strong>
        </div>
        <div className="tl-zone-score">
          <span>强度</span>
          <strong>{STRENGTH_LABELS[zone.strength] || zone.strength || '—'}</strong>
        </div>
      </div>
      <div className="tl-zone-range">
        {formatPrice(zone.low)} – {formatPrice(zone.high)}
        <span className={isSupport ? 'tl-negative' : 'tl-positive'}>
          {formatDistance(zone.distance_pct)}
        </span>
      </div>
    </article>
  );
}

function ZoneColumn({ title, zones, side }) {
  return (
    <section className={`tl-zone-column tl-zone-column-${side}`}>
      <h4>{title}</h4>
      {zones.length > 0 ? zones.slice(0, 3).map((zone, index) => (
        <ZoneCard
          key={`${side}-${zone.center}-${index}`}
          zone={zone}
          label={`${side === 'support' ? 'S' : 'R'}${index + 1}`}
        />
      )) : (
        <div className="tl-empty">当前数据未形成可靠{side === 'support' ? '支撑' : '压力'}区域</div>
      )}
    </section>
  );
}

function OptionsStatus({ options }) {
  const gex = options?.gex || { status: 'missing' };
  const oi = options?.oi || { status: 'missing' };
  return (
    <section className="tl-options">
      <div className="tl-section-title">
        <span>期权关键位</span>
        <StatusBadge status={options?.freshness}>
          {options?.freshness === 'fresh' ? '当前'
            : options?.freshness === 'stale' ? '延迟'
              : '暂无数据'}
        </StatusBadge>
      </div>
      <div className="tl-option-grid">
        <div>
          <span>GEX / Gamma</span>
          {gex.status === 'ready' ? (
            <>
              <strong>{gex.gamma_regime || '未知 Regime'}</strong>
              <small>
                Put Wall {formatPrice(Number(gex.put_wall))} · Call Wall {formatPrice(Number(gex.call_wall))}
              </small>
            </>
          ) : (
            <>
              <strong>暂不可用</strong>
              <small>当前没有可用的 Gamma 关键位</small>
            </>
          )}
        </div>
        <div>
          <span>最大 Open Interest</span>
          {oi.status === 'ready' ? (
            <>
              <strong>
                Put {formatPrice(Number(oi.put_wall?.price))} · Call {formatPrice(Number(oi.call_wall?.price))}
              </strong>
              <small>Open Interest 关键位</small>
            </>
          ) : (
            <>
              <strong>暂不可用</strong>
              <small>当前没有可用的 OI 关键位</small>
            </>
          )}
        </div>
      </div>
      {options?.snapshot_ts && (
        <div className="tl-option-meta">
          数据截至 {new Date(options.snapshot_ts).toLocaleString()}
        </div>
      )}
    </section>
  );
}

export default function TechnicalLevelsPanel({ data, loading, error }) {
  if (loading) {
    return <section className="tl-panel tl-state">正在加载技术结构…</section>;
  }
  if (error) {
    return <section className="tl-panel tl-state tl-state-error">技术结构暂不可用。</section>;
  }
  if (!data) return null;
  if (data.status !== 'ready') {
    return (
      <section className="tl-panel tl-state">
        {data.symbol || '该标的'} 的技术结构暂不可用。
      </section>
    );
  }

  const profile = data.volume_profile || {};
  const anchored = data.anchored_vwap || {};
  const indicators = data.indicators || {};

  return (
    <section className="tl-panel">
      <div className="tl-header">
        <div>
          <div className="tl-eyebrow">Technical Support Structure</div>
          <h3>{data.symbol} 支撑 / 压力共振结构</h3>
          <p>截至 {data.latest_date || '—'}</p>
        </div>
        <div className="tl-spot">
          <span>现价</span>
          <strong>{formatPrice(data.spot)}</strong>
        </div>
      </div>

      <div className="tl-indicators">
        <Indicator label="Volume POC" value={Number(profile.poc?.price)} detail={profile.status === 'ready' ? '当前可用' : '数据缺失'} />
        <Indicator label="Anchored VWAP" value={Number(anchored.value)} detail={anchored.anchor?.date ? `锚点 ${anchored.anchor.date}` : '锚点不可用'} />
        <Indicator label="50DMA" value={indicators.dma50} />
        <Indicator label="100DMA" value={indicators.dma100} />
        <Indicator label="200DMA" value={indicators.dma200} />
        <Indicator label="ATR14" value={indicators.atr14} />
      </div>

      <div className="tl-map">
        <ZoneColumn title="上方压力" zones={data.resistances} side="resistance" />
        <div className="tl-current-price">
          <span>MARKET</span>
          <strong>{formatPrice(data.spot)}</strong>
        </div>
        <ZoneColumn title="下方支撑" zones={data.supports} side="support" />
      </div>

      <OptionsStatus options={data.options} />
    </section>
  );
}
