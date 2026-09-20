export class ApplicationError extends Error {
  constructor(message, { code = 'APPLICATION_ERROR', cause } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ValidationError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, { code: 'VALIDATION_ERROR', ...options });
  }
}

export class AuthenticationRequiredError extends ApplicationError {
  constructor(message = 'Debe iniciar sesión para continuar.', options = {}) {
    super(message, { code: 'AUTHENTICATION_REQUIRED', ...options });
  }
}

export class PermissionDeniedError extends ApplicationError {
  constructor(message = 'No tiene permisos para realizar esta operación.', options = {}) {
    super(message, { code: 'PERMISSION_DENIED', ...options });
  }
}

export class ConflictError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, { code: 'CONFLICT', ...options });
  }
}

export class InfrastructureError extends ApplicationError {
  constructor(message = 'No se pudo completar la operación.', options = {}) {
    super(message, { code: 'INFRASTRUCTURE_ERROR', ...options });
  }
}
