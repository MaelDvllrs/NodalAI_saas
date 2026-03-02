'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import Link from 'next/link';
import { History, Filter, Search, ExternalLink, Globe, FileText, Calendar, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '../utils/cn';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Blog {
  id: string;
  site_id: string;
  site_name: string;
  main_keyword: string;
  title: string;
  slug: string;
  webflow_item_id: string;
  status: string;
  created_at: string;
}

export default function BlogsPage() {
  const { token } = useAuth();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); 
  const [selectedSite, setSelectedSite] = useState('all');
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (token) {
      fetchBlogs();
      fetchSites();
    }
  }, [token]);

  async function fetchBlogs() {
    try {
      const res = await fetch(`${API_URL}/blogs`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBlogs(data.blogs);
      }
    } catch (error) {
      console.error('Erreur récupération blogs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSites() {
    try {
      const res = await fetch(`${API_URL}/sites`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSites(data.sites);
      }
    } catch (error) {
      console.error('Erreur récupération sites:', error);
    }
  }

  const filteredBlogs = blogs.filter((blog) => {
    if (filter !== 'all' && blog.status !== filter) return false;
    if (selectedSite !== 'all' && blog.site_id !== selectedSite) return false;
    return true;
  });

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <Navbar />

        <div className="max-w-7xl mx-auto py-12 px-6">
          <div className="mb-12">
            <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
              Historique des articles
              <History className="text-text-muted" size={28} />
            </h1>
            <p className="text-text-muted">
              Retrouvez tous vos contenus générés et suivez leur statut de publication.
            </p>
          </div>

          {/* Filters Bar */}
          <div className="bg-surface border border-border rounded-2xl p-4 mb-8 flex flex-col md:flex-row gap-6 items-start md:items-center">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-2 bg-background border border-border rounded-lg text-text-muted">
                <Globe size={18} />
              </div>
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="input-base py-1.5 min-w-[200px]"
              >
                <option value="all">Tous les projets</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
            </div>

            <div className="h-8 w-px bg-border hidden md:block" />

            <div className="flex items-center gap-2">
              <Filter size={14} className="text-text-muted mr-1" />
              {[
                { value: 'all', label: 'Tous' },
                { value: 'draft', label: 'Brouillons' },
                { value: 'publish', label: 'Publiés' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all",
                    filter === value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-text-muted hover:border-text/20"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="ml-auto text-xs font-bold text-text-muted uppercase tracking-widest">
              {filteredBlogs.length} Résultats
            </div>
          </div>

          {/* Main Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 text-text-muted">
              <RefreshCw className="animate-spin mb-4" size={32} />
              <p className="text-sm font-medium">Récupération de l'historique...</p>
            </div>
          ) : filteredBlogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 bg-surface border border-dashed border-border rounded-2xl">
              <FileText className="text-text-muted mb-4 opacity-20" size={48} />
              <h3 className="text-lg font-bold mb-1">Aucun article trouvé</h3>
              <p className="text-text-muted text-sm mb-6">Ajustez vos filtres ou lancez une nouvelle génération.</p>
              <Link href="/generate" className="btn-primary">Générer un article</Link>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-background/50 border-b border-border">
                      <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest">Contenu</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest">Projet</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest">SEO Focus</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest">Statut</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-text-muted uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredBlogs.map((blog) => (
                      <tr key={blog.id} className="group hover:bg-background/50 transition-colors">
                        <td className="px-6 py-5">
                          <Link href={`/blogs/${blog.id}`} className="flex items-start gap-3">
                            <div className="mt-1 p-2 bg-background border border-border rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                              <FileText size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold truncate max-w-md group-hover:text-primary transition-colors">{blog.title}</p>
                              <p className="text-[10px] text-text-muted font-mono mt-0.5">/{blog.slug}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs font-medium text-text-muted">{blog.site_name}</span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                            <span className="text-xs font-semibold">{blog.main_keyword}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter",
                            blog.status === 'publish'
                              ? "bg-success/10 text-success"
                              : "bg-zinc-100 dark:bg-zinc-800 text-text-muted"
                          )}>
                            {blog.status === 'publish' ? '🚀 Publié' : '📝 Brouillon'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <div className="flex items-center gap-1.5 text-text-muted mr-4">
                              <Calendar size={12} />
                              <span className="text-[10px] font-bold">{new Date(blog.created_at).toLocaleDateString('fr-FR')}</span>
                            </div>
                            {blog.webflow_item_id && (
                              <a
                                href={`https://webflow.com/dashboard/sites/${blog.site_id}/collections`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-background border border-border rounded-lg hover:border-text/20 transition-all text-text-muted hover:text-text"
                                title="Voir dans Webflow"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                            <Link
                              href={`/blogs/${blog.id}`}
                              className="p-2 bg-background border border-border rounded-lg hover:border-primary hover:text-primary transition-all text-text-muted"
                              title="Voir le détail"
                            >
                              <ChevronRight size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
