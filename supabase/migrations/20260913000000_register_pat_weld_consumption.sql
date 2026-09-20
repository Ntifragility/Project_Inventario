-- Register installed PAT welds and their component usage without affecting inventory.
-- CARGA and MOLDE are intentionally stored as text. They can be matched to
-- public.productos later without changing the historical record.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pat_soldadura_reportes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_area_id UUID NOT NULL REFERENCES public.project_areas(id) ON DELETE RESTRICT,
    cable_schedule_id BIGINT NOT NULL REFERENCES public.cable_schedule(id) ON DELETE RESTRICT,
    tag_unico_snapshot VARCHAR(100) NOT NULL,
    soldadura_tipo TEXT NOT NULL,
    cantidad NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (cantidad = 1),
    fecha_ejecucion DATE NOT NULL,
    comentarios TEXT CHECK (LENGTH(comentarios) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
    reversed_at TIMESTAMPTZ,
    reversed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    reversal_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.pat_soldadura_consumos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporte_id UUID NOT NULL REFERENCES public.pat_soldadura_reportes(id) ON DELETE RESTRICT,
    project_area_id UUID NOT NULL REFERENCES public.project_areas(id) ON DELETE RESTRICT,
    cable_schedule_id BIGINT NOT NULL REFERENCES public.cable_schedule(id) ON DELETE RESTRICT,
    tag_unico_snapshot VARCHAR(100) NOT NULL,
    soldadura_tipo TEXT NOT NULL,
    componente_tipo TEXT NOT NULL,
    componente_descripcion TEXT NOT NULL,
    cantidad NUMERIC(14,4) NOT NULL CHECK (cantidad > 0),
    unidad TEXT NOT NULL DEFAULT 'und',
    fecha_consumo DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
    CONSTRAINT uq_pat_soldadura_consumo_componente UNIQUE (reporte_id, componente_descripcion)
);

COMMENT ON TABLE public.pat_soldadura_consumos IS
    'Registro operativo de CARGAS y MOLDES usados por soldadura PAT. No modifica productos ni inventario.';
COMMENT ON COLUMN public.pat_soldadura_consumos.componente_descripcion IS
    'Nombre histórico libre del insumo. Se podrá vincular a productos en una migración futura.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_pat_soldadura_reporte_activo
    ON public.pat_soldadura_reportes(cable_schedule_id)
    WHERE reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pat_soldadura_reportes_area_date
    ON public.pat_soldadura_reportes(project_area_id, fecha_ejecucion DESC);
CREATE INDEX IF NOT EXISTS idx_pat_soldadura_consumos_area_date
    ON public.pat_soldadura_consumos(project_area_id, fecha_consumo DESC);
CREATE INDEX IF NOT EXISTS idx_pat_soldadura_consumos_componente
    ON public.pat_soldadura_consumos(componente_descripcion);

ALTER TABLE public.pat_soldadura_reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pat_soldadura_consumos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pat_soldadura_reportes_area_select ON public.pat_soldadura_reportes;
CREATE POLICY pat_soldadura_reportes_area_select ON public.pat_soldadura_reportes
    FOR SELECT TO authenticated
    USING (public.can_access_project_area(project_area_id));

DROP POLICY IF EXISTS pat_soldadura_consumos_area_select ON public.pat_soldadura_consumos;
CREATE POLICY pat_soldadura_consumos_area_select ON public.pat_soldadura_consumos
    FOR SELECT TO authenticated
    USING (public.can_access_project_area(project_area_id));

-- The browser may only read these ledgers. All writes go through the RPCs below.
REVOKE ALL ON public.pat_soldadura_reportes FROM anon, authenticated;
REVOKE ALL ON public.pat_soldadura_consumos FROM anon, authenticated;
GRANT SELECT ON public.pat_soldadura_reportes TO authenticated;
GRANT SELECT ON public.pat_soldadura_consumos TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_soldadura_pat_reporting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_material TEXT;
    v_changed BOOLEAN;
BEGIN
    v_material := REGEXP_REPLACE(UPPER(BTRIM(COALESCE(NEW.material, ''))), '\s+', ' ', 'g');
    v_changed := CASE
        WHEN TG_OP = 'INSERT' THEN COALESCE(NEW.metrado_reportado_campo, 0) > 0
        ELSE NEW.metrado_reportado_campo IS DISTINCT FROM OLD.metrado_reportado_campo
    END;

    IF v_material LIKE 'SOLDADURA%'
       AND v_changed
       AND current_setting('app.pat_soldadura_report_write', TRUE) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'METRADO CONSTRUCCION de una soldadura debe registrarse mediante Reportar Soldadura.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_soldadura_pat_reporting ON public.cable_schedule;
CREATE TRIGGER enforce_soldadura_pat_reporting
    BEFORE INSERT OR UPDATE OF metrado_reportado_campo ON public.cable_schedule
    FOR EACH ROW EXECUTE FUNCTION public.enforce_soldadura_pat_reporting();

CREATE OR REPLACE FUNCTION public.registrar_soldadura_pat(
    p_cable_schedule_id BIGINT,
    p_project_area_id UUID,
    p_fecha_ejecucion DATE,
    p_comentarios TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_cable public.cable_schedule%ROWTYPE;
    v_material TEXT;
    v_carga TEXT;
    v_molde TEXT;
    v_report_id UUID;
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_access_project_area(p_project_area_id) THEN
        RAISE EXCEPTION 'No tiene acceso al area seleccionada.';
    END IF;
    IF p_fecha_ejecucion IS NULL THEN
        RAISE EXCEPTION 'La fecha de ejecucion es obligatoria.';
    END IF;
    IF LENGTH(COALESCE(p_comentarios, '')) > 500 THEN
        RAISE EXCEPTION 'Los comentarios no pueden superar 500 caracteres.';
    END IF;

    SELECT * INTO v_cable
    FROM public.cable_schedule
    WHERE id = p_cable_schedule_id
      AND project_area_id = p_project_area_id
      AND tipo_cable = 'PAT'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La soldadura no existe en el area activa.';
    END IF;

    v_material := REGEXP_REPLACE(UPPER(BTRIM(COALESCE(v_cable.material, ''))), '\s+', ' ', 'g');
    v_material := REPLACE(REPLACE(v_material, ' -', '-'), '- ', '-');

    CASE v_material
        WHEN 'SOLDADURA T 4/0' THEN
            v_carga := 'CARGA 150'; v_molde := 'MOLDE TAC2Q2Q';
        WHEN 'SOLDADURA T 4/0-2/0' THEN
            v_carga := 'CARGA 90'; v_molde := 'MOLDE TAC2Q2G';
        WHEN 'SOLDADURA X 4/0' THEN
            v_carga := 'CARGA 250'; v_molde := 'MOLDE XBM2Q2Q';
        WHEN 'SOLDADURA GT' THEN
            v_carga := 'CARGA 115'; v_molde := 'MOLDE M-561';
        ELSE
            RAISE EXCEPTION 'El TAG no corresponde a un tipo de soldadura PAT configurado.';
    END CASE;

    IF COALESCE(v_cable.metrado_reportado_campo, 0) >= 1 THEN
        RAISE EXCEPTION 'Esta soldadura ya fue reportada como ejecutada.';
    END IF;

    INSERT INTO public.pat_soldadura_reportes (
        project_area_id, cable_schedule_id, tag_unico_snapshot,
        soldadura_tipo, fecha_ejecucion, comentarios, created_by
    ) VALUES (
        p_project_area_id, v_cable.id, v_cable.tag_unico,
        v_material, p_fecha_ejecucion, NULLIF(BTRIM(p_comentarios), ''), auth.uid()
    ) RETURNING id INTO v_report_id;

    INSERT INTO public.pat_soldadura_consumos (
        reporte_id, project_area_id, cable_schedule_id, tag_unico_snapshot,
        soldadura_tipo, componente_tipo, componente_descripcion,
        cantidad, unidad, fecha_consumo, created_by
    ) VALUES
        (v_report_id, p_project_area_id, v_cable.id, v_cable.tag_unico,
         v_material, 'CARGA', v_carga, 1.0000, 'und', p_fecha_ejecucion, auth.uid()),
        (v_report_id, p_project_area_id, v_cable.id, v_cable.tag_unico,
         v_material, 'MOLDE', v_molde, 0.0167, 'und', p_fecha_ejecucion, auth.uid());

    PERFORM set_config('app.pat_soldadura_report_write', 'true', TRUE);
    UPDATE public.cable_schedule
    SET metrado_reportado_campo = 1,
        fecha_tendido = p_fecha_ejecucion,
        estado = 'Tendido',
        updated_at = NOW()
    WHERE id = v_cable.id;

    RETURN JSONB_BUILD_OBJECT(
        'success', TRUE, 'report_id', v_report_id,
        'tag_unico', v_cable.tag_unico, 'components_registered', 2
    );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_soldadura_pat(BIGINT, UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_soldadura_pat(BIGINT, UUID, DATE, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.revertir_soldadura_pat(
    p_report_id UUID,
    p_project_area_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_report public.pat_soldadura_reportes%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_manage_cable_schedule(p_project_area_id) THEN
        RAISE EXCEPTION 'Solo un administrador o supervisor puede revertir una soldadura.';
    END IF;
    IF NULLIF(BTRIM(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'El motivo de reversion es obligatorio.';
    END IF;

    SELECT * INTO v_report
    FROM public.pat_soldadura_reportes
    WHERE id = p_report_id
      AND project_area_id = p_project_area_id
      AND reversed_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El reporte activo no existe.';
    END IF;

    UPDATE public.pat_soldadura_reportes
    SET reversed_at = NOW(), reversed_by = auth.uid(), reversal_reason = BTRIM(p_reason)
    WHERE id = v_report.id;

    PERFORM set_config('app.pat_soldadura_report_write', 'true', TRUE);
    UPDATE public.cable_schedule
    SET metrado_reportado_campo = 0,
        fecha_tendido = NULL,
        estado = 'Pendiente',
        updated_at = NOW()
    WHERE id = v_report.cable_schedule_id;

    RETURN JSONB_BUILD_OBJECT('success', TRUE, 'report_id', v_report.id);
END;
$$;

REVOKE ALL ON FUNCTION public.revertir_soldadura_pat(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revertir_soldadura_pat(UUID, UUID, TEXT) TO authenticated;

COMMIT;
