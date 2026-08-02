-- Phase 5: expose inventory balances per project area and allow explicit area writes.
-- Existing callers remain compatible: registrar_movimiento still defaults to the
-- caller's assigned area (or SECA for an administrator) when no area is supplied.

-- These operational lookup values may legitimately repeat in both areas.
ALTER TABLE public.almaceneros
    DROP CONSTRAINT IF EXISTS almaceneros_pkey;
ALTER TABLE public.almaceneros
    ADD CONSTRAINT almaceneros_pkey PRIMARY KEY (project_area_id, codigo);

ALTER TABLE public.disciplinas
    DROP CONSTRAINT IF EXISTS disciplinas_pkey;
ALTER TABLE public.disciplinas
    ADD CONSTRAINT disciplinas_pkey PRIMARY KEY (project_area_id, nombre);

-- Transaction keys identify an import transaction inside an area. The same
-- external source may legitimately reuse a key in the other EPC area.
ALTER TABLE public.movimientos
    DROP CONSTRAINT IF EXISTS movimientos_key_key;
ALTER TABLE public.movimientos
    DROP CONSTRAINT IF EXISTS movimientos_area_key_unique;
ALTER TABLE public.movimientos
    ADD CONSTRAINT movimientos_area_key_unique
    UNIQUE (project_area_id, key);

CREATE OR REPLACE VIEW public.v_productos_stock AS
SELECT
    p.codigo,
    p.nombre,
    u.nombre AS unidad,
    g.nombre AS grupo,
    p.stock_min,
    COALESCE(
        SUM(
            CASE
                WHEN m.tipo IN ('INGRESO', 'AJUSTE_POSITIVO', 'AJUSTE') THEN m.cantidad
                WHEN m.tipo IN ('SALIDA', 'AJUSTE_NEGATIVO') THEN -m.cantidad
                ELSE 0
            END
        ),
        0
    ) AS cantidad,
    pa.id AS project_area_id
FROM public.project_areas pa
CROSS JOIN public.productos p
LEFT JOIN public.unidades u ON p.unidad_id = u.id
LEFT JOIN public.grupos g ON p.grupo_id = g.id
LEFT JOIN public.movimientos m
    ON m.producto_codigo = p.codigo
   AND m.project_area_id = pa.id
WHERE pa.active
GROUP BY pa.id, p.codigo, p.nombre, u.nombre, g.nombre, p.stock_min;

ALTER VIEW public.v_productos_stock SET (security_invoker = TRUE);

-- The deployed project may have either historical column layout for this view.
-- Recreate it instead of using CREATE OR REPLACE, which cannot insert a column
-- between existing output columns.
DROP VIEW IF EXISTS public.v_balance_consumos;

CREATE VIEW public.v_balance_consumos AS
WITH warehouse_ingresos AS (
    SELECT
        project_area_id,
        producto_codigo,
        SUM(cantidad) AS total_ingreso,
        SUM(cant_oc) AS total_cant_oc
    FROM public.movimientos
    WHERE tipo IN ('INGRESO', 'AJUSTE_POSITIVO', 'AJUSTE')
    GROUP BY project_area_id, producto_codigo
),
warehouse_salidas AS (
    SELECT
        project_area_id,
        producto_codigo,
        SUM(cantidad) AS total_salida
    FROM public.movimientos
    WHERE tipo IN ('SALIDA', 'AJUSTE_NEGATIVO')
    GROUP BY project_area_id, producto_codigo
),
field_consumos AS (
    SELECT
        project_area_id,
        producto_codigo,
        SUM(metrado_reportado) AS total_consumo,
        SUM(metrado_ot) AS total_metrado_ot
    FROM public.consumos_campo
    GROUP BY project_area_id, producto_codigo
)
SELECT
    p.codigo,
    p.nombre,
    p.grupo_id,
    g.nombre AS grupo,
    u.nombre AS unidad,
    p.stock_min,
    COALESCE(i.total_cant_oc, 0) AS total_cant_oc,
    COALESCE(i.total_ingreso, 0) AS total_ingreso,
    COALESCE(i.total_ingreso, 0) - COALESCE(w.total_salida, 0) AS stock_almacen,
    COALESCE(w.total_salida, 0) AS total_salida,
    COALESCE(f.total_metrado_ot, 0) AS total_metrado_ot,
    COALESCE(f.total_consumo, 0) AS total_consumo,
    COALESCE(w.total_salida, 0) - COALESCE(f.total_consumo, 0) AS brecha,
    CASE
        WHEN COALESCE(w.total_salida, 0) = 0 THEN 0
        ELSE ROUND(
            ((COALESCE(w.total_salida, 0) - COALESCE(f.total_consumo, 0))
                / COALESCE(w.total_salida, 0)) * 100,
            2
        )
    END AS porcentaje_brecha,
    pa.id AS project_area_id
FROM public.project_areas pa
CROSS JOIN public.productos p
LEFT JOIN public.grupos g ON p.grupo_id = g.id
LEFT JOIN public.unidades u ON p.unidad_id = u.id
LEFT JOIN warehouse_ingresos i
    ON i.project_area_id = pa.id
   AND i.producto_codigo = p.codigo
LEFT JOIN warehouse_salidas w
    ON w.project_area_id = pa.id
   AND w.producto_codigo = p.codigo
LEFT JOIN field_consumos f
    ON f.project_area_id = pa.id
   AND f.producto_codigo = p.codigo
WHERE pa.active;

ALTER VIEW public.v_balance_consumos SET (security_invoker = TRUE);

REVOKE ALL ON public.v_balance_consumos FROM anon;
REVOKE ALL ON public.v_balance_consumos FROM PUBLIC;
GRANT SELECT ON public.v_balance_consumos TO authenticated;

DROP FUNCTION IF EXISTS public.registrar_movimiento(
    VARCHAR, DATE, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR
);
DROP FUNCTION IF EXISTS public.registrar_movimiento(
    VARCHAR, DATE, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR, UUID
);

CREATE FUNCTION public.registrar_movimiento(
    p_producto_codigo VARCHAR(50),
    p_fecha DATE,
    p_tipo VARCHAR(50),
    p_cantidad NUMERIC(10, 2),
    p_usuario VARCHAR(255),
    p_observaciones TEXT DEFAULT '',
    p_key VARCHAR(50) DEFAULT NULL,
    p_project_area_id UUID DEFAULT NULL
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
    v_area_id := COALESCE(
        p_project_area_id,
        public.default_project_area_for_current_user()
    );

    IF v_area_id IS NULL OR NOT public.can_access_project_area(v_area_id) THEN
        RETURN JSONB_BUILD_OBJECT(
            'success', FALSE,
            'error', 'El usuario no tiene acceso al area operativa seleccionada.'
        );
    END IF;

    PERFORM 1
    FROM public.productos
    WHERE codigo = p_producto_codigo
    FOR UPDATE;

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
            'error', FORMAT(
                'Stock insuficiente. Disponible: %s, Solicitado: %s',
                v_stock_actual,
                p_cantidad
            )
        );
    END IF;

    IF p_key IS NOT NULL AND p_key <> '' AND p_key <> 'Automatico' THEN
        PERFORM 1
        FROM public.movimientos
        WHERE project_area_id = v_area_id
          AND key = p_key;
        IF FOUND THEN
            RETURN JSONB_BUILD_OBJECT(
                'success', FALSE,
                'error', 'Esta clave de transaccion ya ha sido registrada.'
            );
        END IF;
        v_final_key := p_key;
    ELSE
        v_final_key := UPPER(SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 10))
            || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 3))
            || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 2));
    END IF;

    INSERT INTO public.movimientos (
        producto_codigo,
        fecha,
        tipo,
        cantidad,
        usuario,
        observaciones,
        key,
        project_area_id
    ) VALUES (
        p_producto_codigo,
        p_fecha,
        p_tipo,
        p_cantidad,
        p_usuario,
        p_observaciones,
        v_final_key,
        v_area_id
    );

    RETURN JSONB_BUILD_OBJECT('success', TRUE, 'key', v_final_key);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimiento(
    VARCHAR, DATE, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento(
    VARCHAR, DATE, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR, UUID
) TO authenticated;

COMMENT ON VIEW public.v_productos_stock IS
    'Stock por producto y area de proyecto; filtrar siempre por project_area_id.';
COMMENT ON VIEW public.v_balance_consumos IS
    'Balance de almacen y campo por producto y area de proyecto.';
