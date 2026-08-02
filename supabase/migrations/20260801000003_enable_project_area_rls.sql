-- Phase 3B: database-enforced project-area isolation.
-- This migration keeps the current UI compatible while preventing cross-area
-- access through direct table queries, views, and legacy SECURITY DEFINER RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_project_area(p_area_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.project_areas pa
        JOIN public.projects p ON p.id = pa.project_id
        JOIN public.project_memberships pm
          ON pm.project_id = pa.project_id
         AND pm.user_id = auth.uid()
        WHERE pa.id = p_area_id
          AND pa.active = TRUE
          AND p.active = TRUE
          AND (
              pm.role = 'admin'
              OR EXISTS (
                  SELECT 1
                  FROM public.area_memberships am
                  WHERE am.user_id = pm.user_id
                    AND am.project_id = pm.project_id
                    AND am.area_id = pa.id
              )
          )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_project_area(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_project_area(UUID) TO authenticated;

-- Transitional write context. Regular users write to their assigned area;
-- administrators continue writing to Área Seca until the UI area switcher is
-- added in the next phase and sends project_area_id explicitly.
CREATE OR REPLACE FUNCTION public.default_project_area_for_current_user()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_area_id UUID;
BEGIN
    SELECT am.area_id
    INTO v_area_id
    FROM public.area_memberships am
    JOIN public.projects p ON p.id = am.project_id
    JOIN public.project_memberships pm
      ON pm.user_id = am.user_id
     AND pm.project_id = am.project_id
    WHERE am.user_id = auth.uid()
      AND p.code = 'CURRENT_EPC'
      AND p.active = TRUE
      AND pm.role = 'user';

    IF v_area_id IS NOT NULL THEN
        RETURN v_area_id;
    END IF;

    IF public.is_current_project_admin() THEN
        SELECT pa.id
        INTO v_area_id
        FROM public.project_areas pa
        JOIN public.projects p ON p.id = pa.project_id
        WHERE p.code = 'CURRENT_EPC'
          AND pa.code = 'SECA'
          AND p.active = TRUE
          AND pa.active = TRUE;
    END IF;

    RETURN v_area_id;
END;
$$;

REVOKE ALL ON FUNCTION public.default_project_area_for_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_project_area_for_current_user() TO authenticated;

ALTER TABLE public.movimientos
    ALTER COLUMN project_area_id
    SET DEFAULT public.default_project_area_for_current_user();
ALTER TABLE public.consumos_campo
    ALTER COLUMN project_area_id
    SET DEFAULT public.default_project_area_for_current_user();
ALTER TABLE public.cable_schedule
    ALTER COLUMN project_area_id
    SET DEFAULT public.default_project_area_for_current_user();
ALTER TABLE public.almaceneros
    ALTER COLUMN project_area_id
    SET DEFAULT public.default_project_area_for_current_user();
ALTER TABLE public.disciplinas
    ALTER COLUMN project_area_id
    SET DEFAULT public.default_project_area_for_current_user();

-- Remove permissive legacy policies only from the area-owned tables.
DO $$
DECLARE
    v_policy RECORD;
BEGIN
    FOR v_policy IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'movimientos',
              'consumos_campo',
              'cable_schedule',
              'cable_despachos',
              'almaceneros',
              'disciplinas'
          )
    LOOP
        EXECUTE FORMAT(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            v_policy.policyname,
            v_policy.schemaname,
            v_policy.tablename
        );
    END LOOP;
END;
$$;

-- Inventory movements: preserve the existing no-direct-delete rule.
CREATE POLICY movimientos_area_select ON public.movimientos
    FOR SELECT TO authenticated
    USING (public.can_access_project_area(project_area_id));
CREATE POLICY movimientos_area_insert ON public.movimientos
    FOR INSERT TO authenticated
    WITH CHECK (public.can_access_project_area(project_area_id));
CREATE POLICY movimientos_area_update ON public.movimientos
    FOR UPDATE TO authenticated
    USING (public.can_access_project_area(project_area_id))
    WITH CHECK (public.can_access_project_area(project_area_id));

CREATE POLICY consumos_campo_area_select ON public.consumos_campo
    FOR SELECT TO authenticated
    USING (public.can_access_project_area(project_area_id));
CREATE POLICY consumos_campo_area_insert ON public.consumos_campo
    FOR INSERT TO authenticated
    WITH CHECK (public.can_access_project_area(project_area_id));
CREATE POLICY consumos_campo_area_delete ON public.consumos_campo
    FOR DELETE TO authenticated
    USING (public.can_access_project_area(project_area_id));

CREATE POLICY cable_schedule_area_select ON public.cable_schedule
    FOR SELECT TO authenticated
    USING (public.can_access_project_area(project_area_id));
CREATE POLICY cable_schedule_area_insert ON public.cable_schedule
    FOR INSERT TO authenticated
    WITH CHECK (public.can_access_project_area(project_area_id));
CREATE POLICY cable_schedule_area_update ON public.cable_schedule
    FOR UPDATE TO authenticated
    USING (public.can_access_project_area(project_area_id))
    WITH CHECK (public.can_access_project_area(project_area_id));
CREATE POLICY cable_schedule_area_delete ON public.cable_schedule
    FOR DELETE TO authenticated
    USING (public.can_access_project_area(project_area_id));

-- Dispatch ownership is derived from its globally unique parent TAG UNICO.
CREATE POLICY cable_despachos_area_select ON public.cable_despachos
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.cable_schedule cs
        WHERE cs.tag_unico = cable_despachos.tag_unico
          AND public.can_access_project_area(cs.project_area_id)
    ));
CREATE POLICY cable_despachos_area_insert ON public.cable_despachos
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.cable_schedule cs
        WHERE cs.tag_unico = cable_despachos.tag_unico
          AND public.can_access_project_area(cs.project_area_id)
    ));
CREATE POLICY cable_despachos_area_update ON public.cable_despachos
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.cable_schedule cs
        WHERE cs.tag_unico = cable_despachos.tag_unico
          AND public.can_access_project_area(cs.project_area_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.cable_schedule cs
        WHERE cs.tag_unico = cable_despachos.tag_unico
          AND public.can_access_project_area(cs.project_area_id)
    ));
CREATE POLICY cable_despachos_area_delete ON public.cable_despachos
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.cable_schedule cs
        WHERE cs.tag_unico = cable_despachos.tag_unico
          AND public.can_access_project_area(cs.project_area_id)
    ));

CREATE POLICY almaceneros_area_select ON public.almaceneros
    FOR SELECT TO authenticated
    USING (public.can_access_project_area(project_area_id));
CREATE POLICY almaceneros_area_insert ON public.almaceneros
    FOR INSERT TO authenticated
    WITH CHECK (public.can_access_project_area(project_area_id));
CREATE POLICY almaceneros_area_update ON public.almaceneros
    FOR UPDATE TO authenticated
    USING (public.can_access_project_area(project_area_id))
    WITH CHECK (public.can_access_project_area(project_area_id));
CREATE POLICY almaceneros_area_delete ON public.almaceneros
    FOR DELETE TO authenticated
    USING (public.can_access_project_area(project_area_id));

CREATE POLICY disciplinas_area_select ON public.disciplinas
    FOR SELECT TO authenticated
    USING (public.can_access_project_area(project_area_id));
CREATE POLICY disciplinas_area_insert ON public.disciplinas
    FOR INSERT TO authenticated
    WITH CHECK (public.can_access_project_area(project_area_id));
CREATE POLICY disciplinas_area_update ON public.disciplinas
    FOR UPDATE TO authenticated
    USING (public.can_access_project_area(project_area_id))
    WITH CHECK (public.can_access_project_area(project_area_id));
CREATE POLICY disciplinas_area_delete ON public.disciplinas
    FOR DELETE TO authenticated
    USING (public.can_access_project_area(project_area_id));

-- Read-only membership metadata used by the next UI phase.
DROP POLICY IF EXISTS projects_member_select ON public.projects;
CREATE POLICY projects_member_select ON public.projects
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.project_memberships pm
        WHERE pm.project_id = projects.id
          AND pm.user_id = auth.uid()
    ));
DROP POLICY IF EXISTS project_areas_member_select ON public.project_areas;
CREATE POLICY project_areas_member_select ON public.project_areas
    FOR SELECT TO authenticated
    USING (public.can_access_project_area(id));
DROP POLICY IF EXISTS user_profiles_self_select ON public.user_profiles;
CREATE POLICY user_profiles_self_select ON public.user_profiles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
DROP POLICY IF EXISTS project_memberships_self_select ON public.project_memberships;
CREATE POLICY project_memberships_self_select ON public.project_memberships
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
DROP POLICY IF EXISTS area_memberships_self_select ON public.area_memberships;
CREATE POLICY area_memberships_self_select ON public.area_memberships
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Views must execute with caller permissions so their base-table RLS applies.
ALTER VIEW public.v_productos_stock SET (security_invoker = TRUE);
ALTER VIEW public.v_balance_consumos SET (security_invoker = TRUE);
ALTER VIEW public.v_cable_dashboard SET (security_invoker = TRUE);

-- Make audit entries area-aware and visible only to project administrators.
ALTER TABLE public.audit_log
    ADD COLUMN IF NOT EXISTS project_area_id UUID
    REFERENCES public.project_areas(id) ON DELETE RESTRICT;

UPDATE public.audit_log al
SET project_area_id = COALESCE(
    NULLIF(al.datos_nuevos ->> 'project_area_id', '')::UUID,
    NULLIF(al.datos_anteriores ->> 'project_area_id', '')::UUID,
    (SELECT pa.id
     FROM public.project_areas pa
     JOIN public.projects p ON p.id = pa.project_id
     WHERE p.code = 'CURRENT_EPC' AND pa.code = 'SECA')
)
WHERE al.tabla = 'movimientos'
  AND al.project_area_id IS NULL;

DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select ON public.audit_log
    FOR SELECT TO authenticated
    USING (public.is_current_project_admin());

CREATE OR REPLACE FUNCTION public.audit_movimientos_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (
            tabla, operacion, registro_id, datos_nuevos, usuario_id, project_area_id
        ) VALUES (
            'movimientos', 'INSERT', NEW.id::TEXT, TO_JSONB(NEW), auth.uid(), NEW.project_area_id
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_log (
            tabla, operacion, registro_id, datos_anteriores, datos_nuevos, usuario_id, project_area_id
        ) VALUES (
            'movimientos', 'UPDATE', NEW.id::TEXT, TO_JSONB(OLD), TO_JSONB(NEW), auth.uid(), NEW.project_area_id
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_log (
            tabla, operacion, registro_id, datos_anteriores, usuario_id, project_area_id
        ) VALUES (
            'movimientos', 'DELETE', OLD.id::TEXT, TO_JSONB(OLD), auth.uid(), OLD.project_area_id
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- Replace the legacy movement writer, which previously bypassed area RLS.
CREATE OR REPLACE FUNCTION public.registrar_movimiento(
    p_producto_codigo VARCHAR(50),
    p_fecha DATE,
    p_tipo VARCHAR(50),
    p_cantidad NUMERIC(10, 2),
    p_usuario VARCHAR(255),
    p_observaciones TEXT DEFAULT '',
    p_key VARCHAR(50) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_stock_actual NUMERIC(10, 2);
    v_final_key VARCHAR(50);
    v_area_id UUID;
BEGIN
    v_area_id := public.default_project_area_for_current_user();

    IF v_area_id IS NULL OR NOT public.can_access_project_area(v_area_id) THEN
        RETURN JSONB_BUILD_OBJECT('success', FALSE, 'error', 'El usuario no tiene un área operativa válida.');
    END IF;

    PERFORM 1 FROM public.productos WHERE codigo = p_producto_codigo FOR UPDATE;
    IF NOT FOUND THEN
        RETURN JSONB_BUILD_OBJECT('success', FALSE, 'error', 'El producto no existe.');
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN tipo IN ('INGRESO', 'AJUSTE_POSITIVO', 'AJUSTE') THEN cantidad
            WHEN tipo IN ('SALIDA', 'AJUSTE_NEGATIVO') THEN -cantidad
            ELSE 0
        END
    ), 0)
    INTO v_stock_actual
    FROM public.movimientos
    WHERE producto_codigo = p_producto_codigo
      AND project_area_id = v_area_id;

    IF p_tipo IN ('SALIDA', 'AJUSTE_NEGATIVO') AND v_stock_actual < p_cantidad THEN
        RETURN JSONB_BUILD_OBJECT(
            'success', FALSE,
            'error', FORMAT('Stock insuficiente. Disponible: %s, Solicitado: %s', v_stock_actual, p_cantidad)
        );
    END IF;

    IF p_key IS NOT NULL AND p_key <> '' AND p_key <> 'Automatico' THEN
        PERFORM 1 FROM public.movimientos WHERE key = p_key;
        IF FOUND THEN
            RETURN JSONB_BUILD_OBJECT('success', FALSE, 'error', 'Esta clave de transacción ya ha sido registrada.');
        END IF;
        v_final_key := p_key;
    ELSE
        v_final_key := UPPER(SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 10))
            || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 3))
            || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 2));
    END IF;

    INSERT INTO public.movimientos (
        producto_codigo, fecha, tipo, cantidad, usuario, observaciones, key, project_area_id
    ) VALUES (
        p_producto_codigo, p_fecha, p_tipo, p_cantidad, p_usuario, p_observaciones, v_final_key, v_area_id
    );

    RETURN JSONB_BUILD_OBJECT('success', TRUE, 'key', v_final_key);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimiento(VARCHAR, DATE, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento(VARCHAR, DATE, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR) TO authenticated;

-- Prevent the legacy edit/delete RPCs from touching another area.
CREATE OR REPLACE FUNCTION public.eliminar_movimiento_autorizado(
    p_movimiento_id BIGINT,
    p_admin_dni TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_producto_codigo VARCHAR(50);
    v_tipo VARCHAR(50);
    v_cantidad NUMERIC(10, 2);
    v_stock_actual NUMERIC(10, 2);
    v_impacto NUMERIC(10, 2);
    v_area_id UUID;
BEGIN
    SELECT producto_codigo, tipo, cantidad, project_area_id
    INTO v_producto_codigo, v_tipo, v_cantidad, v_area_id
    FROM public.movimientos
    WHERE id = p_movimiento_id;

    IF NOT FOUND OR NOT public.can_access_project_area(v_area_id) THEN
        RAISE EXCEPTION 'El movimiento no existe o no pertenece a su área.';
    END IF;

    PERFORM 1 FROM public.productos WHERE codigo = v_producto_codigo FOR UPDATE;

    SELECT COALESCE(SUM(
        CASE
            WHEN tipo IN ('INGRESO', 'AJUSTE_POSITIVO', 'AJUSTE') THEN cantidad
            WHEN tipo IN ('SALIDA', 'AJUSTE_NEGATIVO') THEN -cantidad
            ELSE 0
        END
    ), 0)
    INTO v_stock_actual
    FROM public.movimientos
    WHERE producto_codigo = v_producto_codigo
      AND project_area_id = v_area_id;

    v_impacto := CASE
        WHEN v_tipo IN ('INGRESO', 'AJUSTE_POSITIVO', 'AJUSTE') THEN -v_cantidad
        ELSE v_cantidad
    END;

    IF (v_stock_actual + v_impacto) < 0 THEN
        RAISE EXCEPTION 'No se puede eliminar el movimiento porque dejaría stock negativo.';
    END IF;

    DELETE FROM public.movimientos
    WHERE id = p_movimiento_id
      AND project_area_id = v_area_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.editar_movimiento_autorizado(
    p_movimiento_id BIGINT,
    p_nueva_cantidad NUMERIC(10, 2),
    p_admin_dni TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_producto_codigo VARCHAR(50);
    v_tipo VARCHAR(50);
    v_cantidad_anterior NUMERIC(10, 2);
    v_stock_actual NUMERIC(10, 2);
    v_diferencia NUMERIC(10, 2);
    v_area_id UUID;
BEGIN
    IF p_nueva_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser mayor a cero.';
    END IF;

    SELECT producto_codigo, tipo, cantidad, project_area_id
    INTO v_producto_codigo, v_tipo, v_cantidad_anterior, v_area_id
    FROM public.movimientos
    WHERE id = p_movimiento_id;

    IF NOT FOUND OR NOT public.can_access_project_area(v_area_id) THEN
        RAISE EXCEPTION 'El movimiento no existe o no pertenece a su área.';
    END IF;

    PERFORM 1 FROM public.productos WHERE codigo = v_producto_codigo FOR UPDATE;

    SELECT COALESCE(SUM(
        CASE
            WHEN tipo IN ('INGRESO', 'AJUSTE_POSITIVO', 'AJUSTE') THEN cantidad
            WHEN tipo IN ('SALIDA', 'AJUSTE_NEGATIVO') THEN -cantidad
            ELSE 0
        END
    ), 0)
    INTO v_stock_actual
    FROM public.movimientos
    WHERE producto_codigo = v_producto_codigo
      AND project_area_id = v_area_id;

    v_diferencia := CASE
        WHEN v_tipo IN ('INGRESO', 'AJUSTE_POSITIVO', 'AJUSTE')
            THEN p_nueva_cantidad - v_cantidad_anterior
        ELSE v_cantidad_anterior - p_nueva_cantidad
    END;

    IF (v_stock_actual + v_diferencia) < 0 THEN
        RAISE EXCEPTION 'No se puede editar el movimiento porque dejaría stock negativo.';
    END IF;

    UPDATE public.movimientos
    SET cantidad = p_nueva_cantidad
    WHERE id = p_movimiento_id
      AND project_area_id = v_area_id;
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_movimiento_autorizado(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eliminar_movimiento_autorizado(BIGINT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.editar_movimiento_autorizado(BIGINT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_movimiento_autorizado(BIGINT, NUMERIC, TEXT) TO authenticated;

-- Close legacy SECURITY DEFINER read paths that could otherwise bypass RLS.
CREATE OR REPLACE FUNCTION public.es_administrador(p_dni TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_current_project_admin()
       AND EXISTS (
           SELECT 1
           FROM public.administradores a
           WHERE a.dni = p_dni
             AND LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
       );
$$;

CREATE OR REPLACE FUNCTION public.obtener_dni_administrador(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_dni TEXT;
BEGIN
    IF LOWER(p_email) <> LOWER(auth.jwt() ->> 'email')
       AND NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado.';
    END IF;

    SELECT a.dni INTO v_dni
    FROM public.administradores a
    WHERE LOWER(a.email) = LOWER(p_email);

    RETURN v_dni;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_integridad()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_orphaned_movements INT;
    v_negative_stock_count INT;
    v_invalid_tipo_count INT;
BEGIN
    IF NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT COUNT(*) INTO v_orphaned_movements
    FROM public.movimientos m
    WHERE NOT EXISTS (
        SELECT 1 FROM public.productos p WHERE p.codigo = m.producto_codigo
    );

    SELECT COUNT(*) INTO v_negative_stock_count
    FROM public.v_productos_stock
    WHERE cantidad < 0;

    SELECT COUNT(*) INTO v_invalid_tipo_count
    FROM public.movimientos
    WHERE tipo NOT IN ('INGRESO', 'SALIDA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'AJUSTE');

    RETURN JSONB_BUILD_OBJECT(
        'orphaned_movements', v_orphaned_movements,
        'negative_stock', v_negative_stock_count,
        'invalid_tipos', v_invalid_tipo_count,
        'is_healthy', (
            v_orphaned_movements = 0
            AND v_negative_stock_count = 0
            AND v_invalid_tipo_count = 0
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_logs_auditoria()
RETURNS TABLE (
    id BIGINT,
    tabla VARCHAR,
    operacion VARCHAR,
    registro_id TEXT,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    fecha TIMESTAMPTZ,
    usuario_email TEXT
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
        a.id,
        a.tabla::VARCHAR,
        a.operacion::VARCHAR,
        a.registro_id,
        a.datos_anteriores,
        a.datos_nuevos,
        a.fecha,
        COALESCE(u.email, 'Sistema/Anónimo')::TEXT
    FROM public.audit_log a
    LEFT JOIN auth.users u ON a.usuario_id = u.id
    ORDER BY a.fecha DESC
    LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_respaldo_seguridad(
    p_creado_por TEXT DEFAULT 'Sistema (Automático)'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_prod_json JSONB;
    v_mov_json JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        IF SESSION_USER NOT IN ('postgres', 'supabase_admin') THEN
            RAISE EXCEPTION 'Acceso denegado.';
        END IF;
    ELSIF NOT public.is_current_project_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: se requieren permisos de administrador.';
    END IF;

    SELECT COALESCE(JSONB_AGG(p), '[]'::JSONB)
    INTO v_prod_json
    FROM public.v_productos_stock p;

    SELECT COALESCE(JSONB_AGG(m), '[]'::JSONB)
    INTO v_mov_json
    FROM public.movimientos m;

    INSERT INTO public.respaldos_seguridad (
        creado_por, productos_snapshot, movimientos_snapshot
    ) VALUES (p_creado_por, v_prod_json, v_mov_json);
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_respaldos_seguridad(p_email TEXT)
RETURNS TABLE (id INT, fecha TIMESTAMPTZ, creado_por TEXT)
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
    SELECT r.id, r.fecha, r.creado_por
    FROM public.respaldos_seguridad r
    ORDER BY r.fecha DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_respaldo_seguridad_detalle(
    p_email TEXT,
    p_respaldo_id INT
)
RETURNS TABLE (productos_snapshot JSONB, movimientos_snapshot JSONB)
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
    SELECT r.productos_snapshot, r.movimientos_snapshot
    FROM public.respaldos_seguridad r
    WHERE r.id = p_respaldo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_respaldo_seguridad(
    p_email TEXT,
    p_respaldo_id INT
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

    DELETE FROM public.respaldos_seguridad WHERE id = p_respaldo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_sistema_autorizado(admin_dni TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_recent_attempts INT;
BEGIN
    IF NOT public.is_current_project_admin()
       OR NOT EXISTS (
           SELECT 1
           FROM public.administradores a
           WHERE a.dni = admin_dni
             AND LOWER(a.email) = LOWER(auth.jwt() ->> 'email')
       ) THEN
        RAISE EXCEPTION 'Operación cancelada: autorización de administrador inválida.';
    END IF;

    SELECT COUNT(*) INTO v_recent_attempts
    FROM public.historial_resets
    WHERE fecha > NOW() - INTERVAL '1 hour';

    IF v_recent_attempts >= 3 THEN
        RAISE EXCEPTION 'Demasiados intentos de restablecimiento. Intente nuevamente en 1 hora.';
    END IF;

    INSERT INTO public.historial_resets (dni, user_id)
    VALUES (admin_dni, auth.uid());

    DELETE FROM public.movimientos WHERE id IS NOT NULL;
    DELETE FROM public.productos WHERE codigo IS NOT NULL;
END;
$$;

-- The obsolete DNI-only administrator creator must not remain callable.
REVOKE ALL ON FUNCTION public.crear_administrador_autorizado(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.es_administrador(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_administrador(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_dni_administrador(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_dni_administrador(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.validar_integridad() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_integridad() TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_logs_auditoria() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_logs_auditoria() TO authenticated;
REVOKE ALL ON FUNCTION public.crear_respaldo_seguridad(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_respaldo_seguridad(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.listar_respaldos_seguridad(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_respaldos_seguridad(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_respaldo_seguridad_detalle(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_respaldo_seguridad_detalle(TEXT, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.eliminar_respaldo_seguridad(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eliminar_respaldo_seguridad(TEXT, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.reset_sistema_autorizado(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_sistema_autorizado(TEXT) TO authenticated;

COMMIT;

-- SQL Editor checkpoint: all operational tables must show area-aware policies.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'movimientos', 'consumos_campo', 'cable_schedule',
      'cable_despachos', 'almaceneros', 'disciplinas'
  )
ORDER BY tablename, cmd, policyname;
