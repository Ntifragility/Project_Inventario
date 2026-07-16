-- Add UPDATE RLS policies for almaceneros and disciplinas tables to enable editing from the UI

DROP POLICY IF EXISTS "almaceneros_update" ON almaceneros;
CREATE POLICY "almaceneros_update" ON almaceneros FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "disciplinas_update" ON disciplinas;
CREATE POLICY "disciplinas_update" ON disciplinas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
