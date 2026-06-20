import { useState } from 'react';
import { GREEKS_INTRO, GREEKS, GREEKS_INTERACTIONS } from '../data/greeksKnowledge';

// Simple markdown renderer: bold, bullets, tables, paragraphs
function renderMd(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table detection
    if (line.startsWith('|') && lines[i + 1] && lines[i + 1].startsWith('|---')) {
      const headers = line.split('|').filter((c) => c.trim()).map((c) => c.trim());
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').filter((c) => c.trim()).map((c) => c.trim()));
        i++;
      }
      out.push(
        <table key={i} className="gk-table">
          <thead>
            <tr>{headers.map((h, j) => <th key={j}>{inlineMd(h)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{inlineMd(cell)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    // Bullet
    if (line.startsWith('- ') || line.startsWith('→ ')) {
      const bullets = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('→ '))) {
        bullets.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <ul key={i} className="gk-bullets">
          {bullets.map((b, bi) => <li key={bi}>{inlineMd(b)}</li>)}
        </ul>
      );
      continue;
    }

    // Heading-like bold line (starts with **)
    if (line.startsWith('**') && line.endsWith('**')) {
      out.push(<div key={i} className="gk-md-heading">{line.slice(2, -2)}</div>);
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph
    out.push(<p key={i} className="gk-md-p">{inlineMd(line)}</p>);
    i++;
  }

  return out;
}

function inlineMd(text) {
  // Handle **bold** spans
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function GreeksKnowledge() {
  const [activeGreek, setActiveGreek] = useState(0);
  const [openSection, setOpenSection] = useState(null);

  const greek = GREEKS[activeGreek];

  return (
    <div className="gk-page">
      {/* Intro */}
      <div className="gk-intro">{GREEKS_INTRO}</div>

      {/* Greek selector tabs */}
      <div className="gk-tabs">
        {GREEKS.map((g, i) => (
          <button
            key={g.name}
            className={`gk-tab ${activeGreek === i ? 'active' : ''}`}
            style={{ '--g-color': g.color }}
            onClick={() => { setActiveGreek(i); setOpenSection(null); }}
          >
            <span className="gk-tab-symbol">{g.symbol}</span>
            <div className="gk-tab-info">
              <span className="gk-tab-name">{g.name}</span>
              <span className="gk-tab-zh">{g.zh}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Greek detail */}
      <div className="gk-detail">
        <div className="gk-detail-header" style={{ borderColor: greek.color }}>
          <div className="gk-detail-symbol" style={{ color: greek.color }}>{greek.symbol}</div>
          <div>
            <div className="gk-detail-name">{greek.name} <span className="gk-detail-zh">{greek.zh}</span></div>
            <div className="gk-detail-tagline">{greek.tagline}</div>
            <div className="gk-detail-oneliner">{greek.oneliner}</div>
          </div>
        </div>

        <div className="gk-sections">
          {greek.sections.map((sec, si) => {
            const isOpen = openSection === si;
            return (
              <div key={si} className={`gk-section ${isOpen ? 'open' : ''}`}>
                <button
                  className="gk-section-title"
                  onClick={() => setOpenSection(isOpen ? null : si)}
                >
                  <span>{sec.title}</span>
                  <span className="gk-chevron">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <ul className="gk-section-content">
                    {sec.content.map((line, li) => (
                      <li key={li}>{inlineMd(line)}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="gk-rules">
          <div className="gk-rules-title">Key Rules</div>
          <div className="gk-rules-grid">
            {greek.keyRules.map((kr, ki) => (
              <div key={ki} className="gk-rule" style={{ borderColor: kr.color }}>
                <span className="gk-rule-dot" style={{ background: kr.color }} />
                {kr.rule}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactions */}
      <div className="gk-interactions-section">
        <div className="gk-interactions-title">Greeks 相互作用</div>
        <div className="gk-interactions-grid">
          {GREEKS_INTERACTIONS.map((item, idx) => (
            <div key={idx} className="gk-interaction-card" style={{ '--i-color': item.color }}>
              <div className="gk-ic-header">
                <span className="gk-ic-icon">{item.icon}</span>
                <span className="gk-ic-title" style={{ color: item.color }}>{item.title}</span>
              </div>
              <div className="gk-ic-body">
                {renderMd(item.content)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
