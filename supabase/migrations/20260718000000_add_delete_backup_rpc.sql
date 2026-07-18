-- RPC to delete a security backup (admin-only, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION eliminar_respaldo_seguridad(p_email TEXT, p_respaldo_id INT)
RETURNS VOID AS $$
BEGIN
    -- Verify the caller is an administrator
    IF NOT EXISTS (SELECT 1 FROM public.administradores WHERE LOWER(email) = LOWER(p_email)) THEN
        RAISE EXCEPTION 'No tiene permisos de administrador para eliminar respaldos.';
    END IF;

    DELETE FROM respaldos_seguridad WHERE id = p_respaldo_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
