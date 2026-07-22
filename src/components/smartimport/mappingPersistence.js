import { supabase } from '../../supabase';

/**
 * Normalizes a header string for consistent signature comparison.
 */
export function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Generates a sorted, normalized signature array from file headers.
 */
export function getHeadersSignature(headers) {
  if (!Array.isArray(headers)) return [];
  return headers
    .map(h => normalizeHeader(h))
    .filter(Boolean)
    .sort();
}

/**
 * Finds a matching profile in the database by comparing file headers against signature_columns.
 * A match occurs if all signature_columns of a profile exist in the uploaded file headers.
 */
export function findMatchingProfileByHeaders(headers, profiles = [], type = null) {
  if (!headers || !headers.length || !profiles || !profiles.length) return null;

  const normalizedFileHeaders = new Set(headers.map(normalizeHeader));

  let bestMatch = null;
  let highestScore = 0;

  for (const prof of profiles) {
    if (type && prof.type !== type) continue;

    const sigCols = Array.isArray(prof.signature_columns) ? prof.signature_columns : [];
    if (!sigCols.length) continue;

    const normalizedSig = sigCols.map(normalizeHeader);
    const matchCount = normalizedSig.filter(sc => normalizedFileHeaders.has(sc)).length;

    // Must match at least 75% of the signature columns
    const minRequired = Math.min(normalizedSig.length, Math.ceil(normalizedSig.length * 0.75));

    if (matchCount >= minRequired && matchCount > highestScore) {
      highestScore = matchCount;
      bestMatch = prof;
    }
  }

  return bestMatch;
}

/**
 * Loads all column mapping profiles from Supabase.
 */
export async function fetchMappingProfiles(type = null) {
  try {
    let query = supabase.from('import_profiles').select('*').order('created_at', { ascending: false });
    if (type) {
      query = query.eq('type', type);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('Error fetching import profiles:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Failed to fetch import profiles:', err);
    return [];
  }
}

/**
 * Automatically saves or updates a column mapping configuration in Supabase.
 */
export async function saveOrUpdateProfile({ name, type, headers, columnMapping }) {
  try {
    const signatureColumns = headers.map(h => String(h || '').trim()).filter(Boolean);
    const requiredColumns = Object.keys(columnMapping || {});

    const profileData = {
      name: name || `Estructura ${type} (${headers.length} col)`,
      type,
      signature_columns: signatureColumns,
      required_columns: requiredColumns,
      column_mapping: columnMapping
    };

    const { data, error } = await supabase
      .from('import_profiles')
      .upsert(profileData, { onConflict: 'name' })
      .select();

    if (error) {
      console.error('Error saving import profile:', error);
      return null;
    }
    return data ? data[0] : null;
  } catch (err) {
    console.error('Failed to save import profile:', err);
    return null;
  }
}
