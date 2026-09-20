import { cleanPatMaterialType, deriveCableMetrics } from './cableMetrics.js';

export function buildCableTableRows({ cables, dispatches, isPvc = false, cleanType = '' }) {
  const dispatchTotals = new Map();
  dispatches.forEach(dispatch => {
    dispatchTotals.set(
      dispatch.tag_unico,
      (dispatchTotals.get(dispatch.tag_unico) || 0)
        + (Number.parseFloat(dispatch.longitud_despachada_m) || 0)
    );
  });

  const rows = cables.map(row => ({
    ...deriveCableMetrics(
      row,
      row.despachado_override_m ?? dispatchTotals.get(row.tag_unico) ?? 0
    ),
    tipo_cable_clean: cleanPatMaterialType(row.material, isPvc) || 'SIN TIPO',
  }));

  return cleanType ? rows.filter(row => row.tipo_cable_clean === cleanType) : rows;
}
