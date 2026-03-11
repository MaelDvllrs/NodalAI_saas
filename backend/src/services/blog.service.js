import { supabase } from '../config/supabase.js';
import { checkSiteAccess } from './site.service.js';

/**
 * Service pour gérer les blogs
 */

// Créer un nouveau blog
export async function createBlog(blogData) {
  const { data, error } = await supabase
    .from('blogs')
    .insert({
      site_id: blogData.siteId,
      user_id: blogData.userId,
      title: blogData.title,
      slug: blogData.slug,
      h1: blogData.h1,
      title_tag: blogData.titleTag,
      meta_description: blogData.metaDescription,
      introduction: blogData.introduction,
      body: blogData.body,
      main_keyword_id: blogData.mainKeywordId,
      secondary_keywords_used: blogData.secondaryKeywords || [],
      webflow_item_id: blogData.webflowItemId,
      webflow_collection_id: blogData.webflowCollectionId,
      status: blogData.status || 'draft',
      theme: blogData.theme,
      tone: blogData.tone,
      raw_content: blogData.rawContent,
      published_at: blogData.status === 'published' ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) throw new Error(`Erreur création blog: ${error.message}`);
  return data;
}

// Récupérer tous les blogs d'un site (accès propriétaire OU membre)
export async function getBlogsBySite(siteId, userId) {
  const role = await checkSiteAccess(siteId, userId);
  if (!role) throw new Error('Accès refusé');

  const { data, error } = await supabase
    .from('blogs')
    .select(`
      *,
      keywords:main_keyword_id (
        keyword,
        search_volume,
        competition_index
      )
    `)
    .eq('site_id', siteId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erreur récupération blogs: ${error.message}`);
  return data;
}

// Récupérer tous les blogs d'un projet (site), accessible par tout membre du site
export async function getProjectBlogs(siteId, filters = {}) {
  if (!siteId) return [];

  let query = supabase
    .from('blogs')
    .select(`
      *,
      sites:site_id (name, url),
      keywords:main_keyword_id (keyword, search_volume, competition_index)
    `)
    .eq('site_id', siteId);

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw new Error(`Erreur récupération blogs du projet: ${error.message}`);

  // Fetch author info for unique user_ids
  const userIds = [...new Set((data || []).map(b => b.user_id).filter(Boolean))];
  const userMap = {};
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const { data: userData } = await supabase.auth.admin.getUserById(uid);
        if (userData?.user) {
          const u = userData.user;
          const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'Inconnu';
          userMap[uid] = {
            email: u.email || null,
            name,
            avatar_url: u.user_metadata?.avatar_url || null,
          };
        }
      } catch (_) { /* ignore */ }
    })
  );

  return (data || []).map(b => ({
    ...b,
    author: b.user_id ? (userMap[b.user_id] || { email: null, name: 'Inconnu', avatar_url: null }) : null,
  }));
}

// Récupérer un blog par ID (accès via site membership)
export async function getBlogById(blogId, userId) {
  // D'abord récupérer le blog sans filtre user
  const { data: blog, error } = await supabase
    .from('blogs')
    .select(`
      *,
      sites:site_id (name, url, webflow_site_id, webflow_collection_name),
      keywords:main_keyword_id (keyword, search_volume, competition_index)
    `)
    .eq('id', blogId)
    .single();

  if (error || !blog) throw new Error('Blog introuvable');

  // Vérifier que l'utilisateur a accès au site de ce blog
  const role = await checkSiteAccess(blog.site_id, userId);
  if (!role) throw new Error('Accès refusé');

  return blog;
}

// Mettre à jour un blog
export async function updateBlog(blogId, userId, updates) {
  const { data, error } = await supabase
    .from('blogs')
    .update(updates)
    .eq('id', blogId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(`Erreur mise à jour blog: ${error.message}`);
  return data;
}

// Supprimer un blog
export async function deleteBlog(blogId, userId) {
  const { error } = await supabase
    .from('blogs')
    .delete()
    .eq('id', blogId)
    .eq('user_id', userId);

  if (error) throw new Error(`Erreur suppression blog: ${error.message}`);
  return { success: true };
}

// Marquer un blog comme publié
export async function publishBlog(blogId, userId, webflowItemId = null) {
  const updates = {
    status: 'published',
    published_at: new Date().toISOString(),
  };

  if (webflowItemId) {
    updates.webflow_item_id = webflowItemId;
  }

  return updateBlog(blogId, userId, updates);
}

// Récupérer les titres existants pour éviter les doublons
export async function getExistingTitles(siteId) {
  const { data, error } = await supabase
    .from('blogs')
    .select('title, h1')
    .eq('site_id', siteId);

  if (error) throw new Error(`Erreur récupération titres: ${error.message}`);
  return data.map(b => b.title || b.h1).filter(Boolean);
}

// Noter un blog (1-5 étoiles)
export async function rateBlog(blogId, userId, rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('La note doit être un entier entre 1 et 5');
  }

  const { data, error } = await supabase
    .from('blogs')
    .update({ rating })
    .eq('id', blogId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(`Erreur notation blog: ${error.message}`);
  return data;
}

// Récupérer les blogs les mieux notés d'un site (pour guider la génération)
export async function getTopRatedBlogs(siteId, limit = 3) {
  const { data, error } = await supabase
    .from('blogs')
    .select('id, title, tone, theme, rating, introduction')
    .eq('site_id', siteId)
    .gte('rating', 4)
    .order('rating', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Erreur récupération blogs notés: ${error.message}`);
  return data || [];
}
