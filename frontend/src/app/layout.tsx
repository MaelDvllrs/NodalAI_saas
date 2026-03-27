import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';
import { TaskProvider } from './contexts/TaskContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'Nodal AI | Workflow SEO GEO',
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

// Injected before React hydration to prevent theme flash
const themeScript = `
  (function(){
    try {
      var t = localStorage.getItem('theme');
      if (t === 'light' || t === 'dark') { document.documentElement.setAttribute('data-theme', t); return; }
      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    } catch(e){}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>
          <AuthProvider>
            <ProjectProvider>
              <TaskProvider>
                {children}
                <Toaster position="bottom-right" />
              </TaskProvider>
            </ProjectProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
