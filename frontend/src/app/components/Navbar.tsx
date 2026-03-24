'use client';

import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, GitBranch, History, LogOut, Terminal, Sparkles } from 'lucide-react';
import { cn } from '../utils/cn';

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/generate', label: 'Workflow', icon: GitBranch },
    { href: '/blogs', label: 'Historique', icon: History },
  ];

  return (
    <nav className="glass">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-12">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                <Terminal size={20} strokeWidth={2.5} />
              </div>
              <span className="text-xl font-bold tracking-tighter uppercase">
                Blog<span className="text-accent">Auto</span>
              </span>
            </Link>
            
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-widest transition-all duration-200",
                      active
                        ? "bg-accent/10 text-accent shadow-sm shadow-accent/5"
                        : "text-text-muted hover:text-text hover:bg-card"
                    )}
                  >
                    <Icon size={14} strokeWidth={2.5} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted mb-0.5">Utilisateur</span>
              <span className="text-xs font-medium text-text">
                {user.email}
              </span>
            </div>
            <div className="w-px h-8 bg-border hidden lg:block" />
            <button
              onClick={logout}
              className="btn-secondary py-2 px-3 text-[10px] font-semibold uppercase tracking-widest gap-2.5 hover:text-error hover:border-error/20 hover:bg-error/5 group transition-all"
            >
              <LogOut size={14} className="transition-transform" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
