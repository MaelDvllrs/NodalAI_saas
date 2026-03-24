'use client';

import { useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, PenTool, Globe, ArrowRight, CheckCircle2, Terminal } from 'lucide-react';
import { cn } from './utils/cn';
import { Skeleton } from './components/UI';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border py-4 px-6">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <Skeleton className="h-8 w-32" />
            <div className="flex gap-4">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 pt-24 text-center">
          <Skeleton className="h-6 w-48 mx-auto mb-8 rounded-full" />
          <Skeleton className="h-16 w-3/4 mx-auto mb-6" />
          <Skeleton className="h-16 w-1/2 mx-auto mb-10" />
          <div className="flex justify-center gap-4 mb-24">
            <Skeleton className="h-12 w-48 rounded-lg" />
            <Skeleton className="h-12 w-32 rounded-lg" />
          </div>
          <div className="grid grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-accent selection:text-white">
      {/* Header */}
      <header className="glass">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Terminal size={20} strokeWidth={2.5} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">BlogAuto</h1>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="text-sm font-medium text-text-muted hover:text-text transition-colors"
            >
              Connexion
            </Link>
            <Link
              href="/signup"
              className="btn-primary text-sm px-5"
            >
              Démarrer
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="px-6 pt-24 pb-16 md:pt-32 md:pb-24 max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-border text-xs font-medium text-text-muted mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            Nouveau : Intégration Claude 3.5 Sonnet
          </div>
          
          <h2 className="text-4xl md:text-7xl font-bold tracking-tight text-text mb-6 max-w-4xl mx-auto leading-[1.1]">
            L'automatisation SEO <br />
            <span className="text-text-muted">réinventée pour Webflow.</span>
          </h2>
          
          <p className="text-lg md:text-xl text-text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            Générez des articles optimisés par l'IA basés sur des données SEO réelles et publiez-les instantanément sur votre CMS.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-24">
            <Link
              href="/signup"
              className="btn-primary px-6 py-2.5 w-full sm:w-auto gap-2"
            >
              Commencer gratuitement
              <ArrowRight size={16} />
            </Link>
            <Link
              href="#features"
              className="btn-secondary px-6 py-2.5 w-full sm:w-auto"
            >
              En savoir plus
            </Link>
          </div>

          {/* Feature Grid */}
          <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {[
              {
                icon: Search,
                title: 'Recherche SEO',
                description: 'Identification intelligente des mots-clés via DataForSEO pour maximiser votre portée.'
              },
              {
                icon: PenTool,
                title: 'Génération IA',
                description: 'Claude AI rédige des articles complets avec une structure MECE et des FAQ optimisées.'
              },
              {
                icon: Globe,
                title: 'Native Webflow',
                description: 'Synchronisation bidirectionnelle avec votre CMS pour une publication sans friction.'
              },
            ].map((feature, i) => (
              <div key={i} className="p-8 rounded-2xl bg-card border border-border hover:border-text/20 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-background border border-border flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon className="text-text" size={24} />
                </div>
                <h3 className="text-lg font-bold mb-3">{feature.title}</h3>
                <p className="text-text-muted text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow Section */}
        <section className="bg-card border-y border-border py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <h3 className="text-3xl font-bold mb-8">Un flux de travail simplifié au maximum.</h3>
                <div className="space-y-6">
                  {[
                    'Analyse sémantique du mot-clé principal',
                    'Extraction de 15+ mots-clés secondaires stratégiques',
                    'Maillage interne intelligent basé sur vos articles existants',
                    'Génération de schémas JSON-LD et métadonnées SEO',
                    'Publication automatique ou mise en brouillon CMS',
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="mt-1 flex-shrink-0 text-text">
                        <CheckCircle2 size={20} />
                      </div>
                      <p className="text-text-muted font-medium">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <div className="aspect-video bg-background rounded-2xl border border-border shadow-2xl p-4 overflow-hidden">
                  <div className="flex gap-1.5 mb-4">
                    <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/30"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/30"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/30"></div>
                  </div>
                  <div className="space-y-3 font-mono text-[10px] md:text-xs text-text-muted">
                    <p className="text-green-500">$ blog-auto generate --site my-webflow-site</p>
                    <p>› Analyzing keyword: "marketing automation"</p>
                    <p>› Found 12 high-intent secondary keywords</p>
                    <p>› Generating article structure via Claude 3.5...</p>
                    <p className="text-accent animate-pulse">› Writing: "Le guide ultime de l'automatisation..."</p>
                    <p>› Success: Published to Webflow (Item ID: 64f2a...)</p>
                  </div>
                </div>
                <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-accent/20 blur-3xl -z-10"></div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6 bg-background">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Terminal size={18} />
            <span className="text-sm font-bold tracking-tight">BlogAuto</span>
          </div>
          <p className="text-xs text-text-muted">
            © {new Date().getFullYear()} BlogAuto. Propulsé par Claude AI & Webflow.
          </p>
          <div className="flex gap-6">
            <Link href="#" className="text-xs text-text-muted hover:text-text">Confidentialité</Link>
            <Link href="#" className="text-xs text-text-muted hover:text-text">Conditions</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
