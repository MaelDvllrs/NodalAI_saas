'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface Site {
  id: string;
  name: string;
  url: string;
  webflow_site_id: string;
  webflow_api_key: string;
  webflow_collection_name: string;
  userRole: 'admin' | 'member';
}

interface ProjectContextType {
  sites: Site[];
  selectedSite: Site | null;
  selectedSiteId: string;
  setSelectedSiteId: (id: string) => void;
  loading: boolean;
  refreshSites: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const STORAGE_KEY = 'blogauto_selected_site';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteIdState] = useState<string>('');
  const [loading, setLoading] = useState(false);

  function setSelectedSiteId(id: string) {
    setSelectedSiteIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
  }

  async function fetchSites() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sites`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const fetchedSites: Site[] = data.sites;
        setSites(fetchedSites);

        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && fetchedSites.find(s => s.id === saved)) {
          setSelectedSiteIdState(saved);
        } else if (fetchedSites.length > 0) {
          setSelectedSiteIdState(fetchedSites[0].id);
          localStorage.setItem(STORAGE_KEY, fetchedSites[0].id);
        }
      }
    } catch (error) {
      console.error('Erreur ProjectContext:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      fetchSites();
    } else {
      setSites([]);
      setSelectedSiteIdState('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const selectedSite = sites.find(s => s.id === selectedSiteId) ?? null;

  return (
    <ProjectContext.Provider value={{ sites, selectedSite, selectedSiteId, setSelectedSiteId, loading, refreshSites: fetchSites }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
