import { ValidationError } from '../../../shared/application/errors.js';
import { buildCableDashboard } from '../domain/buildCableDashboard.js';

export function createCableScheduleApplication({ cableScheduleRepository }) {
  if (!cableScheduleRepository) {
    throw new Error('Cable schedule application requires a repository port.');
  }

  return {
    async loadCircuitDashboard({ areaId, filters }) {
      if (!areaId) throw new ValidationError('Seleccione un área activa.');
      const [cables, dispatches] = await Promise.all([
        cableScheduleRepository.listCircuitCables(areaId),
        cableScheduleRepository.listDispatchLengths(areaId),
      ]);
      return buildCableDashboard({ cables, dispatches, filters });
    },
  };
}
