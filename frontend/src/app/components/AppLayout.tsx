'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';
import { LayoutDashboard, GitBranch, History, LogOut, Terminal, User, ChevronDown, Globe, Plus, Check, Settings, Sun, Moon, Monitor, Search, BookOpen, CommandIcon } from 'lucide-react';
import { cn } from '../utils/cn';
import TaskPanel from './TaskPanel';
import toast from 'react-hot-toast';
import { notifySuccess, notifyError } from '../utils/notify';
import { useTheme } from '../contexts/ThemeContext';

type NavPage = { label: string; href: string; icon: React.ElementType; keywords?: string[] };

const BASE_PAGES: NavPage[] = [
  { label: 'Dashboard',            href: '/dashboard',       icon: LayoutDashboard, keywords: ['accueil', 'home'] },
  { label: 'Workflows',            href: '/generate',        icon: GitBranch,       keywords: ['workflow', 'génération', 'builder'] },
  { label: 'Historique',           href: '/runs',            icon: History,         keywords: ['runs', 'executions', 'logs'] },
  { label: 'Projets',              href: '/projects',        icon: Globe,           keywords: ['sites', 'project'] },
  { label: 'Articles',             href: '/blogs',           icon: BookOpen,        keywords: ['blog', 'posts', 'articles'] },
  { label: 'Mon compte',           href: '/account',         icon: User,            keywords: ['profil', 'account', 'email'] },
];

function GlobalSearch({ selectedSiteId, isAdmin }: { selectedSiteId: string | null; isAdmin: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  const pages: NavPage[] = [
    ...BASE_PAGES,
    ...(isAdmin && selectedSiteId
      ? [{ label: 'Paramètres', href: `/settings/${selectedSiteId}`, icon: Settings, keywords: ['config', 'settings'] }]
      : []),
  ];

  const results = query.trim()
    ? pages.filter(p => {
        const q = query.toLowerCase();
        return (
          p.label.toLowerCase().includes(q) ||
          p.keywords?.some(k => k.includes(q))
        );
      })
    : pages;

  // Ctrl+K → focus
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function navigate(href: string) {
    router.push(href);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  function onKeyDownInput(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIdx]) { navigate(results[activeIdx].href); }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  }

  // Reset active index when results change
  useEffect(() => { setActiveIdx(0); }, [query]);

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search size={12} className="pointer-events-none absolute left-2.5 text-text-muted/50" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDownInput}
          placeholder="Rechercher…"
          className="input-base text-xs py-1 pl-7 pr-14 w-64 focus:w-80 transition-all duration-200"
        />
        <kbd className="pointer-events-none absolute right-1 flex items-center gap-0.5 text-[9px] text-text-muted/50 font-mono bg-background border border-border rounded px-1 py-0.5">
          {isMac ? <CommandIcon size={10}/> : 'ctrl' } + K
        </kbd>
      </div>

      {open && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 top-full mt-1.5 w-80 bg-surface border border-border rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {results.map((page, i) => {
            const Icon = page.icon;
            return (
              <button
                key={page.href}
                onMouseDown={() => navigate(page.href)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors text-left',
                  i === activeIdx ? 'bg-accent-soft text-text' : 'text-text-muted hover:bg-accent-hover hover:text-text',
                )}
              >
                <Icon size={13} className="shrink-0" />
                {page.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

export default function AppLayout({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) {
  const { user, loading: authLoading, logout } = useAuth();
  const { sites, selectedSiteId, setSelectedSiteId, loading: sitesLoading } = useProject();
  const pathname = usePathname();
  const router = useRouter();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
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

  const PAGE_TITLES: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/generate': 'Workflows',
    '/runs': 'Historique',
    '/projects': 'Projets',
    '/account': 'Mon compte',
    '/blogs': 'Articles',
  };
  const pageTitle = pathname.startsWith('/settings/') ? 'Paramètres'
    : pathname.startsWith('/runs/') ? 'Résultat'
    : pathname.startsWith('/generate/builder') ? 'Éditeur de workflow'
    : PAGE_TITLES[pathname] ?? '';

  const initials = user.name
    ? user.name.slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  const AVATAR_COLORS = [
    ['#7c3aed', '#ffffff'], // violet
    ['#2563eb', '#ffffff'], // blue
    ['#059669', '#ffffff'], // emerald
    ['#d97706', '#ffffff'], // amber
    ['#dc2626', '#ffffff'], // red
    ['#0891b2', '#ffffff'], // cyan
    ['#7c3aed', '#ffffff'], // purple
    ['#db2777', '#ffffff'], // pink
  ];
  const seed = (user.name ?? user.email).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const [avatarBg, avatarFg] = AVATAR_COLORS[seed % AVATAR_COLORS.length];

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 flex flex-col gap-2">

        {/* Logo */}
        <div className="px-5 h-14 flex items-center shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="p-2 bg-purple-500 rounded-lg flex items-center justify-center text-neutral-50 shadow-sm transition-transform duration-200">
              <Terminal size={14} strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold tracking-tighter">
              Nodal<span className="text-purple-500">AI</span>
            </span>
          </Link>
        </div>

        {/* Project selector */}
        <div className="px-4 py-4 shrink-0" ref={projectMenuRef}>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted mb-3">Projet actif</p>
          <div className="relative">
          <button
              onClick={() => setProjectMenuOpen(!projectMenuOpen)}
              className="w-full flex items-center gap-2 bg-background  py-1.5 px-2.5 text-sm font-medium text-text hover:bg-accent-hover transition-colors focus:outline-none border rounded-md"
            >
              <SiteFavicon url={selectedSite?.url ?? ''} size={16} />
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
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium hover:bg-accent-soft transition-colors text-left"
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
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-text-muted hover:text-text hover:bg-accent-hover transition-colors"
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
        
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted mb-3">Navigation</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all duration-150 group',
                  active
                    ? 'bg-[var(--accent-soft)] text-text'
                    : 'text-text-muted hover:text-text hover:bg-[var(--accent-soft)]'
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
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all duration-150 group',
                pathname.startsWith('/settings')
                  ? 'bg-[var(--accent-soft)] text-text'
                  : 'text-text-muted hover:text-text hover:bg-[var(--accent-soft)]'
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

        {/* ── User account ── */}
        <div className="border-t border-border shrink-0 px-3 py-3" ref={menuRef}>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[var(--accent-soft)] transition-all duration-150"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: avatarBg, color: avatarFg }}>
                {initials}
              </div>
              <div className='flex flex-col'>
                <span className="text-xs font-medium text-text truncate flex-1 text-left">
                  {user.name ?? user.email.split('@')[0]}
                </span>
                <span className="text-xs text-text truncate flex-1 text-left">
                  {user.email}
                </span>
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute left-0 bottom-full mb-2 w-full bg-surface border border-border rounded-lg shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-1 duration-150">
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="text-xs font-semibold truncate">{user.name ?? user.email.split('@')[0]}</p>
                  <p className="text-[10px] text-text-muted truncate mt-0.5">{user.email}</p>
                </div>
                <div className="py-1">
                  <Link
                    href="/account"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium hover:bg-accent-hover transition-colors"
                  >
                    <User size={13} className="text-text-muted" />
                    Mon compte
                  </Link>
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-error hover:bg-error/5 transition-colors"
                  >
                    <LogOut size={13} />
                    Déconnexion
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-3 pl-0">

        {/* Big card */}
        <div className="flex-1 flex flex-col bg-surface border border-border rounded-lg overflow-hidden min-h-0">

          {/* Card header */}
          <header className="shrink-0 border-b border-border flex items-center justify-between px-4 py-1">
            <div className="text-sm font-semibold text-text">{header ?? pageTitle}</div>
            <GlobalSearch
                selectedSiteId={selectedSiteId}
                isAdmin={selectedSite?.userRole === 'admin'}
            />
            <div className="flex items-center gap-2">
              
              <TaskPanel />
              <div className="flex items-center gap-0.5 bg-background border border-border rounded-md p-0.5">
                {([
                  { value: 'system', icon: Monitor, title: 'Système' },
                  { value: 'light',  icon: Sun,     title: 'Clair' },
                  { value: 'dark',   icon: Moon,    title: 'Sombre' },
                ] as const).map(({ value, icon: Icon, title }) => (
                  <button
                    key={value}
                    onClick={() => setThemeMode(value)}
                    title={title}
                    className={cn(
                      'p-1 rounded transition-all duration-150',
                      themeMode === value
                        ? 'bg-surface text-text shadow-sm'
                        : 'text-text-muted hover:text-text',
                    )}
                  >
                    <Icon size={13} />
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>

        </div>
      </div>
    </div>
  );
}
