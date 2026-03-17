import { cn } from '../utils/cn';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rectangular' | 'circular';
}

export function Skeleton({ className, variant = 'rectangular', ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-border/50 animate-pulse',
        variant === 'text' && 'h-4 w-full rounded',
        variant === 'rectangular' && 'rounded-xl',
        variant === 'circular' && 'rounded-full',
        className
      )}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg 
      className={cn('animate-spin h-4 w-4 text-current', className)} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4" 
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
      />
    </svg>
  );
}

// ─── SelectMenu ──────────────────────────────────────────────────────────────

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface SelectMenuProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  active?: boolean;
  className?: string;
}

export function SelectMenu<T extends string = string>({
  value, onChange, options, placeholder = 'Sélectionner…', active, className,
}: SelectMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap',
          active || value
            ? 'border-accent/50 text-accent bg-accent/5'
            : 'border-border text-text-muted hover:border-border hover:text-text bg-surface',
        )}
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown size={11} className={cn('transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-surface border border-border rounded-xl shadow-xl py-1 animate-fade-in">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-3.5 py-2 text-xs transition-colors text-left',
                opt.value === value
                  ? 'text-accent bg-accent/5'
                  : 'text-text hover:bg-bg',
              )}
            >
              {opt.label}
              {opt.value === value && <Check size={11} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
