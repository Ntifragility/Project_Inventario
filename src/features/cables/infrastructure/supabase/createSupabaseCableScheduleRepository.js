import { throwIfSupabaseError } from '../../../../shared/infrastructure/supabase/errors.js';

const BATCH_SIZE = 1000;

async function readAll(buildQuery, fallbackMessage) {
  const rows = [];
  let start = 0;

  while (true) {
    const { data, error } = await buildQuery().range(start, start + BATCH_SIZE - 1);
    throwIfSupabaseError(error, fallbackMessage);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < BATCH_SIZE) break;
    start += BATCH_SIZE;
  }

  return rows;
}

export function createSupabaseCableScheduleRepository(client) {
  return {
    listCircuitCables(areaId) {
      return readAll(
        () => client
          .from('cable_schedule')
          .select('*')
          .eq('project_area_id', areaId)
          .eq('tipo_cable', 'CIRCUITO')
          .ilike('material', 'CABLE%'),
        'No se pudo cargar el cable schedule.'
      );
    },

    listDispatchLengths(areaId) {
      return readAll(
        () => client
          .from('cable_despachos')
          .select('tag_unico, longitud_despachada_m, cable_schedule!inner(project_area_id)')
          .eq('cable_schedule.project_area_id', areaId),
        'No se pudieron cargar los despachos de cable.'
      );
    },
  };
}
