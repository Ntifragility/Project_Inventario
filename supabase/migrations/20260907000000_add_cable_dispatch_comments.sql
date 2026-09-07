-- Store an optional comment for each individual cable delivery.

BEGIN;

ALTER TABLE public.cable_despachos
    ADD COLUMN IF NOT EXISTS observaciones TEXT;

COMMENT ON COLUMN public.cable_despachos.observaciones IS
    'Optional comments associated with this individual cable delivery.';

COMMIT;
