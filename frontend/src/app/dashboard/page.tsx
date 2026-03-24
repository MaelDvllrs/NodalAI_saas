'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AppLayout from '../components/AppLayout';
import Link from 'next/link';
import { FileText, GitBranch, Globe, BarChart2, TrendingUp, MousePointerClick, Eye, Clock } from 'lucide-react';
import { Skeleton } from '../components/UI';
import { useProject } from '../contexts/ProjectContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Blog {
  id: string;
  site_id: string;
  status: string;
  created_at: string;
}

function DashboardPage() {
  const { token } = useAuth();
  const { selectedSite, selectedSiteId, loading: projectLoading } = useProject();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token && selectedSiteId) {
      fetchBlogs();
    } else if (!projectLoading) {
      setLoading(false);
    }
  }, [token, selectedSiteId, projectLoading]);

  async function fetchBlogs() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/blogs?siteId=${selectedSiteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBlogs(data.blogs || []);
      }
    } catch (error) {
      console.error('Erreur récupération blogs:', error);
    } finally {
      setLoading(false);
    }
  }

  const totalBlogs = blogs.length;
  const publishedBlogs = blogs.filter(b => b.status === 'published').length;
  const draftBlogs = blogs.filter(b => b.status === 'draft' || b.status === 'generated').length;

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="max-w-7xl mx-auto py-8 px-6">

          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 animate-slide-up">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted mb-1">Tableau de bord</p>
              <h1 className="text-2xl font-bold tracking-tight mb-3">
                {selectedSite ? selectedSite.name : 'Aucun projet sélectionné'}
              </h1>
            </div>
            {selectedSite && (
              <Link
                href="/generate"
                className="btn-primary gap-2"
              >
                <GitBranch size={18} />
                Lancer un workflow
              </Link>
            )}
          </div>

          {/* No project selected */}
          {!projectLoading && !selectedSite && (
            <div className="flex flex-col items-center justify-center py-20 bg-card/50 border-2 border-dashed border-border rounded-lg animate-slide-up">
              <div className="w-16 h-16 bg-bg border border-border rounded-lg flex items-center justify-center mb-6 shadow-sm">
                <Globe className="text-text-muted/50" size={40} />
              </div>
              <h3 className="text-2xl font-bold mb-3">Aucun projet sélectionné</h3>
              <p className="text-text-muted mb-6 max-w-sm text-center font-medium">
                Sélectionnez un projet dans le menu de gauche ou créez-en un nouveau.
              </p>
              <Link href="/projects" className="btn-primary gap-2">
                Voir mes projets
              </Link>
            </div>
          )}

          {/* Stats cards */}
          {(selectedSite || projectLoading) && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 animate-slide-up">
                {/* Total blogs */}
                <div className="bg-card/50 border border-border rounded-lg p-4 hover:border-accent/30 transition-all duration-200 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Articles générés</p>
                    <div className="w-8 h-8 bg-accent/10 rounded-md flex items-center justify-center">
                      <FileText size={16} className="text-accent" />
                    </div>
                  </div>
                  {loading ? (
                    <Skeleton className="h-10 w-20 rounded-xl" />
                  ) : (
                    <p className="text-4xl font-bold tracking-tight">{totalBlogs}</p>
                  )}
                  <p className="text-xs text-text-muted font-medium mt-2">Total sur ce projet</p>
                </div>

                {/* Published blogs */}
                <div className="bg-card/50 border border-border rounded-lg p-4 hover:border-accent/30 transition-all duration-200 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Publiés</p>
                    <div className="w-8 h-8 bg-green-500/10 rounded-md flex items-center justify-center">
                      <Globe size={16} className="text-green-500" />
                    </div>
                  </div>
                  {loading ? (
                    <Skeleton className="h-10 w-16 rounded-xl" />
                  ) : (
                    <p className="text-4xl font-bold tracking-tight">{publishedBlogs}</p>
                  )}
                  <p className="text-xs text-text-muted font-medium mt-2">Articles en ligne</p>
                </div>

                {/* Draft blogs */}
                <div className="bg-card/50 border border-border rounded-lg p-4 hover:border-accent/30 transition-all duration-200 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Brouillons</p>
                    <div className="w-8 h-8 bg-amber-500/10 rounded-md flex items-center justify-center">
                      <Clock size={16} className="text-amber-500" />
                    </div>
                  </div>
                  {loading ? (
                    <Skeleton className="h-10 w-16 rounded-xl" />
                  ) : (
                    <p className="text-4xl font-bold tracking-tight">{draftBlogs}</p>
                  )}
                  <p className="text-xs text-text-muted font-medium mt-2">En attente de publication</p>
                </div>
              </div>

              {/* Future stats — placeholder section */}
              <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
                <div className="flex items-center gap-3 mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Performances SEO</p>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-accent bg-accent/10 px-2.5 py-1 rounded-full border border-accent/20">
                    Bientôt disponible
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Clics organiques', icon: MousePointerClick, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: 'Impressions', icon: Eye, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                    { label: 'Position moyenne', icon: TrendingUp, color: 'text-pink-500', bg: 'bg-pink-500/10' },
                  ].map(({ label, icon: Icon, color, bg }) => (
                    <div
                      key={label}
                      className="relative bg-card/30 border border-dashed border-border rounded-lg p-4 overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted/60">{label}</p>
                        <div className={`w-8 h-8 ${bg} rounded-md flex items-center justify-center opacity-40`}>
                          <Icon size={16} className={color} />
                        </div>
                      </div>
                      <p className="text-4xl font-bold tracking-tight text-text-muted/30">—</p>
                      <p className="text-xs text-text-muted/50 font-medium mt-2">Données non disponibles</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick actions */}
              {selectedSite && !loading && (
                <div className="mt-8 animate-slide-up" style={{ animationDelay: '150ms' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted mb-4">Accès rapide</p>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/generate" className="btn-primary gap-2">
                      <GitBranch size={13} />
                      Lancer un workflow
                    </Link>
                    <Link href="/blogs" className="btn-secondary gap-2">
                      <BarChart2 size={13} />
                      Voir l'historique
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </AppLayout>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6">
          <div className="space-y-3 mb-8">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        </div>
      </AppLayout>
    }>
      <DashboardPage />
    </Suspense>
  );
}
