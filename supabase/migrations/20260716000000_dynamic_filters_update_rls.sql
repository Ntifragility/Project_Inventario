-- Add UPDATE RLS policies for almaceneros, disciplinas, and productos_sinonimos tables to enable editing/upserting from the UI

DROP POLICY IF EXISTS "almaceneros_update" ON almaceneros;
CREATE POLICY "almaceneros_update" ON almaceneros FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "disciplinas_update" ON disciplinas;
CREATE POLICY "disciplinas_update" ON disciplinas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sinonimos_update" ON productos_sinonimos;
CREATE POLICY "sinonimos_update" ON productos_sinonimos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
