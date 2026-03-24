'use client';

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Terminal, Lock, Mail, User, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      setLoading(false);
      return;
    }

    try {
      await signup(email, password, name);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création du compte');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="max-w-md w-full">
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground mb-6 shadow-xl shadow-primary/10">
            <Terminal size={24} strokeWidth={2.5} />
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Créer un compte</h2>
          <p className="text-text-muted max-w-[280px]">
            Rejoignez la nouvelle ère de l'automatisation SEO.
          </p>
        </div>
        
        <div className="bg-card border border-border p-8 rounded-2xl shadow-sm">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-xl text-sm font-medium animate-in fade-in zoom-in-95">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2 px-1">
                  <User size={12} />
                  Nom complet
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-base"
                  placeholder="Jean Dupont"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2 px-1">
                  <Mail size={12} />
                  Adresse Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-base"
                  placeholder="votre@email.com"
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2 px-1">
                  <Lock size={12} />
                  Mot de passe
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-base"
                  placeholder="Minimum 6 caractères"
                />
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-2.5 gap-2"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    Créer mon compte
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div className="flex items-center gap-2 px-1">
                <CheckCircle2 size={12} className="text-success" />
                <p className="text-[10px] text-text-muted">Accès immédiat à Claude 3.5 Sonnet</p>
              </div>
            </div>
          </form>
        </div>

        <p className="mt-8 text-center text-sm text-text-muted">
          Déjà un compte ?{' '}
          <Link 
            href="/login" 
            className="font-bold text-text hover:underline transition-colors"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
