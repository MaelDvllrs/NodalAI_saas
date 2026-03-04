import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import {
  getUserBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
  publishBlog,
  getBlogsBySite,
  rateBlog,
} from '../services/blog.service.js';
import { parseBlogContent } from '../utils/blogParser.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateUser);

/**
 * GET /api/blogs
 * Récupérer tous les blogs de l'utilisateur connecté
 */
router.get('/', async (req, res) => {
  try {
    const { status, siteId } = req.query;
    
    const blogs = await getUserBlogs(req.user.id, {
      status,
      siteId,
    });

    res.json({ blogs });
  } catch (error) {
    console.error('Erreur récupération blogs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/blogs/site/:siteId
 * Récupérer tous les blogs d'un site spécifique
 */
router.get('/site/:siteId', async (req, res) => {
  try {
    const blogs = await getBlogsBySite(req.params.siteId, req.user.id);
    res.json({ blogs });
  } catch (error) {
    console.error('Erreur récupération blogs du site:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/blogs/:id
 * Récupérer un blog par ID
 */
router.get('/:id', async (req, res) => {
  try {
    const blog = await getBlogById(req.params.id, req.user.id);

    // Parse raw_content to extract embeds (schemas + FAQ) — not stored in DB columns
    let schemas = [];
    let faqEmbed = null;
    if (blog.raw_content) {
      try {
        const parsed = parseBlogContent(blog.raw_content);
        schemas = parsed.schemas || [];
        faqEmbed = parsed.faqEmbed || null;
      } catch (_) { /* non-blocking */ }
    }

    res.json({ blog: { ...blog, schemas, faqEmbed } });
  } catch (error) {
    console.error('Erreur récupération blog:', error);
    res.status(404).json({ error: 'Blog non trouvé' });
  }
});

/**
 * PUT /api/blogs/:id
 * Mettre à jour un blog
 */
router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    const allowedFields = [
      'title', 'slug', 'h1', 'title_tag', 'meta_description',
      'introduction', 'body', 'theme', 'tone', 'status'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const blog = await updateBlog(req.params.id, req.user.id, updates);
    res.json({ blog });
  } catch (error) {
    console.error('Erreur mise à jour blog:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/blogs/:id
 * Supprimer un blog
 */
router.delete('/:id', async (req, res) => {
  try {
    await deleteBlog(req.params.id, req.user.id);
    res.json({ message: 'Blog supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression blog:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/blogs/:id/publish
 * Marquer un blog comme publié
 */
router.post('/:id/publish', async (req, res) => {
  try {
    const { webflowItemId } = req.body;
    const blog = await publishBlog(req.params.id, req.user.id, webflowItemId);
    res.json({ blog, message: 'Blog marqué comme publié' });
  } catch (error) {
    console.error('Erreur publication blog:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/blogs/:id/rate
 * Attribuer une note (1-5 étoiles) à un blog
 */
router.post('/:id/rate', async (req, res) => {
  try {
    const rating = parseInt(req.body.rating, 10);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'La note doit être un entier entre 1 et 5' });
    }
    const blog = await rateBlog(req.params.id, req.user.id, rating);
    res.json({ blog, message: `Blog noté ${rating}/5` });
  } catch (error) {
    console.error('Erreur notation blog:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
