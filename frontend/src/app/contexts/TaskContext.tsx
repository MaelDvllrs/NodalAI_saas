'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import type { LogEvent } from '../components/ProgressLog';
import { useAuth } from './AuthContext';
import { notifySuccess, notifyError } from '../utils/notify';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface Task {
  id: number;
  dbId: string | null;   // UUID from generation_tasks table
  jobId: string;
  projectName: string;
  mode: 'generate' | 'seo-test';
  events: LogEvent[];
  status: 'running' | 'done' | 'error';
  startedAt: Date;
  keyword?: string | null;
  blogId?: string | null;
}

interface DbTask {
  id: string;
  job_id: string;
  mode: 'generate' | 'seo-test';
  project_name: string;
  status: 'running' | 'done' | 'error';
  step_count: number;
  keyword: string | null;
  created_at: string;
  blog: { id: string; title: string; slug: string } | null;
}

interface TaskContextType {
  tasks: Task[];
  addTask: (
    jobId: string,
    projectName: string,
    mode: 'generate' | 'seo-test',
    opts?: { initialEvents?: LogEvent[]; initialStatus?: Task['status'] }
  ) => number;
  appendEvent: (taskId: number, event: LogEvent) => void;
  clearTask: (taskId: number) => void;
  getTaskByJobId: (jobId: string) => Task | undefined;
}

const TaskContext = createContext<TaskContextType | null>(null);

let _nextId = 1;

export function TaskProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const prevStatusesRef = useRef<Record<number, Task['status']>>({});

  // Load saved tasks from DB on auth
  useEffect(() => {
    if (!token || loaded) return;
    setLoaded(true);
    fetch(`${API_URL}/tasks`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((dbTasks: DbTask[]) => {
        if (!dbTasks.length) return;
        setTasks(prev => {
          const existingJobIds = new Set(prev.map(t => t.jobId));
          const restored: Task[] = dbTasks
            .filter(dt => !existingJobIds.has(dt.job_id))
            .map(dt => ({
              id: _nextId++,
              dbId: dt.id,
              jobId: dt.job_id,
              projectName: dt.project_name,
              mode: dt.mode,
              events: Array.from({ length: dt.step_count }, (_, i) =>
                ({ type: 'step' as const, message: `Étape ${i + 1}` })
              ),
              status: dt.status,
              startedAt: new Date(dt.created_at),
              keyword: dt.keyword,
              blogId: dt.blog?.id ?? null,
            }));
          return [...restored, ...prev];
        });
      })
      .catch(() => {/* silent */});
  }, [token, loaded]);

  const addTask = useCallback((
    jobId: string,
    projectName: string,
    mode: 'generate' | 'seo-test',
    opts?: { initialEvents?: LogEvent[]; initialStatus?: Task['status'] }
  ): number => {
    const id = _nextId++;
    setTasks(prev => [{
      id,
      dbId: null,
      jobId,
      projectName,
      mode,
      events: opts?.initialEvents ?? [],
      status: opts?.initialStatus ?? 'running',
      startedAt: new Date(),
    }, ...prev]);
    return id;
  }, []);

  // Fire notifications when a task transitions to done/error (outside the setter to avoid StrictMode double-call)
  useEffect(() => {
    tasks.forEach(task => {
      const prev = prevStatusesRef.current[task.id];
      if (prev === 'running') {
        if (task.status === 'done')  notifySuccess(`Workflow exécuté - ${task.projectName}`);
        if (task.status === 'error') notifyError(`Erreur lors de l'exécution - ${task.projectName}`);
      }
      prevStatusesRef.current[task.id] = task.status;
    });
  }, [tasks]);

  const appendEvent = useCallback((taskId: number, event: LogEvent) => {
    setTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const newStatus: Task['status'] =
        event.type === 'done' ? 'done' :
        event.type === 'error' ? 'error' :
        task.status;
      return { ...task, events: [...task.events, event], status: newStatus };
    }));
  }, []);

  const getTaskByJobId = useCallback((jobId: string): Task | undefined => {
    return tasks.find(t => t.jobId === jobId);
  }, [tasks]);

  const clearTask = useCallback((taskId: number) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === taskId);
      // Delete from DB if we have a dbId and a token
      if (task?.dbId && token) {
        fetch(`${API_URL}/tasks/${task.dbId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {/* silent */});
      }
      return prev.filter(t => t.id !== taskId);
    });
  }, [token]);

  return (
    <TaskContext.Provider value={{ tasks, addTask, appendEvent, clearTask, getTaskByJobId }}>
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTasks must be used within TaskProvider');
  return ctx;
}
