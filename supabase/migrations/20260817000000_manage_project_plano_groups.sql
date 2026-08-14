BEGIN;

DROP INDEX IF EXISTS public.project_planos_area_business_key;
CREATE UNIQUE INDEX IF NOT EXISTS project_planos_group_plano_key
    ON public.project_planos (group_id, LOWER(plano))
    WHERE group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_project_plano_identity_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.project_area_id IS DISTINCT FROM OLD.project_area_id
       OR NEW.partition IS DISTINCT FROM OLD.partition
       OR NEW.wbs IS DISTINCT FROM OLD.wbs
       OR NEW.plano IS DISTINCT FROM OLD.plano THEN
        RAISE EXCEPTION 'PARTITION, WBS, PLANO and project area cannot be edited. Delete the row and create a new one instead.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_project_plano_group(p_group_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_area_id UUID;
BEGIN
    SELECT project_area_id INTO v_area_id
    FROM public.project_plano_groups
    WHERE id = p_group_id;

    IF v_area_id IS NULL THEN
        RAISE EXCEPTION 'WBS group not found.';
    END IF;

    IF NOT public.can_admin_project_area(v_area_id) THEN
        RAISE EXCEPTION 'Administrator permission is required.';
    END IF;

    DELETE FROM public.project_planos WHERE group_id = p_group_id;
    DELETE FROM public.project_plano_groups WHERE id = p_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_project_plano_group(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_project_plano_group(BIGINT) TO authenticated;

COMMIT;
