import { Globe2, RefreshCw, ExternalLink } from 'lucide-react';

const headlines = [
  'SpaceX IPO raises $35.7B, valuation surpasses $2T.',
  'Apple CEO announces price hikes due to memory costs.',
  'Fox Corporation to acquire Roku for $2.8B.',
  'New satellite array expands Pacific coverage window.',
];

export function HeadlinesPanel() {
  return (
    <section className="stonic-headlines-panel">
      <div className="stonic-panel-header">
        <div className="stonic-panel-label">
          <Globe2 size={12} />
          <span>TODAY HEADLINES</span>
        </div>
        <div className="stonic-panel-actions">
          <button className="stonic-icon-btn" onClick={() => window.location.reload()}>
            <RefreshCw size={11} />
          </button>
          <button className="stonic-icon-btn"><ExternalLink size={11} /></button>
        </div>
      </div>
      <div className="stonic-headlines-list">
        {headlines.map((headline, index) => (
          <div className="stonic-headline" key={headline}>
            <span className="stonic-headline-index">{String(index + 1).padStart(2, '0')}</span>
            <span>{headline}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
