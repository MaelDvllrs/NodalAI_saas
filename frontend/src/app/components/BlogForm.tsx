'use client';

import { useState } from 'react';

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
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Webflow credentials */}
      <fieldset className="border border-[var(--border)] rounded-xl p-5 space-y-4">
        <legend className="px-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
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
          <div className="relative">
            <Input
              type={showApiKey ? 'text' : 'password'}
              placeholder="••••••••••••••••"
              value={values.apiKey}
              onChange={(e) => set('apiKey', e.target.value)}
              required
              className="pr-20"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              {showApiKey ? 'Masquer' : 'Afficher'}
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
      <fieldset className="border border-[var(--border)] rounded-xl p-5 space-y-4">
        <legend className="px-2 text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
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
          <select
            value={values.tone}
            onChange={(e) => set('tone', e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none cursor-pointer"
          >
            {TONE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>

        <Field label="État de publication">
          <div className="flex gap-3">
            {(['draft', 'publish'] as const).map((s) => (
              <label
                key={s}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border cursor-pointer transition-all text-sm font-medium ${
                  values.status === s
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]'
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={values.status === s}
                  onChange={() => set('status', s)}
                  className="sr-only"
                />
                <span>{s === 'draft' ? '📝 Brouillon' : '🚀 Publier'}</span>
              </label>
            ))}
          </div>
        </Field>
      </fieldset>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-3 rounded-xl font-semibold text-sm transition-all
          bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg)]"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner /> Génération en cours...
          </span>
        ) : (
          '✨ Générer l\'article'
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
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
        {label}
        {required && <span className="text-[var(--accent)] text-xs">*</span>}
        {hint && <span className="text-[var(--muted)] text-xs font-normal">({hint})</span>}
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
      className={`w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-4 py-2.5 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors ${className}`}
    />
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
