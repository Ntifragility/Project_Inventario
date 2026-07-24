-- Migration to support PAT (Puesta a Tierra) specific columns in cable_schedule
ALTER TABLE cable_schedule ADD COLUMN IF NOT EXISTS wbs VARCHAR(100);
ALTER TABLE cable_schedule ADD COLUMN IF NOT EXISTS plano VARCHAR(255);

-- Update Dashboard Aggregation View to include wbs and plano
CREATE OR REPLACE VIEW v_cable_dashboard AS
SELECT 
    cs.tag_unico,
    cs.wbs,
    cs.plano,
    cs.area,
    cs.servicio,
    cs.tipo_cable,
    cs.tipo_servicio,
    cs.total_estimado_m,
    cs.metrado_reportado_campo,
    cs.conexion_origen,
    cs.conexion_destino,
    cs.estado,

    -- Tendido progress
    cs.total_estimado_m - cs.metrado_reportado_campo AS longitud_pendiente_m,
    CASE WHEN cs.metrado_reportado_campo >= cs.total_estimado_m AND cs.total_estimado_m > 0
         THEN true ELSE false END AS is_tendido,

    -- Despacho totals
    COALESCE(d.total_despachado, 0) AS total_despachado_m,
    COALESCE(d.num_despachos, 0) AS num_despachos

FROM cable_schedule cs
LEFT JOIN (
    SELECT 
        tag_unico,
        SUM(longitud_despachada_m) AS total_despachado,
        COUNT(*) AS num_despachos
    FROM cable_despachos
    GROUP BY tag_unico
) d ON cs.tag_unico = d.tag_unico;
