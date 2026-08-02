-- Phase 1: additive project/area authorization foundation.
-- This migration intentionally does not change existing application tables or RLS.

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT projects_code_not_blank CHECK (BTRIM(code) <> ''),
    CONSTRAINT projects_name_not_blank CHECK (BTRIM(name) <> '')
);

CREATE TABLE IF NOT EXISTS public.project_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT project_areas_code_not_blank CHECK (BTRIM(code) <> ''),
    CONSTRAINT project_areas_name_not_blank CHECK (BTRIM(name) <> ''),
    CONSTRAINT project_areas_project_code_key UNIQUE (project_id, code),
    CONSTRAINT project_areas_id_project_key UNIQUE (id, project_id)
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_memberships (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, project_id),
    CONSTRAINT project_memberships_role_check CHECK (role IN ('admin', 'user'))
);

CREATE TABLE IF NOT EXISTS public.area_memberships (
    user_id UUID NOT NULL,
    project_id UUID NOT NULL,
    area_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, area_id),
    -- A regular user can belong to at most one area in a project.
    CONSTRAINT area_memberships_one_area_per_project UNIQUE (user_id, project_id),
    CONSTRAINT area_memberships_project_member_fk
        FOREIGN KEY (user_id, project_id)
        REFERENCES public.project_memberships(user_id, project_id)
        ON DELETE CASCADE,
    CONSTRAINT area_memberships_area_project_fk
        FOREIGN KEY (area_id, project_id)
        REFERENCES public.project_areas(id, project_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_areas_project_id
    ON public.project_areas(project_id);

CREATE INDEX IF NOT EXISTS idx_project_memberships_project_id
    ON public.project_memberships(project_id);

CREATE INDEX IF NOT EXISTS idx_area_memberships_area_id
    ON public.area_memberships(area_id);

-- Lock the new tables until Phase 2 adds the reviewed membership-aware policies.
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_memberships ENABLE ROW LEVEL SECURITY;

-- Seed the current EPC project and its two work areas idempotently.
INSERT INTO public.projects (code, name)
VALUES ('CURRENT_EPC', 'Current EPC Project')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    active = TRUE,
    updated_at = NOW();

INSERT INTO public.project_areas (project_id, code, name)
SELECT p.id, seed.code, seed.name
FROM public.projects p
CROSS JOIN (
    VALUES
        ('SECA', 'Área Seca'),
        ('HUMEDA', 'Área Húmeda')
) AS seed(code, name)
WHERE p.code = 'CURRENT_EPC'
ON CONFLICT (project_id, code) DO UPDATE
SET name = EXCLUDED.name,
    active = TRUE,
    updated_at = NOW();

COMMENT ON TABLE public.projects IS
    'EPC projects available in the application.';
COMMENT ON TABLE public.project_areas IS
    'Operational partitions such as Área Seca and Área Húmeda.';
COMMENT ON TABLE public.project_memberships IS
    'Project-level role. Admin grants access to every area in the project.';
COMMENT ON TABLE public.area_memberships IS
    'Single project-area assignment for regular users.';
