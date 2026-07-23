export default function InsightCarousel({ insights }) {
  if (!insights?.length) return null;

  return (
    <div className="insight-carousel">
      {insights.map((text, i) => (
        <div key={i} className="insight-row">
          <span className="insight-dot" />
          <span className="insight-text">{text}</span>
        </div>
      ))}
    </div>
  );
}
