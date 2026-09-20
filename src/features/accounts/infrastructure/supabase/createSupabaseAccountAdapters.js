import { throwIfSupabaseError } from '../../../../shared/infrastructure/supabase/errors.js';

export function createSupabaseAuthGateway(client) {
  return {
    async signIn({ email, password }) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      throwIfSupabaseError(error, 'No se pudo iniciar sesión.');
      return data;
    },

    async verifyPassword({ email, password }) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      throwIfSupabaseError(error, 'No se pudo verificar la contraseña.');
      return data;
    },

    async requestPasswordReset({ email, redirectTo }) {
      const { data, error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      throwIfSupabaseError(error, 'No se pudo enviar el enlace de recuperación.');
      return data;
    },

    async updatePassword(password) {
      const { data, error } = await client.auth.updateUser({ password });
      throwIfSupabaseError(error, 'No se pudo actualizar la contraseña.');
      return data;
    },
  };
}

export function createSupabaseAccountRepository(client) {
  return {
    async submitRequest({ fullName, email, areaCode, message }) {
      const { data, error } = await client.rpc('submit_account_request', {
        p_full_name: fullName,
        p_email: email,
        p_area_code: areaCode,
        p_message: message,
      });
      throwIfSupabaseError(error, 'No se pudo enviar la solicitud.');
      return data;
    },

    async getMyRecentActivity(limit) {
      const { data, error } = await client.rpc('get_my_recent_activity', { p_limit: limit });
      throwIfSupabaseError(error, 'No se pudo cargar la actividad reciente.');
      return data || [];
    },

    async listRequests(status) {
      const { data, error } = await client.rpc('list_account_requests', { p_status: status });
      throwIfSupabaseError(error, 'No se pudieron cargar las solicitudes.');
      return data || [];
    },

    async resolveRequest({ requestId, status }) {
      const { data, error } = await client.rpc('resolve_account_request', {
        p_request_id: requestId,
        p_status: status,
      });
      throwIfSupabaseError(error, 'No se pudo resolver la solicitud.');
      return data;
    },
  };
}
