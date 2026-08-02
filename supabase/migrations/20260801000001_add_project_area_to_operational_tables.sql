-- Phase 2: attach operational root data to a project area.
-- All legacy operational records belong to Área Seca.
--
-- The temporary database default keeps the current UI working while it is not
-- yet sending project_area_id. A later UI phase will remove that default after
-- every write explicitly provides the active project area.

DO $$
DECLARE
    v_seca_area_id UUID;
    v_table_name TEXT;
    v_constraint_name TEXT;
    v_operational_tables CONSTANT TEXT[] := ARRAY[
        'movimientos',
        'consumos_campo',
        'cable_schedule',
        'almaceneros',
        'disciplinas'
    ];
BEGIN
    SELECT pa.id
    INTO v_seca_area_id
    FROM public.project_areas pa
    JOIN public.projects p ON p.id = pa.project_id
    WHERE p.code = 'CURRENT_EPC'
      AND pa.code = 'SECA'
      AND p.active = TRUE
      AND pa.active = TRUE;

    IF v_seca_area_id IS NULL THEN
        RAISE EXCEPTION
            'Área Seca was not found. Apply Phase 1 before Phase 2.';
    END IF;

    FOREACH v_table_name IN ARRAY v_operational_tables
    LOOP
        IF TO_REGCLASS(FORMAT('public.%I', v_table_name)) IS NULL THEN
            RAISE EXCEPTION
                'Required operational table public.% does not exist.',
                v_table_name;
        END IF;

        EXECUTE FORMAT(
            'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS project_area_id UUID',
            v_table_name
        );

        EXECUTE FORMAT(
            'UPDATE public.%I SET project_area_id = $1 WHERE project_area_id IS NULL',
            v_table_name
        ) USING v_seca_area_id;

        -- Transitional compatibility: legacy inserts continue in Área Seca.
        EXECUTE FORMAT(
            'ALTER TABLE public.%I ALTER COLUMN project_area_id SET DEFAULT %L::UUID',
            v_table_name,
            v_seca_area_id
        );

        EXECUTE FORMAT(
            'ALTER TABLE public.%I ALTER COLUMN project_area_id SET NOT NULL',
            v_table_name
        );

        v_constraint_name := v_table_name || '_project_area_id_fkey';

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = v_constraint_name
              AND conrelid = FORMAT('public.%I', v_table_name)::REGCLASS
        ) THEN
            EXECUTE FORMAT(
                'ALTER TABLE public.%I ADD CONSTRAINT %I '
                || 'FOREIGN KEY (project_area_id) '
                || 'REFERENCES public.project_areas(id) ON DELETE RESTRICT',
                v_table_name,
                v_constraint_name
            );
        END IF;

        EXECUTE FORMAT(
            'CREATE INDEX IF NOT EXISTS %I ON public.%I(project_area_id)',
            'idx_' || v_table_name || '_project_area_id',
            v_table_name
        );
    END LOOP;
END;
$$;

COMMENT ON COLUMN public.movimientos.project_area_id IS
    'Operational EPC area that owns the inventory movement.';
COMMENT ON COLUMN public.consumos_campo.project_area_id IS
    'Operational EPC area that owns the field-consumption record.';
COMMENT ON COLUMN public.cable_schedule.project_area_id IS
    'Operational EPC area that owns the globally unique TAG UNICO.';
COMMENT ON COLUMN public.almaceneros.project_area_id IS
    'Operational EPC area where the warehouse keeper is configured.';
COMMENT ON COLUMN public.disciplinas.project_area_id IS
    'Operational EPC area where the discipline is configured.';

-- TAG UNICO intentionally remains globally unique. This migration does not
-- replace or widen cable_schedule's existing UNIQUE(tag_unico) constraint.

-- SQL Editor checkpoint: every null count must be zero.
SELECT 'movimientos' AS table_name,
       COUNT(*) AS total_records,
       COUNT(*) FILTER (WHERE project_area_id IS NULL) AS null_area_records
FROM public.movimientos
UNION ALL
SELECT 'consumos_campo', COUNT(*),
       COUNT(*) FILTER (WHERE project_area_id IS NULL)
FROM public.consumos_campo
UNION ALL
SELECT 'cable_schedule', COUNT(*),
       COUNT(*) FILTER (WHERE project_area_id IS NULL)
FROM public.cable_schedule
UNION ALL
SELECT 'almaceneros', COUNT(*),
       COUNT(*) FILTER (WHERE project_area_id IS NULL)
FROM public.almaceneros
UNION ALL
SELECT 'disciplinas', COUNT(*),
       COUNT(*) FILTER (WHERE project_area_id IS NULL)
FROM public.disciplinas;
