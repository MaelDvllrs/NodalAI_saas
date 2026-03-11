'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import AppLayout from '../components/AppLayout';
import Link from 'next/link';
import { History, Filter, ExternalLink, FileText, Calendar, ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';
import { Skeleton } from '../components/UI';

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
  author: { email: string | null; name: string; avatar_url: string | null } | null;
}

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-teal-500',
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function AuthorAvatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-[11px] font-bold select-none cursor-default ${avatarColor(name)}`}>
      {initials || '?'}
    </span>
  );
}

export default function BlogsPage() {
  const { token } = useAuth();
  const { selectedSiteId } = useProject();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (token && selectedSiteId) {
      fetchBlogs();
    } else {
      setBlogs([]);
      setLoading(false);
    }
  }, [token, selectedSiteId]);

  async function fetchBlogs() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/blogs?siteId=${selectedSiteId}`, {
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

  const filteredBlogs = blogs.filter((blog) => {
    if (filter !== 'all' && blog.status !== filter) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
              Historique des articles
              <History className="text-text-muted" size={28} />
            </h1>
            <p className="text-text-muted">
              Retrouvez tous vos contenus générés et suivez leur statut de publication.
            </p>
          </div>

          {/* Filters Bar */}
          <div className="bg-surface border border-border rounded-lg p-3 mb-6 flex flex-col md:flex-row gap-4 items-start md:items-center">
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
                    "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border transition-all",
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
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-background/50">
                <div className="grid grid-cols-5 gap-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-4 w-20" />
                  ))}
                </div>
              </div>
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Skeleton className="w-10 h-10 rounded-lg" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <div className="flex gap-2">
                      <Skeleton className="w-8 h-8 rounded-lg" />
                      <Skeleton className="w-8 h-8 rounded-lg" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : filteredBlogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-surface border border-dashed border-border rounded-lg">
              <FileText className="text-text-muted mb-4 opacity-20" size={48} />
              <h3 className="text-lg font-bold mb-1">Aucun article trouvé</h3>
              <p className="text-text-muted text-sm mb-6">Ajustez vos filtres ou lancez une nouvelle génération.</p>
              <Link href="/generate" className="btn-primary">Générer un article</Link>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-background/50 border-b border-border">
                      <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Contenu</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Généré par</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest">Statut</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredBlogs.map((blog) => (
                      <tr key={blog.id} className="group hover:bg-background/50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/blogs/${blog.id}`} className="flex items-start gap-3">
                            <div className="mt-1 p-1.5 bg-background border border-border rounded-md group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                              <FileText size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold truncate max-w-md group-hover:text-primary transition-colors">{blog.title}</p>
                              <p className="text-[10px] text-text-muted font-mono mt-0.5">/{blog.slug}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {blog.author ? (
                            <div className="relative inline-flex group/author">
                              <AuthorAvatar name={blog.author.name} />
                              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
                                            opacity-0 group-hover/author:opacity-100 transition-opacity duration-150
                                            bg-zinc-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                                <p className="font-bold">{blog.author.name}</p>
                                {blog.author.email && (
                                  <p className="text-zinc-400 text-[10px] mt-0.5">{blog.author.email}</p>
                                )}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
                                              border-x-4 border-x-transparent border-t-4 border-t-zinc-900" />
                              </div>
                            </div>
                          ) : (
                            <span className="text-text-muted text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter",
                            blog.status === 'publish'
                              ? "bg-success/10 text-success"
                              : "bg-zinc-100 dark:bg-zinc-800 text-text-muted"
                          )}>
                            {blog.status === 'publish' ? '🚀 Publié' : '📝 Brouillon'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
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
                                className="p-1.5 bg-background border border-border rounded-md hover:border-text/20 transition-all text-text-muted hover:text-text"
                                title="Voir dans Webflow"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                            <Link
                              href={`/blogs/${blog.id}`}
                              className="p-1.5 bg-background border border-border rounded-md hover:border-primary hover:text-primary transition-all text-text-muted"
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
    </AppLayout>
  );
}
