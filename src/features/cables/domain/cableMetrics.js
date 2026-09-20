export function cleanPatMaterialType(material = '', isPvc = false) {
  const prefix = isPvc ? /^tuberia\s+pvc\s+/i : /^cable\s+/i;
  return String(material).replace(prefix, '').trim().toUpperCase();
}

export function deriveCableMetrics(row, dispatchedOverride) {
  const plannedMeters = parseFloat(row.total_estimado_m) || 0;
  const executedMeters = parseFloat(row.metrado_reportado_campo) || 0;
  const dispatchedMeters = dispatchedOverride === undefined
    ? (parseFloat(row.total_despachado_m ?? row.longitud_despachada_m) || 0)
    : (parseFloat(dispatchedOverride) || 0);
  const pendingMeters = Math.max(0, plannedMeters - executedMeters);
  const advancePercent = plannedMeters > 0
    ? Math.min(100, (executedMeters / plannedMeters) * 100)
    : 0;

  return {
    ...row,
    total_despachado_m: dispatchedMeters,
    longitud_despachada_m: dispatchedMeters,
    longitud_pendiente_m: pendingMeters,
    plannedMeters,
    executedMeters,
    dispatchedMeters,
    pendingMeters,
    advancePercent,
    hasAdvance: plannedMeters > 0 && executedMeters > 0,
    isPending: plannedMeters > 0 && executedMeters < plannedMeters,
    isComplete: plannedMeters > 0 && executedMeters >= plannedMeters,
    hasDeviation: dispatchedMeters > executedMeters,
  };
}

export function matchesDashboardFilter(row, filter) {
  if (!filter) return true;

  if (filter.dateFrom || filter.dateTo) {
    const rowDate = String(row.fecha_tendido || '').slice(0, 10);
    if (!rowDate) return false;
    if (filter.dateFrom && rowDate < filter.dateFrom) return false;
    if (filter.dateTo && rowDate > filter.dateTo) return false;
  }

  if (filter.dimension) {
    const rowValue = filter.dimension === 'tipo'
      ? row.tipo_cable_clean
      : row[filter.dimension];
    const normalizedRowValue = rowValue || null;
    if (normalizedRowValue !== filter.value) return false;
  }

  switch (filter.condition) {
    case 'advance': return row.hasAdvance;
    case 'pending': return row.isPending;
    case 'dispatched': return row.dispatchedMeters > 0;
    case 'deviation': return row.hasDeviation;
    default: return true;
  }
}
