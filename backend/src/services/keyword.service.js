import { supabase } from '../config/supabase.js';

/**
 * Service pour gérer les mots-clés avec cache en BDD (économie de tokens)
 */

// Récupérer ou créer un mot-clé principal avec ses métriques
export async function getOrCreateKeyword(keyword, dataforSeoData = null) {
  // Vérifier si le mot-clé existe déjà
  const { data: existing, error: fetchError } = await supabase
    .from('keywords')
    .select('*')
    .eq('keyword', keyword.toLowerCase())
    .single();

  if (existing) {
    // Mot-clé trouvé en cache
    return { keyword: existing, cached: true };
  }

  // Si pas trouvé, créer une nouvelle entrée
  const { data: newKeyword, error: insertError } = await supabase
    .from('keywords')
    .insert({
      keyword: keyword.toLowerCase(),
      search_volume: dataforSeoData?.search_volume || null,
      competition_index: dataforSeoData?.competition_index || null,
      dataforseo_data: dataforSeoData || null,
    })
    .select()
    .single();

  if (insertError) throw new Error(`Erreur création mot-clé: ${insertError.message}`);
  return { keyword: newKeyword, cached: false };
}

// Récupérer les mots-clés secondaires pour un mot-clé principal
export async function getSecondaryKeywordsForMain(mainKeywordId) {
  const { data, error } = await supabase
    .from('secondary_keywords')
    .select('*')
    .eq('main_keyword_id', mainKeywordId);

  if (error) throw new Error(`Erreur récupération mots-clés secondaires: ${error.message}`);
  return data;
}

// Sauvegarder les mots-clés secondaires
export async function saveSecondaryKeywords(mainKeywordId, keywords) {
  const records = keywords.map(kw => ({
    main_keyword_id: mainKeywordId,
    keyword: typeof kw === 'string' ? kw.toLowerCase() : kw.keyword?.toLowerCase(),
  }));

  const { data, error } = await supabase
    .from('secondary_keywords')
    .upsert(records, { onConflict: 'main_keyword_id,keyword', ignoreDuplicates: true })
    .select();

  if (error) throw new Error(`Erreur sauvegarde mots-clés secondaires: ${error.message}`);
  return data;
}

// Vérifier si des mots-clés secondaires existent déjà pour un mot-clé principal
export async function hasSecondaryKeywords(mainKeywordId) {
  const { count, error } = await supabase
    .from('secondary_keywords')
    .select('*', { count: 'exact', head: true })
    .eq('main_keyword_id', mainKeywordId);

  if (error) throw new Error(`Erreur vérification mots-clés: ${error.message}`);
  return count > 0;
}

// Rechercher des mots-clés similaires (pour suggestions)
export async function searchSimilarKeywords(searchTerm, limit = 10) {
  const { data, error } = await supabase
    .from('keywords')
    .select('*')
    .ilike('keyword', `%${searchTerm}%`)
    .order('search_volume', { ascending: false, nullsLast: true })
    .limit(limit);

  if (error) throw new Error(`Erreur recherche mots-clés: ${error.message}`);
  return data;
}
