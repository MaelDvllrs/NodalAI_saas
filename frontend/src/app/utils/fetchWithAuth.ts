/**
 * Wrapper fetch qui gère automatiquement le rafraîchissement du token
 * en cas d'erreur 401 (token expiré)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  
  if (!refreshToken) {
    return null;
  }

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (res.ok) {
      const data = await res.json();
      const newAccessToken = data.accessToken;
      
      localStorage.setItem('auth_token', newAccessToken);
      
      if (data.session?.refresh_token) {
        localStorage.setItem('refresh_token', data.session.refresh_token);
      }
      
      return newAccessToken;
    } else {
      // Refresh token invalide, nettoyer et rediriger vers login
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
      return null;
    }
  } catch (error) {
    console.error('Erreur refresh token:', error);
    return null;
  }
}

/**
 * Fetch avec gestion automatique du rafraîchissement du token
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem('auth_token');
  
  // Ajouter le header Authorization si un token existe
  if (token && !options.headers) {
    options.headers = {};
  }
  
  if (token) {
    (options.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  // Faire la requête initiale
  let response = await fetch(url, options);

  // Si 401, essayer de rafraîchir le token
  if (response.status === 401 && token) {
    if (!isRefreshing) {
      isRefreshing = true;
      
      const newToken = await refreshAccessToken();
      
      isRefreshing = false;
      
      if (newToken) {
        onTokenRefreshed(newToken);
        
        // Refaire la requête avec le nouveau token
        (options.headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, options);
      }
    } else {
      // Un refresh est déjà en cours, attendre qu'il se termine
      const newToken = await new Promise<string>((resolve) => {
        addRefreshSubscriber((token: string) => {
          resolve(token);
        });
      });
      
      // Refaire la requête avec le nouveau token
      (options.headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, options);
    }
  }

  return response;
}

/**
 * Helper pour faire des requêtes GET avec authentification
 */
export async function getWithAuth(url: string): Promise<Response> {
  return fetchWithAuth(url, { method: 'GET' });
}

/**
 * Helper pour faire des requêtes POST avec authentification
 */
export async function postWithAuth(
  url: string,
  body: any
): Promise<Response> {
  return fetchWithAuth(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Helper pour faire des requêtes PUT avec authentification
 */
export async function putWithAuth(
  url: string,
  body: any
): Promise<Response> {
  return fetchWithAuth(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Helper pour faire des requêtes DELETE avec authentification
 */
export async function deleteWithAuth(url: string): Promise<Response> {
  return fetchWithAuth(url, { method: 'DELETE' });
}
