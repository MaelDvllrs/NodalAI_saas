import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase : variables SUPABASE_URL / SUPABASE_SERVICE_KEY manquantes');
  return createClient(url, key);
}

/**
 * Persist a SERP model snapshot in Supabase (table: serp_models).
 *
 * @param {string} keyword
 * @param {object} model
 */
export async function saveSerpModel(keyword, model) {
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('serp_models')
      .upsert(
        { keyword: keyword.toLowerCase(), model, updated_at: new Date().toISOString() },
        { onConflict: 'keyword' }
      );
    if (error) console.error('[SERP] Erreur saveSerpModel:', error.message);
    else console.log(`[SERP] Modèle SERP sauvegardé pour "${keyword}"`);
  } catch (err) {
    console.error('[SERP] saveSerpModel exception:', err?.message);
  }
}

/**
 * Retrieve the last stored SERP model for a keyword, or null if not found.
 *
 * @param {string} keyword
 * @returns {Promise<object|null>}
 */
export async function getSerpModel(keyword) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('serp_models')
      .select('model, updated_at')
      .eq('keyword', keyword.toLowerCase())
      .single();
    if (error || !data) return null;
    return { ...data.model, _savedAt: data.updated_at };
  } catch (err) {
    console.error('[SERP] getSerpModel exception:', err?.message);
    return null;
  }
}
