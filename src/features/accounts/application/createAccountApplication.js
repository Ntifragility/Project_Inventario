import { ValidationError } from '../../../shared/application/errors.js';
import {
  normalizeAccountRequest,
  validateEmail,
  validateNewPassword,
} from '../domain/accountValidation.js';

export function createAccountApplication({ authGateway, accountRepository }) {
  if (!authGateway || !accountRepository) {
    throw new Error('Account application requires authGateway and accountRepository.');
  }

  return {
    signIn({ email, password }) {
      return authGateway.signIn({ email: validateEmail(email), password });
    },

    requestPasswordReset({ email, redirectTo }) {
      return authGateway.requestPasswordReset({ email: validateEmail(email), redirectTo });
    },

    async completePasswordRecovery({ password, confirmPassword }) {
      validateNewPassword({ password, confirmPassword });
      await authGateway.updatePassword(password);
    },

    submitAccountRequest(request) {
      return accountRepository.submitRequest(normalizeAccountRequest(request));
    },

    getMyRecentActivity(limit = 25) {
      return accountRepository.getMyRecentActivity(limit);
    },

    async changePassword({ email, currentPassword, password, confirmPassword }) {
      validateNewPassword({ password, confirmPassword, currentPassword });
      const normalizedEmail = validateEmail(email);

      try {
        await authGateway.verifyPassword({ email: normalizedEmail, password: currentPassword });
      } catch (error) {
        throw new ValidationError('La contraseña actual no es correcta.', { cause: error });
      }

      await authGateway.updatePassword(password);
    },

    listAccountRequests(status = 'pending') {
      return accountRepository.listRequests(status);
    },

    resolveAccountRequest({ requestId, status }) {
      if (!requestId) throw new ValidationError('La solicitud no tiene un identificador válido.');
      if (!['approved', 'rejected'].includes(status)) {
        throw new ValidationError('El estado de la solicitud no es válido.');
      }
      return accountRepository.resolveRequest({ requestId, status });
    },
  };
}
