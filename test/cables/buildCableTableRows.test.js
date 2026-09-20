import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCableTableRows } from '../../src/features/cables/domain/buildCableTableRows.js';

test('buildCableTableRows aggregates dispatch totals and derives metrics', () => {
  const rows = buildCableTableRows({
    cables: [{
      id: 1,
      tag_unico: 'TAG-1',
      material: 'Cable 4x4',
      total_estimado_m: 100,
      metrado_reportado_campo: 25,
    }],
    dispatches: [
      { tag_unico: 'TAG-1', longitud_despachada_m: 20 },
      { tag_unico: 'TAG-1', longitud_despachada_m: 15 },
    ],
  });

  assert.equal(rows[0].dispatchedMeters, 35);
  assert.equal(rows[0].pendingMeters, 75);
  assert.equal(rows[0].tipo_cable_clean, '4X4');
});

test('buildCableTableRows filters by normalized material type', () => {
  const rows = buildCableTableRows({
    cables: [
      { tag_unico: 'A', material: 'Cable 4x4' },
      { tag_unico: 'B', material: 'Cable 3x2.5' },
    ],
    dispatches: [],
    cleanType: '3X2.5',
  });

  assert.deepEqual(rows.map(row => row.tag_unico), ['B']);
});
