/**
 * Fuzzy string matching utilities for the Smart Import Wizard.
 * Uses Dice coefficient on character bigrams — lightweight, no external dependencies.
 */

/**
 * Normalize a string for comparison: lowercase, remove accents, collapse whitespace.
 */
export function normalize(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate character bigrams from a string.
 * @param {string} str - Input string (should already be normalized).
 * @returns {Map<string, number>} Map of bigram → count.
 */
function bigrams(str) {
  const map = new Map();
  for (let i = 0; i < str.length - 1; i++) {
    const pair = str.substring(i, i + 2);
    map.set(pair, (map.get(pair) || 0) + 1);
  }
  return map;
}

/**
 * Calculate the Dice coefficient between two strings.
 * Returns a value between 0 (no similarity) and 1 (identical).
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} Similarity score between 0 and 1.
 */
export function diceCoefficient(a, b) {
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1.0;
  if (na.length < 2 || nb.length < 2) return 0.0;

  const bigramsA = bigrams(na);
  const bigramsB = bigrams(nb);

  let intersection = 0;
  for (const [pair, countA] of bigramsA) {
    const countB = bigramsB.get(pair) || 0;
    intersection += Math.min(countA, countB);
  }

  let totalA = 0;
  for (const count of bigramsA.values()) totalA += count;
  let totalB = 0;
  for (const count of bigramsB.values()) totalB += count;

  return (2 * intersection) / (totalA + totalB);
}

/**
 * Find the best fuzzy matches for a query string against a list of candidates.
 * @param {string} query - The description text to match.
 * @param {Array<{codigo: string, nombre: string}>} candidates - Product list to search against.
 * @param {number} threshold - Minimum similarity score (default 0.45 to match Power Query setting).
 * @param {number} maxResults - Maximum number of results to return (default 5).
 * @returns {Array<{codigo: string, nombre: string, score: number}>} Sorted matches above threshold.
 */
export function fuzzySearch(query, candidates, threshold = 0.45, maxResults = 5) {
  if (!query || !candidates || candidates.length === 0) return [];

  const results = [];

  for (const candidate of candidates) {
    // Check against product name
    const scoreNombre = diceCoefficient(query, candidate.nombre);
    if (scoreNombre >= threshold) {
      results.push({
        codigo: candidate.codigo,
        nombre: candidate.nombre,
        score: scoreNombre
      });
    }
  }

  // Sort by score descending, take top N
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

/**
 * Check if a text matches any synonym in the dictionary.
 * Supports exact matches and wildcard patterns containing '*' (e.g. 'TUBO*PVC', 'TUBO * PVC', 'TUBO* PVC', 'TUBO *PVC').
 * @param {string} text - The raw description text.
 * @param {Array<{texto_sinonimo: string, producto_codigo: string, tipo_columna: string}>} synonyms
 * @returns {string|null} The matched producto_codigo, or null.
 */
export function exactMatchSynonym(text, synonyms) {
  if (!text || !synonyms || synonyms.length === 0) return null;
  const normText = normalize(text);

  for (const syn of synonyms) {
    const rawSyn = String(syn.texto_sinonimo || '').trim();
    if (!rawSyn) continue;

    if (rawSyn.includes('*')) {
      // Split by wildcard '*', normalize each section
      const parts = rawSyn.split('*').map(p => normalize(p)).filter(Boolean);
      if (parts.length > 0) {
        // Create regex pattern where parts are joined by '.*' (matches any characters/spaces)
        const regexPattern = parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        const regex = new RegExp(regexPattern, 'i');
        if (regex.test(normText)) {
          return syn.producto_codigo;
        }
      }
    } else {
      if (normalize(rawSyn) === normText) {
        return syn.producto_codigo;
      }
    }
  }
  return null;
}
