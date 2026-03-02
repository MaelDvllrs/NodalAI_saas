import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import blogRoutes from './routes/blog.routes.js';
import authRoutes from './routes/auth.routes.js';
import siteRoutes from './routes/site.routes.js';
import blogsRoutes from './routes/blogs.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration pour production et développement
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({ 
  origin: corsOrigin.includes(',') ? corsOrigin.split(',').map(o => o.trim()) : corsOrigin,
  credentials: true 
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/blogs', blogsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', blogRoutes); // Keep blog generation routes

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
