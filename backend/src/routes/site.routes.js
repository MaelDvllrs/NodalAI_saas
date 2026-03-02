import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import {
  createSite,
  getUserSites,
  getSiteById,
  updateSite,
  deleteSite,
  saveCrawledPages,
  getCrawledPages,
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
    const { name, url, webflowSiteId, webflowApiKey, webflowCollectionName } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: 'Nom et URL du site requis' });
    }

    const site = await createSite(req.user.id, {
      name,
      url,
      webflowSiteId,
      webflowApiKey,
      webflowCollectionName,
    });

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
    const { name, url, webflowSiteId, webflowApiKey, webflowCollectionName } = req.body;
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (webflowSiteId !== undefined) updates.webflow_site_id = webflowSiteId;
    if (webflowApiKey !== undefined) updates.webflow_api_key = webflowApiKey;
    if (webflowCollectionName !== undefined) updates.webflow_collection_name = webflowCollectionName;

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

export default router;
