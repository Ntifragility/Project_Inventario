import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectAreaApplication } from '../../src/features/projectAreas/application/createProjectAreaApplication.js';

function createFakes({ savedAreaId = null } = {}) {
  const writes = [];
  return {
    writes,
    projectAccessRepository: {
      async getMembership() { return { project_id: 'project-1', role: 'user' }; },
      async listActiveAreas() {
        return [
          { id: 'wet', code: 'HUMEDA', project_id: 'project-1', name: 'Área Húmeda' },
          { id: 'dry', code: 'SECA', project_id: 'project-1', name: 'Área Seca' },
        ];
      },
    },
    areaPreferenceStore: {
      get() { return savedAreaId; },
      set(identity, areaId) { writes.push({ identity, areaId }); },
    },
  };
}

test('loadAccess loads membership, areas, and persists the selected fallback', async () => {
  const fakes = createFakes({ savedAreaId: 'stale-area' });
  const projectAreas = createProjectAreaApplication(fakes);

  const access = await projectAreas.loadAccess('user-1');

  assert.equal(access.activeArea.id, 'dry');
  assert.deepEqual(fakes.writes, [{
    identity: { userId: 'user-1', projectId: 'project-1' },
    areaId: 'dry',
  }]);
});

test('selectArea rejects an area outside the available set', () => {
  const fakes = createFakes();
  const projectAreas = createProjectAreaApplication(fakes);

  const selected = projectAreas.selectArea({
    areaId: 'other-project-area',
    availableAreas: [{ id: 'dry', code: 'SECA' }],
    userId: 'user-1',
    projectId: 'project-1',
  });

  assert.equal(selected, null);
  assert.deepEqual(fakes.writes, []);
});
