'use client';

import { CheckCircle2, AlertCircle, Loader2, Search, TrendingUp, Layers, Sparkles, Rocket, Globe, Type } from 'lucide-react';
import { cn } from '../utils/cn';
import type { LogEvent } from './ProgressLog';
import type { LucideIcon } from 'lucide-react';

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
  /** Lucide icon */
  icon: LucideIcon;
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
    isActive: (events) =>
      events.some(e => e.type === 'step') && !hasDataKey(events, 'mainKeyword'),
    isDone: (events) => hasDataKey(events, 'mainKeyword'),
  },

  // ── 2. SERP Analysis ──────────────────────────────────────────────────────
  {
    id: 'serp',
    label: 'Analyse SERP',
    description: 'Google top 10 • Résultats organiques',
    icon: TrendingUp,
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

  // ── 4. Content Generation ─────────────────────────────────────────────────
  {
    id: 'generation',
    label: 'Génération de contenu',
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
          m.includes('champs de la collection') ||
          m.includes('articles existants') ||
          m.includes('champs récupérés') ||
          m.includes('URLs internes')
        )
      );
    },
    isDone: (events) =>
      stepMsgs(events).some(m =>
        m.includes('champs de la collection') ||
        m.includes('champs récupérés') ||
        m.includes('articles existants') ||
        m.includes('URLs internes')
      ) || events.some(e => e.type === 'done'),
  },

  // ── 5. Webflow Publication ────────────────────────────────────────────────
  {
    id: 'publish',
    label: 'Publication Webflow',
    description: 'Push CMS • Collection Webflow',
    icon: Rocket,
    showInSeoTest: false,
    isActive: (events) => {
      const msgs = stepMsgs(events);
      return (
        msgs.some(m =>
          m.includes('champs de la collection') ||
          m.includes('articles existants') ||
          m.includes('URLs internes') ||
          m.includes('Webflow') ||
          m.includes('Création') ||
          m.includes('Publié')
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
        status === 'done'   && 'border-green-500/15 bg-green-500/[0.03]',
        status === 'active' && 'border-accent/25 bg-accent/[0.04]',
        status === 'error'  && 'border-red-500/25 bg-red-500/[0.04]',
        status === 'idle'   && 'border-border/40 bg-surface/20',
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
