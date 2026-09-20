-- Internal account requests submitted from the public login screen.

BEGIN;

CREATE TABLE IF NOT EXISTS public.account_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL CHECK (LENGTH(BTRIM(full_name)) BETWEEN 2 AND 120),
    email TEXT NOT NULL CHECK (LENGTH(BTRIM(email)) BETWEEN 5 AND 255),
    requested_area_code TEXT NOT NULL CHECK (requested_area_code IN ('SECA', 'HUMEDA')),
    message TEXT CHECK (LENGTH(message) <= 50),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_requests_pending_email
    ON public.account_requests(LOWER(email))
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_account_requests_status_created
    ON public.account_requests(status, created_at DESC);

ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_requests FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_account_request(
    p_full_name TEXT,
    p_email TEXT,
    p_area_code TEXT,
    p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_name TEXT := BTRIM(COALESCE(p_full_name, ''));
    v_email TEXT := LOWER(BTRIM(COALESCE(p_email, '')));
    v_area TEXT := UPPER(BTRIM(COALESCE(p_area_code, '')));
    v_id UUID;
BEGIN
    IF LENGTH(v_name) < 2 OR LENGTH(v_name) > 120 THEN
        RAISE EXCEPTION 'Ingrese un nombre valido.';
    END IF;
    IF v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
        RAISE EXCEPTION 'Ingrese un correo electronico valido.';
    END IF;
    IF v_area NOT IN ('SECA', 'HUMEDA') THEN
        RAISE EXCEPTION 'Seleccione Area Seca o Area Humeda.';
    END IF;
    IF LENGTH(COALESCE(p_message, '')) > 50 THEN
        RAISE EXCEPTION 'El mensaje no puede superar 50 caracteres.';
    END IF;

    INSERT INTO public.account_requests(full_name, email, requested_area_code, message)
    VALUES (v_name, v_email, v_area, NULLIF(BTRIM(p_message), ''))
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'Ya existe una solicitud pendiente para este correo.';
    END IF;

    RETURN JSONB_BUILD_OBJECT('success', TRUE, 'request_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_account_request(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_account_request(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_account_requests(p_status TEXT DEFAULT 'pending')
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    email TEXT,
    requested_area_code TEXT,
    message TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    RETURN QUERY
    SELECT ar.id, ar.full_name, ar.email, ar.requested_area_code,
           ar.message, ar.status, ar.created_at, ar.resolved_at
    FROM public.account_requests ar
    WHERE p_status IS NULL OR ar.status = p_status
    ORDER BY CASE WHEN ar.status = 'pending' THEN 0 ELSE 1 END, ar.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_account_requests(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_account_requests(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_account_request(
    p_request_id UUID,
    p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;
    IF p_status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Estado de solicitud invalido.';
    END IF;

    UPDATE public.account_requests
    SET status = p_status, resolved_at = NOW(), resolved_by = auth.uid()
    WHERE id = p_request_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La solicitud ya fue procesada o no existe.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_account_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_account_request(UUID, TEXT) TO authenticated;

COMMIT;
