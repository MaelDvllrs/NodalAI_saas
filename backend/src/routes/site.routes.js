import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { supabase } from '../config/supabase.js';
import {
  createSite,
  getUserSites,
  getSiteById,
  updateSite,
  deleteSite,
  saveCrawledPages,
  getCrawledPages,
  getSiteMembers,
  addSiteMember,
  removeSiteMember,
  checkSiteAccess,
} from '../services/site.service.js';
import { getSitemapUrls } from '../utils/sitemap.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateUser);

/**
 * GET /api/sites
 * Récupérer tous les sites de l'utilisateur connecté
 */
router.get('/', async (req, res) => {
  try {
    const sites = await getUserSites(req.user.id);
    res.json({ sites });
  } catch (error) {
    console.error('Erreur récupération sites:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sites
 * Créer un nouveau site
 */
router.post('/', async (req, res) => {
  try {
    const { name, url } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Nom et URL du site requis' });
    }

    const site = await createSite(req.user.id, { name, url });

    res.status(201).json({ site });
  } catch (error) {
    console.error('Erreur création site:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sites/:id
 * Récupérer un site par ID
 */
router.get('/:id', async (req, res) => {
  try {
    const site = await getSiteById(req.params.id, req.user.id);
    res.json({ site });
  } catch (error) {
    console.error('Erreur récupération site:', error);
    res.status(404).json({ error: 'Site non trouvé' });
  }
});

/**
 * PUT /api/sites/:id
 * Mettre à jour un site
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, url } = req.body;
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;

    const site = await updateSite(req.params.id, req.user.id, updates);
    res.json({ site });
  } catch (error) {
    console.error('Erreur mise à jour site:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/sites/:id
 * Supprimer un site
 */
router.delete('/:id', async (req, res) => {
  try {
    await deleteSite(req.params.id, req.user.id);
    res.json({ message: 'Site supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression site:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sites/:id/crawl
 * Lancer le crawl d'un site et sauvegarder les résultats
 */
router.post('/:id/crawl', async (req, res) => {
  try {
    const site = await getSiteById(req.params.id, req.user.id);
    
    if (!site.url) {
      return res.status(400).json({ error: 'URL du site non configurée' });
    }

    // Récupérer les URLs du sitemap
    const urls = await getSitemapUrls(site.url);
    
    // Formater les pages pour la BDD
    const pages = urls.map(url => {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const slug = pathParts[pathParts.length - 1] || '';
      
      return {
        url,
        title: slug.replace(/-/g, ' '), // Titre approximatif depuis le slug
        slug,
        isBlogPost: urlObj.pathname.includes('/blog/') || urlObj.pathname.includes('/article/'),
      };
    });

    // Sauvegarder dans la BDD
    const savedPages = await saveCrawledPages(site.id, pages);

    res.json({
      message: `${savedPages.length} pages crawlées et sauvegardées`,
      pages: savedPages,
    });
  } catch (error) {
    console.error('Erreur crawl site:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sites/:id/pages
 * Récupérer les pages crawlées d'un site
 */
router.get('/:id/pages', async (req, res) => {
  try {
    const blogPostsOnly = req.query.blogPostsOnly === 'true';
    const pages = await getCrawledPages(req.params.id, blogPostsOnly);
    res.json({ pages });
  } catch (error) {
    console.error('Erreur récupération pages:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Gestion des membres
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/sites/:id/members
 * Lister les membres d'un site (admin uniquement)
 */
router.get('/:id/members', async (req, res) => {
  try {
    const members = await getSiteMembers(req.params.id, req.user.id);
    res.json({ members });
  } catch (error) {
    console.error('Erreur récupération membres:', error);
    const status = error.message.includes('Accès refusé') ? 403 : 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/sites/:id/members
 * Inviter un utilisateur par email (admin uniquement)
 * Body: { email: string, role?: 'admin' | 'member' }
 */
router.post('/:id/members', async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }

    if (role && !['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide (admin ou member)' });
    }

    const member = await addSiteMember(req.params.id, req.user.id, email, role || 'member');
    res.status(201).json({
      member,
      message: member.isNewUser
        ? 'Invitation envoyée par email'
        : 'Utilisateur ajouté comme membre',
    });
  } catch (error) {
    console.error('Erreur ajout membre:', error);
    const status = error.message.includes('Accès refusé') ? 403
      : error.message.includes('déjà membre') ? 409
      : 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * PATCH /api/sites/:id/members/:memberId
 * Modifier le rôle d'un membre (admin uniquement)
 * Body: { role: 'admin' | 'member' }
 */
router.patch('/:id/members/:memberId', async (req, res) => {
  try {
    const { role } = req.body;
    if (!role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide (admin ou member)' });
    }

    const userRole = await checkSiteAccess(req.params.id, req.user.id);
    if (!userRole || userRole !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé: admin uniquement' });
    }

    const { data, error } = await supabase
      .from('site_members')
      .update({ role })
      .eq('id', req.params.memberId)
      .eq('site_id', req.params.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.json({ member: data });
  } catch (error) {
    console.error('Erreur modification rôle:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/sites/:id/members/:memberId
 * Retirer un membre du site (admin uniquement)
 */
router.delete('/:id/members/:memberId', async (req, res) => {
  try {
    await removeSiteMember(req.params.id, req.user.id, req.params.memberId);
    res.json({ message: 'Membre retiré avec succès' });
  } catch (error) {
    console.error('Erreur suppression membre:', error);
    const status = error.message.includes('Accès refusé') ? 403 : 500;
    res.status(status).json({ error: error.message });
  }
});

export default router;
