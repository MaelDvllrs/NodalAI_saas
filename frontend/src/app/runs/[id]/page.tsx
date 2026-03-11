'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/AppLayout';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Loader2, Clock,
  Search, TrendingUp, Layers, Sparkles, Rocket, Globe,
  MousePointerClick, Zap, ExternalLink, BarChart2,
} from 'lucide-react';
import { Skeleton } from '../../components/UI';
import { cn } from '../../utils/cn';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface WorkflowRun {
  id: string;
  workflow_id: string | null;
  project_id: string | null;
  status: 'running' | 'done' | 'error';
  created_at: string;
  workflows: { name: string } | null;
  sites: { name: string } | null;
}

interface RunStep {
  id: string;
  workflow_run_id: string;
  module_type: string;
  step_index: number;
  status: 'done' | 'error' | 'skipped';
  result_json: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

// ─── Module meta ──────────────────────────────────────────────────────────────

const MODULE_META: Record<string, { label: string; icon: React.ElementType; accent: string }> = {
  'trigger-manual':      { label: 'Déclencheur',            icon: MousePointerClick, accent: 'text-amber-400' },
  'website-scraper':     { label: 'Scraping de site',        icon: Globe,             accent: 'text-cyan-400' },
  'keyword-research':    { label: 'Recherche mots-clés',    icon: Search,            accent: 'text-blue-400' },
  'serp-analysis':       { label: 'Analyse SERP',            icon: TrendingUp,        accent: 'text-violet-400' },
  'semantic-extraction': { label: 'Extraction sémantique',  icon: Layers,            accent: 'text-green-400' },
  'content-generation':  { label: 'Génération de contenu',  icon: Sparkles,          accent: 'text-accent' },
  'webflow-publish':     { label: 'Publication Webflow',     icon: Rocket,            accent: 'text-orange-400' },
};

function getModuleMeta(type: string) {
  return MODULE_META[type] ?? { label: type, icon: Zap, accent: 'text-text-muted' };
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StepStatusIcon({ status }: { status: RunStep['status'] }) {
  if (status === 'done')    return <CheckCircle2 size={14} className="text-green-400 shrink-0" />;
  if (status === 'error')   return <AlertCircle size={14} className="text-red-400 shrink-0" />;
  return <Clock size={14} className="text-text-muted shrink-0" />;
}

// ─── Result renderers ─────────────────────────────────────────────────────────

function JsonViewer({ data }: { data: unknown }) {
  return (
    <pre className="text-[11px] font-mono text-text-muted/80 bg-background rounded-lg p-4 overflow-auto max-h-[600px] leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function KeywordResult({ data }: { data: Record<string, unknown> }) {
  const kw = data.mainKeyword as string ?? data.directKeyword as string ?? '—';
  const kd = data.kd as number | null;
  const vol = data.kwSearchVolume as number | null;
  const secondary = data.secondaryKeywords as string[] ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2.5">
          <Search size={16} className="text-blue-400" />
          <span className="font-bold text-lg text-text">{kw}</span>
        </div>
        {kd != null && (
          <div className="bg-background border border-border rounded-lg px-3 py-2 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">KD</p>
            <p className="text-lg font-bold text-text">{kd}</p>
          </div>
        )}
        {vol != null && (
          <div className="bg-background border border-border rounded-lg px-3 py-2 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Volume</p>
            <p className="text-lg font-bold text-text">{vol.toLocaleString('fr-FR')}</p>
          </div>
        )}
      </div>
      {secondary.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-2">Mots-clés secondaires</p>
          <div className="flex flex-wrap gap-1.5">
            {secondary.slice(0, 20).map((kw, i) => (
              <span key={i} className="text-xs bg-blue-500/5 border border-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-mono">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SerpResult({ data }: { data: Record<string, unknown> }) {
  const results = (data.serpResults as { url?: string; title?: string; description?: string; position?: number }[]) ?? [];
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">{results.length} résultats SERP</p>
      {results.slice(0, 15).map((r, i) => (
        <div key={i} className="bg-background border border-border rounded-lg p-3 flex items-start gap-3">
          <span className="text-[10px] font-bold text-text-muted/40 w-5 shrink-0 mt-0.5">{r.position ?? i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text truncate">{r.title ?? '—'}</p>
            <p className="text-[10px] text-text-muted font-mono truncate mt-0.5">{r.url}</p>
            {r.description && (
              <p className="text-xs text-text-muted/70 mt-1 line-clamp-2">{r.description}</p>
            )}
          </div>
          {r.url && (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-text-muted/40 hover:text-accent shrink-0 mt-0.5">
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function SemanticResult({ data }: { data: Record<string, unknown> }) {
  const analysis = (data.semanticAnalysis as Record<string, unknown>) ?? data;
  const primary = (analysis.primaryTerms as string[]) ?? [];
  const secondary = (analysis.secondaryTerms as string[]) ?? [];
  const entities = (analysis.entities as string[]) ?? [];
  const gaps = (analysis.contentGaps as string[]) ?? [];

  function TermPills({ terms, color }: { terms: string[]; color: string }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {terms.slice(0, 30).map((t, i) => (
          <span key={i} className={cn('text-xs px-2 py-0.5 rounded-full border font-mono', color)}>
            {t}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {primary.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-green-400/70 mb-2">Termes primaires ({primary.length})</p>
          <TermPills terms={primary} color="bg-green-500/5 border-green-500/20 text-green-300" />
        </div>
      )}
      {secondary.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-2">Termes secondaires ({secondary.length})</p>
          <TermPills terms={secondary} color="bg-background border-border text-text-muted" />
        </div>
      )}
      {entities.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400/70 mb-2">Entités ({entities.length})</p>
          <TermPills terms={entities} color="bg-violet-500/5 border-violet-500/20 text-violet-300" />
        </div>
      )}
      {gaps.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400/70 mb-2">Lacunes de contenu ({gaps.length})</p>
          <TermPills terms={gaps} color="bg-amber-500/5 border-amber-500/20 text-amber-300" />
        </div>
      )}
    </div>
  );
}

function ContentResult({ data }: { data: Record<string, unknown> }) {
  const [tab, setTab] = useState<'meta' | 'html'>('meta');
  const fieldData = (data.fieldData as Record<string, unknown>) ?? {};
  const htmlBody = (data.htmlBody as string) ?? (fieldData['body'] as string) ?? '';
  const title = (fieldData['title'] as string) ?? (data.title as string) ?? '—';
  const metaTitle = (fieldData['meta-title'] as string) ?? (fieldData['metaTitle'] as string) ?? '—';
  const metaDesc = (fieldData['meta-description'] as string) ?? (fieldData['metaDescription'] as string) ?? '—';

  return (
    <div className="space-y-4">
      <div className="p-0.5 bg-background rounded-lg flex w-fit">
        {(['meta', 'html'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all',
              tab === t ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text')}>
            {t === 'meta' ? 'Métadonnées' : 'HTML'}
          </button>
        ))}
      </div>
      {tab === 'meta' ? (
        <div className="space-y-3">
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Titre</p>
            <p className="text-sm font-semibold text-text">{title}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Meta Title</p>
            <p className="text-sm text-text">{metaTitle}</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Meta Description</p>
            <p className="text-sm text-text">{metaDesc}</p>
          </div>
        </div>
      ) : (
        <pre className="text-[11px] font-mono text-text-muted/70 bg-background rounded-lg p-4 overflow-auto max-h-[500px] leading-relaxed whitespace-pre-wrap break-words">
          {htmlBody || '(aucun contenu HTML)'}
        </pre>
      )}
    </div>
  );
}

function WebflowResult({ data }: { data: Record<string, unknown> }) {
  const itemId = data.webflowItemId as string ?? '—';
  const itemUrl = data.webflowItemUrl as string ?? null;
  return (
    <div className="space-y-3">
      <div className="bg-background border border-border rounded-lg p-4 flex items-center gap-3">
        <Rocket size={18} className="text-orange-400 shrink-0" />
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-0.5">Item ID Webflow</p>
          <p className="text-sm font-mono text-text">{itemId}</p>
        </div>
      </div>
      {itemUrl && (
        <a href={itemUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-accent hover:underline">
          <ExternalLink size={14} />
          Voir l'article publié
        </a>
      )}
    </div>
  );
}

function ScraperResult({ data }: { data: Record<string, unknown> }) {
  const profile = (data.siteProfile as Record<string, unknown>) ?? data;
  const theme = profile.theme as string ?? '—';
  const tone = profile.tone as string ?? '—';
  const topics = (profile.mainTopics as string[]) ?? (profile.topics as string[]) ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-background border border-border rounded-lg p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Thème</p>
          <p className="text-sm font-semibold text-text">{theme}</p>
        </div>
        <div className="bg-background border border-border rounded-lg p-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Ton</p>
          <p className="text-sm font-semibold text-text">{tone}</p>
        </div>
      </div>
      {topics.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted mb-2">Sujets détectés</p>
          <div className="flex flex-wrap gap-1.5">
            {topics.slice(0, 20).map((t, i) => (
              <span key={i} className="text-xs bg-cyan-500/5 border border-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepResult({ step }: { step: RunStep }) {
  if (step.status === 'error') {
    return (
      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle size={16} className="text-red-400" />
          <span className="text-sm font-bold text-red-400">Erreur</span>
        </div>
        <p className="text-sm text-text-muted font-mono">{step.error_message ?? 'Erreur inconnue'}</p>
      </div>
    );
  }

  if (!step.result_json) {
    return <p className="text-sm text-text-muted italic">Aucun résultat disponible.</p>;
  }

  const data = step.result_json as Record<string, unknown>;

  switch (step.module_type) {
    case 'keyword-research':    return <KeywordResult data={data} />;
    case 'serp-analysis':       return <SerpResult data={data} />;
    case 'semantic-extraction': return <SemanticResult data={data} />;
    case 'content-generation':  return <ContentResult data={data} />;
    case 'webflow-publish':     return <WebflowResult data={data} />;
    case 'website-scraper':     return <ScraperResult data={data} />;
    default:                    return <JsonViewer data={data} />;
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

function RunDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState<RunStep | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    Promise.all([
      fetch(`${API_URL}/workflow/runs/${id}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_URL}/workflow/runs/${id}/steps`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([runData, stepsData]) => {
        setRun(runData);
        const sortedSteps = Array.isArray(stepsData) ? stepsData.sort((a: RunStep, b: RunStep) => a.step_index - b.step_index) : [];
        setSteps(sortedSteps);
        if (sortedSteps.length > 0) setSelectedStep(sortedSteps[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-[1400px] mx-auto py-8 px-6">
          <Skeleton className="h-4 w-40 mb-6" />
          <Skeleton className="h-8 w-64 mb-8" />
          <div className="flex gap-6">
            <Skeleton className="w-64 h-[500px] rounded-xl shrink-0" />
            <Skeleton className="flex-1 h-[500px] rounded-xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  const statusColor = run?.status === 'done' ? 'text-green-400' : run?.status === 'error' ? 'text-red-400' : 'text-accent';

  return (
    <AppLayout>
      <div className="max-w-[1400px] mx-auto py-8 px-6">
        {/* Header */}
        <Link href="/runs" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text mb-5 transition-colors">
          <ArrowLeft size={14} />
          Retour à l'historique
        </Link>
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">
              {run?.workflows?.name ?? 'Exécution'}
            </h1>
            <div className="flex items-center gap-3 text-sm text-text-muted">
              {run?.sites?.name && <span>{run.sites.name}</span>}
              {run?.sites?.name && <span>·</span>}
              <Clock size={13} />
              <span>{run ? new Date(run.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
              {run?.status && <span className={cn('font-semibold', statusColor)}>· {run.status === 'done' ? 'Terminé' : run.status === 'error' ? 'Erreur' : 'En cours'}</span>}
            </div>
          </div>
        </div>

        {steps.length === 0 ? (
          <div className="bg-surface border border-dashed border-border rounded-xl p-16 text-center">
            <p className="text-text-muted">Aucun module enregistré pour cette exécution.</p>
          </div>
        ) : (
          <div className="flex gap-6 items-start">
            {/* Module list */}
            <div className="w-64 shrink-0 bg-surface border border-border rounded-xl overflow-hidden sticky top-6">
              <div className="px-4 py-3 border-b border-border bg-background/50">
                <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Modules exécutés</p>
              </div>
              <div className="py-1">
                {steps.map((step) => {
                  const meta = getModuleMeta(step.module_type);
                  const Icon = meta.icon;
                  const isSelected = selectedStep?.id === step.id;
                  return (
                    <button
                      key={step.id}
                      onClick={() => setSelectedStep(step)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        isSelected ? 'bg-accent/10' : 'hover:bg-background/60'
                      )}
                    >
                      <Icon size={14} className={cn(meta.accent, 'shrink-0')} />
                      <span className={cn('flex-1 text-xs font-medium truncate', isSelected ? 'text-text' : 'text-text-muted')}>
                        {meta.label}
                      </span>
                      <StepStatusIcon status={step.status} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Result panel */}
            <div className="flex-1 min-w-0 bg-surface border border-border rounded-xl overflow-hidden">
              {selectedStep ? (
                <>
                  <div className="px-5 py-4 border-b border-border bg-background/50 flex items-center gap-3">
                    {(() => {
                      const meta = getModuleMeta(selectedStep.module_type);
                      const Icon = meta.icon;
                      return (
                        <>
                          <Icon size={16} className={meta.accent} />
                          <h2 className="font-bold text-text">{meta.label}</h2>
                          <StepStatusIcon status={selectedStep.status} />
                        </>
                      );
                    })()}
                  </div>
                  <div className="p-5">
                    <StepResult step={selectedStep} />
                  </div>
                </>
              ) : (
                <div className="p-10 text-center text-text-muted text-sm">
                  Sélectionnez un module pour voir ses résultats.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function RunDetailPage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="max-w-[1400px] mx-auto py-8 px-6">
          <Skeleton className="h-4 w-40 mb-6" />
          <Skeleton className="h-8 w-64 mb-8" />
          <div className="flex gap-6">
            <Skeleton className="w-64 h-[500px] rounded-xl shrink-0" />
            <Skeleton className="flex-1 h-[500px] rounded-xl" />
          </div>
        </div>
      </AppLayout>
    }>
      <RunDetailContent />
    </Suspense>
  );
}
