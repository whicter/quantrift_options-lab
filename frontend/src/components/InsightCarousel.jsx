import { useState, useEffect, useRef } from 'react';

export default function InsightCarousel({ insights }) {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!insights || insights.length <= 1) return;
    timerRef.current = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % insights.length);
        setFade(true);
      }, 280);
    }, 3800);
    return () => clearInterval(timerRef.current);
  }, [insights]);

  if (!insights?.length) return null;

  return (
    <div className="insight-carousel">
      <span className="insight-dot" />
      <span className={`insight-text ${fade ? 'insight-in' : 'insight-out'}`}>
        {insights[idx]}
      </span>
      {insights.length > 1 && (
        <div className="insight-pips">
          {insights.map((_, i) => (
            <span key={i} className={`insight-pip ${i === idx ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}
