'use client';

import { useState } from 'react';
import { Spinner } from './UI';
import { cn } from '../utils/cn';
import { Eye, EyeOff, Sparkles } from 'lucide-react';

export interface FormValues {
  siteId: string;
  apiKey: string;
  collectionName: string;
  theme: string;
  tone: string;
  status: 'draft' | 'publish';
  siteUrl: string;
}

interface Props {
  onSubmit: (values: FormValues) => void;
  isLoading: boolean;
}

const TONE_OPTIONS = [
  'Expert et pédagogique',
  'Professionnel et concis',
  'Engageant et conversationnel',
  'Inspirant et motivant',
  'Technique et précis',
  'Accessible et grand public',
];

export default function BlogForm({ onSubmit, isLoading }: Props) {
  const [values, setValues] = useState<FormValues>({
    siteId: '',
    apiKey: '',
    collectionName: '',
    theme: '',
    tone: 'Expert et pédagogique',
    status: 'draft',
    siteUrl: '',
  });

  const [showApiKey, setShowApiKey] = useState(false);

  function set(key: keyof FormValues, val: string) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.siteId || !values.apiKey || !values.collectionName || !values.theme || !values.tone) return;
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
      {/* Webflow credentials */}
      <fieldset className="border border-border rounded-2xl p-6 space-y-5 bg-surface/50">
        <legend className="px-3 py-0.5 text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] border border-border bg-bg rounded-full">
          Webflow
        </legend>

        <Field label="Site ID" required>
          <Input
            type="text"
            placeholder="64a1b2c3d4e5f6a7b8c9d0e1"
            value={values.siteId}
            onChange={(e) => set('siteId', e.target.value)}
            required
          />
        </Field>

        <Field label="API Key" required>
          <div className="relative group">
            <Input
              type={showApiKey ? 'text' : 'password'}
              placeholder="••••••••••••••••"
              value={values.apiKey}
              onChange={(e) => set('apiKey', e.target.value)}
              required
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-text hover:bg-border/40 rounded-md transition-all"
              title={showApiKey ? 'Masquer' : 'Afficher'}
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <Field label="Nom de la collection CMS" required>
          <Input
            type="text"
            placeholder="blog-posts"
            value={values.collectionName}
            onChange={(e) => set('collectionName', e.target.value)}
            required
          />
        </Field>

        <Field label="URL du site (pour le maillage interne)" hint="Optionnel">
          <Input
            type="url"
            placeholder="https://votre-site.webflow.io"
            value={values.siteUrl}
            onChange={(e) => set('siteUrl', e.target.value)}
          />
        </Field>
      </fieldset>

      {/* Content settings */}
      <fieldset className="border border-border rounded-2xl p-6 space-y-5 bg-surface/50">
        <legend className="px-3 py-0.5 text-[10px] font-semibold text-text-muted uppercase tracking-[0.1em] border border-border bg-bg rounded-full">
          Contenu
        </legend>

        <Field label="Thème / Sujet" required>
          <Input
            type="text"
            placeholder="ex: marketing digital, intelligence artificielle, SEO local..."
            value={values.theme}
            onChange={(e) => set('theme', e.target.value)}
            required
          />
        </Field>

        <Field label="Ton de l'article" required>
          <div className="relative group">
            <select
              value={values.tone}
              onChange={(e) => set('tone', e.target.value)}
              className="input-base pr-10 appearance-none cursor-pointer"
            >
              {TONE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted group-focus-within:text-accent transition-colors">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </Field>

        <Field label="État de publication">
          <div className="flex gap-3">
            {(['draft', 'publish'] as const).map((s) => (
              <label
                key={s}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 cursor-pointer transition-all text-sm font-semibold shadow-sm active:scale-[0.98]",
                  values.status === s
                    ? "border-accent bg-accent/5 text-accent"
                    : "border-border bg-bg text-text-muted hover:border-text/20 hover:text-text"
                )}
              >
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={values.status === s}
                  onChange={() => set('status', s)}
                  className="sr-only"
                />
                <span className="flex items-center gap-2">
                  {s === 'draft' ? '📝 Brouillon' : '🚀 Publier'}
                </span>
              </label>
            ))}
          </div>
        </Field>
      </fieldset>

      <button
        type="submit"
        disabled={isLoading}
        className="btn-accent w-full py-3.5 text-sm font-semibold gap-3"
      >
        {isLoading ? (
          <>
            <Spinner className="w-5 h-5" />
            <span>Génération en cours...</span>
          </>
        ) : (
          <>
            <Sparkles size={20} />
            <span>Générer l'article</span>
          </>
        )}
      </button>
    </form>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-text/80">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </span>
        {hint && <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Input({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn('input-base', className)}
    />
  );
}
