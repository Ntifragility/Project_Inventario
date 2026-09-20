import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDispatchSummary,
  normalizeCableDispatch,
} from '../../src/features/cables/domain/cableDispatch.js';

test('normalizeCableDispatch validates and normalizes form values', () => {
  assert.deepEqual(normalizeCableDispatch({
    dispatchedLength: '12.50',
    dispatchDate: '2026-09-21',
    warehouseVoucher: ' V-001 ',
    receivedBy: ' Ana Torres ',
    comments: ' Entrega parcial ',
  }), {
    dispatchedLength: 12.5,
    dispatchDate: '2026-09-21',
    warehouseVoucher: 'V-001',
    receivedBy: 'Ana Torres',
    comments: 'Entrega parcial',
  });
});

test('normalizeCableDispatch rejects a non-positive length', () => {
  assert.throws(
    () => normalizeCableDispatch({
      dispatchedLength: '0',
      dispatchDate: '2026-09-21',
      warehouseVoucher: 'V-001',
      receivedBy: 'Ana',
    }),
    { message: 'Ingrese un metrado numérico válido mayor a cero.' }
  );
});

test('calculateDispatchSummary derives total, progress, and delivery count', () => {
  assert.deepEqual(calculateDispatchSummary([
    { longitud_despachada_m: '20.5' },
    { longitud_despachada_m: 29.5 },
  ], 100), {
    estimatedLength: 100,
    totalDispatched: 50,
    progressPercent: 50,
    deliveryCount: 2,
  });
});
