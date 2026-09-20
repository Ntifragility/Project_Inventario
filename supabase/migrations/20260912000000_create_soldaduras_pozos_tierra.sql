-- Independent operational modules for Soldaduras and Pozos a Tierra.
-- Both use quantities in UND and the existing project-area security model.

BEGIN;

CREATE TABLE IF NOT EXISTS public.soldaduras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_area_id UUID NOT NULL REFERENCES public.project_areas(id) ON DELETE RESTRICT,
    codigo_unico TEXT NOT NULL,
    wbs TEXT NOT NULL,
    sistema TEXT NOT NULL,
    plano TEXT,
    tipo TEXT NOT NULL,
    descripcion TEXT,
    cantidad_ot NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cantidad_ot >= 0),
    cantidad_ejecutada NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cantidad_ejecutada >= 0),
    fecha_ejecucion DATE,
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'En proceso', 'Completado')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT soldaduras_codigo_area_key UNIQUE (project_area_id, codigo_unico)
);

CREATE TABLE IF NOT EXISTS public.pozos_tierra (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_area_id UUID NOT NULL REFERENCES public.project_areas(id) ON DELETE RESTRICT,
    codigo_unico TEXT NOT NULL,
    wbs TEXT NOT NULL,
    sistema TEXT NOT NULL,
    plano TEXT,
    tipo TEXT NOT NULL,
    descripcion TEXT,
    cantidad_ot NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cantidad_ot >= 0),
    cantidad_ejecutada NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cantidad_ejecutada >= 0),
    fecha_ejecucion DATE,
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'En proceso', 'Completado')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT pozos_tierra_codigo_area_key UNIQUE (project_area_id, codigo_unico)
);

CREATE TABLE IF NOT EXISTS public.soldaduras_avances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soldadura_id UUID NOT NULL REFERENCES public.soldaduras(id) ON DELETE CASCADE,
    cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    fecha_avance DATE NOT NULL DEFAULT CURRENT_DATE,
    comentarios TEXT CHECK (LENGTH(comentarios) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.pozos_tierra_avances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pozo_tierra_id UUID NOT NULL REFERENCES public.pozos_tierra(id) ON DELETE CASCADE,
    cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
    fecha_avance DATE NOT NULL DEFAULT CURRENT_DATE,
    comentarios TEXT CHECK (LENGTH(comentarios) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_soldaduras_area_wbs ON public.soldaduras(project_area_id, wbs);
CREATE INDEX IF NOT EXISTS idx_soldaduras_area_sistema ON public.soldaduras(project_area_id, sistema);
CREATE INDEX IF NOT EXISTS idx_soldaduras_area_tipo ON public.soldaduras(project_area_id, tipo);
CREATE INDEX IF NOT EXISTS idx_pozos_tierra_area_wbs ON public.pozos_tierra(project_area_id, wbs);
CREATE INDEX IF NOT EXISTS idx_pozos_tierra_area_sistema ON public.pozos_tierra(project_area_id, sistema);
CREATE INDEX IF NOT EXISTS idx_pozos_tierra_area_tipo ON public.pozos_tierra(project_area_id, tipo);
CREATE INDEX IF NOT EXISTS idx_soldaduras_avances_parent_date ON public.soldaduras_avances(soldadura_id, fecha_avance);
CREATE INDEX IF NOT EXISTS idx_pozos_tierra_avances_parent_date ON public.pozos_tierra_avances(pozo_tierra_id, fecha_avance);

CREATE OR REPLACE FUNCTION public.set_work_item_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_role := public.current_project_role_for_area(NEW.project_area_id);
        IF v_role NOT IN ('admin', 'supervisor') THEN
            RAISE EXCEPTION 'Solo un administrador o supervisor puede crear registros maestros.';
        END IF;
        NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    ELSE
        IF NEW.project_area_id IS DISTINCT FROM OLD.project_area_id THEN
            RAISE EXCEPTION 'No se puede cambiar el área de un registro.';
        END IF;
        IF current_setting('app.work_item_progress_write', TRUE) IS DISTINCT FROM 'true' THEN
            v_role := public.current_project_role_for_area(NEW.project_area_id);
            IF v_role NOT IN ('admin', 'supervisor') THEN
                RAISE EXCEPTION 'Solo un administrador o supervisor puede editar registros maestros.';
            END IF;
        END IF;
    END IF;

    IF NEW.cantidad_ejecutada = 0 THEN
        NEW.estado := 'Pendiente';
        NEW.fecha_ejecucion := NULL;
    ELSIF NEW.cantidad_ejecutada >= NEW.cantidad_ot AND NEW.cantidad_ot > 0 THEN
        NEW.estado := 'Completado';
    ELSE
        NEW.estado := 'En proceso';
    END IF;
    NEW.updated_at := NOW();
    NEW.updated_by := auth.uid();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_soldadura_avance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id UUID := COALESCE(NEW.soldadura_id, OLD.soldadura_id);
    v_total NUMERIC(12,2);
    v_latest DATE;
    v_planned NUMERIC(12,2);
BEGIN
    SELECT COALESCE(SUM(cantidad), 0), MAX(fecha_avance)
    INTO v_total, v_latest
    FROM public.soldaduras_avances
    WHERE soldadura_id = v_id;

    SELECT cantidad_ot INTO v_planned FROM public.soldaduras WHERE id = v_id FOR UPDATE;
    IF v_total > v_planned THEN
        RAISE EXCEPTION 'El avance acumulado no puede superar la CANTIDAD OT.';
    END IF;

    PERFORM set_config('app.work_item_progress_write', 'true', TRUE);
    UPDATE public.soldaduras
    SET cantidad_ejecutada = v_total, fecha_ejecucion = v_latest
    WHERE id = v_id;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_pozo_tierra_avance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id UUID := COALESCE(NEW.pozo_tierra_id, OLD.pozo_tierra_id);
    v_total NUMERIC(12,2);
    v_latest DATE;
    v_planned NUMERIC(12,2);
BEGIN
    SELECT COALESCE(SUM(cantidad), 0), MAX(fecha_avance)
    INTO v_total, v_latest
    FROM public.pozos_tierra_avances
    WHERE pozo_tierra_id = v_id;

    SELECT cantidad_ot INTO v_planned FROM public.pozos_tierra WHERE id = v_id FOR UPDATE;
    IF v_total > v_planned THEN
        RAISE EXCEPTION 'El avance acumulado no puede superar la CANTIDAD OT.';
    END IF;

    PERFORM set_config('app.work_item_progress_write', 'true', TRUE);
    UPDATE public.pozos_tierra
    SET cantidad_ejecutada = v_total, fecha_ejecucion = v_latest
    WHERE id = v_id;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_soldaduras_status ON public.soldaduras;
CREATE TRIGGER set_soldaduras_status BEFORE INSERT OR UPDATE ON public.soldaduras
FOR EACH ROW EXECUTE FUNCTION public.set_work_item_status();
DROP TRIGGER IF EXISTS set_pozos_tierra_status ON public.pozos_tierra;
CREATE TRIGGER set_pozos_tierra_status BEFORE INSERT OR UPDATE ON public.pozos_tierra
FOR EACH ROW EXECUTE FUNCTION public.set_work_item_status();
DROP TRIGGER IF EXISTS recalculate_soldadura_avance ON public.soldaduras_avances;
CREATE TRIGGER recalculate_soldadura_avance AFTER INSERT OR UPDATE OR DELETE ON public.soldaduras_avances
FOR EACH ROW EXECUTE FUNCTION public.recalculate_soldadura_avance();
DROP TRIGGER IF EXISTS recalculate_pozo_tierra_avance ON public.pozos_tierra_avances;
CREATE TRIGGER recalculate_pozo_tierra_avance AFTER INSERT OR UPDATE OR DELETE ON public.pozos_tierra_avances
FOR EACH ROW EXECUTE FUNCTION public.recalculate_pozo_tierra_avance();

ALTER TABLE public.soldaduras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pozos_tierra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soldaduras_avances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pozos_tierra_avances ENABLE ROW LEVEL SECURITY;

CREATE POLICY soldaduras_select ON public.soldaduras FOR SELECT TO authenticated
USING (public.can_access_project_area(project_area_id));
CREATE POLICY soldaduras_manage ON public.soldaduras FOR ALL TO authenticated
USING (public.can_manage_cable_schedule(project_area_id))
WITH CHECK (public.can_manage_cable_schedule(project_area_id));
CREATE POLICY pozos_tierra_select ON public.pozos_tierra FOR SELECT TO authenticated
USING (public.can_access_project_area(project_area_id));
CREATE POLICY pozos_tierra_manage ON public.pozos_tierra FOR ALL TO authenticated
USING (public.can_manage_cable_schedule(project_area_id))
WITH CHECK (public.can_manage_cable_schedule(project_area_id));
CREATE POLICY soldaduras_avances_select ON public.soldaduras_avances FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.soldaduras s WHERE s.id = soldadura_id AND public.can_access_project_area(s.project_area_id)));
CREATE POLICY soldaduras_avances_insert ON public.soldaduras_avances FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.soldaduras s WHERE s.id = soldadura_id AND public.can_access_project_area(s.project_area_id)));
CREATE POLICY soldaduras_avances_manage ON public.soldaduras_avances FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.soldaduras s WHERE s.id = soldadura_id AND public.can_manage_cable_schedule(s.project_area_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.soldaduras s WHERE s.id = soldadura_id AND public.can_manage_cable_schedule(s.project_area_id)));
CREATE POLICY soldaduras_avances_delete ON public.soldaduras_avances FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.soldaduras s WHERE s.id = soldadura_id AND public.can_manage_cable_schedule(s.project_area_id)));
CREATE POLICY pozos_tierra_avances_select ON public.pozos_tierra_avances FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.pozos_tierra p WHERE p.id = pozo_tierra_id AND public.can_access_project_area(p.project_area_id)));
CREATE POLICY pozos_tierra_avances_insert ON public.pozos_tierra_avances FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.pozos_tierra p WHERE p.id = pozo_tierra_id AND public.can_access_project_area(p.project_area_id)));
CREATE POLICY pozos_tierra_avances_manage ON public.pozos_tierra_avances FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.pozos_tierra p WHERE p.id = pozo_tierra_id AND public.can_manage_cable_schedule(p.project_area_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.pozos_tierra p WHERE p.id = pozo_tierra_id AND public.can_manage_cable_schedule(p.project_area_id)));
CREATE POLICY pozos_tierra_avances_delete ON public.pozos_tierra_avances FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.pozos_tierra p WHERE p.id = pozo_tierra_id AND public.can_manage_cable_schedule(p.project_area_id)));

COMMIT;
