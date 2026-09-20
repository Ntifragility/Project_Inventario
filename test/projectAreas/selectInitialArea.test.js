import test from 'node:test';
import assert from 'node:assert/strict';
import { selectInitialArea } from '../../src/features/projectAreas/domain/selectInitialArea.js';

const areas = [
  { id: 'wet', code: 'HUMEDA', name: 'Área Húmeda' },
  { id: 'dry', code: 'SECA', name: 'Área Seca' },
];

test('selectInitialArea restores an available saved area', () => {
  assert.equal(selectInitialArea(areas, 'wet').id, 'wet');
});

test('selectInitialArea falls back to SECA when a saved area is stale', () => {
  assert.equal(selectInitialArea(areas, 'removed').id, 'dry');
});

test('selectInitialArea falls back to the first area when SECA is unavailable', () => {
  assert.equal(selectInitialArea([areas[0]], null).id, 'wet');
});

test('selectInitialArea returns null when there are no active areas', () => {
  assert.equal(selectInitialArea([], null), null);
});
