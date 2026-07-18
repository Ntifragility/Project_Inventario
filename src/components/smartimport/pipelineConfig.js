/**
 * Pipeline Configuration for Smart Import Wizard
 * Defines column mappings, filters, and transformation rules
 * for both Ingresos (Tabla_Procura) and Salidas (Tabla_Almacen) pipelines.
 */

// ── Ingresos Pipeline (from Tabla_Procura, 105+ columns) ──────────────
export const INGRESOS_CONFIG = {
  label: 'Ingreso de Material',
  // Row filter: only keep rows where Disciplina matches
  filterColumn: 'Disciplina',

  // Columns to extract from the raw file (must match raw headers exactly)
  sourceColumns: [
    'TRANSACTION KEY',
    'DESCRIPCION',
    'CantRecep.',
    'UMP',
    'ESTADO GENERAL',
    'ESTADO DETALLADO',
    'Fec.Creac.',
    'Cant. OC',
    'CantSolic.',
    'F.Rec.Proy',
    'Cant.Pend.'
  ],

  // Column used for dictionary matching (description text)
  descriptionColumn: 'DESCRIPCION',

  // Mapping from raw column names → standard Golden Layout names
  columnMapping: {
    'TRANSACTION KEY': 'Transaction Key',
    'F.Rec.Proy': 'Fecha',
    'DESCRIPCION': 'Producto',
    'CantRecep.': 'Cantidad',
    'UMP': 'Unidad'
  },

  // Extra columns to show in preview but not import
  extraColumns: ['ESTADO GENERAL', 'ESTADO DETALLADO', 'Fec.Creac.', 'Cant. OC', 'CantSolic.', 'Cant.Pend.'],

  // Movement type
  movementType: 'INGRESO',

  // Signature columns to auto-detect this file type
  signatureColumns: ['Disciplina', 'TRANSACTION KEY', 'DESCRIPCION']
};

// ── Salidas Pipeline (from Tabla_Almacen, 17 columns) ─────────────────
export const SALIDAS_CONFIG = {
  label: 'Salida de Material',
  // Row filter: only keep rows where Cód.Almacenero is in the allowed list
  filterColumn: 'Cód.Almacenero',

  // Columns to extract from the raw file
  sourceColumns: [
    'Nro',
    'Fecha de pedido',
    'Descr. Artículo',
    'Cant. entregada',
    'UM',
    'Cód.Almacenero'
  ],

  // Column used for dictionary matching (description text)
  descriptionColumn: 'Descr. Artículo',

  // Mapping from raw column names → standard Golden Layout names
  columnMapping: {
    'Nro': 'Transaction Key',
    'Fecha de pedido': 'Fecha',
    'Descr. Artículo': 'Producto',
    'Cant. entregada': 'Cantidad',
    'UM': 'Unidad',
    'Cód.Almacenero': 'Almacenero'
  },

  // Extra columns to show in preview but not import
  extraColumns: [],

  // Movement type
  movementType: 'SALIDA',

  // Signature columns to auto-detect this file type
  signatureColumns: ['Cód.Almacenero', 'Descr. Artículo', 'Cant. entregada']
};

/**
 * Auto-detect which pipeline profile to use based on the headers in the uploaded file and the fetched database profiles.
 * @param {string[]} headers - Array of column header strings from the file.
 * @param {object[]} profiles - Array of import profiles loaded from Supabase.
 * @returns {object|null} The detected profile object, or null.
 */
export function detectPipeline(headers, profiles) {
  const normalize = (s) =>
    String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9.]/g, '');

  const normHeaders = headers.map(normalize);

  if (!profiles || profiles.length === 0) {
    // Fallback detection using static configurations
    const getMatchCount = (config) => {
      let count = 0;
      for (const sig of config.signatureColumns) {
        const normSig = normalize(sig);
        if (normHeaders.some(h => h === normSig || h.includes(normSig))) {
          count++;
        }
      }
      return count;
    };
    const scoreIngresos = getMatchCount(INGRESOS_CONFIG);
    const scoreSalidas = getMatchCount(SALIDAS_CONFIG);
    if (scoreIngresos === 0 && scoreSalidas === 0) return null;
    return scoreIngresos >= scoreSalidas ? { ...INGRESOS_CONFIG, id: 'ingresos_default', type: 'ingresos' } : { ...SALIDAS_CONFIG, id: 'salidas_default', type: 'salidas' };
  }

  let bestProfile = null;
  let maxMatchCount = 0;

  for (const profile of profiles) {
    let matchCount = 0;
    const signatures = profile.signature_columns || [];
    for (const sig of signatures) {
      const normSig = normalize(sig);
      if (normHeaders.some(h => h === normSig || h.includes(normSig))) {
        matchCount++;
      }
    }
    if (matchCount > maxMatchCount && matchCount >= 2) { // Require at least 2 matching signature columns to avoid false auto-detects
      maxMatchCount = matchCount;
      bestProfile = profile;
    }
  }

  return bestProfile;
}

/**
 * Find the index of a column header using flexible matching.
 * @param {string[]} headers - Raw headers from the file.
 * @param {string} target - The target column name to find.
 * @returns {number} The column index, or -1 if not found.
 */
export function findColumnIndex(headers, target) {
  if (!target) return -1;
  const normalize = (s) =>
    String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

  const normTarget = normalize(target);

  for (let i = 0; i < headers.length; i++) {
    if (normalize(headers[i]) === normTarget) return i;
  }
  // Fallback: substring match
  for (let i = 0; i < headers.length; i++) {
    if (normalize(headers[i]).includes(normTarget) || normTarget.includes(normalize(headers[i]))) return i;
  }
  return -1;
}
