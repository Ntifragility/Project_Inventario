import { ValidationError } from '../../../shared/application/errors.js';
import { buildCableDashboard } from '../domain/buildCableDashboard.js';
import { buildCableTableRows } from '../domain/buildCableTableRows.js';

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

    async listCableTable({ areaId, filters, search, sort, isPvc }) {
      if (!areaId) throw new ValidationError('Seleccione un área activa.');
      const [cables, dispatches] = await Promise.all([
        cableScheduleRepository.listCables({ areaId, filters, search, sort }),
        cableScheduleRepository.listDispatchLengths(areaId),
      ]);
      return buildCableTableRows({
        cables,
        dispatches,
        isPvc,
        cleanType: filters.cleanType,
      });
    },

    listDispatchesForTag({ areaId, tag }) {
      if (!areaId || !tag) return [];
      return cableScheduleRepository.listDispatchesForTag({ areaId, tag });
    },

    getCableImpact({ cableId, areaId }) {
      if (!cableId || !areaId) throw new ValidationError('No se pudo identificar el cable o el área.');
      return cableScheduleRepository.getCableImpact({ cableId, areaId });
    },

    renameCable({ cableId, areaId, currentTag, newTag }) {
      const normalizedTag = String(newTag || '').trim().toUpperCase();
      if (!normalizedTag) throw new ValidationError('TAG ÚNICO no puede estar vacío.');
      if (normalizedTag === currentTag) throw new ValidationError('Ingrese un TAG ÚNICO diferente.');
      return cableScheduleRepository.renameCable({ cableId, areaId, newTag: normalizedTag });
    },

    deleteCable({ cableId, areaId, currentTag, confirmation }) {
      if (confirmation !== currentTag) {
        throw new ValidationError('Escriba exactamente el TAG ÚNICO para confirmar.');
      }
      return cableScheduleRepository.deleteCable({ cableId, areaId, confirmTag: confirmation });
    },

    updateMeasurement({ cableId, areaId, field, expectedValue, newValue }) {
      const value = Number(newValue);
      if (!Number.isFinite(value) || value < 0) {
        throw new ValidationError('Ingrese un metrado numérico mayor o igual a cero.');
      }
      if (!['METRADO_OT', 'METRADO_DESPACHADO'].includes(field)) {
        throw new ValidationError('El campo de metrado no es válido.');
      }
      return cableScheduleRepository.updateMeasurement({
        cableId,
        areaId,
        field,
        expectedValue,
        newValue: value,
      });
    },

    registerPatWeld({ cableId, areaId, executionDate, comments }) {
      if (!cableId || !areaId || !executionDate) {
        throw new ValidationError('Complete los datos requeridos para registrar la soldadura.');
      }
      return cableScheduleRepository.registerPatWeld({
        cableId,
        areaId,
        executionDate,
        comments: String(comments || '').trim() || null,
      });
    },

    listMeasurementChanges({ areaId, startDate, endDate }) {
      if (!startDate || !endDate || endDate < startDate) {
        throw new ValidationError('Seleccione un rango de fechas válido.');
      }
      return cableScheduleRepository.listMeasurementChanges({ areaId, startDate, endDate });
    },

    getDispatchExportData(areaId) {
      if (!areaId) throw new ValidationError('Seleccione un área activa.');
      return cableScheduleRepository.getDispatchExportData(areaId);
    },

    getPatWeldExportData({ areaId, cableIds }) {
      if (!areaId) throw new ValidationError('Seleccione un área activa.');
      return cableScheduleRepository.getPatWeldExportData({ areaId, cableIds });
    },
  };
}
