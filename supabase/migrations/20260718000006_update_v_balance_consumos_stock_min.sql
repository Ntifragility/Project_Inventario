-- 1. DROP the old view
DROP VIEW IF EXISTS v_balance_consumos;

-- 2. Recreate the view with p.stock_min included
CREATE VIEW v_balance_consumos AS
WITH WarehouseIngresos AS (
    SELECT 
        producto_codigo,
        SUM(cantidad) AS total_ingreso,
        SUM(cant_oc) AS total_cant_oc
    FROM movimientos
    WHERE tipo IN ('INGRESO', 'AJUSTE_POSITIVO', 'AJUSTE')
    GROUP BY producto_codigo
),
WarehouseSalidas AS (
    SELECT 
        producto_codigo,
        SUM(cantidad) AS total_salida
    FROM movimientos
    WHERE tipo IN ('SALIDA', 'AJUSTE_NEGATIVO')
    GROUP BY producto_codigo
),
FieldConsumos AS (
    SELECT 
        producto_codigo,
        SUM(metrado_reportado) AS total_consumo,
        SUM(metrado_ot) AS total_metrado_ot
    FROM consumos_campo
    GROUP BY producto_codigo
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
    (COALESCE(i.total_ingreso, 0) - COALESCE(w.total_salida, 0)) AS stock_almacen,
    COALESCE(w.total_salida, 0) AS total_salida,
    COALESCE(f.total_metrado_ot, 0) AS total_metrado_ot,
    COALESCE(f.total_consumo, 0) AS total_consumo,
    (COALESCE(w.total_salida, 0) - COALESCE(f.total_consumo, 0)) AS brecha,
    CASE 
        WHEN COALESCE(w.total_salida, 0) = 0 THEN 0
        ELSE ROUND(((COALESCE(w.total_salida, 0) - COALESCE(f.total_consumo, 0)) / COALESCE(w.total_salida, 0)) * 100, 2)
    END AS porcentaje_brecha
FROM productos p
LEFT JOIN grupos g ON p.grupo_id = g.id
LEFT JOIN unidades u ON p.unidad_id = u.id
LEFT JOIN WarehouseIngresos i ON p.codigo = i.producto_codigo
LEFT JOIN WarehouseSalidas w ON p.codigo = w.producto_codigo
LEFT JOIN FieldConsumos f ON p.codigo = f.producto_codigo;
