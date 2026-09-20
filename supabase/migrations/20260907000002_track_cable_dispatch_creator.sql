-- Track the authenticated account that originally registered each delivery.
-- Legacy rows remain NULL because their creator cannot be reconstructed safely.

BEGIN;

ALTER TABLE public.cable_despachos
    ADD COLUMN IF NOT EXISTS created_by UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cable_despachos_created_by
    ON public.cable_despachos(created_by);

CREATE OR REPLACE FUNCTION public.set_cable_dispatch_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_by := auth.uid();
    ELSE
        NEW.created_by := OLD.created_by;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_cable_dispatch_creator_trigger ON public.cable_despachos;
CREATE TRIGGER set_cable_dispatch_creator_trigger
    BEFORE INSERT OR UPDATE OF created_by
    ON public.cable_despachos
    FOR EACH ROW
    EXECUTE FUNCTION public.set_cable_dispatch_creator();

CREATE OR REPLACE FUNCTION public.get_cable_dispatch_creators(
    p_project_area_id UUID,
    p_cable_schedule_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
    dispatch_id BIGINT,
    created_by UUID,
    created_by_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.can_access_project_area(p_project_area_id) THEN
        RAISE EXCEPTION 'No tiene acceso al area seleccionada.';
    END IF;

    RETURN QUERY
    SELECT
        cd.id,
        cd.created_by,
        COALESCE(NULLIF(BTRIM(up.display_name), ''), cd.created_by::TEXT, 'Registro anterior')::TEXT
    FROM public.cable_despachos cd
    JOIN public.cable_schedule cs ON cs.id = cd.cable_schedule_id
    LEFT JOIN public.user_profiles up ON up.user_id = cd.created_by
    WHERE cs.project_area_id = p_project_area_id
      AND (p_cable_schedule_id IS NULL OR cd.cable_schedule_id = p_cable_schedule_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_cable_dispatch_creators(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cable_dispatch_creators(UUID, BIGINT) TO authenticated;

COMMENT ON COLUMN public.cable_despachos.created_by IS
    'Authenticated user that originally registered the delivery. Immutable after insert.';

COMMIT;
