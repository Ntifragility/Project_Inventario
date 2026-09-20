import test from 'node:test';
import assert from 'node:assert/strict';
import { createCableScheduleApplication } from '../../src/features/cables/application/createCableScheduleApplication.js';

test('loadCircuitDashboard obtains both area-scoped datasets from its repository', async () => {
  const calls = [];
  const cableScheduleRepository = {
    async listCircuitCables(areaId) { calls.push(['cables', areaId]); return []; },
    async listDispatchLengths(areaId) { calls.push(['dispatches', areaId]); return []; },
  };
  const application = createCableScheduleApplication({ cableScheduleRepository });

  const result = await application.loadCircuitDashboard({ areaId: 'area-1', filters: {} });

  assert.deepEqual(calls.sort(), [['cables', 'area-1'], ['dispatches', 'area-1']]);
  assert.equal(result.kpis.circuitosTotales, 0);
});

test('loadCircuitDashboard rejects a missing active area', async () => {
  const application = createCableScheduleApplication({
    cableScheduleRepository: {
      listCircuitCables: async () => [],
      listDispatchLengths: async () => [],
    },
  });

  await assert.rejects(
    application.loadCircuitDashboard({ areaId: '', filters: {} }),
    { message: 'Seleccione un área activa.' }
  );
});

test('renameCable normalizes a new TAG and delegates the authorized mutation', async () => {
  const calls = [];
  const application = createCableScheduleApplication({
    cableScheduleRepository: {
      async renameCable(input) { calls.push(input); },
    },
  });

  await application.renameCable({
    cableId: 'cable-1',
    areaId: 'area-1',
    currentTag: 'OLD-TAG',
    newTag: ' new-tag ',
  });

  assert.deepEqual(calls, [{ cableId: 'cable-1', areaId: 'area-1', newTag: 'NEW-TAG' }]);
});

test('deleteCable requires the exact current TAG confirmation', async () => {
  const application = createCableScheduleApplication({
    cableScheduleRepository: { async deleteCable() {} },
  });

  assert.throws(
    () => application.deleteCable({
      cableId: 'cable-1',
      areaId: 'area-1',
      currentTag: 'TAG-1',
      confirmation: 'tag-1',
    }),
    { message: 'Escriba exactamente el TAG ÚNICO para confirmar.' }
  );
});

test('updateMeasurement rejects negative values before invoking the repository', async () => {
  let invoked = false;
  const application = createCableScheduleApplication({
    cableScheduleRepository: { async updateMeasurement() { invoked = true; } },
  });

  assert.throws(
    () => application.updateMeasurement({
      cableId: 'cable-1',
      areaId: 'area-1',
      field: 'METRADO_OT',
      expectedValue: 10,
      newValue: -1,
    }),
    { message: 'Ingrese un metrado numérico mayor o igual a cero.' }
  );
  assert.equal(invoked, false);
});
