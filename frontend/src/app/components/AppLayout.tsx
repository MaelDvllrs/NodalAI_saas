'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import { LayoutDashboard, GitBranch, History, LogOut, Terminal, User, ChevronDown, Globe, Plus, Check, Settings } from 'lucide-react';
import { cn } from '../utils/cn';
import TaskPanel from './TaskPanel';
import toast from 'react-hot-toast';
import { notifySuccess, notifyError } from '../utils/notify';

function SiteFavicon({ url, size = 14 }: { url: string; size?: number }) {
  const [errored, setErrored] = useState(false);

  if (!url) return <Globe size={size} className="shrink-0 text-text-muted" />;

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return <Globe size={size} className="shrink-0 text-text-muted" />;
  }

  if (errored) return <Globe size={size} className="shrink-0 text-text-muted" />;

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-sm"
      onError={() => setErrored(true)}
    />
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, logout } = useAuth();
  const { sites, selectedSiteId, setSelectedSiteId, loading: sitesLoading } = useProject();
  const pathname = usePathname();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Close user menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary" />
      </div>
    );
  }

  if (!user) return null;

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/generate', label: 'Workflow', icon: GitBranch },
    { href: '/runs', label: 'Historique', icon: History },
  ];

  const selectedSite = sites.find(s => s.id === selectedSiteId) ?? null;

  const initials = user.name
    ? user.name.slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 flex flex-col border-r border-border bg-surface">

        {/* Logo */}
        <div className="px-5 h-14 flex items-center border-b border-border shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground shadow-sm group-hover:scale-110 transition-transform duration-200">
              <Terminal size={16} strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tighter uppercase">
              Blog<span className="text-accent">Auto</span>
            </span>
          </Link>
        </div>

        {/* Project selector */}
        <div className="px-4 py-4 border-b border-border shrink-0" ref={projectMenuRef}>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted mb-2">Projet actif</p>
          <div className="relative">
          <button
              onClick={() => setProjectMenuOpen(!projectMenuOpen)}
              className="w-full flex items-center gap-2 bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-medium text-text hover:border-text/30 transition-colors focus:outline-none focus:ring-1 focus:border-accent"
            >
              <SiteFavicon url={selectedSite?.url ?? ''} size={13} />
              <span className="flex-1 text-left truncate">
                {sitesLoading
                  ? 'Chargement...'
                  : sites.find(s => s.id === selectedSiteId)?.name ?? 'Aucun projet'}
              </span>
              <ChevronDown
                size={13}
                className={cn('shrink-0 text-text-muted transition-transform duration-150', projectMenuOpen && 'rotate-180')}
              />
            </button>

            {projectMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-full bg-surface border border-border rounded-lg shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                {/* Projects list */}
                <div className="py-1 max-h-48 overflow-y-auto">
                  {sites.length === 0 && (
                    <p className="px-3 py-2 text-xs text-text-muted italic">Aucun projet</p>
                  )}
                  {sites.map((site) => (
                    <button
                      key={site.id}
                      onClick={() => { setSelectedSiteId(site.id); setProjectMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium hover:bg-background transition-colors text-left"
                    >
                      <SiteFavicon url={site.url} size={14} />
                      <span className="truncate flex-1">{site.name}</span>
                      <Check
                        size={12}
                        className={cn('shrink-0 transition-opacity', site.id === selectedSiteId ? 'text-accent opacity-100' : 'opacity-0')}
                      />
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div className="border-t border-border py-1">
                  <Link
                    href="/projects"
                    onClick={() => setProjectMenuOpen(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-text-muted hover:text-text hover:bg-background transition-colors"
                  >
                    <Globe size={13} className="shrink-0" />
                    Voir tous les projets
                  </Link>
                  <button
                    onClick={() => {
                      setProjectMenuOpen(false);
                      router.push('/projects?new=1');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/5 transition-colors"
                  >
                    <Plus size={13} className="shrink-0" />
                    Créer un projet
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 group',
                  active
                    ? 'bg-white/10 text-text'
                    : 'text-text-muted hover:text-text hover:bg-white/5'
                )}
              >
                <Icon
                  size={13}
                  strokeWidth={2}
                  className={cn('shrink-0', !active && 'group-hover:scale-110 transition-transform duration-150')}
                />
                {item.label}
              </Link>
            );
          })}

          {/* Settings — admin only */}
          {selectedSite?.userRole === 'admin' && (
            <Link
              href={`/settings/${selectedSiteId}`}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 group',
                pathname.startsWith('/settings')
                  ? 'bg-white/10 text-text'
                  : 'text-text-muted hover:text-text hover:bg-white/5'
              )}
            >
              <Settings
                size={13}
                strokeWidth={2}
                className={cn('shrink-0', !pathname.startsWith('/settings') && 'group-hover:scale-110 transition-transform duration-150')}
              />
              Paramètres
            </Link>
          )}
        </nav>

      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-14 shrink-0 border-b border-border bg-surface/80 backdrop-blur-sm flex items-center justify-end gap-2 px-6">
          <TaskPanel />
          <div className="w-px h-6 bg-border" />
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-background transition-all duration-150"
            >
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-bold shrink-0">
                {initials}
              </div>
              <div className="hidden sm:flex flex-col items-start leading-none">
                <span className="text-xs font-semibold">{user.name ?? user.email.split('@')[0]}</span>
                <span className="text-[10px] text-text-muted mt-0.5 truncate max-w-[140px]">{user.email}</span>
              </div>
              <ChevronDown
                size={13}
                className={cn('text-text-muted transition-transform duration-150', userMenuOpen && 'rotate-180')}
              />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-surface border border-border rounded-lg shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-semibold truncate">{user.name ?? user.email.split('@')[0]}</p>
                  <p className="text-[10px] text-text-muted truncate mt-0.5">{user.email}</p>
                </div>
                <div className="py-1">
                  <Link
                    href="/account"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-background transition-colors"
                  >
                    <User size={14} className="text-text-muted" />
                    Mon compte
                  </Link>
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-error hover:bg-error/5 transition-colors"
                  >
                    <LogOut size={14} />
                    Déconnexion
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
