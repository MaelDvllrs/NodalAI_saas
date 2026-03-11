'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import AppLayout from '../components/AppLayout';
import { Sparkles, Plus, Play, Pencil, Trash2, Layers, Clock, X, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '../components/UI';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Workflow {
  id: string;
  name: string;
  project_id: string | null;
  workflow_json: { steps: { type: string; config: Record<string, unknown> }[] };
  created_at: string;
  updated_at: string;
}

// ─── Create modal ────────────────────────────────────────────────────────────

function CreateWorkflowModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try { await onCreate(trimmed); } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative z-10 bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-slide-up">
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

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-border text-sm font-medium text-text-muted hover:text-text transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="flex-1 py-2 rounded-lg btn-accent text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
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
  const steps = workflow.workflow_json?.steps ?? [];
  const stepCount = steps.filter((s) => s.type !== 'trigger-manual').length;
  const updatedAt = new Date(workflow.updated_at).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-accent/40 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded-lg shrink-0">
            <Layers className="text-accent" size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-text leading-tight">{workflow.name}</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Layers size={11} />
                {stepCount} module{stepCount !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {updatedAt}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => onDelete(workflow.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 text-text-muted"
          title="Supprimer"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Steps preview */}
      {stepCount > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {steps.filter(s => s.type !== 'trigger-manual').map((s, i) => (
            <span key={i} className="text-xs bg-bg px-2 py-0.5 rounded-full border border-border text-text-muted font-mono">
              {s.type}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border">
        <Link
          href={`/generate/builder?workflowId=${workflow.id}`}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <Play size={13} />
          Lancer
        </Link>
        <Link
          href={`/generate/builder?workflowId=${workflow.id}`}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-text-muted text-sm hover:border-accent/40 hover:text-text transition-colors"
          title="Modifier"
        >
          <Pencil size={13} />
        </Link>
      </div>
    </div>
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

  async function handleCreate(name: string) {
    const res = await fetch(`${API_URL}/workflows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        projectId: selectedSite?.id ?? null,
        workflowJson: { steps: [] },
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
      {showModal && (
        <CreateWorkflowModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
        />
      )}

      <div className="animate-fade-in">
        <div className="max-w-[1400px] mx-auto py-8 px-6">

          {/* Header */}
          <div className="mb-8 animate-slide-up flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-3 flex items-center gap-4">
                Workflows
                <div className="p-2 bg-accent/10 rounded-md">
                  <Sparkles className="text-accent" size={28} />
                </div>
              </h1>
              <p className="text-md text-text-muted max-w-2xl">
                Gérez vos pipelines de génération de contenu SEO.
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 btn-accent uppercase tracking-widest text-sm shrink-0"
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
            <div className="bg-surface border border-border border-dashed rounded-xl p-16 text-center animate-slide-up">
              <div className="w-16 h-16 bg-accent/5 rounded-full flex items-center justify-center mx-auto mb-5">
                <Layers className="text-accent" size={32} />
              </div>
              <h2 className="text-xl font-bold mb-2">Aucun workflow</h2>
              <p className="text-text-muted mb-6 max-w-xs mx-auto text-sm">
                Créez votre premier pipeline de génération de contenu SEO.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="btn-accent uppercase tracking-widest text-sm inline-flex items-center gap-2"
              >
                <Plus size={14} />
                Créer un workflow
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-slide-up">
              {/* New workflow card */}
              <button
                onClick={() => setShowModal(true)}
                className="bg-surface border border-border border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-3 min-h-[180px] hover:border-accent/50 hover:bg-accent/5 transition-colors group text-text-muted hover:text-accent"
              >
                <div className="w-10 h-10 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:border-accent transition-colors">
                  <Plus size={18} />
                </div>
                <span className="text-sm font-medium">Nouveau workflow</span>
              </button>

              {workflows.map((wf) => (
                <WorkflowCard key={wf.id} workflow={wf} onDelete={handleDelete} />
              ))}
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
