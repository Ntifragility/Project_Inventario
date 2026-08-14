ALTER TABLE public.project_planos
    ADD COLUMN IF NOT EXISTS revision VARCHAR(50);

COMMENT ON COLUMN public.project_planos.revision IS
    'Drawing revision displayed as REV in the Planos registry.';

CREATE OR REPLACE FUNCTION public.prevent_project_plano_identity_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.project_area_id IS DISTINCT FROM OLD.project_area_id
       OR NEW.wbs IS DISTINCT FROM OLD.wbs
       OR NEW.plano IS DISTINCT FROM OLD.plano
       OR NEW.sistema IS DISTINCT FROM OLD.sistema THEN
        RAISE EXCEPTION 'WBS, PLANO, TITULO and project area cannot be edited. Delete the row and create a new one instead.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_project_plano_identity_update ON public.project_planos;
CREATE TRIGGER prevent_project_plano_identity_update
    BEFORE UPDATE ON public.project_planos
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_project_plano_identity_update();
