BEGIN;

-- Allow a project supervisor role for controlled cable maintenance.
ALTER TABLE public.project_memberships
    DROP CONSTRAINT IF EXISTS project_memberships_role_check;
ALTER TABLE public.project_memberships
    ADD CONSTRAINT project_memberships_role_check
    CHECK (role IN ('admin', 'supervisor', 'user'));

-- Use the immutable schedule ID as the real dispatch relationship.
ALTER TABLE public.cable_despachos
    ADD COLUMN IF NOT EXISTS cable_schedule_id BIGINT;

UPDATE public.cable_despachos cd
SET cable_schedule_id = cs.id
FROM public.cable_schedule cs
WHERE cd.cable_schedule_id IS NULL
  AND cd.tag_unico = cs.tag_unico;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.cable_despachos
        WHERE cable_schedule_id IS NULL
    ) THEN
        RAISE EXCEPTION 'There are dispatch rows without a matching cable_schedule row.';
    END IF;
END;
$$;

ALTER TABLE public.cable_despachos
    ALTER COLUMN cable_schedule_id SET NOT NULL;

DO $$
DECLARE
    v_constraint RECORD;
BEGIN
    FOR v_constraint IN
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = 'public.cable_despachos'::regclass
          AND c.confrelid = 'public.cable_schedule'::regclass
          AND c.contype = 'f'
          AND pg_get_constraintdef(c.oid) ILIKE 'FOREIGN KEY (tag_unico)%'
    LOOP
        EXECUTE FORMAT(
            'ALTER TABLE public.cable_despachos DROP CONSTRAINT %I',
            v_constraint.conname
        );
    END LOOP;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'cable_despachos_schedule_id_fkey'
          AND conrelid = 'public.cable_despachos'::regclass
    ) THEN
        ALTER TABLE public.cable_despachos
            ADD CONSTRAINT cable_despachos_schedule_id_fkey
            FOREIGN KEY (cable_schedule_id)
            REFERENCES public.cable_schedule(id)
            ON DELETE CASCADE;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_cable_despachos_schedule_id
    ON public.cable_despachos(cable_schedule_id);

COMMENT ON COLUMN public.cable_despachos.cable_schedule_id IS
    'Immutable relationship to cable_schedule.id. tag_unico remains a synchronized operational value.';

CREATE OR REPLACE FUNCTION public.can_manage_cable_schedule(p_project_area_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.can_access_project_area(p_project_area_id)
       AND EXISTS (
            SELECT 1
            FROM public.project_areas pa
            JOIN public.project_memberships pm
              ON pm.project_id = pa.project_id
             AND pm.user_id = auth.uid()
            WHERE pa.id = p_project_area_id
              AND pm.role IN ('admin', 'supervisor')
       );
$$;

REVOKE ALL ON FUNCTION public.can_manage_cable_schedule(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_cable_schedule(UUID) TO authenticated;

-- Direct updates may still modify imported measurements, but TAG UNICO changes
-- must go through the authorized RPC below.
CREATE OR REPLACE FUNCTION public.guard_cable_tag_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.tag_unico IS DISTINCT FROM OLD.tag_unico
       AND COALESCE(current_setting('app.authorized_cable_tag_change', TRUE), '') <> 'true' THEN
        RAISE EXCEPTION 'TAG UNICO must be changed through editar_tag_cable_autorizado().';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_cable_tag_change ON public.cable_schedule;
CREATE TRIGGER guard_cable_tag_change
    BEFORE UPDATE OF tag_unico ON public.cable_schedule
    FOR EACH ROW EXECUTE FUNCTION public.guard_cable_tag_change();

CREATE OR REPLACE FUNCTION public.sync_cable_dispatch_tag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.tag_unico IS DISTINCT FROM OLD.tag_unico THEN
        UPDATE public.cable_despachos
        SET tag_unico = NEW.tag_unico
        WHERE cable_schedule_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_cable_dispatch_tag ON public.cable_schedule;
CREATE TRIGGER sync_cable_dispatch_tag
    AFTER UPDATE OF tag_unico ON public.cable_schedule
    FOR EACH ROW EXECUTE FUNCTION public.sync_cable_dispatch_tag();

CREATE OR REPLACE FUNCTION public.audit_cable_schedule_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_dispatch_count BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.tag_unico IS DISTINCT FROM OLD.tag_unico THEN
        SELECT COUNT(*) INTO v_dispatch_count
        FROM public.cable_despachos
        WHERE cable_schedule_id = NEW.id;

        INSERT INTO public.audit_log (
            tabla, operacion, registro_id,
            datos_anteriores, datos_nuevos, usuario_id
        ) VALUES (
            'cable_schedule', 'UPDATE', NEW.id::TEXT,
            to_jsonb(OLD) || jsonb_build_object('dispatch_count', v_dispatch_count),
            to_jsonb(NEW) || jsonb_build_object('dispatch_count', v_dispatch_count),
            auth.uid()
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        SELECT COUNT(*) INTO v_dispatch_count
        FROM public.cable_despachos
        WHERE cable_schedule_id = OLD.id;

        INSERT INTO public.audit_log (
            tabla, operacion, registro_id,
            datos_anteriores, usuario_id
        ) VALUES (
            'cable_schedule', 'DELETE', OLD.id::TEXT,
            to_jsonb(OLD) || jsonb_build_object('dispatch_count', v_dispatch_count),
            auth.uid()
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_cable_schedule_update ON public.cable_schedule;
DROP TRIGGER IF EXISTS audit_cable_schedule_delete ON public.cable_schedule;
CREATE TRIGGER audit_cable_schedule_update
    AFTER UPDATE OF tag_unico ON public.cable_schedule
    FOR EACH ROW EXECUTE FUNCTION public.audit_cable_schedule_mutation();
CREATE TRIGGER audit_cable_schedule_delete
    BEFORE DELETE ON public.cable_schedule
    FOR EACH ROW EXECUTE FUNCTION public.audit_cable_schedule_mutation();

CREATE OR REPLACE FUNCTION public.obtener_impacto_cable(
    p_cable_id BIGINT,
    p_project_area_id UUID
)
RETURNS TABLE (
    cable_id BIGINT,
    tag_unico TEXT,
    dispatch_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.can_manage_cable_schedule(p_project_area_id) THEN
        RAISE EXCEPTION 'No tiene permisos para administrar cables en esta area.';
    END IF;

    RETURN QUERY
    SELECT cs.id, cs.tag_unico::TEXT, COUNT(cd.id)
    FROM public.cable_schedule cs
    LEFT JOIN public.cable_despachos cd ON cd.cable_schedule_id = cs.id
    WHERE cs.id = p_cable_id
      AND cs.project_area_id = p_project_area_id
    GROUP BY cs.id, cs.tag_unico;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El cable no existe en el area activa.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.editar_tag_cable_autorizado(
    p_cable_id BIGINT,
    p_project_area_id UUID,
    p_new_tag TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old public.cable_schedule%ROWTYPE;
    v_new_tag TEXT := UPPER(BTRIM(p_new_tag));
    v_dispatch_count BIGINT;
BEGIN
    IF NOT public.can_manage_cable_schedule(p_project_area_id) THEN
        RAISE EXCEPTION 'No tiene permisos para editar cables en esta area.';
    END IF;
    IF v_new_tag IS NULL OR v_new_tag = '' THEN
        RAISE EXCEPTION 'TAG UNICO no puede estar vacio.';
    END IF;
    IF LENGTH(v_new_tag) > 100 THEN
        RAISE EXCEPTION 'TAG UNICO no puede exceder 100 caracteres.';
    END IF;

    SELECT * INTO v_old
    FROM public.cable_schedule
    WHERE id = p_cable_id
      AND project_area_id = p_project_area_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El cable no existe en el area activa.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.cable_schedule
        WHERE LOWER(tag_unico) = LOWER(v_new_tag)
          AND id <> p_cable_id
    ) THEN
        RAISE EXCEPTION 'El TAG UNICO % ya existe.', v_new_tag;
    END IF;

    PERFORM set_config('app.authorized_cable_tag_change', 'true', TRUE);
    UPDATE public.cable_schedule
    SET tag_unico = v_new_tag,
        updated_at = NOW()
    WHERE id = p_cable_id;

    SELECT COUNT(*) INTO v_dispatch_count
    FROM public.cable_despachos
    WHERE cable_schedule_id = p_cable_id;

    RETURN jsonb_build_object(
        'id', p_cable_id,
        'old_tag', v_old.tag_unico,
        'new_tag', v_new_tag,
        'dispatch_count', v_dispatch_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_cable_autorizado(
    p_cable_id BIGINT,
    p_project_area_id UUID,
    p_confirm_tag TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_row public.cable_schedule%ROWTYPE;
    v_dispatch_count BIGINT;
BEGIN
    IF NOT public.can_manage_cable_schedule(p_project_area_id) THEN
        RAISE EXCEPTION 'No tiene permisos para eliminar cables en esta area.';
    END IF;

    SELECT * INTO v_row
    FROM public.cable_schedule
    WHERE id = p_cable_id
      AND project_area_id = p_project_area_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El cable no existe en el area activa.';
    END IF;
    IF BTRIM(p_confirm_tag) IS DISTINCT FROM v_row.tag_unico THEN
        RAISE EXCEPTION 'La confirmacion no coincide con TAG UNICO.';
    END IF;

    SELECT COUNT(*) INTO v_dispatch_count
    FROM public.cable_despachos
    WHERE cable_schedule_id = p_cable_id;

    DELETE FROM public.cable_schedule WHERE id = p_cable_id;

    RETURN jsonb_build_object(
        'id', p_cable_id,
        'deleted_tag', v_row.tag_unico,
        'deleted_dispatches', v_dispatch_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_impacto_cable(BIGINT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.editar_tag_cable_autorizado(BIGINT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_cable_autorizado(BIGINT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_impacto_cable(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.editar_tag_cable_autorizado(BIGINT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_cable_autorizado(BIGINT, UUID, TEXT) TO authenticated;

-- Dispatch policies now derive area ownership from the immutable parent ID.
DROP POLICY IF EXISTS cable_despachos_area_select ON public.cable_despachos;
DROP POLICY IF EXISTS cable_despachos_area_insert ON public.cable_despachos;
DROP POLICY IF EXISTS cable_despachos_area_update ON public.cable_despachos;
DROP POLICY IF EXISTS cable_despachos_area_delete ON public.cable_despachos;

CREATE POLICY cable_despachos_area_select ON public.cable_despachos
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.cable_schedule cs
        WHERE cs.id = cable_despachos.cable_schedule_id
          AND public.can_access_project_area(cs.project_area_id)
    ));
CREATE POLICY cable_despachos_area_insert ON public.cable_despachos
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.cable_schedule cs
        WHERE cs.id = cable_despachos.cable_schedule_id
          AND cs.tag_unico = cable_despachos.tag_unico
          AND public.can_access_project_area(cs.project_area_id)
    ));
CREATE POLICY cable_despachos_area_update ON public.cable_despachos
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.cable_schedule cs
        WHERE cs.id = cable_despachos.cable_schedule_id
          AND public.can_access_project_area(cs.project_area_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.cable_schedule cs
        WHERE cs.id = cable_despachos.cable_schedule_id
          AND cs.tag_unico = cable_despachos.tag_unico
          AND public.can_access_project_area(cs.project_area_id)
    ));
CREATE POLICY cable_despachos_area_delete ON public.cable_despachos
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.cable_schedule cs
        WHERE cs.id = cable_despachos.cable_schedule_id
          AND public.can_access_project_area(cs.project_area_id)
    ));

DROP POLICY IF EXISTS cable_schedule_area_delete ON public.cable_schedule;
CREATE POLICY cable_schedule_area_delete ON public.cable_schedule
    FOR DELETE TO authenticated
    USING (public.can_manage_cable_schedule(project_area_id));

COMMIT;
