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

    listCables({ areaId, filters, search, sort }) {
      return readAll(
        () => {
          let query = client
            .from('cable_schedule')
            .select('*')
            .eq('project_area_id', areaId)
            .ilike('material', `${filters.materialPrefix}%`);

          if (filters.area) query = query.eq('area', filters.area);
          if (filters.serviceType) query = query.eq('tipo_servicio', filters.serviceType);
          if (filters.cableType) query = query.eq('tipo_cable', filters.cableType);
          if (filters.wbs) query = query.eq('wbs', filters.wbs);
          if (filters.system) query = query.eq('sistema', filters.system);
          if (search?.trim()) {
            const term = search.trim().replace(/\*/g, '%');
            query = query.or(`tag_unico.ilike.%${term}%,tipo_cable.ilike.%${term}%,area.ilike.%${term}%,wbs.ilike.%${term}%,plano.ilike.%${term}%`);
          }
          return query.order(sort.field, { ascending: sort.direction === 'asc' });
        },
        'No se pudo cargar la tabla de cables.'
      );
    },

    listDispatchesForTag({ areaId, tag }) {
      return readAll(
        () => client
          .from('cable_despachos')
          .select('*, cable_schedule!inner(project_area_id)')
          .eq('tag_unico', tag)
          .eq('cable_schedule.project_area_id', areaId)
          .order('fecha_entrega', { ascending: false }),
        'No se pudo cargar el historial de despachos.'
      );
    },

    async getCableImpact({ cableId, areaId }) {
      const { data, error } = await client.rpc('obtener_impacto_cable', {
        p_cable_id: cableId,
        p_project_area_id: areaId,
      });
      throwIfSupabaseError(error, 'No se pudo verificar el impacto del cambio.');
      return data?.[0]?.dispatch_count || 0;
    },

    async renameCable({ cableId, areaId, newTag }) {
      const { error } = await client.rpc('editar_tag_cable_autorizado', {
        p_cable_id: cableId,
        p_project_area_id: areaId,
        p_new_tag: newTag,
      });
      throwIfSupabaseError(error, 'No se pudo actualizar TAG ÚNICO.');
    },

    async deleteCable({ cableId, areaId, confirmTag }) {
      const { error } = await client.rpc('eliminar_cable_autorizado', {
        p_cable_id: cableId,
        p_project_area_id: areaId,
        p_confirm_tag: confirmTag,
      });
      throwIfSupabaseError(error, 'No se pudo eliminar el registro.');
    },

    async updateMeasurement({ cableId, areaId, field, expectedValue, newValue }) {
      const rpcName = field === 'METRADO_OT'
        ? 'actualizar_metrado_ot_cable'
        : 'actualizar_metrado_despachado_cable';
      const { error } = await client.rpc(rpcName, {
        p_cable_id: cableId,
        p_project_area_id: areaId,
        p_expected_old_value: expectedValue,
        p_new_value: newValue,
        p_reason: null,
      });
      throwIfSupabaseError(error, 'No se pudo actualizar el metrado.');
    },

    async registerPatWeld({ cableId, areaId, executionDate, comments }) {
      const { error } = await client.rpc('registrar_soldadura_pat', {
        p_cable_schedule_id: cableId,
        p_project_area_id: areaId,
        p_fecha_ejecucion: executionDate,
        p_comentarios: comments,
      });
      throwIfSupabaseError(error, 'No se pudo registrar la soldadura y sus consumos.');
    },

    async listMeasurementChanges({ areaId, startDate, endDate }) {
      const { data, error } = await client.rpc('exportar_cambios_metrado_cable', {
        p_project_area_id: areaId,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      throwIfSupabaseError(error, 'No se pudo cargar el historial de modificaciones.');
      return data || [];
    },

    async getDispatchExportData(areaId) {
      const cables = await readAll(
        () => client
          .from('cable_schedule')
          .select('id, tag_unico, project_area_id, wbs, sistema, material, tipo_cable, tipo_servicio, total_estimado_m')
          .eq('project_area_id', areaId),
        'No se pudieron cargar los cables para exportar.'
      );
      const areaTags = new Set(cables.map(row => row.tag_unico).filter(Boolean));

      let dispatches;
      try {
        dispatches = await readAll(
          () => client
            .from('cable_despachos')
            .select(`
              id, tag_unico, longitud_despachada_m, vale_almacen, fecha_entrega,
              solicitado_por, observaciones, created_by, created_at,
              cable_schedule!cable_despachos_schedule_id_fkey!inner (
                project_area_id, wbs, sistema, material, tipo_servicio, total_estimado_m
              )
            `)
            .eq('cable_schedule.project_area_id', areaId)
            .order('fecha_entrega', { ascending: false }),
          'No se pudieron cargar los despachos para exportar.'
        );
      } catch (primaryError) {
        console.warn('Primary dispatch export query failed, running fallback:', primaryError);
        const fallback = await readAll(
          () => client
            .from('cable_despachos')
            .select('*')
            .order('fecha_entrega', { ascending: false }),
          'No se pudieron cargar los despachos para exportar.'
        );
        dispatches = fallback.filter(item => areaTags.has(item.tag_unico));
      }

      dispatches = dispatches.filter(item => areaTags.has(item.tag_unico));

      const { data: creators, error } = await client.rpc('get_cable_dispatch_creators', {
        p_project_area_id: areaId,
        p_cable_schedule_id: null,
      });
      throwIfSupabaseError(error, 'No se pudieron cargar los autores de los despachos.');

      return { cables, dispatches, creators: creators || [] };
    },

    async getPatWeldExportData({ areaId, cableIds }) {
      const visibleIds = new Set([...cableIds].map(Number));
      const allReports = await readAll(
        () => client
          .from('pat_soldadura_reportes')
          .select('id, cable_schedule_id, fecha_ejecucion, comentarios, created_at')
          .eq('project_area_id', areaId)
          .is('reversed_at', null),
        'No se pudieron cargar los reportes de soldadura.'
      );
      const reports = allReports.filter(report => visibleIds.has(Number(report.cable_schedule_id)));
      const reportIds = new Set(reports.map(report => report.id));
      if (!reportIds.size) return { reports, consumptions: [] };

      const allConsumptions = await readAll(
        () => client
          .from('pat_soldadura_consumos')
          .select('reporte_id, componente_tipo, componente_descripcion, cantidad, unidad, fecha_consumo')
          .eq('project_area_id', areaId)
          .order('componente_tipo', { ascending: true }),
        'No se pudieron cargar los consumos de soldadura.'
      );
      return {
        reports,
        consumptions: allConsumptions.filter(item => reportIds.has(item.reporte_id)),
      };
    },
  };
}
