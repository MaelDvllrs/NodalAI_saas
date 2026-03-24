'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AppLayout from '../components/AppLayout';
import { User, Mail, Save, CheckCircle } from 'lucide-react';

export default function AccountPage() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile(name.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto py-10 px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-3">
            <User size={24} className="text-text-muted" />
            Mon compte
          </h1>
          <p className="text-text-muted text-sm">Gérez vos informations personnelles.</p>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Email — lecture seule */}
          <div className="px-6 py-5 border-b border-border">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
              Adresse e-mail
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-text-muted">
              <Mail size={14} className="shrink-0" />
              <span>{user?.email}</span>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-text-muted/60 bg-border px-1.5 py-0.5 rounded">
                Non modifiable
              </span>
            </div>
          </div>

          {/* Nom */}
          <form onSubmit={handleSubmit} className="px-6 py-5">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
              Nom affiché
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Votre nom"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
              disabled={saving}
            />
            <p className="text-[11px] text-text-muted mt-1.5">
              Ce nom apparaît dans l'historique des articles générés.
            </p>

            {error && (
              <p className="mt-3 text-sm text-error font-medium">{error}</p>
            )}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>

              {saved && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-success animate-in fade-in duration-200">
                  <CheckCircle size={14} />
                  Changements enregistrés
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
