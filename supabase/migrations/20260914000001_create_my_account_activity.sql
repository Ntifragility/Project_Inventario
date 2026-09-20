-- Allow every authenticated user to see only their own recent activity.

CREATE OR REPLACE FUNCTION public.get_my_recent_activity(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
    activity_type TEXT,
    description TEXT,
    record_reference TEXT,
    occurred_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        ('AUDIT_' || a.operacion)::TEXT AS activity_type,
        (a.operacion || ' en ' || a.tabla)::TEXT AS description,
        COALESCE(a.registro_id, '')::TEXT AS record_reference,
        a.fecha AS occurred_at
    FROM public.audit_log a
    WHERE a.usuario_id = auth.uid()
    ORDER BY a.fecha DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_my_recent_activity(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_recent_activity(INTEGER) TO authenticated;
