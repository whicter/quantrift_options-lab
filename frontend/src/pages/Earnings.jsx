import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEarningsThisWeek } from '../lib/api';
import { buildEarningsWeekView } from '../lib/earningsCalendar';

export default function Earnings() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(false);
  const [week, setWeek] = useState('current');
  useEffect(() => {
    getEarningsThisWeek(week).then(setRaw).catch(() => setError(true));
  }, [week]);
  const view = buildEarningsWeekView(raw);
  const isNextWeek = week === 'next';
  const selectWeek = (nextWeek) => {
    if (nextWeek === week) return;
    setRaw(null);
    setError(false);
    setWeek(nextWeek);
  };
  const companyInitial = (symbol) => String(symbol || '?').slice(0, 1);

  return (
    <main className="earnings-page">
      <header className="market-head earnings-head">
        <div className="market-kicker">Earnings calendar</div>
        <h1>财报日历</h1>
        <p>仅展示已采集、在覆盖池中的真实财报日期。点击任一标的即可转到策略分析；报前/盘后时间未提供时不作推断。</p>
      </header>

      <div className="earnings-week-tabs" role="tablist" aria-label="财报周次">
        <button type="button" role="tab" aria-selected={!isNextWeek} className={!isNextWeek ? 'active' : ''} onClick={() => selectWeek('current')}>本周</button>
        <button type="button" role="tab" aria-selected={isNextWeek} className={isNextWeek ? 'active' : ''} onClick={() => selectWeek('next')}>下周</button>
      </div>

      {!raw && !error && <div className="earnings-loading">加载本周财报…</div>}
      {error && <div className="earnings-loading">{isNextWeek ? '下周' : '本周'}财报暂不可用。</div>}
      {view.status === 'ready' && (
        <section className="earnings-calendar" aria-label="本周财报日历">
          <div className="earnings-summary"><span>{isNextWeek ? '下周' : '本周'} · {view.weekStart} — {view.weekEnd}</span><b>{view.count} 只标的</b></div>
          <div className="earnings-days">
            {view.days.map(day => (
              <section className={day.isToday ? 'earnings-day earnings-day-today' : 'earnings-day'} key={day.date}>
                <header><b>{day.label}</b><span>{day.dateLabel}</span></header>
                <div className="earnings-symbols">
                  {day.earnings.length === 0 && <p>暂无已知财报</p>}
                  {day.earnings.map(item => (
                    <Link className="earnings-symbol" key={item.symbol} to={`/analyze?symbol=${encodeURIComponent(item.symbol)}`}>
                      <span className="earnings-company-mark" aria-hidden="true">
                        <i>{companyInitial(item.symbol)}</i>
                        {item.iconUrl && <img src={item.iconUrl} alt="" onError={(event) => { event.currentTarget.remove(); }} />}
                      </span>
                      <span className="earnings-company-copy"><strong>{item.symbol}</strong><small>{item.name || '查看策略分析'}</small></span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p className="earnings-foot">数据源：已落库的 earnings_date。此日历仅供研究，不构成买卖建议。</p>
        </section>
      )}
    </main>
  );
}
