'use client';

import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, PenTool, History, LogOut, Terminal } from 'lucide-react';
import { cn } from '../utils/cn';

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/generate', label: 'Générer', icon: PenTool },
    { href: '/blogs', label: 'Historique', icon: History },
  ];

  return (
    <nav className="glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground">
                <Terminal size={18} strokeWidth={2.5} />
              </div>
              <Link href="/dashboard" className="text-xl font-bold tracking-tight">
                BlogAuto
              </Link>
            </div>
            <div className="hidden sm:ml-10 sm:flex sm:space-x-8">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors border-b-2",
                      active
                        ? "border-primary text-text"
                        : "border-transparent text-text-muted hover:text-text hover:border-border"
                    )}
                  >
                    <Icon size={16} className="mr-2" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden md:block text-xs text-text-muted font-medium">
              {user.email}
            </span>
            <button
              onClick={logout}
              className="btn-secondary py-1.5 px-3 text-xs gap-2"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
