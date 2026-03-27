'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ListTodo, X, CheckCircle2, AlertCircle, Loader2, ArrowRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { cn } from '../utils/cn';
import { useTasks, type Task } from '../contexts/TaskContext';
import { computeProgress } from '../utils/taskProgress';

function TaskCard({ task, onClear }: { task: Task; onClear: () => void }) {
  const progress = computeProgress(task);

  const isLinked = task.status === 'done' && !!task.blogId;
  const Wrapper = isLinked
    ? ({ children }: { children: React.ReactNode }) => (
        <Link href={`/blogs/${task.blogId}`} className="block px-3 py-2.5 hover:bg-accent-hover transition-colors group/card">
          {children}
        </Link>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <div className="px-3 py-2.5">{children}</div>
      );

  return (
    <Wrapper>
      <div className="flex items-start gap-2 mb-1.5">
        <div className={cn(
          'mt-0.5 shrink-0',
          task.status === 'running' && 'text-accent',
          task.status === 'done' && 'text-green-400',
          task.status === 'error' && 'text-red-400',
        )}>
          {task.status === 'running' && <Loader2 size={13} className="animate-spin" />}
          {task.status === 'done' && <CheckCircle2 size={13} />}
          {task.status === 'error' && <AlertCircle size={13} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
            <span className="text-[10px] font-bold text-text-muted font-mono shrink-0">#{task.id}</span>
            <span className={cn("text-xs font-semibold text-text shrink-0", isLinked && "group-hover/card:text-accent transition-colors")}>{task.projectName}</span>
            {task.keyword && (
              <>
                <span className="text-[10px] text-text-muted/40 shrink-0">|</span>
                <span className="text-[10px] text-text-muted truncate">{task.keyword}</span>
              </>
            )}
          </div>

        </div>

        {task.status !== 'running' && (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onClear(); }}
            className="shrink-0 text-text-muted hover:text-text transition-colors mt-0.5 p-0.5 rounded hover:bg-background"
          >
            <X size={11} />
          </button>
        )}
      </div>

      <div className="flex justify-end items-center mb-1">
        <div className="flex items-center gap-1.5">
          {isLinked && <ArrowRight size={9} className="text-accent opacity-0 group-hover/card:opacity-100 transition-opacity" />}
          <span className="text-[9px] text-text-muted font-mono">{progress}%</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700 ease-out',
            task.status === 'error' ? 'bg-red-500' :
            task.status === 'done' ? 'bg-green-500' :
            'bg-accent',
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </Wrapper>
  );
}

export default function TaskPanel() {
  const { tasks, clearTask } = useTasks();
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const runningCount = tasks.filter(t => t.status === 'running').length;

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleToggle() {
    updatePos();
    setOpen(prev => !prev);
  }

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, width: 320, zIndex: 99999 }}
      className="bg-surface border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
    >
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListTodo size={13} className="text-text-muted" />
              <span className="text-xs font-bold uppercase tracking-widest text-text-muted">Tâches</span>
            </div>
            {tasks.length > 0 && (
              <span className="text-[10px] text-text-muted bg-background px-2 py-0.5 rounded-full border border-border">
                {tasks.length}
              </span>
            )}
          </div>

          {/* Body */}
          {tasks.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <ListTodo size={28} className="text-border mx-auto mb-2" />
              <p className="text-xs font-medium text-text-muted">Aucune tâche en cours</p>
              <p className="text-[10px] text-text-muted/60 mt-1">Les générations apparaîtront ici</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {tasks.map(task => (
                <TaskCard key={task.id} task={task} onClear={() => clearTask(task.id)} />
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-border">
            <Link
              href="/tasks"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-3 py-2 text-[11px] font-medium text-text-muted hover:text-text hover:bg-accent-hover transition-colors"
            >
              Voir toutes les tâches
              <ExternalLink size={11} />
            </Link>
          </div>
        </div>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={cn(
          'relative flex items-center justify-center p-1.5  rounded-md transition-all duration-150',
          open ? 'bg-accent/10 text-accent' : 'hover:bg-accent-hover text-text-muted hover:text-text',
        )}
        title="Tâches"
      >
        <ListTodo size={14} />
        {runningCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent text-primary-foreground text-[9px] font-bold flex items-center justify-center animate-pulse">
            {runningCount}
          </span>
        )}
      </button>
      {typeof window !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  );
}
