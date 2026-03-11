'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import AppLayout from '../../components/AppLayout';
import { Settings, Globe, UserPlus, Trash2, Crown, AlertTriangle, Save, ShieldAlert } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Skeleton, Spinner } from '../../components/UI';

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

function SettingsPageContent() {
  const { siteId } = useParams<{ siteId: string }>();
  const { token } = useAuth();
  const { refreshSites, selectedSite: ctxSite } = useProject();
  const router = useRouter();

  const [site, setSite] = useState<Site | null>(null);
  const [loadingSite, setLoadingSite] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Edit name form
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState('');
  const [nameError, setNameError] = useState('');

  // Members
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (token && siteId) {
      fetchSite();
      fetchMembers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, siteId]);

  async function fetchSite() {
    setLoadingSite(true);
    try {
      const res = await fetch(`${API_URL}/sites/${siteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.site.userRole !== 'admin') {
          setAccessDenied(true);
          return;
        }
        setSite(data.site);
        setName(data.site.name);
      } else {
        setAccessDenied(true);
      }
    } catch {
      setAccessDenied(true);
    } finally {
      setLoadingSite(false);
    }
  }

  async function fetchMembers() {
    setLoadingMembers(true);
    try {
      const res = await fetch(`${API_URL}/sites/${siteId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members);
      }
    } finally {
      setLoadingMembers(false);
    }
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name === site?.name) return;
    setNameError('');
    setNameSuccess('');
    setSavingName(true);
    try {
      const res = await fetch(`${API_URL}/sites/${siteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSite(data.site);
        setNameSuccess('Nom mis à jour.');
        await refreshSites();
        setTimeout(() => setNameSuccess(''), 3000);
      } else {
        const err = await res.json();
        setNameError(err.error || 'Erreur lors de la mise à jour');
      }
    } catch {
      setNameError('Erreur de connexion');
    } finally {
      setSavingName(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviting(true);
    try {
      const res = await fetch(`${API_URL}/sites/${siteId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteSuccess(data.message);
        setInviteEmail('');
        fetchMembers();
        setTimeout(() => setInviteSuccess(''), 4000);
      } else {
        setInviteError(data.error || "Erreur lors de l'invitation");
      }
    } catch {
      setInviteError('Erreur de connexion');
    } finally {
      setInviting(false);
    }
  }

  async function handleChangeRole(memberId: string, newRole: 'admin' | 'member') {
    try {
      const res = await fetch(`${API_URL}/sites/${siteId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      }
    } catch { /* ignore */ }
  }

  async function handleRemove(memberId: string, email: string) {
    if (!confirm(`Retirer ${email} du projet ?`)) return;
    setRemovingId(memberId);
    try {
      const res = await fetch(`${API_URL}/sites/${siteId}/members/${memberId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMembers(prev => prev.filter(m => m.id !== memberId));
      } else {
        const data = await res.json();
        alert(`❌ ${data.error}`);
      }
    } catch {
      alert('❌ Erreur lors de la suppression');
    } finally {
      setRemovingId(null);
    }
  }

  if (loadingSite) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="max-w-2xl mx-auto py-24 px-6 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center mb-6">
          <ShieldAlert size={28} className="text-error" />
        </div>
        <h2 className="text-xl font-bold mb-2">Accès refusé</h2>
        <p className="text-text-muted text-sm mb-8">Cette page est réservée aux administrateurs du projet.</p>
        <button onClick={() => router.back()} className="btn-secondary px-6 py-2 text-xs font-semibold uppercase tracking-widest">
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-6 space-y-8">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-surface border border-border rounded-xl">
          <Settings size={18} className="text-text-muted" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Paramètres du projet</h1>
          <p className="text-xs text-text-muted mt-0.5">{site?.url}</p>
        </div>
      </div>

      {/* ── Informations générales ── */}
      <section className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-background/40">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted flex items-center gap-2">
            <Globe size={12} /> Informations générales
          </h2>
        </div>
        <form onSubmit={handleSaveName} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Nom du projet</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="input-base"
              placeholder="Mon projet"
            />
          </div>

          {nameError && (
            <div className="text-xs font-semibold text-error bg-error/5 border border-error/10 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={14} /> {nameError}
            </div>
          )}
          {nameSuccess && (
            <div className="text-xs font-semibold text-green-600 bg-green-500/5 border border-green-500/10 rounded-xl px-4 py-3">
              ✓ {nameSuccess}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingName || !name.trim() || name === site?.name}
              className="btn-primary px-5 py-2 text-xs font-semibold uppercase tracking-widest gap-2 disabled:opacity-40"
            >
              {savingName ? <Spinner className="w-4 h-4" /> : <Save size={14} />}
              Enregistrer
            </button>
          </div>
        </form>
      </section>

      {/* ── Membres ── */}
      <section className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-background/40">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted flex items-center gap-2">
            <UserPlus size={12} /> Membres ({members.length})
          </h2>
        </div>

        {/* Invite */}
        <form onSubmit={handleInvite} className="p-6 border-b border-border space-y-4">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-widest">Inviter un collaborateur</p>

          {inviteError && (
            <div className="text-xs font-semibold text-error bg-error/5 border border-error/10 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={14} /> {inviteError}
            </div>
          )}
          {inviteSuccess && (
            <div className="text-xs font-semibold text-green-600 bg-green-500/5 border border-green-500/10 rounded-xl px-4 py-3">
              ✓ {inviteSuccess}
            </div>
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
              className="input-base w-36 appearance-none cursor-pointer"
            >
              <option value="member">Membre</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="btn-accent px-4 py-2 text-xs font-semibold uppercase tracking-widest whitespace-nowrap"
            >
              {inviting ? <Spinner className="w-4 h-4" /> : 'Inviter'}
            </button>
          </div>
        </form>

        {/* Members list */}
        <div className="divide-y divide-border">
          {loadingMembers && (
            <div className="p-6 space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          )}

          {!loadingMembers && members.length === 0 && (
            <div className="p-10 text-center">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-widest">Aucun membre pour l'instant</p>
            </div>
          )}

          {!loadingMembers && members.map(member => (
            <div key={member.id} className="group flex items-center gap-4 px-6 py-4 hover:bg-background/40 transition-colors">
              <div className="w-9 h-9 rounded-full bg-border/40 border border-border flex items-center justify-center text-xs font-bold shrink-0">
                {member.invited_email[0].toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{member.invited_email}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {member.status === 'pending' && (
                    <span className="text-[10px] uppercase tracking-widest text-text-muted bg-border/40 px-2 py-0.5 rounded-full">
                      En attente
                    </span>
                  )}
                </div>
              </div>

              {/* Role selector */}
              <div className="relative">
                <select
                  value={member.role}
                  onChange={e => handleChangeRole(member.id, e.target.value as 'admin' | 'member')}
                  className={cn(
                    'appearance-none text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors focus:outline-none',
                    member.role === 'admin'
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:border-amber-500/50'
                      : 'bg-background text-text-muted border-border hover:border-text/30'
                  )}
                >
                  <option value="member">Membre</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Remove */}
              <button
                onClick={() => handleRemove(member.id, member.invited_email)}
                disabled={removingId === member.id}
                className="p-1.5 text-text-muted hover:text-error hover:bg-error/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0"
                title="Retirer ce membre"
              >
                {removingId === member.id ? <Spinner className="w-4 h-4" /> : <Trash2 size={15} />}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppLayout>
      <Suspense fallback={
        <div className="max-w-2xl mx-auto py-12 px-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      }>
        <SettingsPageContent />
      </Suspense>
    </AppLayout>
  );
}
