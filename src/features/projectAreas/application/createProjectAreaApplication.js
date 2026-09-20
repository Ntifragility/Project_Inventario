import { ApplicationError, ValidationError } from '../../../shared/application/errors.js';
import { selectInitialArea } from '../domain/selectInitialArea.js';

export function createProjectAreaApplication({ projectAccessRepository, areaPreferenceStore }) {
  if (!projectAccessRepository || !areaPreferenceStore) {
    throw new Error('Project-area application requires a repository and preference store.');
  }

  return {
    async loadAccess(userId) {
      if (!userId) throw new ValidationError('El usuario no tiene una identidad válida.');

      const membership = await projectAccessRepository.getMembership(userId);
      if (!membership) {
        throw new ApplicationError('El usuario no tiene acceso al proyecto actual.', {
          code: 'PROJECT_MEMBERSHIP_NOT_FOUND',
        });
      }

      const availableAreas = await projectAccessRepository.listActiveAreas(membership.project_id);
      if (!availableAreas.length) {
        throw new ApplicationError('El usuario no tiene un área activa asignada.', {
          code: 'ACTIVE_AREA_NOT_FOUND',
        });
      }

      const preferenceKey = { userId, projectId: membership.project_id };
      const savedAreaId = areaPreferenceStore.get(preferenceKey);
      const activeArea = selectInitialArea(availableAreas, savedAreaId);
      areaPreferenceStore.set(preferenceKey, activeArea.id);

      return { membership, availableAreas, activeArea };
    },

    selectArea({ areaId, availableAreas, userId, projectId }) {
      const activeArea = availableAreas.find(area => area.id === areaId);
      if (!activeArea) return null;

      areaPreferenceStore.set({ userId, projectId }, activeArea.id);
      return activeArea;
    },
  };
}
