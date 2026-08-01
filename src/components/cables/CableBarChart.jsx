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
export default function CableBarChart({ data = [], title = '', maxItems = 10, dimension = null, onSegmentClick, activeSelection = null }) {
  if (!data.length) {
    return (
      <div className="cable-bar-chart-card">
        {title && <h4 className="cable-bar-chart-title">{title}</h4>}
        <div className="cable-bar-empty">Sin datos disponibles</div>
      </div>
    );
  }

  // Sort by total descending
  const sorted = [...data]
    .sort((a, b) => b.total - a.total);

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
          const filterValue = item.filterValue === undefined ? item.name : item.filterValue;
          const isActive = (condition) => activeSelection
            && activeSelection.dimension === dimension
            && activeSelection.value === filterValue
            && activeSelection.condition === condition;
          const activate = (condition, label) => (event) => {
            event.stopPropagation();
            onSegmentClick?.({
              source: 'chart',
              dimension,
              value: filterValue,
              label: item.name,
              condition,
              segmentLabel: label,
            });
          };
          const handleKey = (condition, label) => (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              activate(condition, label)(event);
            }
          };

          return (
            <div className="cable-bar-row" key={i} title={`${item.name} — Tendido: ${item.tendido.toLocaleString()} m, Por Tender: ${item.porTender.toLocaleString()} m (Total: ${item.total.toLocaleString()} m)`}>
              <div className="cable-bar-label" title={item.name}>
                {item.name}
              </div>
              <div className="cable-bar-track">
                <div
                  className={`cable-bar-fill cable-bar-tendido ${item.tendido > 0 ? 'clickable' : ''} ${isActive('advance') ? 'active' : ''}`}
                  style={{ width: `${tendidoPct}%` }}
                  onClick={item.tendido > 0 ? activate('advance', 'Con avance') : undefined}
                  onKeyDown={item.tendido > 0 ? handleKey('advance', 'Con avance') : undefined}
                  role={item.tendido > 0 ? 'button' : undefined}
                  tabIndex={item.tendido > 0 ? 0 : undefined}
                  aria-label={item.tendido > 0 ? `Mostrar ${item.name}: con avance` : undefined}
                >
                  {tendidoPct >= 6 && (item.tendido >= 10000
                    ? `${(item.tendido / 1000).toFixed(0)}K`
                    : item.tendido > 0
                    ? Math.round(item.tendido).toLocaleString()
                    : '')}
                </div>
                <div
                  className={`cable-bar-fill cable-bar-portender ${item.porTender > 0 ? 'clickable' : ''} ${isActive('pending') ? 'active' : ''}`}
                  style={{ width: `${porTenderPct}%` }}
                  onClick={item.porTender > 0 ? activate('pending', 'Pendientes') : undefined}
                  onKeyDown={item.porTender > 0 ? handleKey('pending', 'Pendientes') : undefined}
                  role={item.porTender > 0 ? 'button' : undefined}
                  tabIndex={item.porTender > 0 ? 0 : undefined}
                  aria-label={item.porTender > 0 ? `Mostrar ${item.name}: pendientes` : undefined}
                >
                  {porTenderPct >= 6 && (item.porTender >= 10000
                    ? `${(item.porTender / 1000).toFixed(0)}K`
                    : item.porTender > 0
                    ? Math.round(item.porTender).toLocaleString()
                    : '')}
                </div>
              </div>
              <div className="cable-bar-total">
                {item.total >= 10000
                  ? `${(item.total / 1000).toFixed(0)}K`
                  : Math.round(item.total).toLocaleString()}
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
