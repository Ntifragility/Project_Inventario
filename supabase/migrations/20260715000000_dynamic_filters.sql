-- Dynamic filters tables (Almaceneros and Disciplinas) for Smart Import Wizard

-- 1. Almaceneros Table (Warehouse Keepers for Salidas)
CREATE TABLE IF NOT EXISTS almaceneros (
    codigo VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Disciplinas Table (Projects/Disciplines for Ingresos)
CREATE TABLE IF NOT EXISTS disciplinas (
    nombre VARCHAR(100) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. RLS setup
ALTER TABLE almaceneros ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "almaceneros_select" ON almaceneros FOR SELECT TO authenticated USING (true);
CREATE POLICY "almaceneros_insert" ON almaceneros FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "almaceneros_delete" ON almaceneros FOR DELETE TO authenticated USING (true);

CREATE POLICY "disciplinas_select" ON disciplinas FOR SELECT TO authenticated USING (true);
CREATE POLICY "disciplinas_insert" ON disciplinas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "disciplinas_delete" ON disciplinas FOR DELETE TO authenticated USING (true);

-- 4. Initial Seed Data (matching previous hardcoded configurations)
INSERT INTO almaceneros (codigo, nombre) VALUES
    ('gfernandezh', 'gfernandezh'),
    ('mfernandezt', 'mfernandezt'),
    ('jchumbiaucah', 'jchumbiaucah'),
    ('wcamposp', 'wcamposp'),
    ('wriveros', 'wriveros'),
    ('bhuaylla', 'bhuaylla')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO disciplinas (nombre) VALUES
    ('OT - Electricidad')
ON CONFLICT (nombre) DO NOTHING;
