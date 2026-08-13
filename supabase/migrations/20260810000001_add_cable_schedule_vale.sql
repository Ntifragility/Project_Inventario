ALTER TABLE public.cable_schedule
    ADD COLUMN IF NOT EXISTS vale VARCHAR(100);

COMMENT ON COLUMN public.cable_schedule.vale IS
    'Vale imported from the VALE column in the Cable Schedule or PAT spreadsheet.';
