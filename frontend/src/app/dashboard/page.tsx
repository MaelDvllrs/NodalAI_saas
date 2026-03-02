'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import Navbar from '../components/Navbar';
import Link from 'next/link';
import { Plus, Globe, ExternalLink, RefreshCw, Trash2, Calendar, Users, Crown, UserPlus } from 'lucide-react';
import { cn } from '../utils/cn';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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

export default function DashboardPage() {
  const { token } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  useEffect(() => {
    if (token) {
      fetchSites();
    }
  }, [token]);

  async function fetchSites() {
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
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <Navbar />
        
        <div className="max-w-7xl mx-auto py-12 px-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">Mes Projets</h1>
              <p className="text-text-muted">
                Gérez vos environnements Webflow et automatisez votre contenu.
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary gap-2"
            >
              <Plus size={18} />
              Nouveau Site
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-32 text-text-muted">
              <RefreshCw className="animate-spin mb-4" size={32} />
              <p className="text-sm font-medium">Synchronisation de vos sites...</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && sites.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 bg-surface border border-dashed border-border rounded-2xl">
              <div className="w-16 h-16 bg-background border border-border rounded-2xl flex items-center justify-center mb-6">
                <Globe className="text-text-muted" size={32} />
              </div>
              <h3 className="text-lg font-bold mb-2">Aucun site configuré</h3>
              <p className="text-text-muted text-sm mb-8 max-w-sm text-center">
                Connectez votre premier site Webflow pour commencer à générer des articles SEO.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-primary gap-2"
              >
                <Plus size={18} />
                Ajouter mon premier site
              </button>
            </div>
          )}

          {/* Sites Grid */}
          {!loading && sites.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="group bg-surface border border-border rounded-2xl p-6 hover:border-text/20 transition-all flex flex-col"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-10 h-10 bg-background border border-border rounded-xl flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Globe size={20} />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {site.userRole === 'admin' && (
                        <>
                          <button
                            onClick={() => { setSelectedSite(site); setShowMembersModal(true); }}
                            className="p-2 text-text-muted hover:text-text hover:bg-border/50 rounded-lg transition-colors"
                            title="Gérer les membres"
                          >
                            <Users size={16} />
                          </button>
                          <button
                            onClick={() => handleCrawl(site.id)}
                            className="p-2 text-text-muted hover:text-text hover:bg-border/50 rounded-lg transition-colors"
                            title="Crawler le site"
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(site.id, site.name)}
                            className="p-2 text-text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-bold truncate">{site.name}</h3>
                    {site.userRole === 'admin' ? (
                      <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                        <Crown size={10} /> Admin
                      </span>
                    ) : (
                      <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-text-muted bg-border/50 px-2 py-0.5 rounded-full">
                        Membre
                      </span>
                    )}
                  </div>
                  <a 
                    href={site.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-sm text-text-muted hover:text-text flex items-center gap-1 mb-6 transition-colors"
                  >
                    <span className="truncate">{site.url.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink size={12} />
                  </a>

                  <div className="mt-auto space-y-4">
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <Calendar size={14} />
                      Ajouté le {new Date(site.created_at).toLocaleDateString('fr-FR')}
                    </div>
                    <Link
                      href={`/generate?siteId=${site.id}`}
                      className="btn-primary w-full py-2.5 text-sm"
                    >
                      Générer un article
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manage Members Modal */}
        {showMembersModal && selectedSite && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowMembersModal(false)} />
            <div className="relative bg-surface border border-border rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
            <div className="relative bg-surface border border-border rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <AddSiteModal
                onClose={() => setShowAddModal(false)}
                onSuccess={(newSite) => {
                  setSites([...sites, newSite]);
                  setShowAddModal(false);
                }}
                token={token || ''}
              />
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
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
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-xl font-bold">Nouveau Projet</h3>
          <p className="text-sm text-text-muted mt-1">Configurez votre environnement Webflow.</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-lg transition-colors">
          <Trash2 size={20} className="rotate-45" /> {/* Use Trash2 rotated as a close icon for variety or standard X */}
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-error/10 border border-error/20 text-error px-4 py-3 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted">Nom du projet</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-base"
                placeholder="Mon Blog SEO"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted">URL du site</label>
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

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted">Webflow Site ID</label>
            <input
              type="text"
              value={formData.webflowSiteId}
              onChange={(e) => setFormData({ ...formData, webflowSiteId: e.target.value })}
              className="input-base font-mono text-xs"
              placeholder="5f72a..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted">Webflow API Key</label>
            <input
              type="password"
              value={formData.webflowApiKey}
              onChange={(e) => setFormData({ ...formData, webflowApiKey: e.target.value })}
              className="input-base font-mono text-xs"
              placeholder="••••••••••••••••"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted">Nom de la Collection</label>
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
            className="btn-secondary flex-1"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex-1"
          >
            {loading ? 'Configuration...' : 'Ajouter le site'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal gestion des membres
// ─────────────────────────────────────────────────────────────

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
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-xl font-bold">Membres du projet</h3>
          <p className="text-sm text-text-muted mt-1">{site.name}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-lg transition-colors text-text-muted">
          ✕
        </button>
      </div>

      {/* Invite form */}
      <form onSubmit={handleInvite} className="mb-8 bg-background border border-border rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-bold flex items-center gap-2">
          <UserPlus size={16} />
          Inviter un utilisateur
        </h4>

        {error && (
          <div className="bg-error/10 border border-error/20 text-error px-4 py-2 rounded-lg text-sm">{error}</div>
        )}
        {success && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-600 px-4 py-2 rounded-lg text-sm">{success}</div>
        )}

        <div className="flex gap-3">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="email@exemple.com"
            className="input-base flex-1"
          />
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value as 'admin' | 'member')}
            className="input-base w-32"
          >
            <option value="member">Membre</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="btn-primary whitespace-nowrap"
          >
            {inviting ? '...' : 'Inviter'}
          </button>
        </div>
        <p className="text-xs text-text-muted">
          Si l'utilisateur n'a pas encore de compte, il recevra une invitation par email.
        </p>
      </form>

      {/* Members list */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-text-muted uppercase tracking-wider">
          Membres actuels ({members.length})
        </h4>

        {loading && (
          <div className="text-center py-8 text-text-muted">
            <RefreshCw className="animate-spin mx-auto mb-2" size={20} />
            Chargement...
          </div>
        )}

        {!loading && members.length === 0 && (
          <p className="text-sm text-text-muted text-center py-6">
            Aucun membre pour l'instant. Invitez des collaborateurs ci-dessus.
          </p>
        )}

        {!loading && members.map(member => (
          <div
            key={member.id}
            className="flex items-center justify-between p-4 bg-background border border-border rounded-xl"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-xs font-bold shrink-0">
                {member.invited_email[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{member.invited_email}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-medium ${member.role === 'admin' ? 'text-amber-600' : 'text-text-muted'}`}>
                    {member.role === 'admin' ? '👑 Admin' : 'Membre'}
                  </span>
                  {member.status === 'pending' && (
                    <span className="text-xs text-text-muted bg-border/50 px-2 py-0.5 rounded-full">
                      En attente
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleRemove(member.id, member.invited_email)}
              className="p-2 text-text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors shrink-0"
              title="Retirer ce membre"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
