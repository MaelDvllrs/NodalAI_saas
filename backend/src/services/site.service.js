import { supabase } from '../config/supabase.js';

/**
 * Service pour gérer les opérations liées aux sites
 */

// Créer un nouveau site
export async function createSite(userId, siteData) {
  const { data, error } = await supabase
    .from('sites')
    .insert({
      user_id: userId,
      name: siteData.name,
      url: siteData.url,
      webflow_site_id: siteData.webflowSiteId,
      webflow_api_key: siteData.webflowApiKey,
      webflow_collection_name: siteData.webflowCollectionName,
    })
    .select()
    .single();

  if (error) throw new Error(`Erreur création site: ${error.message}`);
  return data;
}

// Récupérer tous les sites d'un utilisateur
export async function getUserSites(userId) {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erreur récupération sites: ${error.message}`);
  return data;
}

// Récupérer un site par ID
export async function getSiteById(siteId, userId) {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single();

  if (error) throw new Error(`Erreur récupération site: ${error.message}`);
  return data;
}

// Mettre à jour un site
export async function updateSite(siteId, userId, updates) {
  const { data, error } = await supabase
    .from('sites')
    .update(updates)
    .eq('id', siteId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(`Erreur mise à jour site: ${error.message}`);
  return data;
}

// Supprimer un site
export async function deleteSite(siteId, userId) {
  const { error } = await supabase
    .from('sites')
    .delete()
    .eq('id', siteId)
    .eq('user_id', userId);

  if (error) throw new Error(`Erreur suppression site: ${error.message}`);
  return { success: true };
}

// Sauvegarder les pages crawlées
export async function saveCrawledPages(siteId, pages) {
  const records = pages.map(page => ({
    site_id: siteId,
    url: page.url,
    title: page.title,
    slug: page.slug,
    is_blog_post: page.isBlogPost || false,
  }));

  const { data, error } = await supabase
    .from('crawled_pages')
    .upsert(records, { onConflict: 'site_id,url' })
    .select();

  if (error) throw new Error(`Erreur sauvegarde crawl: ${error.message}`);
  return data;
}

// Récupérer les pages crawlées d'un site
export async function getCrawledPages(siteId, blogPostsOnly = false) {
  let query = supabase
    .from('crawled_pages')
    .select('*')
    .eq('site_id', siteId);

  if (blogPostsOnly) {
    query = query.eq('is_blog_post', true);
  }

  const { data, error } = await query.order('crawled_at', { ascending: false });

  if (error) throw new Error(`Erreur récupération pages crawlées: ${error.message}`);
  return data;
}
