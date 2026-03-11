import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { getUserTasks, deleteTask } from '../services/task.service.js';

const router = express.Router();

// GET /api/tasks — list recent tasks for the authenticated user
router.get('/', authenticateUser, async (req, res) => {
  try {
    const tasks = await getUserTasks(req.user.id);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id — delete a task
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    await deleteTask(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
