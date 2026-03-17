import { supabase } from '../config/supabase.js';

/**
 * Service pour gérer les opérations liées aux sites
 */

// ─────────────────────────────────────────────────────────────
// Helpers accès / rôles
// ─────────────────────────────────────────────────────────────

/**
 * Vérifie si un utilisateur a accès à un site et retourne son rôle.
 * - 'admin'  → propriétaire du site OU membre avec role='admin'
 * - 'member' → membre actif avec role='member'
 * - null     → aucun accès
 */
export async function checkSiteAccess(siteId, userId) {
  // Propriétaire ?
  const { data: owned } = await supabase
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single();

  if (owned) return 'admin';

  // Membre actif ?
  const { data: membership } = await supabase
    .from('site_members')
    .select('role')
    .eq('site_id', siteId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  return membership ? membership.role : null;
}

// ─────────────────────────────────────────────────────────────
// CRUD Sites
// ─────────────────────────────────────────────────────────────

// Créer un nouveau site
export async function createSite(userId, siteData) {
  const { data, error } = await supabase
    .from('sites')
    .insert({
      user_id: userId,
      name: siteData.name,
      url: siteData.url,
    })
    .select()
    .single();

  if (error) throw new Error(`Erreur création site: ${error.message}`);
  return { ...data, userRole: 'admin' };
}

// Récupérer tous les sites accessibles par un utilisateur (propriétaire + membre)
export async function getUserSites(userId) {
  // Sites dont l'utilisateur est propriétaire
  const { data: ownedSites, error: ownedError } = await supabase
    .from('sites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (ownedError) throw new Error(`Erreur récupération sites: ${ownedError.message}`);

  // Sites dont l'utilisateur est membre actif (sans être propriétaire)
  const { data: memberships, error: memberError } = await supabase
    .from('site_members')
    .select('role, site_id, sites(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (memberError) throw new Error(`Erreur récupération memberships: ${memberError.message}`);

  const ownedIds = new Set((ownedSites || []).map(s => s.id));

  const memberSites = (memberships || [])
    .filter(m => m.sites && !ownedIds.has(m.site_id))
    .map(m => ({ ...m.sites, userRole: m.role }));

  return [
    ...(ownedSites || []).map(s => ({ ...s, userRole: 'admin' })),
    ...memberSites,
  ];
}

// Récupérer un site par ID (vérifie accès propriétaire OU membre)
export async function getSiteById(siteId, userId) {
  // Propriétaire
  const { data: ownedSite } = await supabase
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single();

  if (ownedSite) return { ...ownedSite, userRole: 'admin' };

  // Membre actif
  const { data: membership } = await supabase
    .from('site_members')
    .select('role, sites(*)')
    .eq('site_id', siteId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (membership && membership.sites) {
    return { ...membership.sites, userRole: membership.role };
  }

  throw new Error('Site non trouvé ou accès refusé');
}

// Mettre à jour un site (réservé au propriétaire ou admin membre)
export async function updateSite(siteId, userId, updates) {
  const role = await checkSiteAccess(siteId, userId);
  if (!role || role !== 'admin') throw new Error('Accès refusé');

  const { data, error } = await supabase
    .from('sites')
    .update(updates)
    .eq('id', siteId)
    .select()
    .single();

  if (error) throw new Error(`Erreur mise à jour site: ${error.message}`);
  return data;
}

// Supprimer un site (réservé au propriétaire uniquement)
export async function deleteSite(siteId, userId) {
  const { data: owned } = await supabase
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single();

  if (!owned) throw new Error('Seul le propriétaire peut supprimer un site');

  const { error } = await supabase
    .from('sites')
    .delete()
    .eq('id', siteId);

  if (error) throw new Error(`Erreur suppression site: ${error.message}`);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Gestion des membres
// ─────────────────────────────────────────────────────────────

/**
 * Lister les membres actifs et en attente d'un site.
 * Accessible aux admins (propriétaire ou admin membre).
 */
export async function getSiteMembers(siteId, userId) {
  const role = await checkSiteAccess(siteId, userId);
  if (!role || role !== 'admin') throw new Error('Accès refusé: admin uniquement');

  const { data, error } = await supabase
    .from('site_members')
    .select('id, user_id, invited_email, role, status, created_at')
    .eq('site_id', siteId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Erreur récupération membres: ${error.message}`);
  return data;
}

/**
 * Inviter un utilisateur dans un site par email.
 * - Si l'email correspond à un compte existant → ajout immédiat (status='active')
 * - Sinon → invitation Supabase + entrée 'pending'
 */
export async function addSiteMember(siteId, adminUserId, email, role = 'member') {
  const adminRole = await checkSiteAccess(siteId, adminUserId);
  if (!adminRole || adminRole !== 'admin') throw new Error('Accès refusé: admin uniquement');

  const normalizedEmail = email.toLowerCase().trim();

  // Vérifier si une entrée existe déjà pour cet email sur ce site
  const { data: existing } = await supabase
    .from('site_members')
    .select('id, status')
    .eq('site_id', siteId)
    .eq('invited_email', normalizedEmail)
    .single();

  if (existing) {
    throw new Error('Cet utilisateur est déjà membre ou a déjà été invité');
  }

  // Chercher si l'utilisateur existe déjà dans auth.users via listUsers
  let existingUserId = null;
  try {
    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const found = (listData?.users || []).find(
      u => u.email?.toLowerCase() === normalizedEmail
    );
    if (found) existingUserId = found.id;
  } catch (_) {
    // Si listUsers échoue, on traite comme nouvel utilisateur
  }

  if (existingUserId) {
    // Utilisateur existant → ajout direct comme membre actif
    const { data, error } = await supabase
      .from('site_members')
      .insert({
        site_id: siteId,
        user_id: existingUserId,
        invited_email: normalizedEmail,
        role,
        status: 'active',
        invited_by: adminUserId,
      })
      .select()
      .single();

    if (error) throw new Error(`Erreur ajout membre: ${error.message}`);
    return { ...data, isNewUser: false };
  } else {
    // Nouvel utilisateur → envoyer invitation Supabase
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      normalizedEmail,
      { data: { invited_to_site: siteId } }
    );
    if (inviteError) throw new Error(`Erreur envoi invitation: ${inviteError.message}`);

    const newUserId = inviteData?.user?.id || null;

    const { data, error } = await supabase
      .from('site_members')
      .insert({
        site_id: siteId,
        user_id: newUserId,        // peut être null si l'invitation est en attente de création de compte
        invited_email: normalizedEmail,
        role,
        status: newUserId ? 'active' : 'pending',
        invited_by: adminUserId,
      })
      .select()
      .single();

    if (error) throw new Error(`Erreur enregistrement invitation: ${error.message}`);
    return { ...data, isNewUser: true };
  }
}

/**
 * Retirer un membre d'un site.
 * Seul un admin peut retirer un membre. On ne peut pas retirer le propriétaire.
 */
export async function removeSiteMember(siteId, adminUserId, memberId) {
  const adminRole = await checkSiteAccess(siteId, adminUserId);
  if (!adminRole || adminRole !== 'admin') throw new Error('Accès refusé: admin uniquement');

  // Vérifier que le membre existe et n'est pas le propriétaire du site
  const { data: member } = await supabase
    .from('site_members')
    .select('id, user_id, invited_email')
    .eq('id', memberId)
    .eq('site_id', siteId)
    .single();

  if (!member) throw new Error('Membre introuvable');

  const { error } = await supabase
    .from('site_members')
    .delete()
    .eq('id', memberId);

  if (error) throw new Error(`Erreur suppression membre: ${error.message}`);
  return { success: true };
}

/**
 * Activer les invitations en attente pour un utilisateur qui vient de se connecter.
 * À appeler après chaque login réussi.
 */
export async function activatePendingInvites(userId, userEmail) {
  if (!userEmail) return;

  const { error } = await supabase
    .from('site_members')
    .update({ user_id: userId, status: 'active' })
    .eq('invited_email', userEmail.toLowerCase())
    .eq('status', 'pending');

  if (error) {
    console.error('Erreur activation invitations:', error.message);
  }
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
