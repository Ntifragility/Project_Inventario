import { ValidationError } from '../../../shared/application/errors.js';
import { normalizeCableDispatch } from '../domain/cableDispatch.js';

export function createCableDispatchApplication({ dispatchRepository, dispatchExporter }) {
  if (!dispatchRepository || !dispatchExporter) {
    throw new Error('Cable dispatch application requires repository and exporter ports.');
  }

  return {
    listDispatches({ cableId, tag, areaId }) {
      if (!cableId || !tag || !areaId) {
        throw new ValidationError('No se pudo identificar el cable o el área activa.');
      }
      return dispatchRepository.listForCable({ cableId, tag, areaId });
    },

    saveDispatch({ dispatchId, cableId, tag, form }) {
      const dispatch = normalizeCableDispatch(form);
      if (dispatchId) return dispatchRepository.update(dispatchId, dispatch);
      if (!cableId || !tag) throw new ValidationError('No se pudo identificar el cable.');
      return dispatchRepository.create({ cableId, tag, ...dispatch });
    },

    deleteDispatch(dispatchId) {
      if (!dispatchId) throw new ValidationError('El despacho no tiene un identificador válido.');
      return dispatchRepository.remove(dispatchId);
    },

    exportHistory({ tag, dispatches }) {
      if (!dispatches?.length) return false;
      dispatchExporter.exportHistory({ tag, dispatches });
      return true;
    },
  };
}
