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
