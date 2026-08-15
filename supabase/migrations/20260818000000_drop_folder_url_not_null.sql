BEGIN;

-- Drop NOT NULL constraint from folder_url in project_plano_groups
ALTER TABLE public.project_plano_groups ALTER COLUMN folder_url DROP NOT NULL;

COMMIT;
