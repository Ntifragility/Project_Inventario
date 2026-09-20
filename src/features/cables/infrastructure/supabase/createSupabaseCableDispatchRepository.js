import { throwIfSupabaseError } from '../../../../shared/infrastructure/supabase/errors.js';

function toPersistence(dispatch) {
  return {
    longitud_despachada_m: dispatch.dispatchedLength,
    vale_almacen: dispatch.warehouseVoucher,
    fecha_entrega: dispatch.dispatchDate,
    solicitado_por: dispatch.receivedBy,
    observaciones: dispatch.comments,
  };
}

export function createSupabaseCableDispatchRepository(client) {
  return {
    async listForCable({ cableId, tag, areaId }) {
      const { data, error } = await client
        .from('cable_despachos')
        .select('*, cable_schedule!inner(project_area_id)')
        .eq('cable_schedule_id', cableId)
        .eq('tag_unico', tag)
        .eq('cable_schedule.project_area_id', areaId)
        .order('fecha_entrega', { ascending: false })
        .order('id', { ascending: false });
      throwIfSupabaseError(error, 'Error al cargar el historial de despachos.');

      const { data: creators, error: creatorsError } = await client.rpc('get_cable_dispatch_creators', {
        p_project_area_id: areaId,
        p_cable_schedule_id: cableId,
      });
      if (creatorsError) {
        console.warn('Could not load dispatch creators:', creatorsError);
      }
      const creatorMap = new Map((creators || []).map(item => [item.dispatch_id, item.created_by_name]));

      return (data || []).map(item => ({
        ...item,
        created_by_name: creatorMap.get(item.id)
          || (item.created_by ? String(item.created_by) : 'Registro anterior'),
      }));
    },

    async create(dispatch) {
      const { error } = await client
        .from('cable_despachos')
        .insert([{
          cable_schedule_id: dispatch.cableId,
          tag_unico: dispatch.tag,
          ...toPersistence(dispatch),
        }]);
      throwIfSupabaseError(error, 'Error al registrar el despacho.');
    },

    async update(dispatchId, dispatch) {
      const { error } = await client
        .from('cable_despachos')
        .update(toPersistence(dispatch))
        .eq('id', dispatchId);
      throwIfSupabaseError(error, 'Error al actualizar el despacho.');
    },

    async remove(dispatchId) {
      const { error } = await client
        .from('cable_despachos')
        .delete()
        .eq('id', dispatchId);
      throwIfSupabaseError(error, 'Error al eliminar el despacho.');
    },
  };
}
