import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { TaskProvider } from './contexts/TaskContext';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Blog Automation Webflow',
  description: 'Génération automatique d\'articles SEO pour Webflow CMS',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <AuthProvider>
          <ProjectProvider>
            <TaskProvider>
              {children}
              <Toaster position="bottom-right" />
            </TaskProvider>
          </ProjectProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
