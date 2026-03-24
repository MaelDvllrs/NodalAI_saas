'use client';

import type { ComponentType } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Search, Layers, Sparkles, Globe, Type } from 'lucide-react';
import { cn } from '../utils/cn';
import type { LogEvent } from './ProgressLog';

// ─────────────────────────────────────────────────────────────────────────────
// Brand icons
// ─────────────────────────────────────────────────────────────────────────────

export function WebflowIcon({ size = 16, className }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1080 674" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path fillRule="evenodd" clipRule="evenodd" d="M1080 0L735.386 673.684H411.695L555.916 394.481H549.445C430.464 548.934 252.942 650.61 -0.000488281 673.684V398.344C-0.000488281 398.344 161.813 388.787 256.938 288.776H-0.000488281V0.0053214H288.771V237.515L295.252 237.489L413.254 0.0053214H631.644V236.009L638.126 235.999L760.555 0H1080Z" fill="currentColor" />
    </svg>
  );
}

export function ChatGptIcon({ size = 16, className }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" className={className} fill="currentColor">
      <path d="m297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z"/>
    </svg>
  );
}

export function GeminiIcon({ size = 16, className }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 65 65" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="gemini-grad" x1="18.447" y1="43.42" x2="52.153" y2="15.004" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4893FC"/>
          <stop offset=".27" stopColor="#4893FC"/>
          <stop offset=".777" stopColor="#969DFF"/>
          <stop offset="1" stopColor="#BD99FE"/>
        </linearGradient>
      </defs>
      <path d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z" fill="currentColor"/>
    </svg>
  );
}

export function PerplexityIcon({ size = 16, className }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" fill="currentColor"/>
    </svg>
  );
}

export function RedditIcon({ size = 16, className }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 171 171" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g transform="translate(-85.4 -85.4)">
        <circle r="85.5" cy="170.9" cx="170.9" fill="#ff4500"/>
        <path d="M227.9 170.9c0-6.9-5.6-12.5-12.5-12.5-3.4 0-6.4 1.3-8.6 3.5-8.5-6.1-20.3-10.1-33.3-10.6l5.7-26.7 18.5 3.9c.2 4.7 4.1 8.5 8.9 8.5 4.9 0 8.9-4 8.9-8.9s-4-8.9-8.9-8.9c-3.5 0-6.5 2-7.9 5l-20.7-4.4c-.6-.1-1.2 0-1.7.3s-.8.8-1 1.4l-6.3 29.8c-13.3.4-25.2 4.3-33.8 10.6-2.2-2.1-5.3-3.5-8.6-3.5-6.9 0-12.5 5.6-12.5 12.5 0 5.1 3 9.4 7.4 11.4-.2 1.2-.3 2.5-.3 3.8 0 19.2 22.3 34.7 49.9 34.7 27.6 0 49.9-15.5 49.9-34.7 0-1.3-.1-2.5-.3-3.7 4.1-2 7.2-6.4 7.2-11.5zm-85.5 8.9c0-4.9 4-8.9 8.9-8.9s8.9 4 8.9 8.9-4 8.9-8.9 8.9-8.9-4-8.9-8.9zm49.7 23.5c-6.1 6.1-17.7 6.5-21.1 6.5-3.4 0-15.1-.5-21.1-6.5-.9-.9-.9-2.4 0-3.3.9-.9 2.4-.9 3.3 0 3.8 3.8 12 5.2 17.9 5.2 5.9 0 14-1.4 17.9-5.2.9-.9 2.4-.9 3.3 0 .7 1 .7 2.4-.2 3.3zm-1.6-14.6c-4.9 0-8.9-4-8.9-8.9s4-8.9 8.9-8.9 8.9 4 8.9 8.9-4 8.9-8.9 8.9z" fill="#fff"/>
      </g>
    </svg>
  );
}

export function GoogleIcon({ size = 16, className, monochrome }: { size?: number | string; className?: string; monochrome?: boolean }) {
  if (monochrome) {
    return (
      <svg width={size} height={size} viewBox="-3 0 262 262" xmlns="http://www.w3.org/2000/svg" className={className} fill="currentColor">
        <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"/>
        <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"/>
        <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782"/>
        <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"/>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="-3 0 262 262" xmlns="http://www.w3.org/2000/svg" className={className} preserveAspectRatio="xMidYMid">
      <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4"/>
      <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853"/>
      <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05"/>
      <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335"/>
    </svg>
  );
}

// Minimal set of country flag SVGs (acts like a tiny flag icon lib)
export function CountryFlag({ code, size = 16, className }: { code?: string; size?: number | string; className?: string }) {
  const c = (code || '').toLowerCase();
  if (c.startsWith('fr')) {
    return (
      <svg width={size} height={size} viewBox="0 0 3 2" className={className} xmlns="http://www.w3.org/2000/svg">
        <rect width="1" height="2" x="0" y="0" fill="#0055A4" />
        <rect width="1" height="2" x="1" y="0" fill="#FFFFFF" />
        <rect width="1" height="2" x="2" y="0" fill="#EF4135" />
      </svg>
    );
  }
  if (c.startsWith('en') || c === 'gb' || c.startsWith('uk')) {
    // simplified UK/GB flag as placeholder (not perfect)
    return (
      <svg width={size} height={size} viewBox="0 0 60 30" className={className} xmlns="http://www.w3.org/2000/svg">
        <rect width="60" height="30" fill="#012169" />
        <polygon points="0,0 30,15 0,30" fill="#fff" />
        <polygon points="60,0 30,15 60,30" fill="#fff" />
        <polygon points="0,0 15,0 60,22 60,30 45,30 0,8" fill="#C8102E" opacity="0.9" />
      </svg>
    );
  }
  if (c.startsWith('es')) {
    return (
      <svg width={size} height={size} viewBox="0 0 3 2" className={className} xmlns="http://www.w3.org/2000/svg">
        <rect width="3" height="2" fill="#C60B1E" />
        <rect width="3" height="1" y="0.5" fill="#FFC400" />
      </svg>
    );
  }
  if (c.startsWith('de')) {
    return (
      <svg width={size} height={size} viewBox="0 0 3 2" className={className} xmlns="http://www.w3.org/2000/svg">
        <rect width="3" height="0.666" y="0" fill="#000" />
        <rect width="3" height="0.666" y="0.666" fill="#DD0000" />
        <rect width="3" height="0.666" y="1.333" fill="#FFCE00" />
      </svg>
    );
  }
  if (c.startsWith('it')) {
    return (
      <svg width={size} height={size} viewBox="0 0 3 2" className={className} xmlns="http://www.w3.org/2000/svg">
        <rect width="1" height="2" x="0" fill="#009246" />
        <rect width="1" height="2" x="1" fill="#FFFFFF" />
        <rect width="1" height="2" x="2" fill="#CE2B37" />
      </svg>
    );
  }
  // fallback: empty square
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" fill="#E5E7EB" rx="2" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BlockStatus = 'idle' | 'active' | 'done' | 'error';

export interface BlockOpts {
  seoTestMode: boolean;
  keywordMode: 'theme' | 'keyword';
}

export interface WorkflowBlockDef {
  /** Unique identifier */
  id: string;
  /** Display label — can be static or dynamic based on opts */
  label: string | ((opts: BlockOpts) => string);
  /** Short description shown below the label */
  description: string | ((opts: BlockOpts) => string);
  /** Icon component */
  icon: ComponentType<{ size?: number | string; className?: string }>;
  /** Show this block when seoTestMode is true */
  showInSeoTest: boolean;
  /** Returns true while this block is currently executing */
  isActive: (events: LogEvent[]) => boolean;
  /** Returns true once this block has completed */
  isDone: (events: LogEvent[]) => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const stepMsgs = (events: LogEvent[]): string[] =>
  events.filter(e => e.type === 'step').map(e => (e as { message: string }).message);

const hasDataKey = (events: LogEvent[], key: string): boolean =>
  events.some(e => e.type === 'data' && (e as { key: string }).key === key);

// ─────────────────────────────────────────────────────────────────────────────
// Block definitions
// ─────────────────────────────────────────────────────────────────────────────
// To add a new block: push a new entry to this array.
// The component renders them in order automatically.
// ─────────────────────────────────────────────────────────────────────────────

export const WORKFLOW_BLOCKS: WorkflowBlockDef[] = [
  // ── 0. Text Input ─────────────────────────────────────────────────────────
  {
    id: 'text-input',
    label: 'Entrée texte',
    description: 'Valeur injectée dans le pipeline',
    icon: Type,
    showInSeoTest: true,
    isActive:  (_events) => false, // instant — never in active state
    isDone: (events) => stepMsgs(events).some(m => m.startsWith('📝 Entrée texte')),
  },

  // ── 1. Website Scraper ────────────────────────────────────────────────────
  {
    id: 'website-scraper',
    label: 'Scraping de site',
    description: 'Sitemap · Thème · Profil',
    icon: Globe,
    showInSeoTest: true,
    isActive: (events) => {
      const msgs = stepMsgs(events);
      return msgs.some(m => /scraping|sitemap|analyse du site/i.test(m)) && !hasDataKey(events, 'siteProfile');
    },
    isDone: (events) => hasDataKey(events, 'siteProfile'),
  },

  // ── 1. Keyword ────────────────────────────────────────────────────────────
  {
    id: 'keyword',
    label: ({ keywordMode }) =>
      keywordMode === 'keyword' ? 'Mot-clé direct' : 'Recherche de mots-clés',
    description: ({ keywordMode }) =>
      keywordMode === 'keyword'
        ? 'Utilisation directe sans analyse DataForSEO'
        : 'DataForSEO • Métriques SEO • KD',
    icon: Search,
    showInSeoTest: true,
    isActive: (events) => {
      const msgs = stepMsgs(events);
      return (
        msgs.some(m =>
          m.includes('candidats mots-clés') ||
          m.includes('Mot-clé direct') ||
          m.includes('Analyse métriques SEO') ||
          m.includes('Thème résolu')
        ) &&
        !hasDataKey(events, 'mainKeyword')
      );
    },
    isDone: (events) => hasDataKey(events, 'mainKeyword'),
  },

  // ── 2. SERP Analysis ──────────────────────────────────────────────────────
  {
    id: 'serp',
    label: 'Analyse SERP',
    description: 'Google top 10 • Résultats organiques',
    icon: GoogleIcon,
    showInSeoTest: true,
    isActive: (events) => {
      const msgs = stepMsgs(events);
      return (
        hasDataKey(events, 'mainKeyword') &&
        msgs.some(m => m.includes('SERP')) &&
        !hasDataKey(events, 'serpModel') &&
        !msgs.some(m => m.includes('SERP indisponible') || m.includes('résultats SERP récupérés'))
      );
    },
    isDone: (events) =>
      hasDataKey(events, 'serpModel') ||
      stepMsgs(events).some(m =>
        m.includes('résultats SERP récupérés') || m.includes('SERP indisponible')
      ),
  },

  // ── 3. Semantic Extraction ────────────────────────────────────────────────
  {
    id: 'semantic',
    label: 'Extraction sémantique',
    description: 'BM25 • Embeddings • TF-IDF',
    icon: Layers,
    showInSeoTest: true,
    isActive: (events) => {
      const msgs = stepMsgs(events);
      return (
        msgs.some(m => m.includes('sémantique')) &&
        !hasDataKey(events, 'semanticAnalysis') &&
        !msgs.some(m => m.includes('sémantique terminée') || m.includes('sémantique ignorée')) &&
        !events.some(e => e.type === 'seo-preview')
      );
    },
    isDone: (events) =>
      hasDataKey(events, 'semanticAnalysis') ||
      stepMsgs(events).some(m =>
        m.includes('sémantique terminée') || m.includes('sémantique ignorée')
      ) ||
      events.some(e => e.type === 'seo-preview'),
  },

  // ── 4. Blog Generation ────────────────────────────────────────────────────
  {
    id: 'generation',
    label: 'Génération de blog',
    description: 'Claude Sonnet • Optimisation SEO',
    icon: Sparkles,
    showInSeoTest: false,
    isActive: (events) => {
      const msgs = stepMsgs(events);
      return (
        msgs.some(m =>
          m.includes('mots-clés secondaires') ||
          m.includes('✍️') ||
          m.includes('plan optimisé') ||
          m.includes('Génération du blog') ||
          m.includes('Tentative')
        ) &&
        !msgs.some(m =>
          m.includes('Structure Webflow') ||
          m.includes('champs de la collection') ||
          m.includes('articles existants') ||
          m.includes('champs récupérés') ||
          m.includes('URLs internes')
        )
      );
    },
    isDone: (events) =>
      stepMsgs(events).some(m =>
        m.includes('Structure Webflow') ||
        m.includes('champs de la collection') ||
        m.includes('champs récupérés') ||
        m.includes('articles existants') ||
        m.includes('URLs internes')
      ) || events.some(e => e.type === 'done'),
  },

  // ── 4b. Webflow Structure ─────────────────────────────────────────────────
  {
    id: 'webflow-structure',
    label: 'Structure Webflow',
    description: 'Collection • Champs • Détection',
    icon: WebflowIcon,
    showInSeoTest: false,
    isActive: (events) => {
      const msgs = stepMsgs(events);
      return (
        msgs.some(m => m.includes('Récupération de la structure Webflow')) &&
        !msgs.some(m => m.includes('Structure Webflow récupérée'))
      );
    },
    isDone: (events) =>
      stepMsgs(events).some(m => m.includes('Structure Webflow récupérée')),
  },

  // ── 5. Webflow Publication ────────────────────────────────────────────────
  {
    id: 'publish',
    label: 'Publication Webflow',
    description: 'Push CMS • Collection Webflow',
    icon: WebflowIcon,
    showInSeoTest: false,
    isActive: (events) => {
      const msgs = stepMsgs(events);
      return (
        msgs.some(m =>
          m.includes('Création de l\'article') ||
          m.includes('Recherche de la collection') ||
          m.includes('Récupération des champs de la collection')
        ) &&
        !events.some(e => e.type === 'done')
      );
    },
    isDone: (events) => events.some(e => e.type === 'done'),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Status computation
// ─────────────────────────────────────────────────────────────────────────────

function computeStatus(def: WorkflowBlockDef, events: LogEvent[]): BlockStatus {
  const hasError = events.some(e => e.type === 'error');
  if (def.isDone(events)) return 'done';
  if (def.isActive(events)) return hasError ? 'error' : 'active';
  return 'idle';
}

// ─────────────────────────────────────────────────────────────────────────────
// BlockCard
// ─────────────────────────────────────────────────────────────────────────────

function BlockCard({
  def,
  status,
  opts,
  isLast,
}: {
  def: WorkflowBlockDef;
  status: BlockStatus;
  opts: BlockOpts;
  isLast: boolean;
}) {
  const Icon = def.icon;
  const label = typeof def.label === 'function' ? def.label(opts) : def.label;
  const description = typeof def.description === 'function' ? def.description(opts) : def.description;

  return (
    <div className="flex gap-2.5">
      {/* ── Connector column ── */}
      <div className="flex flex-col items-center pt-0.5">
        <div className={cn(
          'w-5 h-5 rounded-full shrink-0 flex items-center justify-center transition-all duration-300',
          status === 'done'   && 'bg-green-500/15',
          status === 'active' && 'bg-accent/15 ring-2 ring-accent/25 ring-offset-1 ring-offset-surface',
          status === 'error'  && 'bg-red-500/15',
          status === 'idle'   && 'bg-border/40',
        )}>
          {status === 'done'   && <CheckCircle2 size={11} className="text-green-400" />}
          {status === 'active' && <Loader2 size={11} className="text-accent animate-spin" />}
          {status === 'error'  && <AlertCircle size={11} className="text-red-400" />}
          {status === 'idle'   && <div className="w-1.5 h-1.5 rounded-full bg-text-muted/20" />}
        </div>
        {!isLast && (
          <div className={cn(
            'w-px flex-1 my-1',
            status === 'done' ? 'bg-green-500/20' : 'bg-border/30',
          )} />
        )}
      </div>

      {/* ── Block card ── */}
      <div className={cn(
        'flex-1 rounded-lg border px-3 py-2 mb-1.5 transition-all duration-300',
        status === 'done'   && 'border-green-500 bg-green-500/[0.03]',
        status === 'active' && 'border-accent/25 bg-accent/[0.04]',
        status === 'error'  && 'border-red-500 bg-red-500/[0.04]',
        status === 'idle'   && 'border-border/40 bg-card/20',
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Icon bubble */}
            <div className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors',
              status === 'done'   && 'bg-green-500/10 text-green-400',
              status === 'active' && 'bg-accent/10 text-accent',
              status === 'error'  && 'bg-red-500/10 text-red-400',
              status === 'idle'   && 'bg-border/30 text-text-muted/30',
            )}>
              <Icon size={12} />
            </div>

            {/* Label + description */}
            <div className="min-w-0">
              <p className={cn(
                'text-xs font-semibold leading-tight truncate',
                status === 'idle' ? 'text-text-muted/50' : 'text-text',
              )}>
                {label}
              </p>
              <p className={cn(
                'text-[10px] leading-tight mt-0.5 truncate',
                status === 'idle' ? 'text-text-muted/30' : 'text-text-muted',
              )}>
                {description}
              </p>
            </div>
          </div>

          {/* Right status indicator */}
          {status === 'active' && (
            <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-bold uppercase tracking-wider">
              <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
              Live
            </span>
          )}
          {status === 'done' && (
            <span className="shrink-0 text-[9px] font-semibold text-green-400/50 uppercase tracking-wider">OK</span>
          )}
          {status === 'error' && (
            <span className="shrink-0 text-[9px] font-semibold text-red-400 uppercase tracking-wider">Erreur</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkflowBlocks — public component
// ─────────────────────────────────────────────────────────────────────────────

interface WorkflowBlocksProps {
  events: LogEvent[];
  isRunning: boolean;
  seoTestMode: boolean;
  keywordMode: 'theme' | 'keyword';
}

export default function WorkflowBlocks({
  events,
  seoTestMode,
  keywordMode,
}: WorkflowBlocksProps) {
  const opts: BlockOpts = { seoTestMode, keywordMode };
  const visible = WORKFLOW_BLOCKS.filter(b => !seoTestMode || b.showInSeoTest);

  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted mb-2.5 px-0.5">
        Pipeline
      </p>
      <div>
        {visible.map((def, i) => (
          <BlockCard
            key={def.id}
            def={def}
            status={computeStatus(def, events)}
            opts={opts}
            isLast={i === visible.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
