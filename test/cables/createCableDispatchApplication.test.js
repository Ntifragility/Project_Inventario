import test from 'node:test';
import assert from 'node:assert/strict';
import { createCableDispatchApplication } from '../../src/features/cables/application/createCableDispatchApplication.js';

function createFakes() {
  const calls = [];
  return {
    calls,
    dispatchRepository: {
      async listForCable(input) { calls.push(['listForCable', input]); return []; },
      async create(input) { calls.push(['create', input]); },
      async update(id, input) { calls.push(['update', id, input]); },
      async remove(id) { calls.push(['remove', id]); },
    },
    dispatchExporter: {
      exportHistory(input) { calls.push(['exportHistory', input]); },
    },
  };
}

const form = {
  dispatchedLength: '15.25',
  dispatchDate: '2026-09-21',
  warehouseVoucher: 'V-100',
  receivedBy: 'Ana',
  comments: '',
};

test('saveDispatch creates a dispatch using cable id as relationship key', async () => {
  const fakes = createFakes();
  const application = createCableDispatchApplication(fakes);

  await application.saveDispatch({ cableId: 'cable-id', tag: 'TAG-1', form });

  assert.deepEqual(fakes.calls, [['create', {
    cableId: 'cable-id',
    tag: 'TAG-1',
    dispatchedLength: 15.25,
    dispatchDate: '2026-09-21',
    warehouseVoucher: 'V-100',
    receivedBy: 'Ana',
    comments: null,
  }]]);
});

test('saveDispatch updates an existing dispatch without changing its relationship', async () => {
  const fakes = createFakes();
  const application = createCableDispatchApplication(fakes);

  await application.saveDispatch({ dispatchId: 42, cableId: 'ignored', tag: 'ignored', form });

  assert.equal(fakes.calls[0][0], 'update');
  assert.equal(fakes.calls[0][1], 42);
  assert.equal('cableId' in fakes.calls[0][2], false);
  assert.equal('tag' in fakes.calls[0][2], false);
});

test('exportHistory does nothing for an empty history', () => {
  const fakes = createFakes();
  const application = createCableDispatchApplication(fakes);

  assert.equal(application.exportHistory({ tag: 'TAG-1', dispatches: [] }), false);
  assert.deepEqual(fakes.calls, []);
});
