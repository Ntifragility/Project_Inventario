import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCableDashboard } from '../../src/features/cables/domain/buildCableDashboard.js';

const cables = [
  {
    id: 'cable-1',
    tag_unico: 'TAG-1',
    material: 'Cable 3x2.5',
    wbs: 'WBS-A',
    sistema: 'SIS-1',
    total_estimado_m: 100,
    metrado_reportado_campo: 60,
    conexion_origen: 'A',
    conexion_destino: 'B',
  },
  {
    id: 'cable-2',
    tag_unico: 'TAG-2',
    material: 'Cable 3x2.5',
    wbs: 'WBS-B',
    sistema: 'SIS-2',
    total_estimado_m: 50,
    metrado_reportado_campo: 50,
    despachado_override_m: 55,
  },
];

const dispatches = [
  { tag_unico: 'TAG-1', longitud_despachada_m: 40 },
  { tag_unico: 'TAG-1', longitud_despachada_m: 30 },
  { tag_unico: 'TAG-2', longitud_despachada_m: 10 },
];

test('buildCableDashboard aggregates dispatches and honors a cable override', () => {
  const result = buildCableDashboard({ cables, dispatches });

  assert.equal(result.kpis.longitudTotal, 150);
  assert.equal(result.kpis.longitudTendida, 110);
  assert.equal(result.kpis.longitudDespachada, 125);
  assert.equal(result.kpis.longitudPendiente, 40);
  assert.equal(result.kpis.circuitosPendientes, 1);
  assert.equal(result.kpis.circuitosDesviados, 2);
  assert.deepEqual(result.kpis.circuitosPorTipo, [{ name: '3X2.5', count: 2 }]);
});

test('buildCableDashboard filters KPI and chart projections without narrowing filter options', () => {
  const result = buildCableDashboard({
    cables,
    dispatches,
    filters: { wbs: 'WBS-A' },
  });

  assert.equal(result.kpis.circuitosTotales, 1);
  assert.equal(result.kpis.longitudTotal, 100);
  assert.equal(result.wbsBars.length, 1);
  assert.equal(result.wbsBars[0].name, 'WBS-A');
  assert.equal(result.filterRows.length, 2);
});
