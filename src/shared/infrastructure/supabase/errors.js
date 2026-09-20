import {
  AuthenticationRequiredError,
  ConflictError,
  InfrastructureError,
  PermissionDeniedError,
} from '../../application/errors.js';

const AUTH_CODES = new Set(['bad_jwt', 'invalid_jwt', 'refresh_token_not_found', 'session_not_found']);
const PERMISSION_CODES = new Set(['42501', 'PGRST301']);
const CONFLICT_CODES = new Set(['23505', '409']);

export function translateSupabaseError(error, fallbackMessage) {
  if (!error) return null;

  const options = { cause: error };
  if (AUTH_CODES.has(error.code) || error.status === 401) {
    return new AuthenticationRequiredError(error.message || undefined, options);
  }
  if (PERMISSION_CODES.has(error.code) || error.status === 403) {
    return new PermissionDeniedError(error.message || undefined, options);
  }
  if (CONFLICT_CODES.has(error.code) || error.status === 409) {
    return new ConflictError(error.message || fallbackMessage, options);
  }
  return new InfrastructureError(error.message || fallbackMessage, options);
}

export function throwIfSupabaseError(error, fallbackMessage) {
  const translated = translateSupabaseError(error, fallbackMessage);
  if (translated) throw translated;
}
