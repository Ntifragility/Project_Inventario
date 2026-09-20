import { cleanPatMaterialType, deriveCableMetrics } from './cableMetrics.js';

function buildBars(rows, keySelector) {
  const values = new Map();
  rows.forEach(row => {
    const key = keySelector(row);
    if (!values.has(key)) values.set(key, { tendido: 0, porTender: 0 });
    const entry = values.get(key);
    entry.tendido += row.executedMeters;
    entry.porTender += row.pendingMeters;
  });
  return [...values.entries()].map(([name, value]) => ({
    name,
    tendido: value.tendido,
    porTender: value.porTender,
    total: value.tendido + value.porTender,
  }));
}

export function buildCableDashboard({ cables, dispatches, filters = {} }) {
  const dispatchTotals = new Map();
  dispatches.forEach(dispatch => {
    dispatchTotals.set(
      dispatch.tag_unico,
      (dispatchTotals.get(dispatch.tag_unico) || 0)
        + (Number.parseFloat(dispatch.longitud_despachada_m) || 0)
    );
  });

  const allRows = cables.map(row => ({
    ...deriveCableMetrics(
      row,
      row.despachado_override_m ?? dispatchTotals.get(row.tag_unico) ?? 0
    ),
    tipo_cable_clean: cleanPatMaterialType(row.material) || 'SIN TIPO',
  }));

  const rows = allRows.filter(row => (
    (!filters.type || row.tipo_cable_clean === filters.type)
    && (!filters.wbs || row.wbs === filters.wbs)
    && (!filters.system || row.sistema === filters.system)
  ));

  const longitudTotal = rows.reduce((sum, row) => sum + row.plannedMeters, 0);
  const longitudTendida = rows.reduce((sum, row) => sum + row.executedMeters, 0);
  const longitudPendiente = rows.reduce((sum, row) => sum + row.pendingMeters, 0);
  const longitudDespachada = rows.reduce((sum, row) => sum + row.dispatchedMeters, 0);
  const totalWithOrigen = rows.filter(row => row.conexion_origen).length;
  const totalWithDestino = rows.filter(row => row.conexion_destino).length;
  const withConexOrigen = rows.filter(row => row.conexion_origen && row.isComplete).length;
  const withConexDestino = rows.filter(row => row.conexion_destino && row.isComplete).length;

  const counts = new Map();
  rows.forEach(row => counts.set(row.tipo_cable_clean, (counts.get(row.tipo_cable_clean) || 0) + 1));
  const circuitosPorTipo = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    filterRows: cables.map(({ wbs, sistema, material }) => ({ wbs, sistema, material })),
    kpis: {
      longitudTotal,
      circuitosTotales: rows.length,
      longitudTendida,
      longitudPendiente,
      circuitosPendientes: rows.filter(row => !row.isComplete).length,
      tendidoPct: longitudTotal > 0 ? (longitudTendida / longitudTotal) * 100 : 0,
      longitudDespachada,
      despachadoPct: longitudTotal > 0 ? (longitudDespachada / longitudTotal) * 100 : 0,
      desviacionAlmacen: longitudDespachada - longitudTendida,
      circuitosDesviados: rows.filter(row => row.hasDeviation).length,
      conexOrigenPct: totalWithOrigen > 0 ? (withConexOrigen / totalWithOrigen) * 100 : 0,
      conexDestinoPct: totalWithDestino > 0 ? (withConexDestino / totalWithDestino) * 100 : 0,
      conexOrigenPendientes: totalWithOrigen - withConexOrigen,
      conexDestinoPendientes: totalWithDestino - withConexDestino,
      circuitosPorTipo,
    },
    tipoBars: buildBars(rows, row => row.tipo_cable_clean || 'SIN TIPO'),
    wbsBars: buildBars(rows, row => row.wbs || 'SIN WBS'),
    sistemaBars: buildBars(rows, row => row.sistema || 'SIN SISTEMA'),
  };
}
