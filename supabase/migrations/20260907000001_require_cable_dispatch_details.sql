-- Require warehouse voucher and recipient on new or edited deliveries, and
-- limit optional comments to 50 characters. NOT VALID preserves legacy rows
-- until they are edited while enforcing each constraint for future writes.

BEGIN;

ALTER TABLE public.cable_despachos
    ADD CONSTRAINT cable_despachos_vale_almacen_required
    CHECK (vale_almacen IS NOT NULL AND BTRIM(vale_almacen) <> '')
    NOT VALID;

ALTER TABLE public.cable_despachos
    ADD CONSTRAINT cable_despachos_solicitado_por_required
    CHECK (solicitado_por IS NOT NULL AND BTRIM(solicitado_por) <> '')
    NOT VALID;

ALTER TABLE public.cable_despachos
    ADD CONSTRAINT cable_despachos_observaciones_max_50
    CHECK (observaciones IS NULL OR CHAR_LENGTH(observaciones) <= 50)
    NOT VALID;

COMMIT;
