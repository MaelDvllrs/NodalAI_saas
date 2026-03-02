import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import {
  upsertBlogAnalytics,
  getBlogAnalytics,
  getAggregatedAnalytics,
  getTopPerformingBlogs,
  identifySuccessfulPatterns,
  getTopPatterns,
} from '../services/analytics.service.js';
import { getBlogById } from '../services/blog.service.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateUser);

/**
 * POST /api/analytics/:blogId
 * Créer ou mettre à jour les analytics d'un blog
 */
router.post('/:blogId', async (req, res) => {
  try {
    const { blogId } = req.params;
    const { date, ...analyticsData } = req.body;

    // Vérifier que le blog appartient à l'utilisateur
    const blog = await getBlogById(blogId, req.user.id);
    if (!blog) {
      return res.status(404).json({ error: 'Blog non trouvé' });
    }

    const analytics = await upsertBlogAnalytics(
      blogId,
      date || new Date().toISOString().split('T')[0],
      analyticsData
    );

    res.json({ analytics });
  } catch (error) {
    console.error('Erreur sauvegarde analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/:blogId
 * Récupérer les analytics d'un blog
 */
router.get('/:blogId', async (req, res) => {
  try {
    const { blogId } = req.params;
    const { startDate, endDate } = req.query;

    // Vérifier que le blog appartient à l'utilisateur
    const blog = await getBlogById(blogId, req.user.id);
    if (!blog) {
      return res.status(404).json({ error: 'Blog non trouvé' });
    }

    const analytics = await getBlogAnalytics(blogId, { startDate, endDate });
    res.json({ analytics });
  } catch (error) {
    console.error('Erreur récupération analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/:blogId/aggregate
 * Récupérer les analytics agrégées d'un blog
 */
router.get('/:blogId/aggregate', async (req, res) => {
  try {
    const { blogId } = req.params;

    // Vérifier que le blog appartient à l'utilisateur
    const blog = await getBlogById(blogId, req.user.id);
    if (!blog) {
      return res.status(404).json({ error: 'Blog non trouvé' });
    }

    const aggregated = await getAggregatedAnalytics(blogId);
    res.json({ analytics: aggregated });
  } catch (error) {
    console.error('Erreur récupération analytics agrégées:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/site/:siteId/top-performing
 * Récupérer les blogs les plus performants d'un site
 */
router.get('/site/:siteId/top-performing', async (req, res) => {
  try {
    const { siteId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const topBlogs = await getTopPerformingBlogs(siteId, limit);
    res.json({ blogs: topBlogs });
  } catch (error) {
    console.error('Erreur récupération top blogs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/analytics/:blogId/analyze-patterns
 * Analyser et sauvegarder les patterns d'un blog performant
 */
router.post('/:blogId/analyze-patterns', async (req, res) => {
  try {
    const { blogId } = req.params;

    // Vérifier que le blog appartient à l'utilisateur
    const blog = await getBlogById(blogId, req.user.id);
    if (!blog) {
      return res.status(404).json({ error: 'Blog non trouvé' });
    }

    const patterns = await identifySuccessfulPatterns(blogId);
    res.json({ 
      message: patterns.length > 0 
        ? 'Patterns identifiés et sauvegardés' 
        : 'Aucun pattern significatif identifié',
      patterns 
    });
  } catch (error) {
    console.error('Erreur analyse patterns:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/site/:siteId/patterns
 * Récupérer les patterns les plus performants d'un site
 */
router.get('/site/:siteId/patterns', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { type, limit } = req.query;

    const patterns = await getTopPatterns(
      siteId,
      type || null,
      parseInt(limit) || 10
    );

    res.json({ patterns });
  } catch (error) {
    console.error('Erreur récupération patterns:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
