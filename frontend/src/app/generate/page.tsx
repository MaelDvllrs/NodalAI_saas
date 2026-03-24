'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import AppLayout from '../components/AppLayout';
import { Plus, Trash2, Layers, Clock, X, Loader2, MoreVertical, ExternalLink, History, Download, Upload, Terminal } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '../components/UI';
import { MODULE_CATALOG } from '../components/WorkflowEditor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Workflow {
  id: string;
  name: string;
  project_id: string | null;
  workflow_json: { steps: { type: string; config: Record<string, unknown> }[] };
  created_at: string;
  updated_at: string;
}

interface PublicWorkflow {
  id: string;
  name: string;
  description: string | null;
  workflow_json: { steps: { type: string; config: Record<string, unknown> }[]; edges?: { source: string; target: string }[] };
  created_at: string;
  creator: { id: string; email: string | null; initials: string };
}

// ─── Workflow Module Icons ───────────────────────────────────────────────────

// Composant pour afficher les logos des modules en cercles imbriqués
function WorkflowModuleIcons({ steps }: { steps: { type: string; config: Record<string, unknown> }[] }) {
  // Mapping des modules vers leurs logos de marque (dédupliqués par marque)
  const MODULE_TO_BRAND: Record<string, string> = {
    'serp-analysis':        'google',
    'webflow-structure':    'webflow',
    'webflow-publish':      'webflow',
    'chatgpt-analysis':     'chatgpt',
    'gemini-analysis':      'gemini',
    'perplexity-analysis':  'perplexity',
    'reddit-analyzer':      'reddit',
  };
  
  // Extraire les marques uniques utilisées dans le workflow
  const brands = Array.from(
    new Set(
      steps
        .map(s => MODULE_TO_BRAND[s.type])
        .filter(Boolean)
    )
  );
  
  // Mapper chaque marque vers son premier module correspondant pour obtenir l'icône
  const modules = brands
    .map(brand => {
      // Trouver le premier type de module qui correspond à cette marque
      const type = Object.keys(MODULE_TO_BRAND).find(t => MODULE_TO_BRAND[t] === brand);
      return type ? MODULE_CATALOG.find(m => m.type === type) : null;
    })
    .filter((m): m is NonNullable<typeof m> => !!m)
    .slice(0, 4); // Max 4 icônes

  if (modules.length === 0) {
    return (
      <div className="p-2 bg-accent/10 rounded-lg shrink-0">
        <Layers className="text-accent" size={18} />
      </div>
    );
  }

  return (
    <div className="flex items-start shrink-0">
      {modules.map((mod, i) => {
        const Icon = mod.icon;
        const textColor = mod.accent.text;
        
        return (
          <div
            key={mod.type}
            className={`flex items-center justify-center w-5 h-5 rounded-full  bg-background ${i > 0 ? '-ml-1' : ''}`}
            style={{ zIndex: modules.length - i }}
            title={mod.label}
          >
            <Icon size={11} className={textColor} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Create modal ────────────────────────────────────────────────────────────

function CreateWorkflowModal({ onClose, onCreate, initialImport, initialName }: {
  onClose: () => void;
  onCreate: (name: string, workflowJson?: { steps: unknown[]; edges?: unknown[] }) => Promise<void>;
  initialImport?: { steps: unknown[]; edges?: unknown[] };
  initialName?: string;
}) {
  const [name, setName] = useState(initialName ?? '');
  const [loading, setLoading] = useState(false);
  const [importedJson, setImportedJson] = useState<{ steps: unknown[]; edges?: unknown[] } | null>(initialImport ?? null);
  const [importError, setImportError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const wf = parsed.workflowJson ?? parsed;
        if (!Array.isArray(wf.steps)) throw new Error('Format invalide');
        setImportedJson({ steps: wf.steps, edges: wf.edges });
        setImportError('');
        if (!name.trim() && parsed.name) setName(parsed.name);
      } catch {
        setImportError('Fichier JSON invalide ou format incorrect.');
        setImportedJson(null);
      }
    };
    reader.readAsText(file);
    // reset so re-selecting same file triggers onChange
    e.target.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try { await onCreate(trimmed, importedJson ?? undefined); } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative z-10 bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">Nouveau workflow</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">Nom du workflow</label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Blog SEO complet, Pipeline rapide..."
              className="input-base w-full"
              maxLength={80}
            />
          </div>

          {/* Import JSON */}
          <div>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed border-border text-sm text-text-muted hover:border-accent/50 hover:text-accent transition-colors"
            >
              <Upload size={13} />
              {importedJson ? `${importedJson.steps.length} modules importés` : 'Importer depuis un fichier JSON'}
            </button>
            {importError && <p className="mt-1 text-xs text-red-400">{importError}</p>}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="btn-primary flex-1 gap-2 disabled:opacity-40"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Workflow card ───────────────────────────────────────────────────────────

function WorkflowCard({ workflow, onDelete }: { workflow: Workflow; onDelete: (id: string) => void }) {
  const router = useRouter();
  const steps = workflow.workflow_json?.steps ?? [];
  const stepCount = steps.length;
  const updatedAt = new Date(workflow.updated_at).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  function handleExport(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    const data = { name: workflow.name, workflowJson: workflow.workflow_json };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Link
      href={`/generate/builder?workflowId=${workflow.id}`}
      className="bg-card border border-border rounded-lg p-4 flex flex-col gap-4 hover:border-accent/40 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2">
          <WorkflowModuleIcons steps={steps} />
          <div>
            <h3 className="font-semibold text-text leading-tight">{workflow.name}</h3>
            <div className="flex items-center gap-1 mt-1 text-xs text-text-muted">
              <Layers size={11} />
              <span>{stepCount} module{stepCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* 3-dot menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(v => !v); }}
            className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-bg transition-colors"
          >
            <MoreVertical size={15} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-50 w-52 bg-surface border border-border rounded-xl shadow-xl py-1 animate-fade-in"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <button
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text hover:bg-bg transition-colors"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); router.push(`/generate/builder?workflowId=${workflow.id}`); }}
              >
                <ExternalLink size={13} className="text-text-muted" />
                Ouvrir le workflow
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text hover:bg-bg transition-colors"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); localStorage.setItem('runs_filters', JSON.stringify({ workflowId: workflow.id, status: '', sort: 'desc' })); router.push('/runs'); }}
              >
                <History size={13} className="text-text-muted" />
                Voir les exécutions
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-text hover:bg-bg transition-colors"
                onClick={handleExport}
              >
                <Download size={13} className="text-text-muted" />
                Exporter en JSON
              </button>
              <div className="border-t border-border my-1" />
              <button
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); onDelete(workflow.id); }}
              >
                <Trash2 size={13} />
                Supprimer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-2 border-t border-border flex items-center gap-1 text-xs text-text-muted">
        <Clock size={11} />
        <span>{updatedAt}</span>
      </div>
    </Link>
  );
}

// ─── Template card ──────────────────────────────────────────────────────────

function TemplateCard({ template, onUse }: { template: PublicWorkflow; onUse: (t: PublicWorkflow) => void }) {
  const stepCount = template.workflow_json?.steps?.length ?? 0;
  return (
    <button
      type="button"
      onClick={() => onUse(template)}
      className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 text-left hover:border-accent/40 transition-colors w-full"
    >
      <div className="flex items-start gap-3">
        <WorkflowModuleIcons steps={template.workflow_json?.steps ?? []} />
        <div className="min-w-0">
          <h3 className="font-semibold text-text leading-tight truncate">{template.name}</h3>
          <div className="flex items-center gap-1 mt-1 text-xs text-text-muted">
            <Layers size={11} />
            <span>{stepCount} module{stepCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
      {template.description && (
        <p className="text-xs text-text-muted leading-relaxed line-clamp-3">{template.description}</p>
      )}
    </button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function GenerateListContent() {
  const { token } = useAuth();
  const { selectedSite } = useProject();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<PublicWorkflow | null>(null);
  const [publicWorkflows, setPublicWorkflows] = useState<PublicWorkflow[]>([]);
  const [publicLoading, setPublicLoading] = useState(true);

  useEffect(() => {
    setPublicLoading(true);
    fetch(`${API_URL}/workflows/public`)
      .then((r) => r.json())
      .then((data) => setPublicWorkflows(Array.isArray(data) ? data : []))
      .catch(() => setPublicWorkflows([]))
      .finally(() => setPublicLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = selectedSite ? `?projectId=${selectedSite.id}` : '';
    fetch(`${API_URL}/workflows${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setWorkflows(Array.isArray(data) ? data : []))
      .catch(() => setWorkflows([]))
      .finally(() => setLoading(false));
  }, [token, selectedSite]);

  async function handleCreate(name: string, workflowJson?: { steps: unknown[]; edges?: unknown[] }) {
    const res = await fetch(`${API_URL}/workflows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        projectId: selectedSite?.id ?? null,
        workflowJson: workflowJson ?? { steps: [] },
      }),
    });
    if (!res.ok) throw new Error('Erreur lors de la création');
    const created: Workflow = await res.json();
    router.push(`/generate/builder?workflowId=${created.id}`);
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce workflow ?')) return;
    await fetch(`${API_URL}/workflows/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <AppLayout>
      {(showModal || pendingTemplate !== null) && (
        <CreateWorkflowModal
          onClose={() => { setShowModal(false); setPendingTemplate(null); }}
          onCreate={handleCreate}
          initialImport={pendingTemplate ? pendingTemplate.workflow_json : undefined}
          initialName={pendingTemplate?.name}
        />
      )}

      <div className="animate-fade-in">
        <div className="mx-auto py-4 px-4">

          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 animate-slide-up">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted mb-1">Gérer mes workflows</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="btn-primary gap-2"
            >
              <Plus size={16} />
              Nouveau workflow
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <div className="bg-card border border-border border-dashed rounded-xl p-16 text-center animate-slide-up">
              <div className="w-16 h-16 bg-accent/5 rounded-full flex items-center justify-center mx-auto mb-5">
                <Layers className="text-accent" size={32} />
              </div>
              <h2 className="text-xl font-bold mb-2">Aucun workflow</h2>
              <p className="text-text-muted mb-6 max-w-xs mx-auto text-sm">
                Créez votre premier pipeline de génération de contenu SEO.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="btn-primary uppercase tracking-widest text-sm inline-flex items-center gap-2"
              >
                <Plus size={14} />
                Créer un workflow
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-slide-up">
              {workflows.map((wf) => (
                <WorkflowCard key={wf.id} workflow={wf} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {/* ── Templates section ── */}
          {(publicLoading || publicWorkflows.length > 0) && (
            <div className="mt-12">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted mb-1">Templates de workflow</p>
              </div>
              {publicLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-slide-up">
                  {publicWorkflows.map((t) => (
                    <TemplateCard key={t.id} template={t} onUse={(tmpl) => setPendingTemplate(tmpl)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="max-w-7xl mx-auto py-8 px-6">
          <div className="mb-8 flex justify-between">
            <div>
              <Skeleton className="h-10 w-48 mb-3" />
              <Skeleton className="h-5 w-80" />
            </div>
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        </div>
      </AppLayout>
    }>
      <GenerateListContent />
    </Suspense>
  );
}
