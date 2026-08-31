/**
 * Cable Schedule Manager — Parser Configuration
/**
 * Cable Schedule Manager — Parser Configuration
 * Defines the column mappings for the 2 import types:
 * 1. Cable Schedule (master list + installation tracking)
 * 2. Cable Despachos (warehouse dispatching)
 * 3. Cable PAT (Puesta a Tierra)
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
  metrado_reportado_campo: { label: 'METRADO CONSTRUCCION',    required: false, type: 'number' },
  fecha_tendido:           { label: 'F. REPORTE CONSTRUCCION', required: false, type: 'date' },
  vale:                    { label: 'VALE',                    required: false, type: 'text' },
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

// ─── Cable PAT (Puesta a Tierra) ─────────────────────────────────────────────
export const CABLE_PAT_COLUMNS = {
  wbs:                     { label: 'WBS',                     required: false, type: 'text' },
  sistema:                 { label: 'SISTEMA',                 required: false, type: 'text' },
  tag_unico:               { label: 'TAG UNICO',               required: true,  type: 'text' },
  material:                { label: 'DESCRIPCION DE MATERIAL', required: false, type: 'text' },
  total_estimado_m:        { label: 'METRADO OT',              required: false, type: 'number' },
  total_despachado_m:      { label: 'METRADO DESPACHADO (M)',  required: false, type: 'number' },
  metrado_reportado_campo: { label: 'METRADO CONSTRUCCION',    required: false, type: 'number' },
  fecha_tendido:           { label: 'F. REPORTE CONSTRUCCION', required: false, type: 'date' },
  vale:                    { label: 'VALE',                    required: false, type: 'text' },
};

export const CABLE_PAT_SIGNATURES = [
  'WBS',
  'METRADO DESPACHADO',
  'METRADO OT',
  'METRADO CONSTRUCCION',
  'METRADO CAMPO',
  'DESCRIPCION DE CABLE',
  'DESCRIPCION DE MATERIAL'
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizeImportText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Auto-detect which import type a set of headers corresponds to.
 * Returns 'schedule' | 'despacho' | 'pat' | null
 */
export function detectImportType(headers) {
  const upper = headers.map(normalizeImportText);

  const scheduleHits = CABLE_SCHEDULE_SIGNATURES.filter(sig =>
    upper.some(h => h.includes(sig))
  );
  const despachoHits = CABLE_DESPACHO_SIGNATURES.filter(sig =>
    upper.some(h => h.includes(sig))
  );
  const patHits = CABLE_PAT_SIGNATURES.filter(sig =>
    upper.some(h => h.includes(sig))
  );

  // Find max hits among the three
  const maxHits = Math.max(scheduleHits.length, despachoHits.length, patHits.length);
  
  if (maxHits >= 2) {
    if (patHits.length === maxHits) return 'pat';
    if (scheduleHits.length === maxHits) return 'schedule';
    if (despachoHits.length === maxHits) return 'despacho';
  }
  
  return null;
}

/**
 * Auto-map detected headers to system fields using fuzzy matching.
 * Returns { systemField: headerIndex } mapping.
 */
export function autoMapColumns(headers, columnDefs) {
  const mapping = {};
  const upperHeaders = headers.map(normalizeImportText);

  const ALIASES = {
    tag_unico: ['TAG UNICO', 'TAG_UNICO', 'TAG'],
    numero: ['N°', 'N', 'NUMERO'],
    area: ['AREA', 'WBS', 'ZONA'],
    wbs: ['WBS', 'AREA'],
    sistema: ['SISTEMA', 'SUBSISTEMA', 'SUB-SISTEMA'],
    material: ['DESCRIPCION DE MATERIAL', 'DESCRIPCION MATERIAL', 'DESCRIPCION DE CABLE', 'DESCRIPCION DE TUBERIA', 'DESCRIPCION CABLE', 'DESCRIPCION', 'MATERIAL'],
    total_estimado_m: ['TOTAL ESTIMADO', 'TOTAL ESTIM', 'TOTAL ESTIM. (M)', 'METRADO OT', 'METRADO OT (M)'],
    conexion_origen: ['CONEXION DE ORIGEN', 'CONEXION ORIGEN', 'ORIGEN'],
    conexion_destino: ['CONEXION DE DESTINO', 'CONEXION DESTINO', 'DESTINO'],
    tipo_servicio: ['TIPO SERVICIO', 'TIPO', 'SERVICIO'],
    metrado_reportado_campo: ['METRADO CONSTRUCCION', 'METRADO CONSTRUCCIÓN', 'METRADO DE CONSTRUCCION', 'METRADO REPORTADO CAMPO', 'METRADO CAMPO', 'METRADO CAMPO (M)', 'METRADO EN CAMPO'],
    fecha_tendido: ['F. REPORTE CONSTRUCCION', 'F. REPORTE CONSTRUCCIÓN', 'F REPORTE CONSTRUCCION', 'FECHA REPORTE CONSTRUCCION', 'FECHA REPORTE CONSTRUCCIÓN', 'FECHA METRADO CAMPO', 'FECHA', 'FECHA DE METRADO', 'FECHA TENDIDO', 'FECHA_TENDIDO'],
    vale: ['VALE', 'NRO VALE', 'NUMERO DE VALE', 'VALE DE ALMACEN']
  };

  for (const [field, def] of Object.entries(columnDefs)) {
    const list = ALIASES[field] || [def.label];

    // Find the first header that matches any alias (exact match)
    let idx = -1;
    for (const alias of list) {
      const aliasUpper = normalizeImportText(alias).replace(/[^A-Z0-9]/g, '');
      idx = upperHeaders.findIndex(h => h.replace(/[^A-Z0-9]/g, '') === aliasUpper);
      if (idx !== -1) break;
    }

    // Fallback: search if alias is contained in header or vice versa
    if (idx === -1) {
      for (const alias of list) {
        const aliasUpper = normalizeImportText(alias).replace(/[^A-Z0-9]/g, '');
        if (!aliasUpper) continue;
        idx = upperHeaders.findIndex(h => {
          const cleanH = h.replace(/[^A-Z0-9]/g, '');
          return cleanH.includes(aliasUpper) || aliasUpper.includes(cleanH);
        });
        if (idx !== -1) break;
      }
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
