import React from 'react';

/**
 * CableBarChart — Horizontal stacked bar chart component.
 * Renders Tendido (green) vs Por Tender (red) bars for each category.
 *
 * Props:
 * - data: Array of { name, tendido, porTender, total }
 * - title: string
 * - maxItems: number (default 10, limits display for readability)
 */
export default function CableBarChart({ data = [], title = '', maxItems = 10 }) {
  if (!data.length) {
    return (
      <div className="cable-bar-chart-card">
        {title && <h4 className="cable-bar-chart-title">{title}</h4>}
        <div className="cable-bar-empty">Sin datos disponibles</div>
      </div>
    );
  }

  // Sort by total descending and limit
  const sorted = [...data]
    .sort((a, b) => b.total - a.total)
    .slice(0, maxItems);

  const maxTotal = Math.max(...sorted.map(d => d.total), 1);

  return (
    <div className="cable-bar-chart-card">
      {title && (
        <div className="cable-bar-chart-header">
          <h4 className="cable-bar-chart-title">{title}</h4>
          <div className="cable-bar-legend">
            <span className="cable-bar-legend-item">
              <span className="cable-bar-dot" style={{ background: '#10b981' }} />
              Tendido
            </span>
            <span className="cable-bar-legend-item">
              <span className="cable-bar-dot" style={{ background: '#ef4444' }} />
              Por Tender
            </span>
          </div>
        </div>
      )}
      <div className="cable-bar-list">
        {sorted.map((item, i) => {
          const tendidoPct = (item.tendido / maxTotal) * 100;
          const porTenderPct = (item.porTender / maxTotal) * 100;

          return (
            <div className="cable-bar-row" key={i}>
              <div className="cable-bar-label" title={item.name}>
                {truncate(item.name, 14)}
              </div>
              <div className="cable-bar-track">
                <div
                  className="cable-bar-fill cable-bar-tendido"
                  style={{ width: `${tendidoPct}%` }}
                >
                  {item.tendido >= 1000
                    ? `${(item.tendido / 1000).toFixed(0)}K`
                    : item.tendido > 0
                    ? item.tendido.toFixed(0)
                    : ''}
                </div>
                <div
                  className="cable-bar-fill cable-bar-portender"
                  style={{ width: `${porTenderPct}%` }}
                >
                  {item.porTender >= 1000
                    ? `${(item.porTender / 1000).toFixed(0)}K`
                    : item.porTender > 0
                    ? item.porTender.toFixed(0)
                    : ''}
                </div>
              </div>
              <div className="cable-bar-total">
                {item.total >= 1000
                  ? `${(item.total / 1000).toFixed(0)}K`
                  : item.total.toFixed(0)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}
