'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  BackgroundVariant,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
} from '@xyflow/react';
import type { NodeProps, Connection, Node, Edge, EdgeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Search, TrendingUp, Layers, Sparkles, Rocket,
  X, CheckCircle2, AlertCircle, Loader2, Check, SlidersHorizontal, MoreVertical,
  Play, RefreshCw, FileEdit, Info, MousePointerClick, Zap, Globe, Save, Type,
} from 'lucide-react';
import { cn } from '../utils/cn';
import type { LogEvent } from './ProgressLog';
import { WORKFLOW_BLOCKS } from './WorkflowBlocks';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from './UI';

// 
// Types
// 

export type BlockConfig = Record<string, unknown>;

export interface CanvasBlock {
  instanceId: string;
  type: string;
  config: BlockConfig;
  position?: { x: number; y: number };
}

interface Port { key: string; label: string; required?: boolean; }

interface ModuleDef {
  type: string;
  label: string;
  description: string;
  details: string;
  icon: LucideIcon;
  category: 'trigger' | 'input' | 'research' | 'analysis' | 'generation' | 'publish';
  accent: { bg: string; text: string; border: string };
  defaultConfig: BlockConfig;
  unique?: boolean;
  ports: { in: Port[]; out: Port[] };
}

// 
// Module catalog
// 

export const MODULE_CATALOG: ModuleDef[] = [
  // ── Trigger ────────────────────────────────────────────────────────────────
  {
    type: 'trigger-manual',
    label: 'Lancement manuel',
    description: 'Déclenche le workflow au clic',
    details: 'Point d\'entrée du workflow. Le pipeline démarre quand vous cliquez sur "Lancer".',
    icon: MousePointerClick,
    category: 'trigger',
    accent: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    defaultConfig: {},

    unique: true,
    ports: { in: [], out: [] },
  },
  // ── Input ──────────────────────────────────────────────────────────────────
  {
    type: 'text-input',
    label: 'Entrée texte',
    description: 'Thème · Mot-clé · URL',
    details: 'Injecte une valeur texte fixe dans le pipeline. Choisissez la clé de sortie (thème, mot-clé, URL...) et la valeur à injecter dans les modules suivants.',
    icon: Type,
    category: 'input',
    accent: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' },
    defaultConfig: { outputKey: 'theme', value: '' },
    ports: {
      in:  [],
      out: [{ key: 'value', label: 'Valeur texte' }],
    },
  },

  // ── Research ───────────────────────────────────────────────────────────────
  {
    type: 'website-scraper',
    label: 'Scraping de site',
    description: 'Sitemap · Thème · Profil',
    details: 'Scrape la homepage et le sitemap du site pour en extraire le thème, le ton, les sujets clés et les titres d\'articles existants.',
    icon: Globe,
    category: 'research',
    accent: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
    defaultConfig: { maxPages: 6 },

    ports: {
      in:  [{ key: 'siteUrl',     label: 'URL du site',   required: true }],
      out: [{ key: 'siteProfile', label: 'Profil du site' }, { key: 'sitemapUrls', label: 'URLs sitemap' }],
    },
  },
  {
    type: 'keyword-research',
    label: 'Recherche de mots-cles',
    description: 'DataForSEO · KD · Volume',
    details: 'Genere des candidats via Claude puis selectionne le meilleur mot-cle selon le volume et la concurrence DataForSEO. Connectez un bloc "Entrée texte" en amont pour fournir le thème ou le mot-clé direct.',
    icon: Search,
    category: 'research',
    accent: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
    defaultConfig: {},

    ports: {
      in:  [
        { key: 'theme',         label: 'Thème',          required: false },
        { key: 'siteProfile',   label: 'Profil du site', required: false },
        { key: 'directKeyword', label: 'Mot-clé direct',  required: false },
      ],
      out: [
        { key: 'mainKeyword',    label: 'Mot-clé principal' },
        { key: 'kd',             label: 'Difficulté (KD)' },
        { key: 'kwSearchVolume', label: 'Volume de recherche' },
      ],
    },
  },
  {
    type: 'serp-analysis',
    label: 'Analyse SERP',
    description: 'Google top 10 · Résultats organiques',
    details: 'Recupere les 10 premiers resultats Google et classe les pages par type (article, comparatif, forum...).',
    icon: TrendingUp,
    category: 'analysis',
    accent: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
    defaultConfig: {},

    ports: {
      // mainKeyword can also be set via config.keyword for standalone use
      in:  [{ key: 'mainKeyword', label: 'Mot-clé principal', required: false }],
      out: [{ key: 'serpResults', label: 'Résultats SERP' }, { key: 'serpModel', label: 'Modèle SERP' }],
    },
  },
  {
    type: 'semantic-extraction',
    label: 'Extraction semantique',
    description: 'BM25 · Embeddings · TF-IDF',
    details: 'Crawl les pages concurrentes, extrait les termes cles et les classe par pertinence via BM25 + embeddings.',
    icon: Layers,
    category: 'analysis',
    accent: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
    defaultConfig: {},

    ports: {
      in:  [
        { key: 'mainKeyword', label: 'Mot-clé principal', required: true },
        { key: 'serpResults', label: 'Résultats SERP',    required: false },
      ],
      out: [{ key: 'semanticAnalysis', label: 'Analyse sémantique' }],
    },
  },
  {
    type: 'content-generation',
    label: 'Generation de contenu',
    description: 'Claude Sonnet · SEO-optimisé',
    details: 'Genere un article long format optimise SEO avec structure MECE, FAQ integree et suggestion de liens internes.',
    icon: Sparkles,
    category: 'generation',
    accent: { bg: 'bg-accent/10', text: 'text-accent', border: 'border-accent/20' },
    defaultConfig: { tone: 'Expert et pedagogique', toneMode: 'preset' },

    ports: {
      in:  [
        { key: 'mainKeyword',      label: 'Mot-clé principal',   required: true  },
        { key: 'serpModel',        label: 'Modèle SERP',          required: false },
        { key: 'semanticAnalysis', label: 'Analyse sémantique',   required: false },
        { key: 'siteProfile',      label: 'Profil du site',       required: false },
        { key: 'theme',            label: 'Thème',                required: false },
        { key: 'tone',             label: 'Ton rédactionnel',     required: false },
      ],
      out: [
        { key: 'blogContent', label: 'Contenu article' },
        { key: 'htmlBody',    label: 'HTML généré' },
        { key: 'fieldData',   label: 'Champs Webflow' },
      ],
    },
  },
  {
    type: 'webflow-publish',
    label: 'Publication Webflow',
    description: 'Push CMS · Collection Webflow',
    details: "Publie l'article dans la collection Webflow du projet selectionne, en brouillon ou directement en ligne.",
    icon: Rocket,
    category: 'publish',
    accent: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
    defaultConfig: { status: 'draft' },

    ports: {
      in:  [{ key: 'fieldData', label: 'Champs Webflow', required: true }],
      out: [{ key: 'webflowItemId', label: 'ID article Webflow' }, { key: 'webflowItemUrl', label: 'URL article' }],
    },
  },
];

//
// Status helpers
//

type BlockStatus = 'idle' | 'active' | 'done' | 'error';

// Map MODULE_CATALOG types → WORKFLOW_BLOCKS ids
const TYPE_TO_BLOCK_ID: Record<string, string> = {
  'keyword-research':    'keyword',
  'serp-analysis':       'serp',
  'semantic-extraction': 'semantic',
  'content-generation':  'generation',
  'webflow-publish':     'publish',
  'website-scraper':     'website-scraper',
};

function getBlockStatus(type: string, events: LogEvent[]): BlockStatus {
  const blockId = TYPE_TO_BLOCK_ID[type] ?? type;
  const def = WORKFLOW_BLOCKS.find(b => b.id === blockId);
  console.log(`[getBlockStatus] type="${type}" → blockId="${blockId}" | def found: ${!!def} | events: ${events.length}`);
  if (!def || events.length === 0) return 'idle';
  const hasError = events.some(e => e.type === 'error');
  const done = def.isDone(events);
  const active = def.isActive(events);
  console.log(`[getBlockStatus] type="${type}" → isDone: ${done} | isActive: ${active} | hasError: ${hasError}`);
  if (done) return 'done';
  if (active) return hasError ? 'error' : 'active';
  return 'idle';
}

// 
// Config renderers
// 

const TONE_PRESETS = [
  'Expert et pedagogique',
  'Professionnel et concis',
  'Engageant et conversationnel',
  'Inspirant et motivant',
  'Technique et precis',
  'Accessible et grand public',
];


function ContentConfig({ config, onChange, readOnly }: { config: BlockConfig; onChange: (c: BlockConfig) => void; readOnly?: boolean }) {
  const toneMode = (config.toneMode as string) ?? 'preset';
  const tone = (config.tone as string) ?? 'Expert et pedagogique';
  return (
    <div className="space-y-2">
      <div className="p-0.5 bg-background/60 rounded-md flex">
        {(['preset', 'custom'] as const).map(m => (
          <button key={m} type="button" disabled={readOnly}
            onClick={() => onChange({ ...config, toneMode: m })}
            className={cn('flex-1 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all',
              toneMode === m ? 'bg-primary text-primary-foreground shadow-sm' : 'text-text-muted hover:text-text',
              readOnly && 'cursor-default')}>
            {m === 'preset' ? 'Predéfini' : 'Personnalise'}
          </button>
        ))}
      </div>
      {toneMode === 'preset' ? (
        <select disabled={readOnly} value={tone}
          onChange={e => onChange({ ...config, tone: e.target.value })}
          className={cn('input-base text-xs appearance-none nodrag', readOnly && 'opacity-60')}>
          {TONE_PRESETS.map(t => <option key={t}>{t}</option>)}
        </select>
      ) : (
        <input type="text" readOnly={readOnly} placeholder="ex: Humoristique et decale..."
          value={tone} onChange={e => onChange({ ...config, tone: e.target.value })}
          className={cn('input-base text-xs nodrag', readOnly && 'opacity-60 cursor-default')} />
      )}
    </div>
  );
}

function PublishConfig({ config, onChange, readOnly }: { config: BlockConfig; onChange: (c: BlockConfig) => void; readOnly?: boolean }) {
  const status = (config.status as string) ?? 'draft';
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {(['draft', 'publish'] as const).map(s => (
        <button key={s} type="button" disabled={readOnly}
          onClick={() => onChange({ ...config, status: s })}
          className={cn('flex items-center justify-center gap-1.5 py-1.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider transition-all nodrag',
            status === s ? 'bg-accent/5 text-accent border-accent/30' : 'bg-background border-border text-text-muted hover:border-text/20 hover:text-text',
            readOnly && 'cursor-default')}>
          {s === 'draft' ? <FileEdit size={11} /> : <Rocket size={11} />}
          {s === 'draft' ? 'Brouillon' : 'Publier'}
        </button>
      ))}
    </div>
  );
}

const TEXT_INPUT_KEY_OPTIONS = [
  { value: 'theme',         label: 'Thème' },
  { value: 'directKeyword', label: 'Mot-clé direct' },
  { value: 'mainKeyword',   label: 'Mot-clé principal' },
  { value: 'siteUrl',       label: 'URL du site' },
  { value: 'tone',          label: 'Ton rédactionnel' },
];

function TextInputConfig({ config, onChange, readOnly }: { config: BlockConfig; onChange: (c: BlockConfig) => void; readOnly?: boolean }) {
  const outputKey = (config.outputKey as string) ?? 'theme';
  const value     = (config.value     as string) ?? '';
  return (
    <div className="space-y-2">
      <select disabled={readOnly} value={outputKey}
        onChange={e => onChange({ ...config, outputKey: e.target.value })}
        className={cn('input-base text-xs appearance-none nodrag', readOnly && 'opacity-60')}>
        {TEXT_INPUT_KEY_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <input type="text" readOnly={readOnly}
        placeholder="Entrez une valeur..."
        value={value} onChange={e => onChange({ ...config, value: e.target.value })}
        className={cn('input-base text-xs nodrag', readOnly && 'opacity-60 cursor-default')} />
    </div>
  );
}

function ScraperConfig({ config, onChange, readOnly }: { config: BlockConfig; onChange: (c: BlockConfig) => void; readOnly?: boolean }) {
  const url = (config.url as string) ?? '';
  const maxPages = (config.maxPages as number) ?? 6;
  return (
    <div className="space-y-2">
      <input type="url" readOnly={readOnly}
        placeholder="https://monsite.fr"
        value={url} onChange={e => onChange({ ...config, url: e.target.value })}
        className={cn('input-base text-xs nodrag', readOnly && 'opacity-60 cursor-default')} />
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-text-muted/60 shrink-0">Pages max</label>
        <input type="number" readOnly={readOnly} min={1} max={20}
          value={maxPages} onChange={e => onChange({ ...config, maxPages: Number(e.target.value) })}
          className={cn('input-base text-xs nodrag w-16', readOnly && 'opacity-60 cursor-default')} />
      </div>
    </div>
  );
}

type ConfigComponent = React.ComponentType<{ config: BlockConfig; onChange: (c: BlockConfig) => void; readOnly?: boolean }>;
const CONFIG_RENDERERS: Record<string, ConfigComponent> = {
  'text-input':         TextInputConfig,
  'website-scraper':    ScraperConfig,
  'content-generation': ContentConfig,
  'webflow-publish':    PublishConfig,
};

// 
// React Flow custom node
// 

interface WorkflowNodeData {
  block: CanvasBlock;
  def: ModuleDef;
  status: BlockStatus;
  readOnly: boolean;
  onChange: (instanceId: string, config: BlockConfig) => void;
  onRemove: (instanceId: string) => void;
  [key: string]: unknown;
}

function WorkflowNode({ data }: NodeProps) {
  const { block, def, status, readOnly, onChange, onRemove } = data as WorkflowNodeData;
  const [ioOpen, setIoOpen] = useState(false);
  const Icon = def.icon;
  const ConfigRenderer = CONFIG_RENDERERS[block.type];
  const mainOutput = def.ports.out[0] ?? null;

  return (
    <div className="relative">

      {/* ── External status indicator — top-right, outside the card ── */}
      {status === 'active' && (
        <div className="absolute -top-8 right-0 z-10 pointer-events-none flex items-center gap-1.5 bg-surface border border-accent/40 rounded-full px-2.5 py-1 shadow-lg shadow-accent/10">
          <svg className="w-3 h-3 animate-spin shrink-0" viewBox="0 0 12 12" style={{ animationDuration: '0.8s' }}>
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent/20" />
            <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray="10 18" strokeLinecap="round" className="text-accent" />
          </svg>
          <span className="text-[10px] font-semibold text-accent whitespace-nowrap">En cours...</span>
        </div>
      )}
      {status === 'done' && (
        <div className="absolute -top-7 right-0 z-10 pointer-events-none flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 rounded-full px-2.5 py-1 shadow-sm">
          <Check size={10} className="text-green-400 shrink-0" strokeWidth={3} />
          <span className="text-[10px] font-semibold text-green-400 whitespace-nowrap">Terminé</span>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute -top-7 right-0 z-10 pointer-events-none flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-full px-2.5 py-1 shadow-sm">
          <X size={10} className="text-red-400 shrink-0" strokeWidth={3} />
          <span className="text-[10px] font-semibold text-red-400 whitespace-nowrap">Erreur</span>
        </div>
      )}

      {/* ── Card ── */}
      <div className={cn(
        'w-64 rounded-xl border shadow-md transition-all duration-300 group',
        status === 'idle'   && 'border-border bg-surface',
        status === 'active' && cn(def.accent.border, 'bg-surface'),
        status === 'done'   && 'border-green-500/30 bg-surface',
        status === 'error'  && 'border-red-500/30 bg-surface',
      )}>
        {/* Target handle — only when the module accepts inputs */}
        {def.ports.in.length > 0 && (
          <Handle
            type="target"
            position={Position.Top}
            style={{
              width: 16, height: 16,
              background: 'var(--surface)',
              border: '2px solid var(--accent)',
              borderRadius: '50%',
              cursor: 'crosshair',
              boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)',
            }}
          />
        )}

        {/* Header: icon + label + IO button + X */}
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', def.accent.bg)}>
            {status === 'active'
              ? <Loader2 size={14} className={cn('animate-spin', def.accent.text)} />
              : <Icon size={14} className={status === 'idle' ? 'text-text-muted/50' : def.accent.text} />
            }
          </div>
          <span className="flex-1 text-sm font-semibold text-text truncate leading-tight">{def.label}</span>

          {/* IO details toggle */}
          <button
            type="button"
            onClick={() => setIoOpen(v => !v)}
            className={cn(
              'p-1 rounded-md transition-all shrink-0 nodrag',
              ioOpen ? cn(def.accent.bg, def.accent.text) : 'text-text-muted/30 hover:text-text-muted',
            )}
          >
            <MoreVertical size={12}/>
          </button>

          {!readOnly && (
            <button type="button" onClick={() => onRemove(block.instanceId)}
              className="p-1 rounded-md text-text-muted/30 hover:text-red-400 transition-colors shrink-0 nodrag">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Main output pill — first out port (dynamic label for text-input) */}
        {mainOutput && (
          <div className="px-3.5 -mt-1 pb-3">
            <span className={cn(
              'inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full border',
              def.accent.bg, def.accent.text, def.accent.border,
            )}>
              <span className="font-mono opacity-50 text-[8px]">→</span>
              {block.type === 'text-input'
                ? (TEXT_INPUT_KEY_OPTIONS.find(o => o.value === block.config.outputKey)?.label ?? mainOutput.label)
                : mainOutput.label}
            </span>
          </div>
        )}

        {/* Config renderer */}
        {ConfigRenderer && (
          <div className={cn('px-3.5 pb-3 border-t pt-3', def.accent.border)}>
            <ConfigRenderer
              config={block.config}
              onChange={c => onChange(block.instanceId, c)}
              readOnly={readOnly}
            />
          </div>
        )}

        {/* Source handle */}
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            width: 16, height: 16,
            background: 'var(--surface)',
            border: '2px solid var(--accent)',
            borderRadius: '50%',
            cursor: 'crosshair',
            boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)',
          }}
        />
      </div>

      {/* ── IO Details Popup ── */}
      {ioOpen && (
        <div
          className="absolute left-[calc(100%+12px)] top-0 z-[200] w-56 bg-background border border-border rounded-xl shadow-2xl p-3.5 nodrag nopan"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className={cn('text-[9px] font-bold uppercase tracking-widest', def.accent.text)}>
              {def.label}
            </span>
            <button type="button" onClick={() => setIoOpen(false)}
              className="p-0.5 rounded text-text-muted/40 hover:text-text-muted transition-colors nodrag">
              <X size={10} />
            </button>
          </div>

          <p className="text-[10px] text-text-muted/60 leading-snug mb-3.5">{def.details}</p>

          {def.ports.in.length > 0 && (
            <div className="mb-3.5">
              <p className="text-[8px] font-bold uppercase tracking-widest text-text-muted/40 mb-2">Entrées</p>
              <div className="space-y-1.5">
                {def.ports.in.map(p => (
                  <div key={p.key} className="flex items-center gap-1.5">
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      p.required ? 'bg-red-400/70' : 'bg-text-muted/20',
                    )} />
                    <span className="text-[9px] font-mono text-text-muted/80 flex-1 truncate">{p.key}</span>
                    <span className="text-[8px] text-text-muted/40 shrink-0 truncate max-w-[90px] text-right">{p.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {def.ports.out.length > 0 && (
            <div>
              <p className="text-[8px] font-bold uppercase tracking-widest text-text-muted/40 mb-2">Sorties</p>
              <div className="space-y-1.5">
                {def.ports.out.map(p => (
                  <div key={p.key} className={cn('flex items-center gap-1.5', def.accent.text)}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-70" />
                    <span className="text-[9px] font-mono flex-1 truncate">{p.key}</span>
                    <span className="text-[8px] opacity-40 shrink-0 truncate max-w-[90px] text-right">{p.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

//
// Deletable edge
//

function DeletableEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  style, markerEnd, animated,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  const onEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setHovered(true);
  };
  const onLeave = () => {
    // Short delay so moving from path → button doesn't close the label
    leaveTimer.current = setTimeout(() => setHovered(false), 80);
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd as string | undefined} className={animated ? 'animated' : ''} />
      {/* Wide invisible hit-area on top of BaseEdge to catch hover events */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        strokeOpacity={0}
        style={{ cursor: 'pointer', pointerEvents: 'all' }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? 'all' : 'none',
            transition: 'opacity 0.12s',
          }}
          className="absolute nopan"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <button
            type="button"
            onClick={() => {
              const event = new CustomEvent('delete-edge', { detail: { id } });
              window.dispatchEvent(event);
            }}
            className="w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center
              hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400
              text-text-muted transition-all duration-150 shadow-sm"
          >
            <X size={10} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

//
// Trigger node  (source only — no incoming connections)
//

function TriggerNode({ data }: NodeProps) {
  const { block, def, readOnly, onRemove } = data as WorkflowNodeData;
  return (
    <div className="relative w-64 rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 shadow-lg shadow-amber-500/10 group">
      {/* No target handle — triggers have no input */}

      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
          <Zap size={16} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[8px] font-bold uppercase tracking-widest text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded">
              Trigger
            </span>
          </div>
          <p className="text-sm font-semibold text-text leading-tight">{def.label}</p>
          <p className="text-[10px] text-text-muted mt-0.5">{def.description}</p>
        </div>
        {!readOnly && (
          <button type="button" onClick={() => onRemove(block.instanceId)}
            className="p-1 rounded opacity-0 group-hover:opacity-100 text-text-muted/40 hover:text-red-400 transition-all shrink-0 nodrag">
            <X size={13} />
          </button>
        )}
      </div>

      {/* source handle only */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 16,
          height: 16,
          background: 'var(--surface)',
          border: '2px solid var(--accent)',
          borderRadius: '50%',
          cursor: 'crosshair',
          boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)',
        }}
      />
    </div>
  );
}

const nodeTypes = { workflowNode: WorkflowNode, triggerNode: TriggerNode };
const edgeTypes = { deletable: DeletableEdge };

// 
// Palette card
// 

function PaletteCard({ def, disabled, onAdd }: { def: ModuleDef; disabled: boolean; onAdd: () => void }) {
  const Icon = def.icon;
  return (
    <div className={cn('relative flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-150 group/card',
      disabled
        ? 'border-border/30 bg-surface/20 opacity-40 cursor-not-allowed'
        : 'border-border/50 bg-surface/30 hover:border-border hover:bg-surface/60 cursor-pointer')}
      onClick={!disabled ? onAdd : undefined}>
      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform', def.accent.bg,
        !disabled && 'group-hover/card:scale-105')}>
        <Icon size={13} className={def.accent.text} />
      </div>
      <p className="flex-1 text-xs font-semibold text-text truncate">{def.label}</p>
      {!disabled && (
        <div className="relative shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity group/info"
          onClick={e => e.stopPropagation()}>
          <Info size={13} className="text-text-muted/50 hover:text-text-muted cursor-default" />
          <div className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 w-52
            opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible
            transition-all duration-150 z-50">
            <div className="bg-background border border-border rounded-lg p-3 shadow-xl">
              <p className={cn('text-[9px] font-bold uppercase tracking-wider mb-1.5', def.accent.text)}>{def.label}</p>
              <p className="text-[10px] font-mono text-text-muted mb-1.5">{def.description}</p>
              <p className="text-[10px] text-text-muted/70 leading-snug">{def.details}</p>
            </div>
          </div>
        </div>
      )}
      {!disabled && (
        <span className={cn('shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity text-lg leading-none font-light', def.accent.text)}>+</span>
      )}
    </div>
  );
}

// 
// Default graph (5 nodes pre-wired in sequence)
// 

const TRIGGER_TYPE = 'trigger-manual';
const DEFAULT_MODULE_TYPES = [
  'keyword-research',
  'serp-analysis',
  'semantic-extraction',
  'content-generation',
  'webflow-publish',
];
const ALL_DEFAULT_TYPES = [TRIGGER_TYPE, ...DEFAULT_MODULE_TYPES];
const NODE_GAP = 230;
const noop = () => {};

const EDGE_STYLE = { stroke: 'var(--accent)', strokeWidth: 1.5, opacity: 0.5 };
const EDGE_STYLE_RUNNING = { stroke: 'var(--accent)', strokeWidth: 2, opacity: 0.9 };
const MARKER_END = { type: MarkerType.ArrowClosed, color: 'var(--accent)' };

function getRfNodeType(type: string) {
  const def = MODULE_CATALOG.find(m => m.type === type);
  return def?.category === 'trigger' ? 'triggerNode' : 'workflowNode';
}

const INITIAL_NODES: Node[] = ALL_DEFAULT_TYPES.map((type, i) => {
  const def = MODULE_CATALOG.find(m => m.type === type)!;
  const instanceId = `default-${type}-${i}`;
  return {
    id: instanceId,
    type: getRfNodeType(type),
    position: { x: 0, y: i * NODE_GAP },
    data: {
      block: { instanceId, type, config: { ...def.defaultConfig } },
      def,
      status: 'idle' as BlockStatus,
      readOnly: false,
      onChange: noop,
      onRemove: noop,
    } as WorkflowNodeData,
    draggable: true,
  };
});

const INITIAL_EDGES: Edge[] = ALL_DEFAULT_TYPES.slice(0, -1).map((type, i) => ({
  id: `e-init-${i}`,
  source: `default-${type}-${i}`,
  target: `default-${ALL_DEFAULT_TYPES[i + 1]}-${i + 1}`,
  type: 'deletable',
  animated: false,
  style: EDGE_STYLE,
  markerEnd: MARKER_END,
}));

//
// Helpers — build RF nodes/edges from saved CanvasBlocks
//

function blocksToNodes(blocks: CanvasBlock[]): Node[] {
  return blocks
    .map((block, i) => {
      const def = MODULE_CATALOG.find(m => m.type === block.type);
      if (!def) return null;
      return {
        id: block.instanceId,
        type: getRfNodeType(block.type),
        position: { x: 0, y: i * NODE_GAP },
        data: {
          block,
          def,
          status: 'idle' as BlockStatus,
          readOnly: false,
          onChange: noop,
          onRemove: noop,
        } as WorkflowNodeData,
        draggable: true,
      };
    })
    .filter(Boolean) as Node[];
}

function blocksToEdges(nodes: Node[]): Edge[] {
  return nodes.slice(0, -1).map((_, i) => ({
    id: `e-loaded-${i}`,
    source: nodes[i].id,
    target: nodes[i + 1].id,
    type: 'deletable',
    animated: false,
    style: EDGE_STYLE,
    markerEnd: MARKER_END,
  }));
}

//
// WorkflowEditor
//

export interface SavedEdge {
  source: string;
  target: string;
}

export interface WorkflowEditorProps {
  isRunning: boolean;
  events: LogEvent[];
  onRun: (blocks: CanvasBlock[]) => void;
  onReset: () => void;
  monitoring?: React.ReactNode;
  /** Pre-load these blocks on mount (overrides the default pipeline). Pass [] for empty canvas. */
  initialBlocks?: CanvasBlock[];
  /** Pre-load these edges on mount. When provided, replaces auto-wiring from blocksToEdges. */
  initialEdges?: SavedEdge[];
  /** If provided, a Save button appears in the palette. */
  onSave?: (blocks: CanvasBlock[], edges: SavedEdge[]) => Promise<void>;
}

export default function WorkflowEditor({ isRunning, events, onRun, onReset, onSave, initialBlocks, initialEdges }: WorkflowEditorProps) {
  const startNodes = initialBlocks !== undefined ? blocksToNodes(initialBlocks) : INITIAL_NODES;
  const startEdges = initialEdges !== undefined
    ? initialEdges.map((e, i) => ({
        id: `e-saved-${i}`,
        source: e.source,
        target: e.target,
        type: 'deletable' as const,
        animated: false,
        style: EDGE_STYLE,
        markerEnd: MARKER_END,
      }))
    : initialBlocks !== undefined
      ? blocksToEdges(startNodes)
      : INITIAL_EDGES;

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(startNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(startEdges);
  const [isSaving, setIsSaving] = useState(false);

  // Stable config + remove callbacks
  const handleChangeConfig = useCallback((instanceId: string, config: BlockConfig) => {
    setRfNodes(prev => prev.map(n =>
      n.id !== instanceId ? n : { ...n, data: { ...n.data, block: { ...(n.data as WorkflowNodeData).block, config } } }
    ));
  }, [setRfNodes]);

  const handleRemove = useCallback((instanceId: string) => {
    setRfNodes(prev => prev.filter(n => n.id !== instanceId));
    setRfEdges(prev => prev.filter(e => e.source !== instanceId && e.target !== instanceId));
  }, [setRfNodes, setRfEdges]);

  // Delete edge via custom event (from DeletableEdge button)
  useEffect(() => {
    const handler = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      setRfEdges(prev => prev.filter(edge => edge.id !== id));
    };
    window.addEventListener('delete-edge', handler);
    return () => window.removeEventListener('delete-edge', handler);
  }, [setRfEdges]);

  // Inject callbacks + update status/visibility whenever deps change
  useEffect(() => {
    console.log(`[WorkflowEditor] status update — isRunning: ${isRunning} | events: ${events.length}`);
    setRfNodes(prev => prev.map(n => {
      const blockType = (n.data as WorkflowNodeData).block.type;
      const status = (isRunning || events.length > 0) ? getBlockStatus(blockType, events) : 'idle';
      console.log(`[WorkflowEditor] node "${blockType}" → status: ${status}`);
      return {
        ...n,
        data: {
          ...n.data,
          onChange: handleChangeConfig,
          onRemove: handleRemove,
          status,
          readOnly: isRunning,
        },
      };
    }));
    setRfEdges(prev => prev.map(e => ({
      ...e,
      animated: isRunning,
      style: isRunning ? EDGE_STYLE_RUNNING : EDGE_STYLE,
      markerEnd: MARKER_END,
    })));
  }, [handleChangeConfig, handleRemove, events, isRunning, setRfNodes, setRfEdges]);

  const onConnect = useCallback((params: Connection) => {
    setRfEdges(eds => addEdge({
      ...params,
      type: 'deletable',
      style: EDGE_STYLE,
      markerEnd: MARKER_END,
    }, eds));
  }, [setRfEdges]);

  function addBlock(type: string) {
    const def = MODULE_CATALOG.find(m => m.type === type);
    if (!def) return;
    const instanceId = `${type}-${Date.now()}`;
    setRfNodes(prev => {
      const visibleNodes = prev.filter(n => !n.hidden);
      const last = visibleNodes.length > 0
        ? visibleNodes.reduce((b, n) => n.position.y > b.position.y ? n : b)
        : null;
      const pos = last ? { x: last.position.x + 40, y: last.position.y + NODE_GAP } : { x: 0, y: 0 };
      return [...prev, {
        id: instanceId,
        type: getRfNodeType(type),
        position: pos,
        data: {
          block: { instanceId, type, config: { ...def.defaultConfig } },
          def,
          status: 'idle' as BlockStatus,
          readOnly: isRunning,
          onChange: handleChangeConfig,
          onRemove: handleRemove,
        } as WorkflowNodeData,
        draggable: true,
      }];
    });
  }

  const usedTypes = new Set(rfNodes.map(n => (n.data as WorkflowNodeData).block.type));
  const paletteTriggers = MODULE_CATALOG.filter(m => m.category === 'trigger');
  const paletteInputs   = MODULE_CATALOG.filter(m => m.category === 'input');
  const paletteModules  = MODULE_CATALOG.filter(m => m.category !== 'trigger' && m.category !== 'input');
  const visibleCount = rfNodes.length;
  const blocks = rfNodes.map(n => (n.data as WorkflowNodeData).block);

  return (
    <div className="flex gap-6 items-start">

      {/* Palette */}
      <div className="w-60 shrink-0 sticky top-6 space-y-2">

        {/* Triggers */}
        <div className="flex items-center gap-2 px-0.5 mb-2">
          <Zap size={9} className="text-amber-400/60" />
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-400/60">Déclencheurs</p>
        </div>
        {paletteTriggers.map(def => (
          <PaletteCard
            key={def.type}
            def={def}
            disabled={isRunning || (!!def.unique && usedTypes.has(def.type))}
            onAdd={() => addBlock(def.type)}
          />
        ))}

        {paletteInputs.length > 0 && (
          <div className="border-t border-border/40 pt-3 mt-3">
            <div className="flex items-center gap-2 px-0.5 mb-2">
              <Type size={9} className="text-slate-400/60" />
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400/60">Entrées</p>
            </div>
            {paletteInputs.map(def => (
              <PaletteCard
                key={def.type}
                def={def}
                disabled={isRunning || (!!def.unique && usedTypes.has(def.type))}
                onAdd={() => addBlock(def.type)}
              />
            ))}
          </div>
        )}

        <div className="border-t border-border/40 pt-3 mt-3">
          <div className="flex items-center justify-between px-0.5 mb-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-text-muted">Modules</p>
            <span className="text-[9px] text-text-muted/40">{paletteModules.length}</span>
          </div>
        </div>

        {paletteModules.map(def => (
          <PaletteCard
            key={def.type}
            def={def}
            disabled={isRunning || (!!def.unique && usedTypes.has(def.type))}
            onAdd={() => addBlock(def.type)}
          />
        ))}

        <div className="pt-2 space-y-2">
          {onSave && !isRunning && (
            <button
              type="button"
              disabled={isSaving || visibleCount === 0}
              onClick={async () => {
                setIsSaving(true);
                try { await onSave(blocks, rfEdges.map(e => ({ source: e.source, target: e.target }))); } finally { setIsSaving(false); }
              }}
              className="w-full py-2 flex items-center justify-center gap-2 rounded-xl border border-border text-xs font-semibold text-text-muted hover:text-text hover:border-accent/30 transition-all disabled:opacity-40 uppercase tracking-widest"
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Sauvegarder
            </button>
          )}
          {!isRunning ? (
            <button type="button" disabled={visibleCount === 0}
              onClick={() => onRun(blocks)}
              className="w-full py-2.5 flex items-center justify-center gap-2 rounded-xl text-xs font-semibold uppercase tracking-widest transition-all btn-accent disabled:opacity-40">
              <Play size={14} />
              Lancer le workflow
            </button>
          ) : (
            <div className="w-full py-2.5 flex items-center justify-center gap-2 rounded-xl bg-accent/5 border border-accent/20 text-accent text-xs font-semibold">
              <Spinner className="w-4 h-4" />
              Traitement en cours...
            </div>
          )}
          {events.length > 0 && !isRunning && (
            <button type="button" onClick={onReset}
              className="w-full py-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-border text-[10px] font-semibold text-text-muted hover:text-error hover:border-error/20 transition-colors uppercase tracking-wider">
              <RefreshCw size={11} />
              Reinitialiser
            </button>
          )}
        </div>

        <p className="text-[9px] text-text-muted/30 text-center pt-2 leading-relaxed">
          Glissez les blocs · Tirez les ronds pour connecter · Suppr pour effacer
        </p>
      </div>

      {/* React Flow canvas */}
      <div className="flex-1 min-w-0 rounded-xl border border-border overflow-hidden" style={{ height: 680 }}>
        {visibleCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center bg-surface/20">
            <p className="text-sm font-semibold text-text-muted/50 mb-1">Canvas vide</p>
            <p className="text-[11px] text-text-muted/30">Ajoutez un module depuis la palette</p>
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.35 }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={['Backspace', 'Delete']}
            connectionRadius={40}
            snapToGrid
            snapGrid={[16, 16]}
            connectionLineStyle={{ stroke: 'var(--accent)', strokeWidth: 2, strokeDasharray: '6 3' }}
            className="bg-background"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
            <Controls showInteractive={false}
              className="!border-border !bg-surface !shadow-none [&>button]:!bg-surface [&>button]:!border-border [&>button]:!text-text-muted" />
            <MiniMap nodeStrokeWidth={0} nodeColor={() => 'var(--surface)'}
              maskColor="rgba(0,0,0,0.3)" className="!bg-background !border-border" />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
