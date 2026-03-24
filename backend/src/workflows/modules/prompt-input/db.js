/**
 * db.js — Supabase persistence for the GEO prompt database.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase : SUPABASE_URL / SUPABASE_SERVICE_KEY manquants');
  return createClient(url, key);
}

/**
 * Save a prompt to the geo_prompts table.
 * @param {{ prompt: string, topic?: string, source?: string, siteTheme?: string, siteUrl?: string, userId?: string, runId?: string }} params
 */
export async function saveGeoPrompt({ prompt, topic, source = 'manual', siteTheme, siteUrl, userId, runId }) {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('geo_prompts').insert({
      prompt,
      topic:      topic     || null,
      source,
      site_theme: siteTheme || null,
      site_url:   siteUrl   || null,
      user_id:    userId    || null,
      run_id:     runId     || null,
    });
    if (error) console.error('[GeoPrompts] saveGeoPrompt error:', error.message);
    else console.log(`[GeoPrompts] Prompt sauvegardé (source: ${source}) : "${prompt.slice(0, 80)}"`);
  } catch (err) {
    console.error('[GeoPrompts] saveGeoPrompt exception:', err?.message);
  }
}

/**
 * List recent prompts for a project/user.
 * Filters by siteUrl (exact) first, falls back to siteTheme (partial) if no siteUrl.
 * @param {{ userId?: string, limit?: number, source?: string, siteTheme?: string, siteUrl?: string }} opts
 * @returns {Promise<Array<{ id: string, prompt: string, topic: string, source: string, site_theme: string, site_url: string, created_at: string }>>}
 */
export async function listGeoPrompts({ userId, limit = 100, source, siteTheme, siteUrl } = {}) {
  try {
    const supabase = getSupabase();
    let q = supabase
      .from('geo_prompts')
      .select('id, prompt, topic, source, site_theme, site_url, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) q = q.eq('user_id', userId);
    if (source) q = q.eq('source',  source);

    // Prefer exact siteUrl match (project-level), fall back to siteTheme
    if (siteUrl)       q = q.eq('site_url', siteUrl);
    else if (siteTheme) q = q.ilike('site_theme', `%${siteTheme}%`);

    const { data, error } = await q;
    if (error) {
      console.error('[GeoPrompts] listGeoPrompts error:', error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error('[GeoPrompts] listGeoPrompts exception:', err?.message);
    return [];
  }
}
