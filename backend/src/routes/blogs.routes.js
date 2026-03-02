import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import {
  getUserBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
  publishBlog,
  getBlogsBySite,
} from '../services/blog.service.js';

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
    res.json({ blog });
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

export default router;
