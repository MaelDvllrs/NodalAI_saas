'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  updateProfile: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Initialiser le client Supabase côté client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Récupérer la session initiale
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setToken(session.access_token);
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        });
      }
      setLoading(false);
    });

    // Écouter les changements d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setToken(session.access_token);
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        });
        console.log('✅ Session mise à jour automatiquement');
      } else {
        setToken(null);
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function login(email: string, password: string) {
    if (!supabase) {
      throw new Error('Supabase client non initialisé');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data.session) {
      setToken(data.session.access_token);
      setUser({
        id: data.user.id,
        email: data.user.email || '',
        name: data.user.user_metadata?.name,
      });
    }
  }

  async function signup(email: string, password: string, name?: string) {
    if (!supabase) {
      throw new Error('Supabase client non initialisé');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || null,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data.session) {
      setToken(data.session.access_token);
      setUser({
        id: data.user!.id,
        email: data.user!.email || '',
        name: data.user!.user_metadata?.name,
      });
    }
  }

  async function updateProfile(name: string) {
    if (!supabase) throw new Error('Supabase client non initialisé');
    const { data, error } = await supabase.auth.updateUser({ data: { name } });
    if (error) throw new Error(error.message);
    if (data.user) {
      setUser(prev => prev ? { ...prev, name: data.user.user_metadata?.name ?? name } : prev);
    }
  }

  async function logout() {
    if (!supabase) return;

    await supabase.auth.signOut();
    setUser(null);
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
