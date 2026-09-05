import { Radar, Map, Search, AlertTriangle, MoreHorizontal, RefreshCw } from 'lucide-react';

export function SatLinkFeed() {
  return (
    <section className="stonic-satlink-panel">
      <div className="stonic-panel-header">
        <div className="stonic-panel-label">
          <Radar size={12} />
          <span>SAT-LINK FEED</span>
          <span className="stonic-sub-label">SATELLITE STREAM</span>
        </div>
        <div className="stonic-panel-actions">
          <button className="stonic-icon-btn"><MoreHorizontal size={11} /></button>
        </div>
      </div>
      <div className="stonic-update-banner">
        <span className="stonic-update-title">Update Available</span>
        <span className="stronic-update-text">A new version is ready.</span>
        <button className="stonic-banner-btn">Reload</button>
        <button className="stonic-banner-close">×</button>
      </div>
      <div className="stonic-map-container">
        <div className="stonic-map-controls">
          <button className="stonic-map-btn active">▼ Hide Map</button>
          <button className="stonic-map-btn">2D</button>
          <button className="stonic-map-btn">3D</button>
        </div>
        <div className="stonic-map-viewport">
          <img src="/assets/themes/nasi-radar-cyan.svg" alt="Satellite map" className="stonic-map-image" />
          <div className="stonic-map-overlay" />
          <div className="stonic-betabadge">BETA</div>
          <div className="stonic-map-zoom">
            <button className="stonic-zoom-btn">+</button>
            <button className="stonic-zoom-btn">−</button>
            <button className="stonic-zoom-btn target">⌖</button>
          </div>
        </div>
        <div className="stonic-map-labels">
          <div className="stonic-map-label label-one">NORTH ATLANTIC <span>●</span></div>
          <div className="stonic-map-label label-two">PACIFIC ARRAY <span>●</span></div>
          <div className="stonic-map-label label-three">ACTIVE <span>●</span></div>
        </div>
      </div>
      <div className="stonic-map-tabs">
        <button className="active">Today</button>
        <button><Map size={11} /> Map</button>
        <button><Search size={11} /> Search</button>
        <button><AlertTriangle size={11} /> Alerts <span className="stonic-alert-count">3</span></button>
      </div>
      <div className="stonic-feed-time">
        <span className="stonic-live-dot" /> SATELLITE STREAM · UTC 04:03
      </div>
    </section>
  );
}
