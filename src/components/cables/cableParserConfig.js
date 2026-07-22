/**
 * Cable Schedule Manager — Parser Configuration
 * Defines the column mappings for the 2 import types:
 * 1. Cable Schedule (master list + installation tracking)
 * 2. Cable Despachos (warehouse dispatching)
 */

// ─── Cable Schedule (Master) ─────────────────────────────────────────────────
// Maps spreadsheet headers → Supabase column names
export const CABLE_SCHEDULE_COLUMNS = {
  tag_unico:               { label: 'TAG UNICO',               required: true,  type: 'text' },
  numero:                  { label: 'N°',                      required: false, type: 'integer' },
  area:                    { label: 'AREA',                    required: false, type: 'text' },
  sistema:                 { label: 'SISTEMA',                 required: false, type: 'text' },
  material:                { label: 'DESCRIPCION DE MATERIAL', required: false, type: 'text' },
  total_estimado_m:        { label: 'TOTAL ESTIM. (m)',        required: true,  type: 'number' },
  conexion_origen:         { label: 'CONEXION DE ORIGEN',      required: false, type: 'text' },
  conexion_destino:        { label: 'CONEXION DE DESTINO',     required: false, type: 'text' },
  tipo_servicio:           { label: 'TIPO SERVICIO',           required: false, type: 'text' },
  metrado_reportado_campo: { label: 'METRADO REPORTADO CAMPO', required: false, type: 'number' },
  fecha_tendido:           { label: 'FECHA',                   required: false, type: 'date' },
};

// Signature columns used to auto-detect a Cable Schedule file
export const CABLE_SCHEDULE_SIGNATURES = [
  'TAG UNICO',
  'TOTAL ESTIM',
  'CONEXION DE ORIGEN',
  'CONEXION DE DESTINO',
];

// ─── Cable Despachos (Warehouse) ─────────────────────────────────────────────
export const CABLE_DESPACHO_COLUMNS = {
  tag_unico:             { label: 'TAG UNICO',             required: true,  type: 'text' },
  area:                  { label: 'AREA',                  required: false, type: 'text' },
  partida:               { label: 'PARTIDA',               required: false, type: 'text' },
  sector:                { label: 'SECTOR',                required: false, type: 'text' },
  area_n:                { label: 'AREA_N',                required: false, type: 'text' },
  plano_aterramiento:    { label: 'PLANO DE ATERRAMIENTO', required: false, type: 'text' },
  revision:              { label: 'REV',                   required: false, type: 'integer' },
  tag_en_plano:          { label: 'TAG EN PLANO',          required: false, type: 'text' },
  vale_almacen:          { label: 'VALE DE ALMACEN',       required: false, type: 'text' },
  fecha_entrega:         { label: 'FECHA ENTREGA',         required: false, type: 'date' },
  longitud_despachada_m: { label: 'LONG. DESPACHADA (m)',  required: true,  type: 'number' },
  solicitado_por:        { label: 'SOLICITADO POR',        required: false, type: 'text' },
};

export const CABLE_DESPACHO_SIGNATURES = [
  'TAG UNICO',
  'VALE DE ALMACEN',
  'LONG. DESPACHADA',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Auto-detect which import type a set of headers corresponds to.
 * Returns 'schedule' | 'despacho' | null
 */
export function detectImportType(headers) {
  const upper = headers.map(h => (h || '').toString().toUpperCase().trim());

  const scheduleHits = CABLE_SCHEDULE_SIGNATURES.filter(sig =>
    upper.some(h => h.includes(sig))
  );
  const despachoHits = CABLE_DESPACHO_SIGNATURES.filter(sig =>
    upper.some(h => h.includes(sig))
  );

  // Require at least 2 signature matches
  if (scheduleHits.length >= 2 && scheduleHits.length >= despachoHits.length) return 'schedule';
  if (despachoHits.length >= 2) return 'despacho';
  return null;
}

/**
 * Auto-map detected headers to system fields using fuzzy matching.
 * Returns { systemField: headerIndex } mapping.
 */
export function autoMapColumns(headers, columnDefs) {
  const mapping = {};
  const upperHeaders = headers.map(h => (h || '').toString().toUpperCase().trim());

  for (const [field, def] of Object.entries(columnDefs)) {
    const target = def.label.toUpperCase();

    // Try exact match first
    let idx = upperHeaders.findIndex(h => h === target);

    // Try partial / contains match
    if (idx === -1) {
      idx = upperHeaders.findIndex(h => h.includes(target) || target.includes(h));
    }

    // Try word-start matching for abbreviated headers
    if (idx === -1) {
      const targetWords = target.split(/\s+/);
      idx = upperHeaders.findIndex(h => {
        const hWords = h.split(/\s+/);
        return targetWords.every(tw =>
          hWords.some(hw => hw.startsWith(tw) || tw.startsWith(hw))
        );
      });
    }

    if (idx !== -1) {
      mapping[field] = idx;
    }
  }

  return mapping;
}

/**
 * Parse a value according to its type definition.
 */
export function parseValue(raw, type) {
  if (raw === null || raw === undefined || raw === '') return null;

  switch (type) {
    case 'number': {
      const num = parseFloat(String(raw).replace(/,/g, ''));
      return isNaN(num) ? null : num;
    }
    case 'integer': {
      const int = parseInt(String(raw), 10);
      return isNaN(int) ? null : int;
    }
    case 'date': {
      if (raw instanceof Date) return raw.toISOString().slice(0, 10);
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    default:
      return String(raw).trim();
  }
}

/**
 * Transform a row of raw values into a Supabase-ready object.
 */
export function transformRow(row, mapping, columnDefs) {
  const obj = {};
  for (const [field, headerIdx] of Object.entries(mapping)) {
    const def = columnDefs[field];
    if (!def) continue;
    obj[field] = parseValue(row[headerIdx], def.type);
  }
  return obj;
}
