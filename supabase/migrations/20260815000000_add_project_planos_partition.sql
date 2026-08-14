BEGIN;

ALTER TABLE public.project_planos
    ADD COLUMN IF NOT EXISTS partition VARCHAR(100) NOT NULL DEFAULT 'GENERAL';

UPDATE public.project_planos
SET partition = 'PUESTA A TIERRA'
WHERE plano ILIKE '%-GL-%'
  AND partition = 'GENERAL';

ALTER TABLE public.project_planos
    ADD CONSTRAINT project_planos_partition_nonempty
    CHECK (BTRIM(partition) <> '') NOT VALID;

ALTER TABLE public.project_planos
    VALIDATE CONSTRAINT project_planos_partition_nonempty;

CREATE INDEX IF NOT EXISTS project_planos_area_partition_idx
    ON public.project_planos (project_area_id, partition);

COMMENT ON COLUMN public.project_planos.partition IS
    'Explicit discipline or dashboard partition used to group and display drawings.';

CREATE OR REPLACE FUNCTION public.prevent_project_plano_identity_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.project_area_id IS DISTINCT FROM OLD.project_area_id
       OR NEW.partition IS DISTINCT FROM OLD.partition
       OR NEW.wbs IS DISTINCT FROM OLD.wbs
       OR NEW.plano IS DISTINCT FROM OLD.plano
       OR NEW.sistema IS DISTINCT FROM OLD.sistema THEN
        RAISE EXCEPTION 'PARTITION, WBS, PLANO, TITULO and project area cannot be edited. Delete the row and create a new one instead.';
    END IF;
    RETURN NEW;
END;
$$;

COMMIT;
