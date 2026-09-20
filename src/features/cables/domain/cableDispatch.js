import { ValidationError } from '../../../shared/application/errors.js';

export function normalizeCableDispatch(input) {
  const dispatchedLength = Number.parseFloat(input.dispatchedLength);
  const dispatchDate = String(input.dispatchDate || '').trim();
  const warehouseVoucher = String(input.warehouseVoucher || '').trim();
  const receivedBy = String(input.receivedBy || '').trim();
  const comments = String(input.comments || '').trim();

  if (!Number.isFinite(dispatchedLength) || dispatchedLength <= 0) {
    throw new ValidationError('Ingrese un metrado numérico válido mayor a cero.');
  }
  if (!dispatchDate) throw new ValidationError('Seleccione una fecha de despacho.');
  if (!warehouseVoucher) throw new ValidationError('Ingrese el número de vale de almacén.');
  if (!receivedBy) throw new ValidationError('Ingrese quién recibió la entrega.');
  if (comments.length > 50) {
    throw new ValidationError('Los comentarios no pueden superar los 50 caracteres.');
  }

  return {
    dispatchedLength,
    dispatchDate,
    warehouseVoucher,
    receivedBy,
    comments: comments || null,
  };
}

export function calculateDispatchSummary(dispatches, estimatedLength) {
  const totalDispatched = dispatches.reduce(
    (sum, item) => sum + (Number.parseFloat(item.longitud_despachada_m) || 0),
    0
  );
  const estimated = Number.parseFloat(estimatedLength) || 0;

  return {
    estimatedLength: estimated,
    totalDispatched,
    progressPercent: estimated > 0 ? (totalDispatched / estimated) * 100 : 0,
    deliveryCount: dispatches.length,
  };
}
