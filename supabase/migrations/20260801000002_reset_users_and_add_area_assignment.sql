-- Phase 3A: reset user access and require an area for every regular user.
-- Destructive by explicit request: preserve only mvillafuerte@ccp.pe.

DO $$
DECLARE
    v_admin_email CONSTANT TEXT := 'mvillafuerte@ccp.pe';
    v_admin_dni CONSTANT TEXT := '48204199';
    v_admin_user_id UUID;
    v_project_id UUID;
BEGIN
    SELECT id
    INTO v_admin_user_id
    FROM auth.users
    WHERE LOWER(email) = v_admin_email;

    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION
            'Protected administrator % was not found. No users were deleted.',
            v_admin_email;
    END IF;

    SELECT id
    INTO v_project_id
    FROM public.projects
    WHERE code = 'CURRENT_EPC';

    IF v_project_id IS NULL THEN
        RAISE EXCEPTION 'CURRENT_EPC project was not found. Apply Phase 1 first.';
    END IF;

    -- Link the protected Auth account to its legacy administrator record before
    -- any account is removed. This keeps reset/backup features compatible.
    INSERT INTO public.administradores (dni, nombre, email)
    VALUES (v_admin_dni, 'Administrador principal', v_admin_email)
    ON CONFLICT (dni) DO UPDATE
    SET email = EXCLUDED.email,
        nombre = COALESCE(NULLIF(administradores.nombre, ''), EXCLUDED.nombre);

    -- Remove stale administrator records before deleting the Auth accounts.
    DELETE FROM public.administradores
    WHERE dni <> v_admin_dni;

    -- Auth-related membership/profile records cascade automatically.
    DELETE FROM auth.users
    WHERE email IS NULL OR LOWER(email) <> v_admin_email;

    INSERT INTO public.user_profiles (user_id, display_name, active)
    VALUES (v_admin_user_id, 'Administrador principal', TRUE)
    ON CONFLICT (user_id) DO UPDATE
    SET active = TRUE,
        updated_at = NOW();

    INSERT INTO public.project_memberships (user_id, project_id, role, created_by)
    VALUES (v_admin_user_id, v_project_id, 'admin', v_admin_user_id)
    ON CONFLICT (user_id, project_id) DO UPDATE
    SET role = 'admin';

    -- Project administrators inherit all areas and need no area membership.
    DELETE FROM public.area_memberships
    WHERE user_id = v_admin_user_id
      AND project_id = v_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_project_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.project_memberships pm
        JOIN public.projects p ON p.id = pm.project_id
        WHERE pm.user_id = auth.uid()
          AND pm.role = 'admin'
          AND p.code = 'CURRENT_EPC'
          AND p.active = TRUE
    );
$$;

REVOKE ALL ON FUNCTION public.is_current_project_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_project_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_areas_asignables()
RETURNS TABLE (
    code TEXT,
    name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    RETURN QUERY
    SELECT pa.code, pa.name
    FROM public.project_areas pa
    JOIN public.projects p ON p.id = pa.project_id
    WHERE p.code = 'CURRENT_EPC'
      AND p.active = TRUE
      AND pa.active = TRUE
    ORDER BY pa.name;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_areas_asignables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_areas_asignables() TO authenticated;

CREATE OR REPLACE FUNCTION public.configurar_usuario_nuevo(
    p_user_id UUID,
    p_area_code TEXT,
    p_es_admin BOOLEAN DEFAULT FALSE,
    p_admin_dni TEXT DEFAULT NULL,
    p_admin_nombre TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_project_id UUID;
    v_area_id UUID;
    v_target_email TEXT;
BEGIN
    IF NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT LOWER(email)
    INTO v_target_email
    FROM auth.users
    WHERE id = p_user_id;

    IF v_target_email IS NULL THEN
        RAISE EXCEPTION 'El usuario de autenticación no existe.';
    END IF;

    SELECT id
    INTO v_project_id
    FROM public.projects
    WHERE code = 'CURRENT_EPC'
      AND active = TRUE;

    IF p_es_admin THEN
        IF p_admin_dni IS NULL
           OR p_admin_dni !~ '^[0-9]{8}$'
           OR NULLIF(BTRIM(p_admin_nombre), '') IS NULL THEN
            RAISE EXCEPTION 'DNI y nombre son obligatorios para un administrador.';
        END IF;
    ELSE
        IF NULLIF(BTRIM(p_area_code), '') IS NULL THEN
            RAISE EXCEPTION 'Debe seleccionar un área para el usuario.';
        END IF;

        SELECT pa.id
        INTO v_area_id
        FROM public.project_areas pa
        WHERE pa.project_id = v_project_id
          AND pa.code = UPPER(BTRIM(p_area_code))
          AND pa.active = TRUE;

        IF v_area_id IS NULL THEN
            RAISE EXCEPTION 'El área seleccionada no existe o está inactiva.';
        END IF;
    END IF;

    INSERT INTO public.user_profiles (user_id, active)
    VALUES (p_user_id, TRUE)
    ON CONFLICT (user_id) DO UPDATE
    SET active = TRUE,
        updated_at = NOW();

    INSERT INTO public.project_memberships (
        user_id,
        project_id,
        role,
        created_by
    )
    VALUES (
        p_user_id,
        v_project_id,
        CASE WHEN p_es_admin THEN 'admin' ELSE 'user' END,
        auth.uid()
    )
    ON CONFLICT (user_id, project_id) DO UPDATE
    SET role = EXCLUDED.role;

    IF p_es_admin THEN
        DELETE FROM public.area_memberships
        WHERE user_id = p_user_id
          AND project_id = v_project_id;

        INSERT INTO public.administradores (dni, nombre, email)
        VALUES (p_admin_dni, BTRIM(p_admin_nombre), v_target_email)
        ON CONFLICT (dni) DO UPDATE
        SET nombre = EXCLUDED.nombre,
            email = EXCLUDED.email;
    ELSE
        DELETE FROM public.administradores
        WHERE LOWER(email) = v_target_email;

        INSERT INTO public.area_memberships (
            user_id,
            project_id,
            area_id,
            created_by
        )
        VALUES (p_user_id, v_project_id, v_area_id, auth.uid())
        ON CONFLICT (user_id, project_id) DO UPDATE
        SET area_id = EXCLUDED.area_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_usuario_nuevo(UUID, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configurar_usuario_nuevo(UUID, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;

-- Replace the legacy unrestricted user listing with membership-aware output.
DROP FUNCTION IF EXISTS public.listar_usuarios_sistema();

CREATE FUNCTION public.listar_usuarios_sistema()
RETURNS TABLE (
    id UUID,
    email VARCHAR,
    created_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    es_admin BOOLEAN,
    admin_dni VARCHAR,
    admin_nombre VARCHAR,
    area_codigo TEXT,
    area_nombre TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.email::VARCHAR,
        u.created_at,
        u.last_sign_in_at,
        (pm.role = 'admin') AS es_admin,
        a.dni::VARCHAR AS admin_dni,
        a.nombre::VARCHAR AS admin_nombre,
        CASE WHEN pm.role = 'admin' THEN 'TODAS' ELSE pa.code END AS area_codigo,
        CASE WHEN pm.role = 'admin' THEN 'Todas las áreas' ELSE pa.name END AS area_nombre
    FROM auth.users u
    JOIN public.projects p ON p.code = 'CURRENT_EPC'
    LEFT JOIN public.project_memberships pm
        ON pm.user_id = u.id
       AND pm.project_id = p.id
    LEFT JOIN public.area_memberships am
        ON am.user_id = u.id
       AND am.project_id = p.id
    LEFT JOIN public.project_areas pa ON pa.id = am.area_id
    LEFT JOIN public.administradores a ON LOWER(u.email) = LOWER(a.email)
    ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_usuarios_sistema() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_usuarios_sistema() TO authenticated;

-- Secure account deletion. Memberships and profiles cascade from auth.users.
CREATE OR REPLACE FUNCTION public.eliminar_usuario_sistema(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_email TEXT;
BEGIN
    IF NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No puede eliminar su propia cuenta.';
    END IF;

    SELECT LOWER(email)
    INTO v_email
    FROM auth.users
    WHERE id = p_user_id;

    IF v_email IS NULL THEN
        RAISE EXCEPTION 'El usuario no existe.';
    END IF;

    DELETE FROM public.administradores WHERE LOWER(email) = v_email;
    DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_usuario_sistema(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eliminar_usuario_sistema(UUID) TO authenticated;

-- Keep role changes consistent with the new project/area membership model.
CREATE OR REPLACE FUNCTION public.asignar_administrador(
    p_user_email TEXT,
    p_dni TEXT,
    p_nombre TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_project_id UUID;
BEGIN
    IF NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(BTRIM(p_user_email));

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'El usuario no existe.';
    END IF;

    IF p_dni !~ '^[0-9]{8}$' OR NULLIF(BTRIM(p_nombre), '') IS NULL THEN
        RAISE EXCEPTION 'DNI y nombre son obligatorios.';
    END IF;

    SELECT id INTO v_project_id
    FROM public.projects
    WHERE code = 'CURRENT_EPC' AND active = TRUE;

    INSERT INTO public.administradores (dni, nombre, email)
    VALUES (p_dni, BTRIM(p_nombre), LOWER(BTRIM(p_user_email)))
    ON CONFLICT (dni) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        email = EXCLUDED.email;

    INSERT INTO public.project_memberships (user_id, project_id, role, created_by)
    VALUES (v_user_id, v_project_id, 'admin', auth.uid())
    ON CONFLICT (user_id, project_id) DO UPDATE
    SET role = 'admin';

    DELETE FROM public.area_memberships
    WHERE user_id = v_user_id
      AND project_id = v_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_administrador(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asignar_administrador(TEXT, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.revocar_administrador(TEXT);

CREATE FUNCTION public.revocar_administrador(
    p_dni TEXT,
    p_area_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_project_id UUID;
    v_area_id UUID;
BEGIN
    IF NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT u.id
    INTO v_user_id
    FROM public.administradores a
    JOIN auth.users u ON LOWER(u.email) = LOWER(a.email)
    WHERE a.dni = p_dni;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'El administrador no existe.';
    END IF;

    IF v_user_id = auth.uid() THEN
        RAISE EXCEPTION 'No puede quitarse sus propios permisos.';
    END IF;

    SELECT p.id, pa.id
    INTO v_project_id, v_area_id
    FROM public.projects p
    JOIN public.project_areas pa ON pa.project_id = p.id
    WHERE p.code = 'CURRENT_EPC'
      AND p.active = TRUE
      AND pa.code = UPPER(BTRIM(p_area_code))
      AND pa.active = TRUE;

    IF v_area_id IS NULL THEN
        RAISE EXCEPTION 'Debe seleccionar un área válida para el usuario.';
    END IF;

    UPDATE public.project_memberships
    SET role = 'user'
    WHERE user_id = v_user_id
      AND project_id = v_project_id;

    INSERT INTO public.area_memberships (
        user_id,
        project_id,
        area_id,
        created_by
    )
    VALUES (v_user_id, v_project_id, v_area_id, auth.uid())
    ON CONFLICT (user_id, project_id) DO UPDATE
    SET area_id = EXCLUDED.area_id;

    DELETE FROM public.administradores WHERE dni = p_dni;
END;
$$;

REVOKE ALL ON FUNCTION public.revocar_administrador(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revocar_administrador(TEXT, TEXT) TO authenticated;

-- SQL Editor checkpoint: exactly one protected project administrator remains.
SELECT
    u.email,
    pm.role,
    COALESCE(pa.name, 'Todas las áreas') AS area_access
FROM auth.users u
JOIN public.project_memberships pm ON pm.user_id = u.id
JOIN public.projects p ON p.id = pm.project_id
LEFT JOIN public.area_memberships am
    ON am.user_id = u.id
   AND am.project_id = p.id
LEFT JOIN public.project_areas pa ON pa.id = am.area_id
WHERE p.code = 'CURRENT_EPC'
ORDER BY u.email;
