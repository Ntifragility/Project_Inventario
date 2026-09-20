import { ValidationError } from '../../../shared/application/errors.js';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validateEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new ValidationError('Ingrese el correo electrónico asociado a su cuenta.');
  }
  return normalized;
}

export function validateNewPassword({ password, confirmPassword, currentPassword }) {
  if (currentPassword !== undefined && !currentPassword) {
    throw new ValidationError('Ingrese su contraseña actual.');
  }
  if (String(password || '').length < 8) {
    throw new ValidationError('La contraseña debe tener al menos 8 caracteres.');
  }
  if (password !== confirmPassword) {
    throw new ValidationError('Las contraseñas no coinciden.');
  }
  if (currentPassword !== undefined && currentPassword === password) {
    throw new ValidationError('La nueva contraseña debe ser diferente de la contraseña actual.');
  }
}

export function normalizeAccountRequest({ fullName, email, areaCode, message }) {
  const normalizedName = String(fullName || '').trim();
  const normalizedEmail = validateEmail(email);
  const normalizedArea = String(areaCode || '').trim().toUpperCase();
  const normalizedMessage = String(message || '').trim();

  if (!normalizedName) throw new ValidationError('Ingrese su nombre completo.');
  if (!['SECA', 'HUMEDA'].includes(normalizedArea)) {
    throw new ValidationError('Seleccione un área válida.');
  }
  if (normalizedMessage.length > 50) {
    throw new ValidationError('El mensaje no puede exceder 50 caracteres.');
  }

  return {
    fullName: normalizedName,
    email: normalizedEmail,
    areaCode: normalizedArea,
    message: normalizedMessage || null,
  };
}
