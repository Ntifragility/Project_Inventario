import { throwIfSupabaseError } from '../../../../shared/infrastructure/supabase/errors.js';

export function createSupabaseProjectAccessRepository(client) {
  return {
    async getMembership(userId) {
      const { data, error } = await client
        .from('project_memberships')
        .select('project_id, role')
        .eq('user_id', userId)
        .maybeSingle();

      throwIfSupabaseError(error, 'No se pudo cargar la membresía del proyecto.');
      return data;
    },

    async listActiveAreas(projectId) {
      const { data, error } = await client
        .from('project_areas')
        .select('id, project_id, code, name')
        .eq('project_id', projectId)
        .eq('active', true)
        .order('name');

      throwIfSupabaseError(error, 'No se pudieron cargar las áreas del proyecto.');
      return data || [];
    },
  };
}
