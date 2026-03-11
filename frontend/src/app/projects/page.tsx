'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams, useRouter } from 'next/navigation';
import AppLayout from '../components/AppLayout';
import { Plus, Globe, ExternalLink, RefreshCw, Trash2, Calendar, Users, Crown, UserPlus, X } from 'lucide-react';
import { cn } from '../utils/cn';
import { Skeleton, Spinner } from '../components/UI';
import { useProject } from '../contexts/ProjectContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function SiteFavicon({ url, size = 24 }: { url: string; size?: number }) {
  const [errored, setErrored] = useState(false);

  if (!url) return <Globe size={size} />;

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return <Globe size={size} />;
  }

  if (errored) return <Globe size={size} />;

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`}
      alt=""
      width={size}
      height={size}
      className="rounded-sm"
      onError={() => setErrored(true)}
    />
  );
}

interface Site {
  id: string;
  name: string;
  url: string;
  webflow_site_id: string;
  webflow_collection_name: string;
  created_at: string;
  userRole: 'admin' | 'member';
}

interface Member {
  id: string;
  user_id: string | null;
  invited_email: string;
  role: 'admin' | 'member';
  status: 'active' | 'pending';
  created_at: string;
}

function ProjectsPage() {
  const { token } = useAuth();
  const { refreshSites, setSelectedSiteId } = useProject();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowAddModal(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (token) {
      fetchSites();
    }
  }, [token]);

  async function fetchSites() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sites`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setSites(data.sites);
      }
    } catch (error) {
      console.error('Erreur récupération sites:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCrawl(siteId: string) {
    if (!confirm('Lancer le crawl de ce site ?')) return;

    try {
      const res = await fetch(`${API_URL}/sites/${siteId}/crawl`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        alert(`✅ ${data.message}`);
      } else {
        const error = await res.json();
        alert(`❌ ${error.error}`);
      }
    } catch (error) {
      alert('❌ Erreur lors du crawl');
    }
  }

  async function handleDelete(siteId: string, siteName: string) {
    if (!confirm(`Supprimer le site "${siteName}" et tous ses blogs ?`)) return;

    try {
      const res = await fetch(`${API_URL}/sites/${siteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        setSites(sites.filter(s => s.id !== siteId));
        refreshSites();
        alert('✅ Site supprimé');
      } else {
        const error = await res.json();
        alert(`❌ ${error.error}`);
      }
    } catch (error) {
      alert('❌ Erreur lors de la suppression');
    }
  }

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="max-w-7xl mx-auto py-8 px-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 animate-slide-up">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-3">Mes Projets</h1>
              <p className="text-md text-text-muted max-w-xl">
                Gérez vos environnements Webflow et automatisez votre stratégie de contenu SEO.
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
            className="btn-accent gap-2"
            >
              <Plus size={20} />
              Nouveau Site
            </button>
          </div>

          {/* Loading Skeletons */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[280px] rounded-lg" />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && sites.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 bg-surface/50 border-2 border-dashed border-border rounded-lg animate-slide-up">
              <div className="w-16 h-16 bg-bg border border-border rounded-lg flex items-center justify-center mb-6 shadow-sm">
                <Globe className="text-text-muted/50" size={32} />
              </div>
              <h3 className="text-2xl font-bold mb-3">Aucun site configuré</h3>
              <p className="text-text-muted mb-6 max-w-sm text-center font-medium">
                Connectez votre premier site Webflow pour commencer à générer des articles SEO automatisés.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-accent gap-2"
              >
                <Plus size={20} />
                Ajouter mon premier site
              </button>
            </div>
          )}

          {/* Sites Grid */}
          {!loading && sites.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sites.map((site, index) => (
                <div
                  key={site.id}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => { setSelectedSiteId(site.id); router.push('/dashboard'); }}
                  className="group cursor-pointer bg-surface/50 border border-border rounded-lg p-4 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 transition-all duration-200 flex flex-col animate-slide-up backdrop-blur-sm"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="w-10 h-10 bg-bg border border-border rounded-md flex items-center justify-center shadow-sm">
                      <SiteFavicon url={site.url} size={24} />
                    </div>
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
                      {site.userRole === 'admin' && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedSite(site); setShowMembersModal(true); }}
                        className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-all"
                            title="Gérer les membres"
                          >
                            <Users size={18} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCrawl(site.id); }}
                            className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-all"
                            title="Crawler le site"
                          >
                            <RefreshCw size={18} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(site.id, site.name); }}
                            className="p-1.5 text-text-muted hover:text-error hover:bg-error/10 rounded-md transition-all"
                            title="Supprimer"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold truncate">{site.name}</h3>
                    {site.userRole === 'admin' ? (
                      <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                        <Crown size={10} /> Admin
                      </span>
                    ) : (
                      <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted bg-border/40 px-2.5 py-1 rounded-full border border-border/50">
                        Membre
                      </span>
                    )}
                  </div>

                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm font-medium text-text-muted hover:text-accent flex items-center gap-2 mb-4 transition-colors group/link"
                  >
                    <span className="truncate">{site.url.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink size={13} className="group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
                  </a>

                  <div className="mt-auto pt-4 border-t border-border/50">
                    <div className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
                      <Calendar size={12} className="text-accent/60" />
                      Ajouté le {new Date(site.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manage Members Modal */}
        {showMembersModal && selectedSite && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-fade-in">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowMembersModal(false)} />
            <div className="relative bg-bg border border-border rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-up">
              <MembersModal
                site={selectedSite}
                onClose={() => setShowMembersModal(false)}
                token={token || ''}
              />
            </div>
          </div>
        )}

        {/* Add Site Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-fade-in">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
            <div className="relative bg-bg border border-border rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-up">
              <AddSiteModal
                onClose={() => setShowAddModal(false)}
                onSuccess={(newSite) => {
                  setSites([...sites, newSite]);
                  refreshSites();
                  setShowAddModal(false);
                }}
                token={token || ''}
              />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function Projects() {
  return (
    <Suspense fallback={
      <AppLayout>
      <div className="max-w-7xl mx-auto py-8 px-6">
          <div className="flex justify-between items-center mb-8">
            <div className="space-y-3">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-6 w-96" />
            </div>
            <Skeleton className="h-8 w-32 rounded-md" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[280px] rounded-lg" />
            ))}
          </div>
        </div>
      </AppLayout>
    }>
      <ProjectsPage />
    </Suspense>
  );
}

function AddSiteModal({ onClose, onSuccess, token }: { onClose: () => void; onSuccess: (site: Site) => void; token: string }) {
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    webflowSiteId: '',
    webflowApiKey: '',
    webflowCollectionName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/sites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const data = await res.json();
        onSuccess(data.site);
      } else {
        const error = await res.json();
        setError(error.error || 'Erreur lors de la création du site');
      }
    } catch (err) {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight">Nouveau Projet</h3>
          <p className="text-sm font-medium text-text-muted mt-1 uppercase tracking-wide">Configurez votre environnement Webflow.</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-surface border border-transparent hover:border-border rounded-md transition-all text-text-muted">
          <X size={24} />
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-error/5 border border-error/20 text-error px-4 py-3 rounded-md text-sm font-semibold flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-error" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted px-1">Nom du projet</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-base"
                placeholder="Mon Blog SEO"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted px-1">URL du site</label>
              <input
                type="url"
                required
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                className="input-base"
                placeholder="https://site.webflow.io"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted px-1">Webflow Site ID</label>
            <input
              type="text"
              value={formData.webflowSiteId}
              onChange={(e) => setFormData({ ...formData, webflowSiteId: e.target.value })}
              className="input-base font-mono text-xs tracking-wider"
              placeholder="5f72a..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted px-1">Webflow API Key</label>
            <input
              type="password"
              value={formData.webflowApiKey}
              onChange={(e) => setFormData({ ...formData, webflowApiKey: e.target.value })}
              className="input-base font-mono text-xs tracking-wider"
              placeholder="••••••••••••••••"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted px-1">Nom de la Collection</label>
            <input
              type="text"
              value={formData.webflowCollectionName}
              onChange={(e) => setFormData({ ...formData, webflowCollectionName: e.target.value })}
              className="input-base"
              placeholder="Blog Posts"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary flex-1 text-xs font-semibold uppercase tracking-widest"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex-1 text-xs font-semibold uppercase tracking-widest"
          >
            {loading ? <Spinner className="w-5 h-5" /> : 'Ajouter le site'}
          </button>
        </div>
      </form>
    </div>
  );
}

function MembersModal({ site, onClose, token }: { site: Site; onClose: () => void; token: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sites/${site.id}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setInviting(true);

    try {
      const res = await fetch(`${API_URL}/sites/${site.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message);
        setInviteEmail('');
        fetchMembers();
      } else {
        setError(data.error || "Erreur lors de l'invitation");
      }
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(memberId: string, email: string) {
    if (!confirm(`Retirer ${email} du projet ?`)) return;

    try {
      const res = await fetch(`${API_URL}/sites/${site.id}/members/${memberId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setMembers(members.filter(m => m.id !== memberId));
      } else {
        const data = await res.json();
        alert(`❌ ${data.error}`);
      }
    } catch {
      alert('❌ Erreur lors de la suppression');
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight">Membres</h3>
          <p className="text-sm font-medium text-text-muted mt-1 uppercase tracking-wide">{site.name}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-surface border border-transparent hover:border-border rounded-md transition-all text-text-muted">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleInvite} className="mb-6 bg-surface border border-border rounded-lg p-4 space-y-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted flex items-center gap-2 px-1">
          <UserPlus size={14} className="text-accent" />
          Inviter un collaborateur
        </h4>

        {error && (
          <div className="bg-error/5 border border-error/20 text-error px-3 py-2 rounded-md text-xs font-semibold">{error}</div>
        )}
        {success && (
          <div className="bg-green-500/5 border border-green-500/20 text-green-600 px-3 py-2 rounded-md text-xs font-semibold">{success}</div>
        )}

        <div className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="email@exemple.com"
            className="input-base"
          />
          <div className="flex gap-3">
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as 'admin' | 'member')}
              className="input-base flex-1 appearance-none cursor-pointer"
            >
              <option value="member">Rôle: Membre</option>
              <option value="admin">Rôle: Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="btn-primary whitespace-nowrap text-xs font-semibold uppercase tracking-widest"
            >
              {inviting ? <Spinner className="w-5 h-5" /> : 'Inviter'}
            </button>
          </div>
        </div>
      </form>

      <div className="space-y-4">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted px-1">
          Équipe ({members.length})
        </h4>

        {loading && (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-md" />)}
          </div>
        )}

        {!loading && members.length === 0 && (
          <div className="text-center py-8 bg-surface/30 border border-dashed border-border rounded-md">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-widest">Seul pour l'instant</p>
          </div>
        )}

        {!loading && members.map(member => (
          <div
            key={member.id}
            className="group flex items-center justify-between p-4 bg-surface border border-border rounded-lg hover:border-accent/20 transition-all duration-200"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-md bg-bg border border-border flex items-center justify-center text-sm font-semibold shrink-0 shadow-sm group-hover:bg-accent group-hover:text-white transition-all duration-200">
                {member.invited_email[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate tracking-tight">{member.invited_email}</p>
                <div className="flex items-center gap-2.5 mt-1">
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.15em]",
                    member.role === 'admin' ? 'text-amber-600' : 'text-text-muted'
                  )}>
                    {member.role === 'admin' ? '👑 Admin' : 'Membre'}
                  </span>
                  {member.status === 'pending' && (
                    <span className="text-[10px] font-semibold text-text-muted bg-border/40 px-2.5 py-0.5 rounded-full border border-border/50 uppercase tracking-widest">
                      En attente
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleRemove(member.id, member.invited_email)}
              className="p-1.5 text-text-muted hover:text-error hover:bg-error/10 rounded-md transition-all shrink-0 opacity-0 group-hover:opacity-100"
              title="Retirer ce membre"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
